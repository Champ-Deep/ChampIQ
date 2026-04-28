from __future__ import annotations

from typing import Any, Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import CMSend


class SendRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(self, send_id: int) -> Optional[CMSend]:
        return await self._session.get(CMSend, send_id)

    async def get_by_idempotency(self, key: str) -> Optional[CMSend]:
        result = await self._session.execute(select(CMSend).where(CMSend.idempotency_key == key))
        return result.scalar_one_or_none()

    async def get_by_emelia_message_id(self, message_id: str) -> Optional[CMSend]:
        result = await self._session.execute(
            select(CMSend).where(CMSend.emelia_message_id == message_id)
        )
        return result.scalar_one_or_none()

    async def list_for_prospect(self, prospect_id: int, limit: int = 50) -> list[CMSend]:
        stmt = (
            select(CMSend)
            .where(CMSend.prospect_id == prospect_id)
            .order_by(CMSend.created_at.desc())
            .limit(limit)
        )
        return list((await self._session.execute(stmt)).scalars().all())

    async def count_for_sequence(self, sequence_id: int) -> int:
        from ..models import CMEnrollment
        stmt = (
            select(func.count())
            .select_from(CMSend)
            .join(CMEnrollment, CMSend.enrollment_id == CMEnrollment.id)
            .where(CMEnrollment.sequence_id == sequence_id)
        )
        return int((await self._session.execute(stmt)).scalar_one())

    async def create(self, **fields: Any) -> CMSend:
        row = CMSend(**fields)
        self._session.add(row)
        await self._session.flush()
        return row

    async def update(self, send_id: int, **fields: Any) -> Optional[CMSend]:
        row = await self.get(send_id)
        if row is None:
            return None
        for k, v in fields.items():
            setattr(row, k, v)
        await self._session.flush()
        return row
