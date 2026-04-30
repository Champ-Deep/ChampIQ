"""Test/inspect Emelia credentials before saving them.

The frontend "Connect Emelia" flow:
  1. User pastes API key
  2. Frontend POSTs here to verify the key + list providers (inboxes)
  3. User picks one provider as their default sender
  4. Frontend POSTs to /api/credentials with type='champmail',
     data={api_key, default_sender_id}

This endpoint never persists the key — it's a probe.
"""
from __future__ import annotations

import logging
from typing import Any, Optional

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

log = logging.getLogger(__name__)

router = APIRouter(prefix="/champmail/credentials", tags=["champmail:credentials"])


EMELIA_GRAPHQL_URL = "https://graphql.emelia.io/graphql"
EMELIA_REST_URL = "https://api.emelia.io"


class CredentialTestIn(BaseModel):
    api_key: str


class EmeliaProviderOut(BaseModel):
    id: str
    email: Optional[str] = None
    name: Optional[str] = None


class CredentialTestOut(BaseModel):
    valid: bool
    account_email: Optional[str] = None
    account_uid: Optional[str] = None
    providers: list[EmeliaProviderOut] = []
    error: Optional[str] = None


@router.post("/test", response_model=CredentialTestOut)
async def test_emelia_credential(body: CredentialTestIn) -> CredentialTestOut:
    """Verify an Emelia API key and list its connected inboxes.

    Used by the "Connect Emelia" UI before the user saves the credential.
    """
    api_key = body.api_key.strip()
    if not api_key:
        raise HTTPException(400, "api_key is required")

    headers = {"Authorization": api_key, "Content-Type": "application/json"}

    # 1) Identify the account via GraphQL `me`.
    try:
        async with httpx.AsyncClient(timeout=15.0, headers=headers) as client:
            r = await client.post(
                EMELIA_GRAPHQL_URL, json={"query": "{ me { uid email } }"}
            )
    except httpx.HTTPError as e:
        return CredentialTestOut(valid=False, error=f"network error: {e}")

    if r.status_code != 200:
        return CredentialTestOut(valid=False, error=f"Emelia HTTP {r.status_code}")
    payload = (r.json() or {})
    if "errors" in payload:
        # Auth failures usually surface here as a single message
        msg = "; ".join((e.get("message") or "") for e in payload["errors"])
        return CredentialTestOut(valid=False, error=msg or "Emelia rejected key")

    me = (payload.get("data") or {}).get("me") or {}
    if not me:
        return CredentialTestOut(valid=False, error="Emelia did not return account info")

    # 2) List providers (inboxes). Fields are deliberately minimal — Emelia hides
    #    most identifying info. The user picks by index when there are multiple.
    providers: list[EmeliaProviderOut] = []
    try:
        async with httpx.AsyncClient(timeout=15.0, headers=headers) as client:
            pr = await client.post(
                EMELIA_GRAPHQL_URL,
                json={"query": "{ providers { _id imap { port } smtp { port } } }"},
            )
        if pr.status_code == 200:
            for p in (((pr.json() or {}).get("data") or {}).get("providers") or []):
                providers.append(EmeliaProviderOut(id=p["_id"]))
    except httpx.HTTPError:
        # Non-fatal — we already proved the key works
        pass

    # 3) Try to enrich provider records with sender_email from the campaigns REST
    #    endpoint, which returns the embedded provider's senderEmail/senderName.
    if providers:
        try:
            async with httpx.AsyncClient(timeout=15.0, headers=headers) as client:
                cr = await client.get(f"{EMELIA_REST_URL}/emails/campaigns")
            if cr.status_code == 200:
                seen: dict[str, dict[str, Any]] = {}
                for c in ((cr.json() or {}).get("campaigns") or []):
                    prov = c.get("provider") or {}
                    pid = prov.get("_id") if isinstance(prov, dict) else None
                    if pid and pid not in seen:
                        seen[pid] = {
                            "email": prov.get("senderEmail"),
                            "name": prov.get("senderName"),
                        }
                for p in providers:
                    info = seen.get(p.id)
                    if info:
                        p.email = info["email"]
                        p.name = info["name"]
        except httpx.HTTPError:
            pass

    return CredentialTestOut(
        valid=True,
        account_email=me.get("email"),
        account_uid=me.get("uid"),
        providers=providers,
    )
