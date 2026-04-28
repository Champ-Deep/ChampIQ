"""Pydantic IO contracts for ChampMail.

One *In schema per write entry point, one *Out schema per read entry point.
Routers map to/from ORM via these — never expose ORM types directly.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, EmailStr, Field


# ---------------------------------------------------------------- Prospects --

class ProspectIn(BaseModel):
    email: EmailStr
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    company: Optional[str] = None
    title: Optional[str] = None
    phone: Optional[str] = None
    linkedin_url: Optional[str] = None
    timezone: str = "UTC"
    custom_fields: dict[str, Any] = Field(default_factory=dict)


class ProspectUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    company: Optional[str] = None
    title: Optional[str] = None
    phone: Optional[str] = None
    linkedin_url: Optional[str] = None
    timezone: Optional[str] = None
    status: Optional[str] = None
    custom_fields: Optional[dict[str, Any]] = None


class ProspectOut(BaseModel):
    id: int
    email: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    company: Optional[str] = None
    title: Optional[str] = None
    phone: Optional[str] = None
    linkedin_url: Optional[str] = None
    timezone: str
    status: str
    custom_fields: dict[str, Any]
    last_opened_at: Optional[datetime] = None
    last_clicked_at: Optional[datetime] = None
    last_replied_at: Optional[datetime] = None
    last_sent_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


# ------------------------------------------------------------------ Senders --

class SenderIn(BaseModel):
    name: str
    from_email: EmailStr
    from_name: str
    emelia_sender_id: str
    daily_cap: int = 100
    enabled: bool = True


class SenderUpdate(BaseModel):
    name: Optional[str] = None
    from_email: Optional[EmailStr] = None
    from_name: Optional[str] = None
    emelia_sender_id: Optional[str] = None
    daily_cap: Optional[int] = None
    enabled: Optional[bool] = None


class SenderOut(BaseModel):
    id: int
    name: str
    from_email: str
    from_name: str
    emelia_sender_id: str
    daily_cap: int
    enabled: bool
    consecutive_bounces: int
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


# ---------------------------------------------------------------- Templates --

class TemplateIn(BaseModel):
    name: str
    subject: str
    body_html: str
    body_text: Optional[str] = None


class TemplateUpdate(BaseModel):
    name: Optional[str] = None
    subject: Optional[str] = None
    body_html: Optional[str] = None
    body_text: Optional[str] = None


class TemplateOut(BaseModel):
    id: int
    name: str
    subject: str
    body_html: str
    body_text: Optional[str] = None
    variables: list[str]
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


class TemplatePreviewIn(BaseModel):
    template_id: int
    variables: dict[str, Any] = Field(default_factory=dict)


class TemplatePreviewOut(BaseModel):
    subject: str
    body_html: str
    body_text: Optional[str] = None


# ---------------------------------------------------------------- Sequences --

class SequenceStepIn(BaseModel):
    template_id: int
    delay_days: int = 0
    delay_hours: int = 0
    condition: Optional[dict[str, Any]] = None


class SequenceStepOut(SequenceStepIn):
    id: int
    sequence_id: int
    step_index: int
    model_config = {"from_attributes": True}


class SequenceIn(BaseModel):
    name: str
    description: Optional[str] = None
    timezone: str = "UTC"
    working_hours_start: int = 9
    working_hours_end: int = 17
    enabled: bool = True
    steps: list[SequenceStepIn] = Field(default_factory=list)


class SequenceUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    timezone: Optional[str] = None
    working_hours_start: Optional[int] = None
    working_hours_end: Optional[int] = None
    enabled: Optional[bool] = None


class SequenceOut(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    timezone: str
    working_hours_start: int
    working_hours_end: int
    enabled: bool
    created_at: datetime
    updated_at: datetime
    steps: list[SequenceStepOut] = Field(default_factory=list)
    model_config = {"from_attributes": True}


# -------------------------------------------------------------- Enrollments --

class EnrollmentIn(BaseModel):
    prospect_id: int
    sequence_id: int


class EnrollmentOut(BaseModel):
    id: int
    prospect_id: int
    sequence_id: int
    current_step_index: int
    status: str
    next_step_at: Optional[datetime] = None
    enrolled_at: datetime
    paused_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    model_config = {"from_attributes": True}


# -------------------------------------------------------------------- Sends --

class SingleSendIn(BaseModel):
    """Fire-once send (no sequence). Pick a sender via the round-robin pool
    unless `sender_id` is explicitly provided."""
    prospect_id: int
    template_id: int
    sender_id: Optional[int] = None
    variables: dict[str, Any] = Field(default_factory=dict)


class SendOut(BaseModel):
    id: int
    enrollment_id: Optional[int] = None
    step_id: Optional[int] = None
    template_id: Optional[int] = None
    sender_id: int
    prospect_id: int
    idempotency_key: str
    emelia_message_id: Optional[str] = None
    subject_rendered: str
    body_html_rendered: str
    status: str
    sent_at: Optional[datetime] = None
    failed_reason: Optional[str] = None
    created_at: datetime
    model_config = {"from_attributes": True}


# ------------------------------------------------------------------- Events --

class EventOut(BaseModel):
    id: int
    send_id: Optional[int] = None
    prospect_id: int
    event_type: str
    metadata_json: dict[str, Any] = Field(default_factory=dict, alias="metadata")
    occurred_at: datetime
    model_config = {"from_attributes": True, "populate_by_name": True}


# ----------------------------------------------------------------- Webhooks --

class EmeliaWebhookIn(BaseModel):
    """Raw Emelia webhook payload — minimal type so we don't break on schema drift."""
    event: str
    data: dict[str, Any] = Field(default_factory=dict)


# ---------------------------------------------------------------- Analytics --

class SequenceAnalyticsOut(BaseModel):
    sequence_id: int
    enrollments_total: int
    enrollments_active: int
    sends_total: int
    sends_failed: int
    opens: int
    clicks: int
    replies: int
    bounces: int
    unsubscribes: int
    open_rate: float
    click_rate: float
    reply_rate: float
    bounce_rate: float
