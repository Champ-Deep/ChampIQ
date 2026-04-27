"""LakeB2B Pulse auth proxy.

Keeps tokens server-side — browser never sees raw JWTs.
All calls go through here; the frontend only stores a credential_id.

Routes:
    POST /api/auth/lakeb2b/login
        → proxies to b2b-pulse /api/auth/linkedin (email+password login)
        → stores encrypted {access_token, refresh_token} as a credential
        → returns {credential_id, name}

    POST /api/auth/lakeb2b/linkedin-cookie
        → takes {credential_id, li_at}
        → posts li_at to b2b-pulse /api/integrations/linkedin/session-cookies
          using the stored access_token
        → updates credential with linkedin_connected: true

    GET /api/auth/lakeb2b/status/{credential_id}
        → checks b2b-pulse /api/integrations/status using stored token
        → returns {pulse_connected, linkedin_connected}
"""
from __future__ import annotations

import json

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from ..container import get_container
from ..credentials import CredentialService
from ..database import get_db, get_settings
from ..models import CredentialTable

router = APIRouter(prefix="/auth/lakeb2b", tags=["lakeb2b-auth"])

B2B_PULSE = "https://b2b-pulse.up.railway.app"


# ── Request / Response models ─────────────────────────────────────────────────

class LoginRequest(BaseModel):
    name: str           # credential name chosen by user
    email: str
    password: str


class LinkedInCookieRequest(BaseModel):
    credential_id: int
    li_at: str


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _get_credential(credential_id: int, db: AsyncSession) -> CredentialTable:
    row = await db.get(CredentialTable, credential_id)
    if row is None:
        raise HTTPException(404, f"Credential {credential_id} not found")
    return row


def _decrypt(row: CredentialTable) -> dict:
    container = get_container()
    return json.loads(container.crypto.decrypt(row.data_encrypted))


def _encrypt(data: dict) -> str:
    container = get_container()
    return container.crypto.encrypt(json.dumps(data))


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/login")
async def lakeb2b_login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    """Log into B2B Pulse and store encrypted JWT as a credential."""
    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.post(
            f"{B2B_PULSE}/api/auth/linkedin",
            json={"email": body.email, "password": body.password},
        )

    if resp.status_code == 401:
        raise HTTPException(401, "Invalid B2B Pulse email or password")
    if resp.status_code >= 400:
        raise HTTPException(502, f"B2B Pulse error {resp.status_code}: {resp.text[:200]}")

    data = resp.json()
    access_token = data.get("access_token") or data.get("token") or ""
    refresh_token = data.get("refresh_token", "")

    if not access_token:
        raise HTTPException(502, "B2B Pulse did not return an access token")

    credential_data = {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "linkedin_connected": False,
        "email": body.email,
    }

    svc = CredentialService(db, get_container().crypto)
    row = await svc.create(body.name, "lakeb2b", credential_data)

    return {"credential_id": row.id, "name": row.name, "linkedin_connected": False}


@router.post("/linkedin-cookie")
async def save_linkedin_cookie(body: LinkedInCookieRequest, db: AsyncSession = Depends(get_db)):
    """Post the li_at cookie to B2B Pulse and mark credential as LinkedIn-connected."""
    row = await _get_credential(body.credential_id, db)
    creds = _decrypt(row)

    access_token = creds.get("access_token") or creds.get("jwt", "")
    if not access_token:
        raise HTTPException(400, "Credential has no access_token — log into B2B Pulse first")

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


@router.get("/status/{credential_id}")
async def lakeb2b_status(credential_id: int, db: AsyncSession = Depends(get_db)):
    """Check B2B Pulse + LinkedIn connection status for a credential."""
    row = await _get_credential(credential_id, db)
    creds = _decrypt(row)

    access_token = creds.get("access_token") or creds.get("jwt", "")
    pulse_connected = bool(access_token)
    linkedin_connected = creds.get("linkedin_connected", False)

    # Verify token still valid + check live LinkedIn status
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
