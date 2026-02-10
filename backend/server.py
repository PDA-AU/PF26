from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from starlette.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from pathlib import Path
import os
import logging

from bootstrap import run_bootstrap_migrations

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
    run_on_startup = os.environ.get("RUN_DB_MIGRATIONS_ON_STARTUP", "false").lower() in {"1", "true", "yes"}
    if run_on_startup:
        logger.info("RUN_DB_MIGRATIONS_ON_STARTUP=true, running bootstrap migrations during startup.")
        run_bootstrap_migrations()
    else:
        logger.info("Skipping schema/data bootstrap on startup. Run `python3 run_migrations.py` once when needed.")


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
