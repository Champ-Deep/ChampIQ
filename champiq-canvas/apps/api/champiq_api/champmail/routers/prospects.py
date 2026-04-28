"""Prospects CRUD."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from ...database import get_db
from ..repositories import ProspectRepository
from ..schemas import ProspectIn, ProspectOut, ProspectUpdate

router = APIRouter(prefix="/champmail/prospects", tags=["champmail:prospects"])


@router.get("", response_model=dict)
async def list_prospects(
    db: AsyncSession = Depends(get_db),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    status: Optional[str] = None,
    search: Optional[str] = None,
):
    repo = ProspectRepository(db)
    items, total = await repo.list(limit=limit, offset=offset, status=status, search=search)
    return {
        "items": [ProspectOut.model_validate(p).model_dump() for p in items],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.post("", response_model=ProspectOut, status_code=201)
async def create_prospect(body: ProspectIn, db: AsyncSession = Depends(get_db)):
    repo = ProspectRepository(db)
    if await repo.get_by_email(body.email):
        raise HTTPException(409, f"Prospect with email {body.email} already exists")
    row = await repo.create(**body.model_dump())
    await db.commit()
    return ProspectOut.model_validate(row)


@router.get("/{prospect_id}", response_model=ProspectOut)
async def get_prospect(prospect_id: int, db: AsyncSession = Depends(get_db)):
    repo = ProspectRepository(db)
    row = await repo.get(prospect_id)
    if row is None:
        raise HTTPException(404, "prospect not found")
    return ProspectOut.model_validate(row)


@router.get("/by-email/{email}", response_model=ProspectOut)
async def get_prospect_by_email(email: str, db: AsyncSession = Depends(get_db)):
    repo = ProspectRepository(db)
    row = await repo.get_by_email(email)
    if row is None:
        raise HTTPException(404, "prospect not found")
    return ProspectOut.model_validate(row)


@router.patch("/{prospect_id}", response_model=ProspectOut)
async def update_prospect(prospect_id: int, body: ProspectUpdate, db: AsyncSession = Depends(get_db)):
    repo = ProspectRepository(db)
    row = await repo.update(prospect_id, **body.model_dump(exclude_unset=True))
    if row is None:
        raise HTTPException(404, "prospect not found")
    await db.commit()
    return ProspectOut.model_validate(row)


@router.delete("/{prospect_id}")
async def delete_prospect(prospect_id: int, db: AsyncSession = Depends(get_db)):
    repo = ProspectRepository(db)
    ok = await repo.delete(prospect_id)
    if not ok:
        raise HTTPException(404, "prospect not found")
    await db.commit()
    return {"deleted": prospect_id}
