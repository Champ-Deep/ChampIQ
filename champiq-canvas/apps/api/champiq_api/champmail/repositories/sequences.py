from __future__ import annotations

from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..models import CMSequence, CMSequenceStep


class SequenceRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(self, sequence_id: int, *, with_steps: bool = True) -> Optional[CMSequence]:
        stmt = select(CMSequence).where(CMSequence.id == sequence_id)
        if with_steps:
            stmt = stmt.options(selectinload(CMSequence.steps))
        return (await self._session.execute(stmt)).scalar_one_or_none()

    async def get_by_name(self, name: str) -> Optional[CMSequence]:
        stmt = select(CMSequence).where(CMSequence.name == name).options(selectinload(CMSequence.steps))
        return (await self._session.execute(stmt)).scalar_one_or_none()

    async def list(self) -> list[CMSequence]:
        stmt = select(CMSequence).options(selectinload(CMSequence.steps)).order_by(CMSequence.id.desc())
        return list((await self._session.execute(stmt)).scalars().all())

    async def create(self, **fields: Any) -> CMSequence:
        steps = fields.pop("steps", [])
        row = CMSequence(**fields)
        self._session.add(row)
        await self._session.flush()
        for idx, step_in in enumerate(steps):
            self._session.add(
                CMSequenceStep(
                    sequence_id=row.id,
                    step_index=idx,
                    template_id=step_in["template_id"],
                    delay_days=step_in.get("delay_days", 0),
                    delay_hours=step_in.get("delay_hours", 0),
                    condition=step_in.get("condition"),
                )
            )
        await self._session.flush()
        return await self.get(row.id) or row

    async def update(self, sequence_id: int, **fields: Any) -> Optional[CMSequence]:
        row = await self.get(sequence_id, with_steps=False)
        if row is None:
            return None
        for k, v in fields.items():
            if v is not None:
                setattr(row, k, v)
        await self._session.flush()
        return await self.get(sequence_id)

    async def delete(self, sequence_id: int) -> bool:
        row = await self.get(sequence_id, with_steps=False)
        if row is None:
            return False
        await self._session.delete(row)
        await self._session.flush()
        return True

    async def add_step(self, sequence_id: int, **fields: Any) -> Optional[CMSequenceStep]:
        seq = await self.get(sequence_id)
        if seq is None:
            return None
        next_index = (max((s.step_index for s in seq.steps), default=-1)) + 1
        step = CMSequenceStep(
            sequence_id=sequence_id,
            step_index=next_index,
            template_id=fields["template_id"],
            delay_days=fields.get("delay_days", 0),
            delay_hours=fields.get("delay_hours", 0),
            condition=fields.get("condition"),
        )
        self._session.add(step)
        await self._session.flush()
        return step

    async def remove_step(self, step_id: int) -> bool:
        step = await self._session.get(CMSequenceStep, step_id)
        if step is None:
            return False
        await self._session.delete(step)
        await self._session.flush()
        return True
