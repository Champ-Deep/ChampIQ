"""CadenceService — the heart of sequence execution.

Run via the scheduler every 60s. Steps:
  1. Pull active enrollments where next_step_at <= now (cap batch at N).
  2. For each enrollment, find the current step's template.
  3. Evaluate the step's `condition` (if any) against prior events.
  4. Pick a sender via SenderPicker (skips enrollment if no sender available).
  5. Call SendService.send_for_step (idempotent on enrollment+step).
  6. Advance the enrollment to the next step (or complete it).

Failure handling:
  - Sender exhausted → leave enrollment as-is, picked up next tick.
  - Send failed → record failure, still advance the enrollment (do not block).
  - Conditional skip → do not send, advance.
"""
from __future__ import annotations

import logging
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from ..models import CMEnrollment, CMEvent, CMSequenceStep, CMTemplate
from ..rendering import TemplateRenderer, UnsubscribeTokens
from ..repositories import (
    EnrollmentRepository,
    EventRepository,
    ProspectRepository,
    SequenceRepository,
    TemplateRepository,
)
from ..transport import MailTransport, MailTransportFactory
from .enrollment_service import EnrollmentService
from .send_service import SendService
from .sender_picker import SenderPicker

log = logging.getLogger(__name__)


class CadenceService:
    """Stateless service — opens its own session for each tick."""

    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        transport: MailTransport,
        renderer: TemplateRenderer,
        *,
        unsubscribe_tokens: Optional[UnsubscribeTokens] = None,
        unsubscribe_base_url: str = "",
        transport_factory: Optional[MailTransportFactory] = None,
    ) -> None:
        self._session_factory = session_factory
        self._transport = transport
        self._transport_factory = transport_factory
        self._renderer = renderer
        self._unsubscribe_tokens = unsubscribe_tokens
        self._unsubscribe_base_url = unsubscribe_base_url

    async def tick(self, *, batch_limit: int = 200) -> dict[str, int]:
        """Process one batch of due enrollments. Returns counters for logging."""
        counters = {"due": 0, "sent": 0, "skipped_condition": 0, "skipped_no_sender": 0, "failed": 0, "completed": 0}

        async with self._session_factory() as session:
            enrollments = EnrollmentRepository(session)
            sequences = SequenceRepository(session)
            templates = TemplateRepository(session)
            prospects = ProspectRepository(session)
            events = EventRepository(session)
            picker = SenderPicker(session)
            send_service = SendService(
                session, self._transport, self._renderer,
                unsubscribe_tokens=self._unsubscribe_tokens,
                unsubscribe_base_url=self._unsubscribe_base_url,
                transport_factory=self._transport_factory,
            )
            enrollment_service = EnrollmentService(session)

            due = await enrollments.list_due(limit=batch_limit)
            counters["due"] = len(due)
            if not due:
                return counters

            for en in due:
                try:
                    sequence = await sequences.get(en.sequence_id)
                    if sequence is None or not sequence.enabled:
                        await enrollment_service.complete(en.id)
                        counters["completed"] += 1
                        continue

                    step = next((s for s in sequence.steps if s.step_index == en.current_step_index), None)
                    if step is None:
                        # No step at this index — sequence done
                        await enrollment_service.complete(en.id)
                        counters["completed"] += 1
                        continue

                    template = await templates.get(step.template_id)
                    prospect = await prospects.get(en.prospect_id)
                    if template is None or prospect is None:
                        log.warning(
                            "cadence: missing template/prospect for enrollment=%s — skipping",
                            en.id,
                        )
                        await enrollment_service.complete(en.id)
                        counters["completed"] += 1
                        continue

                    # Conditional gate: skip the send (still advance) if condition fails.
                    if not await _evaluate_condition(step, en, events):
                        counters["skipped_condition"] += 1
                        await enrollment_service.advance(en)
                        continue

                    # Pick a sender; if none, leave for next tick.
                    sender = await picker.next_available()
                    if sender is None:
                        counters["skipped_no_sender"] += 1
                        continue

                    result = await send_service.send_for_step(
                        prospect=prospect,
                        template=template,
                        sender=sender,
                        enrollment=en,
                        step_id=step.id,
                        step_index=step.step_index,
                    )
                    if result.success:
                        counters["sent"] += 1
                    else:
                        counters["failed"] += 1

                    # Advance regardless of send outcome to avoid infinite retries.
                    advanced = await enrollment_service.advance(en)
                    if advanced and advanced.status == "completed":
                        counters["completed"] += 1

                except Exception:
                    log.exception("cadence: enrollment=%s raised — skipping", en.id)
                    counters["failed"] += 1

            await session.commit()

        return counters


async def _evaluate_condition(
    step: CMSequenceStep,
    enrollment: CMEnrollment,
    events: EventRepository,
) -> bool:
    """Evaluate a step.condition against prior events for this enrollment.

    Supported (v1):
      None                                → always send
      {"if": "previous.opened"}           → previous send must have an "opened" event
      {"if": "previous.clicked"}          → previous send must have a "clicked" event
      {"if": "not previous.opened"}       → previous send must NOT have an "opened" event
      {"if": "not previous.clicked"}      → previous send must NOT have a "clicked" event
      {"if": "always"}                    → always send (alias for None)

    Future: extend with more operators / multi-step lookback.
    """
    cond = step.condition
    if not cond:
        return True
    expr = (cond.get("if") or "always").strip().lower()
    if expr in ("always", "true", ""):
        return True

    # Extract prior-event signals for this enrollment's prospect
    prior_events = await events.list_for_prospect(enrollment.prospect_id, limit=200)
    has_open = any(e.event_type == "opened" for e in prior_events)
    has_click = any(e.event_type == "clicked" for e in prior_events)

    matchers = {
        "previous.opened": has_open,
        "previous.clicked": has_click,
        "not previous.opened": not has_open,
        "not previous.clicked": not has_click,
    }
    return matchers.get(expr, True)
