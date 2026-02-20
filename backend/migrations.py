from typing import Dict, Optional, Tuple
import json
import re
import secrets
from sqlalchemy import text
from sqlalchemy.orm import Session
from models import PdaTeam, PdaUser, PdaAdmin
from auth import get_password_hash
from persohub_service import ensure_default_persohub_setup

TEAM_MAP: Dict[str, Tuple[str, str]] = {
    "Chairperson": ("Executive", "Chairperson"),
    "Vice Chairperson": ("Executive", "Vice Chairperson"),
    "General Secretary": ("Executive", "General Secretary"),
    "Treasurer": ("Executive", "Treasurer"),
    "Head of Content Creation": ("Content Creation", "Head"),
    "Head of Event Management": ("Event Management", "Head"),
    "Head of Design": ("Design", "Head"),
    "Head of Website Design": ("Website Design", "Head"),
    "Head of Public Relation": ("Public Relations", "Head"),
    "Head of Podcast": ("Podcast", "Head"),
    "Chief Librarian": ("Library", "Head"),
}


def _table_exists(conn, table_name: str) -> bool:
    result = conn.execute(
        text(
            """
            SELECT 1 FROM information_schema.tables
            WHERE table_name = :table
            """
        ),
        {"table": table_name}
    ).fetchone()
    return bool(result)


def _column_exists(conn, table_name: str, column_name: str) -> bool:
    result = conn.execute(
        text(
            """
            SELECT 1 FROM information_schema.columns
            WHERE table_name = :table AND column_name = :column
            """
        ),
        {"table": table_name, "column": column_name}
    ).fetchone()
    return bool(result)


def ensure_pda_users_table(engine):
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS users (
                    id SERIAL PRIMARY KEY,
                    regno VARCHAR(20) UNIQUE NOT NULL,
                    email VARCHAR(255) UNIQUE NOT NULL,
                    hashed_password VARCHAR(255) NOT NULL,
                    name VARCHAR(255) NOT NULL,
                    dob DATE,
                    gender VARCHAR(10),
                    phno VARCHAR(20),
                    dept VARCHAR(150),
                    instagram_url VARCHAR(500),
                    linkedin_url VARCHAR(500),
                    github_url VARCHAR(500),
                    image_url VARCHAR(500),
                    json_content JSON,
                    is_member BOOLEAN DEFAULT FALSE,
                    created_at TIMESTAMPTZ DEFAULT now(),
                    updated_at TIMESTAMPTZ
                )
                """
            )
        )


def ensure_pda_users_dob_column(engine):
    with engine.begin() as conn:
        if _table_exists(conn, "users") and not _column_exists(conn, "users", "dob"):
            conn.execute(text("ALTER TABLE users ADD COLUMN dob DATE"))


def ensure_pda_users_gender_column(engine):
    with engine.begin() as conn:
        if _table_exists(conn, "users") and not _column_exists(conn, "users", "gender"):
            conn.execute(text("ALTER TABLE users ADD COLUMN gender VARCHAR(10)"))


def normalize_pda_profile_enum_values(engine):
    with engine.begin() as conn:
        if not _table_exists(conn, "users"):
            return

        conn.execute(text("UPDATE users SET gender = NULL WHERE trim(COALESCE(gender, '')) = ''"))
        conn.execute(text("UPDATE users SET dept = NULL WHERE trim(COALESCE(dept, '')) = ''"))

        conn.execute(
            text(
                """
                UPDATE users
                SET gender = NULL
                WHERE gender IS NOT NULL
                  AND gender NOT IN ('Male', 'Female')
                """
            )
        )
        conn.execute(
            text(
                """
                UPDATE users
                SET dept = NULL
                WHERE dept IS NOT NULL
                  AND dept NOT IN (
                    'Artificial Intelligence and Data Science',
                    'Aerospace Engineering',
                    'Automobile Engineering',
                    'Computer Technology',
                    'Electronics and Communication Engineering',
                    'Electronics and Instrumentation Engineering',
                    'Production Technology',
                    'Robotics and Automation',
                    'Rubber and Plastics Technology',
                    'Information Technology'
                  )
                """
            )
        )


def _normalize_profile_seed(name: str) -> str:
    value = re.sub(r"[^a-z0-9_]+", "", str(name or "").strip().lower().replace(" ", "_"))
    value = re.sub(r"_+", "_", value).strip("_")
    if len(value) < 3:
        value = "user"
    return value[:32]


def _slugify_club_profile_id(raw: str) -> str:
    value = str(raw or "").strip().lower()
    value = re.sub(r"[\s_]+", "-", value)
    value = re.sub(r"[^a-z0-9-]+", "", value)
    value = re.sub(r"-{2,}", "-", value).strip("-")
    if len(value) < 3:
        value = "club"
    return value[:64]


def ensure_pda_users_profile_name_column(engine):
    with engine.begin() as conn:
        if not _table_exists(conn, "users"):
            return
        if not _column_exists(conn, "users", "profile_name"):
            conn.execute(text("ALTER TABLE users ADD COLUMN profile_name VARCHAR(64)"))
        conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_users_profile_name ON users(profile_name)"))

        rows = conn.execute(text("SELECT id, name FROM users WHERE profile_name IS NULL OR profile_name = ''")).fetchall()
        for row in rows:
            base = _normalize_profile_seed(row.name)
            candidate = f"{base}_{secrets.randbelow(100000):05d}"[:40]
            while conn.execute(text("SELECT 1 FROM users WHERE profile_name = :profile_name"), {"profile_name": candidate}).fetchone():
                candidate = f"{base}_{secrets.randbelow(100000):05d}"[:40]
            conn.execute(
                text("UPDATE users SET profile_name = :profile_name WHERE id = :id"),
                {"profile_name": candidate, "id": row.id},
            )


def ensure_pda_user_social_columns(engine):
    with engine.begin() as conn:
        if not _table_exists(conn, "users"):
            return
        if not _column_exists(conn, "users", "instagram_url"):
            conn.execute(text("ALTER TABLE users ADD COLUMN instagram_url VARCHAR(500)"))
        if not _column_exists(conn, "users", "linkedin_url"):
            conn.execute(text("ALTER TABLE users ADD COLUMN linkedin_url VARCHAR(500)"))
        if not _column_exists(conn, "users", "github_url"):
            conn.execute(text("ALTER TABLE users ADD COLUMN github_url VARCHAR(500)"))


def ensure_pda_recruitment_tables(engine):
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS pda_resume (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
                    s3_url VARCHAR(800) NOT NULL,
                    created_at TIMESTAMPTZ DEFAULT now(),
                    updated_at TIMESTAMPTZ
                )
                """
            )
        )
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_pda_resume_user_id ON pda_resume(user_id)"))


def ensure_system_config_recruit_url_column(engine):
    with engine.begin() as conn:
        if _table_exists(conn, "system_config") and not _column_exists(conn, "system_config", "recruit_url"):
            conn.execute(text("ALTER TABLE system_config ADD COLUMN recruit_url VARCHAR(800)"))


def migrate_legacy_recruitment_json_once(engine):
    marker_key = "migration_recruitment_table_to_json_v1"
    with engine.begin() as conn:
        if not _table_exists(conn, "users"):
            return

        marker_exists = False
        if _table_exists(conn, "system_config"):
            marker_exists = bool(
                conn.execute(
                    text("SELECT 1 FROM system_config WHERE key = :key"),
                    {"key": marker_key},
                ).fetchone()
            )
        if marker_exists:
            return

        if _table_exists(conn, "pda_recruit"):
            rows = conn.execute(
                text(
                    """
                    SELECT user_id, preferred_team_1, preferred_team_2, preferred_team_3, resume_url
                    FROM pda_recruit
                    ORDER BY user_id ASC
                    """
                )
            ).mappings().all()
            for row in rows:
                user_row = conn.execute(
                    text("SELECT is_member, json_content FROM users WHERE id = :user_id"),
                    {"user_id": row["user_id"]},
                ).mappings().first()
                if not user_row or bool(user_row.get("is_member")):
                    continue

                payload = dict(user_row["json_content"]) if isinstance(user_row["json_content"], dict) else {}
                preferred_team_1 = str(row.get("preferred_team_1") or "").strip()
                preferred_team_2 = str(row.get("preferred_team_2") or "").strip() or None
                preferred_team_3 = str(row.get("preferred_team_3") or "").strip() or None
                resume_url = str(row.get("resume_url") or "").strip() or None
                if not preferred_team_1:
                    continue

                payload["is_applied"] = True
                payload["preferred_team"] = preferred_team_1
                payload["preferred_team_1"] = preferred_team_1
                if preferred_team_2:
                    payload["preferred_team_2"] = preferred_team_2
                else:
                    payload.pop("preferred_team_2", None)
                if preferred_team_3:
                    payload["preferred_team_3"] = preferred_team_3
                else:
                    payload.pop("preferred_team_3", None)

                conn.execute(
                    text("UPDATE users SET json_content = CAST(:payload AS JSON) WHERE id = :user_id"),
                    {"user_id": row["user_id"], "payload": json.dumps(payload)},
                )

                if resume_url and _table_exists(conn, "pda_resume"):
                    conn.execute(
                        text(
                            """
                            INSERT INTO pda_resume (user_id, s3_url)
                            VALUES (:user_id, :s3_url)
                            ON CONFLICT (user_id) DO UPDATE SET s3_url = EXCLUDED.s3_url
                            """
                        ),
                        {"user_id": row["user_id"], "s3_url": resume_url},
                    )

            # Keep legacy table around to avoid lock contention on busy databases.
            # Runtime no longer depends on pda_recruit after this migration.

        if _table_exists(conn, "system_config"):
            conn.execute(
                text(
                    """
                    INSERT INTO system_config (key, value)
                    VALUES (:key, 'done')
                    ON CONFLICT (key) DO UPDATE SET value = 'done'
                    """
                ),
                {"key": marker_key},
            )


