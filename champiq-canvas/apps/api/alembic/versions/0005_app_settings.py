"""app_settings — single-row table for tenant-level toggles.

Holds the chosen default email engine provider ("emelia" | "champmail_native")
and which credential row is the default for that provider. Single row keyed by
a fixed `id="default"` so we don't have to thread tenant context yet — when
multi-tenancy lands this table grows a tenant_id column and unique constraint.

Revision ID: 0005
Revises: 0004
"""
from alembic import op
import sqlalchemy as sa


revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "app_settings",
        sa.Column("id", sa.String(length=50), primary_key=True),
        sa.Column("default_engine_provider", sa.String(length=50), nullable=False, server_default="emelia"),
        sa.Column("default_email_credential_id", sa.Integer(), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["default_email_credential_id"], ["credentials.id"], ondelete="SET NULL"
        ),
    )


def downgrade() -> None:
    op.drop_table("app_settings")
