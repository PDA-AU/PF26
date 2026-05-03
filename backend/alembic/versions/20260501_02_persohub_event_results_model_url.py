"""add persohub event results model url

Revision ID: 20260501_02
Revises: 20260501_01
Create Date: 2026-05-01 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op


revision: str = "20260501_02"
down_revision: Union[str, Sequence[str], None] = "20260501_01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE persohub_events ADD COLUMN IF NOT EXISTS results_model_url TEXT")


def downgrade() -> None:
    op.execute("ALTER TABLE persohub_events DROP COLUMN IF EXISTS results_model_url")
