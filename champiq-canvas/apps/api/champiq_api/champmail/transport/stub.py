"""Stub transport — captures sends in memory. For tests and dev.

Use when EMELIA_API_KEY isn't set or for unit tests that shouldn't hit
the real provider.
"""
from __future__ import annotations

import uuid

from .base import EmailEnvelope, SendResult


class StubTransport:
    name = "stub"

    def __init__(self) -> None:
        self.sent: list[tuple[str, EmailEnvelope]] = []  # (sender_id, envelope) pairs

    async def send(self, envelope: EmailEnvelope, *, sender_id: str) -> SendResult:
        self.sent.append((sender_id, envelope))
        return SendResult(success=True, provider_message_id=f"stub_{uuid.uuid4().hex[:12]}")

    async def verify(self) -> bool:
        return True
