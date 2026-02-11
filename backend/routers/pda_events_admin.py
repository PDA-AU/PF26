import csv
import io
import re
from collections import Counter
from typing import Dict, List, Optional, Tuple

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, Response, UploadFile, status
from fastapi.responses import StreamingResponse
from openpyxl import Workbook, load_workbook
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from auth import decode_token
from database import get_db
from models import (
    PdaAdmin,
    PdaUser,
    PdaItem,
    PdaEvent,
    PdaEventType,
    PdaEventFormat,
    PdaEventTemplate,
    PdaEventStatus,
    PdaEventParticipantMode,
    PdaEventRoundMode,
    PdaEventEntityType,
    PdaEventRegistration,
    PdaEventRegistrationStatus,
    PdaEventTeam,
    PdaEventTeamMember,
    PdaEventRound,
    PdaEventRoundState,
    PdaEventAttendance,
    PdaEventScore,
    PdaEventBadge,
    PdaEventBadgePlace,
    PdaEventInvite,
    PdaEventLog,
)
from schemas import (
    PdaManagedAttendanceMarkRequest,
    PdaManagedAttendanceScanRequest,
    PdaManagedBadgeCreate,
    PdaManagedBadgeResponse,
    PdaManagedEntityTypeEnum,
    PdaManagedEventCreate,
    PdaManagedEventResponse,
    PdaManagedEventStatusUpdate,
    PdaManagedEventUpdate,
    PdaManagedRoundCreate,
    PdaEventLogResponse,
    PdaManagedRoundResponse,
    PdaManagedRoundUpdate,
    PdaManagedScoreEntry,
    PdaManagedTeamResponse,
)
from security import get_admin_context, require_pda_event_admin, require_superadmin
from utils import log_admin_action, log_pda_event_action

router = APIRouter()


def _slugify(value: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9]+", "-", value.strip().lower()).strip("-")
    return cleaned[:110] if cleaned else "event"


def _next_slug(db: Session, title: str) -> str:
    base = _slugify(title)
    slug = base
    counter = 2
    while db.query(PdaEvent).filter(PdaEvent.slug == slug).first():
        slug = f"{base}-{counter}"
        counter += 1
    return slug


def _next_event_code(db: Session) -> str:
    latest = db.query(PdaEvent).order_by(PdaEvent.id.desc()).first()
    next_id = (latest.id + 1) if latest else 1
    return f"EVT{next_id:03d}"


def _get_event_or_404(db: Session, slug: str) -> PdaEvent:
    event = db.query(PdaEvent).filter(PdaEvent.slug == slug).first()
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    return event


def _ensure_events_policy_shape(policy: Optional[dict]) -> dict:
    safe = dict(policy or {})
    if not isinstance(safe.get("events"), dict):
        safe["events"] = {}
    return safe


def _criteria_def(round_obj: PdaEventRound) -> List[dict]:
    return round_obj.evaluation_criteria or [{"name": "Score", "max_marks": 100}]


def _to_event_type(value) -> PdaEventType:
    return PdaEventType[value.name] if hasattr(value, "name") else PdaEventType(value)


def _to_event_format(value) -> PdaEventFormat:
    return PdaEventFormat[value.name] if hasattr(value, "name") else PdaEventFormat(value)


def _to_event_template(value) -> PdaEventTemplate:
    return PdaEventTemplate[value.name] if hasattr(value, "name") else PdaEventTemplate(value)


def _to_participant_mode(value) -> PdaEventParticipantMode:
    return PdaEventParticipantMode[value.name] if hasattr(value, "name") else PdaEventParticipantMode(value)


def _to_round_mode(value) -> PdaEventRoundMode:
    return PdaEventRoundMode[value.name] if hasattr(value, "name") else PdaEventRoundMode(value)


def _to_event_status(value) -> PdaEventStatus:
    return PdaEventStatus[value.name] if hasattr(value, "name") else PdaEventStatus(value)


def _to_round_state(value) -> PdaEventRoundState:
    return PdaEventRoundState[value.name] if hasattr(value, "name") else PdaEventRoundState(value)


def _validate_event_dates(start_date, end_date) -> None:
    if start_date and end_date and start_date > end_date:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="start_date cannot be after end_date")


def _managed_event_home_link(slug: str) -> str:
    return f"/events/{slug}"


def _find_managed_home_item(db: Session, slug: str) -> Optional[PdaItem]:
    link = _managed_event_home_link(slug)
    return (
        db.query(PdaItem)
        .filter(
            PdaItem.type == "event",
            PdaItem.hero_url == link,
        )
        .first()
    )


def _sync_managed_event_to_home_item(db: Session, event: PdaEvent) -> None:
    item = _find_managed_home_item(db, event.slug)
    if not item:
        item = PdaItem(type="event")
        db.add(item)

    item.title = event.title
    item.description = event.description
    item.poster_url = event.poster_url
    item.start_date = event.start_date
    item.end_date = event.end_date
    item.format = event.format.value if hasattr(event.format, "value") else str(event.format)
    item.hero_url = _managed_event_home_link(event.slug)
    item.hero_caption = item.hero_caption or event.description
    item.tag = item.tag or "managed-event"


def _delete_managed_home_item(db: Session, slug: str) -> None:
    item = _find_managed_home_item(db, slug)
    if item:
        db.delete(item)


def _entity_from_payload(event: PdaEvent, row: dict) -> Tuple[PdaEventEntityType, Optional[int], Optional[int]]:
    if event.participant_mode == PdaEventParticipantMode.INDIVIDUAL:
        user_id = row.get("user_id")
        if not user_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="user_id is required for individual event")
        return PdaEventEntityType.USER, int(user_id), None
    team_id = row.get("team_id")
    if not team_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="team_id is required for team event")
    return PdaEventEntityType.TEAM, None, int(team_id)


def _batch_from_regno(regno: str) -> Optional[str]:
    value = str(regno or "").strip()
    if len(value) < 4 or not value[:4].isdigit():
        return None
    return value[:4]


def _registration_status_label(value) -> str:
    if hasattr(value, "value"):
        return str(value.value)
    raw = str(value or "").strip().upper()
    return "Eliminated" if "ELIMINATED" in raw else "Active"


def _status_is_active(value) -> bool:
    return str(value or "").strip().lower() == "active"


def _log_event_admin_action(
    db: Session,
    admin: PdaUser,
    event: PdaEvent,
    action: str,
    method: str,
    path: str,
    meta: Optional[dict] = None,
):
    log_admin_action(db, admin, action, method=method, path=path, meta=meta)
    log_pda_event_action(
        db=db,
        event_slug=event.slug,
        admin=admin,
        action=action,
        event_id=event.id,
        method=method,
        path=path,
        meta=meta,
    )


def _registered_entities(db: Session, event: PdaEvent):
    if event.participant_mode == PdaEventParticipantMode.INDIVIDUAL:
        query = (
            db.query(PdaEventRegistration, PdaUser)
            .join(PdaUser, PdaEventRegistration.user_id == PdaUser.id)
            .filter(
                PdaEventRegistration.event_id == event.id,
                PdaEventRegistration.entity_type == PdaEventEntityType.USER,
                PdaEventRegistration.user_id.isnot(None),
            )
        )
        rows = query.all()
        payload = []
        for reg, user in rows:
            payload.append(
                {
                    "entity_type": "user",
                    "entity_id": user.id,
                    "participant_id": user.id,
                    "name": user.name,
                    "participant_name": user.name,
                    "regno_or_code": user.regno,
                    "register_number": user.regno,
                    "participant_register_number": user.regno,
                    "email": user.email,
                    "department": user.dept,
                    "gender": user.gender,
                    "batch": _batch_from_regno(user.regno),
                    "profile_picture": user.image_url,
                    "status": _registration_status_label(reg.status),
                    "participant_status": _registration_status_label(reg.status),
                    "referral_code": reg.referral_code,
                    "referred_by": reg.referred_by,
                    "referral_count": int(reg.referral_count or 0),
                }
            )
        return payload
    rows = (
        db.query(PdaEventRegistration, PdaEventTeam)
        .join(PdaEventTeam, PdaEventRegistration.team_id == PdaEventTeam.id)
        .filter(PdaEventRegistration.event_id == event.id, PdaEventRegistration.team_id.isnot(None))
        .all()
    )
    payload = []
    for reg, team in rows:
        members_count = db.query(PdaEventTeamMember).filter(PdaEventTeamMember.team_id == team.id).count()
        payload.append(
            {
                "entity_type": "team",
                "entity_id": team.id,
                "name": team.team_name,
                "regno_or_code": team.team_code,
                "members_count": members_count,
                "status": _registration_status_label(reg.status),
                "participant_status": _registration_status_label(reg.status),
            }
        )
    return payload


@router.get("/pda-admin/events", response_model=List[PdaManagedEventResponse])
def list_managed_events(
    admin_ctx=Depends(get_admin_context),
    db: Session = Depends(get_db),
):
    admin_row = admin_ctx.get("admin_row")
    policy = admin_ctx.get("policy") if isinstance(admin_ctx.get("policy"), dict) else {}
    is_superadmin = bool(admin_ctx.get("is_superadmin"))
    if not is_superadmin and not admin_row:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")

    query = db.query(PdaEvent)
    if not is_superadmin:
        events = policy.get("events") if isinstance(policy.get("events"), dict) else {}
        allowed_slugs = [slug for slug, allowed in events.items() if allowed]
        if not allowed_slugs:
            return []
        query = query.filter(PdaEvent.slug.in_(allowed_slugs))
    events = query.order_by(PdaEvent.created_at.desc()).all()
    return [PdaManagedEventResponse.model_validate(event) for event in events]


