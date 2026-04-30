"""Enrollment lifecycle endpoints — enroll, pause, resume, complete."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from ...database import get_db
from ..repositories import EnrollmentRepository
from ..schemas import EnrollmentIn, EnrollmentOut
from ..services import EnrollmentService

router = APIRouter(prefix="/champmail/enrollments", tags=["champmail:enrollments"])


@router.post("", response_model=EnrollmentOut, status_code=201)
async def enroll(body: EnrollmentIn, db: AsyncSession = Depends(get_db)):
    svc = EnrollmentService(db)
    try:
        en = await svc.enroll(prospect_id=body.prospect_id, sequence_id=body.sequence_id)
    except ValueError as e:
        raise HTTPException(404, str(e))
    await db.commit()
    return EnrollmentOut.model_validate(en)


@router.get("/{enrollment_id}", response_model=EnrollmentOut)
async def get_enrollment(enrollment_id: int, db: AsyncSession = Depends(get_db)):
    repo = EnrollmentRepository(db)
    row = await repo.get(enrollment_id)
    if row is None:
        raise HTTPException(404, "enrollment not found")
    return EnrollmentOut.model_validate(row)


@router.post("/{enrollment_id}/pause", response_model=EnrollmentOut)
async def pause(enrollment_id: int, db: AsyncSession = Depends(get_db)):
    svc = EnrollmentService(db)
    row = await svc.pause(enrollment_id)
    if row is None:
        raise HTTPException(404, "enrollment not found")
    await db.commit()
    return EnrollmentOut.model_validate(row)


@router.post("/{enrollment_id}/resume", response_model=EnrollmentOut)
async def resume(enrollment_id: int, db: AsyncSession = Depends(get_db)):
    svc = EnrollmentService(db)
    row = await svc.resume(enrollment_id)
    if row is None:
        raise HTTPException(404, "enrollment not found")
    await db.commit()
    return EnrollmentOut.model_validate(row)


@router.post("/{enrollment_id}/complete", response_model=EnrollmentOut)
async def complete(enrollment_id: int, db: AsyncSession = Depends(get_db)):
    svc = EnrollmentService(db)
    row = await svc.complete(enrollment_id)
    if row is None:
        raise HTTPException(404, "enrollment not found")
    await db.commit()
    return EnrollmentOut.model_validate(row)
