"""LakeB2B Pulse auth proxy.

B2B Pulse authenticates users via LinkedIn OAuth only (no email/password).

Auth flow:
    1. GET  /api/auth/lakeb2b/oauth-url
          → fetches LinkedIn OAuth URL from b2b-pulse
          → returns {auth_url, state} to frontend

    2. Frontend opens auth_url in a popup → user approves LinkedIn OAuth
          → B2B Pulse callback at /api/auth/linkedin/callback
          → B2B Pulse redirects to our callback:
            /api/auth/lakeb2b/callback?token=<jwt>&refresh_token=<refresh>

    3. GET  /api/auth/lakeb2b/callback?token=...&refresh_token=...&name=...
          → stores encrypted {access_token, refresh_token} as credential
          → returns {credential_id} (popup can postMessage this to parent)

    4. POST /api/auth/lakeb2b/linkedin-cookie
          → takes {credential_id, li_at}
          → posts li_at to b2b-pulse for LinkedIn scraping session

    5. GET  /api/auth/lakeb2b/status/{credential_id}
          → checks live connection status
"""
from __future__ import annotations

import json
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from ..container import get_container
from ..credentials import CredentialService
from ..database import get_db
from ..models import CredentialTable

router = APIRouter(prefix="/auth/lakeb2b", tags=["lakeb2b-auth"])

B2B_PULSE = "https://b2b-pulse.up.railway.app"


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _get_credential(credential_id: int, db: AsyncSession) -> CredentialTable:
    row = await db.get(CredentialTable, credential_id)
    if row is None:
        raise HTTPException(404, f"Credential {credential_id} not found")
    return row


def _decrypt(row: CredentialTable) -> dict:
    return json.loads(get_container().crypto.decrypt(row.data_encrypted))


# ── Request models ────────────────────────────────────────────────────────────

class LinkedInCookieRequest(BaseModel):
    credential_id: int
    li_at: str


class LinkedInLoginStartRequest(BaseModel):
    credential_id: int
    email: str
    password: str


