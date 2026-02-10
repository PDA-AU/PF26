from typing import Dict, Tuple
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


def rename_users_to_participants(engine):
    with engine.begin() as conn:
        participants_exists = _table_exists(conn, "participants")
        users_exists = _table_exists(conn, "users")
        if not participants_exists and users_exists:
            conn.execute(text("ALTER TABLE users RENAME TO participants"))


def ensure_events_table(engine):
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS pf_events (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(100) UNIQUE NOT NULL,
                    is_active BOOLEAN DEFAULT TRUE
                )
                """
            )
        )
        if not _column_exists(conn, "pf_events", "name"):
            conn.execute(text("ALTER TABLE pf_events ADD COLUMN name VARCHAR(100)"))
        if not _column_exists(conn, "pf_events", "is_active"):
            conn.execute(text("ALTER TABLE pf_events ADD COLUMN is_active BOOLEAN DEFAULT TRUE"))


def ensure_participants_event_column(engine):
    with engine.begin() as conn:
        if _table_exists(conn, "participants") and not _column_exists(conn, "participants", "event_id"):
            conn.execute(text("ALTER TABLE participants ADD COLUMN event_id INTEGER"))


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


def _normalize_profile_seed(name: str) -> str:
    value = re.sub(r"[^a-z0-9_]+", "", str(name or "").strip().lower().replace(" ", "_"))
    value = re.sub(r"_+", "_", value).strip("_")
    if len(value) < 3:
        value = "user"
    return value[:32]


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


def seed_persofest_event(engine):
    with engine.begin() as conn:
        existing = conn.execute(text("SELECT id FROM pf_events WHERE name = 'PERSOFEST'")) .fetchone()
        if not existing:
            conn.execute(text("INSERT INTO pf_events (name, is_active) VALUES ('PERSOFEST', true)"))


def assign_participants_event(engine):
    with engine.begin() as conn:
        event = conn.execute(text("SELECT id FROM pf_events WHERE name = 'PERSOFEST'")) .fetchone()
        if not event:
            return
        conn.execute(
            text("UPDATE participants SET event_id = :event_id WHERE event_id IS NULL"),
            {"event_id": event[0]}
        )


def ensure_email_auth_columns(engine):
    with engine.begin() as conn:
        if _table_exists(conn, "participants"):
            if not _column_exists(conn, "participants", "email_verified_at"):
                conn.execute(text("ALTER TABLE participants ADD COLUMN email_verified_at TIMESTAMPTZ"))
            if not _column_exists(conn, "participants", "email_verification_token_hash"):
                conn.execute(text("ALTER TABLE participants ADD COLUMN email_verification_token_hash VARCHAR(255)"))
            if not _column_exists(conn, "participants", "email_verification_expires_at"):
                conn.execute(text("ALTER TABLE participants ADD COLUMN email_verification_expires_at TIMESTAMPTZ"))
            if not _column_exists(conn, "participants", "email_verification_sent_at"):
                conn.execute(text("ALTER TABLE participants ADD COLUMN email_verification_sent_at TIMESTAMPTZ"))
            if not _column_exists(conn, "participants", "password_reset_token_hash"):
                conn.execute(text("ALTER TABLE participants ADD COLUMN password_reset_token_hash VARCHAR(255)"))
            if not _column_exists(conn, "participants", "password_reset_expires_at"):
                conn.execute(text("ALTER TABLE participants ADD COLUMN password_reset_expires_at TIMESTAMPTZ"))
            if not _column_exists(conn, "participants", "password_reset_sent_at"):
                conn.execute(text("ALTER TABLE participants ADD COLUMN password_reset_sent_at TIMESTAMPTZ"))

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
            admin_row = PdaAdmin(user_id=user.id, policy={"home": True, "pf": True, "superAdmin": True, "events": {}})
            db.add(admin_row)
        elif not admin_row.policy:
            admin_row.policy = {"home": True, "pf": True, "superAdmin": True, "events": {}}
        else:
            policy = dict(admin_row.policy)
            policy["home"] = True
            policy["pf"] = True
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
        admin_row = PdaAdmin(user_id=user.id, policy={"home": True, "pf": True, "superAdmin": True, "events": {}})
        db.add(admin_row)
        db.commit()
    else:
        policy = dict(admin_row.policy or {})
        policy.setdefault("home", True)
        policy.setdefault("pf", True)
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
                    poster_url VARCHAR(500),
                    event_type VARCHAR(30) NOT NULL,
                    format VARCHAR(30) NOT NULL,
                    template_option VARCHAR(50) NOT NULL,
                    participant_mode VARCHAR(30) NOT NULL,
                    round_mode VARCHAR(30) NOT NULL,
                    round_count INTEGER NOT NULL DEFAULT 1,
                    team_min_size INTEGER,
                    team_max_size INTEGER,
                    status VARCHAR(20) NOT NULL DEFAULT 'closed',
                    created_at TIMESTAMPTZ DEFAULT now(),
                    updated_at TIMESTAMPTZ
                )
                """
            )
        )
        conn.execute(text("ALTER TABLE pda_events ADD COLUMN IF NOT EXISTS start_date DATE"))
        conn.execute(text("ALTER TABLE pda_events ADD COLUMN IF NOT EXISTS end_date DATE"))

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


