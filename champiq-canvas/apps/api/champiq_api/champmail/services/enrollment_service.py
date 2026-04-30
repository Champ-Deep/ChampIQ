"""EnrollmentService — manages prospect-in-sequence lifecycle.

Operations:
  enroll(prospect, sequence)      → create enrollment, schedule first step
  pause(enrollment)               → status = paused
  resume(enrollment)              → status = active, recompute next_step_at
  complete(enrollment)            → status = completed, next_step_at = None
  schedule_next_step(enrollment)  → advance current_step_index, compute next_step_at
                                    using delay + working hours of the sequence

Working-hours gate:
  Each sequence has timezone + working_hours_start..end (e.g. 9..17 UTC).
  schedule_next_step pushes next_step_at into the next opening if the naive
  delay puts it outside the window.
"""
from __future__ import annotations

import logging
from datetime import datetime, time, timedelta, timezone
from typing import Optional
from zoneinfo import ZoneInfo

from sqlalchemy.ext.asyncio import AsyncSession

from ..models import CMEnrollment, CMSequence
from ..repositories import EnrollmentRepository, SequenceRepository

log = logging.getLogger(__name__)


def _next_in_window(at: datetime, *, tz: ZoneInfo, hour_start: int, hour_end: int) -> datetime:
    """Push `at` forward to the next instant inside [hour_start, hour_end) in `tz`.
    Returns a tz-aware UTC datetime.
    """
    local = at.astimezone(tz)
    if hour_start <= local.hour < hour_end:
        return at.astimezone(timezone.utc)

    # Either before window today or after window — schedule for window start (today or tomorrow).
    target_date = local.date()
    if local.hour >= hour_end:
        target_date = target_date + timedelta(days=1)
    target_local = datetime.combine(target_date, time(hour=hour_start), tzinfo=tz)
    return target_local.astimezone(timezone.utc)


class EnrollmentService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._enrollments = EnrollmentRepository(session)
        self._sequences = SequenceRepository(session)

    async def enroll(self, *, prospect_id: int, sequence_id: int) -> CMEnrollment:
        existing = await self._enrollments.find(prospect_id, sequence_id)
        if existing is not None:
            return existing
        sequence = await self._sequences.get(sequence_id)
        if sequence is None:
            raise ValueError(f"sequence {sequence_id} not found")
        next_at = self._compute_first_step_at(sequence)
        return await self._enrollments.create(
            prospect_id=prospect_id,
            sequence_id=sequence_id,
            current_step_index=0,
            status="active",
            next_step_at=next_at,
        )

    async def pause(self, enrollment_id: int) -> Optional[CMEnrollment]:
        return await self._enrollments.update(
            enrollment_id,
            status="paused",
            paused_at=datetime.now(timezone.utc),
        )

    async def resume(self, enrollment_id: int) -> Optional[CMEnrollment]:
        en = await self._enrollments.get(enrollment_id)
        if en is None:
            return None
        sequence = await self._sequences.get(en.sequence_id)
        if sequence is None:
            return en
        # Schedule for the next window opening from now
        next_at = _next_in_window(
            datetime.now(timezone.utc),
            tz=ZoneInfo(sequence.timezone or "UTC"),
            hour_start=sequence.working_hours_start,
            hour_end=sequence.working_hours_end,
        )
        return await self._enrollments.update(
            enrollment_id, status="active", next_step_at=next_at, paused_at=None
        )

    async def complete(self, enrollment_id: int) -> Optional[CMEnrollment]:
        return await self._enrollments.update(
            enrollment_id,
            status="completed",
            next_step_at=None,
            completed_at=datetime.now(timezone.utc),
        )

    async def advance(self, enrollment: CMEnrollment) -> Optional[CMEnrollment]:
        """Move enrollment to the next step. If no more steps, complete it."""
        sequence = await self._sequences.get(enrollment.sequence_id)
        if sequence is None:
            return await self.complete(enrollment.id)
        new_index = enrollment.current_step_index + 1
        if new_index >= len(sequence.steps):
            return await self.complete(enrollment.id)
        step = next((s for s in sequence.steps if s.step_index == new_index), None)
        if step is None:
            return await self.complete(enrollment.id)
        delay = timedelta(days=step.delay_days, hours=step.delay_hours)
        next_at_naive = datetime.now(timezone.utc) + delay
        next_at = _next_in_window(
            next_at_naive,
            tz=ZoneInfo(sequence.timezone or "UTC"),
            hour_start=sequence.working_hours_start,
            hour_end=sequence.working_hours_end,
        )
        return await self._enrollments.update(
            enrollment.id, current_step_index=new_index, next_step_at=next_at
        )

    def _compute_first_step_at(self, sequence: CMSequence) -> datetime:
        first = next((s for s in sequence.steps if s.step_index == 0), None)
        delay = timedelta(days=first.delay_days, hours=first.delay_hours) if first else timedelta()
        naive = datetime.now(timezone.utc) + delay
        return _next_in_window(
            naive,
            tz=ZoneInfo(sequence.timezone or "UTC"),
            hour_start=sequence.working_hours_start,
            hour_end=sequence.working_hours_end,
        )
