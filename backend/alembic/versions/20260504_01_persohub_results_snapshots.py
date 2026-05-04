"""add persohub results snapshots

Revision ID: 20260504_01
Revises: 20260501_02
Create Date: 2026-05-04 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260504_01"
down_revision: Union[str, Sequence[str], None] = "20260501_02"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("persohub_events", sa.Column("event_results_snapshot", sa.JSON(), nullable=True))
    op.add_column(
        "persohub_event_rounds",
        sa.Column(
            "results_published",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column("persohub_event_rounds", sa.Column("results_published_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("persohub_event_rounds", sa.Column("results_snapshot", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("persohub_event_rounds", "results_snapshot")
    op.drop_column("persohub_event_rounds", "results_published_at")
    op.drop_column("persohub_event_rounds", "results_published")
    op.drop_column("persohub_events", "event_results_snapshot")
