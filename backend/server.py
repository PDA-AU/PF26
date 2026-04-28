from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from starlette.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from pathlib import Path
import os
import logging
import time

from database import SessionLocal
from models import PdaUser
from auth import decode_token
from utils import log_admin_action

from routers import public, auth_pda, pda_public, pda_admin, superadmin, pda_cc_admin
from routers import pda_events, pda_events_admin
from routers import (
    persohub_public,
    persohub_community_auth,
    persohub_community_admin,
    persohub_admin_profile,
    persohub_admin_events,
    persohub_admin_governance,
    persohub_events_admin,
    persohub_events,
)

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Create upload directory
UPLOAD_DIR = Path(os.environ.get('UPLOAD_DIR', '/app/backend/uploads'))
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

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

@app.middleware("http")
async def admin_audit_middleware(request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    path = request.url.path
    if path.startswith("/api/pda-admin/"):
        method = request.method.upper()
        if method not in {"POST", "PUT", "PATCH", "DELETE"}:
            return response
        try:
            auth_header = request.headers.get("authorization") or ""
            token = ""
            if auth_header.lower().startswith("bearer "):
                token = auth_header.split(" ", 1)[1].strip()
            if token:
                payload = decode_token(token)
                if payload.get("type") == "access" and payload.get("user_type") == "pda":
                    regno = payload.get("sub")
                    if regno:
                        db = SessionLocal()
                        try:
                            user = db.query(PdaUser).filter(PdaUser.regno == regno).first()
                            if user:
                                duration_ms = int((time.perf_counter() - start) * 1000)
                                log_admin_action(
                                    db,
                                    user,
                                    "Admin API Request",
                                    method=method,
                                    path=path,
                                    meta={
                                        "kind": "request",
                                        "status_code": response.status_code,
                                        "duration_ms": duration_ms,
                                    },
                                )
                        finally:
                            db.close()
        except Exception:
            logger.exception("Failed to log admin request")
    return response

# Routers
app.include_router(public.router, prefix="/api")
app.include_router(auth_pda.router, prefix="/api")
app.include_router(pda_public.router, prefix="/api")
app.include_router(pda_admin.router, prefix="/api")
app.include_router(pda_cc_admin.router, prefix="/api")
app.include_router(superadmin.router, prefix="/api")
app.include_router(pda_events.router, prefix="/api")
app.include_router(pda_events_admin.router, prefix="/api")
app.include_router(persohub_public.router, prefix="/api")
app.include_router(persohub_community_auth.router, prefix="/api")
app.include_router(persohub_community_admin.router, prefix="/api")
app.include_router(persohub_admin_profile.router, prefix="/api")
app.include_router(persohub_admin_events.router, prefix="/api")
app.include_router(persohub_admin_governance.router, prefix="/api")
app.include_router(persohub_events_admin.router, prefix="/api")
app.include_router(persohub_events.router, prefix="/api")
