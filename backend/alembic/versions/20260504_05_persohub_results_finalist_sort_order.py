"""add sort order to persohub result finalists

Revision ID: 20260504_05
Revises: 20260504_04
Create Date: 2026-05-04 08:20:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260504_05"
down_revision: Union[str, Sequence[str], None] = "20260504_04"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "persohub_event_result_finalists",
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="1"),
    )


def downgrade() -> None:
    op.drop_column("persohub_event_result_finalists", "sort_order")
