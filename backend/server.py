from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from starlette.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from pathlib import Path
import os
import logging

from database import engine, get_db, SessionLocal, Base
from models import SystemConfig
from migrations import (
    ensure_pda_users_table,
    ensure_pda_users_dob_column,
    ensure_pda_users_gender_column,
    normalize_pda_profile_enum_values,
    ensure_pda_users_profile_name_column,
    ensure_pda_user_social_columns,
    ensure_pda_recruitment_tables,
    ensure_system_config_recruit_url_column,
    migrate_legacy_recruitment_json_once,
    ensure_pda_team_columns,
    ensure_pda_items_columns,
    ensure_pda_items_no_hero_caption,
    ensure_pda_team_constraints,
    ensure_pda_gallery_tag_column,
    ensure_pda_admins_table,
    ensure_email_auth_columns,
    normalize_pda_admins_schema,
    drop_admin_logs_fk,
    normalize_pda_team_schema,
    migrate_pda_team_social_handles_to_users,
    normalize_pda_team,
    backfill_is_member_from_team_once,
    ensure_superadmin_policies,
    ensure_default_superadmin,
    ensure_pda_event_tables,
    backfill_pda_event_round_count_once,
    remove_legacy_persofest_once,
    clear_legacy_poster_urls_once,
    ensure_persohub_tables,
    ensure_persohub_defaults,
)

from routers import public, auth_pda, pda_public, pda_admin, superadmin
from routers import pda_events, pda_events_admin
from routers import persohub_public, persohub_community_auth, persohub_community_admin

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Create upload directory
UPLOAD_DIR = Path(os.environ.get('UPLOAD_DIR', '/app/backend/uploads'))
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)
DEFAULT_PDA_RECRUIT_URL = "https://chat.whatsapp.com/ErThvhBS77kGJEApiABP2z"

app = FastAPI(title="PDA API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Total-Count", "X-Page", "X-Page-Size"],
)

# Mount static files for uploads
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

@app.on_event("startup")
async def startup_event():
    # Migrations / schema adjustments
    ensure_pda_users_table(engine)
    ensure_pda_users_dob_column(engine)
    ensure_pda_users_gender_column(engine)
    normalize_pda_profile_enum_values(engine)
    ensure_pda_users_profile_name_column(engine)
    ensure_pda_user_social_columns(engine)
    ensure_pda_team_columns(engine)
    ensure_pda_items_columns(engine)
    ensure_pda_items_no_hero_caption(engine)
    ensure_pda_team_constraints(engine)
    ensure_pda_gallery_tag_column(engine)
    drop_admin_logs_fk(engine)
    ensure_pda_admins_table(engine)
    ensure_email_auth_columns(engine)
    ensure_pda_event_tables(engine)
    backfill_pda_event_round_count_once(engine)
    ensure_persohub_tables(engine)
    ensure_pda_recruitment_tables(engine)
    ensure_system_config_recruit_url_column(engine)

    Base.metadata.create_all(bind=engine)

    migrate_legacy_recruitment_json_once(engine)
    remove_legacy_persofest_once(engine)
    clear_legacy_poster_urls_once(engine)

    db = SessionLocal()
    try:
        normalize_pda_team(db)
        normalize_pda_team_schema(db)
        migrate_pda_team_social_handles_to_users(db)
        backfill_is_member_from_team_once(db)
        normalize_pda_admins_schema(db)
        ensure_default_superadmin(db)
        ensure_superadmin_policies(db)
        ensure_persohub_defaults(db)

        # Initialize system config
        reg_config = db.query(SystemConfig).filter(SystemConfig.key == "registration_open").first()
        if not reg_config:
            db.add(SystemConfig(key="registration_open", value="true"))
            db.commit()
        pda_recruit_config = db.query(SystemConfig).filter(SystemConfig.key == "pda_recruitment_open").first()
        if not pda_recruit_config:
            db.add(SystemConfig(key="pda_recruitment_open", value="true", recruit_url=DEFAULT_PDA_RECRUIT_URL))
            db.commit()
        elif not str(pda_recruit_config.recruit_url or "").strip():
            pda_recruit_config.recruit_url = DEFAULT_PDA_RECRUIT_URL
            db.commit()

    finally:
        db.close()


# Routers
app.include_router(public.router, prefix="/api")
app.include_router(auth_pda.router, prefix="/api")
app.include_router(pda_public.router, prefix="/api")
app.include_router(pda_admin.router, prefix="/api")
app.include_router(superadmin.router, prefix="/api")
app.include_router(pda_events.router, prefix="/api")
app.include_router(pda_events_admin.router, prefix="/api")
app.include_router(persohub_public.router, prefix="/api")
app.include_router(persohub_community_auth.router, prefix="/api")
app.include_router(persohub_community_admin.router, prefix="/api")
