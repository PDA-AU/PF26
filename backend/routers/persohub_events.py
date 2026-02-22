from datetime import datetime, timedelta, timezone
import os
import random
import string
from typing import List, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func, text, or_

from auth import create_access_token
from database import get_db
from emailer import send_email
from models import (
    PdaUser,
    PersohubEvent,
    PersohubEventStatus,
    PersohubEventParticipantMode,
    PersohubEventEntityType,
    PersohubEventRegistrationStatus,
    PersohubEventRegistration,
    PersohubEventTeam,
    PersohubEventTeamMember,
    PersohubEventInvite,
    PersohubEventInviteStatus,
    PersohubEventRound,
    PersohubEventRoundState,
    PersohubEventBadge,
    PersohubEventAttendance,
    PersohubEventScore,
    PersohubEventRoundSubmission,
    PersohubEventRoundPanel,
    PersohubEventRoundPanelAssignment,
)
from schemas import (
    PersohubManagedAchievement,
    PersohubManagedCertificateResponse,
    PersohubManagedEventDashboard,
    PersohubEventPublicRoundResponse,
    PersohubManagedEventResponse,
    PersohubManagedMyEvent,
    PersohubManagedQrResponse,
    PersohubRoundSubmissionPresignRequest,
    PersohubRoundSubmissionResponse,
    PersohubRoundSubmissionUpsertRequest,
    PresignResponse,
    PersohubManagedTeamCreate,
    PersohubManagedTeamInvite,
    PersohubManagedTeamJoin,
    PersohubManagedTeamMemberResponse,
    PersohubManagedTeamResponse,
    PersohubManagedEntityTypeEnum,
)
from security import require_pda_user, require_persohub_events_parity_enabled
from utils import _generate_presigned_put_url

router = APIRouter(dependencies=[Depends(require_persohub_events_parity_enabled)])


def _get_event_or_404(db: Session, slug: str) -> PersohubEvent:
    event = db.query(PersohubEvent).filter(PersohubEvent.slug == slug).first()
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    return event


def _ensure_event_visible_for_public_access(event: PersohubEvent) -> None:
    if not bool(getattr(event, "is_visible", True)):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")


def _normalize_team_code(value: str) -> str:
    return str(value or "").strip().upper()


def _make_team_code() -> str:
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=5))


def _make_referral_code() -> str:
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=5))


def _batch_from_regno(regno: str) -> Optional[str]:
    value = str(regno or "").strip()
    if len(value) < 4 or not value[:4].isdigit():
        return None
    return value[:4]


def _next_event_referral_code(db: Session, event_id: int) -> str:
    candidate = _make_referral_code()
    while db.query(PersohubEventRegistration).filter(
        PersohubEventRegistration.event_id == event_id,
        PersohubEventRegistration.referral_code == candidate,
    ).first():
        candidate = _make_referral_code()
    return candidate


def _build_team_response(db: Session, team: PersohubEventTeam) -> PersohubManagedTeamResponse:
    members = (
        db.query(PersohubEventTeamMember, PdaUser)
        .join(PdaUser, PersohubEventTeamMember.user_id == PdaUser.id)
        .filter(PersohubEventTeamMember.team_id == team.id)
        .order_by(PersohubEventTeamMember.created_at.asc())
        .all()
    )
    payload = [
        PersohubManagedTeamMemberResponse(
            user_id=user.id,
            regno=user.regno,
            name=user.name,
            role=member.role,
        )
        for member, user in members
    ]
    return PersohubManagedTeamResponse(
        id=team.id,
        event_id=team.event_id,
        team_code=team.team_code,
        team_name=team.team_name,
        team_lead_user_id=team.team_lead_user_id,
        members=payload,
    )


def _get_user_team_for_event(db: Session, event_id: int, user_id: int) -> Optional[PersohubEventTeam]:
    row = (
        db.query(PersohubEventTeam)
        .join(PersohubEventTeamMember, PersohubEventTeamMember.team_id == PersohubEventTeam.id)
        .filter(PersohubEventTeam.event_id == event_id, PersohubEventTeamMember.user_id == user_id)
        .first()
    )
    return row


def _resolve_submission_entity(
    db: Session,
    event: PersohubEvent,
    user: PdaUser,
    enforce_team_leader: bool = False,
) -> Tuple[PersohubEventRegistration, PersohubEventEntityType, Optional[int], Optional[int], Optional[PersohubEventTeam], bool]:
    registration = None
    entity_type = PersohubEventEntityType.USER
    entity_user_id: Optional[int] = user.id
    entity_team_id: Optional[int] = None
    team: Optional[PersohubEventTeam] = None
    is_team_leader = False

    if event.participant_mode == PersohubEventParticipantMode.INDIVIDUAL:
        registration = db.query(PersohubEventRegistration).filter(
            PersohubEventRegistration.event_id == event.id,
            PersohubEventRegistration.user_id == user.id,
            PersohubEventRegistration.entity_type == PersohubEventEntityType.USER,
        ).first()
    else:
        team = _get_user_team_for_event(db, event.id, user.id)
        if team:
            entity_type = PersohubEventEntityType.TEAM
            entity_user_id = None
            entity_team_id = team.id
            is_team_leader = int(team.team_lead_user_id) == int(user.id)
            registration = db.query(PersohubEventRegistration).filter(
                PersohubEventRegistration.event_id == event.id,
                PersohubEventRegistration.team_id == team.id,
                PersohubEventRegistration.entity_type == PersohubEventEntityType.TEAM,
            ).first()

    if not registration:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registration not found")
    if enforce_team_leader and event.participant_mode == PersohubEventParticipantMode.TEAM and not is_team_leader:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only team leader can submit for this round")
    return registration, entity_type, entity_user_id, entity_team_id, team, is_team_leader


