from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from time_utils import ensure_timezone, now_tz
from typing import List
from sqlalchemy.orm import Session
from sqlalchemy import func

from database import get_db
from models import Participant, SystemConfig, ParticipantStatus, UserRole, Department, YearOfStudy, Gender, Event
from schemas import (
    UserRegister,
    UserLogin,
    TokenResponse,
    RefreshTokenRequest,
    UserResponse,
    UserUpdate,
    PresignRequest,
    PresignResponse,
    ProfilePictureUpdate,
    EmailVerificationRequest,
    ForgotPasswordRequest,
    ResetPasswordRequest
)
from auth import verify_password, get_password_hash, create_access_token, create_refresh_token, decode_token, generate_referral_code
from security import require_participant
from fastapi import UploadFile, File
import io
from utils import _upload_to_s3, _generate_presigned_put_url
from models import Round, Score, RoundState
from schemas import ParticipantRoundStatus
from email_workflows import issue_verification, verify_email_token, issue_password_reset, reset_password_with_token
import os

router = APIRouter()


def _get_persofest_event(db: Session) -> Event:
    event = db.query(Event).filter(Event.name == "PERSOFEST").first()
    if not event:
        event = Event(name="PERSOFEST", is_active=True)
        db.add(event)
        db.commit()
        db.refresh(event)
    return event


@router.post("/participant-auth/register")
def participant_register(user_data: UserRegister, db: Session = Depends(get_db)):
    reg_config = db.query(SystemConfig).filter(SystemConfig.key == "registration_open").first()
    if reg_config and reg_config.value == "false":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Registration is closed")

    existing_user = db.query(Participant).filter(
        (Participant.register_number == user_data.register_number) | (Participant.email == user_data.email)
    ).first()
    if existing_user:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="User already exists")

    persofest_event = _get_persofest_event(db)

    new_user = Participant(
        register_number=user_data.register_number,
        email=user_data.email,
        hashed_password=get_password_hash(user_data.password),
        name=user_data.name,
        phone=user_data.phone,
        gender=Gender[user_data.gender.name],
        department=Department[user_data.department.name],
        year_of_study=YearOfStudy[user_data.year_of_study.name],
        role=UserRole.PARTICIPANT,
        referral_code=generate_referral_code(),
        status=ParticipantStatus.ACTIVE,
        event_id=persofest_event.id
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    try:
        issue_verification(db, new_user, "participant")
    except Exception:
        pass

    if os.environ.get("EMAIL_VERIFY_REQUIRED", "false").lower() == "true":
        return JSONResponse(status_code=202, content={"status": "verification_required"})

    access_token = create_access_token({"sub": new_user.register_number, "user_type": "participant"})
    refresh_token = create_refresh_token({"sub": new_user.register_number, "user_type": "participant"})
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserResponse.model_validate(new_user)
    )


@router.post("/participant-auth/login", response_model=TokenResponse)
def participant_login(login_data: UserLogin, db: Session = Depends(get_db)):
    user = db.query(Participant).filter(Participant.register_number == login_data.register_number).first()
    if not user or not verify_password(login_data.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if os.environ.get("EMAIL_VERIFY_REQUIRED", "false").lower() == "true" and not user.email_verified:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Email not verified")

    access_token = create_access_token({"sub": user.register_number, "user_type": "participant"})
    refresh_token = create_refresh_token({"sub": user.register_number, "user_type": "participant"})
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserResponse.model_validate(user)
    )


@router.post("/participant-auth/refresh", response_model=TokenResponse)
def participant_refresh(request: RefreshTokenRequest, db: Session = Depends(get_db)):
    payload = decode_token(request.refresh_token)
    if payload.get("type") != "refresh" or payload.get("user_type") != "participant":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
    regno = payload.get("sub")
    user = db.query(Participant).filter(Participant.register_number == regno).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    access_token = create_access_token({"sub": user.register_number, "user_type": "participant"})
    refresh_token = create_refresh_token({"sub": user.register_number, "user_type": "participant"})
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserResponse.model_validate(user)
    )


@router.get("/participant/me", response_model=UserResponse)
def get_participant_me(user: Participant = Depends(require_participant)):
    return UserResponse.model_validate(user)


