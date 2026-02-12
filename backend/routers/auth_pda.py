from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from time_utils import ensure_timezone, now_tz
from email_tokens import generate_token, hash_token, RESET_TOKEN_TTL_SECONDS
from datetime import timedelta
from typing import Optional
import io

from database import get_db
from models import PdaUser, PdaTeam, PdaAdmin, SystemConfig
from schemas import (
    PdaUserRegister,
    PdaRecruitmentApplyRequest,
    PdaRecruitmentResumeUpdateRequest,
    PdaUserLogin,
    PdaTokenResponse,
    RefreshTokenRequest,
    PdaUserResponse,
    PdaUserUpdate,
    PdaPasswordChangeRequest,
    PdaPasswordChangeResponse,
    PresignRequest,
    PresignResponse,
    ImageUrlUpdate,
    EmailVerificationRequest,
    PdaForgotPasswordRequest,
    ResetPasswordRequest
)
from auth import verify_password, get_password_hash, create_access_token, create_refresh_token, decode_token
from security import require_pda_user
from utils import _upload_to_s3, _generate_presigned_put_url
from email_workflows import issue_verification, verify_email_token, issue_password_reset, reset_password_with_token
from email_workflows import send_recruitment_review_email
from persohub_service import (
    ensure_user_follows_default_communities,
    generate_unique_profile_name,
    is_profile_name_valid,
)
from recruitment_state import create_recruitment_application, get_recruitment_state, update_recruitment_resume
import os

router = APIRouter()
DEFAULT_PDA_RECRUIT_URL = "https://chat.whatsapp.com/ErThvhBS77kGJEApiABP2z"


def _normalize_optional_text(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    normalized = str(value).strip()
    return normalized or None


def _get_recruitment_config(db: Session) -> SystemConfig:
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

def _build_pda_user_response(db: Session, user: PdaUser) -> PdaUserResponse:
    team = db.query(PdaTeam).filter(PdaTeam.user_id == user.id).first()
    admin_row = db.query(PdaAdmin).filter(PdaAdmin.user_id == user.id).first()
    policy = admin_row.policy if admin_row else None
    is_superadmin = bool(admin_row and policy and policy.get("superAdmin"))
    is_admin = bool(admin_row)
    recruit = get_recruitment_state(db, user.id, user=user)
    return PdaUserResponse(
        id=user.id,
        regno=user.regno,
        email=user.email,
        email_verified=user.email_verified,
        name=user.name,
        profile_name=user.profile_name,
        dob=user.dob,
        gender=user.gender,
        phno=user.phno,
        dept=user.dept,
        image_url=user.image_url,
        is_member=user.is_member,
        is_applied=bool(recruit["is_applied"]),
        preferred_team=recruit["preferred_team"],
        preferred_team_1=recruit["preferred_team_1"],
        preferred_team_2=recruit["preferred_team_2"],
        preferred_team_3=recruit["preferred_team_3"],
        resume_url=recruit["resume_url"],
        team=team.team if team else None,
        designation=team.designation if team else None,
        instagram_url=user.instagram_url,
        linkedin_url=user.linkedin_url,
        github_url=user.github_url,
        is_admin=is_admin,
        is_superadmin=is_superadmin,
        policy=policy,
        created_at=user.created_at
    )


def _issue_inline_password_reset(db: Session, user: PdaUser) -> str:
    token = generate_token()
    user.password_reset_token_hash = hash_token(token)
    user.password_reset_expires_at = now_tz() + timedelta(seconds=RESET_TOKEN_TTL_SECONDS)
    user.password_reset_sent_at = now_tz()
    db.commit()
    return token


@router.post("/auth/register")
def pda_register(user_data: PdaUserRegister, db: Session = Depends(get_db)):
    existing = db.query(PdaUser).filter(
        (PdaUser.regno == user_data.regno) | (PdaUser.email == user_data.email)
    ).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="User already exists")

    desired_profile_name = str(user_data.profile_name or "").strip().lower() or None
    if desired_profile_name:
        if not is_profile_name_valid(desired_profile_name):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid profile name format")
        existing_profile = db.query(PdaUser).filter(PdaUser.profile_name == desired_profile_name).first()
        if existing_profile:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Profile name already in use")
        from models import PersohubCommunity
        community_conflict = db.query(PersohubCommunity).filter(
            PersohubCommunity.profile_id == desired_profile_name
        ).first()
        if community_conflict:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Profile name reserved by community")

    new_user = PdaUser(
        regno=user_data.regno,
        email=user_data.email,
        hashed_password=get_password_hash(user_data.password),
        name=user_data.name,
        profile_name=desired_profile_name or generate_unique_profile_name(db, user_data.name),
        dob=user_data.dob,
        gender=_normalize_optional_text(user_data.gender),
        phno=user_data.phno,
        dept=_normalize_optional_text(user_data.dept),
        image_url=user_data.image_url,
        json_content={},
        is_member=False
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    ensure_user_follows_default_communities(db, new_user.id)
    db.commit()

    try:
        issue_verification(db, new_user, "pda")
    except Exception:
        pass

    if os.environ.get("EMAIL_VERIFY_REQUIRED", "false").lower() == "true":
        return JSONResponse(status_code=202, content={"status": "verification_required"})

    access_token = create_access_token({"sub": new_user.regno, "user_type": "pda"})
    refresh_token = create_refresh_token({"sub": new_user.regno, "user_type": "pda"})
    return PdaTokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=_build_pda_user_response(db, new_user)
    )


