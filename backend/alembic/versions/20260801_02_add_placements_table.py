"""add placements table

Revision ID: 20260801_02
Revises: 20260801_01
Create Date: 2026-08-01 00:01:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "20260801_02"
down_revision: Union[str, Sequence[str], None] = "20260801_01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_EXPERIENCE_TYPE_ENUM_CREATE = postgresql.ENUM(
    "intern",
    "placement",
    name="experiencetype",
    create_type=True,
)

_EXPERIENCE_TYPE_ENUM_REF = postgresql.ENUM(
    "intern",
    "placement",
    name="experiencetype",
    create_type=False,
)


def upgrade() -> None:
    _EXPERIENCE_TYPE_ENUM_CREATE.create(op.get_bind(), checkfirst=True)
    op.create_table(
        "placements",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("s3_url", sa.String(length=800), nullable=False),
        sa.Column("experience_type", _EXPERIENCE_TYPE_ENUM_REF, nullable=False),
        sa.Column("extracted_text", sa.Text(), nullable=True),
        sa.Column("content", sa.JSON(), nullable=True),
        sa.Column("company_name", sa.String(length=255), nullable=True),
        sa.Column("experience_months", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=True,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_placements_id"), "placements", ["id"], unique=False)
    op.create_index(op.f("ix_placements_user_id"), "placements", ["user_id"], unique=False)
    op.create_index(op.f("ix_placements_company_name"), "placements", ["company_name"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_placements_company_name"), table_name="placements")
    op.drop_index(op.f("ix_placements_user_id"), table_name="placements")
    op.drop_index(op.f("ix_placements_id"), table_name="placements")
    op.drop_table("placements")
    _EXPERIENCE_TYPE_ENUM_CREATE.drop(op.get_bind(), checkfirst=True)
