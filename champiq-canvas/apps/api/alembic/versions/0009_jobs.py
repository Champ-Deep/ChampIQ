"""jobs table — durable Postgres-backed job queue (SUGGESTIONS 4.3)

Claimed via SELECT ... FOR UPDATE SKIP LOCKED (see runtime/queue.py
PostgresJobQueue) so a restart or a concurrent worker never double-processes
a row. Replaces the in-memory asyncio queue that lost every pending job on
every deploy.

Revision ID: 0009
Revises: 0008
Create Date: 2026-07-27
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0009"
down_revision: Union[str, None] = "0008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "jobs",
        sa.Column("id", sa.String(length=40), primary_key=True),
        sa.Column("kind", sa.String(length=100), nullable=False),
        sa.Column("payload", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="pending"),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("run_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("locked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("locked_by", sa.String(length=64), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_jobs_kind", "jobs", ["kind"])
    op.create_index("ix_jobs_status", "jobs", ["status"])
    op.create_index("ix_jobs_run_at", "jobs", ["run_at"])
    # Matches the exact predicate PostgresJobQueue._claim_one filters on.
    op.create_index(
        "ix_jobs_claim",
        "jobs",
        ["status", "run_at"],
        postgresql_where=sa.text("status = 'pending'"),
    )


def downgrade() -> None:
    op.drop_index("ix_jobs_claim", "jobs")
    op.drop_index("ix_jobs_run_at", "jobs")
    op.drop_index("ix_jobs_status", "jobs")
    op.drop_index("ix_jobs_kind", "jobs")
    op.drop_table("jobs")
