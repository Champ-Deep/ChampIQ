"""Sequences CRUD + step management."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from ...database import get_db
from ..repositories import SequenceRepository
from ..schemas import SequenceIn, SequenceOut, SequenceStepIn, SequenceStepOut, SequenceUpdate

router = APIRouter(prefix="/champmail/sequences", tags=["champmail:sequences"])


@router.get("", response_model=list[SequenceOut])
async def list_sequences(db: AsyncSession = Depends(get_db)):
    repo = SequenceRepository(db)
    return [SequenceOut.model_validate(r) for r in await repo.list()]


@router.post("", response_model=SequenceOut, status_code=201)
async def create_sequence(body: SequenceIn, db: AsyncSession = Depends(get_db)):
    repo = SequenceRepository(db)
    if await repo.get_by_name(body.name):
        raise HTTPException(409, f"sequence named {body.name!r} already exists")
    payload = body.model_dump()
    payload["steps"] = [s for s in payload.get("steps", [])]
    row = await repo.create(**payload)
    await db.commit()
    return SequenceOut.model_validate(row)


@router.get("/{sequence_id}", response_model=SequenceOut)
async def get_sequence(sequence_id: int, db: AsyncSession = Depends(get_db)):
    repo = SequenceRepository(db)
    row = await repo.get(sequence_id)
    if row is None:
        raise HTTPException(404, "sequence not found")
    return SequenceOut.model_validate(row)


@router.patch("/{sequence_id}", response_model=SequenceOut)
async def update_sequence(sequence_id: int, body: SequenceUpdate, db: AsyncSession = Depends(get_db)):
    repo = SequenceRepository(db)
    row = await repo.update(sequence_id, **body.model_dump(exclude_unset=True))
    if row is None:
        raise HTTPException(404, "sequence not found")
    await db.commit()
    return SequenceOut.model_validate(row)


@router.delete("/{sequence_id}")
async def delete_sequence(sequence_id: int, db: AsyncSession = Depends(get_db)):
    repo = SequenceRepository(db)
    ok = await repo.delete(sequence_id)
    if not ok:
        raise HTTPException(404, "sequence not found")
    await db.commit()
    return {"deleted": sequence_id}


@router.post("/{sequence_id}/steps", response_model=SequenceStepOut, status_code=201)
async def add_step(sequence_id: int, body: SequenceStepIn, db: AsyncSession = Depends(get_db)):
    repo = SequenceRepository(db)
    step = await repo.add_step(sequence_id, **body.model_dump())
    if step is None:
        raise HTTPException(404, "sequence not found")
    await db.commit()
    return SequenceStepOut.model_validate(step)


@router.delete("/steps/{step_id}")
async def remove_step(step_id: int, db: AsyncSession = Depends(get_db)):
    repo = SequenceRepository(db)
    ok = await repo.remove_step(step_id)
    if not ok:
        raise HTTPException(404, "step not found")
    await db.commit()
    return {"deleted": step_id}