def _round_submission_lock_reason(round_row: PersohubEventRound, submission: Optional[PersohubEventRoundSubmission]) -> Optional[str]:
    now = datetime.now(timezone.utc)
    if round_row.state in {PersohubEventRoundState.COMPLETED, PersohubEventRoundState.REVEAL}:
        return "Round is finalized"
    if bool(round_row.is_frozen):
        return "Round is frozen"
    deadline = round_row.submission_deadline
    if deadline and deadline.tzinfo is None:
        deadline = deadline.replace(tzinfo=timezone.utc)
    if deadline and now >= deadline:
        return "Submission deadline has passed"
    if submission and bool(submission.is_locked):
        return "Submission is locked by admin"
    return None


def _default_round_allowed_mime_types() -> List[str]:
    return [
        "application/pdf",
        "application/vnd.ms-powerpoint",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "image/png",
        "image/jpeg",
        "image/webp",
        "video/mp4",
        "video/quicktime",
        "application/zip",
    ]


def _submission_payload(
    round_row: PersohubEventRound,
    entity_type: PersohubEventEntityType,
    entity_user_id: Optional[int],
    entity_team_id: Optional[int],
    submission: Optional[PersohubEventRoundSubmission],
) -> PersohubRoundSubmissionResponse:
    lock_reason = _round_submission_lock_reason(round_row, submission)
    return PersohubRoundSubmissionResponse(
        id=submission.id if submission else None,
        event_id=int(round_row.event_id),
        round_id=int(round_row.id),
        entity_type=PersohubManagedEntityTypeEnum.TEAM if entity_type == PersohubEventEntityType.TEAM else PersohubManagedEntityTypeEnum.USER,
        user_id=entity_user_id,
        team_id=entity_team_id,
        submission_type=submission.submission_type if submission else None,
        file_url=submission.file_url if submission else None,
        file_name=submission.file_name if submission else None,
        file_size_bytes=submission.file_size_bytes if submission else None,
        mime_type=submission.mime_type if submission else None,
        link_url=submission.link_url if submission else None,
        notes=submission.notes if submission else None,
        version=int(submission.version or 0) if submission else 0,
        is_locked=bool(submission.is_locked) if submission else False,
        submitted_at=submission.submitted_at if submission else None,
        updated_at=submission.updated_at if submission else None,
        updated_by_user_id=submission.updated_by_user_id if submission else None,
        is_editable=lock_reason is None,
        lock_reason=lock_reason,
        deadline_at=round_row.submission_deadline,
    )


def _ensure_registration_open_for_registration_actions(event: PersohubEvent) -> None:
    if not bool(getattr(event, "registration_open", True)):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Registration is closed")


def _is_event_open_for_all(event: PersohubEvent) -> bool:
    return str(getattr(event, "open_for", "MIT") or "MIT").strip().upper() == "ALL"


def _is_mit_user(user: PdaUser) -> bool:
    return str(getattr(user, "college", "") or "").strip().lower() == "mit"


def _ensure_user_eligible_for_event(event: PersohubEvent, user: PdaUser) -> None:
    if _is_event_open_for_all(event):
        return
    if not _is_mit_user(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This event is open only for MIT users",
        )


def _send_registration_email(user: PdaUser, event: PersohubEvent, details: str) -> None:
    if not user.email:
        return
    subject = f"You're In! Registration Confirmed - {event.title}"
    whatsapp_url = str(getattr(event, "whatsapp_url", "") or "").strip()
    whatsapp_text = f"\nJoin our WhatsApp channel for updates: {whatsapp_url}\n" if whatsapp_url else ""
    whatsapp_html = (
        f'<p><a href="{whatsapp_url}" target="_blank" rel="noreferrer">Join our WhatsApp channel for updates</a></p>'
        if whatsapp_url
        else ""
    )
    text = (
        f"Hello {user.name},\n\n"
        f"Great news! Your registration is confirmed for {event.title} ({event.event_code}).\n"
        f"We are excited to have you with us.\n"
        f"{details}\n\n"
        "Get ready and give it your best.\n"
        f"{whatsapp_text}\n"
        "See you at the event!\n\nRegards,\nPersohub Team"
    )
    html = (
        "<html><body>"
        f"<p>Hello {user.name},</p>"
        f"<p><strong>Great news!</strong> Your registration is confirmed for <strong>{event.title}</strong> ({event.event_code}).</p>"
        "<p>We are excited to have you with us.</p>"
        f"<p>{details}</p>"
        "<p>Get ready and give it your best.</p>"
        f"{whatsapp_html}"
        "<p>See you at the event!</p>"
        "<p>Regards,<br/><strong>Persohub Team</strong></p>"
        "</body></html>"
    )
    try:
        send_email(user.email, subject, html, text)
    except Exception:
        pass


@router.get("/persohub/persohub-events/ongoing", response_model=List[PersohubManagedEventResponse])
def list_ongoing_events(db: Session = Depends(get_db)):
    events = (
        db.query(PersohubEvent)
        .filter(PersohubEvent.status == PersohubEventStatus.OPEN, PersohubEvent.is_visible == True)  # noqa: E712
        .order_by(PersohubEvent.created_at.desc())
        .all()
    )
    return [PersohubManagedEventResponse.model_validate(event) for event in events]