def remove_legacy_persofest_once(engine):
    marker_key = "migration_remove_legacy_persofest_v1"
    with engine.begin() as conn:
        if _table_exists(conn, "system_config"):
            marker_exists = conn.execute(
                text("SELECT 1 FROM system_config WHERE key = :key"),
                {"key": marker_key},
            ).fetchone()
            if marker_exists:
                return

        event_row = None
        if _table_exists(conn, "pda_events"):
            event_row = conn.execute(
                text("SELECT id FROM pda_events WHERE slug = 'persofest-2026' LIMIT 1")
            ).fetchone()

        if event_row:
            event_id = int(event_row[0])
            if _table_exists(conn, "pda_event_scores"):
                conn.execute(text("DELETE FROM pda_event_scores WHERE event_id = :event_id"), {"event_id": event_id})
            if _table_exists(conn, "pda_event_attendance"):
                conn.execute(text("DELETE FROM pda_event_attendance WHERE event_id = :event_id"), {"event_id": event_id})
            if _table_exists(conn, "pda_event_badges"):
                conn.execute(text("DELETE FROM pda_event_badges WHERE event_id = :event_id"), {"event_id": event_id})
            if _table_exists(conn, "pda_event_invites"):
                conn.execute(text("DELETE FROM pda_event_invites WHERE event_id = :event_id"), {"event_id": event_id})
            if _table_exists(conn, "pda_event_team_members") and _table_exists(conn, "pda_event_teams"):
                conn.execute(
                    text(
                        """
                        DELETE FROM pda_event_team_members
                        WHERE team_id IN (
                            SELECT id FROM pda_event_teams WHERE event_id = :event_id
                        )
                        """
                    ),
                    {"event_id": event_id},
                )
            if _table_exists(conn, "pda_event_registrations"):
                conn.execute(text("DELETE FROM pda_event_registrations WHERE event_id = :event_id"), {"event_id": event_id})
            if _table_exists(conn, "pda_event_rounds"):
                conn.execute(text("DELETE FROM pda_event_rounds WHERE event_id = :event_id"), {"event_id": event_id})
            if _table_exists(conn, "pda_event_teams"):
                conn.execute(text("DELETE FROM pda_event_teams WHERE event_id = :event_id"), {"event_id": event_id})
            if _table_exists(conn, "pda_event_logs"):
                conn.execute(
                    text("DELETE FROM pda_event_logs WHERE event_id = :event_id OR event_slug = 'persofest-2026'"),
                    {"event_id": event_id},
                )
            conn.execute(text("DELETE FROM pda_events WHERE id = :event_id"), {"event_id": event_id})
        elif _table_exists(conn, "pda_event_logs"):
            conn.execute(text("DELETE FROM pda_event_logs WHERE event_slug = 'persofest-2026'"))

        for table_name in ("scores", "rounds", "participants", "pf_events"):
            if _table_exists(conn, table_name):
                conn.execute(text(f"DROP TABLE IF EXISTS {table_name} CASCADE"))

        if _table_exists(conn, "system_config"):
            conn.execute(
                text(
                    """
                    INSERT INTO system_config (key, value)
                    VALUES (:key, 'done')
                    ON CONFLICT (key) DO UPDATE SET value = 'done'
                    """
                ),
                {"key": marker_key},
            )


def clear_legacy_poster_urls_once(engine):
    marker_key = "migration_clear_legacy_poster_urls_v1"
    with engine.begin() as conn:
        if not _table_exists(conn, "system_config"):
            return

        marker_exists = bool(
            conn.execute(
                text("SELECT 1 FROM system_config WHERE key = :key"),
                {"key": marker_key},
            ).fetchone()
        )
        if marker_exists:
            return

        if _table_exists(conn, "pda_items"):
            conn.execute(text("UPDATE pda_items SET poster_url = NULL, featured_poster_url = NULL"))
        if _table_exists(conn, "pda_events"):
            conn.execute(text("UPDATE pda_events SET poster_url = NULL"))

        conn.execute(
            text(
                """
                INSERT INTO system_config (key, value)
                VALUES (:key, 'done')
                ON CONFLICT (key) DO UPDATE SET value = 'done'
                """
            ),
            {"key": marker_key},
        )


def ensure_pda_team_columns(engine):
    with engine.begin() as conn:
        if not _table_exists(conn, "pda_team"):
            return
        if not _column_exists(conn, "pda_team", "user_id"):
            conn.execute(text("ALTER TABLE pda_team ADD COLUMN user_id INTEGER"))
        if not _column_exists(conn, "pda_team", "team"):
            conn.execute(text("ALTER TABLE pda_team ADD COLUMN team VARCHAR(120)"))
        if not _column_exists(conn, "pda_team", "designation"):
            conn.execute(text("ALTER TABLE pda_team ADD COLUMN designation VARCHAR(120)"))
        if _column_exists(conn, "pda_team", "team_designation"):
            conn.execute(text("ALTER TABLE pda_team DROP COLUMN team_designation"))


def ensure_pda_items_columns(engine):
    with engine.begin() as conn:
        if _table_exists(conn, "pda_items") and not _column_exists(conn, "pda_items", "featured_poster_url"):
            conn.execute(text("ALTER TABLE pda_items ADD COLUMN featured_poster_url VARCHAR(500)"))
        if _table_exists(conn, "pda_items"):
            conn.execute(text("ALTER TABLE pda_items ALTER COLUMN poster_url TYPE TEXT"))
            conn.execute(text("ALTER TABLE pda_items ALTER COLUMN featured_poster_url TYPE TEXT"))


def ensure_pda_items_no_hero_caption(engine):
    with engine.begin() as conn:
        if _table_exists(conn, "pda_items") and _column_exists(conn, "pda_items", "hero_caption"):
            conn.execute(text("ALTER TABLE pda_items DROP COLUMN hero_caption"))


