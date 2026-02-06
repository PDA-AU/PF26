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


def ensure_pda_team_columns(engine):
    with engine.begin() as conn:
        if not _column_exists(conn, "pda_team", "user_id"):
            conn.execute(text("ALTER TABLE pda_team ADD COLUMN user_id INTEGER"))
        if not _column_exists(conn, "pda_team", "team"):
            conn.execute(text("ALTER TABLE pda_team ADD COLUMN team VARCHAR(120)"))
        if not _column_exists(conn, "pda_team", "designation"):
            conn.execute(text("ALTER TABLE pda_team ADD COLUMN designation VARCHAR(120)"))
        if _column_exists(conn, "pda_team", "team_designation"):
            conn.execute(text("ALTER TABLE pda_team DROP COLUMN team_designation"))


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
                    regno VARCHAR(20) UNIQUE NOT NULL,
                    hashed_password VARCHAR(255) NOT NULL,
                    policy JSON,
                    created_at TIMESTAMPTZ DEFAULT now()
                )
                """
            )
        )
        if not _column_exists(conn, "pda_admins", "regno"):
            conn.execute(text("ALTER TABLE pda_admins ADD COLUMN regno VARCHAR(20)"))
        if not _column_exists(conn, "pda_admins", "hashed_password"):
            conn.execute(text("ALTER TABLE pda_admins ADD COLUMN hashed_password VARCHAR(255)"))
        if not _column_exists(conn, "pda_admins", "policy"):
            conn.execute(text("ALTER TABLE pda_admins ADD COLUMN policy JSON"))
        if not _column_exists(conn, "pda_admins", "created_at"):
            conn.execute(text("ALTER TABLE pda_admins ADD COLUMN created_at TIMESTAMPTZ DEFAULT now()"))


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


def seed_pda_users_from_team(db: Session):
    team_members = db.query(PdaTeam).all()
    for member in team_members:
        existing = db.query(PdaUser).filter(PdaUser.regno == member.regno).first()
        if existing:
            continue
        user = PdaUser(
            regno=member.regno,
            email=member.email or f"{member.regno}@pda.local",
            hashed_password=get_password_hash("password"),
            name=member.name,
            phno=member.phno,
            dept=member.dept,
            image_url=member.photo_url,
            json_content={},
            is_member=True
        )
        db.add(user)
    db.commit()


def link_pda_team_users(db: Session):
    team_members = db.query(PdaTeam).all()
    for member in team_members:
        if member.user_id:
            continue
        user = db.query(PdaUser).filter(PdaUser.regno == member.regno).first()
        if user:
            member.user_id = user.id
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
    superadmins = db.query(PdaTeam).filter(PdaTeam.designation.in_(["Root", "Chairperson", "Vice Chairperson"])) .all()
    for member in superadmins:
        if not member.regno:
            continue
        admin_row = db.query(PdaAdmin).filter(PdaAdmin.regno == member.regno).first()
        if not admin_row:
            admin_row = PdaAdmin(regno=member.regno, hashed_password=get_password_hash("admin123"), policy={"home": True, "pf": True})
            db.add(admin_row)
        elif not admin_row.policy:
            admin_row.policy = {"home": True, "pf": True}
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

    team = db.query(PdaTeam).filter((PdaTeam.user_id == user.id) | (PdaTeam.regno == regno)).first()
    if not team:
        team = PdaTeam(
            user_id=user.id,
            name=user.name,
            regno=user.regno,
            email=user.email,
            phno=user.phno,
            dept=user.dept,
            team="Executive",
            designation="Root"
        )
        db.add(team)
        db.commit()
    else:
        team.user_id = user.id
        team.team = "Executive"
        team.designation = "Root"
        if not team.name:
            team.name = user.name
        if not team.email:
            team.email = user.email
        db.commit()

    admin_row = db.query(PdaAdmin).filter(PdaAdmin.regno == user.regno).first()
    if not admin_row:
        admin_row = PdaAdmin(regno=user.regno, hashed_password=get_password_hash("admin123"), policy={"home": True, "pf": True})
        db.add(admin_row)
        db.commit()
