"""create canvas_state table

Revision ID: 0001
Revises:
Create Date: 2024-01-01
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "canvas_state",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("canvas_id", sa.Text(), nullable=False),
        sa.Column("nodes", JSONB(), nullable=False, server_default="[]"),
        sa.Column("edges", JSONB(), nullable=False, server_default="[]"),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("canvas_id"),
    )


def downgrade() -> None:
    op.drop_table("canvas_state")
