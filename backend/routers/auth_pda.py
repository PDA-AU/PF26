from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.orm import Session
from typing import Optional
import io

from database import get_db
from models import PdaUser, PdaTeam, PdaAdmin, SystemConfig
from schemas import (
    PdaUserRegister,
    PdaUserLogin,
    PdaTokenResponse,
    RefreshTokenRequest,
    PdaUserResponse,
    PdaUserUpdate,
    PdaPasswordChangeRequest,
    PdaPasswordChangeResponse,
    PresignRequest,
    PresignResponse,
    ImageUrlUpdate
)
from auth import verify_password, get_password_hash, create_access_token, create_refresh_token, decode_token
from security import require_pda_user
from utils import _upload_to_s3, _generate_presigned_put_url

router = APIRouter()


def _build_pda_user_response(db: Session, user: PdaUser) -> PdaUserResponse:
    team = db.query(PdaTeam).filter(PdaTeam.user_id == user.id).first()
    admin_row = db.query(PdaAdmin).filter(PdaAdmin.user_id == user.id).first()
    policy = admin_row.policy if admin_row else None
    is_superadmin = bool(admin_row and policy and policy.get("superAdmin"))
    is_admin = bool(admin_row)
    preferred_team = None
    if isinstance(user.json_content, dict):
        preferred_team = user.json_content.get("preferred_team")
    return PdaUserResponse(
        id=user.id,
        regno=user.regno,
        email=user.email,
        name=user.name,
        dob=user.dob,
        gender=user.gender,
        phno=user.phno,
        dept=user.dept,
        image_url=user.image_url,
        is_member=user.is_member,
        preferred_team=preferred_team,
        team=team.team if team else None,
        designation=team.designation if team else None,
        is_admin=is_admin,
        is_superadmin=is_superadmin,
        policy=policy,
        created_at=user.created_at
    )


@router.post("/auth/register", response_model=PdaTokenResponse)
async def pda_register(user_data: PdaUserRegister, db: Session = Depends(get_db)):
    reg_config = db.query(SystemConfig).filter(SystemConfig.key == "pda_recruitment_open").first()
    if reg_config and reg_config.value == "false":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Recruitment is closed")

    existing = db.query(PdaUser).filter(
        (PdaUser.regno == user_data.regno) | (PdaUser.email == user_data.email)
    ).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="User already exists")

    json_content = {}
    if user_data.preferred_team:
        if user_data.preferred_team == "Executive":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Executive team cannot be selected")
        json_content["preferred_team"] = user_data.preferred_team

    new_user = PdaUser(
        regno=user_data.regno,
        email=user_data.email,
        hashed_password=get_password_hash(user_data.password),
        name=user_data.name,
        dob=user_data.dob,
        gender=user_data.gender,
        phno=user_data.phno,
        dept=user_data.dept,
        image_url=user_data.image_url,
        json_content=json_content,
        is_member=False
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    access_token = create_access_token({"sub": new_user.regno, "user_type": "pda"})
    refresh_token = create_refresh_token({"sub": new_user.regno, "user_type": "pda"})
    return PdaTokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=_build_pda_user_response(db, new_user)
    )


@router.post("/auth/login", response_model=PdaTokenResponse)
async def pda_login(login_data: PdaUserLogin, db: Session = Depends(get_db)):
    user = db.query(PdaUser).filter(PdaUser.regno == login_data.regno).first()
    if not user or not verify_password(login_data.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    access_token = create_access_token({"sub": user.regno, "user_type": "pda"})
    refresh_token = create_refresh_token({"sub": user.regno, "user_type": "pda"})
    return PdaTokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=_build_pda_user_response(db, user)
    )


@router.post("/auth/refresh", response_model=PdaTokenResponse)
async def pda_refresh(request: RefreshTokenRequest, db: Session = Depends(get_db)):
    payload = decode_token(request.refresh_token)
    if payload.get("type") != "refresh" or payload.get("user_type") != "pda":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
    regno = payload.get("sub")
    user = db.query(PdaUser).filter(PdaUser.regno == regno).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    access_token = create_access_token({"sub": user.regno, "user_type": "pda"})
    refresh_token = create_refresh_token({"sub": user.regno, "user_type": "pda"})
    return PdaTokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=_build_pda_user_response(db, user)
    )


@router.get("/me", response_model=PdaUserResponse)
async def get_pda_me(user: PdaUser = Depends(require_pda_user), db: Session = Depends(get_db)):
    return _build_pda_user_response(db, user)


@router.put("/me", response_model=PdaUserResponse)
async def update_pda_me(
    update_data: PdaUserUpdate,
    user: PdaUser = Depends(require_pda_user),
    db: Session = Depends(get_db)
):
    if update_data.name is not None:
        user.name = update_data.name
    if update_data.email is not None:
        user.email = update_data.email
    if update_data.dob is not None:
        user.dob = update_data.dob
    if update_data.gender is not None:
        user.gender = update_data.gender
    if update_data.phno is not None:
        user.phno = update_data.phno
    if update_data.dept is not None:
        user.dept = update_data.dept
    if update_data.image_url is not None:
        user.image_url = update_data.image_url

    db.commit()
    db.refresh(user)
    return _build_pda_user_response(db, user)


@router.post("/me/change-password", response_model=PdaPasswordChangeResponse)
async def change_pda_password(
    payload: PdaPasswordChangeRequest,
    user: PdaUser = Depends(require_pda_user),
    db: Session = Depends(get_db)
):
    if not verify_password(payload.old_password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Old password is incorrect")
    if payload.new_password != payload.confirm_password:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="New password and confirm password do not match")

    user.hashed_password = get_password_hash(payload.new_password)
    db.commit()
    return PdaPasswordChangeResponse(status="ok")


@router.post("/me/profile-picture", response_model=PdaUserResponse)
async def update_pda_profile_picture(
    file: UploadFile = File(...),
    user: PdaUser = Depends(require_pda_user),
    db: Session = Depends(get_db)
):
    if not file.filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing filename")
    contents = await file.read()
    if len(contents) > 12 * 1024 * 1024:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File size exceeds 12MB limit")
    file.file = io.BytesIO(contents)

    s3_url = _upload_to_s3(file, "team", allowed_types=["image/png", "image/jpeg", "image/webp"])
    user.image_url = s3_url
    db.commit()
    db.refresh(user)
    return _build_pda_user_response(db, user)


@router.post("/me/profile-picture/presign", response_model=PresignResponse)
async def presign_pda_profile_picture(
    payload: PresignRequest,
    user: PdaUser = Depends(require_pda_user)
):
    return _generate_presigned_put_url(
        "team",
        payload.filename,
        payload.content_type,
        allowed_types=["image/png", "image/jpeg", "image/webp"]
    )


@router.post("/me/profile-picture/confirm", response_model=PdaUserResponse)
async def confirm_pda_profile_picture(
    payload: ImageUrlUpdate,
    user: PdaUser = Depends(require_pda_user),
    db: Session = Depends(get_db)
):
    user.image_url = payload.image_url
    db.commit()
    db.refresh(user)
    return _build_pda_user_response(db, user)