@router.post("/pda-admin/events", response_model=PdaManagedEventResponse)
def create_managed_event(
    payload: PdaManagedEventCreate,
    admin: PdaUser = Depends(require_superadmin),
    db: Session = Depends(get_db),
):
    _validate_event_dates(payload.start_date, payload.end_date)

    if payload.participant_mode.value == "team":
        if payload.team_min_size is None or payload.team_max_size is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="team_min_size and team_max_size are required for team events")
        if payload.team_min_size > payload.team_max_size:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="team_min_size cannot exceed team_max_size")
    else:
        payload.team_min_size = None
        payload.team_max_size = None

    round_count = payload.round_count
    if payload.round_mode == PdaEventRoundMode.SINGLE:
        round_count = 1

    new_event = PdaEvent(
        slug=_next_slug(db, payload.title),
        event_code=_next_event_code(db),
        club_id=payload.club_id,
        title=payload.title.strip(),
        description=payload.description,
        start_date=payload.start_date,
        end_date=payload.end_date,
        poster_url=payload.poster_url,
        whatsapp_url=payload.whatsapp_url,
        event_type=_to_event_type(payload.event_type),
        format=_to_event_format(payload.format),
        template_option=_to_event_template(payload.template_option),
        participant_mode=_to_participant_mode(payload.participant_mode),
        round_mode=_to_round_mode(payload.round_mode),
        round_count=round_count,
        team_min_size=payload.team_min_size,
        team_max_size=payload.team_max_size,
        status=PdaEventStatus.CLOSED,
    )
    db.add(new_event)
    db.flush()

    # Auto-provision rounds for single/multi round events.
    for round_no in range(1, round_count + 1):
        db.add(
            PdaEventRound(
                event_id=new_event.id,
                round_no=round_no,
                name=f"Round {round_no}",
                mode=new_event.format,
                state=PdaEventRoundState.DRAFT,
                evaluation_criteria=[{"name": "Score", "max_marks": 100}],
            )
        )

    _sync_managed_event_to_home_item(db, new_event)

    # Add dynamic event policy key for all admins.
    admin_rows = db.query(PdaAdmin).all()
    for row in admin_rows:
        policy = _ensure_events_policy_shape(row.policy)
        if row.policy and row.policy.get("superAdmin"):
            policy["events"][new_event.slug] = True
        else:
            policy["events"][new_event.slug] = bool(policy["events"].get(new_event.slug, False))
        row.policy = policy

    db.commit()
    db.refresh(new_event)
    _log_event_admin_action(
        db,
        admin,
        new_event,
        "create_pda_managed_event",
        method="POST",
        path="/pda-admin/events",
        meta={"slug": new_event.slug, "event_id": new_event.id},
    )
    return PdaManagedEventResponse.model_validate(new_event)


@router.put("/pda-admin/events/{slug}", response_model=PdaManagedEventResponse)
def update_managed_event(
    slug: str,
    payload: PdaManagedEventUpdate,
    admin: PdaUser = Depends(require_superadmin),
    db: Session = Depends(get_db),
):
    event = _get_event_or_404(db, slug)
    updates = payload.model_dump(exclude_unset=True)
    next_start_date = updates.get("start_date", event.start_date)
    next_end_date = updates.get("end_date", event.end_date)
    _validate_event_dates(next_start_date, next_end_date)
    if "participant_mode" in updates and updates["participant_mode"] == PdaEventParticipantMode.TEAM:
        min_size = updates.get("team_min_size", event.team_min_size)
        max_size = updates.get("team_max_size", event.team_max_size)
        if min_size is None or max_size is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="team_min_size and team_max_size are required for team events")
        if min_size > max_size:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="team_min_size cannot exceed team_max_size")

    if "round_mode" in updates and updates["round_mode"] == PdaEventRoundMode.SINGLE:
        updates["round_count"] = 1

    if "event_type" in updates:
        updates["event_type"] = _to_event_type(payload.event_type)
    if "format" in updates:
        updates["format"] = _to_event_format(payload.format)
    if "template_option" in updates:
        updates["template_option"] = _to_event_template(payload.template_option)
    if "participant_mode" in updates:
        updates["participant_mode"] = _to_participant_mode(payload.participant_mode)
    if "round_mode" in updates:
        updates["round_mode"] = _to_round_mode(payload.round_mode)
    if "status" in updates:
        updates["status"] = _to_event_status(payload.status)

    for field, value in updates.items():
        setattr(event, field, value)

    _sync_managed_event_to_home_item(db, event)

    db.commit()
    db.refresh(event)
    _log_event_admin_action(
        db,
        admin,
        event,
        "update_pda_managed_event",
        method="PUT",
        path=f"/pda-admin/events/{slug}",
        meta={"slug": slug},
    )
    return PdaManagedEventResponse.model_validate(event)


@router.delete("/pda-admin/events/{slug}")
def delete_managed_event(
    slug: str,
    admin: PdaUser = Depends(require_superadmin),
    db: Session = Depends(get_db),
):
    event = _get_event_or_404(db, slug)
    event_id = int(event.id)
    event_slug = str(event.slug)

    team_ids = [
        int(row[0])
        for row in db.query(PdaEventTeam.id).filter(PdaEventTeam.event_id == event_id).all()
    ]
    round_ids = [
        int(row[0])
        for row in db.query(PdaEventRound.id).filter(PdaEventRound.event_id == event_id).all()
    ]

    if team_ids:
        db.query(PdaEventInvite).filter(PdaEventInvite.team_id.in_(team_ids)).delete(synchronize_session=False)
        db.query(PdaEventBadge).filter(PdaEventBadge.team_id.in_(team_ids)).delete(synchronize_session=False)
        db.query(PdaEventScore).filter(PdaEventScore.team_id.in_(team_ids)).delete(synchronize_session=False)
        db.query(PdaEventAttendance).filter(PdaEventAttendance.team_id.in_(team_ids)).delete(synchronize_session=False)
        db.query(PdaEventRegistration).filter(PdaEventRegistration.team_id.in_(team_ids)).delete(synchronize_session=False)
        db.query(PdaEventTeamMember).filter(PdaEventTeamMember.team_id.in_(team_ids)).delete(synchronize_session=False)

    if round_ids:
        db.query(PdaEventScore).filter(PdaEventScore.round_id.in_(round_ids)).delete(synchronize_session=False)
        db.query(PdaEventAttendance).filter(PdaEventAttendance.round_id.in_(round_ids)).delete(synchronize_session=False)

    db.query(PdaEventInvite).filter(PdaEventInvite.event_id == event_id).delete(synchronize_session=False)
    db.query(PdaEventBadge).filter(PdaEventBadge.event_id == event_id).delete(synchronize_session=False)
    db.query(PdaEventScore).filter(PdaEventScore.event_id == event_id).delete(synchronize_session=False)
    db.query(PdaEventAttendance).filter(PdaEventAttendance.event_id == event_id).delete(synchronize_session=False)
    db.query(PdaEventRegistration).filter(PdaEventRegistration.event_id == event_id).delete(synchronize_session=False)
    db.query(PdaEventTeamMember).filter(
        PdaEventTeamMember.team_id.in_(
            db.query(PdaEventTeam.id).filter(PdaEventTeam.event_id == event_id)
        )
    ).delete(synchronize_session=False)
    db.query(PdaEventTeam).filter(PdaEventTeam.event_id == event_id).delete(synchronize_session=False)
    db.query(PdaEventRound).filter(PdaEventRound.event_id == event_id).delete(synchronize_session=False)
    db.query(PdaEventLog).filter(
        (PdaEventLog.event_id == event_id) | (PdaEventLog.event_slug == event_slug)
    ).delete(synchronize_session=False)

    admin_rows = db.query(PdaAdmin).all()
    for row in admin_rows:
        policy = _ensure_events_policy_shape(row.policy)
        if event_slug in policy["events"]:
            del policy["events"][event_slug]
            row.policy = policy

    _delete_managed_home_item(db, event_slug)
    db.delete(event)
    db.commit()

    log_admin_action(
        db,
        admin,
        "delete_pda_managed_event",
        method="DELETE",
        path=f"/pda-admin/events/{event_slug}",
        meta={"slug": event_slug, "event_id": event_id},
    )
    return {"message": "Event deleted"}


@router.put("/pda-admin/events/{slug}/status", response_model=PdaManagedEventResponse)
def update_managed_event_status(
    slug: str,
    payload: PdaManagedEventStatusUpdate,
    admin: PdaUser = Depends(require_pda_event_admin),
    db: Session = Depends(get_db),
):
    event = _get_event_or_404(db, slug)
    event.status = _to_event_status(payload.status)
    db.commit()
    db.refresh(event)
    _log_event_admin_action(
        db,
        admin,
        event,
        "update_pda_managed_event_status",
        method="PUT",
        path=f"/pda-admin/events/{slug}/status",
        meta={"slug": slug, "status": payload.status.value},
    )
    return PdaManagedEventResponse.model_validate(event)


