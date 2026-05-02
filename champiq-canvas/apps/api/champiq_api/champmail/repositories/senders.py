from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import CMSend, CMSender


class SenderRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(self, sender_id: int) -> Optional[CMSender]:
        return await self._session.get(CMSender, sender_id)

    async def get_by_emelia_id(self, emelia_sender_id: str) -> Optional[CMSender]:
        result = await self._session.execute(
            select(CMSender).where(CMSender.emelia_sender_id == emelia_sender_id)
        )
        return result.scalar_one_or_none()

    async def list(self, *, enabled_only: bool = False) -> list[CMSender]:
        stmt = select(CMSender)
        if enabled_only:
            stmt = stmt.where(CMSender.enabled.is_(True))
        stmt = stmt.order_by(CMSender.id)
        return list((await self._session.execute(stmt)).scalars().all())

    async def create(self, **fields: Any) -> CMSender:
        row = CMSender(**fields)
        self._session.add(row)
        await self._session.flush()
        await self._session.refresh(row)
        return row

    async def update(self, sender_id: int, **fields: Any) -> Optional[CMSender]:
        row = await self.get(sender_id)
        if row is None:
            return None
        for k, v in fields.items():
            if v is not None:
                setattr(row, k, v)
        await self._session.flush()
        # Server-side onupdate=func.now() expires `updated_at` after flush.
        # Refresh now so callers (e.g. Pydantic SenderOut.model_validate) can
        # read it from sync context without triggering a lazy load that
        # would raise MissingGreenlet.
        await self._session.refresh(row)
        return row

    async def delete(self, sender_id: int) -> bool:
        row = await self.get(sender_id)
        if row is None:
            return False
        await self._session.delete(row)
        await self._session.flush()
        return True

    async def todays_send_count(self, sender_id: int) -> int:
        """Count sends from this sender since 00:00 UTC today.
        Used by the round-robin picker to enforce daily caps.
        """
        start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        stmt = (
            select(func.count())
            .select_from(CMSend)
            .where(
                CMSend.sender_id == sender_id,
                CMSend.created_at >= start,
                CMSend.status.in_(("sent", "pending")),
            )
        )
        return int((await self._session.execute(stmt)).scalar_one())

    async def increment_bounces(self, sender_id: int) -> Optional[CMSender]:
        row = await self.get(sender_id)
        if row is None:
            return None
        row.consecutive_bounces = (row.consecutive_bounces or 0) + 1
        await self._session.flush()
        return row

    async def reset_bounces(self, sender_id: int) -> None:
        row = await self.get(sender_id)
        if row is not None and row.consecutive_bounces:
            row.consecutive_bounces = 0
            await self._session.flush()