@router.put("/participant/me", response_model=UserResponse)
def update_participant_me(
    user_data: UserUpdate,
    user: Participant = Depends(require_participant),
    db: Session = Depends(get_db)
):
    email_changed = False
    if user_data.name is not None:
        user.name = user_data.name
    if user_data.phone is not None:
        user.phone = user_data.phone
    if user_data.email is not None:
        if user_data.email != user.email:
            user.email = user_data.email
            user.email_verified_at = None
            user.email_verification_token_hash = None
            user.email_verification_expires_at = None
            user.email_verification_sent_at = None
            email_changed = True

    db.commit()
    if email_changed:
        try:
            issue_verification(db, user, "participant")
        except Exception:
            pass
    db.refresh(user)
    return UserResponse.model_validate(user)


@router.post("/participant-auth/email/send-verification")
def send_participant_verification(
    user: Participant = Depends(require_participant),
    db: Session = Depends(get_db)
):
    ok, reason = issue_verification(db, user, "participant")
    if not ok and reason == "cooldown":
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Please wait before resending")
    if not ok:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unable to send verification email")
    return {"status": "ok"}


@router.post("/participant-auth/email/verify")
def verify_participant_email(payload: EmailVerificationRequest, db: Session = Depends(get_db)):
    user = verify_email_token(db, Participant, payload.token)
    if not user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired token")
    return {"status": "ok"}


@router.post("/participant-auth/password/forgot")
def forgot_participant_password(payload: ForgotPasswordRequest, db: Session = Depends(get_db)):
    if payload.register_number and payload.email:
        user = db.query(Participant).filter(
            Participant.register_number == payload.register_number,
            Participant.email == payload.email
        ).first()
        if not user:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Register number and email do not match")
        if user.password_reset_sent_at:
            sent_at = ensure_timezone(user.password_reset_sent_at)
            delta = (now_tz() - sent_at).total_seconds()
            if delta < 300:
                return {"status": "ok"}
        issue_password_reset(db, user, "participant")
    return {"status": "ok"}


@router.post("/participant-auth/password/reset")
def reset_participant_password(payload: ResetPasswordRequest, db: Session = Depends(get_db)):
    if payload.new_password != payload.confirm_password:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="New password and confirm password do not match")
    user = reset_password_with_token(db, Participant, payload.token)
    if not user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired token")
    user.hashed_password = get_password_hash(payload.new_password)
    db.commit()
    return {"status": "ok"}


@router.post("/participant/me/profile-picture", response_model=UserResponse)
def update_participant_profile_picture(
    file: UploadFile = File(...),
    user: Participant = Depends(require_participant),
    db: Session = Depends(get_db)
):
    if not file.filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing filename")
    contents = file.file.read()
    if len(contents) > 12 * 1024 * 1024:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File size exceeds 12MB limit")
    file.file = io.BytesIO(contents)

    s3_url = _upload_to_s3(file, "persofest/profiles", allowed_types=["image/png", "image/jpeg", "image/webp"])
    user.profile_picture = s3_url
    db.commit()
    db.refresh(user)

    return UserResponse.model_validate(user)


@router.post("/participant/me/profile-picture/presign", response_model=PresignResponse)
def presign_participant_profile_picture(
    payload: PresignRequest,
    user: Participant = Depends(require_participant)
):
    return _generate_presigned_put_url(
        "persofest/profiles",
        payload.filename,
        payload.content_type,
        allowed_types=["image/png", "image/jpeg", "image/webp"]
    )


@router.post("/participant/me/profile-picture/confirm", response_model=UserResponse)
def confirm_participant_profile_picture(
    payload: ProfilePictureUpdate,
    user: Participant = Depends(require_participant),
    db: Session = Depends(get_db)
):
    user.profile_picture = payload.profile_picture
    db.commit()
    db.refresh(user)
    return UserResponse.model_validate(user)


@router.get("/participant/me/rounds", response_model=List[ParticipantRoundStatus])
def get_my_round_status(user: Participant = Depends(require_participant), db: Session = Depends(get_db)):
    rounds = db.query(Round).filter(Round.state.in_([RoundState.ACTIVE, RoundState.COMPLETED])).order_by(Round.id).all()
    statuses = []
    for round in rounds:
        score = db.query(Score).filter(Score.participant_id == user.id, Score.round_id == round.id).first()
        if score:
            if not score.is_present:
                status_label = "Absent"
            else:
                status_label = "Active"
            is_present = score.is_present
        else:
            status_label = "Eliminated" if round.state == RoundState.COMPLETED else "Pending"
            is_present = None
        statuses.append(ParticipantRoundStatus(
            round_no=round.round_no,
            round_name=round.name,
            status=status_label,
            is_present=is_present
        ))
    return statuses
