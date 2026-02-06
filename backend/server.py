from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from starlette.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from pathlib import Path
import os
import logging

from database import engine, get_db, Base
from models import SystemConfig
from migrations import (
    rename_users_to_participants,
    ensure_events_table,
    ensure_participants_event_column,
    ensure_pda_users_table,
    ensure_pda_users_dob_column,
    ensure_pda_team_columns,
    ensure_pda_team_constraints,
    ensure_pda_admins_table,
    drop_admin_logs_fk,
    seed_persofest_event,
    assign_participants_event,
    seed_pda_users_from_team,
    link_pda_team_users,
    normalize_pda_team,
    ensure_superadmin_policies,
    ensure_default_superadmin
)

from routers import public, auth_pda, auth_participant, pda_public, pda_admin, persofest_admin, superadmin

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Create upload directory
UPLOAD_DIR = Path(os.environ.get('UPLOAD_DIR', '/app/backend/uploads'))
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = FastAPI(title="Persofest'26 API", version="1.0.0")

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
    rename_users_to_participants(engine)
    ensure_events_table(engine)
    ensure_participants_event_column(engine)
    ensure_pda_users_table(engine)
    ensure_pda_users_dob_column(engine)
    ensure_pda_team_columns(engine)
    ensure_pda_team_constraints(engine)
    drop_admin_logs_fk(engine)
    ensure_pda_admins_table(engine)

    # Create tables based on models
    Base.metadata.create_all(bind=engine)

    # Seed default data
    seed_persofest_event(engine)
    assign_participants_event(engine)

    db = next(get_db())
    try:
        normalize_pda_team(db)
        seed_pda_users_from_team(db)
        link_pda_team_users(db)
        ensure_default_superadmin(db)
        ensure_superadmin_policies(db)

        # Initialize system config
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


# Routers
app.include_router(public.router, prefix="/api")
app.include_router(auth_pda.router, prefix="/api")
app.include_router(auth_participant.router, prefix="/api")
app.include_router(pda_public.router, prefix="/api")
app.include_router(pda_admin.router, prefix="/api")
app.include_router(superadmin.router, prefix="/api")
app.include_router(persofest_admin.router, prefix="/api")
