"""SendService — high-level "send one email to one prospect".

Used by:
  - SingleSendIn API endpoint (immediate one-off send)
  - CadenceService (sequence step due → call here)
  - ChampmailLocalExecutor (canvas node)

Responsibilities (SRP):
  - Render template with prospect context
  - Compute idempotency key
  - Skip if a Send row already exists for that key
  - Call the transport
  - Persist Send row (success or failure) + Event row on success
  - Update prospect.last_sent_at on success

Does NOT:
  - Pick the sender (that's SenderPicker's job)
  - Enforce rate limits (that's the sender picker / cadence engine's job)
  - Decide whether the prospect is reachable (that's the cadence engine's job)
"""
from __future__ import annotations

import hashlib
import logging
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from ..models import CMEnrollment, CMProspect, CMSender, CMTemplate
from ..rendering import TemplateRenderer
from ..repositories import (
    EventRepository,
    ProspectRepository,
    SendRepository,
    TemplateRepository,
)
from ..transport import EmailEnvelope, MailTransport, SendResult

log = logging.getLogger(__name__)


def _idempotency_for_sequence(enrollment_id: int, step_index: int) -> str:
    return hashlib.sha1(f"seq:{enrollment_id}:{step_index}".encode()).hexdigest()


def _idempotency_for_oneoff(template_id: int, prospect_id: int, ts: int) -> str:
    return hashlib.sha1(f"oneoff:{template_id}:{prospect_id}:{ts}".encode()).hexdigest()


class SendService:
    def __init__(
        self,
        session: AsyncSession,
        transport: MailTransport,
        renderer: TemplateRenderer,
    ) -> None:
        self._session = session
        self._transport = transport
        self._renderer = renderer
        self._templates = TemplateRepository(session)
        self._sends = SendRepository(session)
        self._prospects = ProspectRepository(session)
        self._events = EventRepository(session)

    async def send_oneoff(
        self,
        *,
        prospect: CMProspect,
        template: CMTemplate,
        sender: CMSender,
        extra_vars: Optional[dict[str, Any]] = None,
    ) -> SendResult:
        """Single transactional send (no enrollment / step). Always rendered fresh
        and identified by a timestamped idempotency key (so re-runs are unique)."""
        ts = int(datetime.now(timezone.utc).timestamp())
        key = _idempotency_for_oneoff(template.id, prospect.id, ts)
        return await self._send_inner(
            prospect=prospect,
            template=template,
            sender=sender,
            idempotency_key=key,
            enrollment_id=None,
            step_id=None,
            extra_vars=extra_vars,
        )

    async def send_for_step(
        self,
        *,
        prospect: CMProspect,
        template: CMTemplate,
        sender: CMSender,
        enrollment: CMEnrollment,
        step_id: int,
        step_index: int,
        extra_vars: Optional[dict[str, Any]] = None,
    ) -> SendResult:
        """Cadence-engine entry point. Idempotent on (enrollment, step_index)
        so a retry never double-sends the same step."""
        key = _idempotency_for_sequence(enrollment.id, step_index)
        existing = await self._sends.get_by_idempotency(key)
        if existing is not None:
            log.info("send_for_step: skipping duplicate enrollment=%s step=%s", enrollment.id, step_index)
            return SendResult(
                success=existing.status == "sent",
                provider_message_id=existing.emelia_message_id,
                error=existing.failed_reason,
            )
        return await self._send_inner(
            prospect=prospect,
            template=template,
            sender=sender,
            idempotency_key=key,
            enrollment_id=enrollment.id,
            step_id=step_id,
            extra_vars=extra_vars,
        )

    # -- internal -----------------------------------------------------------

    async def _send_inner(
        self,
        *,
        prospect: CMProspect,
        template: CMTemplate,
        sender: CMSender,
        idempotency_key: str,
        enrollment_id: Optional[int],
        step_id: Optional[int],
        extra_vars: Optional[dict[str, Any]],
    ) -> SendResult:
        rendered = self._renderer.render(
            subject=template.subject,
            body_html=template.body_html,
            body_text=template.body_text,
            prospect=prospect,
            extra_vars=extra_vars,
        )

        send_row = await self._sends.create(
            enrollment_id=enrollment_id,
            step_id=step_id,
            template_id=template.id,
            sender_id=sender.id,
            prospect_id=prospect.id,
            idempotency_key=idempotency_key,
            subject_rendered=rendered.subject,
            body_html_rendered=rendered.body_html,
            status="pending",
        )

        envelope = EmailEnvelope(
            to_email=prospect.email,
            to_name=prospect.first_name,
            subject=rendered.subject,
            body_html=rendered.body_html,
            body_text=rendered.body_text,
            from_email=sender.from_email,
            from_name=sender.from_name,
            tracking_id=str(send_row.id),
        )

        try:
            result = await self._transport.send(envelope, sender_id=sender.emelia_sender_id)
        except Exception as e:
            log.exception("transport raised")
            result = SendResult(success=False, error=f"transport raised: {e}")

        now = datetime.now(timezone.utc)
        if result.success:
            await self._sends.update(
                send_row.id,
                status="sent",
                emelia_message_id=result.provider_message_id,
                sent_at=now,
            )
            await self._events.create(
                prospect_id=prospect.id,
                event_type="sent",
                send_id=send_row.id,
                metadata={"transport": self._transport.name, "sender_id": sender.id},
            )
            await self._prospects.mark_event(prospect.id, sent_at=now)
        else:
            await self._sends.update(
                send_row.id,
                status="failed",
                failed_reason=(result.error or "unknown")[:500],
            )
            await self._events.create(
                prospect_id=prospect.id,
                event_type="failed",
                send_id=send_row.id,
                metadata={"reason": result.error},
            )
        return result
