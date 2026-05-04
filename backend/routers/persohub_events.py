from datetime import date, datetime, timedelta, timezone
import os
import random
import string
from typing import Any, Dict, List, Optional, Tuple
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func, text, or_

from auth import create_access_token
from database import get_db
from emailer import send_email_async
from badge_service import count_event_badges, get_user_achievements, delete_badges_for_persohub_event_team
from models import (
    PdaUser,
    PersohubEvent,
    PersohubClub,
    PersohubCommunity,
    PersohubEventStatus,
    PersohubEventParticipantMode,
    PersohubEventEntityType,
    PersohubEventRegistrationStatus,
    PersohubEventRegistration,
    PersohubPayment,
    PersohubPost,
    PersohubEventTeam,
    PersohubEventTeamMember,
    PersohubEventInvite,
    PersohubEventInviteStatus,
    PersohubEventRound,
    PersohubEventRoundState,
    PersohubEventResultTitle,
    PersohubEventResultFinalist,
    PersohubEventResultHighlight,
    PersohubEventAttendance,
    PersohubEventScore,
    PersohubEventRoundSubmission,
    PersohubEventRoundPanel,
    PersohubEventRoundPanelAssignment,
)
from persohub_result_analysis import build_event_results_snapshot, build_participant_results_payload, build_public_round_card
from schemas import (
    PersohubManagedAchievement,
    PersohubManagedCertificateResponse,
    PersohubManagedEventDashboard,
    PersohubManagedEntityTypeEnum,
    PersohubEventPaymentPresignRequest,
    PersohubEventPaymentSubmitRequest,
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
    PersohubParticipantResultsResponse,
)
from security import (
    is_persohub_event_access_approved,
    require_pda_user,
)
from utils import _generate_presigned_put_url

router = APIRouter()

_ALLOWED_PAYMENT_SCREENSHOT_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp"]
_PAYMENT_SCREENSHOT_MAX_BYTES = 10 * 1024 * 1024


def _ist_today() -> date:
    return datetime.now(ZoneInfo("Asia/Kolkata")).date()


def _is_event_past_grace(event: PersohubEvent, today: date) -> bool:
    end_date = getattr(event, "end_date", None)
    if not end_date:
        return False
    return today > (end_date + timedelta(days=1))


def _auto_close_event_if_past_grace(db: Session, event: PersohubEvent) -> bool:
    if not _is_event_past_grace(event, _ist_today()):
        return False

    changed = False
    if event.status != PersohubEventStatus.CLOSED:
        event.status = PersohubEventStatus.CLOSED
        changed = True
    if bool(getattr(event, "registration_open", True)):
        event.registration_open = False
        changed = True

    if changed:
        db.commit()
        db.refresh(event)
    return changed


def _get_event_or_404(db: Session, slug: str) -> PersohubEvent:
    event = db.query(PersohubEvent).filter(PersohubEvent.slug == slug).first()
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    _auto_close_event_if_past_grace(db, event)
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


def _results_entity_lookup(db: Session, event: PersohubEvent) -> Dict[Tuple[str, int], Dict[str, Any]]:
    lookup: Dict[Tuple[str, int], Dict[str, Any]] = {}
    if event.participant_mode == PersohubEventParticipantMode.INDIVIDUAL:
        rows = (
            db.query(PersohubEventRegistration, PdaUser)
            .join(PdaUser, PersohubEventRegistration.user_id == PdaUser.id)
            .filter(
                PersohubEventRegistration.event_id == event.id,
                PersohubEventRegistration.entity_type == PersohubEventEntityType.USER,
                PersohubEventRegistration.user_id.isnot(None),
            )
            .all()
        )
        for registration, user in rows:
            lookup[("user", int(user.id))] = {
                "display_name": user.name,
                "rollno_or_code": user.regno,
                "default_image_url": user.image_url,
                "is_wildcard": bool(getattr(registration, "wildcard_start_round_no", None) is not None),
                "wildcard_seed_score": float(getattr(registration, "wildcard_seed_score", 0.0) or 0.0),
                "wildcard_start_round_no": int(getattr(registration, "wildcard_start_round_no", 0) or 0) or None,
            }
        return lookup

    rows = (
        db.query(PersohubEventRegistration, PersohubEventTeam)
        .join(PersohubEventTeam, PersohubEventRegistration.team_id == PersohubEventTeam.id)
        .filter(
            PersohubEventRegistration.event_id == event.id,
            PersohubEventRegistration.entity_type == PersohubEventEntityType.TEAM,
            PersohubEventRegistration.team_id.isnot(None),
        )
        .all()
    )
    for registration, team in rows:
        lookup[("team", int(team.id))] = {
            "display_name": team.team_name,
            "rollno_or_code": team.team_code,
            "default_image_url": None,
            "is_wildcard": bool(getattr(registration, "wildcard_start_round_no", None) is not None),
            "wildcard_seed_score": float(getattr(registration, "wildcard_seed_score", 0.0) or 0.0),
            "wildcard_start_round_no": int(getattr(registration, "wildcard_start_round_no", 0) or 0) or None,
        }
    return lookup


def _winner_performance_payload(db: Session, event: PersohubEvent, *, entity_type: str, entity_id: int) -> Dict[str, Any]:
    raw_payload = build_participant_results_payload(
        db,
        event,
        entity_type=entity_type,
        entity_id=entity_id,
    )
    wrapped_summary = raw_payload.get("wrapped_summary") if isinstance(raw_payload, dict) else {}
    wrapped_summary = wrapped_summary if isinstance(wrapped_summary, dict) else {}
    rounds = raw_payload.get("rounds") if isinstance(raw_payload, dict) else []
    rounds = rounds if isinstance(rounds, list) else []

    round_history: List[Dict[str, Any]] = []
    for round_row in rounds:
        if not isinstance(round_row, dict):
            continue
        standing = round_row.get("standing") if isinstance(round_row.get("standing"), dict) else {}
        round_history.append(
            {
                "round_id": int(round_row.get("round_id") or 0),
                "round_no": int(round_row.get("round_no") or 0),
                "round_name": round_row.get("round_name"),
                "published_at": round_row.get("published_at"),
                "round_rank": int(standing.get("round_rank")) if standing.get("round_rank") is not None else None,
                "round_score": round(float(standing.get("round_score") or 0.0), 2),
                "cumulative_rank": int(standing.get("rank")) if standing.get("rank") is not None else None,
                "cumulative_score": round(float(standing.get("cumulative_score") or 0.0), 2),
            }
        )

    return {
        "total_score": round(float(wrapped_summary.get("cumulative_score") or 0.0), 2) if wrapped_summary else None,
        "overall_rank": int(wrapped_summary.get("rank")) if wrapped_summary.get("rank") is not None else None,
        "performance_trend": wrapped_summary.get("performance_trend"),
        "best_rank": int(wrapped_summary.get("best_rank")) if wrapped_summary.get("best_rank") is not None else None,
        "average_round_score": round(float(wrapped_summary.get("average_round_score") or 0.0), 2) if wrapped_summary else None,
        "rounds_survived": int(wrapped_summary.get("rounds_survived") or 0) if wrapped_summary else 0,
        "round_history": round_history,
    }