def ensure_pda_team_constraints(engine):
    with engine.begin() as conn:
        if not _table_exists(conn, "pda_team"):
            return
        team_constraint = conn.execute(
            text(
                """
                SELECT 1 FROM information_schema.table_constraints
                WHERE table_name = 'pda_team' AND constraint_name = 'pda_team_team_check'
                """
            )
        ).fetchone()
        if not team_constraint:
            conn.execute(
                text(
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
            )


def ensure_pda_gallery_tag_column(engine):
    with engine.begin() as conn:
        if _table_exists(conn, "pda_gallery") and not _column_exists(conn, "pda_gallery", "tag"):
            conn.execute(text("ALTER TABLE pda_gallery ADD COLUMN tag VARCHAR(120)"))
        designation_constraint = conn.execute(
            text(
                """
                SELECT pg_get_constraintdef(c.oid) AS definition
                FROM pg_constraint c
                JOIN pg_class t ON c.conrelid = t.oid
                WHERE t.relname = 'pda_team' AND c.conname = 'pda_team_designation_check'
                """
            )
        ).fetchone()
        if designation_constraint and "Root" not in (designation_constraint[0] or ""):
            conn.execute(text("ALTER TABLE pda_team DROP CONSTRAINT pda_team_designation_check"))
            designation_constraint = None
        if not designation_constraint:
            conn.execute(
                text(
                    """
                    ALTER TABLE pda_team
                    ADD CONSTRAINT pda_team_designation_check
                    CHECK (designation IS NULL OR designation IN (
                        'Root',
                        'Chairperson',
                        'Vice Chairperson',
                        'Treasurer',
                        'General Secretary',
                        'Head',
                        'JS',
                        'Member',
                        'Volunteer'
                    ))
                    """
                )
            )


def ensure_pda_admins_table(engine):
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS pda_admins (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER UNIQUE NOT NULL,
                    policy JSON,
                    created_at TIMESTAMPTZ DEFAULT now()
                )
                """
            )
        )
        if not _column_exists(conn, "pda_admins", "user_id"):
            conn.execute(text("ALTER TABLE pda_admins ADD COLUMN user_id INTEGER"))
        if not _column_exists(conn, "pda_admins", "policy"):
            conn.execute(text("ALTER TABLE pda_admins ADD COLUMN policy JSON"))
        if not _column_exists(conn, "pda_admins", "created_at"):
            conn.execute(text("ALTER TABLE pda_admins ADD COLUMN created_at TIMESTAMPTZ DEFAULT now()"))
        if _column_exists(conn, "pda_admins", "hashed_password"):
            conn.execute(text("ALTER TABLE pda_admins DROP COLUMN hashed_password"))
        fk_exists = conn.execute(
            text(
                """
                SELECT 1
                FROM information_schema.table_constraints
                WHERE table_name = 'pda_admins'
                  AND constraint_type = 'FOREIGN KEY'
                  AND constraint_name = 'pda_admins_user_id_fkey'
                """
            )
        ).fetchone()
        if not fk_exists:
            conn.execute(
                text(
                    """
                    ALTER TABLE pda_admins
                    ADD CONSTRAINT pda_admins_user_id_fkey
                    FOREIGN KEY (user_id)
                    REFERENCES users(id)
                    ON DELETE RESTRICT
                    """
                )
            )


def normalize_pda_admins_schema(db: Session):
    conn = db.connection()
    if not _table_exists(conn, "pda_admins"):
        return

    has_regno = _column_exists(conn, "pda_admins", "regno")
    has_user_id = _column_exists(conn, "pda_admins", "user_id")

    if has_regno and not has_user_id:
        db.execute(text("ALTER TABLE pda_admins ADD COLUMN user_id INTEGER"))
        db.commit()
        has_user_id = True

    if has_regno and has_user_id:
        db.execute(text("ALTER TABLE pda_admins DROP CONSTRAINT IF EXISTS pda_admins_regno_fkey"))
        rows = db.execute(text("SELECT id, regno FROM pda_admins WHERE user_id IS NULL")).fetchall()
        for row in rows:
            user = db.query(PdaUser).filter(PdaUser.regno == row.regno).first()
            if user:
                db.execute(
                    text("UPDATE pda_admins SET user_id = :user_id WHERE id = :id"),
                    {"user_id": user.id, "id": row.id}
                )
        db.commit()

        nulls = db.execute(text("SELECT id FROM pda_admins WHERE user_id IS NULL")).fetchall()
        if nulls:
            ids = ", ".join(str(r[0]) for r in nulls[:20])
            raise RuntimeError(f"Cannot enforce pda_admins.user_id NOT NULL; missing user_id for admin ids: {ids}")

        db.execute(text("ALTER TABLE pda_admins ALTER COLUMN user_id SET NOT NULL"))
        db.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS pda_admins_user_id_key ON pda_admins (user_id)"))
        db.commit()

        db.execute(text("ALTER TABLE pda_admins DROP COLUMN IF EXISTS regno"))
        db.commit()

    fk_exists = db.execute(
        text(
            """
            SELECT 1
            FROM information_schema.table_constraints
            WHERE table_name = 'pda_admins'
              AND constraint_type = 'FOREIGN KEY'
              AND constraint_name = 'pda_admins_user_id_fkey'
            """
        )
    ).fetchone()
    if not fk_exists:
        db.execute(
            text(
                """
                ALTER TABLE pda_admins
                ADD CONSTRAINT pda_admins_user_id_fkey
                FOREIGN KEY (user_id)
                REFERENCES users(id)
                ON DELETE RESTRICT
                """
            )
        )
        db.commit()


# Backward-compatible alias used by existing imports/calls.
def reset_pda_admins_table(engine):
    ensure_pda_admins_table(engine)


def drop_admin_logs_fk(engine):
    with engine.begin() as conn:
        if not _table_exists(conn, "admin_logs"):
            return
        constraints = conn.execute(
            text(
                """
                SELECT constraint_name
                FROM information_schema.table_constraints
                WHERE table_name = 'admin_logs' AND constraint_type = 'FOREIGN KEY'
                """
            )
        ).fetchall()
        for (constraint_name,) in constraints:
            conn.execute(text(f"ALTER TABLE admin_logs DROP CONSTRAINT IF EXISTS {constraint_name}"))


def ensure_email_auth_columns(engine):
    with engine.begin() as conn:
        if _table_exists(conn, "users"):
            if not _column_exists(conn, "users", "email_verified_at"):
                conn.execute(text("ALTER TABLE users ADD COLUMN email_verified_at TIMESTAMPTZ"))
            if not _column_exists(conn, "users", "email_verification_token_hash"):
                conn.execute(text("ALTER TABLE users ADD COLUMN email_verification_token_hash VARCHAR(255)"))
            if not _column_exists(conn, "users", "email_verification_expires_at"):
                conn.execute(text("ALTER TABLE users ADD COLUMN email_verification_expires_at TIMESTAMPTZ"))
            if not _column_exists(conn, "users", "email_verification_sent_at"):
                conn.execute(text("ALTER TABLE users ADD COLUMN email_verification_sent_at TIMESTAMPTZ"))
            if not _column_exists(conn, "users", "password_reset_token_hash"):
                conn.execute(text("ALTER TABLE users ADD COLUMN password_reset_token_hash VARCHAR(255)"))
            if not _column_exists(conn, "users", "password_reset_expires_at"):
                conn.execute(text("ALTER TABLE users ADD COLUMN password_reset_expires_at TIMESTAMPTZ"))
            if not _column_exists(conn, "users", "password_reset_sent_at"):
                conn.execute(text("ALTER TABLE users ADD COLUMN password_reset_sent_at TIMESTAMPTZ"))

def normalize_pda_team_schema(db: Session):
    if not _table_exists(db.connection(), "pda_team"):
        return

    has_regno = _column_exists(db.connection(), "pda_team", "regno")
    if has_regno:
        rows = db.execute(
            text(
                """
                SELECT id, regno, name, email, phno, dept, photo_url, user_id
                FROM pda_team
                """
            )
        ).fetchall()
        for row in rows:
            regno = row.regno
            if not regno:
                continue
            user = db.query(PdaUser).filter(PdaUser.regno == regno).first()
            if not user:
                user = PdaUser(
                    regno=regno,
                    email=row.email or f"{regno}@pda.local",
                    hashed_password=get_password_hash("password"),
                    name=row.name or f"PDA Member {regno}",
                    phno=row.phno,
                    dept=row.dept,
                    image_url=row.photo_url,
                    json_content={},
                    is_member=True
                )
                db.add(user)
                db.flush()
            else:
                if row.photo_url and not user.image_url:
                    user.image_url = row.photo_url
                if row.name and not user.name:
                    user.name = row.name
                if row.email and not user.email:
                    user.email = row.email
                if row.phno and not user.phno:
                    user.phno = row.phno
                if row.dept and not user.dept:
                    user.dept = row.dept

            if not row.user_id:
                db.execute(
                    text("UPDATE pda_team SET user_id = :user_id WHERE id = :id"),
                    {"user_id": user.id, "id": row.id}
                )

        db.commit()

        for col in ("name", "regno", "dept", "email", "phno", "photo_url"):
            if _column_exists(db.connection(), "pda_team", col):
                db.execute(text(f"ALTER TABLE pda_team DROP COLUMN IF EXISTS {col}"))
        db.commit()

    db.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS pda_team_user_id_key ON pda_team (user_id)"))
    db.commit()


def migrate_pda_team_social_handles_to_users(db: Session):
    if not _table_exists(db.connection(), "users"):
        return

    changed = False

    if not _column_exists(db.connection(), "users", "instagram_url"):
        db.execute(text("ALTER TABLE users ADD COLUMN instagram_url VARCHAR(500)"))
        changed = True
    if not _column_exists(db.connection(), "users", "linkedin_url"):
        db.execute(text("ALTER TABLE users ADD COLUMN linkedin_url VARCHAR(500)"))
        changed = True
    if not _column_exists(db.connection(), "users", "github_url"):
        db.execute(text("ALTER TABLE users ADD COLUMN github_url VARCHAR(500)"))
        changed = True

    if not _table_exists(db.connection(), "pda_team"):
        if changed:
            db.commit()
        return

    has_instagram = _column_exists(db.connection(), "pda_team", "instagram_url")
    has_linkedin = _column_exists(db.connection(), "pda_team", "linkedin_url")
    has_github = _column_exists(db.connection(), "pda_team", "github_url")
    if has_instagram or has_linkedin or has_github:
        select_columns = ["user_id"]
        if has_instagram:
            select_columns.append("instagram_url")
        if has_linkedin:
            select_columns.append("linkedin_url")
        if has_github:
            select_columns.append("github_url")

        rows = db.execute(
            text(f"SELECT {', '.join(select_columns)} FROM pda_team WHERE user_id IS NOT NULL")
        ).mappings().all()
        for row in rows:
            instagram_url = row.get("instagram_url")
            linkedin_url = row.get("linkedin_url")
            github_url = row.get("github_url")
            db.execute(
                text(
                    """
                    UPDATE users
                    SET instagram_url = COALESCE(NULLIF(TRIM(users.instagram_url), ''), :instagram_url),
                        linkedin_url = COALESCE(NULLIF(TRIM(users.linkedin_url), ''), :linkedin_url),
                        github_url = COALESCE(NULLIF(TRIM(users.github_url), ''), :github_url)
                    WHERE id = :user_id
                    """
                ),
                {
                    "user_id": row["user_id"],
                    "instagram_url": str(instagram_url).strip() if instagram_url else None,
                    "linkedin_url": str(linkedin_url).strip() if linkedin_url else None,
                    "github_url": str(github_url).strip() if github_url else None,
                }
            )
        changed = True

    if _column_exists(db.connection(), "pda_team", "instagram_url"):
        db.execute(text("ALTER TABLE pda_team DROP COLUMN instagram_url"))
        changed = True
    if _column_exists(db.connection(), "pda_team", "linkedin_url"):
        db.execute(text("ALTER TABLE pda_team DROP COLUMN linkedin_url"))
        changed = True
    if _column_exists(db.connection(), "pda_team", "github_url"):
        db.execute(text("ALTER TABLE pda_team DROP COLUMN github_url"))
        changed = True

    if changed:
        db.commit()


def normalize_pda_team(db: Session):
    team_members = db.query(PdaTeam).all()
    allowed_teams = {
        "Executive",
        "Content Creation",
        "Event Management",
        "Design",
        "Website Design",
        "Public Relations",
        "Podcast",
        "Library"
    }
    allowed_designations = {
        "Root",
        "Chairperson",
        "Vice Chairperson",
        "Treasurer",
        "General Secretary",
        "Head",
        "JS",
        "Member",
        "Volunteer"
    }
    for member in team_members:
        if member.team not in allowed_teams:
            member.team = None
        if member.designation not in allowed_designations:
            member.designation = None
    db.commit()


def backfill_is_member_from_team_once(db: Session):
    marker_key = "migration_backfill_is_member_from_team_v1"
    conn = db.connection()

    if not _table_exists(conn, "users") or not _table_exists(conn, "pda_team"):
        return

    marker_exists = False
    if _table_exists(conn, "system_config"):
        marker_exists = bool(
            db.execute(
                text("SELECT 1 FROM system_config WHERE key = :key"),
                {"key": marker_key},
            ).fetchone()
        )
    if marker_exists:
        return

    db.execute(
        text(
            """
            UPDATE users AS u
            SET is_member = TRUE
            FROM pda_team AS t
            WHERE t.user_id = u.id
              AND t.team IS NOT NULL
              AND TRIM(t.team) <> ''
              AND t.designation IS NOT NULL
              AND TRIM(t.designation) <> ''
            """
        )
    )

    if _table_exists(conn, "system_config"):
        db.execute(
            text(
                """
                INSERT INTO system_config (key, value)
                VALUES (:key, 'done')
                ON CONFLICT (key) DO UPDATE SET value = 'done'
                """
            ),
            {"key": marker_key},
        )

    db.commit()


def ensure_superadmin_policies(db: Session):
    superadmins = (
        db.query(PdaTeam, PdaUser)
        .join(PdaUser, PdaTeam.user_id == PdaUser.id)
        .filter(PdaTeam.designation.in_(["Root", "Chairperson", "Vice Chairperson"]))
        .all()
    )
    for member, user in superadmins:
        admin_row = db.query(PdaAdmin).filter(PdaAdmin.user_id == user.id).first()
        if not admin_row:
            admin_row = PdaAdmin(user_id=user.id, policy={"home": True, "superAdmin": True, "events": {}})
            db.add(admin_row)
        elif not admin_row.policy:
            admin_row.policy = {"home": True, "superAdmin": True, "events": {}}
        else:
            policy = dict(admin_row.policy)
            policy["home"] = True
            policy.pop("pf", None)
            policy["superAdmin"] = True
            if not isinstance(policy.get("events"), dict):
                policy["events"] = {}
            admin_row.policy = policy
    db.commit()


def ensure_default_superadmin(db: Session):
    regno = "0000000000"
    user = db.query(PdaUser).filter(PdaUser.regno == regno).first()
    if not user:
        user = PdaUser(
            regno=regno,
            email="superadmin@pda.local",
            hashed_password=get_password_hash("admin123"),
            name="Super Admin",
            phno=None,
            dept=None,
            image_url=None,
            json_content={},
            is_member=True
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    team = db.query(PdaTeam).filter(PdaTeam.user_id == user.id).first()
    if not team:
        team = PdaTeam(
            user_id=user.id,
            team="Executive",
            designation="Root"
        )
        db.add(team)
        db.commit()
    else:
        team.user_id = user.id
        team.team = "Executive"
        team.designation = "Root"
        db.commit()

    admin_row = db.query(PdaAdmin).filter(PdaAdmin.user_id == user.id).first()
    if not admin_row:
        admin_row = PdaAdmin(user_id=user.id, policy={"home": True, "superAdmin": True, "events": {}})
        db.add(admin_row)
        db.commit()
    else:
        policy = dict(admin_row.policy or {})
        policy.setdefault("home", True)
        policy.pop("pf", None)
        policy.setdefault("superAdmin", True)
        if not isinstance(policy.get("events"), dict):
            policy["events"] = {}
        admin_row.policy = policy
        db.commit()


def ensure_pda_event_tables(engine):
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS pda_events (
                    id SERIAL PRIMARY KEY,
                    slug VARCHAR(120) UNIQUE NOT NULL,
                    event_code VARCHAR(20) UNIQUE NOT NULL,
                    club_id INTEGER NOT NULL DEFAULT 1,
                    title VARCHAR(255) NOT NULL,
                    description TEXT,
                    start_date DATE,
                    end_date DATE,
                    poster_url TEXT,
                    whatsapp_url VARCHAR(500),
                    external_url_name VARCHAR(120) NOT NULL DEFAULT 'Join whatsapp channel',
                    event_type VARCHAR(30) NOT NULL,
                    format VARCHAR(30) NOT NULL,
                    template_option VARCHAR(50) NOT NULL,
                    participant_mode VARCHAR(30) NOT NULL,
                    round_mode VARCHAR(30) NOT NULL,
                    round_count INTEGER NOT NULL DEFAULT 1,
                    team_min_size INTEGER,
                    team_max_size INTEGER,
                    is_visible BOOLEAN NOT NULL DEFAULT TRUE,
                    status VARCHAR(20) NOT NULL DEFAULT 'closed',
                    created_at TIMESTAMPTZ DEFAULT now(),
                    updated_at TIMESTAMPTZ
                )
                """
            )
        )
        conn.execute(text("ALTER TABLE pda_events ADD COLUMN IF NOT EXISTS start_date DATE"))
        conn.execute(text("ALTER TABLE pda_events ADD COLUMN IF NOT EXISTS end_date DATE"))
        conn.execute(text("ALTER TABLE pda_events ADD COLUMN IF NOT EXISTS whatsapp_url VARCHAR(500)"))
        conn.execute(
            text(
                "ALTER TABLE pda_events "
                "ADD COLUMN IF NOT EXISTS external_url_name VARCHAR(120) NOT NULL DEFAULT 'Join whatsapp channel'"
            )
        )
        conn.execute(
            text(
                "UPDATE pda_events "
                "SET external_url_name = 'Join whatsapp channel' "
                "WHERE external_url_name IS NULL OR btrim(external_url_name) = ''"
            )
        )
        conn.execute(text("ALTER TABLE pda_events ADD COLUMN IF NOT EXISTS is_visible BOOLEAN NOT NULL DEFAULT TRUE"))
        conn.execute(text("ALTER TABLE pda_events ADD COLUMN IF NOT EXISTS registration_open BOOLEAN NOT NULL DEFAULT TRUE"))
        conn.execute(text("ALTER TABLE pda_events ALTER COLUMN poster_url TYPE TEXT"))
        if _table_exists(conn, "pda_event_rounds"):
            conn.execute(text("ALTER TABLE pda_event_rounds ADD COLUMN IF NOT EXISTS round_poster TEXT"))
            conn.execute(text("ALTER TABLE pda_event_rounds ADD COLUMN IF NOT EXISTS whatsapp_url VARCHAR(500)"))
            conn.execute(text("ALTER TABLE pda_event_rounds ADD COLUMN IF NOT EXISTS external_url VARCHAR(500)"))
            conn.execute(
                text(
                    "ALTER TABLE pda_event_rounds "
                    "ADD COLUMN IF NOT EXISTS external_url_name VARCHAR(120) NOT NULL DEFAULT 'Explore Round'"
                )
            )
            conn.execute(
                text(
                    "UPDATE pda_event_rounds "
                    "SET external_url = whatsapp_url "
                    "WHERE external_url IS NULL AND whatsapp_url IS NOT NULL"
                )
            )

        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS pda_event_teams (
                    id SERIAL PRIMARY KEY,
                    event_id INTEGER NOT NULL REFERENCES pda_events(id) ON DELETE CASCADE,
                    team_code VARCHAR(5) NOT NULL,
                    team_name VARCHAR(255) NOT NULL,
                    team_lead_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
                    created_at TIMESTAMPTZ DEFAULT now(),
                    updated_at TIMESTAMPTZ,
                    CONSTRAINT uq_pda_event_team_event_code UNIQUE (event_id, team_code)
                )
                """
            )
        )

        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS pda_event_registrations (
                    id SERIAL PRIMARY KEY,
                    event_id INTEGER NOT NULL REFERENCES pda_events(id) ON DELETE CASCADE,
                    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                    team_id INTEGER REFERENCES pda_event_teams(id) ON DELETE CASCADE,
                    entity_type VARCHAR(10) NOT NULL,
                    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
                    referral_code VARCHAR(16),
                    referred_by VARCHAR(16),
                    referral_count INTEGER NOT NULL DEFAULT 0,
                    registered_at TIMESTAMPTZ DEFAULT now(),
                    CONSTRAINT uq_pda_event_registration_event_user UNIQUE (event_id, user_id),
                    CONSTRAINT uq_pda_event_registration_event_team UNIQUE (event_id, team_id)
                )
                """
            )
        )

        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS pda_event_team_members (
                    id SERIAL PRIMARY KEY,
                    team_id INTEGER NOT NULL REFERENCES pda_event_teams(id) ON DELETE CASCADE,
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    role VARCHAR(20) NOT NULL DEFAULT 'member',
                    created_at TIMESTAMPTZ DEFAULT now(),
                    updated_at TIMESTAMPTZ,
                    CONSTRAINT uq_pda_event_team_member_team_user UNIQUE (team_id, user_id)
                )
                """
            )
        )

        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS pda_event_logs (
                    id SERIAL PRIMARY KEY,
                    event_id INTEGER REFERENCES pda_events(id) ON DELETE SET NULL,
                    event_slug VARCHAR(120) NOT NULL,
                    admin_id INTEGER,
                    admin_register_number VARCHAR(20) NOT NULL,
                    admin_name VARCHAR(255) NOT NULL,
                    action VARCHAR(255) NOT NULL,
                    method VARCHAR(10),
                    path VARCHAR(255),
                    meta JSONB,
                    created_at TIMESTAMPTZ DEFAULT now()
                )
                """
            )
        )

        if not _column_exists(conn, "pda_event_registrations", "status"):
            conn.execute(text("ALTER TABLE pda_event_registrations ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'"))
        if not _column_exists(conn, "pda_event_registrations", "referral_code"):
            conn.execute(text("ALTER TABLE pda_event_registrations ADD COLUMN referral_code VARCHAR(16)"))
        if not _column_exists(conn, "pda_event_registrations", "referred_by"):
            conn.execute(text("ALTER TABLE pda_event_registrations ADD COLUMN referred_by VARCHAR(16)"))
        if not _column_exists(conn, "pda_event_registrations", "referral_count"):
            conn.execute(text("ALTER TABLE pda_event_registrations ADD COLUMN referral_count INTEGER NOT NULL DEFAULT 0"))

        conn.execute(
            text(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS uq_pda_event_registration_referral_code
                ON pda_event_registrations(event_id, referral_code)
                WHERE entity_type = 'USER' AND referral_code IS NOT NULL
                """
            )
        )
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_pda_event_registration_event_status ON pda_event_registrations(event_id, status)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_pda_event_registration_event_referred_by ON pda_event_registrations(event_id, referred_by)"))
        conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS idx_pda_event_registration_event_entity_status_user "
                "ON pda_event_registrations(event_id, entity_type, status, user_id)"
            )
        )
        conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS idx_pda_event_registration_event_entity_status_team "
                "ON pda_event_registrations(event_id, entity_type, status, team_id)"
            )
        )
        if _table_exists(conn, "pda_event_scores"):
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS idx_pda_event_scores_event_round_entity_present_score "
                    "ON pda_event_scores(event_id, round_id, entity_type, is_present, normalized_score)"
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS idx_pda_event_scores_event_entity_user_round "
                    "ON pda_event_scores(event_id, entity_type, user_id, round_id)"
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS idx_pda_event_scores_event_entity_team_round "
                    "ON pda_event_scores(event_id, entity_type, team_id, round_id)"
                )
            )
        if _table_exists(conn, "pda_event_attendance"):
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS idx_pda_event_attendance_event_entity_user_present "
                    "ON pda_event_attendance(event_id, entity_type, user_id, is_present)"
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS idx_pda_event_attendance_event_entity_team_present "
                    "ON pda_event_attendance(event_id, entity_type, team_id, is_present)"
                )
            )
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_pda_event_logs_event_created ON pda_event_logs(event_id, created_at DESC)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_pda_event_logs_slug_created ON pda_event_logs(event_slug, created_at DESC)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_pda_event_logs_admin_created ON pda_event_logs(admin_id, created_at DESC)"))

        # Compatibility path: older deployments may have created SQL enum type via ORM.
        # Some environments store enum labels as uppercase names (e.g. ACTIVE),
        # while others may use title-case values (e.g. Active). Add the missing
        # Reveal label in whichever style the existing enum uses.
        if conn.dialect.name == "postgresql":
            conn.execute(
                text(
                    """
                    DO $$
                    DECLARE
                        has_upper_style BOOLEAN := FALSE;
                        has_title_style BOOLEAN := FALSE;
                    BEGIN
                        IF EXISTS (
                            SELECT 1
                            FROM pg_type
                            WHERE typname = 'pdaeventroundstate'
                        ) THEN
                            SELECT EXISTS (
                                SELECT 1
                                FROM pg_enum e
                                JOIN pg_type t ON t.oid = e.enumtypid
                                WHERE t.typname = 'pdaeventroundstate'
                                  AND e.enumlabel = 'ACTIVE'
                            )
                            INTO has_upper_style;

                            SELECT EXISTS (
                                SELECT 1
                                FROM pg_enum e
                                JOIN pg_type t ON t.oid = e.enumtypid
                                WHERE t.typname = 'pdaeventroundstate'
                                  AND e.enumlabel = 'Active'
                            )
                            INTO has_title_style;

                            IF has_upper_style THEN
                                IF NOT EXISTS (
                                    SELECT 1
                                    FROM pg_enum e
                                    JOIN pg_type t ON t.oid = e.enumtypid
                                    WHERE t.typname = 'pdaeventroundstate'
                                      AND e.enumlabel = 'REVEAL'
                                ) THEN
                                    ALTER TYPE pdaeventroundstate ADD VALUE 'REVEAL';
                                END IF;
                            ELSIF has_title_style THEN
                                IF NOT EXISTS (
                                    SELECT 1
                                    FROM pg_enum e
                                    JOIN pg_type t ON t.oid = e.enumtypid
                                    WHERE t.typname = 'pdaeventroundstate'
                                      AND e.enumlabel = 'Reveal'
                                ) THEN
                                    ALTER TYPE pdaeventroundstate ADD VALUE 'Reveal';
                                END IF;
                            ELSE
                                IF NOT EXISTS (
                                    SELECT 1
                                    FROM pg_enum e
                                    JOIN pg_type t ON t.oid = e.enumtypid
                                    WHERE t.typname = 'pdaeventroundstate'
                                      AND e.enumlabel = 'REVEAL'
                                ) THEN
                                    ALTER TYPE pdaeventroundstate ADD VALUE 'REVEAL';
                                END IF;
                            END IF;
                        END IF;
                    END
                    $$;
                    """
                )
            )
            conn.execute(
                text(
                    """
                    DO $$
                    BEGIN
                        IF EXISTS (
                            SELECT 1
                            FROM pg_type
                            WHERE typname = 'pdaeventtype'
                        ) THEN
                            IF NOT EXISTS (
                                SELECT 1
                                FROM pg_enum e
                                JOIN pg_type t ON t.oid = e.enumtypid
                                WHERE t.typname = 'pdaeventtype'
                                  AND e.enumlabel = 'TECHNICAL'
                            ) THEN
                                ALTER TYPE pdaeventtype ADD VALUE 'TECHNICAL';
                            END IF;
                            IF NOT EXISTS (
                                SELECT 1
                                FROM pg_enum e
                                JOIN pg_type t ON t.oid = e.enumtypid
                                WHERE t.typname = 'pdaeventtype'
                                  AND e.enumlabel = 'FUNTECHINICAL'
                            ) THEN
                                ALTER TYPE pdaeventtype ADD VALUE 'FUNTECHINICAL';
                            END IF;
                            IF NOT EXISTS (
                                SELECT 1
                                FROM pg_enum e
                                JOIN pg_type t ON t.oid = e.enumtypid
                                WHERE t.typname = 'pdaeventtype'
                                  AND e.enumlabel = 'HACKATHON'
                            ) THEN
                                ALTER TYPE pdaeventtype ADD VALUE 'HACKATHON';
                            END IF;
                            IF NOT EXISTS (
                                SELECT 1
                                FROM pg_enum e
                                JOIN pg_type t ON t.oid = e.enumtypid
                                WHERE t.typname = 'pdaeventtype'
                                  AND e.enumlabel = 'SIGNATURE'
                            ) THEN
                                ALTER TYPE pdaeventtype ADD VALUE 'SIGNATURE';
                            END IF;
                            IF NOT EXISTS (
                                SELECT 1
                                FROM pg_enum e
                                JOIN pg_type t ON t.oid = e.enumtypid
                                WHERE t.typname = 'pdaeventtype'
                                  AND e.enumlabel = 'NONTECHINICAL'
                            ) THEN
                                ALTER TYPE pdaeventtype ADD VALUE 'NONTECHINICAL';
                            END IF;
                        END IF;
                    END
                    $$;
                    """
                )
            )


def ensure_pda_event_registration_open_column(engine):
    with engine.begin() as conn:
        if _table_exists(conn, "pda_events"):
            conn.execute(text("ALTER TABLE pda_events ADD COLUMN IF NOT EXISTS registration_open BOOLEAN NOT NULL DEFAULT TRUE"))


def ensure_pda_event_round_submission_tables(engine):
    with engine.begin() as conn:
        if _table_exists(conn, "pda_event_rounds"):
            conn.execute(text("ALTER TABLE pda_event_rounds ADD COLUMN IF NOT EXISTS requires_submission BOOLEAN NOT NULL DEFAULT FALSE"))
            conn.execute(text("ALTER TABLE pda_event_rounds ADD COLUMN IF NOT EXISTS submission_mode VARCHAR(32) NOT NULL DEFAULT 'file_or_link'"))
            conn.execute(text("ALTER TABLE pda_event_rounds ADD COLUMN IF NOT EXISTS submission_deadline TIMESTAMPTZ"))
            conn.execute(text("ALTER TABLE pda_event_rounds ADD COLUMN IF NOT EXISTS allowed_mime_types JSONB"))
            conn.execute(text("ALTER TABLE pda_event_rounds ADD COLUMN IF NOT EXISTS max_file_size_mb INTEGER NOT NULL DEFAULT 25"))
            conn.execute(
                text(
                    """
                    UPDATE pda_event_rounds
                    SET allowed_mime_types = CAST(:default_types AS jsonb)
                    WHERE allowed_mime_types IS NULL
                    """
                ),
                {
                    "default_types": json.dumps([
                        "application/pdf",
                        "application/vnd.ms-powerpoint",
                        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
                        "image/png",
                        "image/jpeg",
                        "image/webp",
                        "application/zip",
                    ])
                },
            )

        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS pda_event_round_submissions (
                    id SERIAL PRIMARY KEY,
                    event_id INTEGER NOT NULL REFERENCES pda_events(id) ON DELETE CASCADE,
                    round_id INTEGER NOT NULL REFERENCES pda_event_rounds(id) ON DELETE CASCADE,
                    entity_type VARCHAR(10) NOT NULL,
                    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                    team_id INTEGER REFERENCES pda_event_teams(id) ON DELETE CASCADE,
                    submission_type VARCHAR(16) NOT NULL,
                    file_url VARCHAR(800),
                    file_name VARCHAR(255),
                    file_size_bytes BIGINT,
                    mime_type VARCHAR(255),
                    link_url VARCHAR(800),
                    notes TEXT,
                    version INTEGER NOT NULL DEFAULT 1,
                    is_locked BOOLEAN NOT NULL DEFAULT FALSE,
                    submitted_at TIMESTAMPTZ DEFAULT now(),
                    updated_at TIMESTAMPTZ,
                    updated_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL
                )
                """
            )
        )
        conn.execute(
            text(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS uq_pda_event_round_submission_entity
                ON pda_event_round_submissions(event_id, round_id, entity_type, user_id, team_id)
                """
            )
        )
        conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS idx_pda_round_submission_event_round "
                "ON pda_event_round_submissions(event_id, round_id)"
            )
        )
        conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS idx_pda_round_submission_entity_user "
                "ON pda_event_round_submissions(event_id, entity_type, user_id)"
            )
        )
        conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS idx_pda_round_submission_entity_team "
                "ON pda_event_round_submissions(event_id, entity_type, team_id)"
            )
        )


def ensure_community_event_tables(engine):
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS community_events (
                    id SERIAL PRIMARY KEY,
                    slug VARCHAR(120) UNIQUE NOT NULL,
                    event_code VARCHAR(20) UNIQUE NOT NULL,
                    community_id INTEGER NOT NULL REFERENCES persohub_communities(id) ON DELETE CASCADE,
                    title VARCHAR(255) NOT NULL,
                    description TEXT,
                    start_date DATE,
                    end_date DATE,
                    event_time TIME,
                    poster_url TEXT,
                    whatsapp_url VARCHAR(500),
                    external_url_name VARCHAR(120) NOT NULL DEFAULT 'Join whatsapp channel',
                    event_type VARCHAR(30) NOT NULL,
                    format VARCHAR(30) NOT NULL,
                    template_option VARCHAR(50) NOT NULL,
                    participant_mode VARCHAR(30) NOT NULL,
                    round_mode VARCHAR(30) NOT NULL,
                    round_count INTEGER NOT NULL DEFAULT 1,
                    team_min_size INTEGER,
                    team_max_size INTEGER,
                    is_visible BOOLEAN NOT NULL DEFAULT TRUE,
                    status VARCHAR(20) NOT NULL DEFAULT 'closed',
                    created_at TIMESTAMPTZ DEFAULT now(),
                    updated_at TIMESTAMPTZ
                )
                """
            )
        )
        conn.execute(text("ALTER TABLE community_events ADD COLUMN IF NOT EXISTS start_date DATE"))
        conn.execute(text("ALTER TABLE community_events ADD COLUMN IF NOT EXISTS end_date DATE"))
        conn.execute(text("ALTER TABLE community_events ADD COLUMN IF NOT EXISTS event_time TIME"))
        conn.execute(text("ALTER TABLE community_events ADD COLUMN IF NOT EXISTS whatsapp_url VARCHAR(500)"))
        conn.execute(
            text(
                "ALTER TABLE community_events "
                "ADD COLUMN IF NOT EXISTS external_url_name VARCHAR(120) NOT NULL DEFAULT 'Join whatsapp channel'"
            )
        )
        conn.execute(
            text(
                "UPDATE community_events "
                "SET external_url_name = 'Join whatsapp channel' "
                "WHERE external_url_name IS NULL OR btrim(external_url_name) = ''"
            )
        )
        conn.execute(text("ALTER TABLE community_events ADD COLUMN IF NOT EXISTS is_visible BOOLEAN NOT NULL DEFAULT TRUE"))
        conn.execute(text("ALTER TABLE community_events ALTER COLUMN poster_url TYPE TEXT"))

        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS community_sympo (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    organising_club_id INTEGER NOT NULL REFERENCES persohub_clubs(id) ON DELETE RESTRICT,
                    event_id INTEGER NOT NULL REFERENCES community_events(id) ON DELETE CASCADE,
                    content JSONB
                )
                """
            )
        )
        conn.execute(text("ALTER TABLE community_sympo ADD COLUMN IF NOT EXISTS content JSONB"))
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS community_sympos (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    organising_club_id INTEGER NOT NULL REFERENCES persohub_clubs(id) ON DELETE CASCADE,
                    content JSONB,
                    created_at TIMESTAMPTZ DEFAULT now(),
                    updated_at TIMESTAMPTZ,
                    CONSTRAINT uq_community_sympos_club_name UNIQUE (organising_club_id, name)
                )
                """
            )
        )
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS community_sympo_events (
                    id SERIAL PRIMARY KEY,
                    sympo_id INTEGER NOT NULL REFERENCES community_sympos(id) ON DELETE CASCADE,
                    event_id INTEGER NOT NULL REFERENCES community_events(id) ON DELETE CASCADE,
                    created_at TIMESTAMPTZ DEFAULT now(),
                    CONSTRAINT uq_community_sympo_events_pair UNIQUE (sympo_id, event_id),
                    CONSTRAINT uq_community_sympo_events_event UNIQUE (event_id)
                )
                """
            )
        )

        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS community_event_teams (
                    id SERIAL PRIMARY KEY,
                    event_id INTEGER NOT NULL REFERENCES community_events(id) ON DELETE CASCADE,
                    team_code VARCHAR(5) NOT NULL,
                    team_name VARCHAR(255) NOT NULL,
                    team_lead_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
                    created_at TIMESTAMPTZ DEFAULT now(),
                    updated_at TIMESTAMPTZ,
                    CONSTRAINT uq_community_event_team_event_code UNIQUE (event_id, team_code)
                )
                """
            )
        )

        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS community_event_rounds (
                    id SERIAL PRIMARY KEY,
                    event_id INTEGER NOT NULL REFERENCES community_events(id) ON DELETE CASCADE,
                    round_no INTEGER NOT NULL,
                    name VARCHAR(255) NOT NULL,
                    description TEXT,
                    round_poster TEXT,
                    whatsapp_url VARCHAR(500),
                    external_url VARCHAR(500),
                    external_url_name VARCHAR(120) NOT NULL DEFAULT 'Explore Round',
                    date TIMESTAMPTZ,
                    mode VARCHAR(30) NOT NULL DEFAULT 'OFFLINE',
                    state VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
                    evaluation_criteria JSONB,
                    elimination_type VARCHAR(20),
                    elimination_value DOUBLE PRECISION,
                    is_frozen BOOLEAN NOT NULL DEFAULT FALSE,
                    created_at TIMESTAMPTZ DEFAULT now(),
                    updated_at TIMESTAMPTZ,
                    CONSTRAINT uq_community_event_round_event_round_no UNIQUE (event_id, round_no)
                )
                """
            )
        )
        conn.execute(
            text(
                "UPDATE community_event_rounds "
                "SET external_url = whatsapp_url "
                "WHERE external_url IS NULL AND whatsapp_url IS NOT NULL"
            )
        )

        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS community_event_registrations (
                    id SERIAL PRIMARY KEY,
                    event_id INTEGER NOT NULL REFERENCES community_events(id) ON DELETE CASCADE,
                    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                    team_id INTEGER REFERENCES community_event_teams(id) ON DELETE CASCADE,
                    entity_type VARCHAR(10) NOT NULL,
                    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
                    referral_code VARCHAR(16),
                    referred_by VARCHAR(16),
                    referral_count INTEGER NOT NULL DEFAULT 0,
                    registered_at TIMESTAMPTZ DEFAULT now(),
                    CONSTRAINT uq_community_event_registration_event_user UNIQUE (event_id, user_id),
                    CONSTRAINT uq_community_event_registration_event_team UNIQUE (event_id, team_id)
                )
                """
            )
        )

        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS community_event_team_members (
                    id SERIAL PRIMARY KEY,
                    team_id INTEGER NOT NULL REFERENCES community_event_teams(id) ON DELETE CASCADE,
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    role VARCHAR(20) NOT NULL DEFAULT 'member',
                    created_at TIMESTAMPTZ DEFAULT now(),
                    updated_at TIMESTAMPTZ,
                    CONSTRAINT uq_community_event_team_member_team_user UNIQUE (team_id, user_id)
                )
                """
            )
        )

        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS community_event_attendance (
                    id SERIAL PRIMARY KEY,
                    event_id INTEGER NOT NULL REFERENCES community_events(id) ON DELETE CASCADE,
                    round_id INTEGER REFERENCES community_event_rounds(id) ON DELETE CASCADE,
                    entity_type VARCHAR(10) NOT NULL,
                    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                    team_id INTEGER REFERENCES community_event_teams(id) ON DELETE CASCADE,
                    is_present BOOLEAN NOT NULL DEFAULT FALSE,
                    marked_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                    marked_at TIMESTAMPTZ DEFAULT now(),
                    CONSTRAINT uq_community_event_attendance_entity UNIQUE (event_id, round_id, entity_type, user_id, team_id)
                )
                """
            )
        )

        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS community_event_scores (
                    id SERIAL PRIMARY KEY,
                    event_id INTEGER NOT NULL REFERENCES community_events(id) ON DELETE CASCADE,
                    round_id INTEGER NOT NULL REFERENCES community_event_rounds(id) ON DELETE CASCADE,
                    entity_type VARCHAR(10) NOT NULL,
                    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                    team_id INTEGER REFERENCES community_event_teams(id) ON DELETE CASCADE,
                    criteria_scores JSONB,
                    total_score DOUBLE PRECISION NOT NULL DEFAULT 0,
                    normalized_score DOUBLE PRECISION NOT NULL DEFAULT 0,
                    is_present BOOLEAN NOT NULL DEFAULT FALSE,
                    created_at TIMESTAMPTZ DEFAULT now(),
                    updated_at TIMESTAMPTZ,
                    CONSTRAINT uq_community_event_score_entity UNIQUE (event_id, round_id, entity_type, user_id, team_id)
                )
                """
            )
        )

        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS community_event_badges (
                    id SERIAL PRIMARY KEY,
                    event_id INTEGER NOT NULL REFERENCES community_events(id) ON DELETE CASCADE,
                    title VARCHAR(255) NOT NULL,
                    image_url VARCHAR(500),
                    place VARCHAR(30) NOT NULL,
                    score DOUBLE PRECISION,
                    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                    team_id INTEGER REFERENCES community_event_teams(id) ON DELETE CASCADE,
                    created_at TIMESTAMPTZ DEFAULT now(),
                    updated_at TIMESTAMPTZ
                )
                """
            )
        )

        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS community_event_invites (
                    id SERIAL PRIMARY KEY,
                    event_id INTEGER NOT NULL REFERENCES community_events(id) ON DELETE CASCADE,
                    team_id INTEGER NOT NULL REFERENCES community_event_teams(id) ON DELETE CASCADE,
                    invited_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    invited_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
                    status VARCHAR(20) NOT NULL DEFAULT 'pending',
                    created_at TIMESTAMPTZ DEFAULT now(),
                    updated_at TIMESTAMPTZ,
                    CONSTRAINT uq_community_event_invite_unique UNIQUE (event_id, team_id, invited_user_id)
                )
                """
            )
        )

        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS community_event_logs (
                    id SERIAL PRIMARY KEY,
                    event_id INTEGER REFERENCES community_events(id) ON DELETE SET NULL,
                    event_slug VARCHAR(120) NOT NULL,
                    admin_id INTEGER,
                    admin_register_number VARCHAR(20) NOT NULL,
                    admin_name VARCHAR(255) NOT NULL,
                    action VARCHAR(255) NOT NULL,
                    method VARCHAR(10),
                    path VARCHAR(255),
                    meta JSONB,
                    created_at TIMESTAMPTZ DEFAULT now()
                )
                """
            )
        )

        if not _column_exists(conn, "community_event_registrations", "status"):
            conn.execute(text("ALTER TABLE community_event_registrations ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'"))
        if not _column_exists(conn, "community_event_registrations", "referral_code"):
            conn.execute(text("ALTER TABLE community_event_registrations ADD COLUMN referral_code VARCHAR(16)"))
        if not _column_exists(conn, "community_event_registrations", "referred_by"):
            conn.execute(text("ALTER TABLE community_event_registrations ADD COLUMN referred_by VARCHAR(16)"))
        if not _column_exists(conn, "community_event_registrations", "referral_count"):
            conn.execute(text("ALTER TABLE community_event_registrations ADD COLUMN referral_count INTEGER NOT NULL DEFAULT 0"))

        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_community_events_community_created ON community_events(community_id, created_at DESC)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_community_event_rounds_event_round ON community_event_rounds(event_id, round_no ASC)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_community_event_rounds_event_state ON community_event_rounds(event_id, state)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_community_event_registration_event_status ON community_event_registrations(event_id, status)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_community_event_registration_event_referred_by ON community_event_registrations(event_id, referred_by)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_community_event_team_members_team_user ON community_event_team_members(team_id, user_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_community_event_attendance_event_round ON community_event_attendance(event_id, round_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_community_event_scores_event_round ON community_event_scores(event_id, round_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_community_event_badges_event ON community_event_badges(event_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_community_sympo_organising_club ON community_sympo(organising_club_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_community_sympo_event ON community_sympo(event_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_community_sympos_organising_club ON community_sympos(organising_club_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_community_sympo_events_event ON community_sympo_events(event_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_community_event_logs_event_created ON community_event_logs(event_id, created_at DESC)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_community_event_logs_slug_created ON community_event_logs(event_slug, created_at DESC)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_community_event_logs_admin_created ON community_event_logs(admin_id, created_at DESC)"))

        conn.execute(
            text(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS uq_community_event_registration_referral_code
                ON community_event_registrations(event_id, referral_code)
                WHERE entity_type = 'USER' AND referral_code IS NOT NULL
                """
            )
        )

        # Backfill legacy community_sympo rows into normalized community_sympos + community_sympo_events.
        if _table_exists(conn, "community_sympo"):
            legacy_rows = conn.execute(
                text(
                    """
                    SELECT id, name, organising_club_id, event_id, content
                    FROM community_sympo
                    ORDER BY id ASC
                    """
                )
            ).mappings().all()
            for row in legacy_rows:
                sympo_name = str(row.get("name") or "").strip()
                if not sympo_name:
                    continue
                club_id = row.get("organising_club_id")
                event_id = row.get("event_id")
                if not club_id or not event_id:
                    continue

                existing_sympo_id = conn.execute(
                    text(
                        """
                        SELECT id
                        FROM community_sympos
                        WHERE organising_club_id = :club_id AND name = :name
                        LIMIT 1
                        """
                    ),
                    {"club_id": club_id, "name": sympo_name},
                ).scalar()

                content_value = row.get("content")
                content_json = json.dumps(content_value) if content_value is not None else None

                if existing_sympo_id:
                    sympo_id = int(existing_sympo_id)
                    if content_json is not None:
                        conn.execute(
                            text(
                                """
                                UPDATE community_sympos
                                SET content = COALESCE(content, CAST(:content AS JSONB))
                                WHERE id = :sympo_id
                                """
                            ),
                            {"sympo_id": sympo_id, "content": content_json},
                        )
                else:
                    sympo_id = int(
                        conn.execute(
                            text(
                                """
                                INSERT INTO community_sympos (name, organising_club_id, content)
                                VALUES (:name, :club_id, CAST(:content AS JSONB))
                                RETURNING id
                                """
                            ),
                            {"name": sympo_name, "club_id": club_id, "content": content_json},
                        ).scalar()
                    )

                conn.execute(
                    text(
                        """
                        INSERT INTO community_sympo_events (sympo_id, event_id)
                        VALUES (:sympo_id, :event_id)
                        ON CONFLICT DO NOTHING
                        """
                    ),
                    {"sympo_id": sympo_id, "event_id": event_id},
                )


def backfill_pda_event_round_count_once(engine):
    marker_key = "migration_backfill_pda_event_round_count_v1"
    with engine.begin() as conn:
        if not _table_exists(conn, "system_config"):
            return

        marker_exists = bool(
            conn.execute(
                text("SELECT 1 FROM system_config WHERE key = :key"),
                {"key": marker_key},
            ).fetchone()
        )
        if marker_exists:
            return

        if _table_exists(conn, "pda_events") and _table_exists(conn, "pda_event_rounds"):
            conn.execute(
                text(
                    """
                    UPDATE pda_events e
                    SET round_count = COALESCE(r.cnt, 0)
                    FROM (
                        SELECT event_id, COUNT(*)::int AS cnt
                        FROM pda_event_rounds
                        GROUP BY event_id
                    ) r
                    WHERE e.id = r.event_id
                    """
                )
            )
            conn.execute(
                text(
                    """
                    UPDATE pda_events e
                    SET round_count = 0
                    WHERE NOT EXISTS (
                        SELECT 1
                        FROM pda_event_rounds r
                        WHERE r.event_id = e.id
                    )
                    """
                )
            )

        conn.execute(
            text(
                """
                INSERT INTO system_config (key, value)
                VALUES (:key, 'done')
                ON CONFLICT (key) DO UPDATE SET value = 'done'
                """
            ),
            {"key": marker_key},
        )


def ensure_persohub_tables(engine):
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS persohub_clubs (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(120) UNIQUE NOT NULL,
                    profile_id VARCHAR(64) UNIQUE NOT NULL,
                    club_url VARCHAR(500),
                    club_logo_url VARCHAR(500),
                    club_tagline VARCHAR(255),
                    club_description TEXT,
                    created_at TIMESTAMPTZ DEFAULT now(),
                    updated_at TIMESTAMPTZ
                )
                """
            )
        )
        conn.execute(text("ALTER TABLE persohub_clubs ADD COLUMN IF NOT EXISTS profile_id VARCHAR(64)"))
        conn.execute(text("ALTER TABLE persohub_clubs ADD COLUMN IF NOT EXISTS club_tagline VARCHAR(255)"))
        conn.execute(text("ALTER TABLE persohub_clubs ADD COLUMN IF NOT EXISTS club_description TEXT"))

        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS persohub_communities (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(120) NOT NULL,
                    profile_id VARCHAR(64) UNIQUE NOT NULL,
                    club_id INTEGER REFERENCES persohub_clubs(id) ON DELETE SET NULL,
                    admin_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
                    hashed_password VARCHAR(255) NOT NULL,
                    logo_url VARCHAR(500),
                    description TEXT,
                    is_active BOOLEAN NOT NULL DEFAULT TRUE,
                    is_root BOOLEAN NOT NULL DEFAULT FALSE,
                    created_at TIMESTAMPTZ DEFAULT now(),
                    updated_at TIMESTAMPTZ
                )
                """
            )
        )
        conn.execute(text("ALTER TABLE persohub_communities ADD COLUMN IF NOT EXISTS is_root BOOLEAN NOT NULL DEFAULT FALSE"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_persohub_communities_club_id ON persohub_communities(club_id)"))

        # Backfill persohub_clubs.profile_id and enforce uniqueness/non-null.
        clubs_rows = conn.execute(
            text(
                """
                SELECT
                    c.id,
                    c.name,
                    NULLIF(btrim(c.profile_id), '') AS profile_id,
                    (
                        SELECT pc.profile_id
                        FROM persohub_communities pc
                        WHERE pc.club_id = c.id
                          AND pc.is_root = TRUE
                          AND pc.profile_id IS NOT NULL
                          AND btrim(pc.profile_id) <> ''
                        ORDER BY pc.id ASC
                        LIMIT 1
                    ) AS root_profile_id,
                    CASE
                        WHEN EXISTS (
                            SELECT 1
                            FROM persohub_communities pc2
                            WHERE pc2.club_id = c.id
                              AND pc2.is_root = TRUE
                        ) THEN 1 ELSE 0
                    END AS has_root
                FROM persohub_clubs c
                ORDER BY has_root DESC, c.id ASC
                """
            )
        ).mappings().all()

        claimed_profile_ids = set()
        assignments = []
        for row in clubs_rows:
            club_id = int(row["id"])
            current_profile = row.get("profile_id")
            root_profile = row.get("root_profile_id")
            club_name = row.get("name") or f"club-{club_id}"

            candidate = _slugify_club_profile_id(current_profile or root_profile or club_name)
            if not re.fullmatch(r"[a-z0-9-]{3,64}", candidate):
                candidate = _slugify_club_profile_id(club_name)

            dedupe = 2
            final_profile = candidate
            while final_profile in claimed_profile_ids:
                suffix = f"-{dedupe}"
                final_profile = f"{candidate[:64 - len(suffix)]}{suffix}"
                dedupe += 1

            claimed_profile_ids.add(final_profile)
            assignments.append(
                {
                    "club_id": club_id,
                    "current_profile": current_profile,
                    "final_profile": final_profile,
                }
            )

        # Use a two-pass update to avoid transient unique collisions while reshuffling IDs.
        updates = [item for item in assignments if item["current_profile"] != item["final_profile"]]
        for item in updates:
            temp_profile = f"tmp-{item['club_id']}-{secrets.token_hex(4)}"
            conn.execute(
                text("UPDATE persohub_clubs SET profile_id = :profile_id WHERE id = :club_id"),
                {"club_id": item["club_id"], "profile_id": temp_profile},
            )

        for item in updates:
            conn.execute(
                text("UPDATE persohub_clubs SET profile_id = :profile_id WHERE id = :club_id"),
                {"club_id": item["club_id"], "profile_id": item["final_profile"]},
            )

        conn.execute(text("ALTER TABLE persohub_clubs ALTER COLUMN profile_id SET NOT NULL"))
        conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_persohub_clubs_profile_id ON persohub_clubs(profile_id)"))

        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS persohub_community_follows (
                    id SERIAL PRIMARY KEY,
                    community_id INTEGER NOT NULL REFERENCES persohub_communities(id) ON DELETE CASCADE,
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    created_at TIMESTAMPTZ DEFAULT now(),
                    CONSTRAINT uq_persohub_follow_community_user UNIQUE (community_id, user_id)
                )
                """
            )
        )
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_persohub_community_follows_user ON persohub_community_follows(user_id)"))

        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS persohub_posts (
                    id SERIAL PRIMARY KEY,
                    community_id INTEGER NOT NULL REFERENCES persohub_communities(id) ON DELETE CASCADE,
                    admin_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
                    slug_token VARCHAR(64) UNIQUE NOT NULL,
                    description TEXT,
                    like_count INTEGER NOT NULL DEFAULT 0,
                    comment_count INTEGER NOT NULL DEFAULT 0,
                    created_at TIMESTAMPTZ DEFAULT now(),
                    updated_at TIMESTAMPTZ
                )
                """
            )
        )
        conn.execute(text("ALTER TABLE persohub_posts DROP COLUMN IF EXISTS title"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_persohub_posts_community_created ON persohub_posts(community_id, created_at DESC)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_persohub_posts_likes_created ON persohub_posts(like_count DESC, created_at DESC)"))

        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS persohub_post_attachments (
                    id SERIAL PRIMARY KEY,
                    post_id INTEGER NOT NULL REFERENCES persohub_posts(id) ON DELETE CASCADE,
                    s3_url VARCHAR(800) NOT NULL,
                    preview_image_urls JSONB,
                    mime_type VARCHAR(120),
                    attachment_kind VARCHAR(30),
                    size_bytes INTEGER,
                    order_no INTEGER NOT NULL DEFAULT 0,
                    created_at TIMESTAMPTZ DEFAULT now()
                )
                """
            )
        )
        conn.execute(text("ALTER TABLE persohub_post_attachments ADD COLUMN IF NOT EXISTS preview_image_urls JSONB"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_persohub_attachments_post_order ON persohub_post_attachments(post_id, order_no ASC)"))

        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS persohub_post_likes (
                    id SERIAL PRIMARY KEY,
                    post_id INTEGER NOT NULL REFERENCES persohub_posts(id) ON DELETE CASCADE,
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    created_at TIMESTAMPTZ DEFAULT now(),
                    CONSTRAINT uq_persohub_like_post_user UNIQUE (post_id, user_id)
                )
                """
            )
        )
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_persohub_likes_post ON persohub_post_likes(post_id)"))

        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS persohub_post_comments (
                    id SERIAL PRIMARY KEY,
                    post_id INTEGER NOT NULL REFERENCES persohub_posts(id) ON DELETE CASCADE,
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    comment_text TEXT NOT NULL,
                    created_at TIMESTAMPTZ DEFAULT now(),
                    updated_at TIMESTAMPTZ
                )
                """
            )
        )
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_persohub_comments_post_created ON persohub_post_comments(post_id, created_at DESC)"))

        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS persohub_hashtags (
                    id SERIAL PRIMARY KEY,
                    hashtag_text VARCHAR(120) UNIQUE NOT NULL,
                    count INTEGER NOT NULL DEFAULT 0,
                    created_at TIMESTAMPTZ DEFAULT now(),
                    updated_at TIMESTAMPTZ
                )
                """
            )
        )

        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS persohub_post_hashtags (
                    id SERIAL PRIMARY KEY,
                    post_id INTEGER NOT NULL REFERENCES persohub_posts(id) ON DELETE CASCADE,
                    hashtag_id INTEGER NOT NULL REFERENCES persohub_hashtags(id) ON DELETE CASCADE,
                    created_at TIMESTAMPTZ DEFAULT now(),
                    CONSTRAINT uq_persohub_post_hashtag UNIQUE (post_id, hashtag_id)
                )
                """
            )
        )
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_persohub_post_hashtags_hashtag ON persohub_post_hashtags(hashtag_id)"))

        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS persohub_post_mentions (
                    id SERIAL PRIMARY KEY,
                    post_id INTEGER NOT NULL REFERENCES persohub_posts(id) ON DELETE CASCADE,
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    created_at TIMESTAMPTZ DEFAULT now(),
                    CONSTRAINT uq_persohub_post_mention UNIQUE (post_id, user_id)
                )
                """
            )
        )
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_persohub_mentions_post ON persohub_post_mentions(post_id)"))

        # Ensure legacy FK constraints also use ON DELETE CASCADE for post cleanup.
        conn.execute(text("ALTER TABLE persohub_post_attachments DROP CONSTRAINT IF EXISTS persohub_post_attachments_post_id_fkey"))
        conn.execute(
            text(
                """
                ALTER TABLE persohub_post_attachments
                ADD CONSTRAINT persohub_post_attachments_post_id_fkey
                FOREIGN KEY (post_id) REFERENCES persohub_posts(id) ON DELETE CASCADE
                """
            )
        )

        conn.execute(text("ALTER TABLE persohub_post_likes DROP CONSTRAINT IF EXISTS persohub_post_likes_post_id_fkey"))
        conn.execute(
            text(
                """
                ALTER TABLE persohub_post_likes
                ADD CONSTRAINT persohub_post_likes_post_id_fkey
                FOREIGN KEY (post_id) REFERENCES persohub_posts(id) ON DELETE CASCADE
                """
            )
        )

        conn.execute(text("ALTER TABLE persohub_post_comments DROP CONSTRAINT IF EXISTS persohub_post_comments_post_id_fkey"))
        conn.execute(
            text(
                """
                ALTER TABLE persohub_post_comments
                ADD CONSTRAINT persohub_post_comments_post_id_fkey
                FOREIGN KEY (post_id) REFERENCES persohub_posts(id) ON DELETE CASCADE
                """
            )
        )

        conn.execute(text("ALTER TABLE persohub_post_hashtags DROP CONSTRAINT IF EXISTS persohub_post_hashtags_post_id_fkey"))
        conn.execute(
            text(
                """
                ALTER TABLE persohub_post_hashtags
                ADD CONSTRAINT persohub_post_hashtags_post_id_fkey
                FOREIGN KEY (post_id) REFERENCES persohub_posts(id) ON DELETE CASCADE
                """
            )
        )

        conn.execute(text("ALTER TABLE persohub_post_mentions DROP CONSTRAINT IF EXISTS persohub_post_mentions_post_id_fkey"))
        conn.execute(
            text(
                """
                ALTER TABLE persohub_post_mentions
                ADD CONSTRAINT persohub_post_mentions_post_id_fkey
                FOREIGN KEY (post_id) REFERENCES persohub_posts(id) ON DELETE CASCADE
                """
            )
        )


def ensure_persohub_defaults(db: Session):
    ensure_default_persohub_setup(db)
