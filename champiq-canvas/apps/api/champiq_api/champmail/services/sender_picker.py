"""SenderPicker — round-robin across enabled senders, respecting daily caps.

Strategy: pick the enabled sender with the most remaining capacity today
(least-used wins). Returns None if all senders exhausted.
"""
from __future__ import annotations

import logging
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from ..models import CMSender
from ..repositories import SenderRepository

log = logging.getLogger(__name__)


class SenderPicker:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._senders = SenderRepository(session)

    async def next_available(self) -> Optional[CMSender]:
        candidates = await self._senders.list(enabled_only=True)
        if not candidates:
            log.warning("SenderPicker: no enabled senders configured")
            return None

        ranked: list[tuple[int, CMSender]] = []
        for s in candidates:
            sent_today = await self._senders.todays_send_count(s.id)
            remaining = max(0, s.daily_cap - sent_today)
            if remaining > 0:
                ranked.append((remaining, s))

        if not ranked:
            log.info("SenderPicker: all senders exhausted today")
            return None

        # Pick the sender with the most remaining capacity.
        # Tie-break by id ascending (deterministic — easier to debug than random).
        ranked.sort(key=lambda r: (-r[0], r[1].id))
        return ranked[0][1]