def _resolve_attendance_metrics(
    db: Session,
    event_id: int,
    *,
    user_id: Optional[int] = None,
    team_id: Optional[int] = None,
) -> Tuple[int, bool]:
    """Round-level attendance in score table wins; fallback to entry-level attendance rows."""
    round_query = db.query(PersohubEventScore).filter(
        PersohubEventScore.event_id == event_id,
    )
    if user_id is not None:
        round_query = round_query.filter(PersohubEventScore.user_id == user_id)
    else:
        round_query = round_query.filter(PersohubEventScore.team_id == team_id)
    total_round_rows = round_query.count()
    if total_round_rows > 0:
        present_round_count = (
            round_query
            .filter(PersohubEventScore.is_present == True)  # noqa: E712
            .with_entities(func.count(func.distinct(PersohubEventScore.round_id)))
            .scalar()
            or 0
        )
        return int(present_round_count), bool(present_round_count > 0)

    entry_query = db.query(PersohubEventAttendance).filter(
        PersohubEventAttendance.event_id == event_id,
    )
    if user_id is not None:
        entry_query = entry_query.filter(PersohubEventAttendance.user_id == user_id)
    else:
        entry_query = entry_query.filter(PersohubEventAttendance.team_id == team_id)
    present_entry_count = (
        entry_query
        .filter(PersohubEventAttendance.is_present == True)  # noqa: E712
        .count()
    )
    return int(present_entry_count), bool(present_entry_count > 0)


def _registration_effective_cumulative_score(
    db: Session,
    event: PersohubEvent,
    registration: PersohubEventRegistration,
) -> float:
    query = db.query(PersohubEventScore, PersohubEventRound.round_no).join(
        PersohubEventRound,
        PersohubEventRound.id == PersohubEventScore.round_id,
    ).filter(
        PersohubEventScore.event_id == event.id,
        PersohubEventScore.entity_type == registration.entity_type,
    )
    if registration.entity_type == PersohubEventEntityType.USER:
        query = query.filter(PersohubEventScore.user_id == registration.user_id)
    else:
        query = query.filter(PersohubEventScore.team_id == registration.team_id)

    cumulative_score = float(getattr(registration, "wildcard_seed_score", 0.0) or 0.0)
    wildcard_start_round_no = int(getattr(registration, "wildcard_start_round_no", 0) or 0) or None
    for score_row, round_no in query.all():
        if wildcard_start_round_no is not None and int(round_no or 0) < wildcard_start_round_no:
            continue
        if registration.entity_type == PersohubEventEntityType.USER:
            cumulative_score += float(score_row.normalized_score or 0.0)
        else:
            cumulative_score += float(score_row.total_score or 0.0)
    return float(cumulative_score)


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
    require_active: bool = True,
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
    if require_active:
        _ensure_registration_is_active(registration)
    if enforce_team_leader and event.participant_mode == PersohubEventParticipantMode.TEAM and not is_team_leader:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only team leader can submit for this round")
    return registration, entity_type, entity_user_id, entity_team_id, team, is_team_leader


def _registration_is_eliminated_for_round(
    registration: PersohubEventRegistration,
    round_row: PersohubEventRound,
) -> bool:
    eliminated_round_no = int(getattr(registration, "eliminated_round_no", 0) or 0) or None
    if eliminated_round_no is not None:
        return int(round_row.round_no or 0) >= eliminated_round_no
    return registration.status == PersohubEventRegistrationStatus.ELIMINATED


def _submission_lock_reason(
    registration: PersohubEventRegistration,
    round_row: PersohubEventRound,
    submission: Optional[PersohubEventRoundSubmission],
) -> Optional[str]:
    if registration.status == PersohubEventRegistrationStatus.PENDING:
        return "Registration is pending confirmation"
    if _registration_is_eliminated_for_round(registration, round_row):
        return "Participant is eliminated for this round"
    return _round_submission_lock_reason(round_row, submission)


def _round_submission_lock_reason(round_row: PersohubEventRound, submission: Optional[PersohubEventRoundSubmission]) -> Optional[str]:
    now = datetime.now(timezone.utc)
    if round_row.state in {PersohubEventRoundState.COMPLETED, PersohubEventRoundState.REVEAL}:
        return "Round is finalized"
    if bool(round_row.is_frozen):
        return "Round is frozen"
    deadline = round_row.submission_deadline
    if deadline and deadline.tzinfo is None:
        deadline = deadline.replace(tzinfo=timezone.utc)
    allow_late = bool(getattr(round_row, "allow_late_submission", False))
    if deadline and now >= deadline and not allow_late:
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
        "audio/mpeg",
    ]


def _normalize_submission_files(files: Any) -> List[Dict[str, Any]]:
    if not isinstance(files, list):
        return []
    normalized: List[Dict[str, Any]] = []
    for item in files:
        if not isinstance(item, dict):
            continue
        file_url = str(item.get("file_url") or "").strip()
        if not file_url:
            continue
        file_name = str(item.get("file_name") or "").strip() or None
        mime_type = str(item.get("mime_type") or "").strip().lower()
        file_size_raw = item.get("file_size_bytes")
        try:
            file_size_bytes = int(file_size_raw or 0)
        except (TypeError, ValueError):
            file_size_bytes = 0
        normalized.append(
            {
                "file_url": file_url,
                "file_name": file_name,
                "file_size_bytes": file_size_bytes,
                "mime_type": mime_type,
            }
        )
    return normalized


def _submission_files_from_row(submission: Optional[PersohubEventRoundSubmission]) -> List[Dict[str, Any]]:
    if not submission:
        return []
    files = _normalize_submission_files(getattr(submission, "files", None))
    if files:
        return files
    file_url = str(getattr(submission, "file_url", "") or "").strip()
    if not file_url:
        return []
    file_size = int(getattr(submission, "file_size_bytes", 0) or 0)
    return [
        {
            "file_url": file_url,
            "file_name": str(getattr(submission, "file_name", "") or "").strip() or None,
            "file_size_bytes": file_size if file_size > 0 else 1,
            "mime_type": str(getattr(submission, "mime_type", "") or "").strip().lower() or "application/octet-stream",
        }
    ]