class LinkedInLoginVerifyRequest(BaseModel):
    credential_id: int
    session_id: str
    code: str


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/oauth-url")
async def get_oauth_url(name: str = Query(default="lakeb2b-pulse")):
    """Fetch LinkedIn OAuth URL from B2B Pulse and return it to the frontend."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(f"{B2B_PULSE}/api/auth/linkedin")

    if resp.status_code >= 400:
        raise HTTPException(502, f"B2B Pulse error {resp.status_code}: {resp.text[:200]}")

    data = resp.json()
    auth_url = data.get("auth_url", "")
    if not auth_url:
        raise HTTPException(502, "B2B Pulse did not return an auth_url")

    return {"auth_url": auth_url, "name": name}


@router.get("/callback")
async def oauth_callback(
    token: str = Query(default=""),
    access_token: str = Query(default=""),
    refresh_token: str = Query(default=""),
    name: str = Query(default="lakeb2b-pulse"),
    li_at: str = Query(default=""),
    db: AsyncSession = Depends(get_db),
):
    """
    Receive JWT from B2B Pulse OAuth callback.
    Optionally accepts li_at cookie to save LinkedIn session immediately
    while the token is guaranteed fresh.
    """
    jwt = token or access_token
    if not jwt:
        return HTMLResponse(_popup_html(error="No token received from B2B Pulse"))

    linkedin_connected = False

    # If li_at provided, save it to B2B Pulse immediately while token is fresh
    if li_at:
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(
                    f"{B2B_PULSE}/api/integrations/linkedin/session-cookies",
                    json={"li_at": li_at},
                    headers={"Authorization": f"Bearer {jwt}"},
                )
            if resp.status_code == 200:
                linkedin_connected = True
        except Exception:
            pass  # Save credential anyway; user can reconnect via the card button

    credential_data = {
        "access_token": jwt,
        "refresh_token": refresh_token,
        "linkedin_connected": linkedin_connected,
    }

    svc = CredentialService(db, get_container().crypto)
    row = await svc.create(name, "lakeb2b", credential_data)

    return HTMLResponse(_popup_html(credential_id=row.id, name=row.name))


@router.post("/pair")
async def get_pairing_token(credential_id: int, db: AsyncSession = Depends(get_db)):
    """Get a short-lived pairing token from B2B Pulse for the browser extension.
    The extension uses this token to POST li_at directly to B2B Pulse's
    /api/integrations/extension/session-cookies endpoint.
    """
    row = await _get_credential(credential_id, db)
    creds = _decrypt(row)
    access_token = creds.get("access_token") or creds.get("jwt", "")
    if not access_token:
        raise HTTPException(400, "Complete B2B Pulse OAuth first")

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(
            f"{B2B_PULSE}/api/integrations/extension/pair",
            headers={"Authorization": f"Bearer {access_token}"},
        )

    if resp.status_code >= 400:
        raise HTTPException(502, f"B2B Pulse error {resp.status_code}: {resp.text[:200]}")

    return resp.json()  # {pairing_token, expires_at, api_base}


@router.post("/linkedin-cookie")
async def save_linkedin_cookie(body: LinkedInCookieRequest, db: AsyncSession = Depends(get_db)):
    """Post the li_at cookie to B2B Pulse and mark credential as LinkedIn-connected."""
    row = await _get_credential(body.credential_id, db)
    creds = _decrypt(row)

    access_token = creds.get("access_token") or creds.get("jwt", "")
    if not access_token:
        raise HTTPException(400, "Credential has no access_token — complete LinkedIn OAuth first")

    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.post(
            f"{B2B_PULSE}/api/integrations/linkedin/session-cookies",
            json={"li_at": body.li_at},
            headers={"Authorization": f"Bearer {access_token}"},
        )

    if resp.status_code >= 400:
        raise HTTPException(502, f"B2B Pulse error {resp.status_code}: {resp.text[:200]}")

    creds["linkedin_connected"] = True
    svc = CredentialService(db, get_container().crypto)
    await svc.update(body.credential_id, creds)

    return {"credential_id": body.credential_id, "linkedin_connected": True}


@router.post("/linkedin-login-start")
async def linkedin_login_start(body: LinkedInLoginStartRequest, db: AsyncSession = Depends(get_db)):
    """Start LinkedIn login via B2B Pulse's Playwright browser (server-side).
    B2B Pulse logs into LinkedIn from its own IP — no IP mismatch issue.
    Returns session_id if 2FA PIN is required, or success if login completed directly.
    """
    row = await _get_credential(body.credential_id, db)
    creds = _decrypt(row)
    access_token = creds.get("access_token") or creds.get("jwt", "")
    if not access_token:
        raise HTTPException(400, "Complete B2B Pulse OAuth first")

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            f"{B2B_PULSE}/api/integrations/linkedin/login-start",
            json={"email": body.email, "password": body.password},
            headers={"Authorization": f"Bearer {access_token}"},
        )

    if resp.status_code >= 400:
        raise HTTPException(502, f"B2B Pulse error {resp.status_code}: {resp.text[:300]}")

    data = resp.json()
    # If login succeeded without 2FA, mark linkedin_connected
    if data.get("status") == "success":
        creds["linkedin_connected"] = True
        svc = CredentialService(db, get_container().crypto)
        await svc.update(body.credential_id, creds)

    return data


@router.post("/linkedin-login-verify")
async def linkedin_login_verify(body: LinkedInLoginVerifyRequest, db: AsyncSession = Depends(get_db)):
    """Verify LinkedIn 2FA PIN after login-start returned a session_id."""
    row = await _get_credential(body.credential_id, db)
    creds = _decrypt(row)
    access_token = creds.get("access_token") or creds.get("jwt", "")
    if not access_token:
        raise HTTPException(400, "Complete B2B Pulse OAuth first")

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            f"{B2B_PULSE}/api/integrations/linkedin/login-verify",
            json={"session_id": body.session_id, "code": body.code},
            headers={"Authorization": f"Bearer {access_token}"},
        )

    if resp.status_code >= 400:
        raise HTTPException(502, f"B2B Pulse error {resp.status_code}: {resp.text[:300]}")

    data = resp.json()
    if data.get("status") == "success":
        creds["linkedin_connected"] = True
        svc = CredentialService(db, get_container().crypto)
        await svc.update(body.credential_id, creds)

    return data


@router.get("/ws-token/{credential_id}")
async def get_ws_token(credential_id: int, db: AsyncSession = Depends(get_db)):
    """Return the B2B Pulse access token so the frontend can open a WebSocket
    directly to wss://b2b-pulse.up.railway.app/api/ws/events?token=<jwt>
    without exposing the token in ChampIQ's own WS proxy.
    """
    row = await _get_credential(credential_id, db)
    creds = _decrypt(row)
    access_token = creds.get("access_token") or creds.get("jwt", "")
    if not access_token:
        raise HTTPException(400, "Complete B2B Pulse OAuth first")
    return {"access_token": access_token, "ws_url": f"{B2B_PULSE}/api/ws/events"}


@router.get("/status/{credential_id}")
async def lakeb2b_status(credential_id: int, db: AsyncSession = Depends(get_db)):
    """Check B2B Pulse + LinkedIn connection status."""
    row = await _get_credential(credential_id, db)
    creds = _decrypt(row)

    access_token = creds.get("access_token") or creds.get("jwt", "")
    pulse_connected = bool(access_token)
    linkedin_connected = creds.get("linkedin_connected", False)

    if pulse_connected:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(
                    f"{B2B_PULSE}/api/integrations/status",
                    headers={"Authorization": f"Bearer {access_token}"},
                )
            if resp.status_code == 401:
                pulse_connected = False
            elif resp.status_code == 200:
                status_data = resp.json()
                linkedin_connected = (
                    status_data.get("linkedin", {}).get("connected", False)
                    or creds.get("linkedin_connected", False)
                )
        except Exception:
            pass

    return {
        "credential_id": credential_id,
        "pulse_connected": pulse_connected,
        "linkedin_connected": linkedin_connected,
    }


# ── Popup HTML helper ─────────────────────────────────────────────────────────

def _popup_html(credential_id: int | None = None, name: str = "", error: str = "") -> str:
    """Returns a minimal HTML page that postMessages the result to the opener and closes."""
    if error:
        msg = f'{{"type": "LAKEB2B_AUTH_ERROR", "error": {json.dumps(error)}}}'
    else:
        msg = f'{{"type": "LAKEB2B_AUTH_SUCCESS", "credential_id": {credential_id}, "name": {json.dumps(name)}}}'

    return f"""<!DOCTYPE html>
<html>
<head><title>Connecting...</title></head>
<body>
<script>
  try {{
    if (window.opener) {{
      window.opener.postMessage({msg}, '*');
    }}
  }} catch(e) {{}}
  window.close();
</script>
<p style="font-family:sans-serif;text-align:center;margin-top:40px;color:#666;">
  {'Connected! Closing...' if not error else f'Error: {error}'}
</p>
</body>
</html>"""
