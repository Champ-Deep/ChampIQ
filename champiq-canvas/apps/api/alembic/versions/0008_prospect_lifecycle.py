"""prospect_lifecycle table (ProspectState state machine, ChampIQ build spec)

Researched -> InCadence -> Engaged -> Replied -> Qualified -> MeetingBooked,
with Exhausted -> CommitteeEscalation defined but unwired (stub). See
champiq_api/champgraph/lifecycle.py for the transition rules.

Revision ID: 0008
Revises: 0007
Create Date: 2026-07-27
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0008"
down_revision: Union[str, None] = "0007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "prospect_lifecycle",
        sa.Column(
            "prospect_id",
            sa.Integer(),
            sa.ForeignKey("champmail_prospects.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("state", sa.String(length=32), nullable=False, server_default="researched"),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_prospect_lifecycle_state", "prospect_lifecycle", ["state"])


def downgrade() -> None:
    op.drop_index("ix_prospect_lifecycle_state", "prospect_lifecycle")
    op.drop_table("prospect_lifecycle")