@router.get("/persohub/persohub-events/all", response_model=List[PersohubManagedEventResponse])
def list_all_managed_events(db: Session = Depends(get_db)):
    events = db.query(PersohubEvent).filter(PersohubEvent.is_visible == True).order_by(PersohubEvent.created_at.desc()).all()  # noqa: E712
    return [PersohubManagedEventResponse.model_validate(event) for event in events]


@router.get("/persohub/persohub-events/{slug}", response_model=PersohubManagedEventResponse)
def get_event(slug: str, db: Session = Depends(get_db)):
    event = _get_event_or_404(db, slug)
    _ensure_event_visible_for_public_access(event)
    return PersohubManagedEventResponse.model_validate(event)


@router.get("/persohub/persohub-events/{slug}/rounds", response_model=List[PersohubEventPublicRoundResponse])
def list_event_published_rounds(slug: str, db: Session = Depends(get_db)):
    event = _get_event_or_404(db, slug)
    _ensure_event_visible_for_public_access(event)
    rounds = (
        db.query(PersohubEventRound)
        .filter(
            PersohubEventRound.event_id == event.id,
            PersohubEventRound.state != PersohubEventRoundState.DRAFT,
        )
        .order_by(PersohubEventRound.round_no.asc())
        .all()
    )
    return [PersohubEventPublicRoundResponse.model_validate(round_row) for round_row in rounds]


@router.get("/persohub/persohub-events/{slug}/rounds/{round_id}/submission", response_model=PersohubRoundSubmissionResponse)
def get_my_round_submission(
    slug: str,
    round_id: int,
    user: PdaUser = Depends(require_pda_user),
    db: Session = Depends(get_db),
):
    event = _get_event_or_404(db, slug)
    _ensure_event_visible_for_public_access(event)
    round_row = db.query(PersohubEventRound).filter(PersohubEventRound.id == round_id, PersohubEventRound.event_id == event.id).first()
    if not round_row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Round not found")
    if not bool(round_row.requires_submission):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Round does not require submission")
    _, entity_type, entity_user_id, entity_team_id, _, _ = _resolve_submission_entity(db, event, user, enforce_team_leader=False)
    submission = db.query(PersohubEventRoundSubmission).filter(
        PersohubEventRoundSubmission.event_id == event.id,
        PersohubEventRoundSubmission.round_id == round_row.id,
        PersohubEventRoundSubmission.entity_type == entity_type,
        PersohubEventRoundSubmission.user_id == entity_user_id,
        PersohubEventRoundSubmission.team_id == entity_team_id,
    ).first()
    return _submission_payload(round_row, entity_type, entity_user_id, entity_team_id, submission)


@router.post("/persohub/persohub-events/{slug}/rounds/{round_id}/submission/presign", response_model=PresignResponse)
def presign_my_round_submission(
    slug: str,
    round_id: int,
    payload: PersohubRoundSubmissionPresignRequest,
    user: PdaUser = Depends(require_pda_user),
    db: Session = Depends(get_db),
):
    event = _get_event_or_404(db, slug)
    _ensure_event_visible_for_public_access(event)
    round_row = db.query(PersohubEventRound).filter(PersohubEventRound.id == round_id, PersohubEventRound.event_id == event.id).first()
    if not round_row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Round not found")
    if not bool(round_row.requires_submission):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Round does not require submission")
    _, entity_type, entity_user_id, entity_team_id, _, _ = _resolve_submission_entity(db, event, user, enforce_team_leader=True)
    existing = db.query(PersohubEventRoundSubmission).filter(
        PersohubEventRoundSubmission.event_id == event.id,
        PersohubEventRoundSubmission.round_id == round_row.id,
        PersohubEventRoundSubmission.entity_type == entity_type,
        PersohubEventRoundSubmission.user_id == entity_user_id,
        PersohubEventRoundSubmission.team_id == entity_team_id,
    ).first()
    lock_reason = _round_submission_lock_reason(round_row, existing)
    if lock_reason:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=lock_reason)

    allowed_mime_types = list(round_row.allowed_mime_types or _default_round_allowed_mime_types())
    if payload.content_type not in allowed_mime_types:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid file type")

    max_file_size_mb = int(round_row.max_file_size_mb or 25)
    max_bytes = max_file_size_mb * 1024 * 1024
    if int(payload.file_size_bytes) > max_bytes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"File size exceeds {max_file_size_mb} MB limit")

    presign = _generate_presigned_put_url(
        key_prefix=f"submissions/persohub_events/{event.slug}/rounds/{round_row.id}",
        filename=payload.filename,
        content_type=payload.content_type,
        allowed_types=allowed_mime_types,
    )
    return PresignResponse(**presign)


