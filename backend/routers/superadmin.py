from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from typing import List
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
from schemas import PdaAdminCreate, PdaAdminPolicyUpdate, PdaUserResponse, AdminLogResponse, RecruitmentApprovalItem
from security import require_superadmin
from utils import log_admin_action, _upload_bytes_to_s3, S3_CLIENT, S3_BUCKET_NAME

router = APIRouter()
DATABASE_URL = os.environ.get("DATABASE_URL")
DB_RESTORE_CONFIRM_TEXT = "CONFIRM RESTORE"


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


def _build_admin_response(db: Session, user: PdaUser) -> PdaUserResponse:
    team = db.query(PdaTeam).filter(PdaTeam.user_id == user.id).first()
    admin_row = db.query(PdaAdmin).filter(PdaAdmin.user_id == user.id).first()
    policy = admin_row.policy if admin_row else None
    is_superadmin = bool(admin_row and policy and policy.get("superAdmin"))
    return PdaUserResponse(
        id=user.id,
        regno=user.regno,
        email=user.email,
        email_verified=user.email_verified,
        name=user.name,
        dob=user.dob,
        phno=user.phno,
        dept=user.dept,
        image_url=user.image_url,
        is_member=user.is_member,
        preferred_team=(user.json_content or {}).get("preferred_team") if isinstance(user.json_content, dict) else None,
        team=team.team if team else None,
        designation=team.designation if team else None,
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
    db: Session = Depends(get_db)
):
    admin_users = (
        db.query(PdaUser)
        .join(PdaAdmin, PdaAdmin.user_id == PdaUser.id)
        .order_by(PdaAdmin.created_at.desc())
        .all()
    )
    return [_build_admin_response(db, u) for u in admin_users]


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
        policy={"home": True, "pf": False, "superAdmin": False, "events": {}}
    )
    db.add(admin_row)
    db.commit()

    log_admin_action(db, superadmin, "Create admin user", request.method if request else None, request.url.path if request else None, {"admin_id": user.id})
    return _build_admin_response(db, user)


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
    log_admin_action(db, superadmin, "Delete admin user", request.method if request else None, request.url.path if request else None, {"admin_id": user_id})
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
    log_admin_action(db, superadmin, "Update admin policy", request.method if request else None, request.url.path if request else None, {"admin_id": user_id, "policy": policy_data.policy})

    user = db.query(PdaUser).filter(PdaUser.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return _build_admin_response(db, user)


@router.get("/pda-admin/superadmin/logs", response_model=List[AdminLogResponse])
def get_homeadmin_logs(
    _: PdaUser = Depends(require_superadmin),
    db: Session = Depends(get_db),
    limit: int = 50
):
    logs = (
        db.query(AdminLog)
        .filter(AdminLog.path.like("/api/%"))
        .order_by(AdminLog.id.desc())
        .limit(limit)
        .all()
    )
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
    reg_config = db.query(SystemConfig).filter(SystemConfig.key == "pda_recruitment_open").first()
    recruitment_open = reg_config.value == "true" if reg_config else True
    return {"recruitment_open": recruitment_open}


@router.post("/pda-admin/superadmin/recruitment-toggle")
def toggle_recruitment(
    superadmin: PdaUser = Depends(require_superadmin),
    db: Session = Depends(get_db),
    request: Request = None
):
    reg_config = db.query(SystemConfig).filter(SystemConfig.key == "pda_recruitment_open").first()
    if not reg_config:
        reg_config = SystemConfig(key="pda_recruitment_open", value="false")
        db.add(reg_config)
        db.commit()
        db.refresh(reg_config)
    else:
        reg_config.value = "false" if reg_config.value == "true" else "true"
        db.commit()
    log_admin_action(db, superadmin, "toggle_pda_recruitment", request.method if request else None, request.url.path if request else None, {"recruitment_open": reg_config.value})
    return {"recruitment_open": reg_config.value == "true"}


@router.get("/pda-admin/recruitments", response_model=List[PdaUserResponse])
def list_recruitments(
    _: PdaUser = Depends(require_superadmin),
    db: Session = Depends(get_db)
):
    pending = db.query(PdaUser).filter(PdaUser.is_member == False).order_by(PdaUser.created_at.desc()).all()
    return [_build_admin_response(db, u) for u in pending]


@router.get("/pda-admin/recruitments/export")
def export_recruitments(
    superadmin: PdaUser = Depends(require_superadmin),
    db: Session = Depends(get_db),
    request: Request = None
):
    pending = db.query(PdaUser).filter(PdaUser.is_member == False).order_by(PdaUser.created_at.desc()).all()
    wb = Workbook()
    ws = wb.active
    ws.title = "Recruitments"
    ws.append([
        "Name", "Register Number", "Email", "Phone", "DOB", "Gender",
        "Department", "Preferred Team", "Created At"
    ])
    for user in pending:
        preferred_team = None
        if isinstance(user.json_content, dict):
            preferred_team = user.json_content.get("preferred_team")
        ws.append([
            user.name,
            user.regno,
            user.email,
            user.phno or "",
            user.dob.isoformat() if user.dob else "",
            user.gender or "",
            user.dept or "",
            preferred_team or "",
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

        user = db.query(PdaUser).filter(PdaUser.id == user_id).first()
        if not user or user.is_member:
            continue
        preferred_team = None
        if isinstance(user.json_content, dict):
            preferred_team = user.json_content.get("preferred_team")
        team_to_assign = assigned_team or preferred_team
        if not team_to_assign:
            continue
        if team_to_assign == "Executive" and assigned_designation not in {"Chairperson", "Vice Chairperson", "General Secretary", "Treasurer"}:
            continue
        new_team = PdaTeam(
            user_id=user.id,
            team=team_to_assign,
            designation=assigned_designation or "Member",
            instagram_url=None,
            linkedin_url=None
        )
        db.add(new_team)
        user.is_member = True
        approved.append(user.id)

    db.commit()
    log_admin_action(db, superadmin, "Approve recruitments", request.method if request else None, request.url.path if request else None, {"approved": approved})
    return {"approved": approved}