@router.get("/pda-admin/events/{slug}/dashboard")
def event_dashboard(
    slug: str,
    _: PdaUser = Depends(require_pda_event_admin),
    db: Session = Depends(get_db),
):
    event = _get_event_or_404(db, slug)
    registrations = db.query(PdaEventRegistration).filter(PdaEventRegistration.event_id == event.id).count()
    round_rows = db.query(PdaEventRound).filter(PdaEventRound.event_id == event.id).order_by(PdaEventRound.round_no.asc()).all()
    rounds = len(round_rows)
    attendance_present = db.query(PdaEventAttendance).filter(
        PdaEventAttendance.event_id == event.id,
        PdaEventAttendance.is_present == True,  # noqa: E712
    ).count()
    scores = db.query(PdaEventScore).filter(PdaEventScore.event_id == event.id).count()
    badges = db.query(PdaEventBadge).filter(PdaEventBadge.event_id == event.id).count()
    active_count = db.query(PdaEventRegistration).filter(
        PdaEventRegistration.event_id == event.id,
        PdaEventRegistration.status == PdaEventRegistrationStatus.ACTIVE,
    ).count()
    eliminated_count = db.query(PdaEventRegistration).filter(
        PdaEventRegistration.event_id == event.id,
        PdaEventRegistration.status == PdaEventRegistrationStatus.ELIMINATED,
    ).count()
    rounds_completed = sum(1 for row in round_rows if row.state in {PdaEventRoundState.COMPLETED, PdaEventRoundState.REVEAL})
    current_active = next((row for row in round_rows if row.state == PdaEventRoundState.ACTIVE), None)

    department_distribution: Dict[str, int] = {}
    gender_distribution: Dict[str, int] = {}
    batch_distribution: Dict[str, int] = {}
    leaderboard_scores: List[float] = []
    entities = _registered_entities(db, event)
    active_entities = [item for item in entities if _status_is_active(item.get("status"))]

    if event.participant_mode == PdaEventParticipantMode.INDIVIDUAL:
        dept_counter = Counter(str(item.get("department") or "").strip() for item in entities if str(item.get("department") or "").strip())
        gender_counter = Counter(str(item.get("gender") or "").strip() for item in entities if str(item.get("gender") or "").strip())
        batch_counter = Counter(str(item.get("batch") or "").strip() for item in entities if str(item.get("batch") or "").strip())
        department_distribution = dict(dept_counter)
        gender_distribution = dict(gender_counter)
        batch_distribution = dict(batch_counter)

        score_rows = db.execute(
            text(
                """
                SELECT user_id, COALESCE(SUM(normalized_score), 0) AS total
                FROM pda_event_scores
                WHERE event_id = :event_id
                  AND entity_type = 'USER'
                  AND user_id IS NOT NULL
                GROUP BY user_id
                """
            ),
            {"event_id": event.id},
        ).mappings().all()
        score_map = {int(row["user_id"]): float(row["total"] or 0.0) for row in score_rows}
        leaderboard_scores = [float(score_map.get(int(item["entity_id"]), 0.0)) for item in active_entities]
    else:
        score_rows = db.execute(
            text(
                """
                SELECT team_id, COALESCE(SUM(total_score), 0) AS total
                FROM pda_event_scores
                WHERE event_id = :event_id
                  AND entity_type = 'TEAM'
                  AND team_id IS NOT NULL
                GROUP BY team_id
                """
            ),
            {"event_id": event.id},
        ).mappings().all()
        score_map = {int(row["team_id"]): float(row["total"] or 0.0) for row in score_rows}
        leaderboard_scores = [float(score_map.get(int(item["entity_id"]), 0.0)) for item in active_entities]

    leaderboard_min_score = min(leaderboard_scores) if leaderboard_scores else None
    leaderboard_max_score = max(leaderboard_scores) if leaderboard_scores else None
    leaderboard_avg_score = (sum(leaderboard_scores) / len(leaderboard_scores)) if leaderboard_scores else None

    return {
        "event": PdaManagedEventResponse.model_validate(event),
        "registrations": registrations,
        "rounds": rounds,
        "attendance_present": attendance_present,
        "score_rows": scores,
        "badges": badges,
        "active_count": active_count,
        "eliminated_count": eliminated_count,
        "rounds_completed": rounds_completed,
        "current_active_round": (
            {
                "round_id": current_active.id,
                "round_no": int(current_active.round_no),
                "name": current_active.name,
            }
            if current_active
            else None
        ),
        "department_distribution": department_distribution,
        "gender_distribution": gender_distribution,
        "batch_distribution": batch_distribution,
        "leaderboard_min_score": leaderboard_min_score,
        "leaderboard_max_score": leaderboard_max_score,
        "leaderboard_avg_score": leaderboard_avg_score,
    }


@router.get("/pda-admin/events/{slug}/participants")
def event_participants(
    slug: str,
    search: Optional[str] = None,
    department: Optional[str] = None,
    gender: Optional[str] = None,
    batch: Optional[str] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    response: Response = None,
    _: PdaUser = Depends(require_pda_event_admin),
    db: Session = Depends(get_db),
):
    event = _get_event_or_404(db, slug)
    items = _registered_entities(db, event)
    if event.participant_mode == PdaEventParticipantMode.INDIVIDUAL:
        if department:
            items = [item for item in items if str(item.get("department") or "") == str(department)]
        if gender:
            items = [item for item in items if str(item.get("gender") or "") == str(gender)]
        if batch:
            items = [item for item in items if str(item.get("batch") or "") == str(batch)]
    if status_filter:
        normalized = str(status_filter or "").strip().lower()
        items = [item for item in items if str(item.get("status") or "").strip().lower() == normalized]
    if search:
        needle = search.lower()
        filtered = []
        for item in items:
            haystack = " ".join(
                [
                    str(item.get("name") or ""),
                    str(item.get("regno_or_code") or ""),
                    str(item.get("email") or ""),
                    str(item.get("department") or ""),
                    str(item.get("gender") or ""),
                    str(item.get("batch") or ""),
                ]
            ).lower()
            if needle in haystack:
                filtered.append(item)
        items = filtered

    total = len(items)
    start = (page - 1) * page_size
    end = start + page_size
    paged = items[start:end]
    if response is not None:
        response.headers["X-Total-Count"] = str(total)
        response.headers["X-Page"] = str(page)
        response.headers["X-Page-Size"] = str(page_size)
    return paged


@router.put("/pda-admin/events/{slug}/participants/{user_id}/status")
def update_participant_status(
    slug: str,
    user_id: int,
    status_value: str = Query(..., alias="status"),
    admin: PdaUser = Depends(require_pda_event_admin),
    db: Session = Depends(get_db),
):
    event = _get_event_or_404(db, slug)
    if event.participant_mode != PdaEventParticipantMode.INDIVIDUAL:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Status is only available for individual events")
    normalized = str(status_value or "").strip().lower()
    if normalized not in {"active", "eliminated"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="status must be Active or Eliminated")
    row = db.query(PdaEventRegistration).filter(
        PdaEventRegistration.event_id == event.id,
        PdaEventRegistration.user_id == user_id,
        PdaEventRegistration.entity_type == PdaEventEntityType.USER,
    ).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Participant not found")
    row.status = PdaEventRegistrationStatus.ACTIVE if normalized == "active" else PdaEventRegistrationStatus.ELIMINATED
    db.commit()
    _log_event_admin_action(
        db,
        admin,
        event,
        "update_pda_event_participant_status",
        method="PUT",
        path=f"/pda-admin/events/{slug}/participants/{user_id}/status",
        meta={"user_id": user_id, "status": normalized},
    )
    return {"message": "Status updated"}


@router.get("/pda-admin/events/{slug}/participants/{user_id}/rounds")
def participant_rounds(
    slug: str,
    user_id: int,
    _: PdaUser = Depends(require_pda_event_admin),
    db: Session = Depends(get_db),
):
    event = _get_event_or_404(db, slug)
    entity_type = (
        PdaEventEntityType.USER
        if event.participant_mode == PdaEventParticipantMode.INDIVIDUAL
        else PdaEventEntityType.TEAM
    )
    registration_filters = [
        PdaEventRegistration.event_id == event.id,
        PdaEventRegistration.entity_type == entity_type,
    ]
    if entity_type == PdaEventEntityType.USER:
        registration_filters.append(PdaEventRegistration.user_id == user_id)
    else:
        registration_filters.append(PdaEventRegistration.team_id == user_id)
    registration = db.query(PdaEventRegistration).filter(*registration_filters).first()
    if not registration:
        missing_label = "Participant" if entity_type == PdaEventEntityType.USER else "Team"
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{missing_label} not found")

    rounds = (
        db.query(PdaEventRound)
        .filter(PdaEventRound.event_id == event.id)
        .order_by(PdaEventRound.round_no.asc())
        .all()
    )
    items = []
    for round_row in rounds:
        score_filters = [
            PdaEventScore.event_id == event.id,
            PdaEventScore.round_id == round_row.id,
            PdaEventScore.entity_type == entity_type,
        ]
        if entity_type == PdaEventEntityType.USER:
            score_filters.append(PdaEventScore.user_id == user_id)
        else:
            score_filters.append(PdaEventScore.team_id == user_id)
        score = db.query(PdaEventScore).filter(*score_filters).first()
        rank_map = {}
        ranked_scores = (
            db.query(PdaEventScore)
            .filter(
                PdaEventScore.event_id == event.id,
                PdaEventScore.round_id == round_row.id,
                PdaEventScore.entity_type == entity_type,
                PdaEventScore.is_present == True,  # noqa: E712
            )
            .order_by(
                PdaEventScore.normalized_score.desc(),
                PdaEventScore.user_id.asc() if entity_type == PdaEventEntityType.USER else PdaEventScore.team_id.asc(),
            )
            .all()
        )
        for idx, ranked in enumerate(ranked_scores, start=1):
            ranked_id = int(ranked.user_id) if entity_type == PdaEventEntityType.USER else int(ranked.team_id)
            rank_map[ranked_id] = idx

        if registration.status == PdaEventRegistrationStatus.ELIMINATED:
            status_label = "Eliminated"
        elif score:
            status_label = "Active" if bool(score.is_present) else "Absent"
        else:
            status_label = "Pending"

        items.append(
            {
                "round_id": round_row.id,
                "round_no": f"PF{int(round_row.round_no):02d}",
                "round_name": round_row.name,
                "round_state": round_row.state.value if hasattr(round_row.state, "value") else str(round_row.state),
                "status": status_label,
                "is_present": bool(score.is_present) if score else None,
                "total_score": float(score.total_score) if score else None,
                "normalized_score": float(score.normalized_score) if score else None,
                "round_rank": rank_map.get(user_id),
            }
        )
    return items


