"""Credential storage + resolution.

Split into three collaborators:
  - Crypto          (encryption algorithm — swappable: Fernet / Vault / KMS)
  - CredentialService (CRUD over the credentials table)
  - SqlCredentialResolver (implements core.CredentialResolver for orchestrator)

SRP: each class owns one reason to change.
"""
from __future__ import annotations

import json
from typing import Any, Protocol

from cryptography.fernet import Fernet
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from ..models import CredentialTable


class Crypto(Protocol):
    def encrypt(self, plaintext: str) -> str: ...
    def decrypt(self, ciphertext: str) -> str: ...


class FernetCrypto:
    def __init__(self, key: str) -> None:
        self._fernet = Fernet(key.encode() if isinstance(key, str) else key)

    def encrypt(self, plaintext: str) -> str:
        return self._fernet.encrypt(plaintext.encode()).decode()

    def decrypt(self, ciphertext: str) -> str:
        return self._fernet.decrypt(ciphertext.encode()).decode()


class CredentialService:
    """CRUD for credential records. UI-facing."""

    def __init__(self, session: AsyncSession, crypto: Crypto) -> None:
        self._session = session
        self._crypto = crypto

    async def create(self, name: str, type_: str, data: dict[str, Any]) -> CredentialTable:
        row = CredentialTable(
            name=name,
            type=type_,
            data_encrypted=self._crypto.encrypt(json.dumps(data)),
        )
        self._session.add(row)
        await self._session.commit()
        await self._session.refresh(row)
        return row

    async def update(self, cred_id: int, data: dict[str, Any]) -> CredentialTable:
        row = await self._session.get(CredentialTable, cred_id)
        if row is None:
            raise KeyError(cred_id)
        row.data_encrypted = self._crypto.encrypt(json.dumps(data))
        await self._session.commit()
        await self._session.refresh(row)
        return row

    async def list(self) -> list[CredentialTable]:
        result = await self._session.execute(select(CredentialTable).order_by(CredentialTable.id))
        return list(result.scalars().all())

    async def delete(self, cred_id: int) -> None:
        row = await self._session.get(CredentialTable, cred_id)
        if row is not None:
            await self._session.delete(row)
            await self._session.commit()


class SqlCredentialResolver:
    """Orchestrator-facing resolver. Opens its own short-lived session so
    executors don't share transactions with the API layer.
    """

    def __init__(self, session_factory: async_sessionmaker[AsyncSession], crypto: Crypto) -> None:
        self._session_factory = session_factory
        self._crypto = crypto

    async def resolve(self, name: str) -> dict[str, Any]:
        if not name:
            return {}
        async with self._session_factory() as session:
            result = await session.execute(
                select(CredentialTable).where(CredentialTable.name == name)
            )
            row = result.scalar_one_or_none()
        if row is None:
            raise KeyError(f"Credential {name!r} not found")
        return json.loads(self._crypto.decrypt(row.data_encrypted))

    async def resolve_by_type(self, type_: str) -> dict[str, Any]:
        """Resolve the first credential of a given type — fallback when name doesn't match."""
        async with self._session_factory() as session:
            result = await session.execute(
                select(CredentialTable).where(CredentialTable.type == type_).limit(1)
            )
            row = result.scalar_one_or_none()
        if row is None:
            raise KeyError(f"No credential of type {type_!r} found")
        return json.loads(self._crypto.decrypt(row.data_encrypted))
