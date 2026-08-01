"""drop pda event tables

Revision ID: 20260801_01
Revises: 20260504_06
Create Date: 2026-08-01 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260801_01"
down_revision: Union[str, Sequence[str], None] = "20260504_06"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_PDA_TABLES = [
    "pda_event_round_panel_assignments",
    "pda_event_round_panel_members",
    "pda_event_round_panels",
    "pda_event_round_submissions",
    "pda_event_badges",
    "pda_event_invites",
    "pda_event_scores",
    "pda_event_attendance",
    "pda_event_rounds",
    "pda_event_team_members",
    "pda_event_registrations",
    "pda_event_teams",
    "pda_event_logs",
    "pda_events",
]


def _table_exists(table_name: str) -> bool:
    conn = op.get_bind()
    return conn.dialect.has_table(conn, table_name)


def upgrade() -> None:
    conn = op.get_bind()
    # Drop FK constraints on badge_assignments that point at pda tables
    for constraint in ("badge_assignments_pda_team_id_fkey", "badge_assignments_pda_event_id_fkey"):
        exists = conn.execute(sa.text(
            "SELECT 1 FROM information_schema.table_constraints "
            "WHERE constraint_name = :c AND table_name = 'badge_assignments'"
        ), {"c": constraint}).first()
        if exists:
            op.drop_constraint(constraint, "badge_assignments", type_="foreignkey")

    for table in _PDA_TABLES:
        if _table_exists(table):
            op.drop_table(table)


def downgrade() -> None:
    pass
