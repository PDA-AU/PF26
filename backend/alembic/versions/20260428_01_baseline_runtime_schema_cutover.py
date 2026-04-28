"""baseline runtime schema cutover

Revision ID: 20260428_01
Revises:
Create Date: 2026-04-28 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op

from database import Base
import models  # noqa: F401
from migrations import (
    backfill_pda_event_round_count_once,
    backfill_persohub_event_eliminated_round_once,
    backfill_persohub_event_round_numbers_once,
    clear_legacy_poster_urls_once,
    drop_admin_logs_fk,
    drop_legacy_persohub_sympo_table,
    enforce_pda_event_entity_uniqueness_once,
    ensure_badge_catalog_refactor,
    ensure_email_auth_columns,
    ensure_event_registration_pending_status,
    ensure_log_column_sizes,
    ensure_pda_admins_table,
    ensure_pda_event_panel_tables,
    ensure_pda_event_registration_open_column,
    ensure_pda_event_round_submission_tables,
    ensure_pda_event_tables,
    ensure_pda_events_open_for_column,
    ensure_pda_gallery_tag_column,
    ensure_pda_items_columns,
    ensure_pda_items_no_hero_caption,
    ensure_pda_recruitment_tables,
    ensure_pda_team_columns,
    ensure_pda_team_constraints,
    ensure_pda_user_social_columns,
    ensure_pda_users_college_column,
    ensure_pda_users_dob_column,
    ensure_pda_users_gender_column,
    ensure_pda_users_profile_name_column,
    ensure_pda_users_table,
    ensure_persohub_admins_table,
    ensure_persohub_club_admins_table,
    ensure_persohub_event_open_columns,
    ensure_persohub_event_panel_tables,
    ensure_persohub_event_round_submission_tables,
    ensure_persohub_event_tables,
    ensure_persohub_event_wildcard_columns,
    ensure_persohub_events_parity_flag,
    ensure_persohub_owner_policy_refactor,
    ensure_persohub_primary_and_event_post_columns,
    ensure_persohub_tables,
    ensure_system_config_recruit_url_column,
    migrate_event_attendance_to_entry_scope_once,
    migrate_legacy_recruitment_json_once,
    normalize_pda_profile_enum_values,
    remove_legacy_persofest_once,
    rename_community_event_namespace_to_persohub,
    resolve_user_identifier_collisions_once,
)


# revision identifiers, used by Alembic.
revision: str = "20260428_01"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    engine = bind.engine

    # Preserve the original runtime ordering to minimize behavior drift.
    rename_community_event_namespace_to_persohub(engine)
    Base.metadata.create_all(bind=bind)

    ensure_pda_users_table(engine)
    ensure_pda_users_dob_column(engine)
    ensure_pda_users_gender_column(engine)
    normalize_pda_profile_enum_values(engine)
    ensure_pda_users_profile_name_column(engine)
    ensure_pda_user_social_columns(engine)
    ensure_pda_users_college_column(engine)
    ensure_pda_team_columns(engine)
    ensure_pda_items_columns(engine)
    ensure_pda_items_no_hero_caption(engine)
    ensure_pda_team_constraints(engine)
    ensure_pda_gallery_tag_column(engine)
    drop_admin_logs_fk(engine)
    ensure_log_column_sizes(engine)
    ensure_pda_admins_table(engine)
    ensure_email_auth_columns(engine)
    ensure_pda_event_tables(engine)
    ensure_pda_event_registration_open_column(engine)
    ensure_pda_events_open_for_column(engine)
    ensure_pda_event_round_submission_tables(engine)
    ensure_pda_event_panel_tables(engine)
    ensure_persohub_event_tables(engine)
    ensure_persohub_event_wildcard_columns(engine)
    ensure_event_registration_pending_status(engine)
    ensure_persohub_event_open_columns(engine)
    ensure_persohub_event_round_submission_tables(engine)
    ensure_persohub_event_panel_tables(engine)
    backfill_persohub_event_round_numbers_once(engine)
    backfill_persohub_event_eliminated_round_once(engine)
    ensure_persohub_events_parity_flag(engine)
    drop_legacy_persohub_sympo_table(engine)
    backfill_pda_event_round_count_once(engine)
    ensure_persohub_tables(engine)
    ensure_persohub_admins_table(engine)
    ensure_persohub_club_admins_table(engine)
    ensure_persohub_owner_policy_refactor(engine)
    ensure_persohub_primary_and_event_post_columns(engine)
    ensure_badge_catalog_refactor(engine)
    ensure_pda_recruitment_tables(engine)
    ensure_system_config_recruit_url_column(engine)
    migrate_event_attendance_to_entry_scope_once(engine)
    enforce_pda_event_entity_uniqueness_once(engine)
    resolve_user_identifier_collisions_once(engine)
    migrate_legacy_recruitment_json_once(engine)
    remove_legacy_persofest_once(engine)
    clear_legacy_poster_urls_once(engine)


def downgrade() -> None:
    bind = op.get_bind()
    Base.metadata.drop_all(bind=bind)