@router.post("/pda/recruitment/apply", response_model=PdaUserResponse)
def apply_for_pda_recruitment(
    payload: PdaRecruitmentApplyRequest,
    user: PdaUser = Depends(require_pda_user),
    db: Session = Depends(get_db)
):
    if user.is_member:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You are already a PDA member")

    reg_config = _get_recruitment_config(db)
    if reg_config.value == "false":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Recruitment is closed")

    recruit_state = get_recruitment_state(db, user.id, user=user)
    if recruit_state["is_applied"]:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Recruitment application already submitted")

    create_recruitment_application(
        db=db,
        user=user,
        preferred_team_1=payload.preferred_team_1,
        preferred_team_2=payload.preferred_team_2,
        preferred_team_3=payload.preferred_team_3,
        resume_url=payload.resume_url,
    )
    db.commit()
    db.refresh(user)
    try:
        recruit_url = str(reg_config.recruit_url or "").strip() or DEFAULT_PDA_RECRUIT_URL
        send_recruitment_review_email(user.email, user.name, recruit_url)
    except Exception:
        pass
    return _build_pda_user_response(db, user)


@router.put("/pda/recruitment/resume", response_model=PdaUserResponse)
def update_pda_recruitment_resume(
    payload: PdaRecruitmentResumeUpdateRequest,
    user: PdaUser = Depends(require_pda_user),
    db: Session = Depends(get_db),
):
    if not payload.remove and not payload.resume_url:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="resume_url is required")

    update_recruitment_resume(
        db=db,
        user=user,
        resume_url=payload.resume_url,
        remove=bool(payload.remove),
    )
    db.commit()
    db.refresh(user)
    return _build_pda_user_response(db, user)


@router.post("/auth/login", response_model=PdaTokenResponse)
def pda_login(login_data: PdaUserLogin, db: Session = Depends(get_db)):
    user = db.query(PdaUser).filter(PdaUser.regno == login_data.regno).first()
    if not user or not verify_password(login_data.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if os.environ.get("EMAIL_VERIFY_REQUIRED", "false").lower() == "true" and not user.email_verified:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Email not verified")

    access_token = create_access_token({"sub": user.regno, "user_type": "pda"})
    refresh_token = create_refresh_token({"sub": user.regno, "user_type": "pda"})
    reset_required = verify_password("password", user.hashed_password)
    reset_token = _issue_inline_password_reset(db, user) if reset_required else None
    return PdaTokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=_build_pda_user_response(db, user),
        password_reset_required=reset_required,
        reset_token=reset_token
    )


@router.post("/auth/refresh", response_model=PdaTokenResponse)
def pda_refresh(request: RefreshTokenRequest, db: Session = Depends(get_db)):
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
def get_pda_me(user: PdaUser = Depends(require_pda_user), db: Session = Depends(get_db)):
    return _build_pda_user_response(db, user)