def _submission_payload(
    registration: PersohubEventRegistration,
    round_row: PersohubEventRound,
    entity_type: PersohubEventEntityType,
    entity_user_id: Optional[int],
    entity_team_id: Optional[int],
    submission: Optional[PersohubEventRoundSubmission],
) -> PersohubRoundSubmissionResponse:
    lock_reason = _submission_lock_reason(registration, round_row, submission)
    submission_files = _submission_files_from_row(submission)
    first_file = submission_files[0] if submission_files else None
    return PersohubRoundSubmissionResponse(
        id=submission.id if submission else None,
        event_id=int(round_row.event_id),
        round_id=int(round_row.id),
        entity_type=PersohubManagedEntityTypeEnum.TEAM if entity_type == PersohubEventEntityType.TEAM else PersohubManagedEntityTypeEnum.USER,
        user_id=entity_user_id,
        team_id=entity_team_id,
        submission_type=submission.submission_type if submission else None,
        file_url=first_file.get("file_url") if first_file else None,
        file_name=first_file.get("file_name") if first_file else None,
        file_size_bytes=first_file.get("file_size_bytes") if first_file else None,
        mime_type=first_file.get("mime_type") if first_file else None,
        files=submission_files,
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


def _event_access_approved(db: Session, event: PersohubEvent) -> bool:
    club = db.query(PersohubClub).filter(PersohubClub.id == int(event.club_id or 0)).first() if event.club_id else None
    return bool(is_persohub_event_access_approved(event, club))


def _event_seats_left(db: Session, event: PersohubEvent) -> Optional[int]:
    if not bool(getattr(event, "seat_availability_enabled", False)):
        return None
    seat_capacity = int(getattr(event, "seat_capacity", 0) or 100)
    if seat_capacity < 1:
        seat_capacity = 100
    seats_occupied = int(
        db.query(func.count(PersohubEventRegistration.id))
        .filter(PersohubEventRegistration.event_id == event.id)
        .scalar()
        or 0
    )
    return max(seat_capacity - seats_occupied, 0)


def _registration_available(db: Session, event: PersohubEvent) -> bool:
    if not bool(getattr(event, "registration_open", True)):
        return False
    if not _event_access_approved(db, event):
        return False
    seats_left = _event_seats_left(db, event)
    if seats_left is not None and seats_left <= 0:
        return False
    return True


def _ensure_registration_open_for_registration_actions(db: Session, event: PersohubEvent) -> None:
    if not _event_access_approved(db, event):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Registration unavailable until C&C approves this event",
        )
    if not bool(getattr(event, "registration_open", True)):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Registration is closed")
    seats_left = _event_seats_left(db, event)
    if seats_left is not None and seats_left <= 0:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Registration is full")


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


def _to_non_negative_float(value: Any, default: float = 0.0) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return float(default)
    return parsed if parsed >= 0 else float(default)


def _normalized_registration_fee(event: PersohubEvent) -> Dict[str, Any]:
    raw = event.registration_fee if isinstance(event.registration_fee, dict) else {}
    enabled = bool(raw.get("enabled"))
    raw_currency = str(raw.get("currency") or "INR").strip().upper() or "INR"
    raw_amounts = raw.get("amounts") if isinstance(raw.get("amounts"), dict) else {}
    mit_amount = _to_non_negative_float(raw_amounts.get("MIT"), 0.0)
    other_amount = _to_non_negative_float(raw_amounts.get("Other"), 0.0)
    return {
        "enabled": enabled,
        "currency": raw_currency,
        "amounts": {
            "MIT": mit_amount,
            "Other": other_amount,
        },
    }


def _fee_key_for_user(user: Optional[PdaUser]) -> str:
    return "MIT" if user and _is_mit_user(user) else "Other"


def _resolve_event_payer_user(
    db: Session,
    event: PersohubEvent,
    user: PdaUser,
    team: Optional[PersohubEventTeam] = None,
) -> Optional[PdaUser]:
    if event.participant_mode != PersohubEventParticipantMode.TEAM:
        return user
    if team and int(team.team_lead_user_id or 0) > 0:
        leader = db.query(PdaUser).filter(PdaUser.id == int(team.team_lead_user_id)).first()
        if leader:
            return leader
    return user


def _registration_fee_meta(
    event: PersohubEvent,
    payer_user: Optional[PdaUser],
) -> Tuple[bool, Optional[str], float, str]:
    config = _normalized_registration_fee(event)
    if not bool(config.get("enabled")):
        return False, None, 0.0, str(config.get("currency") or "INR")
    fee_key = _fee_key_for_user(payer_user)
    amount = _to_non_negative_float(config.get("amounts", {}).get(fee_key), 0.0)
    currency = str(config.get("currency") or "INR")
    return amount > 0, fee_key, amount, currency


def _club_payment_config(db: Session, event: PersohubEvent) -> Dict[str, Optional[str]]:
    club = db.query(PersohubClub).filter(PersohubClub.id == event.club_id).first() if event.club_id else None
    owner = db.query(PdaUser).filter(PdaUser.id == int(club.owner_user_id)).first() if club and club.owner_user_id else None
    return {
        "payment_url_image": (str(club.payment_url_image or "") if club else "") or None,
        "payment_id": (str(club.payment_id or "") if club else "") or None,
        "club_owner_mobile": (str(owner.phno or "") if owner else "") or None,
    }


def _payment_status_from_row(payment: Optional[PersohubPayment], payment_required: bool) -> str:
    if not payment_required:
        return "none"
    if not payment:
        return "none"
    content = payment.content if isinstance(payment.content, dict) else {}
    raw = str(content.get("status") or "").strip().lower()
    if raw in {"pending", "declined", "approved"}:
        return raw
    return "pending"


def _registration_status_for_dashboard(registration: Optional[PersohubEventRegistration]) -> str:
    if not registration:
        return "not_registered"
    raw = str(registration.status.value if hasattr(registration.status, "value") else registration.status or "").strip().lower()
    if raw == "eliminated":
        return "eliminated"
    if raw == "pending":
        return "pending"
    return "active"


def _ensure_registration_is_active(registration: Optional[PersohubEventRegistration]) -> None:
    if not registration:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registration not found")
    raw = str(registration.status.value if hasattr(registration.status, "value") else registration.status or "").strip().lower()
    if raw == "pending":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Registration is pending confirmation")


