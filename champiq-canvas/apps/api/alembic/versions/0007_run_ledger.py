"""run_ledger table (LedgerConsumer, SUGGESTIONS 4.1)

Revision ID: 0007
Revises: 0006
Create Date: 2026-07-21
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0007"
down_revision: Union[str, None] = "0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "run_ledger",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("topic", sa.Text(), nullable=False),
        sa.Column("client", sa.Text(), nullable=True),
        sa.Column("digest", sa.Text(), nullable=False),
        sa.Column("payload", postgresql.JSONB(), nullable=True),
        sa.Column("emitted_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_run_ledger_topic", "run_ledger", ["topic"])
    op.create_index("ix_run_ledger_client", "run_ledger", ["client"])
    op.create_index("ix_run_ledger_emitted_at", "run_ledger", ["emitted_at"])


def downgrade() -> None:
    op.drop_index("ix_run_ledger_emitted_at", "run_ledger")
    op.drop_index("ix_run_ledger_client", "run_ledger")
    op.drop_index("ix_run_ledger_topic", "run_ledger")
    op.drop_table("run_ledger")