def ensure_persofest_pda_event(engine):
    with engine.begin() as conn:
        row = conn.execute(
            text("SELECT id FROM pda_events WHERE slug = 'persofest-2026' OR event_code = 'PF26'")
        ).fetchone()
        if row:
            conn.execute(
                text(
                    """
                    UPDATE pda_events
                    SET slug = 'persofest-2026'
                    WHERE id = :id
                    """
                ),
                {"id": int(row[0])},
            )
            return
        conn.execute(
            text(
                """
                INSERT INTO pda_events (
                    slug,
                    event_code,
                    club_id,
                    title,
                    description,
                    event_type,
                    format,
                    template_option,
                    participant_mode,
                    round_mode,
                    round_count,
                    status
                ) VALUES (
                    'persofest-2026',
                    'PF26',
                    1,
                    'Persofest 2026',
                    'Persofest unified event',
                    'EVENT',
                    'OFFLINE',
                    'ATTENDANCE_SCORING',
                    'INDIVIDUAL',
                    'MULTI',
                    10,
                    'OPEN'
                )
                """
            )
        )


def _map_registration_status(value) -> str:
    raw = str(value or "").strip().upper()
    if "ELIMINATED" in raw:
        return "ELIMINATED"
    return "ACTIVE"


def _map_round_mode(value) -> str:
    raw = str(value or "").strip().upper()
    if "ONLINE" in raw:
        return "ONLINE"
    return "OFFLINE"


def _map_round_state(value) -> str:
    raw = str(value or "").strip().upper()
    if "COMPLETED" in raw:
        return "COMPLETED"
    if "ACTIVE" in raw:
        return "ACTIVE"
    if "PUBLISHED" in raw:
        return "PUBLISHED"
    return "DRAFT"


def _parse_round_no_to_int(value, fallback: int) -> int:
    digits = re.sub(r"[^0-9]+", "", str(value or ""))
    if not digits:
        return fallback
    try:
        parsed = int(digits)
        return parsed if parsed > 0 else fallback
    except Exception:
        return fallback