@router.get("/pda-admin/events/{slug}/participants/{user_id}/summary")
def participant_summary(
    slug: str,
    user_id: int,
    _: PdaUser = Depends(require_pda_event_admin),
    db: Session = Depends(get_db),
):
    event = _get_event_or_404(db, slug)
    entity_type = (
        PdaEventEntityType.USER
        if event.participant_mode == PdaEventParticipantMode.INDIVIDUAL
        else PdaEventEntityType.TEAM
    )
    registration_filters = [
        PdaEventRegistration.event_id == event.id,
        PdaEventRegistration.entity_type == entity_type,
    ]
    if entity_type == PdaEventEntityType.USER:
        registration_filters.append(PdaEventRegistration.user_id == user_id)
    else:
        registration_filters.append(PdaEventRegistration.team_id == user_id)
    registration = db.query(PdaEventRegistration).filter(*registration_filters).first()
    if not registration:
        missing_label = "Participant" if entity_type == PdaEventEntityType.USER else "Team"
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{missing_label} not found")

    if entity_type == PdaEventEntityType.USER:
        target_total = db.execute(
            text(
                """
                SELECT COALESCE(SUM(normalized_score), 0)
                FROM pda_event_scores
                WHERE event_id = :event_id AND entity_type = 'USER' AND user_id = :user_id
                """
            ),
            {"event_id": event.id, "user_id": user_id},
        ).scalar() or 0.0
    else:
        target_total = db.execute(
            text(
                """
                SELECT COALESCE(SUM(total_score), 0)
                FROM pda_event_scores
                WHERE event_id = :event_id AND entity_type = 'TEAM' AND team_id = :team_id
                """
            ),
            {"event_id": event.id, "team_id": user_id},
        ).scalar() or 0.0

    active_rows = (
        db.query(PdaEventRegistration)
        .filter(
            PdaEventRegistration.event_id == event.id,
            PdaEventRegistration.entity_type == entity_type,
            PdaEventRegistration.status == PdaEventRegistrationStatus.ACTIVE,
        )
        .all()
    )
    totals = []
    for row in active_rows:
        if entity_type == PdaEventEntityType.USER:
            total = db.execute(
                text(
                    """
                    SELECT COALESCE(SUM(normalized_score), 0)
                    FROM pda_event_scores
                    WHERE event_id = :event_id AND entity_type = 'USER' AND user_id = :user_id
                    """
                ),
                {"event_id": event.id, "user_id": row.user_id},
            ).scalar() or 0.0
            entity_id = int(row.user_id)
        else:
            total = db.execute(
                text(
                    """
                    SELECT COALESCE(SUM(total_score), 0)
                    FROM pda_event_scores
                    WHERE event_id = :event_id AND entity_type = 'TEAM' AND team_id = :team_id
                    """
                ),
                {"event_id": event.id, "team_id": row.team_id},
            ).scalar() or 0.0
            entity_id = int(row.team_id)
        totals.append((entity_id, float(total)))
    totals.sort(key=lambda item: (-item[1], item[0]))
    rank = None
    for idx, item in enumerate(totals, start=1):
        if item[0] == user_id:
            rank = idx
            break

    return {
        "participant_id": user_id,
        "overall_rank": rank if registration.status == PdaEventRegistrationStatus.ACTIVE else None,
        "overall_points": float(target_total),
    }


@router.get("/pda-admin/events/{slug}/teams/{team_id}", response_model=PdaManagedTeamResponse)
def team_details(
    slug: str,
    team_id: int,
    _: PdaUser = Depends(require_pda_event_admin),
    db: Session = Depends(get_db),
):
    event = _get_event_or_404(db, slug)
    if event.participant_mode != PdaEventParticipantMode.TEAM:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Team details are only available for team events")
    team = db.query(PdaEventTeam).filter(PdaEventTeam.event_id == event.id, PdaEventTeam.id == team_id).first()
    if not team:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")
    members = (
        db.query(PdaEventTeamMember, PdaUser)
        .join(PdaUser, PdaEventTeamMember.user_id == PdaUser.id)
        .filter(PdaEventTeamMember.team_id == team.id)
        .order_by(PdaEventTeamMember.role.desc(), PdaUser.regno.asc())
        .all()
    )
    return PdaManagedTeamResponse(
        id=team.id,
        event_id=team.event_id,
        team_code=team.team_code,
        team_name=team.team_name,
        team_lead_user_id=team.team_lead_user_id,
        members=[
            {
                "user_id": user.id,
                "regno": user.regno,
                "name": user.name,
                "role": member.role,
            }
            for member, user in members
        ],
    )


@router.delete("/pda-admin/events/{slug}/teams/{team_id}")
def delete_team_with_cascade(
    slug: str,
    team_id: int,
    admin: PdaUser = Depends(require_pda_event_admin),
    db: Session = Depends(get_db),
):
    event = _get_event_or_404(db, slug)
    if event.participant_mode != PdaEventParticipantMode.TEAM:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Team deletion is only available for team events")

    team = db.query(PdaEventTeam).filter(PdaEventTeam.event_id == event.id, PdaEventTeam.id == team_id).first()
    if not team:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")

    team_name = str(team.team_name)
    team_code = str(team.team_code)

    db.query(PdaEventInvite).filter(
        PdaEventInvite.event_id == event.id,
        PdaEventInvite.team_id == team_id,
    ).delete(synchronize_session=False)
    db.query(PdaEventBadge).filter(
        PdaEventBadge.event_id == event.id,
        PdaEventBadge.team_id == team_id,
    ).delete(synchronize_session=False)
    db.query(PdaEventScore).filter(
        PdaEventScore.event_id == event.id,
        PdaEventScore.team_id == team_id,
    ).delete(synchronize_session=False)
    db.query(PdaEventAttendance).filter(
        PdaEventAttendance.event_id == event.id,
        PdaEventAttendance.team_id == team_id,
    ).delete(synchronize_session=False)
    db.query(PdaEventRegistration).filter(
        PdaEventRegistration.event_id == event.id,
        PdaEventRegistration.team_id == team_id,
    ).delete(synchronize_session=False)
    db.query(PdaEventTeamMember).filter(
        PdaEventTeamMember.team_id == team_id
    ).delete(synchronize_session=False)
    db.query(PdaEventTeam).filter(
        PdaEventTeam.event_id == event.id,
        PdaEventTeam.id == team_id,
    ).delete(synchronize_session=False)
    db.commit()

    _log_event_admin_action(
        db,
        admin,
        event,
        "delete_pda_event_team",
        method="DELETE",
        path=f"/pda-admin/events/{slug}/teams/{team_id}",
        meta={"team_id": team_id, "team_code": team_code, "team_name": team_name},
    )
    return {"message": "Team deleted", "team_id": team_id}


@router.get("/pda-admin/events/{slug}/attendance")
def event_attendance(
    slug: str,
    round_id: Optional[int] = None,
    _: PdaUser = Depends(require_pda_event_admin),
    db: Session = Depends(get_db),
):
    event = _get_event_or_404(db, slug)
    entities = _registered_entities(db, event)
    attendance_rows = db.query(PdaEventAttendance).filter(PdaEventAttendance.event_id == event.id)
    if round_id:
        attendance_rows = attendance_rows.filter(PdaEventAttendance.round_id == round_id)
    rows = attendance_rows.all()
    row_map = {}
    for row in rows:
        key = ("user", row.user_id) if row.user_id else ("team", row.team_id)
        row_map[key] = row
    results = []
    for entity in entities:
        key = (entity["entity_type"], entity["entity_id"])
        row = row_map.get(key)
        results.append(
            {
                **entity,
                "attendance_id": row.id if row else None,
                "round_id": row.round_id if row else round_id,
                "is_present": bool(row.is_present) if row else False,
                "marked_at": row.marked_at.isoformat() if row and row.marked_at else None,
            }
        )
    return results


@router.post("/pda-admin/events/{slug}/attendance/mark")
def mark_attendance(
    slug: str,
    payload: PdaManagedAttendanceMarkRequest,
    admin: PdaUser = Depends(require_pda_event_admin),
    db: Session = Depends(get_db),
):
    event = _get_event_or_404(db, slug)
    entity_type = PdaEventEntityType.USER if payload.entity_type.value == "user" else PdaEventEntityType.TEAM
    if entity_type == PdaEventEntityType.USER and not payload.user_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="user_id required for user attendance")
    if entity_type == PdaEventEntityType.TEAM and not payload.team_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="team_id required for team attendance")

    row = db.query(PdaEventAttendance).filter(
        PdaEventAttendance.event_id == event.id,
        PdaEventAttendance.round_id == payload.round_id,
        PdaEventAttendance.entity_type == entity_type,
        PdaEventAttendance.user_id == payload.user_id,
        PdaEventAttendance.team_id == payload.team_id,
    ).first()
    if row:
        row.is_present = payload.is_present
        row.marked_by_user_id = admin.id
    else:
        row = PdaEventAttendance(
            event_id=event.id,
            round_id=payload.round_id,
            entity_type=entity_type,
            user_id=payload.user_id,
            team_id=payload.team_id,
            is_present=payload.is_present,
            marked_by_user_id=admin.id,
        )
        db.add(row)
    db.commit()
    _log_event_admin_action(
        db,
        admin,
        event,
        "mark_pda_event_attendance",
        method="POST",
        path=f"/pda-admin/events/{slug}/attendance/mark",
        meta={
            "entity_type": payload.entity_type.value,
            "user_id": payload.user_id,
            "team_id": payload.team_id,
            "round_id": payload.round_id,
            "is_present": bool(payload.is_present),
        },
    )
    return {"message": "Attendance updated"}


@router.post("/pda-admin/events/{slug}/attendance/scan")
def scan_attendance(
    slug: str,
    payload: PdaManagedAttendanceScanRequest,
    admin: PdaUser = Depends(require_pda_event_admin),
    db: Session = Depends(get_db),
):
    event = _get_event_or_404(db, slug)
    decoded = decode_token(payload.token)
    if decoded.get("qr") != "pda_event_attendance" or decoded.get("event_slug") != event.slug:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid QR token")
    entity_type = decoded.get("entity_type")
    entity_id = int(decoded.get("entity_id"))
    mark_payload = PdaManagedAttendanceMarkRequest(
        entity_type=PdaManagedEntityTypeEnum.USER if entity_type == "user" else PdaManagedEntityTypeEnum.TEAM,
        user_id=entity_id if entity_type == "user" else None,
        team_id=entity_id if entity_type == "team" else None,
        round_id=payload.round_id,
        is_present=True,
    )
    response = mark_attendance(slug=slug, payload=mark_payload, admin=admin, db=db)
    _log_event_admin_action(
        db,
        admin,
        event,
        "scan_pda_event_attendance",
        method="POST",
        path=f"/pda-admin/events/{slug}/attendance/scan",
        meta={"round_id": payload.round_id, "entity_type": entity_type, "entity_id": entity_id},
    )
    return response


