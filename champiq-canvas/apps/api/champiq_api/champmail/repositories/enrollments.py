from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import CMEnrollment


class EnrollmentRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(self, enrollment_id: int) -> Optional[CMEnrollment]:
        return await self._session.get(CMEnrollment, enrollment_id)

    async def find(self, prospect_id: int, sequence_id: int) -> Optional[CMEnrollment]:
        result = await self._session.execute(
            select(CMEnrollment).where(
                CMEnrollment.prospect_id == prospect_id,
                CMEnrollment.sequence_id == sequence_id,
            )
        )
        return result.scalar_one_or_none()

    async def list_for_prospect(self, prospect_id: int) -> list[CMEnrollment]:
        stmt = select(CMEnrollment).where(CMEnrollment.prospect_id == prospect_id)
        return list((await self._session.execute(stmt)).scalars().all())

    async def list_due(self, limit: int = 200) -> list[CMEnrollment]:
        """Active enrollments whose next_step_at has passed — cadence engine input."""
        now = datetime.now(timezone.utc)
        stmt = (
            select(CMEnrollment)
            .where(
                CMEnrollment.status == "active",
                CMEnrollment.next_step_at.isnot(None),
                CMEnrollment.next_step_at <= now,
            )
            .order_by(CMEnrollment.next_step_at.asc())
            .limit(limit)
        )
        return list((await self._session.execute(stmt)).scalars().all())

    async def create(self, **fields: Any) -> CMEnrollment:
        row = CMEnrollment(**fields)
        self._session.add(row)
        await self._session.flush()
        return row

    async def update(self, enrollment_id: int, **fields: Any) -> Optional[CMEnrollment]:
        row = await self.get(enrollment_id)
        if row is None:
            return None
        for k, v in fields.items():
            setattr(row, k, v)  # allow None to clear next_step_at on completion
        await self._session.flush()
        return row

    async def pause_active_for_prospect(self, prospect_id: int, *, reason: str = "paused") -> int:
        """Pause every active enrollment for a prospect (replied / bounced / unsubscribed).
        Returns number of rows updated."""
        rows = (
            await self._session.execute(
                select(CMEnrollment).where(
                    CMEnrollment.prospect_id == prospect_id,
                    CMEnrollment.status == "active",
                )
            )
        ).scalars().all()
        now = datetime.now(timezone.utc)
        for r in rows:
            r.status = reason  # paused, replied, bounced, unsubscribed
            r.paused_at = now
        await self._session.flush()
        return len(rows)
