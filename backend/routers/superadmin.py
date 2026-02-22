from fastapi import APIRouter, Depends, HTTPException, status, Request, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_, text
from typing import Dict, List, Optional
import json
from sqlalchemy.engine import make_url
import os
import tempfile
import subprocess
from datetime import datetime
import io
from urllib.parse import urlparse
from urllib.request import urlopen
from fastapi.responses import StreamingResponse
from openpyxl import Workbook

from database import get_db
from models import PdaAdmin, PdaUser, PdaTeam, AdminLog, SystemConfig
from schemas import (
    PdaAdminCreate,
    PdaAdminPolicyUpdate,
    PdaUserResponse,
    AdminLogResponse,
    RecruitmentApprovalItem,
    PdaRecruitmentConfigUpdateRequest,
    SuperadminMigrationStatusResponse,
)
from security import require_superadmin
from utils import log_admin_action, _upload_bytes_to_s3, S3_CLIENT, S3_BUCKET_NAME
from recruitment_state import clear_legacy_recruitment_json, get_recruitment_state, get_recruitment_state_map
from email_workflows import send_recruitment_review_email

router = APIRouter()
DATABASE_URL = os.environ.get("DATABASE_URL")
DB_RESTORE_CONFIRM_TEXT = "CONFIRM RESTORE"
DEFAULT_PDA_RECRUIT_URL = "https://chat.whatsapp.com/ErThvhBS77kGJEApiABP2z"
RECRUITMENT_NOTIFY_MARKER_KEY = "pda_recruitment_whatsapp_notified_once"
PERSOHUB_EVENT_NAMESPACE_STATUS_KEY = "migration_persohub_event_namespace_status_v1"
PERSOHUB_EVENT_NAMESPACE_STATUS_LOG_MARKER_KEY = "migration_persohub_event_namespace_status_log_once_v1"
PERSOHUB_EVENT_PARITY_STATUS_KEY = "migration_persohub_events_parity_v1"
PERSOHUB_EVENT_PARITY_STATUS_LOG_MARKER_KEY = "migration_persohub_events_parity_status_log_once_v1"


def _get_or_create_recruitment_config(db: Session) -> SystemConfig:
    reg_config = db.query(SystemConfig).filter(SystemConfig.key == "pda_recruitment_open").first()
    if not reg_config:
        reg_config = SystemConfig(key="pda_recruitment_open", value="true", recruit_url=DEFAULT_PDA_RECRUIT_URL)
        db.add(reg_config)
        db.commit()
        db.refresh(reg_config)
    elif not str(reg_config.recruit_url or "").strip():
        reg_config.recruit_url = DEFAULT_PDA_RECRUIT_URL
        db.commit()
        db.refresh(reg_config)
    return reg_config


def _table_exists(db: Session, table_name: str) -> bool:
    row = db.execute(
        text(
            """
            SELECT EXISTS (
                SELECT 1
                FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = :table_name
            )
            """
        ),
        {"table_name": table_name},
    ).scalar()
    return bool(row)


def _column_exists(db: Session, table_name: str, column_name: str) -> bool:
    row = db.execute(
        text(
            """
            SELECT EXISTS (
                SELECT 1
                FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = :table_name
                  AND column_name = :column_name
            )
            """
        ),
        {"table_name": table_name, "column_name": column_name},
    ).scalar()
    return bool(row)


def _index_exists(db: Session, index_name: str) -> bool:
    row = db.execute(
        text(
            """
            SELECT EXISTS (
                SELECT 1
                FROM pg_indexes
                WHERE schemaname = 'public'
                  AND indexname = :index_name
            )
            """
        ),
        {"index_name": index_name},
    ).scalar()
    return bool(row)

def _resolve_pg_binary(kind: str) -> str:
    # Allow explicit override first for production/runtime control.
    if kind == "dump":
        override = os.environ.get("PG_DUMP_BIN")
    elif kind == "restore":
        override = os.environ.get("PG_RESTORE_BIN")
    else:
        override = os.environ.get("PSQL_BIN")
    if override and os.path.isfile(override) and os.access(override, os.X_OK):
        return override

    if kind == "dump":
        candidates = [
            "/opt/homebrew/opt/postgresql@16/bin/pg_dump",
            "/opt/homebrew/opt/libpq/bin/pg_dump",
            "/usr/local/opt/postgresql@16/bin/pg_dump",
            "/usr/local/opt/libpq/bin/pg_dump",
            "/usr/lib/postgresql/16/bin/pg_dump",
            "pg_dump",
        ]
    elif kind == "restore":
        candidates = [
            "/opt/homebrew/opt/postgresql@16/bin/pg_restore",
            "/opt/homebrew/opt/libpq/bin/pg_restore",
            "/usr/local/opt/postgresql@16/bin/pg_restore",
            "/usr/local/opt/libpq/bin/pg_restore",
            "/usr/lib/postgresql/16/bin/pg_restore",
            "pg_restore",
        ]
    else:
        candidates = [
            "/opt/homebrew/opt/postgresql@16/bin/psql",
            "/opt/homebrew/opt/libpq/bin/psql",
            "/usr/local/opt/postgresql@16/bin/psql",
            "/usr/local/opt/libpq/bin/psql",
            "/usr/lib/postgresql/16/bin/psql",
            "psql",
        ]

    for candidate in candidates:
        if os.path.isabs(candidate):
            if os.path.isfile(candidate) and os.access(candidate, os.X_OK):
                return candidate
        else:
            return candidate

    return candidates[-1]