def _send_payment_review_email(user: PdaUser, event: PersohubEvent) -> None:
    if not user.email:
        return
    subject = f"Payment received for review - {event.title}"
    whatsapp_url = str(getattr(event, "whatsapp_url", "") or "").strip()
    whatsapp_text = f"\nJoin our WhatsApp channel for updates: {whatsapp_url}\n" if whatsapp_url else ""
    whatsapp_html = (
        f'<p><a href="{whatsapp_url}" target="_blank" rel="noreferrer">Join our WhatsApp channel for updates</a></p>'
        if whatsapp_url
        else ""
    )
    text = (
        f"Hello {user.name},\n\n"
        f"We received your payment proof for {event.title} ({event.event_code}).\n"
        "Your registration is pending confirmation.\n"
        f"{whatsapp_text}\n"
        "Regards,\nPersohub Team"
    )
    html = (
        "<html><body>"
        f"<p>Hello {user.name},</p>"
        f"<p>We received your payment proof for <strong>{event.title}</strong> ({event.event_code}).</p>"
        "<p>Your registration is pending confirmation.</p>"
        f"{whatsapp_html}"
        "<p>Regards,<br/><strong>Persohub Team</strong></p>"
        "</body></html>"
    )
    try:
        send_email_async(user.email, subject, html, text)
    except Exception:
        pass


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
        send_email_async(user.email, subject, html, text)
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
    payloads = []
    for event in events:
        _auto_close_event_if_past_grace(db, event)
        if event.status != PersohubEventStatus.OPEN:
            continue
        payload = PersohubManagedEventResponse.model_validate(event)
        payloads.append(payload.model_copy(update={"registration_available": _registration_available(db, event)}))
    return payloads


@router.get("/persohub/persohub-events/all", response_model=List[PersohubManagedEventResponse])
def list_all_managed_events(db: Session = Depends(get_db)):
    events = db.query(PersohubEvent).filter(PersohubEvent.is_visible == True).order_by(PersohubEvent.created_at.desc()).all()  # noqa: E712
    payloads = []
    for event in events:
        _auto_close_event_if_past_grace(db, event)
        payload = PersohubManagedEventResponse.model_validate(event)
        payloads.append(payload.model_copy(update={"registration_available": _registration_available(db, event)}))
    return payloads


@router.get("/persohub/persohub-events/{slug}", response_model=PersohubManagedEventResponse)
def get_event(slug: str, db: Session = Depends(get_db)):
    event = _get_event_or_404(db, slug)
    _ensure_event_visible_for_public_access(event)
    community = None
    if int(getattr(event, "community_id", 0) or 0) > 0:
        community = db.query(PersohubCommunity).filter(PersohubCommunity.id == int(event.community_id)).first()
    if not community:
        source_post = (
            db.query(PersohubPost)
            .filter(PersohubPost.source_event_id == int(event.id))
            .order_by(PersohubPost.id.desc())
            .first()
        )
        if source_post and int(getattr(source_post, "community_id", 0) or 0) > 0:
            community = db.query(PersohubCommunity).filter(PersohubCommunity.id == int(source_post.community_id)).first()

    club = None
    if int(getattr(event, "club_id", 0) or 0) > 0:
        club = db.query(PersohubClub).filter(PersohubClub.id == int(event.club_id)).first()
    if not club and community and int(getattr(community, "club_id", 0) or 0) > 0:
        club = db.query(PersohubClub).filter(PersohubClub.id == int(community.club_id)).first()

    payload = PersohubManagedEventResponse.model_validate(event).model_copy(
        update={
            "community_profile_id": (str(getattr(community, "profile_id", "") or "").strip() or None),
            "community_name": (str(getattr(community, "name", "") or "").strip() or None),
            "club_name": (str(getattr(club, "name", "") or "").strip() or None),
            "club_logo_url": (str(getattr(club, "club_logo_url", "") or "").strip() or None),
        }
    )
    registration_available = _registration_available(db, event)
    seat_availability_enabled = bool(getattr(event, "seat_availability_enabled", False))
    if not seat_availability_enabled:
        return payload.model_copy(
            update={
                "registration_available": registration_available,
                "seat_availability_enabled": False,
                "seat_capacity": None,
                "seats_occupied": None,
                "seats_left": None,
            }
        )

    seat_capacity = int(event.seat_capacity or 100)
    if seat_capacity < 1:
        seat_capacity = 100
    seats_occupied = int(
        db.query(func.count(PersohubEventRegistration.id))
        .filter(PersohubEventRegistration.event_id == event.id)
        .scalar()
        or 0
    )
    seats_left = max(seat_capacity - seats_occupied, 0)
    return payload.model_copy(
        update={
            "registration_available": registration_available,
            "seat_availability_enabled": True,
            "seat_capacity": seat_capacity,
            "seats_occupied": seats_occupied,
            "seats_left": seats_left,
        }
    )


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
    registration, entity_type, entity_user_id, entity_team_id, _, _ = _resolve_submission_entity(
        db,
        event,
        user,
        enforce_team_leader=False,
        require_active=False,
    )
    submission = db.query(PersohubEventRoundSubmission).filter(
        PersohubEventRoundSubmission.event_id == event.id,
        PersohubEventRoundSubmission.round_id == round_row.id,
        PersohubEventRoundSubmission.entity_type == entity_type,
        PersohubEventRoundSubmission.user_id == entity_user_id,
        PersohubEventRoundSubmission.team_id == entity_team_id,
    ).first()
    return _submission_payload(registration, round_row, entity_type, entity_user_id, entity_team_id, submission)


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
    registration, entity_type, entity_user_id, entity_team_id, _, _ = _resolve_submission_entity(
        db,
        event,
        user,
        enforce_team_leader=True,
        require_active=False,
    )
    existing = db.query(PersohubEventRoundSubmission).filter(
        PersohubEventRoundSubmission.event_id == event.id,
        PersohubEventRoundSubmission.round_id == round_row.id,
        PersohubEventRoundSubmission.entity_type == entity_type,
        PersohubEventRoundSubmission.user_id == entity_user_id,
        PersohubEventRoundSubmission.team_id == entity_team_id,
    ).first()
    lock_reason = _submission_lock_reason(registration, round_row, existing)
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

    registration, entity_type, entity_user_id, entity_team_id, _, _ = _resolve_submission_entity(
        db,
        event,
        user,
        enforce_team_leader=True,
        require_active=False,
    )
    submission = db.query(PersohubEventRoundSubmission).filter(
        PersohubEventRoundSubmission.event_id == event.id,
        PersohubEventRoundSubmission.round_id == round_row.id,
        PersohubEventRoundSubmission.entity_type == entity_type,
        PersohubEventRoundSubmission.user_id == entity_user_id,
        PersohubEventRoundSubmission.team_id == entity_team_id,
    ).first()

    lock_reason = _submission_lock_reason(registration, round_row, submission)
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
        submitted_files = _normalize_submission_files(data.get("files"))
        if not submitted_files and str(data.get("file_url") or "").strip():
            submitted_files = _normalize_submission_files(
                [
                    {
                        "file_url": data.get("file_url"),
                        "file_name": data.get("file_name"),
                        "file_size_bytes": data.get("file_size_bytes"),
                        "mime_type": data.get("mime_type"),
                    }
                ]
            )
        if not submitted_files:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="At least one file is required for file submissions")
        if len(submitted_files) > 5:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A maximum of 5 files is allowed")
        for item in submitted_files:
            mime_type = str(item.get("mime_type") or "").strip().lower()
            file_size_bytes = int(item.get("file_size_bytes") or 0)
            if not mime_type:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="mime_type is required for file submissions")
            if mime_type not in allowed_mime_types:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid file type")
            if file_size_bytes <= 0:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="file_size_bytes is required for file submissions")
            if file_size_bytes > max_bytes:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"File size exceeds {max_file_size_mb} MB limit")
        first_file = submitted_files[0]
        if submission:
            submission.submission_type = "file"
            submission.file_url = first_file.get("file_url")
            submission.file_name = first_file.get("file_name")
            submission.file_size_bytes = first_file.get("file_size_bytes")
            submission.mime_type = first_file.get("mime_type")
            submission.files = submitted_files
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
                file_url=first_file.get("file_url"),
                file_name=first_file.get("file_name"),
                file_size_bytes=first_file.get("file_size_bytes"),
                mime_type=first_file.get("mime_type"),
                files=submitted_files,
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
            submission.files = []
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
                files=[],
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
    return _submission_payload(registration, round_row, entity_type, entity_user_id, entity_team_id, submission)


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

    registration, entity_type, entity_user_id, entity_team_id, _, _ = _resolve_submission_entity(
        db,
        event,
        user,
        enforce_team_leader=True,
        require_active=False,
    )
    submission = db.query(PersohubEventRoundSubmission).filter(
        PersohubEventRoundSubmission.event_id == event.id,
        PersohubEventRoundSubmission.round_id == round_row.id,
        PersohubEventRoundSubmission.entity_type == entity_type,
        PersohubEventRoundSubmission.user_id == entity_user_id,
        PersohubEventRoundSubmission.team_id == entity_team_id,
    ).first()

    lock_reason = _submission_lock_reason(registration, round_row, submission)
    if lock_reason:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=lock_reason)

    if submission:
        db.delete(submission)
        db.commit()
    return _submission_payload(registration, round_row, entity_type, entity_user_id, entity_team_id, None)


