"""Credential CRUD. Never returns decrypted values."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from ..container import get_container
from ..credentials import CredentialService
from ..database import get_db
from ..models import CredentialIn, CredentialOut

router = APIRouter()


def _service(db: AsyncSession) -> CredentialService:
    return CredentialService(db, get_container().crypto)


@router.get("/credentials", response_model=list[CredentialOut])
async def list_credentials(db: AsyncSession = Depends(get_db)):
    return await _service(db).list()


@router.post("/credentials", response_model=CredentialOut)
async def create_credential(body: CredentialIn, db: AsyncSession = Depends(get_db)):
    row = await _service(db).create(body.name, body.type, body.data)
    return row


@router.put("/credentials/{cred_id}", response_model=CredentialOut)
async def update_credential(cred_id: int, body: CredentialIn, db: AsyncSession = Depends(get_db)):
    try:
        row = await _service(db).update(cred_id, body.data)
    except KeyError:
        raise HTTPException(404, "credential not found")
    return row


@router.delete("/credentials/{cred_id}")
async def delete_credential(cred_id: int, db: AsyncSession = Depends(get_db)):
    await _service(db).delete(cred_id)
    return {"deleted": cred_id}
