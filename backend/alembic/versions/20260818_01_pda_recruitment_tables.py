"""pda recruitment tables (team catalog + applications)

Revision ID: 20260818_01
Revises: 20260801_02
Create Date: 2026-08-18 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.sql import text


revision: str = "20260818_01"
down_revision: Union[str, Sequence[str], None] = "20260801_02"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_SEED_TEAMS = [
    {
        "team_code": "web",
        "title": "Website Design",
        "description": "Embrace your creativity and expertise! Join our team of web designers, skilled coders, and content curators to deliver seamless and captivating online experiences that leave a lasting impact.",
        "active": True,
    },
    {
        "team_code": "pr",
        "title": "Public Relations",
        "description": "Want to be a marketing genius? Join our team as the ultimate bridge, linking diverse departments seamlessly for a successful outreach. You'll help us reach out to our audience and play a vital role in taking PDA to new heights!",
        "active": True,
    },
    {
        "team_code": "content",
        "title": "Content Creation",
        "description": "Unleash your creativity as a Content Wizard! Join our team to conjure captivating and share-worthy content for magazines and social media, leaving a trail of mesmerized followers behind!",
        "active": True,
    },
    {
        "team_code": "design",
        "title": "Design",
        "description": "Love making eye-catching designs? Ready to be the creative genius behind captivating PDA videos and posters? Join us now to flaunt your talent and dazzle audiences with your incredible creations!",
        "active": True,
    },
    {
        "team_code": "events",
        "title": "Event Management",
        "description": "Are you a better manager? Want to be a better one? Join us and help us organize successful events! Coordinate with various teams and handle all tasks with ease and make every occasion a grand success!",
        "active": True,
    },
    {
        "team_code": "podcast",
        "title": "Podcast",
        "description": "Are you a skilled storyteller? Can you make boring lectures into exciting presentations and engaging content for coding, aptitude and other sessions? Want to learn how to deliver effective seminars and learning experiences? Then be a part of our knowledge-sharing journey!",
        "active": True,
    },
    {
        "team_code": "library",
        "title": "Library",
        "description": "Can you turn every setback into success? Are you a skilled organizer and manager? Take charge of the library management, ensure smooth and efficient operations. Join our team and be the librarian extraordinaire!",
        "active": True,
    },
    {
        "team_code": "executive",
        "title": "Executive",
        "description": "Administrative leadership role. Assigned by superadmin during approval.",
        "active": True,
    },
]


def _has_table(conn, name: str) -> bool:
    return conn.dialect.has_table(conn, name)


def upgrade() -> None:
    conn = op.get_bind()

    if not _has_table(conn, "pda_recruitment_team"):
        op.create_table(
            "pda_recruitment_team",
            sa.Column("id", sa.Integer(), primary_key=True, index=True),
            sa.Column("team_code", sa.String(length=32), nullable=False),
            sa.Column("title", sa.String(length=120), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        )
        # Ensure a unique index on team_code (Column(index=True) covers id auto).
        op.create_index(
            op.f("ix_pda_recruitment_team_team_code"),
            "pda_recruitment_team",
            ["team_code"],
            unique=True,
        )

    # Seed only if empty (idempotent).
    existing = conn.execute(text("SELECT COUNT(*) FROM pda_recruitment_team")).scalar() or 0
    if existing == 0:
        op.bulk_insert(
            sa.table(
                "pda_recruitment_team",
                sa.column("team_code", sa.String),
                sa.column("title", sa.String),
                sa.column("description", sa.Text),
                sa.column("active", sa.Boolean),
            ),
            _SEED_TEAMS,
        )
    else:
        # Ensure executive is active (it's hidden from public via team_code filter, not active flag).
        conn.execute(text(
            "UPDATE pda_recruitment_team SET active = TRUE WHERE team_code = 'executive'"
        ))

    if not _has_table(conn, "pda_recruitment"):
        op.create_table(
            "pda_recruitment",
            sa.Column("id", sa.Integer(), primary_key=True, index=True),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("team_preferences", sa.JSON(), nullable=False),
            sa.Column("resume_url", sa.String(length=800), nullable=True),
            sa.Column("applied_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.UniqueConstraint("user_id", name="uq_pda_recruitment_user_id"),
        )

    # Data migration: move existing recruitment applications from users.json_content
    # (and pda_resume.s3_url) into pda_recruitment. Map preferred team titles to
    # team_code values via a lookup on pda_recruitment_team.title.
    conn.execute(text(
        """
        WITH src AS (
            SELECT
                u.id AS user_id,
                (u.json_content::jsonb) AS jc,
                r.s3_url AS resume_s3,
                u.created_at AS user_created_at
            FROM users u
            LEFT JOIN pda_resume r ON r.user_id = u.id
            WHERE u.is_member = false
              AND u.json_content IS NOT NULL
              AND ((u.json_content::jsonb)->>'is_applied') = 'true'
              AND (
                  ((u.json_content::jsonb) ? 'preferred_team_1')
                  OR ((u.json_content::jsonb) ? 'preferred_team')
              )
        )
        INSERT INTO pda_recruitment (user_id, team_preferences, resume_url, applied_at)
        SELECT
            src.user_id,
            to_jsonb(
                ARRAY(
                    SELECT tc
                    FROM (
                        SELECT unnest(ARRAY[
                            (SELECT rt.team_code FROM pda_recruitment_team rt
                             WHERE rt.title = COALESCE(src.jc->>'preferred_team_1', src.jc->>'preferred_team')
                             LIMIT 1),
                            (SELECT rt.team_code FROM pda_recruitment_team rt
                             WHERE rt.title = src.jc->>'preferred_team_2'
                             LIMIT 1),
                            (SELECT rt.team_code FROM pda_recruitment_team rt
                             WHERE rt.title = src.jc->>'preferred_team_3'
                             LIMIT 1)
                        ]) AS tc
                    ) sub
                    WHERE tc IS NOT NULL
                )
            ) AS team_preferences,
            COALESCE(src.resume_s3, src.jc->>'resume_url') AS resume_url,
            COALESCE(
                NULLIF(src.jc->>'applied_at', '')::timestamptz,
                src.user_created_at,
                now()
            ) AS applied_at
        FROM src
        ON CONFLICT (user_id) DO NOTHING;
        """
    ))


def downgrade() -> None:
    conn = op.get_bind()
    if _has_table(conn, "pda_recruitment"):
        op.drop_table("pda_recruitment")
    if _has_table(conn, "pda_recruitment_team"):
        op.drop_table("pda_recruitment_team")