@router.get("/pda-admin/events/{slug}/rounds", response_model=List[PdaManagedRoundResponse])
def list_rounds(
    slug: str,
    _: PdaUser = Depends(require_pda_event_admin),
    db: Session = Depends(get_db),
):
    event = _get_event_or_404(db, slug)
    rounds = db.query(PdaEventRound).filter(PdaEventRound.event_id == event.id).order_by(PdaEventRound.round_no.asc()).all()
    return [PdaManagedRoundResponse.model_validate(row) for row in rounds]


@router.post("/pda-admin/events/{slug}/rounds", response_model=PdaManagedRoundResponse)
def create_round(
    slug: str,
    payload: PdaManagedRoundCreate,
    admin: PdaUser = Depends(require_pda_event_admin),
    db: Session = Depends(get_db),
):
    event = _get_event_or_404(db, slug)
    existing = db.query(PdaEventRound).filter(PdaEventRound.event_id == event.id, PdaEventRound.round_no == payload.round_no).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Round already exists")
    round_row = PdaEventRound(
        event_id=event.id,
        round_no=payload.round_no,
        name=payload.name,
        description=payload.description,
        date=payload.date,
        mode=_to_event_format(payload.mode),
        evaluation_criteria=[c.model_dump() for c in payload.evaluation_criteria] if payload.evaluation_criteria else [{"name": "Score", "max_marks": 100}],
    )
    db.add(round_row)
    db.commit()
    db.refresh(round_row)
    _log_event_admin_action(
        db,
        admin,
        event,
        "create_pda_event_round",
        method="POST",
        path=f"/pda-admin/events/{slug}/rounds",
        meta={"round_id": round_row.id},
    )
    return PdaManagedRoundResponse.model_validate(round_row)


@router.put("/pda-admin/events/{slug}/rounds/{round_id}", response_model=PdaManagedRoundResponse)
def update_round(
    slug: str,
    round_id: int,
    payload: PdaManagedRoundUpdate,
    admin: PdaUser = Depends(require_pda_event_admin),
    db: Session = Depends(get_db),
):
    event = _get_event_or_404(db, slug)
    round_row = db.query(PdaEventRound).filter(PdaEventRound.id == round_id, PdaEventRound.event_id == event.id).first()
    if not round_row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Round not found")
    updates = payload.model_dump(exclude_unset=True)
    eliminate_absent = bool(updates.pop("eliminate_absent", False))
    if "mode" in updates:
        updates["mode"] = _to_event_format(payload.mode)
    if "state" in updates:
        updates["state"] = _to_round_state(payload.state)
    if "evaluation_criteria" in updates and payload.evaluation_criteria is not None:
        updates["evaluation_criteria"] = [c.model_dump() for c in payload.evaluation_criteria]
    for field, value in updates.items():
        setattr(round_row, field, value)

    should_apply_shortlisting = (
        round_row.is_frozen
        and round_row.elimination_type
        and round_row.elimination_value is not None
        and (
            "elimination_type" in updates
            or "elimination_value" in updates
            or eliminate_absent
        )
    )
    if should_apply_shortlisting:
        entity_type = PdaEventEntityType.USER if event.participant_mode == PdaEventParticipantMode.INDIVIDUAL else PdaEventEntityType.TEAM
        active_regs = (
            db.query(PdaEventRegistration)
            .filter(
                PdaEventRegistration.event_id == event.id,
                PdaEventRegistration.entity_type == entity_type,
                PdaEventRegistration.status == PdaEventRegistrationStatus.ACTIVE,
            )
            .all()
        )

        score_rows = (
            db.query(PdaEventScore)
            .filter(
                PdaEventScore.event_id == event.id,
                PdaEventScore.round_id == round_row.id,
                PdaEventScore.entity_type == entity_type,
            )
            .all()
        )
        score_map = {}
        for score_row in score_rows:
            score_key = int(score_row.user_id) if entity_type == PdaEventEntityType.USER else int(score_row.team_id)
            score_map[score_key] = score_row

        shortlist_regs = []
        for reg in active_regs:
            reg_entity_id = int(reg.user_id) if entity_type == PdaEventEntityType.USER else int(reg.team_id)
            target_score = score_map.get(reg_entity_id)
            absent = (target_score is None) or (not bool(target_score.is_present))
            if eliminate_absent and absent:
                reg.status = PdaEventRegistrationStatus.ELIMINATED
                continue
            shortlist_regs.append(reg)

        totals = []
        for reg in shortlist_regs:
            entity_id = int(reg.user_id) if entity_type == PdaEventEntityType.USER else int(reg.team_id)
            if entity_type == PdaEventEntityType.USER:
                total = db.execute(
                    text(
                        """
                        SELECT COALESCE(SUM(normalized_score), 0)
                        FROM pda_event_scores
                        WHERE event_id = :event_id AND entity_type = 'USER' AND user_id = :entity_id
                        """
                    ),
                    {"event_id": event.id, "entity_id": entity_id},
                ).scalar() or 0.0
            else:
                total = db.execute(
                    text(
                        """
                        SELECT COALESCE(SUM(total_score), 0)
                        FROM pda_event_scores
                        WHERE event_id = :event_id AND entity_type = 'TEAM' AND team_id = :entity_id
                        """
                    ),
                    {"event_id": event.id, "entity_id": entity_id},
                ).scalar() or 0.0
            totals.append((reg, float(total), entity_id))

        totals.sort(key=lambda item: (-item[1], item[2]))
        elimination_type = str(round_row.elimination_type).strip().lower()
        if elimination_type == "top_k":
            cutoff = max(0, int(round_row.elimination_value))
            for idx, (reg, _, _) in enumerate(totals):
                reg.status = PdaEventRegistrationStatus.ACTIVE if idx < cutoff else PdaEventRegistrationStatus.ELIMINATED
        elif elimination_type == "min_score":
            threshold = float(round_row.elimination_value)
            for reg, score, _ in totals:
                reg.status = PdaEventRegistrationStatus.ACTIVE if score >= threshold else PdaEventRegistrationStatus.ELIMINATED
        else:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid elimination type")

        round_row.state = PdaEventRoundState.COMPLETED
    db.commit()
    db.refresh(round_row)
    _log_event_admin_action(
        db,
        admin,
        event,
        "update_pda_event_round",
        method="PUT",
        path=f"/pda-admin/events/{slug}/rounds/{round_id}",
        meta={
            "round_id": round_id,
            "elimination_type": round_row.elimination_type,
            "elimination_value": round_row.elimination_value,
            "eliminate_absent": eliminate_absent,
        },
    )
    return PdaManagedRoundResponse.model_validate(round_row)


@router.delete("/pda-admin/events/{slug}/rounds/{round_id}")
def delete_round(
    slug: str,
    round_id: int,
    admin: PdaUser = Depends(require_pda_event_admin),
    db: Session = Depends(get_db),
):
    event = _get_event_or_404(db, slug)
    round_row = db.query(PdaEventRound).filter(PdaEventRound.id == round_id, PdaEventRound.event_id == event.id).first()
    if not round_row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Round not found")
    if round_row.state != PdaEventRoundState.DRAFT:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only draft rounds can be deleted")
    db.delete(round_row)
    db.commit()
    _log_event_admin_action(
        db,
        admin,
        event,
        "delete_pda_event_round",
        method="DELETE",
        path=f"/pda-admin/events/{slug}/rounds/{round_id}",
        meta={"round_id": round_id},
    )
    return {"message": "Round deleted"}


@router.get("/pda-admin/events/{slug}/rounds/{round_id}/stats")
def round_stats(
    slug: str,
    round_id: int,
    _: PdaUser = Depends(require_pda_event_admin),
    db: Session = Depends(get_db),
):
    event = _get_event_or_404(db, slug)
    round_row = db.query(PdaEventRound).filter(PdaEventRound.id == round_id, PdaEventRound.event_id == event.id).first()
    if not round_row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Round not found")
    entity_type = PdaEventEntityType.USER if event.participant_mode == PdaEventParticipantMode.INDIVIDUAL else PdaEventEntityType.TEAM

    total_count = db.query(PdaEventRegistration).filter(
        PdaEventRegistration.event_id == event.id,
        PdaEventRegistration.entity_type == entity_type,
    ).count()
    score_rows = (
        db.query(PdaEventScore)
        .filter(
            PdaEventScore.event_id == event.id,
            PdaEventScore.round_id == round_id,
            PdaEventScore.entity_type == entity_type,
        )
        .all()
    )
    present_rows = [row for row in score_rows if bool(row.is_present)]
    present_count = len(present_rows)
    absent_count = max(total_count - present_count, 0)
    present_scores = [float(row.normalized_score or 0.0) for row in present_rows]

    if entity_type == PdaEventEntityType.USER:
        entity_ids = [int(row.user_id) for row in present_rows if row.user_id is not None]
        names = {
            int(user.id): user.name
            for user in db.query(PdaUser).filter(PdaUser.id.in_(entity_ids)).all()
        } if entity_ids else {}
        sortable_rows = sorted(
            present_rows,
            key=lambda row: (-float(row.normalized_score or 0.0), int(row.user_id or 0)),
        )
        top10 = [
            {
                "entity_id": int(row.user_id),
                "name": names.get(int(row.user_id), f"User {int(row.user_id)}"),
                "normalized_score": float(row.normalized_score or 0.0),
            }
            for row in sortable_rows[:10]
            if row.user_id is not None
        ]
    else:
        entity_ids = [int(row.team_id) for row in present_rows if row.team_id is not None]
        names = {
            int(team.id): team.team_name
            for team in db.query(PdaEventTeam).filter(PdaEventTeam.id.in_(entity_ids)).all()
        } if entity_ids else {}
        sortable_rows = sorted(
            present_rows,
            key=lambda row: (-float(row.normalized_score or 0.0), int(row.team_id or 0)),
        )
        top10 = [
            {
                "entity_id": int(row.team_id),
                "name": names.get(int(row.team_id), f"Team {int(row.team_id)}"),
                "normalized_score": float(row.normalized_score or 0.0),
            }
            for row in sortable_rows[:10]
            if row.team_id is not None
        ]

    return {
        "total_count": total_count,
        "present_count": present_count,
        "absent_count": absent_count,
        "min_score": min(present_scores) if present_scores else None,
        "max_score": max(present_scores) if present_scores else None,
        "avg_score": (sum(present_scores) / len(present_scores)) if present_scores else None,
        "top10": top10,
    }


