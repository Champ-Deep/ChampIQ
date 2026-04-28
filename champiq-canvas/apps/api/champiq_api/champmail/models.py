"""ChampMail SQLAlchemy ORM models.

Single-tenant by design (no team_id). All entities live in the existing
ChampIQ Postgres database under the `champmail_*` table prefix to avoid
collisions with the orchestrator's own tables.

Status enums use plain strings (CHECK constraint at the DB level rather than
Postgres ENUM types) so adding a new status doesn't require a migration on
the type definition itself.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base


# Status string constants — exposed for service-layer use
PROSPECT_STATUSES = ("active", "bounced", "unsubscribed", "replied")
ENROLLMENT_STATUSES = ("active", "paused", "completed", "bounced", "replied", "unsubscribed")
SEND_STATUSES = ("pending", "sent", "failed", "bounced")
EVENT_TYPES = ("sent", "opened", "clicked", "replied", "bounced", "unsubscribed", "failed")


class CMProspect(Base):
    __tablename__ = "champmail_prospects"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    first_name: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    last_name: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    company: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    title: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    linkedin_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    timezone: Mapped[str] = mapped_column(String(64), default="UTC")
    status: Mapped[str] = mapped_column(String(32), default="active", index=True)
    custom_fields: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)

    last_opened_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_clicked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_replied_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        CheckConstraint(f"status in {PROSPECT_STATUSES!r}", name="ck_champmail_prospects_status"),
    )


class CMSender(Base):
    __tablename__ = "champmail_senders"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True)
    from_email: Mapped[str] = mapped_column(String(320))
    from_name: Mapped[str] = mapped_column(String(255))
    emelia_sender_id: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    daily_cap: Mapped[int] = mapped_column(Integer, default=100)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    consecutive_bounces: Mapped[int] = mapped_column(Integer, default=0)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class CMTemplate(Base):
    __tablename__ = "champmail_templates"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    subject: Mapped[str] = mapped_column(String(500))
    body_html: Mapped[str] = mapped_column(Text)
    body_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # variables auto-extracted from {{ var }} usages — kept for the UI variable picker
    variables: Mapped[list[str]] = mapped_column(JSONB, default=list)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class CMSequence(Base):
    __tablename__ = "champmail_sequences"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    timezone: Mapped[str] = mapped_column(String(64), default="UTC")
    working_hours_start: Mapped[int] = mapped_column(Integer, default=9)  # 0-23
    working_hours_end: Mapped[int] = mapped_column(Integer, default=17)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    steps: Mapped[list["CMSequenceStep"]] = relationship(
        "CMSequenceStep",
        back_populates="sequence",
        cascade="all, delete-orphan",
        order_by="CMSequenceStep.step_index",
    )


class CMSequenceStep(Base):
    __tablename__ = "champmail_sequence_steps"

    id: Mapped[int] = mapped_column(primary_key=True)
    sequence_id: Mapped[int] = mapped_column(ForeignKey("champmail_sequences.id", ondelete="CASCADE"), index=True)
    step_index: Mapped[int] = mapped_column(Integer)  # 0-based position in the sequence
    template_id: Mapped[int] = mapped_column(ForeignKey("champmail_templates.id"))
    delay_days: Mapped[int] = mapped_column(Integer, default=0)
    delay_hours: Mapped[int] = mapped_column(Integer, default=0)
    # condition shape: {"if": "previous.opened", "else_skip": true} — null = always send
    condition: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB, nullable=True)

    sequence: Mapped["CMSequence"] = relationship("CMSequence", back_populates="steps")

    __table_args__ = (
        UniqueConstraint("sequence_id", "step_index", name="uq_seq_step_index"),
    )


class CMEnrollment(Base):
    __tablename__ = "champmail_enrollments"

    id: Mapped[int] = mapped_column(primary_key=True)
    prospect_id: Mapped[int] = mapped_column(ForeignKey("champmail_prospects.id", ondelete="CASCADE"), index=True)
    sequence_id: Mapped[int] = mapped_column(ForeignKey("champmail_sequences.id", ondelete="CASCADE"), index=True)
    current_step_index: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(32), default="active", index=True)
    next_step_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, index=True)

    enrolled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    paused_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        # one prospect cannot be in the same sequence twice simultaneously
        UniqueConstraint("prospect_id", "sequence_id", name="uq_enrollment_prospect_sequence"),
        CheckConstraint(f"status in {ENROLLMENT_STATUSES!r}", name="ck_champmail_enrollments_status"),
        Index("ix_enrollment_due", "status", "next_step_at"),
    )


class CMSend(Base):
    __tablename__ = "champmail_sends"

    id: Mapped[int] = mapped_column(primary_key=True)
    enrollment_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("champmail_enrollments.id", ondelete="SET NULL"), nullable=True, index=True
    )
    step_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("champmail_sequence_steps.id", ondelete="SET NULL"), nullable=True
    )
    template_id: Mapped[Optional[int]] = mapped_column(ForeignKey("champmail_templates.id"), nullable=True)
    sender_id: Mapped[int] = mapped_column(ForeignKey("champmail_senders.id"))
    prospect_id: Mapped[int] = mapped_column(ForeignKey("champmail_prospects.id", ondelete="CASCADE"), index=True)

    # idempotency_key = sha1(enrollment_id, step_index) for sequence sends,
    # or sha1("oneoff", template_id, prospect_id, ts) for one-offs.
    idempotency_key: Mapped[str] = mapped_column(String(64), unique=True, index=True)

    emelia_message_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, index=True)
    subject_rendered: Mapped[str] = mapped_column(String(500))
    body_html_rendered: Mapped[str] = mapped_column(Text)

    status: Mapped[str] = mapped_column(String(32), default="pending", index=True)
    sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    failed_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        CheckConstraint(f"status in {SEND_STATUSES!r}", name="ck_champmail_sends_status"),
    )


class CMEvent(Base):
    __tablename__ = "champmail_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    send_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("champmail_sends.id", ondelete="CASCADE"), nullable=True, index=True
    )
    prospect_id: Mapped[int] = mapped_column(ForeignKey("champmail_prospects.id", ondelete="CASCADE"), index=True)
    event_type: Mapped[str] = mapped_column(String(32), index=True)
    metadata_json: Mapped[dict[str, Any]] = mapped_column("metadata", JSONB, default=dict)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        CheckConstraint(f"event_type in {EVENT_TYPES!r}", name="ck_champmail_events_type"),
        Index("ix_event_prospect_type", "prospect_id", "event_type"),
    )