@router.get("/persohub/persohub-events/{slug}/results")
def get_event_results(slug: str, db: Session = Depends(get_db)):
    event = _get_event_or_404(db, slug)
    _ensure_event_visible_for_public_access(event)
    entity_lookup = _results_entity_lookup(db, event)
    round_rows = (
        db.query(PersohubEventRound)
        .filter(
            PersohubEventRound.event_id == event.id,
            PersohubEventRound.state != PersohubEventRoundState.DRAFT,
        )
        .order_by(PersohubEventRound.round_no.asc(), PersohubEventRound.id.asc())
        .all()
    )
    finalist_rows = (
        db.query(PersohubEventResultFinalist)
        .filter(PersohubEventResultFinalist.event_id == event.id)
        .order_by(PersohubEventResultFinalist.sort_order.asc(), PersohubEventResultFinalist.created_at.asc(), PersohubEventResultFinalist.id.asc())
        .all()
    )
    finalists_by_entity: Dict[Tuple[str, int], Dict[str, Any]] = {}
    nominees: List[Dict[str, Any]] = []
    for row in finalist_rows:
        entity_type = "user" if row.entity_type == PersohubEventEntityType.USER else "team"
        entity_id = int(row.user_id if entity_type == "user" else row.team_id or 0)
        source = entity_lookup.get((entity_type, entity_id))
        if entity_id <= 0 or not source:
            continue
        payload = {
            "id": int(row.id),
            "entity_id": entity_id,
            "entity_type": entity_type,
            "display_name": source.get("display_name"),
            "rollno_or_code": source.get("rollno_or_code"),
            "default_image_url": source.get("default_image_url"),
            "resolved_photo_url": row.photo_url or source.get("default_image_url"),
            "resolved_video_url": row.video_url,
            "content": row.content if isinstance(row.content, dict) else None,
            "is_wildcard": bool(source.get("is_wildcard")),
            "wildcard_seed_score": float(source.get("wildcard_seed_score") or 0.0) if source.get("wildcard_seed_score") is not None else None,
            "wildcard_start_round_no": int(source.get("wildcard_start_round_no") or 0) or None,
            "performance": _winner_performance_payload(
                db,
                event,
                entity_type=entity_type,
                entity_id=entity_id,
            ),
        }
        nominees.append(payload)
        finalists_by_entity[(entity_type, entity_id)] = payload

    highlight_rows = (
        db.query(PersohubEventResultHighlight)
        .filter(PersohubEventResultHighlight.event_id == event.id)
        .order_by(PersohubEventResultHighlight.sort_order.asc(), PersohubEventResultHighlight.id.asc())
        .all()
    )
    result_highlights: List[Dict[str, Any]] = []
    for row in highlight_rows:
        participant = None
        if row.entity_type in {PersohubEventEntityType.USER, PersohubEventEntityType.TEAM}:
            entity_type = "user" if row.entity_type == PersohubEventEntityType.USER else "team"
            entity_id = int(row.user_id if entity_type == "user" else row.team_id or 0)
            source = entity_lookup.get((entity_type, entity_id))
            finalist_media = finalists_by_entity.get((entity_type, entity_id)) or {}
            if entity_id > 0 and source:
                participant = {
                    "entity_id": entity_id,
                    "entity_type": entity_type,
                    "display_name": source.get("display_name"),
                    "rollno_or_code": source.get("rollno_or_code"),
                    "default_image_url": source.get("default_image_url"),
                    "resolved_photo_url": finalist_media.get("resolved_photo_url") or source.get("default_image_url"),
                    "resolved_video_url": finalist_media.get("resolved_video_url"),
                    "is_wildcard": bool(source.get("is_wildcard")),
                }
        result_highlights.append(
            {
                "id": int(row.id),
                "emoji": str(row.emoji or "").strip() or None,
                "tag": str(row.tag or "").strip() or None,
                "title": str(row.title or ""),
                "quantity": str(row.quantity or "").strip() or None,
                "description": str(row.description or "").strip() or None,
                "participant": participant,
                "content": row.content if isinstance(row.content, dict) else None,
                "sort_order": int(row.sort_order or 1),
            }
        )

    title_rows = (
        db.query(PersohubEventResultTitle)
        .filter(PersohubEventResultTitle.event_id == event.id)
        .order_by(PersohubEventResultTitle.precedence_rank.asc(), PersohubEventResultTitle.id.asc())
        .all()
    )
    title_winners: List[Dict[str, Any]] = []
    for row in title_rows:
        entity_type = "user" if row.entity_type == PersohubEventEntityType.USER else "team"
        entity_id = int(row.user_id if entity_type == "user" else row.team_id or 0)
        source = entity_lookup.get((entity_type, entity_id))
        if entity_id <= 0 or not source:
            continue
        finalist_media = finalists_by_entity.get((entity_type, entity_id)) or {}
        title_winners.append(
            {
                "id": int(row.id),
                "title_name": row.title_name,
                "theme_key": str(row.theme_key or "").strip() or None,
                "precedence_rank": int(row.precedence_rank or 0),
                "entity_id": entity_id,
                "entity_type": entity_type,
                "display_name": source.get("display_name"),
                "rollno_or_code": source.get("rollno_or_code"),
                "default_image_url": source.get("default_image_url"),
                "resolved_photo_url": finalist_media.get("resolved_photo_url") or source.get("default_image_url"),
                "resolved_video_url": finalist_media.get("resolved_video_url"),
                "content": finalist_media.get("content") if isinstance(finalist_media.get("content"), dict) else None,
                "is_wildcard": bool(source.get("is_wildcard")),
                "wildcard_seed_score": float(source.get("wildcard_seed_score") or 0.0) if source.get("wildcard_seed_score") is not None else None,
                "wildcard_start_round_no": int(source.get("wildcard_start_round_no") or 0) or None,
                "performance": _winner_performance_payload(
                    db,
                    event,
                    entity_type=entity_type,
                    entity_id=entity_id,
                ),
            }
    )

    winners_revealed = bool(getattr(event, "results_winners_revealed", False))
    published_round_rows = [round_row for round_row in round_rows if bool(getattr(round_row, "results_published", False))]
    final_snapshot = getattr(event, "event_results_snapshot", None) if bool(getattr(event, "results_published", False)) else None
    required_storyboard_charts = {
        "rank_movement",
        "score_progression",
        "qualification_funnel",
        "round_elimination_trend",
        "round_distribution_heatmap",
        "round_average_scores",
    }
    snapshot_charts = final_snapshot.get("charts") if isinstance(final_snapshot, dict) else None
    if bool(getattr(event, "results_published", False)) and published_round_rows:
        if not isinstance(snapshot_charts, dict) or not required_storyboard_charts.issubset(set(snapshot_charts.keys())):
            final_snapshot = build_event_results_snapshot(db, event, published_round_rows)
    return {
        "slug": event.slug,
        "title": event.title,
        "results_published": bool(getattr(event, "results_published", False)),
        "results_winners_revealed": winners_revealed,
        "results_caption": getattr(event, "results_caption", None),
        "results_model_url": getattr(event, "results_model_url", None),
        "nominees": nominees,
        "title_winners": title_winners if winners_revealed else [],
        "result_highlights": result_highlights,
        "rounds": [build_public_round_card(round_row) for round_row in round_rows],
        "final_event_snapshot": final_snapshot,
    }