@router.put("/me", response_model=PdaUserResponse)
def update_pda_me(
    update_data: PdaUserUpdate,
    user: PdaUser = Depends(require_pda_user),
    db: Session = Depends(get_db)
):
    email_changed = False
    if update_data.name is not None:
        user.name = update_data.name
    if update_data.profile_name is not None:
        if not is_profile_name_valid(update_data.profile_name):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid profile name format")
        existing = db.query(PdaUser).filter(
            PdaUser.profile_name == update_data.profile_name,
            PdaUser.id != user.id
        ).first()
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Profile name already in use")
        from models import PersohubCommunity
        community_conflict = db.query(PersohubCommunity).filter(
            PersohubCommunity.profile_id == update_data.profile_name
        ).first()
        if community_conflict:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Profile name reserved by community")
        user.profile_name = update_data.profile_name
    if update_data.email is not None:
        if update_data.email != user.email:
            user.email = update_data.email
            user.email_verified_at = None
            user.email_verification_token_hash = None
            user.email_verification_expires_at = None
            user.email_verification_sent_at = None
            email_changed = True
    if update_data.dob is not None:
        user.dob = update_data.dob
    if "gender" in update_data.model_fields_set:
        normalized_gender = _normalize_optional_text(update_data.gender)
        if normalized_gender is not None:
            user.gender = normalized_gender
    if update_data.phno is not None:
        user.phno = update_data.phno
    if "dept" in update_data.model_fields_set:
        normalized_dept = _normalize_optional_text(update_data.dept)
        if normalized_dept is not None:
            user.dept = normalized_dept
    if update_data.image_url is not None:
        user.image_url = update_data.image_url
    if "instagram_url" in update_data.model_fields_set:
        normalized_instagram = str(update_data.instagram_url or "").strip()
        user.instagram_url = normalized_instagram or None
    if "linkedin_url" in update_data.model_fields_set:
        normalized_linkedin = str(update_data.linkedin_url or "").strip()
        user.linkedin_url = normalized_linkedin or None
    if "github_url" in update_data.model_fields_set:
        normalized_github = str(update_data.github_url or "").strip()
        user.github_url = normalized_github or None

    db.commit()
    if email_changed:
        try:
            issue_verification(db, user, "pda")
        except Exception:
            pass
    db.refresh(user)
    return _build_pda_user_response(db, user)


@router.post("/auth/email/send-verification")
def send_pda_email_verification(
    user: PdaUser = Depends(require_pda_user),
    db: Session = Depends(get_db)
):
    ok, reason = issue_verification(db, user, "pda")
    if not ok and reason == "cooldown":
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Please wait before resending")
    if not ok:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unable to send verification email")
    return {"status": "ok"}


@router.post("/auth/email/verify")
def verify_pda_email(payload: EmailVerificationRequest, db: Session = Depends(get_db)):
    user = verify_email_token(db, PdaUser, payload.token)
    if not user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired token")
    return {"status": "ok"}


@router.post("/auth/password/forgot")
def forgot_pda_password(payload: PdaForgotPasswordRequest, db: Session = Depends(get_db)):
    if payload.regno and payload.email:
        user = db.query(PdaUser).filter(
            PdaUser.regno == payload.regno,
            PdaUser.email == payload.email
        ).first()
        if not user:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Register number and email do not match")
        if user.password_reset_sent_at:
            sent_at = ensure_timezone(user.password_reset_sent_at)
            delta = (now_tz() - sent_at).total_seconds()
            if delta < 300:
                return {"status": "ok"}
        issue_password_reset(db, user, "pda")
    return {"status": "ok"}


@router.post("/auth/password/reset")
def reset_pda_password(payload: ResetPasswordRequest, db: Session = Depends(get_db)):
    if payload.new_password != payload.confirm_password:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="New password and confirm password do not match")
    user = reset_password_with_token(db, PdaUser, payload.token)
    if not user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired token")
    user.hashed_password = get_password_hash(payload.new_password)
    db.commit()
    return {"status": "ok"}


@router.post("/me/change-password", response_model=PdaPasswordChangeResponse)
def change_pda_password(
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
def update_pda_profile_picture(
    file: UploadFile = File(...),
    user: PdaUser = Depends(require_pda_user),
    db: Session = Depends(get_db)
):
    if not file.filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing filename")
    contents = file.file.read()
    if len(contents) > 12 * 1024 * 1024:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File size exceeds 12MB limit")
    file.file = io.BytesIO(contents)

    s3_url = _upload_to_s3(file, "team", allowed_types=["image/png", "image/jpeg", "image/webp"])
    user.image_url = s3_url
    db.commit()
    db.refresh(user)
    return _build_pda_user_response(db, user)


@router.post("/me/profile-picture/presign", response_model=PresignResponse)
def presign_pda_profile_picture(
    payload: PresignRequest,
    user: PdaUser = Depends(require_pda_user)
):
    return _generate_presigned_put_url(
        "team",
        payload.filename,
        payload.content_type,
        allowed_types=["image/png", "image/jpeg", "image/webp"]
    )


@router.post("/me/recruitment-doc/presign", response_model=PresignResponse)
def presign_pda_recruitment_doc(
    payload: PresignRequest,
    user: PdaUser = Depends(require_pda_user)
):
    return _generate_presigned_put_url(
        "recruitment-docs",
        payload.filename,
        payload.content_type,
        allowed_types=[
            "application/pdf",
            "application/vnd.ms-powerpoint",
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        ],
    )


@router.post("/me/profile-picture/confirm", response_model=PdaUserResponse)
def confirm_pda_profile_picture(
    payload: ImageUrlUpdate,
    user: PdaUser = Depends(require_pda_user),
    db: Session = Depends(get_db)
):
    user.image_url = payload.image_url
    db.commit()
    db.refresh(user)
    return _build_pda_user_response(db, user)
