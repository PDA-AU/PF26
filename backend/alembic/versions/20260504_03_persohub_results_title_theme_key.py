"""add theme key to persohub result titles

Revision ID: 20260504_03
Revises: 20260504_02
Create Date: 2026-05-04 03:20:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260504_03"
down_revision: Union[str, Sequence[str], None] = "20260504_02"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("persohub_event_result_titles", sa.Column("theme_key", sa.String(length=64), nullable=True))


def downgrade() -> None:
    op.drop_column("persohub_event_result_titles", "theme_key")