@router.get("/persohub/persohub-events/{slug}/my-results", response_model=PersohubParticipantResultsResponse)
def get_my_event_results(
    slug: str,
    user: PdaUser = Depends(require_pda_user),
    db: Session = Depends(get_db),
):
    event = _get_event_or_404(db, slug)
    _ensure_event_visible_for_public_access(event)
    if event.participant_mode == PersohubEventParticipantMode.INDIVIDUAL:
        registration = db.query(PersohubEventRegistration).filter(
            PersohubEventRegistration.event_id == event.id,
            PersohubEventRegistration.entity_type == PersohubEventEntityType.USER,
            PersohubEventRegistration.user_id == user.id,
        ).first()
        if not registration:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registration not found")
        return build_participant_results_payload(db, event, entity_type="user", entity_id=int(user.id))

    team = _get_user_team_for_event(db, event.id, user.id)
    if not team:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")
    return build_participant_results_payload(db, event, entity_type="team", entity_id=int(team.id))


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
    badges_count = count_event_badges(db, platform="persohub", event_id=event.id)

    entity_type = None
    entity_id = None
    if registration:
        entity_type = PersohubManagedEntityTypeEnum.TEAM if registration.team_id else PersohubManagedEntityTypeEnum.USER
        entity_id = registration.team_id if registration.team_id else registration.user_id

    payer_user = _resolve_event_payer_user(db, event, user, team=team)
    payment_required, fee_key, payable_amount, _currency = _registration_fee_meta(event, payer_user)
    payer_user_id = int(payer_user.id) if payer_user else int(user.id)
    payment_row = (
        db.query(PersohubPayment)
        .filter(PersohubPayment.event_id == event.id, PersohubPayment.user_id == payer_user_id)
        .first()
        if payment_required
        else None
    )
    registration_status = _registration_status_for_dashboard(registration)
    payment_status = _payment_status_from_row(payment_row, payment_required)
    payment_review_reason = None
    if payment_row and isinstance(getattr(payment_row, "content", None), dict):
        review_block = payment_row.content.get("review")
        if isinstance(review_block, dict):
            payment_review_reason = str(review_block.get("reason") or "").strip() or None
    payment_config = _club_payment_config(db, event)
    registration_available = _registration_available(db, event)
    event_payload = PersohubManagedEventResponse.model_validate(event).model_copy(
        update={"registration_available": registration_available}
    )

    return PersohubManagedEventDashboard(
        event=event_payload,
        is_registered=bool(registration),
        is_wildcard=bool(registration and getattr(registration, "wildcard_start_round_no", None) is not None),
        registration_status=registration_status,
        payment_status=payment_status,
        payment_review_reason=payment_review_reason,
        payable_amount=float(payable_amount),
        fee_key=fee_key,
        payment_required=bool(payment_required),
        payment_config=payment_config,
        entity_type=entity_type,
        entity_id=entity_id,
        team_code=team.team_code if team else None,
        team_name=team.team_name if team else None,
        team_members=members_payload,
        rounds_count=rounds_count,
        badges_count=badges_count,
        registration_available=registration_available,
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
    _ensure_registration_open_for_registration_actions(db, event)
    _ensure_user_eligible_for_event(event, user)
    if event.participant_mode != PersohubEventParticipantMode.INDIVIDUAL:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Use team registration for this event")

    payment_required, _fee_key, payable_amount, _currency = _registration_fee_meta(event, user)
    if payment_required:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This event requires payment proof. Use payment submit flow to continue.",
        )

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