def migrate_legacy_persofest_to_pda_event(engine):
    with engine.begin() as conn:
        if not _table_exists(conn, "participants"):
            return

        event_row = conn.execute(
            text("SELECT id FROM pda_events WHERE slug = 'persofest-2026'")
        ).fetchone()
        if not event_row:
            return
        event_id = int(event_row[0])

        participants = conn.execute(
            text(
                """
                SELECT
                    id,
                    register_number,
                    email,
                    hashed_password,
                    name,
                    phone,
                    gender,
                    department,
                    profile_picture,
                    status,
                    referral_code,
                    referred_by,
                    referral_count
                FROM participants
                ORDER BY id ASC
                """
            )
        ).mappings().all()

        for row in participants:
            regno = str(row.get("register_number") or "").strip()
            email = str(row.get("email") or "").strip().lower()
            if not regno or not email:
                continue

            user = conn.execute(
                text("SELECT id FROM users WHERE regno = :regno"),
                {"regno": regno},
            ).fetchone()
            if not user:
                user = conn.execute(
                    text("SELECT id FROM users WHERE email = :email"),
                    {"email": email},
                ).fetchone()

            if not user:
                created = conn.execute(
                    text(
                        """
                        INSERT INTO users (
                            regno,
                            email,
                            hashed_password,
                            name,
                            phno,
                            gender,
                            dept,
                            image_url,
                            json_content,
                            is_member
                        ) VALUES (
                            :regno,
                            :email,
                            :hashed_password,
                            :name,
                            :phno,
                            :gender,
                            :dept,
                            :image_url,
                            :json_content,
                            :is_member
                        )
                        RETURNING id
                        """
                    ),
                    {
                        "regno": regno,
                        "email": email,
                        "hashed_password": row.get("hashed_password"),
                        "name": row.get("name") or f"Persofest {regno}",
                        "phno": row.get("phone"),
                        "gender": row.get("gender"),
                        "dept": row.get("department"),
                        "image_url": row.get("profile_picture"),
                        "json_content": {},
                        "is_member": False,
                    },
                ).fetchone()
                user_id = int(created[0])
            else:
                user_id = int(user[0])
                conn.execute(
                    text(
                        """
                        UPDATE users
                        SET
                            phno = COALESCE(NULLIF(TRIM(phno), ''), :phno),
                            gender = COALESCE(NULLIF(TRIM(gender), ''), :gender),
                            dept = COALESCE(NULLIF(TRIM(dept), ''), :dept),
                            image_url = COALESCE(NULLIF(TRIM(image_url), ''), :image_url)
                        WHERE id = :id
                        """
                    ),
                    {
                        "id": user_id,
                        "phno": row.get("phone"),
                        "gender": row.get("gender"),
                        "dept": row.get("department"),
                        "image_url": row.get("profile_picture"),
                    },
                )

            registration = conn.execute(
                text(
                    """
                    SELECT id
                    FROM pda_event_registrations
                    WHERE event_id = :event_id AND user_id = :user_id
                    """
                ),
                {"event_id": event_id, "user_id": user_id},
            ).fetchone()
            payload = {
                "event_id": event_id,
                "user_id": user_id,
                "status": _map_registration_status(row.get("status")),
                "referral_code": (str(row.get("referral_code") or "").strip().upper() or None),
                "referred_by": (str(row.get("referred_by") or "").strip().upper() or None),
                "referral_count": int(row.get("referral_count") or 0),
            }
            if not registration:
                conn.execute(
                    text(
                        """
                        INSERT INTO pda_event_registrations (
                            event_id,
                            user_id,
                            team_id,
                            entity_type,
                            status,
                            referral_code,
                            referred_by,
                            referral_count
                        ) VALUES (
                            :event_id,
                            :user_id,
                            NULL,
                            'USER',
                            :status,
                            :referral_code,
                            :referred_by,
                            :referral_count
                        )
                        """
                    ),
                    payload,
                )
            else:
                conn.execute(
                    text(
                        """
                        UPDATE pda_event_registrations
                        SET
                            status = :status,
                            referral_code = :referral_code,
                            referred_by = :referred_by,
                            referral_count = :referral_count
                        WHERE id = :registration_id
                        """
                    ),
                    {**payload, "registration_id": int(registration[0])},
                )

        if _table_exists(conn, "rounds"):
            round_rows = conn.execute(
                text(
                    """
                    SELECT
                        id,
                        round_no,
                        name,
                        description,
                        date,
                        mode,
                        state,
                        evaluation_criteria,
                        elimination_type,
                        elimination_value,
                        is_frozen
                    FROM rounds
                    ORDER BY id ASC
                    """
                )
            ).mappings().all()
            round_id_map = {}
            for idx, round_row in enumerate(round_rows, start=1):
                round_no = _parse_round_no_to_int(round_row.get("round_no"), idx)
                existing_round = conn.execute(
                    text(
                        """
                        SELECT id
                        FROM pda_event_rounds
                        WHERE event_id = :event_id AND round_no = :round_no
                        """
                    ),
                    {"event_id": event_id, "round_no": round_no},
                ).fetchone()
                if existing_round:
                    new_round_id = int(existing_round[0])
                    conn.execute(
                        text(
                            """
                            UPDATE pda_event_rounds
                            SET
                                name = :name,
                                description = :description,
                                date = :date,
                                mode = :mode,
                                state = :state,
                                evaluation_criteria = :evaluation_criteria,
                                elimination_type = :elimination_type,
                                elimination_value = :elimination_value,
                                is_frozen = :is_frozen
                            WHERE id = :id
                            """
                        ),
                        {
                            "id": new_round_id,
                            "name": round_row.get("name"),
                            "description": round_row.get("description"),
                            "date": round_row.get("date"),
                            "mode": _map_round_mode(round_row.get("mode")),
                            "state": _map_round_state(round_row.get("state")),
                            "evaluation_criteria": round_row.get("evaluation_criteria"),
                            "elimination_type": round_row.get("elimination_type"),
                            "elimination_value": round_row.get("elimination_value"),
                            "is_frozen": bool(round_row.get("is_frozen")),
                        },
                    )
                else:
                    inserted_round = conn.execute(
                        text(
                            """
                            INSERT INTO pda_event_rounds (
                                event_id,
                                round_no,
                                name,
                                description,
                                date,
                                mode,
                                state,
                                evaluation_criteria,
                                elimination_type,
                                elimination_value,
                                is_frozen
                            ) VALUES (
                                :event_id,
                                :round_no,
                                :name,
                                :description,
                                :date,
                                :mode,
                                :state,
                                :evaluation_criteria,
                                :elimination_type,
                                :elimination_value,
                                :is_frozen
                            )
                            RETURNING id
                            """
                        ),
                        {
                            "event_id": event_id,
                            "round_no": round_no,
                            "name": round_row.get("name"),
                            "description": round_row.get("description"),
                            "date": round_row.get("date"),
                            "mode": _map_round_mode(round_row.get("mode")),
                            "state": _map_round_state(round_row.get("state")),
                            "evaluation_criteria": round_row.get("evaluation_criteria"),
                            "elimination_type": round_row.get("elimination_type"),
                            "elimination_value": round_row.get("elimination_value"),
                            "is_frozen": bool(round_row.get("is_frozen")),
                        },
                    ).fetchone()
                    new_round_id = int(inserted_round[0])
                round_id_map[int(round_row["id"])] = new_round_id

            if _table_exists(conn, "scores"):
                score_rows = conn.execute(
                    text(
                        """
                        SELECT
                            s.participant_id,
                            s.round_id,
                            s.criteria_scores,
                            s.total_score,
                            s.normalized_score,
                            s.is_present,
                            p.register_number,
                            p.email
                        FROM scores s
                        JOIN participants p ON p.id = s.participant_id
                        ORDER BY s.id ASC
                        """
                    )
                ).mappings().all()
                for score_row in score_rows:
                    mapped_round_id = round_id_map.get(int(score_row["round_id"]))
                    if not mapped_round_id:
                        continue

                    regno = str(score_row.get("register_number") or "").strip()
                    email = str(score_row.get("email") or "").strip().lower()
                    user_row = conn.execute(
                        text("SELECT id FROM users WHERE regno = :regno"),
                        {"regno": regno},
                    ).fetchone()
                    if not user_row and email:
                        user_row = conn.execute(
                            text("SELECT id FROM users WHERE email = :email"),
                            {"email": email},
                        ).fetchone()
                    if not user_row:
                        continue
                    user_id = int(user_row[0])

                    conn.execute(
                        text(
                            """
                            INSERT INTO pda_event_registrations (
                                event_id,
                                user_id,
                                team_id,
                                entity_type,
                                status
                            ) VALUES (
                                :event_id,
                                :user_id,
                                NULL,
                                'USER',
                                'ACTIVE'
                            )
                            ON CONFLICT (event_id, user_id) DO NOTHING
                            """
                        ),
                        {"event_id": event_id, "user_id": user_id},
                    )

                    existing_score = conn.execute(
                        text(
                            """
                            SELECT id
                            FROM pda_event_scores
                            WHERE event_id = :event_id
                              AND round_id = :round_id
                              AND entity_type = 'USER'
                              AND user_id = :user_id
                              AND team_id IS NULL
                            """
                        ),
                        {"event_id": event_id, "round_id": mapped_round_id, "user_id": user_id},
                    ).fetchone()
                    score_payload = {
                        "event_id": event_id,
                        "round_id": mapped_round_id,
                        "user_id": user_id,
                        "criteria_scores": score_row.get("criteria_scores"),
                        "total_score": float(score_row.get("total_score") or 0),
                        "normalized_score": float(score_row.get("normalized_score") or 0),
                        "is_present": bool(score_row.get("is_present")),
                    }
                    if existing_score:
                        conn.execute(
                            text(
                                """
                                UPDATE pda_event_scores
                                SET
                                    criteria_scores = :criteria_scores,
                                    total_score = :total_score,
                                    normalized_score = :normalized_score,
                                    is_present = :is_present
                                WHERE id = :id
                                """
                            ),
                            {**score_payload, "id": int(existing_score[0])},
                        )
                    else:
                        conn.execute(
                            text(
                                """
                                INSERT INTO pda_event_scores (
                                    event_id,
                                    round_id,
                                    entity_type,
                                    user_id,
                                    team_id,
                                    criteria_scores,
                                    total_score,
                                    normalized_score,
                                    is_present
                                ) VALUES (
                                    :event_id,
                                    :round_id,
                                    'USER',
                                    :user_id,
                                    NULL,
                                    :criteria_scores,
                                    :total_score,
                                    :normalized_score,
                                    :is_present
                                )
                                """
                            ),
                            score_payload,
                        )

                    existing_attendance = conn.execute(
                        text(
                            """
                            SELECT id
                            FROM pda_event_attendance
                            WHERE event_id = :event_id
                              AND round_id = :round_id
                              AND entity_type = 'USER'
                              AND user_id = :user_id
                              AND team_id IS NULL
                            """
                        ),
                        {"event_id": event_id, "round_id": mapped_round_id, "user_id": user_id},
                    ).fetchone()
                    attendance_payload = {
                        "event_id": event_id,
                        "round_id": mapped_round_id,
                        "user_id": user_id,
                        "is_present": bool(score_row.get("is_present")),
                    }
                    if existing_attendance:
                        conn.execute(
                            text(
                                """
                                UPDATE pda_event_attendance
                                SET is_present = :is_present
                                WHERE id = :id
                                """
                            ),
                            {**attendance_payload, "id": int(existing_attendance[0])},
                        )
                    else:
                        conn.execute(
                            text(
                                """
                                INSERT INTO pda_event_attendance (
                                    event_id,
                                    round_id,
                                    entity_type,
                                    user_id,
                                    team_id,
                                    is_present
                                ) VALUES (
                                    :event_id,
                                    :round_id,
                                    'USER',
                                    :user_id,
                                    NULL,
                                    :is_present
                                )
                                """
                            ),
                            attendance_payload,
                        )


