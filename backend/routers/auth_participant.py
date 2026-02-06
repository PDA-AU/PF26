from fastapi import APIRouter, Depends, HTTPException, status
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
    ProfilePictureUpdate
)
from auth import verify_password, get_password_hash, create_access_token, create_refresh_token, decode_token, generate_referral_code
from security import require_participant
from fastapi import UploadFile, File
import io
from utils import _upload_to_s3, _generate_presigned_put_url
from models import Round, Score, RoundState
from schemas import ParticipantRoundStatus

router = APIRouter()


def _get_persofest_event(db: Session) -> Event:
    event = db.query(Event).filter(Event.name == "PERSOFEST").first()
    if not event:
        event = Event(name="PERSOFEST", is_active=True)
        db.add(event)
        db.commit()
        db.refresh(event)
    return event


@router.post("/participant-auth/register", response_model=TokenResponse)
async def participant_register(user_data: UserRegister, db: Session = Depends(get_db)):
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

    access_token = create_access_token({"sub": new_user.register_number, "user_type": "participant"})
    refresh_token = create_refresh_token({"sub": new_user.register_number, "user_type": "participant"})
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserResponse.model_validate(new_user)
    )


@router.post("/participant-auth/login", response_model=TokenResponse)
async def participant_login(login_data: UserLogin, db: Session = Depends(get_db)):
    user = db.query(Participant).filter(Participant.register_number == login_data.register_number).first()
    if not user or not verify_password(login_data.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    access_token = create_access_token({"sub": user.register_number, "user_type": "participant"})
    refresh_token = create_refresh_token({"sub": user.register_number, "user_type": "participant"})
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserResponse.model_validate(user)
    )


@router.post("/participant-auth/refresh", response_model=TokenResponse)
async def participant_refresh(request: RefreshTokenRequest, db: Session = Depends(get_db)):
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
async def get_participant_me(user: Participant = Depends(require_participant)):
    return UserResponse.model_validate(user)


@router.put("/participant/me", response_model=UserResponse)
async def update_participant_me(
    user_data: UserUpdate,
    user: Participant = Depends(require_participant),
    db: Session = Depends(get_db)
):
    if user_data.name is not None:
        user.name = user_data.name
    if user_data.phone is not None:
        user.phone = user_data.phone
    if user_data.email is not None:
        user.email = user_data.email

    db.commit()
    db.refresh(user)
    return UserResponse.model_validate(user)


@router.post("/participant/me/profile-picture", response_model=UserResponse)
async def update_participant_profile_picture(
    file: UploadFile = File(...),
    user: Participant = Depends(require_participant),
    db: Session = Depends(get_db)
):
    if not file.filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing filename")
    contents = await file.read()
    if len(contents) > 12 * 1024 * 1024:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File size exceeds 12MB limit")
    file.file = io.BytesIO(contents)

    s3_url = _upload_to_s3(file, "persofest/profiles", allowed_types=["image/png", "image/jpeg", "image/webp"])
    user.profile_picture = s3_url
    db.commit()
    db.refresh(user)

    return UserResponse.model_validate(user)


@router.post("/participant/me/profile-picture/presign", response_model=PresignResponse)
async def presign_participant_profile_picture(
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
async def confirm_participant_profile_picture(
    payload: ProfilePictureUpdate,
    user: Participant = Depends(require_participant),
    db: Session = Depends(get_db)
):
    user.profile_picture = payload.profile_picture
    db.commit()
    db.refresh(user)
    return UserResponse.model_validate(user)


@router.get("/participant/me/rounds", response_model=List[ParticipantRoundStatus])
async def get_my_round_status(user: Participant = Depends(require_participant), db: Session = Depends(get_db)):
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