def _build_admin_response(
    user: PdaUser,
    team: Optional[PdaTeam] = None,
    admin_row: Optional[PdaAdmin] = None,
    recruit: Optional[Dict[str, Optional[str]]] = None,
) -> PdaUserResponse:
    policy = admin_row.policy if admin_row else None
    is_superadmin = bool(admin_row and policy and policy.get("superAdmin"))
    recruit_state = recruit or {}
    return PdaUserResponse(
        id=user.id,
        regno=user.regno,
        email=user.email,
        email_verified=user.email_verified,
        name=user.name,
        profile_name=user.profile_name,
        dob=user.dob,
        phno=user.phno,
        dept=user.dept,
        college=user.college or "MIT",
        image_url=user.image_url,
        is_member=user.is_member,
        is_applied=bool(recruit_state.get("is_applied")),
        preferred_team=recruit_state.get("preferred_team"),
        preferred_team_1=recruit_state.get("preferred_team_1"),
        preferred_team_2=recruit_state.get("preferred_team_2"),
        preferred_team_3=recruit_state.get("preferred_team_3"),
        resume_url=recruit_state.get("resume_url"),
        team=team.team if team else None,
        designation=team.designation if team else None,
        instagram_url=user.instagram_url,
        linkedin_url=user.linkedin_url,
        github_url=user.github_url,
        is_admin=bool(admin_row),
        is_superadmin=is_superadmin,
        policy=policy,
        created_at=user.created_at
    )


def _create_pg_dump(prefix: str = "pda_snapshot") -> tuple[str, str]:
    if not DATABASE_URL:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="DATABASE_URL not configured")
    url = make_url(DATABASE_URL)
    if not url.drivername.startswith("postgresql"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Snapshot only supported for PostgreSQL")

    timestamp = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
    filename = f"{prefix}_{timestamp}.dump"
    tmp_file = tempfile.NamedTemporaryFile(delete=False, suffix=".dump")
    tmp_file.close()

    pg_dump_bin = _resolve_pg_binary("dump")
    cmd = [
        pg_dump_bin,
        "--format=custom",
        "--no-owner",
        "--no-acl",
        "--host", url.host or "localhost",
        "--port", str(url.port or 5432),
        "--username", url.username or "",
        "--file", tmp_file.name,
        url.database or ""
    ]

    env = os.environ.copy()
    if url.password:
        env["PGPASSWORD"] = url.password

    try:
        result = subprocess.run(cmd, env=env, capture_output=True, text=True, check=True)
    except FileNotFoundError:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"pg_dump not installed on server (resolved binary: {pg_dump_bin})")
    except subprocess.CalledProcessError as exc:
        stderr = exc.stderr.strip() or exc.stdout.strip()
        if "server version" in stderr and "pg_dump version" in stderr:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=(
                    f"pg_dump failed due to version mismatch. "
                    f"Resolved binary: {pg_dump_bin}. "
                    "Set PG_DUMP_BIN to a PostgreSQL 16 pg_dump binary."
                ),
            ) from exc
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"pg_dump failed: {stderr}") from exc

    return tmp_file.name, filename


def _get_latest_snapshot_meta(db: Session):
    latest_log = (
        db.query(AdminLog)
        .filter(AdminLog.action == "Upload DB snapshot")
        .order_by(AdminLog.created_at.desc(), AdminLog.id.desc())
        .first()
    )
    if not latest_log or not isinstance(latest_log.meta, dict):
        return None

    snapshot_url = latest_log.meta.get("url")
    snapshot_filename = latest_log.meta.get("filename")
    if not snapshot_url or not snapshot_filename:
        return None

    return {
        "url": snapshot_url,
        "filename": snapshot_filename,
        "uploaded_at": latest_log.created_at.isoformat() if latest_log.created_at else None,
    }


def _download_snapshot_dump(snapshot_url: str) -> bytes:
    if not snapshot_url:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Snapshot URL missing")

    parsed = urlparse(snapshot_url)
    object_key = parsed.path.lstrip("/")

    if S3_CLIENT and S3_BUCKET_NAME and object_key:
        try:
            res = S3_CLIENT.get_object(Bucket=S3_BUCKET_NAME, Key=object_key)
            return res["Body"].read()
        except Exception:
            pass

    try:
        with urlopen(snapshot_url, timeout=30) as response:
            return response.read()
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to download snapshot dump") from exc


