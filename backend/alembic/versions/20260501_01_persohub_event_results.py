"""add persohub event results fields

Revision ID: 20260501_01
Revises: 20260428_02
Create Date: 2026-05-01 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260501_01"
down_revision: Union[str, Sequence[str], None] = "20260428_02"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "persohub_events",
        sa.Column(
            "results_published",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column("persohub_events", sa.Column("results_caption", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("persohub_events", "results_caption")
    op.drop_column("persohub_events", "results_published")