@router.post("/persohub/persohub-events/{slug}/payments/presign", response_model=PresignResponse)
def presign_payment_proof_upload(
    slug: str,
    payload: PersohubEventPaymentPresignRequest,
    user: PdaUser = Depends(require_pda_user),
    db: Session = Depends(get_db),
):
    event = _get_event_or_404(db, slug)
    _ensure_event_visible_for_public_access(event)
    _ensure_registration_open_for_registration_actions(db, event)
    _ensure_user_eligible_for_event(event, user)

    team = None
    payer_user = user
    if event.participant_mode == PersohubEventParticipantMode.TEAM:
        team = _get_user_team_for_event(db, event.id, user.id)
        if not team:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Create or join a team first")
        if int(team.team_lead_user_id or 0) != int(user.id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only team leader can submit payment")
        payer_user = _resolve_event_payer_user(db, event, user, team=team) or user

    payment_required, _fee_key, _payable_amount, _currency = _registration_fee_meta(event, payer_user)
    if not payment_required:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Payment proof is not required for this event")

    payment_config = _club_payment_config(db, event)
    if not payment_config.get("payment_url_image") or not payment_config.get("payment_id"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Club payment configuration is incomplete")

    if int(payload.file_size_bytes) > _PAYMENT_SCREENSHOT_MAX_BYTES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Screenshot exceeds 10 MB limit")
    content_type = str(payload.content_type or "").strip().lower()
    if content_type not in _ALLOWED_PAYMENT_SCREENSHOT_TYPES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid payment screenshot type")

    presign = _generate_presigned_put_url(
        key_prefix=f"payments/persohub_events/{event.slug}",
        filename=payload.filename,
        content_type=content_type,
        allowed_types=_ALLOWED_PAYMENT_SCREENSHOT_TYPES,
    )
    return PresignResponse(**presign)


@router.post("/persohub/persohub-events/{slug}/payments/submit", response_model=PersohubManagedEventDashboard)
def submit_event_payment(
    slug: str,
    payload: PersohubEventPaymentSubmitRequest,
    user: PdaUser = Depends(require_pda_user),
    db: Session = Depends(get_db),
):
    event = _get_event_or_404(db, slug)
    _ensure_event_visible_for_public_access(event)
    _ensure_registration_open_for_registration_actions(db, event)
    _ensure_user_eligible_for_event(event, user)

    team = None
    entity_type = PersohubEventEntityType.USER
    entity_user_id: Optional[int] = int(user.id)
    entity_team_id: Optional[int] = None
    payer_user = user

    if event.participant_mode == PersohubEventParticipantMode.TEAM:
        team = _get_user_team_for_event(db, event.id, user.id)
        if not team:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Create or join a team first")
        if int(team.team_lead_user_id or 0) != int(user.id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only team leader can submit payment")
        payer_user = _resolve_event_payer_user(db, event, user, team=team) or user
        entity_type = PersohubEventEntityType.TEAM
        entity_user_id = None
        entity_team_id = int(team.id)

    payment_required, fee_key, payable_amount, currency = _registration_fee_meta(event, payer_user)
    if not payment_required:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Payment proof is not required for this event")

    payment_config = _club_payment_config(db, event)
    if not payment_config.get("payment_url_image") or not payment_config.get("payment_id"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Club payment configuration is incomplete")

    registration = db.query(PersohubEventRegistration).filter(
        PersohubEventRegistration.event_id == event.id,
        PersohubEventRegistration.entity_type == entity_type,
        PersohubEventRegistration.user_id == entity_user_id,
        PersohubEventRegistration.team_id == entity_team_id,
    ).first()
    if registration:
        registration.status = PersohubEventRegistrationStatus.PENDING
    else:
        registration = PersohubEventRegistration(
            event_id=event.id,
            user_id=entity_user_id,
            team_id=entity_team_id,
            entity_type=entity_type,
            status=PersohubEventRegistrationStatus.PENDING,
            referral_code=(_next_event_referral_code(db, event.id) if entity_type == PersohubEventEntityType.USER else None),
            referred_by=None,
            referral_count=0,
        )
        db.add(registration)
        db.flush()

    payment_row = db.query(PersohubPayment).filter(
        PersohubPayment.event_id == event.id,
        PersohubPayment.user_id == payer_user.id,
    ).first()
    old_content = payment_row.content if payment_row and isinstance(payment_row.content, dict) else {}
    attempt = int(old_content.get("attempt") or 0) + 1
    content = {
        "status": "pending",
        "comment": payload.comment,
        "fee_key": fee_key,
        "amount": float(payable_amount),
        "currency": currency,
        "entity_type": ("team" if entity_type == PersohubEventEntityType.TEAM else "user"),
        "entity_id": (entity_team_id if entity_type == PersohubEventEntityType.TEAM else entity_user_id),
        "team_id": entity_team_id,
        "attempt": attempt,
        "review": {
            "by_user_id": None,
            "by_name": None,
            "at": None,
            "reason": None,
        },
    }
    if payment_row:
        payment_row.payment_info_url = payload.payment_info_url
        payment_row.content = content
    else:
        db.add(
            PersohubPayment(
                user_id=payer_user.id,
                event_id=event.id,
                payment_info_url=payload.payment_info_url,
                content=content,
            )
        )

    _send_payment_review_email(payer_user, event)
    db.commit()
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
    _ensure_registration_open_for_registration_actions(db, event)
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
    leader_user = _resolve_event_payer_user(db, event, user, team=team)
    payment_required, _fee_key, _payable_amount, _currency = _registration_fee_meta(event, leader_user)
    if not payment_required:
        registration = PersohubEventRegistration(
            event_id=event.id,
            user_id=None,
            team_id=team.id,
            entity_type=PersohubEventEntityType.TEAM,
            status=PersohubEventRegistrationStatus.ACTIVE,
        )
        db.add(registration)
    db.commit()
    db.refresh(team)

    if not payment_required:
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
    _ensure_registration_open_for_registration_actions(db, event)
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
    leader_user = db.query(PdaUser).filter(PdaUser.id == int(team.team_lead_user_id)).first()
    payment_required, _fee_key, _payable_amount, _currency = _registration_fee_meta(event, leader_user or user)
    registration = db.query(PersohubEventRegistration).filter(
        PersohubEventRegistration.event_id == event.id,
        PersohubEventRegistration.team_id == team.id,
    ).first()
    if not registration and not payment_required:
        db.add(
            PersohubEventRegistration(
                event_id=event.id,
                user_id=None,
                team_id=team.id,
                entity_type=PersohubEventEntityType.TEAM,
                status=PersohubEventRegistrationStatus.ACTIVE,
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


@router.delete("/persohub/persohub-events/{slug}/team/leave")
def leave_team(
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
    if int(team.team_lead_user_id) == int(user.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Team leader cannot leave. Delete team instead.")

    membership = (
        db.query(PersohubEventTeamMember)
        .filter(PersohubEventTeamMember.team_id == team.id, PersohubEventTeamMember.user_id == user.id)
        .first()
    )
    if not membership:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Membership not found")

    db.delete(membership)
    db.query(PersohubEventInvite).filter(
        PersohubEventInvite.event_id == event.id,
        PersohubEventInvite.team_id == team.id,
        PersohubEventInvite.invited_user_id == user.id,
    ).delete(synchronize_session=False)
    db.commit()
    return {"message": "Left team successfully"}


@router.delete("/persohub/persohub-events/{slug}/team/members/{member_user_id}")
def remove_team_member(
    slug: str,
    member_user_id: int,
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
    if int(team.team_lead_user_id) != int(user.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only team leader can remove members")
    if int(member_user_id) == int(user.id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Leader cannot remove self")

    membership = (
        db.query(PersohubEventTeamMember)
        .filter(PersohubEventTeamMember.team_id == team.id, PersohubEventTeamMember.user_id == int(member_user_id))
        .first()
    )
    if not membership:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found in your team")
    if str(membership.role or "").strip().lower() == "leader":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot remove team leader")

    db.delete(membership)
    db.query(PersohubEventInvite).filter(
        PersohubEventInvite.event_id == event.id,
        PersohubEventInvite.team_id == team.id,
        PersohubEventInvite.invited_user_id == int(member_user_id),
    ).delete(synchronize_session=False)
    db.commit()
    return {"message": "Team member removed"}


@router.delete("/persohub/persohub-events/{slug}/team")
def delete_my_team(
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
    if int(team.team_lead_user_id) != int(user.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only team leader can delete team")

    score_rows = db.query(PersohubEventScore).filter(
        PersohubEventScore.event_id == event.id,
        PersohubEventScore.team_id == team.id,
    ).count()
    if score_rows > 0:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Team cannot be deleted after scoring has started")

    db.query(PersohubEventInvite).filter(
        PersohubEventInvite.event_id == event.id,
        PersohubEventInvite.team_id == team.id,
    ).delete(synchronize_session=False)
    delete_badges_for_persohub_event_team(db, event.id, team.id)
    db.query(PersohubEventAttendance).filter(
        PersohubEventAttendance.event_id == event.id,
        PersohubEventAttendance.team_id == team.id,
    ).delete(synchronize_session=False)
    db.query(PersohubEventRoundSubmission).filter(
        PersohubEventRoundSubmission.event_id == event.id,
        PersohubEventRoundSubmission.team_id == team.id,
    ).delete(synchronize_session=False)
    db.query(PersohubEventRoundPanelAssignment).filter(
        PersohubEventRoundPanelAssignment.event_id == event.id,
        PersohubEventRoundPanelAssignment.team_id == team.id,
    ).delete(synchronize_session=False)
    db.query(PersohubEventRegistration).filter(
        PersohubEventRegistration.event_id == event.id,
        PersohubEventRegistration.team_id == team.id,
    ).delete(synchronize_session=False)
    db.query(PersohubEventTeamMember).filter(
        PersohubEventTeamMember.team_id == team.id,
    ).delete(synchronize_session=False)
    db.query(PersohubEventTeam).filter(
        PersohubEventTeam.event_id == event.id,
        PersohubEventTeam.id == team.id,
    ).delete(synchronize_session=False)
    db.commit()
    return {"message": "Team removed"}


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
    registration = None
    if event.participant_mode == PersohubEventParticipantMode.TEAM:
        team = _get_user_team_for_event(db, event.id, user.id)
        if not team:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")
        registration = db.query(PersohubEventRegistration).filter(
            PersohubEventRegistration.event_id == event.id,
            PersohubEventRegistration.team_id == team.id,
            PersohubEventRegistration.entity_type == PersohubEventEntityType.TEAM,
        ).first()
        _ensure_registration_is_active(registration)
        entity_type = PersohubManagedEntityTypeEnum.TEAM
        entity_id = team.id
    else:
        registration = db.query(PersohubEventRegistration).filter(
            PersohubEventRegistration.event_id == event.id,
            PersohubEventRegistration.user_id == user.id,
            PersohubEventRegistration.entity_type == PersohubEventEntityType.USER,
        ).first()
        _ensure_registration_is_active(registration)

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
        _auto_close_event_if_past_grace(db, event)
        key = (event.id, reg.user_id, reg.team_id)
        if key in seen:
            continue
        seen.add(key)

        attendance_count, _ = _resolve_attendance_metrics(
            db,
            event.id,
            user_id=reg.user_id,
            team_id=reg.team_id,
        )

        cumulative_score = _registration_effective_cumulative_score(db, event, reg)

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
    registration_status_text = str(
        registration.status.value if hasattr(registration.status, "value") else registration.status or ""
    ).strip().lower()
    eliminated_round_no = int(getattr(registration, "eliminated_round_no", 0) or 0) or None
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
        if registration_status_text == "pending":
            status_label = "Pending"
            is_present = None
        elif not is_revealed:
            status_label = "Pending"
            is_present = None
        elif eliminated_round_no is not None and int(round_row.round_no or 0) >= eliminated_round_no:
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
                "round_id": int(round_row.id),
                "round_name": round_row.name,
                "round_state": state_value,
                "status": status_label,
                "is_present": is_present,
                "requires_submission": bool(round_row.requires_submission),
                "submission_mode": getattr(round_row, "submission_mode", None),
                "submission_deadline": round_row.submission_deadline.isoformat() if round_row.submission_deadline else None,
                "allow_late_submission": bool(getattr(round_row, "allow_late_submission", False)),
                "external_url": str(getattr(round_row, "external_url", "") or "").strip() or None,
                "external_url_name": str(getattr(round_row, "external_url_name", "") or "").strip() or None,
                "round_description": str(getattr(round_row, "description", "") or ""),
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
    badges = get_user_achievements(db, platform="persohub", user_id=user.id, team_ids=team_ids)
    return [
        PersohubManagedAchievement(
            assignment_id=int(assignment.id),
            badge={
                "id": int(badge.id),
                "badge_name": badge.badge_name,
                "image_url": badge.image_url,
                "reveal_video_url": badge.reveal_video_url,
            },
            target={
                "user_id": assignment.user_id,
                "pda_team_id": assignment.pda_team_id,
                "persohub_team_id": assignment.persohub_team_id,
            },
            context={
                "pda_event_id": assignment.pda_event_id,
                "pda_event_slug": None,
                "pda_event_title": None,
                "persohub_event_id": assignment.persohub_event_id,
                "persohub_event_slug": event.slug if event else None,
                "persohub_event_title": event.title if event else None,
            },
            meta=assignment.meta if isinstance(assignment.meta, dict) else {},
        )
        for assignment, badge, event in badges
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

    _, attended = _resolve_attendance_metrics(
        db,
        event.id,
        user_id=registration.user_id,
        team_id=registration.team_id,
    )
    reg_status = str(registration.status.value if hasattr(registration.status, "value") else registration.status or "").strip().lower()
    eligible = bool(event.status == PersohubEventStatus.CLOSED and attended and reg_status == "active")
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
