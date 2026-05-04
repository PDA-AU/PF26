"""ensure sort order exists on persohub result finalists

Revision ID: 20260504_06
Revises: 20260504_05
Create Date: 2026-05-04 08:35:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260504_06"
down_revision: Union[str, Sequence[str], None] = "20260504_05"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_column(table_name: str, column_name: str) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return any(column["name"] == column_name for column in inspector.get_columns(table_name))


def upgrade() -> None:
    if not _has_column("persohub_event_result_finalists", "sort_order"):
        op.add_column(
            "persohub_event_result_finalists",
            sa.Column("sort_order", sa.Integer(), nullable=False, server_default="1"),
        )


def downgrade() -> None:
    if _has_column("persohub_event_result_finalists", "sort_order"):
        op.drop_column("persohub_event_result_finalists", "sort_order")