def _restore_pg_dump(dump_bytes: bytes) -> None:
    if not DATABASE_URL:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="DATABASE_URL not configured")
    if not dump_bytes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Snapshot dump is empty")

    url = make_url(DATABASE_URL)
    if not url.drivername.startswith("postgresql"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Restore only supported for PostgreSQL")

    tmp_file = tempfile.NamedTemporaryFile(delete=False, suffix=".dump")
    sql_file = tempfile.NamedTemporaryFile(delete=False, suffix=".sql")
    sql_file.close()
    try:
        tmp_file.write(dump_bytes)
        tmp_file.flush()
        tmp_file.close()

        pg_restore_bin = _resolve_pg_binary("restore")
        psql_bin = _resolve_pg_binary("psql")
        cmd = [
            pg_restore_bin,
            "--clean",
            "--if-exists",
            "--no-owner",
            "--no-acl",
            "--exit-on-error",
            "--host", url.host or "localhost",
            "--port", str(url.port or 5432),
            "--username", url.username or "",
            "--dbname", url.database or "",
            tmp_file.name,
        ]
        env = os.environ.copy()
        if url.password:
            env["PGPASSWORD"] = url.password

        try:
            subprocess.run(cmd, env=env, capture_output=True, text=True, check=True)
            return
        except subprocess.CalledProcessError as exc:
            detail = exc.stderr.strip() or exc.stdout.strip() or "pg_restore failed"
            if 'unrecognized configuration parameter "transaction_timeout"' not in detail:
                raise

            # Fallback for PG17-generated dumps restored on PG16.
            export_cmd = [
                pg_restore_bin,
                "--clean",
                "--if-exists",
                "--no-owner",
                "--no-acl",
                "--exit-on-error",
                "--file",
                sql_file.name,
                tmp_file.name,
            ]
            subprocess.run(export_cmd, env=env, capture_output=True, text=True, check=True)

            with open(sql_file.name, "r", encoding="utf-8") as handle:
                sql_text = handle.read()
            sql_text = sql_text.replace("SET transaction_timeout = 0;\n", "")
            with open(sql_file.name, "w", encoding="utf-8") as handle:
                handle.write(sql_text)

            psql_cmd = [
                psql_bin,
                "--host", url.host or "localhost",
                "--port", str(url.port or 5432),
                "--username", url.username or "",
                "--dbname", url.database or "",
                "--set", "ON_ERROR_STOP=1",
                "--file", sql_file.name,
            ]
            subprocess.run(psql_cmd, env=env, capture_output=True, text=True, check=True)
    except FileNotFoundError:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"pg_restore not installed on server (resolved binary: {pg_restore_bin})")
    except subprocess.CalledProcessError as exc:
        detail = exc.stderr.strip() or exc.stdout.strip() or "pg_restore failed"
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=detail) from exc
    finally:
        if os.path.exists(tmp_file.name):
            os.remove(tmp_file.name)
        if os.path.exists(sql_file.name):
            os.remove(sql_file.name)


@router.get("/pda-admin/superadmin/admins", response_model=List[PdaUserResponse])
def list_pda_admins(
    _: PdaUser = Depends(require_superadmin),
    db: Session = Depends(get_db),
):
    admin_users = (
        db.query(PdaUser)
        .join(PdaAdmin, PdaAdmin.user_id == PdaUser.id)
        .order_by(PdaAdmin.created_at.desc())
        .all()
    )
    if not admin_users:
        return []

    user_ids = [u.id for u in admin_users]
    team_map = {row.user_id: row for row in db.query(PdaTeam).filter(PdaTeam.user_id.in_(user_ids)).all()}
    admin_map = {row.user_id: row for row in db.query(PdaAdmin).filter(PdaAdmin.user_id.in_(user_ids)).all()}
    recruit_map = get_recruitment_state_map(db, admin_users)
    return [_build_admin_response(u, team_map.get(u.id), admin_map.get(u.id), recruit_map.get(u.id)) for u in admin_users]


