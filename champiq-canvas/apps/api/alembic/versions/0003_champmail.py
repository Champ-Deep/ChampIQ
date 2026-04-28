"""champmail tables: prospects, senders, templates, sequences, sequence_steps, enrollments, sends, events

Revision ID: 0003
Revises: 0002
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


PROSPECT_STATUSES = ("active", "bounced", "unsubscribed", "replied")
ENROLLMENT_STATUSES = ("active", "paused", "completed", "bounced", "replied", "unsubscribed")
SEND_STATUSES = ("pending", "sent", "failed", "bounced")
EVENT_TYPES = ("sent", "opened", "clicked", "replied", "bounced", "unsubscribed", "failed")


def _in_list(col, values):
    """Render a CHECK constraint expression like `col in ('a','b','c')`."""
    rendered = ", ".join(f"'{v}'" for v in values)
    return f"{col} in ({rendered})"


def upgrade() -> None:
    # Prospects ---------------------------------------------------------------
    op.create_table(
        "champmail_prospects",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("email", sa.String(320), nullable=False, unique=True, index=True),
        sa.Column("first_name", sa.String(120), nullable=True),
        sa.Column("last_name", sa.String(120), nullable=True),
        sa.Column("company", sa.String(255), nullable=True),
        sa.Column("title", sa.String(255), nullable=True),
        sa.Column("phone", sa.String(64), nullable=True),
        sa.Column("linkedin_url", sa.String(500), nullable=True),
        sa.Column("timezone", sa.String(64), nullable=False, server_default="UTC"),
        sa.Column("status", sa.String(32), nullable=False, server_default="active", index=True),
        sa.Column("custom_fields", JSONB(), nullable=False, server_default="{}"),
        sa.Column("last_opened_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_clicked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_replied_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(_in_list("status", PROSPECT_STATUSES), name="ck_champmail_prospects_status"),
    )

    # Senders -----------------------------------------------------------------
    op.create_table(
        "champmail_senders",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(120), nullable=False, unique=True),
        sa.Column("from_email", sa.String(320), nullable=False),
        sa.Column("from_name", sa.String(255), nullable=False),
        sa.Column("emelia_sender_id", sa.String(120), nullable=False, unique=True, index=True),
        sa.Column("daily_cap", sa.Integer(), nullable=False, server_default="100"),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true(), index=True),
        sa.Column("consecutive_bounces", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )

    # Templates ---------------------------------------------------------------
    op.create_table(
        "champmail_templates",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False, unique=True, index=True),
        sa.Column("subject", sa.String(500), nullable=False),
        sa.Column("body_html", sa.Text(), nullable=False),
        sa.Column("body_text", sa.Text(), nullable=True),
        sa.Column("variables", JSONB(), nullable=False, server_default="[]"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )

    # Sequences ---------------------------------------------------------------
    op.create_table(
        "champmail_sequences",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False, unique=True, index=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("timezone", sa.String(64), nullable=False, server_default="UTC"),
        sa.Column("working_hours_start", sa.Integer(), nullable=False, server_default="9"),
        sa.Column("working_hours_end", sa.Integer(), nullable=False, server_default="17"),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )

    # Sequence steps ----------------------------------------------------------
    op.create_table(
        "champmail_sequence_steps",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "sequence_id",
            sa.Integer(),
            sa.ForeignKey("champmail_sequences.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("step_index", sa.Integer(), nullable=False),
        sa.Column("template_id", sa.Integer(), sa.ForeignKey("champmail_templates.id"), nullable=False),
        sa.Column("delay_days", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("delay_hours", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("condition", JSONB(), nullable=True),
        sa.UniqueConstraint("sequence_id", "step_index", name="uq_seq_step_index"),
    )

    # Enrollments -------------------------------------------------------------
    op.create_table(
        "champmail_enrollments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "prospect_id",
            sa.Integer(),
            sa.ForeignKey("champmail_prospects.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "sequence_id",
            sa.Integer(),
            sa.ForeignKey("champmail_sequences.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("current_step_index", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("status", sa.String(32), nullable=False, server_default="active", index=True),
        sa.Column("next_step_at", sa.DateTime(timezone=True), nullable=True, index=True),
        sa.Column("enrolled_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("paused_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("prospect_id", "sequence_id", name="uq_enrollment_prospect_sequence"),
        sa.CheckConstraint(_in_list("status", ENROLLMENT_STATUSES), name="ck_champmail_enrollments_status"),
    )
    op.create_index("ix_enrollment_due", "champmail_enrollments", ["status", "next_step_at"])

    # Sends -------------------------------------------------------------------
    op.create_table(
        "champmail_sends",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "enrollment_id",
            sa.Integer(),
            sa.ForeignKey("champmail_enrollments.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
        ),
        sa.Column(
            "step_id",
            sa.Integer(),
            sa.ForeignKey("champmail_sequence_steps.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("template_id", sa.Integer(), sa.ForeignKey("champmail_templates.id"), nullable=True),
        sa.Column("sender_id", sa.Integer(), sa.ForeignKey("champmail_senders.id"), nullable=False),
        sa.Column(
            "prospect_id",
            sa.Integer(),
            sa.ForeignKey("champmail_prospects.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("idempotency_key", sa.String(64), nullable=False, unique=True, index=True),
        sa.Column("emelia_message_id", sa.String(255), nullable=True, index=True),
        sa.Column("subject_rendered", sa.String(500), nullable=False),
        sa.Column("body_html_rendered", sa.Text(), nullable=False),
        sa.Column("status", sa.String(32), nullable=False, server_default="pending", index=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("failed_reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(_in_list("status", SEND_STATUSES), name="ck_champmail_sends_status"),
    )

    # Events ------------------------------------------------------------------
    op.create_table(
        "champmail_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "send_id",
            sa.Integer(),
            sa.ForeignKey("champmail_sends.id", ondelete="CASCADE"),
            nullable=True,
            index=True,
        ),
        sa.Column(
            "prospect_id",
            sa.Integer(),
            sa.ForeignKey("champmail_prospects.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("event_type", sa.String(32), nullable=False, index=True),
        sa.Column("metadata", JSONB(), nullable=False, server_default="{}"),
        sa.Column("occurred_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(_in_list("event_type", EVENT_TYPES), name="ck_champmail_events_type"),
    )
    op.create_index("ix_event_prospect_type", "champmail_events", ["prospect_id", "event_type"])


def downgrade() -> None:
    op.drop_index("ix_event_prospect_type", table_name="champmail_events")
    op.drop_table("champmail_events")
    op.drop_table("champmail_sends")
    op.drop_index("ix_enrollment_due", table_name="champmail_enrollments")
    op.drop_table("champmail_enrollments")
    op.drop_table("champmail_sequence_steps")
    op.drop_table("champmail_sequences")
    op.drop_table("champmail_templates")
    op.drop_table("champmail_senders")
    op.drop_table("champmail_prospects")