@router.put("/persohub/persohub-events/{slug}/rounds/{round_id}/submission", response_model=PersohubRoundSubmissionResponse)
def upsert_my_round_submission(
    slug: str,
    round_id: int,
    payload: PersohubRoundSubmissionUpsertRequest,
    user: PdaUser = Depends(require_pda_user),
    db: Session = Depends(get_db),
):
    event = _get_event_or_404(db, slug)
    _ensure_event_visible_for_public_access(event)
    round_row = db.query(PersohubEventRound).filter(PersohubEventRound.id == round_id, PersohubEventRound.event_id == event.id).first()
    if not round_row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Round not found")
    if not bool(round_row.requires_submission):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Round does not require submission")

    _, entity_type, entity_user_id, entity_team_id, _, _ = _resolve_submission_entity(db, event, user, enforce_team_leader=True)
    submission = db.query(PersohubEventRoundSubmission).filter(
        PersohubEventRoundSubmission.event_id == event.id,
        PersohubEventRoundSubmission.round_id == round_row.id,
        PersohubEventRoundSubmission.entity_type == entity_type,
        PersohubEventRoundSubmission.user_id == entity_user_id,
        PersohubEventRoundSubmission.team_id == entity_team_id,
    ).first()

    lock_reason = _round_submission_lock_reason(round_row, submission)
    if lock_reason:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=lock_reason)

    data = payload.model_dump()
    submission_type_raw = payload.submission_type
    submission_type = str(
        submission_type_raw.value if hasattr(submission_type_raw, "value") else submission_type_raw or ""
    ).strip().lower()
    allowed_mime_types = list(round_row.allowed_mime_types or _default_round_allowed_mime_types())
    max_file_size_mb = int(round_row.max_file_size_mb or 25)
    max_bytes = max_file_size_mb * 1024 * 1024

    if submission_type == "file":
        file_url = str(data.get("file_url") or "").strip()
        mime_type = str(data.get("mime_type") or "").strip().lower()
        file_size_bytes = int(data.get("file_size_bytes") or 0)
        if not file_url:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="file_url is required for file submissions")
        if not mime_type:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="mime_type is required for file submissions")
        if mime_type not in allowed_mime_types:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid file type")
        if file_size_bytes <= 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="file_size_bytes is required for file submissions")
        if file_size_bytes > max_bytes:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"File size exceeds {max_file_size_mb} MB limit")
        if submission:
            submission.submission_type = "file"
            submission.file_url = file_url
            submission.file_name = str(data.get("file_name") or "").strip() or None
            submission.file_size_bytes = file_size_bytes
            submission.mime_type = mime_type
            submission.link_url = None
            submission.notes = str(data.get("notes") or "").strip() or None
            submission.version = int(submission.version or 0) + 1
            submission.updated_by_user_id = user.id
        else:
            submission = PersohubEventRoundSubmission(
                event_id=event.id,
                round_id=round_row.id,
                entity_type=entity_type,
                user_id=entity_user_id,
                team_id=entity_team_id,
                submission_type="file",
                file_url=file_url,
                file_name=str(data.get("file_name") or "").strip() or None,
                file_size_bytes=file_size_bytes,
                mime_type=mime_type,
                link_url=None,
                notes=str(data.get("notes") or "").strip() or None,
                version=1,
                updated_by_user_id=user.id,
            )
            db.add(submission)
    elif submission_type == "link":
        link_url = str(data.get("link_url") or "").strip()
        if not link_url:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="link_url is required for link submissions")
        if submission:
            submission.submission_type = "link"
            submission.file_url = None
            submission.file_name = None
            submission.file_size_bytes = None
            submission.mime_type = None
            submission.link_url = link_url
            submission.notes = str(data.get("notes") or "").strip() or None
            submission.version = int(submission.version or 0) + 1
            submission.updated_by_user_id = user.id
        else:
            submission = PersohubEventRoundSubmission(
                event_id=event.id,
                round_id=round_row.id,
                entity_type=entity_type,
                user_id=entity_user_id,
                team_id=entity_team_id,
                submission_type="link",
                file_url=None,
                file_name=None,
                file_size_bytes=None,
                mime_type=None,
                link_url=link_url,
                notes=str(data.get("notes") or "").strip() or None,
                version=1,
                updated_by_user_id=user.id,
            )
            db.add(submission)
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="submission_type must be file or link")

    db.commit()
    db.refresh(submission)
    return _submission_payload(round_row, entity_type, entity_user_id, entity_team_id, submission)


@router.delete("/persohub/persohub-events/{slug}/rounds/{round_id}/submission", response_model=PersohubRoundSubmissionResponse)
def delete_my_round_submission(
    slug: str,
    round_id: int,
    user: PdaUser = Depends(require_pda_user),
    db: Session = Depends(get_db),
):
    event = _get_event_or_404(db, slug)
    _ensure_event_visible_for_public_access(event)
    round_row = db.query(PersohubEventRound).filter(PersohubEventRound.id == round_id, PersohubEventRound.event_id == event.id).first()
    if not round_row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Round not found")
    if not bool(round_row.requires_submission):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Round does not require submission")

    _, entity_type, entity_user_id, entity_team_id, _, _ = _resolve_submission_entity(db, event, user, enforce_team_leader=True)
    submission = db.query(PersohubEventRoundSubmission).filter(
        PersohubEventRoundSubmission.event_id == event.id,
        PersohubEventRoundSubmission.round_id == round_row.id,
        PersohubEventRoundSubmission.entity_type == entity_type,
        PersohubEventRoundSubmission.user_id == entity_user_id,
        PersohubEventRoundSubmission.team_id == entity_team_id,
    ).first()

    lock_reason = _round_submission_lock_reason(round_row, submission)
    if lock_reason:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=lock_reason)

    if submission:
        db.delete(submission)
        db.commit()
    return _submission_payload(round_row, entity_type, entity_user_id, entity_team_id, None)