@router.post("/pda-admin/superadmin/admins", response_model=PdaUserResponse)
def create_pda_admin(
    admin_data: PdaAdminCreate,
    superadmin: PdaUser = Depends(require_superadmin),
    db: Session = Depends(get_db),
    request: Request = None
):
    user = db.query(PdaUser).filter(PdaUser.id == admin_data.user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    team = db.query(PdaTeam).filter(PdaTeam.user_id == user.id).first()
    if not team:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User must be in PDA team to become admin")

    existing_admin = db.query(PdaAdmin).filter(PdaAdmin.user_id == user.id).first()
    if existing_admin:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Admin already exists")

    admin_row = PdaAdmin(
        user_id=user.id,
        policy={"home": True, "superAdmin": False, "events": {}}
    )
    db.add(admin_row)
    db.commit()

    log_admin_action(
        db,
        superadmin,
        "Create admin user",
        request.method if request else None,
        request.url.path if request else None,
        {"admin_id": user.id, "target_regno": user.regno},
    )
    recruit_state = get_recruitment_state(db, user.id, user=user)
    return _build_admin_response(user, team, admin_row, recruit_state)


@router.delete("/pda-admin/superadmin/admins/{user_id}")
def delete_pda_admin(
    user_id: int,
    superadmin: PdaUser = Depends(require_superadmin),
    db: Session = Depends(get_db),
    request: Request = None
):
    user = db.query(PdaUser).filter(PdaUser.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    admin_row = db.query(PdaAdmin).filter(PdaAdmin.user_id == user.id).first()
    if not admin_row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Admin not found")
    db.delete(admin_row)
    db.commit()
    log_admin_action(
        db,
        superadmin,
        "Delete admin user",
        request.method if request else None,
        request.url.path if request else None,
        {"admin_id": user_id, "target_regno": user.regno},
    )
    return {"message": "Admin removed"}


@router.put("/pda-admin/superadmin/admins/{user_id}/policy", response_model=PdaUserResponse)
def update_admin_policy(
    user_id: int,
    policy_data: PdaAdminPolicyUpdate,
    superadmin: PdaUser = Depends(require_superadmin),
    db: Session = Depends(get_db),
    request: Request = None
):
    user = db.query(PdaUser).filter(PdaUser.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    admin_row = db.query(PdaAdmin).filter(PdaAdmin.user_id == user.id).first()
    if not admin_row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Admin not found")
    admin_row.policy = policy_data.policy
    db.commit()
    log_admin_action(
        db,
        superadmin,
        "Update admin policy",
        request.method if request else None,
        request.url.path if request else None,
        {"admin_id": user_id, "policy": policy_data.policy, "target_regno": user.regno},
    )

    user = db.query(PdaUser).filter(PdaUser.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    team = db.query(PdaTeam).filter(PdaTeam.user_id == user.id).first()
    recruit_state = get_recruitment_state(db, user.id, user=user)
    return _build_admin_response(user, team, admin_row, recruit_state)


@router.get("/pda-admin/superadmin/logs", response_model=List[AdminLogResponse])
def get_homeadmin_logs(
    _: PdaUser = Depends(require_superadmin),
    db: Session = Depends(get_db),
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    log_type: str = Query(default="any"),
):
    query = db.query(AdminLog).filter(
        AdminLog.path.like("/api/%"),
        or_(AdminLog.method.is_(None), AdminLog.method.notin_(["GET", "HEAD", "OPTIONS"])),
    )
    if log_type == "request":
        query = query.filter(AdminLog.action == "Admin API Request")
    elif log_type == "action":
        query = query.filter(AdminLog.action != "Admin API Request")

    logs = query.order_by(AdminLog.id.desc()).offset(offset).limit(limit).all()
    return [AdminLogResponse.model_validate(l) for l in logs]


@router.post("/pda-admin/superadmin/db-snapshot")
def upload_db_snapshot(
    superadmin: PdaUser = Depends(require_superadmin),
    db: Session = Depends(get_db),
    request: Request = None
):
    file_path, filename = _create_pg_dump()
    try:
        with open(file_path, "rb") as handle:
            data = handle.read()
        url = _upload_bytes_to_s3(data, "dbsnapshot", filename, content_type="application/octet-stream")
    finally:
        if os.path.exists(file_path):
            os.remove(file_path)
    log_admin_action(db, superadmin, "Upload DB snapshot", request.method if request else None, request.url.path if request else None, {"filename": filename, "url": url})
    return {"url": url, "filename": filename, "uploaded_at": datetime.utcnow().isoformat() + "Z"}


@router.get("/pda-admin/superadmin/db-snapshot/latest")
def get_latest_db_snapshot(
    _: PdaUser = Depends(require_superadmin),
    db: Session = Depends(get_db),
):
    return {"snapshot": _get_latest_snapshot_meta(db)}


@router.post("/pda-admin/superadmin/db-snapshot/restore")
def restore_db_snapshot(
    payload: dict,
    superadmin: PdaUser = Depends(require_superadmin),
    db: Session = Depends(get_db),
    request: Request = None,
):
    confirm_text = str((payload or {}).get("confirm_text") or "").strip()
    if confirm_text != DB_RESTORE_CONFIRM_TEXT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f'Type "{DB_RESTORE_CONFIRM_TEXT}" to confirm restore',
        )

    snapshot = _get_latest_snapshot_meta(db)
    if not snapshot:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No snapshot available to restore")

    # Always create a fallback snapshot of the current DB before destructive restore.
    fallback_file_path, fallback_filename = _create_pg_dump(prefix="fallback_snapshot")
    try:
        with open(fallback_file_path, "rb") as handle:
            fallback_data = handle.read()
        fallback_url = _upload_bytes_to_s3(
            fallback_data,
            "dbsnapshot/fallback",
            fallback_filename,
            content_type="application/octet-stream",
        )
    finally:
        if os.path.exists(fallback_file_path):
            os.remove(fallback_file_path)

    log_admin_action(
        db,
        superadmin,
        "Restore DB snapshot",
        request.method if request else None,
        request.url.path if request else None,
        {
            "filename": snapshot.get("filename"),
            "url": snapshot.get("url"),
            "fallback_filename": fallback_filename,
            "fallback_url": fallback_url,
        },
    )

    dump_bytes = _download_snapshot_dump(snapshot.get("url"))
    db.close()
    _restore_pg_dump(dump_bytes)

    return {
        "restored": True,
        "filename": snapshot.get("filename"),
        "url": snapshot.get("url"),
        "fallback_filename": fallback_filename,
        "fallback_url": fallback_url,
        "restored_at": datetime.utcnow().isoformat() + "Z",
    }


@router.get("/pda-admin/superadmin/recruitment-status")
def get_recruitment_status(
    _: PdaUser = Depends(require_superadmin),
    db: Session = Depends(get_db)
):
    reg_config = _get_or_create_recruitment_config(db)
    recruitment_open = reg_config.value == "true"
    recruit_url = str(reg_config.recruit_url or "").strip() or DEFAULT_PDA_RECRUIT_URL
    marker = db.query(SystemConfig).filter(SystemConfig.key == RECRUITMENT_NOTIFY_MARKER_KEY).first()
    notify_sent_once = bool(marker and str(marker.value or "").strip().lower() == "done")
    return {"recruitment_open": recruitment_open, "recruit_url": recruit_url, "notify_sent_once": notify_sent_once}


@router.get(
    "/pda-admin/superadmin/migration-status/persohub-event-namespace",
    response_model=SuperadminMigrationStatusResponse,
)
def get_persohub_event_namespace_migration_status(
    superadmin: PdaUser = Depends(require_superadmin),
    db: Session = Depends(get_db),
    request: Request = None,
):
    status_row = db.query(SystemConfig).filter(SystemConfig.key == PERSOHUB_EVENT_NAMESPACE_STATUS_KEY).first()
    raw_value = str(status_row.value or "").strip() if status_row else ""
    parsed_status = {}
    if raw_value:
        try:
            loaded = json.loads(raw_value)
            if isinstance(loaded, dict):
                parsed_status = loaded
        except Exception:
            parsed_status = {}

    marker = db.query(SystemConfig).filter(SystemConfig.key == PERSOHUB_EVENT_NAMESPACE_STATUS_LOG_MARKER_KEY).first()
    logged_once = bool(marker and str(marker.value or "").strip().lower() == "done")
    if not logged_once:
        if not marker:
            marker = SystemConfig(key=PERSOHUB_EVENT_NAMESPACE_STATUS_LOG_MARKER_KEY, value="done")
            db.add(marker)
        else:
            marker.value = "done"

        log_admin_action(
            db,
            superadmin,
            "view_persohub_event_namespace_migration_status",
            request.method if request else None,
            request.url.path if request else None,
            {
                "status_recorded": bool(status_row),
                "ok": parsed_status.get("ok"),
            },
        )
        logged_once = True

    return SuperadminMigrationStatusResponse(
        status_key=PERSOHUB_EVENT_NAMESPACE_STATUS_KEY,
        recorded=bool(status_row),
        ok=parsed_status.get("ok"),
        old_remaining=parsed_status.get("old_remaining"),
        new_missing=parsed_status.get("new_missing"),
        legacy_sympo=parsed_status.get("legacy_sympo"),
        updated_at=(status_row.updated_at if status_row else None),
        logged_once=logged_once,
        raw_value=(None if parsed_status else (raw_value or None)),
    )


@router.get("/pda-admin/superadmin/migrations/persohub-events-parity-status")
def get_persohub_events_parity_status(
    superadmin: PdaUser = Depends(require_superadmin),
    db: Session = Depends(get_db),
    request: Request = None,
):
    required_tables = [
        "persohub_events",
        "persohub_event_rounds",
        "persohub_event_registrations",
        "persohub_event_teams",
        "persohub_event_team_members",
        "persohub_event_attendance",
        "persohub_event_scores",
        "persohub_event_badges",
        "persohub_event_invites",
        "persohub_event_logs",
        "persohub_event_round_submissions",
        "persohub_event_round_panels",
        "persohub_event_round_panel_members",
        "persohub_event_round_panel_assignments",
    ]
    required_event_columns = ["registration_open", "open_for"]
    required_round_columns = [
        "requires_submission",
        "submission_mode",
        "submission_deadline",
        "allowed_mime_types",
        "max_file_size_mb",
        "panel_mode_enabled",
        "panel_team_distribution_mode",
        "panel_structure_locked",
    ]
    required_indexes = [
        "idx_persohub_event_registration_event_entity_status_user",
        "idx_persohub_event_registration_event_entity_status_team",
        "idx_persohub_event_scores_event_round_entity_present_score",
        "idx_persohub_event_scores_event_entity_user_round",
        "idx_persohub_event_scores_event_entity_team_round",
        "idx_persohub_event_attendance_event_entity_user_present",
        "idx_persohub_event_attendance_event_entity_team_present",
        "uq_persohub_event_round_submission_entity",
        "uq_persohub_event_round_panel_round_no",
        "uq_persohub_event_round_panel_member",
        "uq_persohub_event_round_panel_assignment_entity",
    ]

    table_status = {name: _table_exists(db, name) for name in required_tables}
    column_status = {
        "persohub_events": {column_name: _column_exists(db, "persohub_events", column_name) for column_name in required_event_columns},
        "persohub_event_rounds": {column_name: _column_exists(db, "persohub_event_rounds", column_name) for column_name in required_round_columns},
    }
    index_status = {name: _index_exists(db, name) for name in required_indexes}

    missing_tables = sorted([name for name, exists in table_status.items() if not exists])
    missing_event_columns = sorted([name for name, exists in column_status["persohub_events"].items() if not exists])
    missing_round_columns = sorted([name for name, exists in column_status["persohub_event_rounds"].items() if not exists])
    missing_indexes = sorted([name for name, exists in index_status.items() if not exists])
    parity_ok = not (missing_tables or missing_event_columns or missing_round_columns or missing_indexes)

    status_row = db.query(SystemConfig).filter(SystemConfig.key == PERSOHUB_EVENT_PARITY_STATUS_KEY).first()
    parsed_status = {}
    if status_row and str(status_row.value or "").strip():
        try:
            loaded = json.loads(str(status_row.value))
            if isinstance(loaded, dict):
                parsed_status = loaded
        except Exception:
            parsed_status = {}

    marker = db.query(SystemConfig).filter(SystemConfig.key == PERSOHUB_EVENT_PARITY_STATUS_LOG_MARKER_KEY).first()
    logged_once = bool(marker and str(marker.value or "").strip().lower() == "done")
    if not logged_once:
        if not marker:
            marker = SystemConfig(key=PERSOHUB_EVENT_PARITY_STATUS_LOG_MARKER_KEY, value="done")
            db.add(marker)
        else:
            marker.value = "done"
        log_admin_action(
            db,
            superadmin,
            "view_persohub_events_parity_status",
            request.method if request else None,
            request.url.path if request else None,
            {
                "ok": parity_ok,
                "missing_tables": len(missing_tables),
                "missing_event_columns": len(missing_event_columns),
                "missing_round_columns": len(missing_round_columns),
                "missing_indexes": len(missing_indexes),
            },
        )
        logged_once = True

    return {
        "status_key": PERSOHUB_EVENT_PARITY_STATUS_KEY,
        "recorded": bool(status_row),
        "recorded_ok": parsed_status.get("ok"),
        "live_ok": parity_ok,
        "tables": table_status,
        "columns": column_status,
        "indexes": index_status,
        "missing_tables": missing_tables,
        "missing_event_columns": missing_event_columns,
        "missing_round_columns": missing_round_columns,
        "missing_indexes": missing_indexes,
        "updated_at": (status_row.updated_at if status_row else None),
        "logged_once": logged_once,
        "raw_value": (parsed_status or (status_row.value if status_row else None)),
    }


@router.post("/pda-admin/superadmin/migrations/persohub-events-parity-flag")
def set_persohub_events_parity_flag(
    enabled: bool = Query(...),
    superadmin: PdaUser = Depends(require_superadmin),
    db: Session = Depends(get_db),
    request: Request = None,
):
    row = db.query(SystemConfig).filter(SystemConfig.key == "persohub_events_parity_enabled").first()
    if not row:
        row = SystemConfig(key="persohub_events_parity_enabled", value="false")
        db.add(row)
    row.value = "true" if bool(enabled) else "false"
    db.commit()
    db.refresh(row)
    log_admin_action(
        db,
        superadmin,
        "set_persohub_events_parity_flag",
        request.method if request else None,
        request.url.path if request else None,
        {"enabled": bool(enabled)},
    )
    return {"key": "persohub_events_parity_enabled", "enabled": bool(enabled)}


@router.post("/pda-admin/superadmin/recruitment-toggle")
def toggle_recruitment(
    superadmin: PdaUser = Depends(require_superadmin),
    db: Session = Depends(get_db),
    request: Request = None
):
    reg_config = _get_or_create_recruitment_config(db)
    reg_config.value = "false" if reg_config.value == "true" else "true"
    db.commit()
    log_admin_action(db, superadmin, "toggle_pda_recruitment", request.method if request else None, request.url.path if request else None, {"recruitment_open": reg_config.value})
    marker = db.query(SystemConfig).filter(SystemConfig.key == RECRUITMENT_NOTIFY_MARKER_KEY).first()
    notify_sent_once = bool(marker and str(marker.value or "").strip().lower() == "done")
    return {"recruitment_open": reg_config.value == "true", "recruit_url": reg_config.recruit_url, "notify_sent_once": notify_sent_once}


@router.post("/pda-admin/superadmin/recruitment-config")
def update_recruitment_config(
    payload: PdaRecruitmentConfigUpdateRequest,
    superadmin: PdaUser = Depends(require_superadmin),
    db: Session = Depends(get_db),
    request: Request = None,
):
    reg_config = _get_or_create_recruitment_config(db)
    reg_config.recruit_url = str(payload.recruit_url or "").strip() or DEFAULT_PDA_RECRUIT_URL
    db.commit()
    db.refresh(reg_config)
    log_admin_action(
        db,
        superadmin,
        "update_pda_recruitment_config",
        request.method if request else None,
        request.url.path if request else None,
        {"recruit_url": reg_config.recruit_url},
    )
    marker = db.query(SystemConfig).filter(SystemConfig.key == RECRUITMENT_NOTIFY_MARKER_KEY).first()
    notify_sent_once = bool(marker and str(marker.value or "").strip().lower() == "done")
    return {"recruitment_open": reg_config.value == "true", "recruit_url": reg_config.recruit_url, "notify_sent_once": notify_sent_once}


@router.post("/pda-admin/superadmin/recruitment-notify-existing")
def notify_existing_recruitment_applicants(
    superadmin: PdaUser = Depends(require_superadmin),
    db: Session = Depends(get_db),
    request: Request = None,
):
    marker = db.query(SystemConfig).filter(SystemConfig.key == RECRUITMENT_NOTIFY_MARKER_KEY).first()
    if marker and str(marker.value or "").strip().lower() == "done":
        return {"already_sent": True, "sent": 0, "total_candidates": 0}

    reg_config = _get_or_create_recruitment_config(db)
    recruit_url = str(reg_config.recruit_url or "").strip() or DEFAULT_PDA_RECRUIT_URL

    pending_candidates = (
        db.query(PdaUser)
        .filter(PdaUser.is_member == False)
        .order_by(PdaUser.created_at.desc())
        .all()
    )
    recruit_map = get_recruitment_state_map(db, pending_candidates)
    pending = [user for user in pending_candidates if recruit_map.get(user.id, {}).get("is_applied")]

    sent = 0
    for candidate in pending:
        if not candidate.email:
            continue
        try:
            send_recruitment_review_email(candidate.email, candidate.name, recruit_url)
            sent += 1
        except Exception:
            continue

    if not marker:
        marker = SystemConfig(key=RECRUITMENT_NOTIFY_MARKER_KEY, value="done")
        db.add(marker)
    else:
        marker.value = "done"
    db.commit()

    log_admin_action(
        db,
        superadmin,
        "notify_existing_recruitment_applicants",
        request.method if request else None,
        request.url.path if request else None,
        {"sent": sent, "total_candidates": len(pending)},
    )
    return {"already_sent": False, "sent": sent, "total_candidates": len(pending)}


@router.get("/pda-admin/recruitments", response_model=List[PdaUserResponse])
def list_recruitments(
    _: PdaUser = Depends(require_superadmin),
    db: Session = Depends(get_db),
):
    pending_candidates = (
        db.query(PdaUser)
        .filter(PdaUser.is_member == False)
        .order_by(PdaUser.created_at.desc())
        .all()
    )
    recruit_map = get_recruitment_state_map(db, pending_candidates)
    pending = [user for user in pending_candidates if recruit_map.get(user.id, {}).get("is_applied")]
    if not pending:
        return []
    pending_ids = [u.id for u in pending]
    team_map = {row.user_id: row for row in db.query(PdaTeam).filter(PdaTeam.user_id.in_(pending_ids)).all()}
    admin_map = {row.user_id: row for row in db.query(PdaAdmin).filter(PdaAdmin.user_id.in_(pending_ids)).all()}
    return [_build_admin_response(u, team_map.get(u.id), admin_map.get(u.id), recruit_map.get(u.id)) for u in pending]


@router.get("/pda-admin/recruitments/export")
def export_recruitments(
    superadmin: PdaUser = Depends(require_superadmin),
    db: Session = Depends(get_db),
    request: Request = None,
):
    pending_candidates = (
        db.query(PdaUser)
        .filter(PdaUser.is_member == False)
        .order_by(PdaUser.created_at.desc())
        .all()
    )
    recruit_map = get_recruitment_state_map(db, pending_candidates)
    pending = [user for user in pending_candidates if recruit_map.get(user.id, {}).get("is_applied")]
    wb = Workbook()
    ws = wb.active
    ws.title = "Recruitments"
    ws.append([
        "Name", "Register Number", "Email", "Phone", "DOB", "Gender",
        "Department", "Preferred Team 1", "Preferred Team 2", "Preferred Team 3", "Resume URL", "Created At"
    ])
    for user in pending:
        recruit = recruit_map.get(user.id, {})
        ws.append([
            user.name,
            user.regno,
            user.email,
            user.phno or "",
            user.dob.isoformat() if user.dob else "",
            user.gender or "",
            user.dept or "",
            recruit.get("preferred_team_1") or "",
            recruit.get("preferred_team_2") or "",
            recruit.get("preferred_team_3") or "",
            recruit.get("resume_url") or "",
            user.created_at.isoformat() if user.created_at else ""
        ])
    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    filename = f"recruitments_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.xlsx"
    log_admin_action(db, superadmin, "Export recruitments", request.method if request else None, request.url.path if request else None, {"count": len(pending)})
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.post("/pda-admin/recruitments/approve")
def approve_recruitments(
    payload: List[object],
    superadmin: PdaUser = Depends(require_superadmin),
    db: Session = Depends(get_db),
    request: Request = None
):
    approved = []
    parsed_items = []
    for item in payload:
        if isinstance(item, int):
            user_id = item
            assigned_team = None
            assigned_designation = None
        else:
            try:
                parsed = RecruitmentApprovalItem.model_validate(item)
            except Exception:
                continue
            user_id = parsed.id
            assigned_team = parsed.team
            assigned_designation = parsed.designation
        parsed_items.append((user_id, assigned_team, assigned_designation))

    user_ids = list({user_id for user_id, _, _ in parsed_items})
    user_map = {u.id: u for u in db.query(PdaUser).filter(PdaUser.id.in_(user_ids)).all()} if user_ids else {}
    recruit_map = get_recruitment_state_map(db, user_map.values())

    for user_id, assigned_team, assigned_designation in parsed_items:
        user = user_map.get(user_id)
        if not user or user.is_member:
            continue
        recruit_state = recruit_map.get(user.id, {})
        if not recruit_state.get("is_applied"):
            continue
        team_to_assign = assigned_team or recruit_state.get("preferred_team_1") or recruit_state.get("preferred_team_2") or recruit_state.get("preferred_team_3")
        if not team_to_assign:
            continue
        if team_to_assign == "Executive" and assigned_designation not in {"Chairperson", "Vice Chairperson", "General Secretary", "Treasurer"}:
            continue
        team_row = db.query(PdaTeam).filter(PdaTeam.user_id == user.id).first()
        if not team_row:
            team_row = PdaTeam(
                user_id=user.id,
                team=team_to_assign,
                designation=assigned_designation or "Member"
            )
            db.add(team_row)
        else:
            team_row.team = team_to_assign
            team_row.designation = assigned_designation or team_row.designation or "Member"
        user.is_member = True
        clear_legacy_recruitment_json(user)
        approved.append(user.id)

    db.commit()
    log_admin_action(db, superadmin, "Approve recruitments", request.method if request else None, request.url.path if request else None, {"approved": approved})
    return {"approved": approved}


@router.post("/pda-admin/recruitments/reject")
def reject_recruitments(
    payload: List[object],
    superadmin: PdaUser = Depends(require_superadmin),
    db: Session = Depends(get_db),
    request: Request = None
):
    rejected = []
    user_ids = []
    for item in payload:
        if isinstance(item, int):
            user_id = item
        else:
            try:
                user_id = int(getattr(item, "id", None) or item.get("id"))
            except Exception:
                continue
        user_ids.append(user_id)

    user_map = {u.id: u for u in db.query(PdaUser).filter(PdaUser.id.in_(list(set(user_ids)))).all()} if user_ids else {}
    recruit_map = get_recruitment_state_map(db, user_map.values())
    for user_id in user_ids:
        user = user_map.get(user_id)
        if not user:
            continue
        if user.is_member:
            continue
        recruit_state = recruit_map.get(user.id, {})
        if not recruit_state.get("is_applied"):
            continue
        clear_legacy_recruitment_json(user)
        rejected.append(user.id)

    db.commit()
    log_admin_action(db, superadmin, "Reject recruitments", request.method if request else None, request.url.path if request else None, {"rejected": rejected})
    return {"rejected": rejected}