@router.get("/pda-admin/events/{slug}/rounds/{round_id}/participants")
def round_participants(
    slug: str,
    round_id: int,
    search: Optional[str] = None,
    _: PdaUser = Depends(require_pda_event_admin),
    db: Session = Depends(get_db),
):
    event = _get_event_or_404(db, slug)
    round_row = db.query(PdaEventRound).filter(PdaEventRound.id == round_id, PdaEventRound.event_id == event.id).first()
    if not round_row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Round not found")
    entities = _registered_entities(db, event)
    if not (round_row.is_frozen or round_row.state in {PdaEventRoundState.COMPLETED, PdaEventRoundState.REVEAL}):
        entities = [item for item in entities if _status_is_active(item.get("status"))]
    if search:
        needle = str(search).strip().lower()
        entities = [
            item
            for item in entities
            if needle in " ".join(
                [
                    str(item.get("name") or ""),
                    str(item.get("regno_or_code") or ""),
                    str(item.get("email") or ""),
                ]
            ).lower()
        ]
    score_rows = db.query(PdaEventScore).filter(PdaEventScore.event_id == event.id, PdaEventScore.round_id == round_id).all()
    score_map = {}
    for row in score_rows:
        key = ("user", row.user_id) if row.user_id else ("team", row.team_id)
        score_map[key] = row
    result = []
    for entity in entities:
        key = (entity["entity_type"], entity["entity_id"])
        row = score_map.get(key)
        payload = {
            **entity,
            "score_id": row.id if row else None,
            "criteria_scores": row.criteria_scores if row else {},
            "total_score": float(row.total_score or 0.0) if row else 0.0,
            "normalized_score": float(row.normalized_score or 0.0) if row else 0.0,
            "is_present": bool(row.is_present) if row else False,
        }
        if event.participant_mode == PdaEventParticipantMode.INDIVIDUAL:
            payload.setdefault("participant_id", entity["entity_id"])
            payload.setdefault("participant_name", entity.get("name"))
            payload.setdefault("participant_register_number", entity.get("regno_or_code"))
            payload.setdefault("participant_status", entity.get("status"))
        result.append(payload)
    return result


@router.post("/pda-admin/events/{slug}/rounds/{round_id}/scores")
def save_scores(
    slug: str,
    round_id: int,
    entries: List[PdaManagedScoreEntry],
    admin: PdaUser = Depends(require_pda_event_admin),
    db: Session = Depends(get_db),
):
    event = _get_event_or_404(db, slug)
    round_row = db.query(PdaEventRound).filter(PdaEventRound.id == round_id, PdaEventRound.event_id == event.id).first()
    if not round_row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Round not found")
    if round_row.is_frozen:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Round is frozen")

    criteria = _criteria_def(round_row)
    criteria_max = {c["name"]: float(c.get("max_marks", 0) or 0) for c in criteria}
    max_total = sum(criteria_max.values()) if criteria_max else 100

    for entry in entries:
        payload = entry.model_dump()
        entity_type, user_id, team_id = _entity_from_payload(event, payload)
        reg_filter = [
            PdaEventRegistration.event_id == event.id,
            PdaEventRegistration.entity_type == entity_type,
        ]
        if entity_type == PdaEventEntityType.USER:
            reg_filter.append(PdaEventRegistration.user_id == user_id)
        else:
            reg_filter.append(PdaEventRegistration.team_id == team_id)
        reg_row = db.query(PdaEventRegistration).filter(*reg_filter).first()
        if not reg_row:
            label = "user_id" if entity_type == PdaEventEntityType.USER else "team_id"
            value = user_id if entity_type == PdaEventEntityType.USER else team_id
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Registration not found for {label}={value}")
        if reg_row.status == PdaEventRegistrationStatus.ELIMINATED:
            label = "User" if entity_type == PdaEventEntityType.USER else "Team"
            value = user_id if entity_type == PdaEventEntityType.USER else team_id
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"{label} {value} is eliminated")
        score_row = db.query(PdaEventScore).filter(
            PdaEventScore.event_id == event.id,
            PdaEventScore.round_id == round_id,
            PdaEventScore.entity_type == entity_type,
            PdaEventScore.user_id == user_id,
            PdaEventScore.team_id == team_id,
        ).first()

        if not entry.is_present:
            safe_scores = {name: 0.0 for name in criteria_max.keys()}
            total = 0.0
            normalized = 0.0
        else:
            safe_scores = {}
            for name, max_marks in criteria_max.items():
                value = float((entry.criteria_scores or {}).get(name, 0.0))
                if value < 0 or value > max_marks:
                    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Score for {name} must be between 0 and {max_marks}")
                safe_scores[name] = value
            total = float(sum(safe_scores.values()))
            normalized = float((total / max_total * 100) if max_total > 0 else 0.0)

        if score_row:
            score_row.criteria_scores = safe_scores
            score_row.total_score = total
            score_row.normalized_score = normalized
            score_row.is_present = bool(entry.is_present)
        else:
            db.add(
                PdaEventScore(
                    event_id=event.id,
                    round_id=round_id,
                    entity_type=entity_type,
                    user_id=user_id,
                    team_id=team_id,
                    criteria_scores=safe_scores,
                    total_score=total,
                    normalized_score=normalized,
                    is_present=bool(entry.is_present),
                )
            )
    db.commit()
    _log_event_admin_action(
        db,
        admin,
        event,
        "save_pda_event_scores",
        method="POST",
        path=f"/pda-admin/events/{slug}/rounds/{round_id}/scores",
        meta={"count": len(entries)},
    )
    return {"message": "Scores saved"}


