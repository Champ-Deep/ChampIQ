"""Resolve a MailTransport for a given sender at send time.

In v1 of ChampMail Inline the transport was a process-wide singleton built
from `EMELIA_API_KEY`. To support credential-driven Emelia accounts (so
different users can sign in with their own keys via the UI), each `CMSender`
now carries an optional `credential_id`. The factory looks the credential up,
caches the resulting transport in-memory, and falls back to the singleton
when no credential is bound.

Caching matters because `EmeliaTransport` holds an httpx client lifecycle —
we don't want one new TCP pool per send.
"""
from __future__ import annotations

import json
import logging
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from ...credentials.service import Crypto
from ...models import CredentialTable
from ..models import CMSender
from .base import MailTransport
from .emelia import EmeliaTransport
from .stub import StubTransport

log = logging.getLogger(__name__)


class MailTransportFactory:
    """Returns a MailTransport for a given sender.

    `default_transport` is the singleton used when a sender has no credential
    bound — keeps env-var-only deployments working unchanged.
    """

    def __init__(self, default_transport: MailTransport, crypto: Crypto) -> None:
        self._default = default_transport
        self._crypto = crypto
        self._cache: dict[int, MailTransport] = {}

    async def for_sender(self, sender: CMSender, session: AsyncSession) -> MailTransport:
        cred_id = getattr(sender, "credential_id", None)
        if cred_id is None:
            return self._default
        cached = self._cache.get(cred_id)
        if cached is not None:
            return cached
        transport = await self._build_from_credential(cred_id, session)
        if transport is None:
            log.warning(
                "sender %s references credential %s but it could not be resolved — "
                "falling back to default transport",
                sender.id, cred_id,
            )
            return self._default
        self._cache[cred_id] = transport
        return transport

    def invalidate(self, credential_id: int) -> None:
        """Drop a cached transport — call on credential update/delete."""
        self._cache.pop(credential_id, None)

    async def _build_from_credential(
        self, credential_id: int, session: AsyncSession
    ) -> Optional[MailTransport]:
        row = await session.get(CredentialTable, credential_id)
        if row is None:
            return None
        try:
            data = json.loads(self._crypto.decrypt(row.data_encrypted))
        except Exception:
            log.exception("MailTransportFactory: failed to decrypt credential %s", credential_id)
            return None

        api_key = (data or {}).get("api_key") or ""
        # Type discrimination is open-ended — for now Emelia is the only mail
        # provider, but a SendGrid/Postmark `type` would branch here.
        if not api_key:
            return StubTransport()
        return EmeliaTransport(api_key=api_key)
