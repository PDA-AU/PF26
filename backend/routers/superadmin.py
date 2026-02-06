from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from typing import List
from sqlalchemy.engine import make_url
import os
import tempfile
import subprocess
from datetime import datetime
import io
from fastapi.responses import StreamingResponse
from openpyxl import Workbook

from database import get_db
from models import PdaAdmin, PdaUser, PdaTeam, AdminLog, SystemConfig
from schemas import PdaAdminCreate, PdaAdminPolicyUpdate, PdaUserResponse, AdminLogResponse, RecruitmentApprovalItem
from security import require_superadmin
from auth import get_password_hash
from utils import log_admin_action, _upload_bytes_to_s3

router = APIRouter()
DATABASE_URL = os.environ.get("DATABASE_URL")


def _build_admin_response(db: Session, user: PdaUser) -> PdaUserResponse:
    team = db.query(PdaTeam).filter(PdaTeam.user_id == user.id).first()
    admin_row = db.query(PdaAdmin).filter(PdaAdmin.user_id == user.id).first()
    policy = admin_row.policy if admin_row else None
    is_superadmin = bool(admin_row and policy and policy.get("superAdmin"))
    return PdaUserResponse(
        id=user.id,
        regno=user.regno,
        email=user.email,
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


def _create_pg_dump() -> tuple[str, str]:
    if not DATABASE_URL:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="DATABASE_URL not configured")
    url = make_url(DATABASE_URL)
    if not url.drivername.startswith("postgresql"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Snapshot only supported for PostgreSQL")

    timestamp = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
    filename = f"pda_snapshot_{timestamp}.dump"
    tmp_file = tempfile.NamedTemporaryFile(delete=False, suffix=".dump")
    tmp_file.close()

    cmd = [
        "pg_dump",
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
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="pg_dump not installed on server")
    except subprocess.CalledProcessError as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"pg_dump failed: {exc.stderr.strip() or exc.stdout.strip()}") from exc

    return tmp_file.name, filename


@router.get("/pda-admin/superadmin/admins", response_model=List[PdaUserResponse])
async def list_pda_admins(
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
async def create_pda_admin(
    admin_data: PdaAdminCreate,
    superadmin: PdaUser = Depends(require_superadmin),
    db: Session = Depends(get_db),
    request: Request = None
):
    user = db.query(PdaUser).filter(PdaUser.regno == admin_data.regno).first()
    if not user:
        user = PdaUser(
            regno=admin_data.regno,
            email=f"{admin_data.regno}@pda.local",
            hashed_password=get_password_hash(admin_data.password),
            name=f"Admin {admin_data.regno}",
            phno=None,
            dept=None,
            is_member=False
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    else:
        user.hashed_password = get_password_hash(admin_data.password)
        db.commit()

    existing_admin = db.query(PdaAdmin).filter(PdaAdmin.user_id == user.id).first()
    if existing_admin:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Admin already exists")

    admin_row = PdaAdmin(
        user_id=user.id,
        hashed_password=get_password_hash(admin_data.password),
        policy={"home": True, "pf": False, "superAdmin": False}
    )
    db.add(admin_row)
    db.commit()

    log_admin_action(db, superadmin, "Create admin user", request.method if request else None, request.url.path if request else None, {"admin_id": user.id})
    return _build_admin_response(db, user)


@router.delete("/pda-admin/superadmin/admins/{user_id}")
async def delete_pda_admin(
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
async def update_admin_policy(
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
async def get_homeadmin_logs(
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
async def upload_db_snapshot(
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
    return {"url": url, "filename": filename}


@router.get("/pda-admin/superadmin/recruitment-status")
async def get_recruitment_status(
    _: PdaUser = Depends(require_superadmin),
    db: Session = Depends(get_db)
):
    reg_config = db.query(SystemConfig).filter(SystemConfig.key == "pda_recruitment_open").first()
    recruitment_open = reg_config.value == "true" if reg_config else True
    return {"recruitment_open": recruitment_open}


@router.post("/pda-admin/superadmin/recruitment-toggle")
async def toggle_recruitment(
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
async def list_recruitments(
    _: PdaUser = Depends(require_superadmin),
    db: Session = Depends(get_db)
):
    pending = db.query(PdaUser).filter(PdaUser.is_member == False).order_by(PdaUser.created_at.desc()).all()
    return [_build_admin_response(db, u) for u in pending]


@router.get("/pda-admin/recruitments/export")
async def export_recruitments(
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
async def approve_recruitments(
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