@router.get("/persohub/persohub-events/{slug}/dashboard", response_model=PersohubManagedEventDashboard)
def get_event_dashboard(
    slug: str,
    user: PdaUser = Depends(require_pda_user),
    db: Session = Depends(get_db),
):
    event = _get_event_or_404(db, slug)
    _ensure_event_visible_for_public_access(event)

    team = _get_user_team_for_event(db, event.id, user.id) if event.participant_mode == PersohubEventParticipantMode.TEAM else None
    registration = db.query(PersohubEventRegistration).filter(
        PersohubEventRegistration.event_id == event.id,
        (
            (PersohubEventRegistration.user_id == user.id)
            if event.participant_mode == PersohubEventParticipantMode.INDIVIDUAL
            else (PersohubEventRegistration.team_id == (team.id if team else -1))
        )
    ).first()

    members_payload = []
    if team:
        members = (
            db.query(PersohubEventTeamMember, PdaUser)
            .join(PdaUser, PersohubEventTeamMember.user_id == PdaUser.id)
            .filter(PersohubEventTeamMember.team_id == team.id)
            .all()
        )
        members_payload = [
            {
                "user_id": member.user_id,
                "name": u.name,
                "regno": u.regno,
                "role": member.role,
            }
            for member, u in members
        ]

    rounds_count = db.query(PersohubEventRound).filter(PersohubEventRound.event_id == event.id).count()
    badges_count = db.query(PersohubEventBadge).filter(PersohubEventBadge.event_id == event.id).count()

    entity_type = None
    entity_id = None
    if registration:
        entity_type = PersohubManagedEntityTypeEnum.TEAM if registration.team_id else PersohubManagedEntityTypeEnum.USER
        entity_id = registration.team_id if registration.team_id else registration.user_id

    return PersohubManagedEventDashboard(
        event=PersohubManagedEventResponse.model_validate(event),
        is_registered=bool(registration),
        entity_type=entity_type,
        entity_id=entity_id,
        team_code=team.team_code if team else None,
        team_name=team.team_name if team else None,
        team_members=members_payload,
        rounds_count=rounds_count,
        badges_count=badges_count,
    )


@router.post("/persohub/persohub-events/{slug}/register", response_model=PersohubManagedEventDashboard)
def register_individual_event(
    slug: str,
    referral_code: Optional[str] = None,
    user: PdaUser = Depends(require_pda_user),
    db: Session = Depends(get_db),
):
    event = _get_event_or_404(db, slug)
    _ensure_event_visible_for_public_access(event)
    _ensure_registration_open_for_registration_actions(event)
    _ensure_user_eligible_for_event(event, user)
    if event.participant_mode != PersohubEventParticipantMode.INDIVIDUAL:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Use team registration for this event")

    existing = db.query(PersohubEventRegistration).filter(
        PersohubEventRegistration.event_id == event.id,
        PersohubEventRegistration.user_id == user.id,
    ).first()
    if existing:
        return get_event_dashboard(slug=slug, user=user, db=db)

    row = PersohubEventRegistration(
        event_id=event.id,
        user_id=user.id,
        team_id=None,
        entity_type=PersohubEventEntityType.USER,
        status=PersohubEventRegistrationStatus.ACTIVE,
        referral_code=_next_event_referral_code(db, event.id),
        referred_by=(str(referral_code or "").strip().upper() or None),
        referral_count=0,
    )
    db.add(row)
    if row.referred_by:
        referrer = db.query(PersohubEventRegistration).filter(
            PersohubEventRegistration.event_id == event.id,
            PersohubEventRegistration.entity_type == PersohubEventEntityType.USER,
            PersohubEventRegistration.referral_code == row.referred_by,
        ).first()
        if referrer:
            referrer.referral_count = int(referrer.referral_count or 0) + 1
    db.commit()
    _send_registration_email(user, event, "Participant mode: Individual")
    return get_event_dashboard(slug=slug, user=user, db=db)


@router.post("/persohub/persohub-events/{slug}/teams/create", response_model=PersohubManagedTeamResponse)
def create_team(
    slug: str,
    payload: PersohubManagedTeamCreate,
    user: PdaUser = Depends(require_pda_user),
    db: Session = Depends(get_db),
):
    event = _get_event_or_404(db, slug)
    _ensure_event_visible_for_public_access(event)
    _ensure_registration_open_for_registration_actions(event)
    _ensure_user_eligible_for_event(event, user)
    if event.participant_mode != PersohubEventParticipantMode.TEAM:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This event is not a team event")

    existing_team = _get_user_team_for_event(db, event.id, user.id)
    if existing_team:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="You are already part of a team")

    team_code = _make_team_code()
    while db.query(PersohubEventTeam).filter(PersohubEventTeam.event_id == event.id, PersohubEventTeam.team_code == team_code).first():
        team_code = _make_team_code()

    team = PersohubEventTeam(
        event_id=event.id,
        team_code=team_code,
        team_name=payload.team_name.strip(),
        team_lead_user_id=user.id,
    )
    db.add(team)
    db.flush()

    member = PersohubEventTeamMember(team_id=team.id, user_id=user.id, role="leader")
    db.add(member)

    registration = PersohubEventRegistration(
        event_id=event.id,
        user_id=None,
        team_id=team.id,
        entity_type=PersohubEventEntityType.TEAM,
    )
    db.add(registration)
    db.commit()
    db.refresh(team)

    _send_registration_email(user, event, f"Participant mode: Team\nTeam code: {team.team_code}")
    return _build_team_response(db, team)


