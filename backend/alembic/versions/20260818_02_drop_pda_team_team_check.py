"""drop legacy pda_team_team_check constraint

Now that recruitment teams are managed via the pda_recruitment_team catalog,
the hardcoded CHECK constraint pinning pda_team.team to the original 8 values
blocks admin-created teams from being assigned to members.

Revision ID: 20260818_02
Revises: 20260818_01
Create Date: 2026-08-18 12:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
from sqlalchemy.sql import text


revision: str = "20260818_02"
down_revision: Union[str, Sequence[str], None] = "20260818_01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    exists = conn.execute(text(
        """
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'pda_team' AND constraint_name = 'pda_team_team_check'
        """
    )).fetchone()
    if exists:
        op.execute("ALTER TABLE pda_team DROP CONSTRAINT pda_team_team_check")


def downgrade() -> None:
    op.execute(
        """
        ALTER TABLE pda_team
        ADD CONSTRAINT pda_team_team_check
        CHECK (team IS NULL OR team IN (
            'Executive',
            'Content Creation',
            'Event Management',
            'Design',
            'Website Design',
            'Public Relations',
            'Podcast',
            'Library'
        ))
        """
    )
