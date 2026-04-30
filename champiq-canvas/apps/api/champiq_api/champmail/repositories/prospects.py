from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import CMProspect


class ProspectRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(self, prospect_id: int) -> Optional[CMProspect]:
        return await self._session.get(CMProspect, prospect_id)

    async def get_by_email(self, email: str) -> Optional[CMProspect]:
        result = await self._session.execute(
            select(CMProspect).where(func.lower(CMProspect.email) == email.lower())
        )
        return result.scalar_one_or_none()

    async def list(
        self,
        *,
        limit: int = 50,
        offset: int = 0,
        status: Optional[str] = None,
        search: Optional[str] = None,
    ) -> tuple[list[CMProspect], int]:
        stmt = select(CMProspect)
        count_stmt = select(func.count()).select_from(CMProspect)
        if status:
            stmt = stmt.where(CMProspect.status == status)
            count_stmt = count_stmt.where(CMProspect.status == status)
        if search:
            like = f"%{search.lower()}%"
            stmt = stmt.where(func.lower(CMProspect.email).like(like))
            count_stmt = count_stmt.where(func.lower(CMProspect.email).like(like))
        stmt = stmt.order_by(CMProspect.created_at.desc()).limit(limit).offset(offset)
        rows = (await self._session.execute(stmt)).scalars().all()
        total = (await self._session.execute(count_stmt)).scalar_one()
        return list(rows), total

    async def create(self, **fields: Any) -> CMProspect:
        row = CMProspect(**fields)
        self._session.add(row)
        await self._session.flush()
        return row

    async def update(self, prospect_id: int, **fields: Any) -> Optional[CMProspect]:
        row = await self.get(prospect_id)
        if row is None:
            return None
        for k, v in fields.items():
            if v is not None:
                setattr(row, k, v)
        await self._session.flush()
        return row

    async def delete(self, prospect_id: int) -> bool:
        row = await self.get(prospect_id)
        if row is None:
            return False
        await self._session.delete(row)
        await self._session.flush()
        return True

    async def mark_event(
        self,
        prospect_id: int,
        *,
        opened_at: Optional[datetime] = None,
        clicked_at: Optional[datetime] = None,
        replied_at: Optional[datetime] = None,
        sent_at: Optional[datetime] = None,
        status: Optional[str] = None,
    ) -> Optional[CMProspect]:
        row = await self.get(prospect_id)
        if row is None:
            return None
        if opened_at:
            row.last_opened_at = opened_at
        if clicked_at:
            row.last_clicked_at = clicked_at
        if replied_at:
            row.last_replied_at = replied_at
        if sent_at:
            row.last_sent_at = sent_at
        if status:
            row.status = status
        await self._session.flush()
        return row