@router.post("/persohub/persohub-events/{slug}/teams/join", response_model=PersohubManagedTeamResponse)
def join_team(
    slug: str,
    payload: PersohubManagedTeamJoin,
    user: PdaUser = Depends(require_pda_user),
    db: Session = Depends(get_db),
):
    event = _get_event_or_404(db, slug)
    _ensure_event_visible_for_public_access(event)
    _ensure_registration_open_for_registration_actions(event)
    _ensure_user_eligible_for_event(event, user)
    if event.participant_mode != PersohubEventParticipantMode.TEAM:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This event is not a team event")

    existing_team = _get_user_team_for_event(db, event.id, user.id)
    if existing_team:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="You are already part of a team")

    team_code = _normalize_team_code(payload.team_code)
    team = db.query(PersohubEventTeam).filter(PersohubEventTeam.event_id == event.id, PersohubEventTeam.team_code == team_code).first()
    if not team:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")

    if event.team_max_size:
        member_count = db.query(PersohubEventTeamMember).filter(PersohubEventTeamMember.team_id == team.id).count()
        if member_count >= event.team_max_size:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Team is full")

    db.add(PersohubEventTeamMember(team_id=team.id, user_id=user.id, role="member"))
    registration = db.query(PersohubEventRegistration).filter(
        PersohubEventRegistration.event_id == event.id,
        PersohubEventRegistration.team_id == team.id,
    ).first()
    if not registration:
        db.add(
            PersohubEventRegistration(
                event_id=event.id,
                user_id=None,
                team_id=team.id,
                entity_type=PersohubEventEntityType.TEAM,
            )
        )
    db.commit()

    leader = db.query(PdaUser).filter(PdaUser.id == team.team_lead_user_id).first()
    if leader and leader.email:
        _send_registration_email(
            leader,
            event,
            f"{user.name} ({user.regno}) joined your team {team.team_name} ({team.team_code}).",
        )
    return _build_team_response(db, team)


@router.get("/persohub/persohub-events/{slug}/team", response_model=PersohubManagedTeamResponse)
def get_my_team(
    slug: str,
    user: PdaUser = Depends(require_pda_user),
    db: Session = Depends(get_db),
):
    event = _get_event_or_404(db, slug)
    _ensure_event_visible_for_public_access(event)
    if event.participant_mode != PersohubEventParticipantMode.TEAM:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This event is not a team event")
    team = _get_user_team_for_event(db, event.id, user.id)
    if not team:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")
    return _build_team_response(db, team)


@router.post("/persohub/persohub-events/{slug}/team/invite")
def invite_to_team(
    slug: str,
    payload: PersohubManagedTeamInvite,
    user: PdaUser = Depends(require_pda_user),
    db: Session = Depends(get_db),
):
    event = _get_event_or_404(db, slug)
    _ensure_event_visible_for_public_access(event)
    if event.participant_mode != PersohubEventParticipantMode.TEAM:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This event is not a team event")

    team = _get_user_team_for_event(db, event.id, user.id)
    if not team:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")
    if team.team_lead_user_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only team leader can invite")

    target = db.query(PdaUser).filter(PdaUser.regno == payload.regno.strip()).first()
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    _ensure_user_eligible_for_event(event, target)
    if _get_user_team_for_event(db, event.id, target.id):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="User already in a team")
    if event.team_max_size:
        member_count = db.query(PersohubEventTeamMember).filter(PersohubEventTeamMember.team_id == team.id).count()
        if member_count >= event.team_max_size:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Team is full")

    existing_member = (
        db.query(PersohubEventTeamMember)
        .filter(PersohubEventTeamMember.team_id == team.id, PersohubEventTeamMember.user_id == target.id)
        .first()
    )
    if not existing_member:
        db.add(PersohubEventTeamMember(team_id=team.id, user_id=target.id, role="member"))

    invite = (
        db.query(PersohubEventInvite)
        .filter(
            PersohubEventInvite.event_id == event.id,
            PersohubEventInvite.team_id == team.id,
            PersohubEventInvite.invited_user_id == target.id,
        )
        .first()
    )
    if invite:
        invite.invited_by_user_id = user.id
        invite.status = PersohubEventInviteStatus.ACCEPTED
    else:
        db.add(
            PersohubEventInvite(
                event_id=event.id,
                team_id=team.id,
                invited_user_id=target.id,
                invited_by_user_id=user.id,
                status=PersohubEventInviteStatus.ACCEPTED,
            )
        )
    db.commit()

    if target.email:
        details = f"You were added to team {team.team_name} ({team.team_code}) for {event.title}."
        _send_registration_email(target, event, details)
    return {"message": "Team member added"}


@router.get("/persohub/persohub-events/{slug}/qr", response_model=PersohubManagedQrResponse)
def get_event_qr_token(
    slug: str,
    user: PdaUser = Depends(require_pda_user),
    db: Session = Depends(get_db),
):
    event = _get_event_or_404(db, slug)
    _ensure_event_visible_for_public_access(event)
    entity_type = PersohubManagedEntityTypeEnum.USER
    entity_id = user.id
    if event.participant_mode == PersohubEventParticipantMode.TEAM:
        team = _get_user_team_for_event(db, event.id, user.id)
        if not team:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")
        entity_type = PersohubManagedEntityTypeEnum.TEAM
        entity_id = team.id
    else:
        exists = db.query(PersohubEventRegistration).filter(
            PersohubEventRegistration.event_id == event.id,
            PersohubEventRegistration.user_id == user.id,
        ).first()
        if not exists:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registration not found")

    token = create_access_token(
        {
            "sub": user.regno,
            "user_type": "pda",
            "qr": "persohub_event_attendance",
            "event_slug": event.slug,
            "entity_type": entity_type.value,
            "entity_id": entity_id,
        },
        expires_delta=timedelta(hours=12),
    )
    return PersohubManagedQrResponse(event_slug=event.slug, entity_type=entity_type, entity_id=entity_id, qr_token=token)


