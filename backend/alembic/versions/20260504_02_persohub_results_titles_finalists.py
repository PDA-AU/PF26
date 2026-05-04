"""add persohub results titles and finalists

Revision ID: 20260504_02
Revises: 20260504_01
Create Date: 2026-05-04 00:30:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "20260504_02"
down_revision: Union[str, Sequence[str], None] = "20260504_01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


ENTITY_TYPE_ENUM = postgresql.ENUM("USER", "TEAM", name="pdaevententitytype", create_type=False)


def upgrade() -> None:
    op.add_column(
        "persohub_events",
        sa.Column(
            "results_winners_revealed",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.create_table(
        "persohub_event_result_titles",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("event_id", sa.Integer(), nullable=False),
        sa.Column("title_name", sa.String(length=255), nullable=False),
        sa.Column("precedence_rank", sa.Integer(), nullable=False),
        sa.Column("entity_type", ENTITY_TYPE_ENUM, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("team_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["event_id"], ["persohub_events.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["team_id"], ["persohub_event_teams.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("event_id", "title_name", name="uq_persohub_result_title_event_name"),
        sa.UniqueConstraint("event_id", "precedence_rank", name="uq_persohub_result_title_event_rank"),
    )
    op.create_index(op.f("ix_persohub_event_result_titles_id"), "persohub_event_result_titles", ["id"], unique=False)
    op.create_index(op.f("ix_persohub_event_result_titles_event_id"), "persohub_event_result_titles", ["event_id"], unique=False)
    op.create_index(op.f("ix_persohub_event_result_titles_user_id"), "persohub_event_result_titles", ["user_id"], unique=False)
    op.create_index(op.f("ix_persohub_event_result_titles_team_id"), "persohub_event_result_titles", ["team_id"], unique=False)

    op.create_table(
        "persohub_event_result_finalists",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("event_id", sa.Integer(), nullable=False),
        sa.Column("entity_type", ENTITY_TYPE_ENUM, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("team_id", sa.Integer(), nullable=True),
        sa.Column("photo_url", sa.Text(), nullable=True),
        sa.Column("video_url", sa.Text(), nullable=True),
        sa.Column("content", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["event_id"], ["persohub_events.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["team_id"], ["persohub_event_teams.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("event_id", "entity_type", "user_id", name="uq_persohub_result_finalist_event_user"),
        sa.UniqueConstraint("event_id", "entity_type", "team_id", name="uq_persohub_result_finalist_event_team"),
    )
    op.create_index(op.f("ix_persohub_event_result_finalists_id"), "persohub_event_result_finalists", ["id"], unique=False)
    op.create_index(op.f("ix_persohub_event_result_finalists_event_id"), "persohub_event_result_finalists", ["event_id"], unique=False)
    op.create_index(op.f("ix_persohub_event_result_finalists_user_id"), "persohub_event_result_finalists", ["user_id"], unique=False)
    op.create_index(op.f("ix_persohub_event_result_finalists_team_id"), "persohub_event_result_finalists", ["team_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_persohub_event_result_finalists_team_id"), table_name="persohub_event_result_finalists")
    op.drop_index(op.f("ix_persohub_event_result_finalists_user_id"), table_name="persohub_event_result_finalists")
    op.drop_index(op.f("ix_persohub_event_result_finalists_event_id"), table_name="persohub_event_result_finalists")
    op.drop_index(op.f("ix_persohub_event_result_finalists_id"), table_name="persohub_event_result_finalists")
    op.drop_table("persohub_event_result_finalists")

    op.drop_index(op.f("ix_persohub_event_result_titles_team_id"), table_name="persohub_event_result_titles")
    op.drop_index(op.f("ix_persohub_event_result_titles_user_id"), table_name="persohub_event_result_titles")
    op.drop_index(op.f("ix_persohub_event_result_titles_event_id"), table_name="persohub_event_result_titles")
    op.drop_index(op.f("ix_persohub_event_result_titles_id"), table_name="persohub_event_result_titles")
    op.drop_table("persohub_event_result_titles")

    op.drop_column("persohub_events", "results_winners_revealed")