def drop_legacy_persofest_tables(engine):
    with engine.begin() as conn:
        for table_name in ("scores", "rounds", "participants"):
            if _table_exists(conn, table_name):
                conn.execute(text(f"DROP TABLE IF EXISTS {table_name} CASCADE"))

        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS pda_event_rounds (
                    id SERIAL PRIMARY KEY,
                    event_id INTEGER NOT NULL REFERENCES pda_events(id) ON DELETE CASCADE,
                    round_no INTEGER NOT NULL,
                    name VARCHAR(255) NOT NULL,
                    description TEXT,
                    date TIMESTAMPTZ,
                    mode VARCHAR(30) NOT NULL DEFAULT 'Offline',
                    state VARCHAR(30) NOT NULL DEFAULT 'Draft',
                    evaluation_criteria JSON,
                    elimination_type VARCHAR(20),
                    elimination_value FLOAT,
                    is_frozen BOOLEAN DEFAULT FALSE,
                    created_at TIMESTAMPTZ DEFAULT now(),
                    updated_at TIMESTAMPTZ,
                    CONSTRAINT uq_pda_event_round_event_round_no UNIQUE (event_id, round_no)
                )
                """
            )
        )

        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS pda_event_attendance (
                    id SERIAL PRIMARY KEY,
                    event_id INTEGER NOT NULL REFERENCES pda_events(id) ON DELETE CASCADE,
                    round_id INTEGER REFERENCES pda_event_rounds(id) ON DELETE CASCADE,
                    entity_type VARCHAR(10) NOT NULL,
                    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                    team_id INTEGER REFERENCES pda_event_teams(id) ON DELETE CASCADE,
                    is_present BOOLEAN NOT NULL DEFAULT FALSE,
                    marked_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                    marked_at TIMESTAMPTZ DEFAULT now(),
                    CONSTRAINT uq_pda_event_attendance_entity UNIQUE (event_id, round_id, entity_type, user_id, team_id)
                )
                """
            )
        )

        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS pda_event_scores (
                    id SERIAL PRIMARY KEY,
                    event_id INTEGER NOT NULL REFERENCES pda_events(id) ON DELETE CASCADE,
                    round_id INTEGER NOT NULL REFERENCES pda_event_rounds(id) ON DELETE CASCADE,
                    entity_type VARCHAR(10) NOT NULL,
                    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                    team_id INTEGER REFERENCES pda_event_teams(id) ON DELETE CASCADE,
                    criteria_scores JSON,
                    total_score FLOAT NOT NULL DEFAULT 0,
                    normalized_score FLOAT NOT NULL DEFAULT 0,
                    is_present BOOLEAN NOT NULL DEFAULT FALSE,
                    created_at TIMESTAMPTZ DEFAULT now(),
                    updated_at TIMESTAMPTZ,
                    CONSTRAINT uq_pda_event_score_entity UNIQUE (event_id, round_id, entity_type, user_id, team_id)
                )
                """
            )
        )

        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS pda_event_badges (
                    id SERIAL PRIMARY KEY,
                    event_id INTEGER NOT NULL REFERENCES pda_events(id) ON DELETE CASCADE,
                    title VARCHAR(255) NOT NULL,
                    image_url VARCHAR(500),
                    place VARCHAR(30) NOT NULL,
                    score FLOAT,
                    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                    team_id INTEGER REFERENCES pda_event_teams(id) ON DELETE SET NULL,
                    created_at TIMESTAMPTZ DEFAULT now(),
                    updated_at TIMESTAMPTZ
                )
                """
            )
        )

        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS pda_event_invites (
                    id SERIAL PRIMARY KEY,
                    event_id INTEGER NOT NULL REFERENCES pda_events(id) ON DELETE CASCADE,
                    team_id INTEGER NOT NULL REFERENCES pda_event_teams(id) ON DELETE CASCADE,
                    invited_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    invited_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
                    status VARCHAR(20) NOT NULL DEFAULT 'pending',
                    created_at TIMESTAMPTZ DEFAULT now(),
                    updated_at TIMESTAMPTZ,
                    CONSTRAINT uq_pda_event_invite_unique UNIQUE (event_id, team_id, invited_user_id)
                )
                """
            )
        )


def ensure_persohub_tables(engine):
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS persohub_clubs (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(120) UNIQUE NOT NULL,
                    club_url VARCHAR(500),
                    club_logo_url VARCHAR(500),
                    created_at TIMESTAMPTZ DEFAULT now(),
                    updated_at TIMESTAMPTZ
                )
                """
            )
        )

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
                    created_at TIMESTAMPTZ DEFAULT now(),
                    updated_at TIMESTAMPTZ
                )
                """
            )
        )
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_persohub_communities_club_id ON persohub_communities(club_id)"))

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
