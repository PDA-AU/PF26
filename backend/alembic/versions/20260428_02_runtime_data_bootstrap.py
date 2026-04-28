"""runtime data bootstrap

Revision ID: 20260428_02
Revises: 20260428_01
Create Date: 2026-04-28 00:10:00.000000
"""

from typing import Sequence, Union

from alembic import op
from sqlalchemy.orm import Session

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


# revision identifiers, used by Alembic.
revision: str = "20260428_02"
down_revision: Union[str, Sequence[str], None] = "20260428_01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

DEFAULT_PDA_RECRUIT_URL = "https://chat.whatsapp.com/ErThvhBS77kGJEApiABP2z"


def _ensure_config_row(
    db: Session,
    key: str,
    value: str,
    recruit_url: str | None = None,
) -> None:
    row = db.query(SystemConfig).filter(SystemConfig.key == key).first()
    if not row:
        row = SystemConfig(key=key, value=value, recruit_url=recruit_url)
        db.add(row)
        db.commit()
        db.refresh(row)
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


def upgrade() -> None:
    bind = op.get_bind()
    db = Session(bind=bind)
    try:
        normalize_pda_team(db)
        normalize_pda_team_schema(db)
        migrate_pda_team_social_handles_to_users(db)
        backfill_is_member_from_team_once(db)
        normalize_pda_admins_schema(db)
        ensure_default_superadmin(db)
        ensure_superadmin_policies(db)
        ensure_persohub_defaults(db)

        _ensure_config_row(db, "registration_open", "true")
        _ensure_config_row(
            db,
            "pda_recruitment_open",
            "true",
            recruit_url=DEFAULT_PDA_RECRUIT_URL,
        )
    finally:
        db.close()


def downgrade() -> None:
    raise RuntimeError(
        "This migration performs irreversible data bootstrap/backfill operations. "
        "Use backup restore for rollback."
    )
