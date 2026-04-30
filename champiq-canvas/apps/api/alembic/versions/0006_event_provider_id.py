"""champmail_events.provider_event_id + unique index for webhook dedup.

Emelia retries 5xx for ~24 hours. Without a uniqueness guarantee on the
provider's event id, every retry would write an audit row and re-fire the
canvas event bus — workflows trigger N times for one real reply.

`provider_event_id` is nullable because (a) older rows pre-date this column
and (b) a few providers don't include a stable id in every event type. When
present, the (provider, provider_event_id, event_type) tuple is unique.

Revision ID: 0006
Revises: 0005
"""
from alembic import op
import sqlalchemy as sa


revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "champmail_events",
        sa.Column("provider", sa.String(length=32), nullable=True),
    )
    op.add_column(
        "champmail_events",
        sa.Column("provider_event_id", sa.String(length=128), nullable=True),
    )
    # Full unique constraint (not a partial index) so it can serve as the
    # target of an ON CONFLICT clause. Postgres treats NULLs as distinct by
    # default (NULL != NULL), so historical rows with NULL provider/eid don't
    # trigger uniqueness violations — they're naturally exempt without needing
    # a WHERE filter on the constraint.
    op.create_unique_constraint(
        "uq_event_provider_eid",
        "champmail_events",
        ["provider", "provider_event_id", "event_type"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_event_provider_eid", "champmail_events", type_="unique")
    op.drop_column("champmail_events", "provider_event_id")
    op.drop_column("champmail_events", "provider")
