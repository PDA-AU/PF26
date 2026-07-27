"""
One-time schema initialisation for a fresh database.

Usage (from backend/):
    python scripts/init_schema.py

What it does:
  1. Creates all tables via SQLAlchemy Base.metadata.create_all() — this matches
     the current model state exactly.
  2. Stamps alembic_version at `head` so that alembic knows all migrations have
     already been applied and won't try to re-run them.

Run this INSTEAD OF `alembic upgrade head` on a brand-new empty database.
On an existing database that already went through alembic migrations, use
`alembic upgrade head` as normal.
"""

import sys
import os
from pathlib import Path

# Allow imports from backend/
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from database import Base, engine, SessionLocal
import models  # noqa: F401 — registers all ORM models
from models import SystemConfig
from migrations import (
    backfill_is_member_from_team_once,
    ensure_default_superadmin,
    ensure_persohub_defaults,
    ensure_superadmin_policies,
    migrate_pda_team_social_handles_to_users,
    normalize_pda_admins_schema,
    normalize_pda_team,
    normalize_pda_team_schema,
)

from sqlalchemy import text
from alembic.config import Config
from alembic import command

DEFAULT_PDA_RECRUIT_URL = "https://chat.whatsapp.com/ErThvhBS77kGJEApiABP2z"


def _ensure_config_row(db, key, value, recruit_url=None):
    row = db.query(SystemConfig).filter(SystemConfig.key == key).first()
    if not row:
        row = SystemConfig(key=key, value=value, recruit_url=recruit_url)
        db.add(row)
        db.commit()
        return
    changed = False
    if row.value != value:
        row.value = value
        changed = True
    if recruit_url is not None and not str(row.recruit_url or "").strip():
        row.recruit_url = recruit_url
        changed = True
    if changed:
        db.commit()


def seed_defaults():
    db = SessionLocal()
    try:
        print("Seeding default data...")
        normalize_pda_team(db)
        normalize_pda_team_schema(db)
        migrate_pda_team_social_handles_to_users(db)
        backfill_is_member_from_team_once(db)
        normalize_pda_admins_schema(db)
        ensure_default_superadmin(db)
        ensure_superadmin_policies(db)
        ensure_persohub_defaults(db)
        _ensure_config_row(db, "registration_open", "true")
        _ensure_config_row(db, "pda_recruitment_open", "true", recruit_url=DEFAULT_PDA_RECRUIT_URL)
        print("Default data seeded.")
    finally:
        db.close()


def _check_empty_db():
    with engine.connect() as conn:
        result = conn.execute(text(
            "SELECT COUNT(*) FROM information_schema.tables "
            "WHERE table_schema = 'public' AND table_name != 'alembic_version'"
        ))
        count = result.scalar()
        if count > 0:
            print(f"ERROR: Database already has {count} tables. This script is only for fresh databases.")
            print("For an existing database, use: alembic upgrade head")
            sys.exit(1)


def main():
    _check_empty_db()
    print("Creating all tables from current SQLAlchemy models...")
    Base.metadata.create_all(engine)
    print("Tables created.")

    seed_defaults()

    print("Stamping alembic_version at head...")
    alembic_cfg = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    command.stamp(alembic_cfg, "head")
    print("Done. Database is ready.")

    with engine.connect() as conn:
        result = conn.execute(text("SELECT version_num FROM alembic_version"))
        rows = result.fetchall()
        print(f"alembic_version: {[r[0] for r in rows]}")


if __name__ == "__main__":
    main()
