from __future__ import annotations

from typing import Any, Optional

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import CMEnrollment, CMEvent, CMSend


class EventRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(
        self,
        *,
        prospect_id: int,
        event_type: str,
        send_id: Optional[int] = None,
        metadata: Optional[dict[str, Any]] = None,
        provider: Optional[str] = None,
        provider_event_id: Optional[str] = None,
    ) -> Optional[CMEvent]:
        """Insert an event row. Returns None when the (provider, provider_event_id,
        event_type) tuple already exists — i.e. the webhook is a retry of a
        previously-ingested event. The unique partial index defined in alembic
        0006 only catches rows where `provider_event_id` is non-null, so callers
        without a provider id still get a fresh row every time (preserves the
        old behavior for events that don't carry a stable id).
        """
        if provider_event_id and provider:
            stmt = (
                pg_insert(CMEvent)
                .values(
                    prospect_id=prospect_id,
                    event_type=event_type,
                    send_id=send_id,
                    metadata_json=metadata or {},
                    provider=provider,
                    provider_event_id=provider_event_id,
                )
                # Match the named unique constraint from alembic 0006. Using
                # constraint= rather than index_elements= avoids ambiguity
                # with any future indexes on the same columns.
                .on_conflict_do_nothing(constraint="uq_event_provider_eid")
                .returning(CMEvent.id)
            )
            inserted_id = (await self._session.execute(stmt)).scalar_one_or_none()
            if inserted_id is None:
                return None
            return await self._session.get(CMEvent, inserted_id)

        row = CMEvent(
            prospect_id=prospect_id,
            event_type=event_type,
            send_id=send_id,
            metadata_json=metadata or {},
            provider=provider,
            provider_event_id=provider_event_id,
        )
        self._session.add(row)
        await self._session.flush()
        return row

    async def list_for_prospect(self, prospect_id: int, limit: int = 50) -> list[CMEvent]:
        stmt = (
            select(CMEvent)
            .where(CMEvent.prospect_id == prospect_id)
            .order_by(CMEvent.occurred_at.desc())
            .limit(limit)
        )
        return list((await self._session.execute(stmt)).scalars().all())

    async def aggregates_for_sequence(self, sequence_id: int) -> dict[str, int]:
        """Aggregate counts (opens, clicks, replies, bounces, unsubscribes) for a sequence.
        Joins events → sends → enrollments to filter by sequence_id.
        """
        stmt = (
            select(CMEvent.event_type, func.count())
            .join(CMSend, CMEvent.send_id == CMSend.id)
            .join(CMEnrollment, CMSend.enrollment_id == CMEnrollment.id)
            .where(CMEnrollment.sequence_id == sequence_id)
            .group_by(CMEvent.event_type)
        )
        rows = (await self._session.execute(stmt)).all()
        return {row[0]: int(row[1]) for row in rows}