@router.get("/persohub/me/persohub-events", response_model=List[PersohubManagedMyEvent])
def my_events(user: PdaUser = Depends(require_pda_user), db: Session = Depends(get_db)):
    registrations = db.query(PersohubEventRegistration).filter(PersohubEventRegistration.user_id == user.id).all()
    team_rows = (
        db.query(PersohubEventTeamMember, PersohubEventTeam)
        .join(PersohubEventTeam, PersohubEventTeamMember.team_id == PersohubEventTeam.id)
        .filter(PersohubEventTeamMember.user_id == user.id)
        .all()
    )
    team_ids = [team.id for _, team in team_rows]
    if team_ids:
        registrations.extend(
            db.query(PersohubEventRegistration).filter(PersohubEventRegistration.team_id.in_(team_ids)).all()
        )

    results: List[PersohubManagedMyEvent] = []
    seen: set[Tuple[int, Optional[int], Optional[int]]] = set()
    for reg in registrations:
        event = db.query(PersohubEvent).filter(PersohubEvent.id == reg.event_id).first()
        if not event:
            continue
        key = (event.id, reg.user_id, reg.team_id)
        if key in seen:
            continue
        seen.add(key)

        attendance_query = db.query(func.count(PersohubEventAttendance.id)).filter(
            PersohubEventAttendance.event_id == event.id,
            PersohubEventAttendance.is_present == True,  # noqa: E712
        )
        if reg.user_id:
            attendance_query = attendance_query.filter(PersohubEventAttendance.user_id == reg.user_id)
        else:
            attendance_query = attendance_query.filter(PersohubEventAttendance.team_id == reg.team_id)
        attendance_count = attendance_query.scalar() or 0

        cumulative_score = 0.0
        if reg.user_id:
            score_rows = db.execute(
                text("SELECT COALESCE(SUM(total_score), 0) AS total FROM persohub_event_scores WHERE event_id = :event_id AND user_id = :user_id"),
                {"event_id": event.id, "user_id": reg.user_id},
            ).fetchone()
        else:
            score_rows = db.execute(
                text("SELECT COALESCE(SUM(total_score), 0) AS total FROM persohub_event_scores WHERE event_id = :event_id AND team_id = :team_id"),
                {"event_id": event.id, "team_id": reg.team_id},
            ).fetchone()
        if score_rows:
            cumulative_score = float(score_rows[0] or 0.0)

        entity_type = PersohubManagedEntityTypeEnum.USER if reg.user_id else PersohubManagedEntityTypeEnum.TEAM
        entity_id = reg.user_id if reg.user_id else reg.team_id
        results.append(
            PersohubManagedMyEvent(
                event=PersohubManagedEventResponse.model_validate(event),
                entity_type=entity_type,
                entity_id=entity_id,
                is_registered=True,
                attendance_count=int(attendance_count),
                cumulative_score=float(cumulative_score),
            )
        )
    return results


@router.get("/persohub/persohub-events/{slug}/me")
def event_me(
    slug: str,
    user: PdaUser = Depends(require_pda_user),
    db: Session = Depends(get_db),
):
    event = _get_event_or_404(db, slug)
    _ensure_event_visible_for_public_access(event)
    registration = db.query(PersohubEventRegistration).filter(
        PersohubEventRegistration.event_id == event.id,
        PersohubEventRegistration.user_id == user.id,
        PersohubEventRegistration.entity_type == PersohubEventEntityType.USER,
    ).first()
    if not registration:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registration not found")
    return {
        "event_slug": event.slug,
        "event_code": event.event_code,
        "user_id": user.id,
        "regno": user.regno,
        "batch": _batch_from_regno(user.regno),
        "name": user.name,
        "email": user.email,
        "phone": user.phno,
        "gender": user.gender,
        "department": user.dept,
        "profile_picture": user.image_url,
        "status": registration.status.value if hasattr(registration.status, "value") else str(registration.status),
        "referral_code": registration.referral_code,
        "referred_by": registration.referred_by,
        "referral_count": int(registration.referral_count or 0),
    }


