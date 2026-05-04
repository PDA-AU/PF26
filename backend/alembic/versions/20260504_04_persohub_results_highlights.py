"""persohub results highlights

Revision ID: 20260504_04
Revises: 20260504_03
Create Date: 2026-05-04 18:05:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260504_04"
down_revision = "20260504_03"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "persohub_event_result_highlights",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("event_id", sa.Integer(), nullable=False),
        sa.Column("emoji", sa.String(length=32), nullable=True),
        sa.Column("tag", sa.String(length=120), nullable=True),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("quantity", sa.String(length=120), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("entity_type", postgresql.ENUM("USER", "TEAM", name="pdaevententitytype", create_type=False), nullable=True),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("team_id", sa.Integer(), nullable=True),
        sa.Column("content", sa.JSON(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["event_id"], ["persohub_events.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["team_id"], ["persohub_event_teams.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_persohub_event_result_highlights_id"), "persohub_event_result_highlights", ["id"], unique=False)
    op.create_index(op.f("ix_persohub_event_result_highlights_event_id"), "persohub_event_result_highlights", ["event_id"], unique=False)
    op.create_index(op.f("ix_persohub_event_result_highlights_user_id"), "persohub_event_result_highlights", ["user_id"], unique=False)
    op.create_index(op.f("ix_persohub_event_result_highlights_team_id"), "persohub_event_result_highlights", ["team_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_persohub_event_result_highlights_team_id"), table_name="persohub_event_result_highlights")
    op.drop_index(op.f("ix_persohub_event_result_highlights_user_id"), table_name="persohub_event_result_highlights")
    op.drop_index(op.f("ix_persohub_event_result_highlights_event_id"), table_name="persohub_event_result_highlights")
    op.drop_index(op.f("ix_persohub_event_result_highlights_id"), table_name="persohub_event_result_highlights")
    op.drop_table("persohub_event_result_highlights")
