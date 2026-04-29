"""WebhookService — ingests Emelia events and updates state.

Emelia POSTs JSON payloads to our webhook endpoint with an HMAC signature
header. Each event maps to:
  - an Event row (audit trail)
  - prospect timestamp updates (last_opened_at, last_replied_at, ...)
  - enrollment auto-pause (on reply / bounce / unsubscribe)
  - sender consecutive_bounces tracking (on bounce)

Event types from Emelia (canonical mapping):
  email.sent          → "sent"
  email.opened        → "opened"
  email.clicked       → "clicked"
  email.replied       → "replied"   → pause active enrollments for prospect
  email.bounced       → "bounced"   → pause + sender bounce counter ++
  email.unsubscribed  → "unsubscribed" → pause + prospect.status = unsubscribed
"""
from __future__ import annotations

import hashlib
import hmac
import logging
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from ..repositories import (
    EnrollmentRepository,
    EventRepository,
    ProspectRepository,
    SendRepository,
    SenderRepository,
)

log = logging.getLogger(__name__)


_EVENT_MAP = {
    "email.sent": "sent",
    "email.opened": "opened",
    "email.clicked": "clicked",
    "email.replied": "replied",
    "email.bounced": "bounced",
    "email.unsubscribed": "unsubscribed",
    # Tolerate alternate names some webhook providers use
    "sent": "sent",
    "opened": "opened",
    "clicked": "clicked",
    "replied": "replied",
    "bounced": "bounced",
    "unsubscribed": "unsubscribed",
}


def verify_signature(*, secret: str, body: bytes, signature_header: Optional[str]) -> bool:
    """HMAC-SHA256 hex digest verification.

    Some providers send the signature as `sha256=<hex>` and others as just `<hex>`;
    accept either. If `secret` is empty, signature checking is disabled (dev only).
    """
    if not secret:
        return True
    if not signature_header:
        return False
    sig = signature_header.strip()
    if sig.startswith("sha256="):
        sig = sig[len("sha256="):]
    expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, sig.lower())


class WebhookService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._prospects = ProspectRepository(session)
        self._sends = SendRepository(session)
        self._events = EventRepository(session)
        self._enrollments = EnrollmentRepository(session)
        self._senders = SenderRepository(session)

    async def ingest(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Process one Emelia webhook event. Returns a small summary for the response."""
        raw_type = (payload.get("event") or payload.get("type") or "").lower()
        event_type = _EVENT_MAP.get(raw_type)
        if event_type is None:
            log.info("webhook: unknown event %r — ignored", raw_type)
            return {"ignored": True, "event": raw_type}

        data = payload.get("data") or payload
        # Resolve which prospect this event is for
        send = await self._resolve_send(data)
        prospect_id, send_id = await self._resolve_prospect_id(data, send)

        if prospect_id is None:
            log.warning("webhook: could not resolve prospect for %r — payload=%s", event_type, data)
            return {"ignored": True, "reason": "no prospect"}

        # Audit
        await self._events.create(
            prospect_id=prospect_id,
            event_type=event_type,
            send_id=send_id,
            metadata=data,
        )

        now = datetime.now(timezone.utc)

        # Side effects per event type
        if event_type == "opened":
            await self._prospects.mark_event(prospect_id, opened_at=now)
        elif event_type == "clicked":
            await self._prospects.mark_event(prospect_id, clicked_at=now)
        elif event_type == "replied":
            await self._prospects.mark_event(prospect_id, replied_at=now, status="replied")
            paused = await self._enrollments.pause_active_for_prospect(prospect_id, reason="replied")
            log.info("webhook reply: paused %d enrollments for prospect=%s", paused, prospect_id)
        elif event_type == "bounced":
            await self._prospects.mark_event(prospect_id, status="bounced")
            await self._enrollments.pause_active_for_prospect(prospect_id, reason="bounced")
            if send is not None:
                await self._sends.update(send.id, status="bounced")
                sender = await self._senders.increment_bounces(send.sender_id)
                # Auto-disable sender after threshold to protect deliverability.
                # Threshold is intentionally local (not a setting) because the right
                # number depends on volume — start at 5 and tune from incidents.
                if sender and (sender.consecutive_bounces or 0) >= 5:
                    log.warning(
                        "auto-disabling sender id=%s name=%s after %d consecutive bounces",
                        sender.id, sender.name, sender.consecutive_bounces,
                    )
                    await self._senders.update(sender.id, enabled=False)
        elif event_type == "unsubscribed":
            await self._prospects.mark_event(prospect_id, status="unsubscribed")
            await self._enrollments.pause_active_for_prospect(prospect_id, reason="unsubscribed")
        elif event_type == "sent":
            # Already recorded by SendService at send time, but webhook may arrive
            # before/after for retries — refresh the message id if missing.
            if send is not None and not send.emelia_message_id:
                msg_id = data.get("messageId") or data.get("message_id")
                if msg_id:
                    await self._sends.update(send.id, emelia_message_id=str(msg_id))

        return {"event": event_type, "prospect_id": prospect_id, "send_id": send_id}

    async def _resolve_send(self, data: dict[str, Any]):
        """Look up the Send row by Emelia message ID or by our own tracking ID."""
        msg_id = data.get("messageId") or data.get("message_id")
        if msg_id:
            send = await self._sends.get_by_emelia_message_id(str(msg_id))
            if send:
                return send
        # We pass our send.id as customId in EmailEnvelope.tracking_id
        custom_id = data.get("customId") or data.get("custom_id") or data.get("tracking_id")
        if custom_id:
            try:
                return await self._sends.get(int(custom_id))
            except (TypeError, ValueError):
                return None
        return None

    async def _resolve_prospect_id(self, data: dict[str, Any], send) -> tuple[Optional[int], Optional[int]]:
        if send is not None:
            return send.prospect_id, send.id
        email = data.get("to") or data.get("email") or data.get("recipient")
        if email:
            p = await self._prospects.get_by_email(str(email))
            if p:
                return p.id, None
        return None, None