@router.post("/pda-admin/events/{slug}/rounds/{round_id}/import-scores")
def import_scores(
    slug: str,
    round_id: int,
    file: UploadFile = File(...),
    admin: PdaUser = Depends(require_pda_event_admin),
    db: Session = Depends(get_db),
):
    event = _get_event_or_404(db, slug)
    round_row = db.query(PdaEventRound).filter(PdaEventRound.id == round_id, PdaEventRound.event_id == event.id).first()
    if not round_row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Round not found")
    if round_row.is_frozen:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Round is frozen")
    if not file.filename.endswith(".xlsx"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only .xlsx is supported")

    wb = load_workbook(filename=io.BytesIO(file.file.read()))
    ws = wb.active
    headers = [str(cell.value or "").strip() for cell in ws[1]]
    headers_norm = {h.lower(): idx for idx, h in enumerate(headers)}
    id_col_name = "register number" if event.participant_mode == PdaEventParticipantMode.INDIVIDUAL else "team code"
    if id_col_name not in headers_norm:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Missing '{id_col_name}' column")

    criteria = _criteria_def(round_row)
    criteria_max = {c["name"]: float(c.get("max_marks", 0) or 0) for c in criteria}
    max_total = sum(criteria_max.values()) if criteria_max else 100

    imported = 0
    errors = []
    for row_idx, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
        values = [row[idx] if idx < len(row) else None for idx in range(len(headers))]
        raw_identifier = values[headers_norm[id_col_name]]
        identifier = str(raw_identifier or "").strip().upper()
        if not identifier:
            continue

        user_id = None
        team_id = None
        entity_type = PdaEventEntityType.USER
        if event.participant_mode == PdaEventParticipantMode.INDIVIDUAL:
            person = db.query(PdaUser).filter(PdaUser.regno == identifier).first()
            if not person:
                errors.append(f"Row {row_idx}: Register number {identifier} not found")
                continue
            user_id = person.id
            registration_row = db.query(PdaEventRegistration).filter(
                PdaEventRegistration.event_id == event.id,
                PdaEventRegistration.entity_type == PdaEventEntityType.USER,
                PdaEventRegistration.user_id == user_id,
            ).first()
            if not registration_row:
                errors.append(f"Row {row_idx}: Register number {identifier} not registered")
                continue
            if registration_row.status == PdaEventRegistrationStatus.ELIMINATED:
                errors.append(f"Row {row_idx}: Register number {identifier} is eliminated")
                continue
        else:
            team = db.query(PdaEventTeam).filter(PdaEventTeam.event_id == event.id, PdaEventTeam.team_code == identifier).first()
            if not team:
                errors.append(f"Row {row_idx}: Team code {identifier} not found")
                continue
            entity_type = PdaEventEntityType.TEAM
            team_id = team.id
            registration_row = db.query(PdaEventRegistration).filter(
                PdaEventRegistration.event_id == event.id,
                PdaEventRegistration.entity_type == PdaEventEntityType.TEAM,
                PdaEventRegistration.team_id == team_id,
            ).first()
            if not registration_row:
                errors.append(f"Row {row_idx}: Team code {identifier} not registered")
                continue
            if registration_row.status == PdaEventRegistrationStatus.ELIMINATED:
                errors.append(f"Row {row_idx}: Team code {identifier} is eliminated")
                continue

        present_idx = headers_norm.get("present")
        present_val = str(values[present_idx] if present_idx is not None else "Yes").strip().lower()
        is_present = present_val in {"yes", "y", "1", "true", "present"}

        scores = {}
        if is_present:
            invalid = False
            for name, max_marks in criteria_max.items():
                idx = headers_norm.get(name.lower())
                raw = values[idx] if idx is not None else 0
                try:
                    score = float(raw or 0)
                except Exception:
                    errors.append(f"Row {row_idx}: Invalid score for {name}")
                    invalid = True
                    break
                if score < 0 or score > max_marks:
                    errors.append(f"Row {row_idx}: {name} must be between 0 and {max_marks}")
                    invalid = True
                    break
                scores[name] = score
            if invalid:
                continue
        else:
            scores = {name: 0.0 for name in criteria_max.keys()}

        total = float(sum(scores.values())) if is_present else 0.0
        normalized = float((total / max_total * 100) if max_total > 0 and is_present else 0.0)
        existing = db.query(PdaEventScore).filter(
            PdaEventScore.event_id == event.id,
            PdaEventScore.round_id == round_id,
            PdaEventScore.entity_type == entity_type,
            PdaEventScore.user_id == user_id,
            PdaEventScore.team_id == team_id,
        ).first()
        if existing:
            existing.criteria_scores = scores
            existing.total_score = total
            existing.normalized_score = normalized
            existing.is_present = is_present
        else:
            db.add(
                PdaEventScore(
                    event_id=event.id,
                    round_id=round_id,
                    entity_type=entity_type,
                    user_id=user_id,
                    team_id=team_id,
                    criteria_scores=scores,
                    total_score=total,
                    normalized_score=normalized,
                    is_present=is_present,
                )
            )
        imported += 1

    db.commit()
    _log_event_admin_action(
        db,
        admin,
        event,
        "import_pda_event_scores",
        method="POST",
        path=f"/pda-admin/events/{slug}/rounds/{round_id}/import-scores",
        meta={"imported": imported, "errors": len(errors)},
    )
    return {"imported": imported, "errors": errors[:20]}


@router.get("/pda-admin/events/{slug}/rounds/{round_id}/score-template")
def score_template(
    slug: str,
    round_id: int,
    _: PdaUser = Depends(require_pda_event_admin),
    db: Session = Depends(get_db),
):
    event = _get_event_or_404(db, slug)
    round_row = db.query(PdaEventRound).filter(PdaEventRound.id == round_id, PdaEventRound.event_id == event.id).first()
    if not round_row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Round not found")
    criteria = _criteria_def(round_row)
    criteria_names = [c["name"] for c in criteria]

    wb = Workbook()
    ws = wb.active
    ws.title = f"{event.event_code}-R{round_row.round_no}"
    id_col = "Register Number" if event.participant_mode == PdaEventParticipantMode.INDIVIDUAL else "Team Code"
    name_col = "Name" if event.participant_mode == PdaEventParticipantMode.INDIVIDUAL else "Team Name"
    ws.append([id_col, name_col, "Present"] + criteria_names)
    for entity in _registered_entities(db, event):
        ws.append([entity["regno_or_code"], entity["name"], "Yes"] + [0] * len(criteria_names))

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    filename = f"{event.event_code}_round_{round_row.round_no}_template.xlsx"
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.post("/pda-admin/events/{slug}/rounds/{round_id}/freeze")
def freeze_round(
    slug: str,
    round_id: int,
    admin: PdaUser = Depends(require_pda_event_admin),
    db: Session = Depends(get_db),
):
    event = _get_event_or_404(db, slug)
    round_row = db.query(PdaEventRound).filter(PdaEventRound.id == round_id, PdaEventRound.event_id == event.id).first()
    if not round_row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Round not found")
    criteria = _criteria_def(round_row)
    zero_scores = {c["name"]: 0.0 for c in criteria}
    entities = _registered_entities(db, event)
    entities = [item for item in entities if _status_is_active(item.get("status"))]
    for entity in entities:
        entity_type = PdaEventEntityType.USER if entity["entity_type"] == "user" else PdaEventEntityType.TEAM
        user_id = entity["entity_id"] if entity_type == PdaEventEntityType.USER else None
        team_id = entity["entity_id"] if entity_type == PdaEventEntityType.TEAM else None
        existing = db.query(PdaEventScore).filter(
            PdaEventScore.event_id == event.id,
            PdaEventScore.round_id == round_id,
            PdaEventScore.entity_type == entity_type,
            PdaEventScore.user_id == user_id,
            PdaEventScore.team_id == team_id,
        ).first()
        if not existing:
            db.add(
                PdaEventScore(
                    event_id=event.id,
                    round_id=round_id,
                    entity_type=entity_type,
                    user_id=user_id,
                    team_id=team_id,
                    criteria_scores=zero_scores,
                    total_score=0.0,
                    normalized_score=0.0,
                    is_present=False,
                )
            )
    round_row.is_frozen = True
    db.commit()
    _log_event_admin_action(
        db,
        admin,
        event,
        "freeze_pda_event_round",
        method="POST",
        path=f"/pda-admin/events/{slug}/rounds/{round_id}/freeze",
        meta={"round_id": round_id},
    )
    return {"message": "Round frozen"}


@router.post("/pda-admin/events/{slug}/rounds/{round_id}/unfreeze")
def unfreeze_round(
    slug: str,
    round_id: int,
    admin: PdaUser = Depends(require_pda_event_admin),
    db: Session = Depends(get_db),
):
    event = _get_event_or_404(db, slug)
    round_row = db.query(PdaEventRound).filter(PdaEventRound.id == round_id, PdaEventRound.event_id == event.id).first()
    if not round_row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Round not found")
    round_row.is_frozen = False
    round_row.state = PdaEventRoundState.ACTIVE
    db.commit()
    _log_event_admin_action(
        db,
        admin,
        event,
        "unfreeze_pda_event_round",
        method="POST",
        path=f"/pda-admin/events/{slug}/rounds/{round_id}/unfreeze",
        meta={"round_id": round_id},
    )
    return {"message": "Round unfrozen"}


@router.get("/pda-admin/events/{slug}/leaderboard")
def event_leaderboard(
    slug: str,
    department: Optional[str] = None,
    gender: Optional[str] = None,
    batch: Optional[str] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    response: Response = None,
    _: PdaUser = Depends(require_pda_event_admin),
    db: Session = Depends(get_db),
):
    event = _get_event_or_404(db, slug)
    rows = []

    if event.participant_mode == PdaEventParticipantMode.INDIVIDUAL:
        entities = _registered_entities(db, event)
        if department:
            entities = [item for item in entities if str(item.get("department") or "") == str(department)]
        if gender:
            entities = [item for item in entities if str(item.get("gender") or "") == str(gender)]
        if batch:
            entities = [item for item in entities if str(item.get("batch") or "") == str(batch)]
        if status_filter:
            normalized = str(status_filter or "").strip().lower()
            entities = [item for item in entities if str(item.get("status") or "").strip().lower() == normalized]
        if search:
            needle = str(search).lower()
            entities = [
                item for item in entities
                if needle in " ".join(
                    [
                        str(item.get("name") or ""),
                        str(item.get("regno_or_code") or ""),
                        str(item.get("email") or ""),
                        str(item.get("department") or ""),
                        str(item.get("gender") or ""),
                        str(item.get("batch") or ""),
                    ]
                ).lower()
            ]

        for entity in entities:
            user_id = int(entity["entity_id"])
            score = db.execute(
                text("SELECT COALESCE(SUM(normalized_score), 0) FROM pda_event_scores WHERE event_id = :event_id AND entity_type = 'USER' AND user_id = :user_id"),
                {"event_id": event.id, "user_id": user_id},
            ).fetchone()
            attendance = db.execute(
                text("SELECT COALESCE(COUNT(*), 0) FROM pda_event_attendance WHERE event_id = :event_id AND entity_type = 'USER' AND user_id = :user_id AND is_present = true"),
                {"event_id": event.id, "user_id": user_id},
            ).fetchone()
            rounds_participated = db.execute(
                text(
                    """
                    SELECT COALESCE(COUNT(DISTINCT round_id), 0)
                    FROM pda_event_scores
                    WHERE event_id = :event_id
                      AND entity_type = 'USER'
                      AND user_id = :user_id
                      AND is_present = true
                    """
                ),
                {"event_id": event.id, "user_id": user_id},
            ).fetchone()
            rows.append(
                {
                    **entity,
                    "participant_id": user_id,
                    "register_number": entity.get("regno_or_code"),
                    "cumulative_score": float((score[0] if score else 0) or 0),
                    "attendance_count": int((attendance[0] if attendance else 0) or 0),
                    "rounds_participated": int((rounds_participated[0] if rounds_participated else 0) or 0),
                }
            )

        rows.sort(
            key=lambda item: (
                0 if str(item.get("status") or "").lower() == "active" else 1,
                -float(item.get("cumulative_score") or 0),
                str(item.get("name") or "").lower(),
            )
        )
        active_rank = 0
        for row in rows:
            if str(row.get("status") or "").lower() == "active":
                active_rank += 1
                row["rank"] = active_rank
            else:
                row["rank"] = None
    else:
        entities = _registered_entities(db, event)
        if status_filter:
            normalized = str(status_filter or "").strip().lower()
            entities = [item for item in entities if str(item.get("status") or "").strip().lower() == normalized]
        if search:
            needle = str(search).lower()
            entities = [
                item
                for item in entities
                if needle in " ".join(
                    [
                        str(item.get("name") or ""),
                        str(item.get("regno_or_code") or ""),
                        str(item.get("status") or ""),
                    ]
                ).lower()
            ]
        for entity in entities:
            score = db.execute(
                text(
                    """
                    SELECT COALESCE(SUM(total_score), 0)
                    FROM pda_event_scores
                    WHERE event_id = :event_id
                      AND entity_type = 'TEAM'
                      AND team_id = :team_id
                    """
                ),
                {"event_id": event.id, "team_id": entity["entity_id"]},
            ).fetchone()
            attendance = db.execute(
                text(
                    """
                    SELECT COALESCE(COUNT(*), 0)
                    FROM pda_event_attendance
                    WHERE event_id = :event_id
                      AND entity_type = 'TEAM'
                      AND team_id = :team_id
                      AND is_present = true
                    """
                ),
                {"event_id": event.id, "team_id": entity["entity_id"]},
            ).fetchone()
            rounds_participated = db.execute(
                text(
                    """
                    SELECT COALESCE(COUNT(DISTINCT round_id), 0)
                    FROM pda_event_scores
                    WHERE event_id = :event_id
                      AND entity_type = 'TEAM'
                      AND team_id = :team_id
                      AND is_present = true
                    """
                ),
                {"event_id": event.id, "team_id": entity["entity_id"]},
            ).fetchone()
            rows.append(
                {
                    **entity,
                    "cumulative_score": float((score[0] if score else 0) or 0),
                    "attendance_count": int((attendance[0] if attendance else 0) or 0),
                    "rounds_participated": int((rounds_participated[0] if rounds_participated else 0) or 0),
                }
            )
        rows.sort(
            key=lambda item: (
                0 if _status_is_active(item.get("status")) else 1,
                -float(item.get("cumulative_score") or 0),
                str(item.get("name") or "").lower(),
            )
        )
        active_rank = 0
        for row in rows:
            if _status_is_active(row.get("status")):
                active_rank += 1
                row["rank"] = active_rank
            else:
                row["rank"] = None

    total = len(rows)
    start = (page - 1) * page_size
    end = start + page_size
    paged = rows[start:end]
    if response is not None:
        response.headers["X-Total-Count"] = str(total)
        response.headers["X-Page"] = str(page)
        response.headers["X-Page-Size"] = str(page_size)
    return paged


@router.get("/pda-admin/events/{slug}/logs", response_model=List[PdaEventLogResponse])
def event_logs(
    slug: str,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    action: Optional[str] = None,
    method: Optional[str] = None,
    path_contains: Optional[str] = None,
    _: PdaUser = Depends(require_pda_event_admin),
    db: Session = Depends(get_db),
):
    event = _get_event_or_404(db, slug)
    query = db.query(PdaEventLog).filter(PdaEventLog.event_slug == event.slug)
    if action:
        query = query.filter(PdaEventLog.action == str(action).strip())
    if method:
        query = query.filter(func.lower(PdaEventLog.method) == str(method).strip().lower())
    if path_contains:
        query = query.filter(PdaEventLog.path.ilike(f"%{str(path_contains).strip()}%"))
    logs = query.order_by(PdaEventLog.created_at.desc()).offset(offset).limit(limit).all()
    return [PdaEventLogResponse.model_validate(row) for row in logs]


def _export_to_csv(headers: List[str], rows: List[List[object]]) -> bytes:
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(headers)
    writer.writerows(rows)
    return output.getvalue().encode("utf-8")


def _export_to_xlsx(headers: List[str], rows: List[List[object]]) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.append(headers)
    for row in rows:
        ws.append(row)
    out = io.BytesIO()
    wb.save(out)
    out.seek(0)
    return out.read()


@router.get("/pda-admin/events/{slug}/export/participants")
def export_participants(
    slug: str,
    format: str = Query("csv"),
    department: Optional[str] = None,
    gender: Optional[str] = None,
    batch: Optional[str] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    search: Optional[str] = None,
    _: PdaUser = Depends(require_pda_event_admin),
    db: Session = Depends(get_db),
):
    event = _get_event_or_404(db, slug)
    entities = event_participants(
        slug=slug,
        search=search,
        department=department,
        gender=gender,
        batch=batch,
        status_filter=status_filter,
        page=1,
        page_size=100000,
        response=None,
        _=None,
        db=db,
    )
    if event.participant_mode == PdaEventParticipantMode.INDIVIDUAL:
        headers = ["Register Number", "Name", "Email", "Department", "Gender", "Batch", "Status", "Referral Code", "Referred By", "Referral Count"]
        rows = [
            [
                e.get("register_number"),
                e.get("name"),
                e.get("email"),
                e.get("department"),
                e.get("gender"),
                e.get("batch"),
                e.get("status"),
                e.get("referral_code"),
                e.get("referred_by"),
                e.get("referral_count", 0),
            ]
            for e in entities
        ]
    else:
        headers = ["Entity Type", "Name", "Register/Team Code", "Members Count", "Status"]
        rows = [[e["entity_type"], e["name"], e["regno_or_code"], e.get("members_count", 1), e.get("status")] for e in entities]
    if format == "xlsx":
        content = _export_to_xlsx(headers, rows)
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        filename = f"{event.event_code}_participants.xlsx"
    else:
        content = _export_to_csv(headers, rows)
        media_type = "text/csv"
        filename = f"{event.event_code}_participants.csv"
    return StreamingResponse(io.BytesIO(content), media_type=media_type, headers={"Content-Disposition": f"attachment; filename={filename}"})


@router.get("/pda-admin/events/{slug}/export/leaderboard")
def export_leaderboard(
    slug: str,
    format: str = Query("csv"),
    department: Optional[str] = None,
    gender: Optional[str] = None,
    batch: Optional[str] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    search: Optional[str] = None,
    _: PdaUser = Depends(require_pda_event_admin),
    db: Session = Depends(get_db),
):
    leaderboard = event_leaderboard(
        slug=slug,
        department=department,
        gender=gender,
        batch=batch,
        status_filter=status_filter,
        search=search,
        page=1,
        page_size=10000,
        response=None,
        _=None,
        db=db,
    )
    event = _get_event_or_404(db, slug)
    if event.participant_mode == PdaEventParticipantMode.INDIVIDUAL:
        headers = ["Rank", "Register Number", "Name", "Department", "Gender", "Batch", "Status", "Rounds", "Attendance", "Score", "Referral Count"]
        rows = [
            [
                row.get("rank"),
                row.get("register_number"),
                row.get("name"),
                row.get("department"),
                row.get("gender"),
                row.get("batch"),
                row.get("status"),
                row.get("rounds_participated", 0),
                row.get("attendance_count", 0),
                row.get("cumulative_score", 0),
                row.get("referral_count", 0),
            ]
            for row in leaderboard
        ]
    else:
        headers = ["Rank", "Entity Type", "Name", "Register/Team Code", "Status", "Rounds", "Attendance", "Score"]
        rows = [
            [
                row["rank"],
                row["entity_type"],
                row["name"],
                row["regno_or_code"],
                row.get("status"),
                row.get("rounds_participated", 0),
                row["attendance_count"],
                row["cumulative_score"],
            ]
            for row in leaderboard
        ]
    if format == "xlsx":
        content = _export_to_xlsx(headers, rows)
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        filename = f"{event.event_code}_leaderboard.xlsx"
    else:
        content = _export_to_csv(headers, rows)
        media_type = "text/csv"
        filename = f"{event.event_code}_leaderboard.csv"
    return StreamingResponse(io.BytesIO(content), media_type=media_type, headers={"Content-Disposition": f"attachment; filename={filename}"})


@router.get("/pda-admin/events/{slug}/export/round/{round_id}")
def export_round(
    slug: str,
    round_id: int,
    format: str = Query("csv"),
    _: PdaUser = Depends(require_pda_event_admin),
    db: Session = Depends(get_db),
):
    result = round_participants(slug=slug, round_id=round_id, _=None, db=db)
    headers = ["Entity Type", "Name", "Register/Team Code", "Total Score", "Normalized Score", "Present"]
    rows = [
        [
            row["entity_type"],
            row["name"],
            row["regno_or_code"],
            row["total_score"],
            row["normalized_score"],
            row["is_present"],
        ]
        for row in result
    ]
    event = _get_event_or_404(db, slug)
    if format == "xlsx":
        content = _export_to_xlsx(headers, rows)
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        filename = f"{event.event_code}_round_{round_id}.xlsx"
    else:
        content = _export_to_csv(headers, rows)
        media_type = "text/csv"
        filename = f"{event.event_code}_round_{round_id}.csv"
    return StreamingResponse(io.BytesIO(content), media_type=media_type, headers={"Content-Disposition": f"attachment; filename={filename}"})


@router.post("/pda-admin/events/{slug}/badges", response_model=PdaManagedBadgeResponse)
def create_badge(
    slug: str,
    payload: PdaManagedBadgeCreate,
    admin: PdaUser = Depends(require_pda_event_admin),
    db: Session = Depends(get_db),
):
    event = _get_event_or_404(db, slug)
    if payload.user_id and payload.team_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only one of user_id or team_id is allowed")
    badge = PdaEventBadge(
        event_id=event.id,
        title=payload.title,
        image_url=payload.image_url,
        place=PdaEventBadgePlace[payload.place.name],
        score=payload.score,
        user_id=payload.user_id,
        team_id=payload.team_id,
    )
    db.add(badge)
    db.commit()
    db.refresh(badge)
    _log_event_admin_action(
        db,
        admin,
        event,
        "create_pda_event_badge",
        method="POST",
        path=f"/pda-admin/events/{slug}/badges",
        meta={"badge_id": badge.id},
    )
    return PdaManagedBadgeResponse.model_validate(badge)


@router.get("/pda-admin/events/{slug}/badges", response_model=List[PdaManagedBadgeResponse])
def list_badges(
    slug: str,
    _: PdaUser = Depends(require_pda_event_admin),
    db: Session = Depends(get_db),
):
    event = _get_event_or_404(db, slug)
    badges = db.query(PdaEventBadge).filter(PdaEventBadge.event_id == event.id).order_by(PdaEventBadge.created_at.desc()).all()
    return [PdaManagedBadgeResponse.model_validate(badge) for badge in badges]