@router.get("/persohub/persohub-events/{slug}/my-rounds")
def my_round_status(
    slug: str,
    user: PdaUser = Depends(require_pda_user),
    db: Session = Depends(get_db),
):
    event = _get_event_or_404(db, slug)
    _ensure_event_visible_for_public_access(event)
    registration = None
    entity_type = PersohubEventEntityType.USER
    entity_user_id = user.id
    entity_team_id = None
    if event.participant_mode == PersohubEventParticipantMode.INDIVIDUAL:
        registration = db.query(PersohubEventRegistration).filter(
            PersohubEventRegistration.event_id == event.id,
            PersohubEventRegistration.user_id == user.id,
            PersohubEventRegistration.entity_type == PersohubEventEntityType.USER,
        ).first()
    else:
        team = _get_user_team_for_event(db, event.id, user.id)
        if team:
            entity_type = PersohubEventEntityType.TEAM
            entity_user_id = None
            entity_team_id = team.id
            registration = db.query(PersohubEventRegistration).filter(
                PersohubEventRegistration.event_id == event.id,
                PersohubEventRegistration.team_id == team.id,
                PersohubEventRegistration.entity_type == PersohubEventEntityType.TEAM,
            ).first()
    if not registration:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registration not found")

    rounds = (
        db.query(PersohubEventRound)
        .filter(PersohubEventRound.event_id == event.id)
        .order_by(PersohubEventRound.round_no.asc())
        .all()
    )
    assignment_rows = (
        db.query(PersohubEventRoundPanelAssignment)
        .filter(
            PersohubEventRoundPanelAssignment.event_id == event.id,
            PersohubEventRoundPanelAssignment.entity_type == entity_type,
            PersohubEventRoundPanelAssignment.user_id == entity_user_id,
            PersohubEventRoundPanelAssignment.team_id == entity_team_id,
        )
        .all()
    )
    assignment_panel_id_by_round = {
        int(row.round_id): int(row.panel_id)
        for row in assignment_rows
        if row.round_id is not None and row.panel_id is not None
    }
    panel_ids = sorted(set(assignment_panel_id_by_round.values()))
    panel_map = (
        {
            int(row.id): row
            for row in db.query(PersohubEventRoundPanel).filter(PersohubEventRoundPanel.id.in_(panel_ids)).all()
        }
        if panel_ids
        else {}
    )
    round_ids = [int(round_row.id) for round_row in rounds]
    submission_rows = (
        db.query(PersohubEventRoundSubmission.round_id)
        .filter(
            PersohubEventRoundSubmission.event_id == event.id,
            PersohubEventRoundSubmission.entity_type == entity_type,
            PersohubEventRoundSubmission.user_id == entity_user_id,
            PersohubEventRoundSubmission.team_id == entity_team_id,
            PersohubEventRoundSubmission.round_id.in_(round_ids) if round_ids else False,
        )
        .all()
    )
    submission_round_id_set = {
        int(row.round_id)
        for row in submission_rows
        if row.round_id is not None
    }
    statuses = []
    for round_row in rounds:
        score_row = db.query(PersohubEventScore).filter(
            PersohubEventScore.event_id == event.id,
            PersohubEventScore.round_id == round_row.id,
            PersohubEventScore.entity_type == entity_type,
            PersohubEventScore.user_id == entity_user_id,
            PersohubEventScore.team_id == entity_team_id,
        ).first()
        state_value = round_row.state.value if hasattr(round_row.state, "value") else str(round_row.state)
        is_revealed = str(state_value or "").strip().lower() == "reveal"
        if not is_revealed:
            status_label = "Pending"
            is_present = None
        elif registration.status == PersohubEventRegistrationStatus.ELIMINATED:
            status_label = "Eliminated"
            is_present = bool(score_row.is_present) if score_row else None
        else:
            status_label = "Active"
            is_present = bool(score_row.is_present) if score_row else None
        panel_row = panel_map.get(assignment_panel_id_by_round.get(int(round_row.id)))
        panel_no = None
        panel_name = None
        panel_link = None
        panel_time = None
        if panel_row:
            panel_no = int(panel_row.panel_no) if panel_row.panel_no is not None else None
            panel_name = str(panel_row.name or "").strip() or None
            panel_link = str(panel_row.panel_link or "").strip() or None
            panel_time = panel_row.panel_time.isoformat() if panel_row.panel_time else None
        statuses.append(
            {
                "round_no": f"PF{int(round_row.round_no):02d}",
                "round_name": round_row.name,
                "round_state": state_value,
                "status": status_label,
                "is_present": is_present,
                "panel_no": panel_no,
                "panel_name": panel_name,
                "panel_link": panel_link,
                "panel_time": panel_time,
                "has_submission": bool(int(round_row.id) in submission_round_id_set),
            }
        )
    return statuses


@router.get("/persohub/me/persohub-achievements", response_model=List[PersohubManagedAchievement])
def my_achievements(user: PdaUser = Depends(require_pda_user), db: Session = Depends(get_db)):
    team = db.query(PersohubEventTeamMember).filter(PersohubEventTeamMember.user_id == user.id).all()
    team_ids = [row.team_id for row in team]
    badge_query = db.query(PersohubEventBadge, PersohubEvent).join(PersohubEvent, PersohubEventBadge.event_id == PersohubEvent.id)
    if team_ids:
        badge_query = badge_query.filter(or_(PersohubEventBadge.user_id == user.id, PersohubEventBadge.team_id.in_(team_ids)))
    else:
        badge_query = badge_query.filter(PersohubEventBadge.user_id == user.id)
    badges = badge_query.order_by(PersohubEventBadge.created_at.desc()).all()
    return [
        PersohubManagedAchievement(
            event_slug=event.slug,
            event_title=event.title,
            badge_title=badge.title,
            badge_place=badge.place,
            image_url=badge.image_url,
            score=badge.score,
        )
        for badge, event in badges
    ]


@router.get("/persohub/me/persohub-certificates/{event_slug}", response_model=PersohubManagedCertificateResponse)
def get_certificate(
    event_slug: str,
    user: PdaUser = Depends(require_pda_user),
    db: Session = Depends(get_db),
):
    event = _get_event_or_404(db, event_slug)
    registration = db.query(PersohubEventRegistration).filter(
        PersohubEventRegistration.event_id == event.id,
        PersohubEventRegistration.user_id == user.id,
    ).first()
    team = _get_user_team_for_event(db, event.id, user.id)
    if not registration and team:
        registration = db.query(PersohubEventRegistration).filter(
            PersohubEventRegistration.event_id == event.id,
            PersohubEventRegistration.team_id == team.id,
        ).first()
    if not registration:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registration not found")

    attendance_query = db.query(PersohubEventAttendance).filter(
        PersohubEventAttendance.event_id == event.id,
        PersohubEventAttendance.is_present == True  # noqa: E712
    )
    if registration.user_id:
        attendance_query = attendance_query.filter(PersohubEventAttendance.user_id == registration.user_id)
    else:
        attendance_query = attendance_query.filter(PersohubEventAttendance.team_id == registration.team_id)
    attended = attendance_query.first() is not None
    eligible = bool(event.status == PersohubEventStatus.CLOSED and attended)
    text = None
    if eligible:
        text = f"This certifies that {user.name} actively participated in {event.title} ({event.event_code})."
    return PersohubManagedCertificateResponse(
        event_slug=event.slug,
        event_title=event.title,
        eligible=eligible,
        certificate_text=text,
        generated_at=datetime.now(timezone.utc) if eligible else None,
    )
