"""champmail_senders.credential_id (FK -> credentials.id)

Lets each connected Emelia inbox carry the credential it should authenticate
with. Nullable so existing senders (env-var-key world) keep working.

Revision ID: 0004
Revises: 0003
"""
from alembic import op
import sqlalchemy as sa


revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "champmail_senders",
        sa.Column("credential_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_champmail_senders_credential",
        "champmail_senders",
        "credentials",
        ["credential_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_champmail_senders_credential_id",
        "champmail_senders",
        ["credential_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_champmail_senders_credential_id", table_name="champmail_senders")
    op.drop_constraint(
        "fk_champmail_senders_credential", "champmail_senders", type_="foreignkey"
    )
    op.drop_column("champmail_senders", "credential_id")
