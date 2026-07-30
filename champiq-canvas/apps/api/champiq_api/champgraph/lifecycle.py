"""Prospect lifecycle state machine (ChampIQ build-spec scope this cycle).

    Researched -> InCadence -> Engaged -> Replied -> Qualified -> MeetingBooked

`Exhausted -> CommitteeEscalation` is a defined-but-unused stub: the states
exist so the enum documents the intended future shape, but nothing in this
codebase drives a prospect into EXHAUSTED yet and there is no committee-
escalation logic (out of scope this cycle — do not build it just because
the state exists).

CMProspect (champmail.models, table `champmail_prospects`) is the prospect
record everything else in the system already keys off of (champgraph's own
create_prospect/list_prospects/get_prospect_status all operate on it). This
module adds a *separate* one-row-per-prospect table for lifecycle state
rather than a column on CMProspect: lifecycle is a ChampIQ orchestration
concept, not part of ChampMail's own deliverability status (active/bounced/
unsubscribed/replied), so it stays out of ChampMail's table.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base

log = logging.getLogger(__name__)


class ProspectState(str, Enum):
    RESEARCHED = "researched"
    IN_CADENCE = "in_cadence"
    ENGAGED = "engaged"
    REPLIED = "replied"
    QUALIFIED = "qualified"
    MEETING_BOOKED = "meeting_booked"
    # Stub only (SUGGESTIONS build-spec) — no trigger reaches EXHAUSTED yet and
    # no escalation logic exists downstream of it.
    EXHAUSTED = "exhausted"
    COMMITTEE_ESCALATION = "committee_escalation"


# Forward-only edges — anything not listed here is an invalid jump (e.g.
# Researched -> MeetingBooked directly).
_TRANSITIONS: dict[ProspectState, frozenset[ProspectState]] = {
    ProspectState.RESEARCHED: frozenset({ProspectState.IN_CADENCE}),
    ProspectState.IN_CADENCE: frozenset({ProspectState.ENGAGED, ProspectState.EXHAUSTED}),
    ProspectState.ENGAGED: frozenset({ProspectState.REPLIED, ProspectState.EXHAUSTED}),
    ProspectState.REPLIED: frozenset({ProspectState.QUALIFIED, ProspectState.EXHAUSTED}),
    ProspectState.QUALIFIED: frozenset({ProspectState.MEETING_BOOKED, ProspectState.EXHAUSTED}),
    ProspectState.MEETING_BOOKED: frozenset(),
    ProspectState.EXHAUSTED: frozenset({ProspectState.COMMITTEE_ESCALATION}),
    ProspectState.COMMITTEE_ESCALATION: frozenset(),
}


class InvalidTransition(ValueError):
    """Raised for any non-forward or unknown-state transition attempt."""


def next_state(current: str, target: str) -> ProspectState:
    """Validate current -> target. Returns the validated target state.

    Raises InvalidTransition for an unknown state name or a jump that isn't
    in `_TRANSITIONS` (including re-entering the current state).
    """
    try:
        cur = ProspectState(current)
    except ValueError:
        raise InvalidTransition(f"prospect_lifecycle: unknown current state {current!r}") from None
    try:
        tgt = ProspectState(target)
    except ValueError:
        raise InvalidTransition(f"prospect_lifecycle: unknown target state {target!r}") from None
    allowed = _TRANSITIONS.get(cur, frozenset())
    if tgt not in allowed:
        raise InvalidTransition(
            f"prospect_lifecycle: {cur.value} -> {tgt.value} is not a valid transition "
            f"(allowed: {sorted(s.value for s in allowed)})"
        )
    return tgt


class ProspectLifecycleTable(Base):
    __tablename__ = "prospect_lifecycle"

    prospect_id: Mapped[int] = mapped_column(
        ForeignKey("champmail_prospects.id", ondelete="CASCADE"), primary_key=True
    )
    state: Mapped[str] = mapped_column(String(32), default=ProspectState.RESEARCHED.value, index=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class ProspectLifecycleRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(self, prospect_id: int) -> Optional[ProspectLifecycleTable]:
        return await self._session.get(ProspectLifecycleTable, prospect_id)

    async def ensure(self, prospect_id: int) -> ProspectLifecycleTable:
        """Get-or-create, defaulting a never-seen prospect to RESEARCHED."""
        row = await self.get(prospect_id)
        if row is None:
            row = ProspectLifecycleTable(prospect_id=prospect_id, state=ProspectState.RESEARCHED.value)
            self._session.add(row)
            await self._session.flush()
        return row

    async def transition(self, prospect_id: int, target: str) -> ProspectLifecycleTable:
        """Move a prospect forward. Raises InvalidTransition on an invalid jump —
        callers driving this off best-effort bus events should catch it and
        treat it as a no-op (e.g. a second 'opened' event after already Engaged)."""
        row = await self.ensure(prospect_id)
        validated = next_state(row.state, target)
        row.state = validated.value
        row.updated_at = datetime.now(timezone.utc)
        await self._session.flush()
        return row
