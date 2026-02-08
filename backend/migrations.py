from typing import Dict, Tuple
from sqlalchemy import text
from sqlalchemy.orm import Session
from models import PdaTeam, PdaUser, PdaAdmin
from auth import get_password_hash

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


def ensure_pda_team_columns(engine):
    with engine.begin() as conn:
        if not _column_exists(conn, "pda_team", "user_id"):
            conn.execute(text("ALTER TABLE pda_team ADD COLUMN user_id INTEGER"))
        if not _column_exists(conn, "pda_team", "team"):
            conn.execute(text("ALTER TABLE pda_team ADD COLUMN team VARCHAR(120)"))
        if not _column_exists(conn, "pda_team", "designation"):
            conn.execute(text("ALTER TABLE pda_team ADD COLUMN designation VARCHAR(120)"))
        if not _column_exists(conn, "pda_team", "instagram_url"):
            conn.execute(text("ALTER TABLE pda_team ADD COLUMN instagram_url VARCHAR(500)"))
        if not _column_exists(conn, "pda_team", "linkedin_url"):
            conn.execute(text("ALTER TABLE pda_team ADD COLUMN linkedin_url VARCHAR(500)"))
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
    conn = db.connection()
    if not _table_exists(conn, "pda_team"):
        return

    has_regno = _column_exists(conn, "pda_team", "regno")
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
            if _column_exists(conn, "pda_team", col):
                db.execute(text(f"ALTER TABLE pda_team DROP COLUMN IF EXISTS {col}"))
        db.commit()

    db.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS pda_team_user_id_key ON pda_team (user_id)"))
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
