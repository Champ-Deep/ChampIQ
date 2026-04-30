"""App-settings CRUD — currently exposes only the email engine switcher.

Why a dedicated router instead of stuffing it into /credentials?
    SRP. /credentials owns the secret-bearing rows (CRUD over the credentials
    table). /settings owns toggles and pointers between them. The Settings page
    in the frontend talks to both, but each endpoint has one reason to change.

Why one row keyed "default"?
    Same pattern as `canvas_state` — a single configuration row that's just
    easier to PATCH than a dozen scattered env vars or a key/value table. When
    multi-tenancy lands the row gets a tenant_id column and the singleton key
    is replaced.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import AppSettingsIn, AppSettingsOut, AppSettingsTable, CredentialTable

router = APIRouter()


_DEFAULT_KEY = "default"
_VALID_PROVIDERS = {"emelia", "champmail_native"}


async def _load_or_init(db: AsyncSession) -> AppSettingsTable:
    row = (
        await db.execute(select(AppSettingsTable).where(AppSettingsTable.id == _DEFAULT_KEY))
    ).scalar_one_or_none()
    if row is None:
        row = AppSettingsTable(id=_DEFAULT_KEY)
        db.add(row)
        await db.flush()
    return row


@router.get("/settings", response_model=AppSettingsOut)
async def get_settings(db: AsyncSession = Depends(get_db)) -> AppSettingsTable:
    return await _load_or_init(db)


@router.put("/settings", response_model=AppSettingsOut)
async def update_settings(
    body: AppSettingsIn, db: AsyncSession = Depends(get_db)
) -> AppSettingsTable:
    row = await _load_or_init(db)

    if body.default_engine_provider is not None:
        if body.default_engine_provider not in _VALID_PROVIDERS:
            raise HTTPException(
                400,
                f"unknown engine provider {body.default_engine_provider!r} "
                f"— allowed: {sorted(_VALID_PROVIDERS)}",
            )
        row.default_engine_provider = body.default_engine_provider

    if body.default_email_credential_id is not None:
        # Validate the FK target exists and is the right type. We accept any
        # email-engine-shaped credential type so the user can switch between
        # multiple Emelia rows (or future champmail_native rows) freely.
        cred = await db.get(CredentialTable, body.default_email_credential_id)
        if cred is None:
            raise HTTPException(404, "credential not found")
        if cred.type not in {"champmail", "champmail_native"}:
            raise HTTPException(
                400,
                f"credential type {cred.type!r} is not an email engine "
                "(expected 'champmail' or 'champmail_native')",
            )
        row.default_email_credential_id = body.default_email_credential_id

    await db.commit()
    await db.refresh(row)
    return row
