"""Senders CRUD — connected Emelia inboxes used for round-robin sending."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from ...database import get_db
from ..repositories import SenderRepository
from ..schemas import SenderIn, SenderOut, SenderUpdate

router = APIRouter(prefix="/champmail/senders", tags=["champmail:senders"])


@router.get("", response_model=list[SenderOut])
async def list_senders(db: AsyncSession = Depends(get_db), enabled_only: bool = False):
    repo = SenderRepository(db)
    rows = await repo.list(enabled_only=enabled_only)
    return [SenderOut.model_validate(r) for r in rows]


@router.post("", response_model=SenderOut, status_code=201)
async def create_sender(body: SenderIn, db: AsyncSession = Depends(get_db)):
    repo = SenderRepository(db)
    if await repo.get_by_emelia_id(body.emelia_sender_id):
        raise HTTPException(409, "sender with this emelia_sender_id already exists")
    row = await repo.create(**body.model_dump())
    await db.commit()
    return SenderOut.model_validate(row)


@router.get("/{sender_id}", response_model=SenderOut)
async def get_sender(sender_id: int, db: AsyncSession = Depends(get_db)):
    repo = SenderRepository(db)
    row = await repo.get(sender_id)
    if row is None:
        raise HTTPException(404, "sender not found")
    return SenderOut.model_validate(row)


@router.patch("/{sender_id}", response_model=SenderOut)
async def update_sender(sender_id: int, body: SenderUpdate, db: AsyncSession = Depends(get_db)):
    repo = SenderRepository(db)
    row = await repo.update(sender_id, **body.model_dump(exclude_unset=True))
    if row is None:
        raise HTTPException(404, "sender not found")
    await db.commit()
    return SenderOut.model_validate(row)


@router.delete("/{sender_id}")
async def delete_sender(sender_id: int, db: AsyncSession = Depends(get_db)):
    repo = SenderRepository(db)
    ok = await repo.delete(sender_id)
    if not ok:
        raise HTTPException(404, "sender not found")
    await db.commit()
    return {"deleted": sender_id}
