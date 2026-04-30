"""Per-sequence analytics — opens, clicks, replies, bounces, unsubscribes."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ...database import get_db
from ..models import CMEnrollment
from ..repositories import EventRepository, SendRepository, SequenceRepository
from ..schemas import SequenceAnalyticsOut

router = APIRouter(prefix="/champmail/analytics", tags=["champmail:analytics"])


@router.get("/sequences/{sequence_id}", response_model=SequenceAnalyticsOut)
async def sequence_analytics(sequence_id: int, db: AsyncSession = Depends(get_db)):
    seq_repo = SequenceRepository(db)
    sequence = await seq_repo.get(sequence_id, with_steps=False)
    if sequence is None:
        raise HTTPException(404, "sequence not found")

    sends_total = await SendRepository(db).count_for_sequence(sequence_id)
    counts = await EventRepository(db).aggregates_for_sequence(sequence_id)

    enrollments_total = int(
        (await db.execute(
            select(func.count()).select_from(CMEnrollment).where(CMEnrollment.sequence_id == sequence_id)
        )).scalar_one()
    )
    enrollments_active = int(
        (await db.execute(
            select(func.count()).select_from(CMEnrollment).where(
                CMEnrollment.sequence_id == sequence_id, CMEnrollment.status == "active"
            )
        )).scalar_one()
    )

    opens = counts.get("opened", 0)
    clicks = counts.get("clicked", 0)
    replies = counts.get("replied", 0)
    bounces = counts.get("bounced", 0)
    unsubs = counts.get("unsubscribed", 0)
    failed = counts.get("failed", 0)

    def _rate(num: int, den: int) -> float:
        return round(num / den, 4) if den > 0 else 0.0

    return SequenceAnalyticsOut(
        sequence_id=sequence_id,
        enrollments_total=enrollments_total,
        enrollments_active=enrollments_active,
        sends_total=sends_total,
        sends_failed=failed,
        opens=opens,
        clicks=clicks,
        replies=replies,
        bounces=bounces,
        unsubscribes=unsubs,
        open_rate=_rate(opens, sends_total),
        click_rate=_rate(clicks, sends_total),
        reply_rate=_rate(replies, sends_total),
        bounce_rate=_rate(bounces, sends_total),
    )
