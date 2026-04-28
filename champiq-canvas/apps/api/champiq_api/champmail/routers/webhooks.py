"""Inbound Emelia webhook receiver."""
from __future__ import annotations

import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Header, Request
from sqlalchemy.ext.asyncio import AsyncSession

from ...container import get_container
from ...database import get_db
from ..services import WebhookService, verify_signature

log = logging.getLogger(__name__)
router = APIRouter(prefix="/champmail/webhooks", tags=["champmail:webhooks"])


@router.post("/emelia")
async def emelia_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
    x_emelia_signature: str | None = Header(default=None, alias="X-Emelia-Signature"),
    x_signature: str | None = Header(default=None, alias="X-Signature"),
):
    """Emelia → ChampIQ webhook ingestion.

    Accepts either `X-Emelia-Signature` or `X-Signature` (provider naming varies).
    Body must verify against EMELIA_WEBHOOK_SECRET. Empty secret = signature
    checking disabled (dev only).
    """
    body = await request.body()
    secret = get_container().emelia_webhook_secret
    sig = x_emelia_signature or x_signature
    if not verify_signature(secret=secret, body=body, signature_header=sig):
        log.warning("emelia webhook: bad signature")
        raise HTTPException(401, "invalid signature")

    try:
        payload = json.loads(body or b"{}")
    except json.JSONDecodeError:
        raise HTTPException(400, "invalid JSON")

    # Some providers post arrays of events — handle both
    events = payload if isinstance(payload, list) else [payload]
    summaries = []
    svc = WebhookService(db)
    for evt in events:
        if not isinstance(evt, dict):
            continue
        try:
            summaries.append(await svc.ingest(evt))
        except Exception:
            log.exception("emelia webhook: event raised — continuing")
    await db.commit()
    return {"received": len(events), "events": summaries}
