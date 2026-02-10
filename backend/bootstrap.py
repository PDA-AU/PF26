from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy import text

from database import Base, engine, get_db
from migrations import (
    drop_admin_logs_fk,
    drop_legacy_persofest_tables,
    ensure_default_superadmin,
    ensure_email_auth_columns,
    ensure_pda_admins_table,
    ensure_pda_event_tables,
    ensure_pda_gallery_tag_column,
    ensure_pda_items_columns,
    ensure_pda_team_columns,
    ensure_pda_team_constraints,
    ensure_pda_user_social_columns,
    ensure_pda_users_dob_column,
    ensure_pda_users_gender_column,
    ensure_pda_users_profile_name_column,
    ensure_pda_users_table,
    ensure_persofest_pda_event,
    ensure_persohub_defaults,
    ensure_persohub_tables,
    ensure_superadmin_policies,
    migrate_legacy_persofest_to_pda_event,
    migrate_pda_team_social_handles_to_users,
    normalize_pda_admins_schema,
    normalize_pda_team,
    normalize_pda_team_schema,
)
from models import SystemConfig

logger = logging.getLogger(__name__)

LEGACY_PERSOFEST_MODEL_TABLES = {"pf_events", "participants", "rounds", "scores"}
MIGRATION_MARKER_KEY = "migration:backend_bootstrap:v1"


def _legacy_persofest_tables_exist() -> bool:
    with engine.begin() as conn:
        rows = conn.execute(
            text(
                """
                SELECT table_name
                FROM information_schema.tables
                WHERE table_name IN ('participants', 'rounds', 'scores')
                """
            )
        ).fetchall()
    return bool(rows)


def has_bootstrap_marker() -> bool:
    db = next(get_db())
    try:
        marker = db.query(SystemConfig).filter(SystemConfig.key == MIGRATION_MARKER_KEY).first()
        return marker is not None
    finally:
        db.close()


def set_bootstrap_marker() -> None:
    db = next(get_db())
    try:
        marker = db.query(SystemConfig).filter(SystemConfig.key == MIGRATION_MARKER_KEY).first()
        value = datetime.now(timezone.utc).isoformat()
        if marker:
            marker.value = value
        else:
            db.add(SystemConfig(key=MIGRATION_MARKER_KEY, value=value))
        db.commit()
    finally:
        db.close()


def clear_bootstrap_marker() -> bool:
    db = next(get_db())
    try:
        marker = db.query(SystemConfig).filter(SystemConfig.key == MIGRATION_MARKER_KEY).first()
        if not marker:
            return False
        db.delete(marker)
        db.commit()
        return True
    finally:
        db.close()


def run_bootstrap_migrations() -> None:
    ensure_pda_users_table(engine)
    ensure_pda_users_dob_column(engine)
    ensure_pda_users_gender_column(engine)
    ensure_pda_users_profile_name_column(engine)
    ensure_pda_user_social_columns(engine)
    ensure_pda_team_columns(engine)
    ensure_pda_items_columns(engine)
    ensure_pda_team_constraints(engine)
    ensure_pda_gallery_tag_column(engine)
    drop_admin_logs_fk(engine)
    ensure_pda_admins_table(engine)
    ensure_email_auth_columns(engine)
    ensure_pda_event_tables(engine)
    ensure_persofest_pda_event(engine)
    ensure_persohub_tables(engine)

    managed_tables = [
        table for table in Base.metadata.sorted_tables if table.name not in LEGACY_PERSOFEST_MODEL_TABLES
    ]
    Base.metadata.create_all(bind=engine, tables=managed_tables)

    if _legacy_persofest_tables_exist():
        migrate_legacy_persofest_to_pda_event(engine)
        drop_legacy_persofest_tables(engine)
        logger.info("Legacy Persofest tables detected and migrated to managed event tables.")
    else:
        logger.info("Legacy Persofest tables not found; skipping one-time legacy migration block.")

    db = next(get_db())
    try:
        normalize_pda_team(db)
        normalize_pda_team_schema(db)
        migrate_pda_team_social_handles_to_users(db)
        normalize_pda_admins_schema(db)
        ensure_default_superadmin(db)
        ensure_superadmin_policies(db)
        ensure_persohub_defaults(db)

        reg_config = db.query(SystemConfig).filter(SystemConfig.key == "registration_open").first()
        if not reg_config:
            db.add(SystemConfig(key="registration_open", value="true"))
            db.commit()

        pda_recruit_config = db.query(SystemConfig).filter(SystemConfig.key == "pda_recruitment_open").first()
        if not pda_recruit_config:
            db.add(SystemConfig(key="pda_recruitment_open", value="true"))
            db.commit()
    finally:
        db.close()
