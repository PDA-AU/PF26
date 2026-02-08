import csv
import io
import re
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
    PdaEvent,
    PdaEventType,
    PdaEventFormat,
    PdaEventTemplate,
    PdaEventStatus,
    PdaEventParticipantMode,
    PdaEventRoundMode,
    PdaEventEntityType,
    PdaEventRegistration,
    PdaEventTeam,
    PdaEventTeamMember,
    PdaEventRound,
    PdaEventRoundState,
    PdaEventAttendance,
    PdaEventScore,
    PdaEventBadge,
    PdaEventBadgePlace,
)
from schemas import (
    PdaManagedAttendanceMarkRequest,
    PdaManagedAttendanceScanRequest,
    PdaManagedBadgeCreate,
    PdaManagedBadgeResponse,
    PdaManagedEntityTypeEnum,
    PdaManagedEventCreate,
    PdaManagedEventResponse,
    PdaManagedEventUpdate,
    PdaManagedRoundCreate,
    PdaManagedRoundResponse,
    PdaManagedRoundUpdate,
    PdaManagedScoreEntry,
)
from security import get_admin_context, require_pda_event_admin, require_superadmin
from utils import log_admin_action

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


def _registered_entities(db: Session, event: PdaEvent):
    if event.participant_mode == PdaEventParticipantMode.INDIVIDUAL:
        rows = (
            db.query(PdaEventRegistration, PdaUser)
            .join(PdaUser, PdaEventRegistration.user_id == PdaUser.id)
            .filter(PdaEventRegistration.event_id == event.id, PdaEventRegistration.user_id.isnot(None))
            .all()
        )
        return [
            {
                "entity_type": "user",
                "entity_id": user.id,
                "name": user.name,
                "regno_or_code": user.regno,
            }
            for reg, user in rows
        ]
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
            }
        )
    return payload


@router.get("/pda-admin/events", response_model=List[PdaManagedEventResponse])
async def list_managed_events(
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
async def create_managed_event(
    payload: PdaManagedEventCreate,
    admin: PdaUser = Depends(require_superadmin),
    db: Session = Depends(get_db),
):
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
        poster_url=payload.poster_url,
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
    log_admin_action(db, admin, "create_pda_managed_event", method="POST", path="/pda-admin/events", meta={"slug": new_event.slug, "event_id": new_event.id})
    return PdaManagedEventResponse.model_validate(new_event)


@router.put("/pda-admin/events/{slug}", response_model=PdaManagedEventResponse)
async def update_managed_event(
    slug: str,
    payload: PdaManagedEventUpdate,
    admin: PdaUser = Depends(require_superadmin),
    db: Session = Depends(get_db),
):
    event = _get_event_or_404(db, slug)
    updates = payload.model_dump(exclude_unset=True)
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

    db.commit()
    db.refresh(event)
    log_admin_action(db, admin, "update_pda_managed_event", method="PUT", path=f"/pda-admin/events/{slug}", meta={"slug": slug})
    return PdaManagedEventResponse.model_validate(event)


@router.get("/pda-admin/events/{slug}/dashboard")
async def event_dashboard(
    slug: str,
    _: PdaUser = Depends(require_pda_event_admin),
    db: Session = Depends(get_db),
):
    event = _get_event_or_404(db, slug)
    registrations = db.query(PdaEventRegistration).filter(PdaEventRegistration.event_id == event.id).count()
    rounds = db.query(PdaEventRound).filter(PdaEventRound.event_id == event.id).count()
    attendance_present = db.query(PdaEventAttendance).filter(
        PdaEventAttendance.event_id == event.id,
        PdaEventAttendance.is_present == True,  # noqa: E712
    ).count()
    scores = db.query(PdaEventScore).filter(PdaEventScore.event_id == event.id).count()
    badges = db.query(PdaEventBadge).filter(PdaEventBadge.event_id == event.id).count()
    return {
        "event": PdaManagedEventResponse.model_validate(event),
        "registrations": registrations,
        "rounds": rounds,
        "attendance_present": attendance_present,
        "score_rows": scores,
        "badges": badges,
    }


@router.get("/pda-admin/events/{slug}/participants")
async def event_participants(
    slug: str,
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    response: Response = None,
    _: PdaUser = Depends(require_pda_event_admin),
    db: Session = Depends(get_db),
):
    event = _get_event_or_404(db, slug)
    items = _registered_entities(db, event)
    if search:
        needle = search.lower()
        items = [item for item in items if needle in item.get("name", "").lower() or needle in item.get("regno_or_code", "").lower()]

    total = len(items)
    start = (page - 1) * page_size
    end = start + page_size
    paged = items[start:end]
    if response is not None:
        response.headers["X-Total-Count"] = str(total)
        response.headers["X-Page"] = str(page)
        response.headers["X-Page-Size"] = str(page_size)
    return paged


@router.get("/pda-admin/events/{slug}/attendance")
async def event_attendance(
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
async def mark_attendance(
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
    return {"message": "Attendance updated"}


@router.post("/pda-admin/events/{slug}/attendance/scan")
async def scan_attendance(
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
    return await mark_attendance(slug=slug, payload=mark_payload, admin=admin, db=db)


@router.get("/pda-admin/events/{slug}/rounds", response_model=List[PdaManagedRoundResponse])
async def list_rounds(
    slug: str,
    _: PdaUser = Depends(require_pda_event_admin),
    db: Session = Depends(get_db),
):
    event = _get_event_or_404(db, slug)
    rounds = db.query(PdaEventRound).filter(PdaEventRound.event_id == event.id).order_by(PdaEventRound.round_no.asc()).all()
    return [PdaManagedRoundResponse.model_validate(row) for row in rounds]


@router.post("/pda-admin/events/{slug}/rounds", response_model=PdaManagedRoundResponse)
async def create_round(
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
    log_admin_action(db, admin, "create_pda_event_round", method="POST", path=f"/pda-admin/events/{slug}/rounds", meta={"round_id": round_row.id})
    return PdaManagedRoundResponse.model_validate(round_row)


@router.put("/pda-admin/events/{slug}/rounds/{round_id}", response_model=PdaManagedRoundResponse)
async def update_round(
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
    if "mode" in updates:
        updates["mode"] = _to_event_format(payload.mode)
    if "state" in updates:
        updates["state"] = _to_round_state(payload.state)
    if "evaluation_criteria" in updates and payload.evaluation_criteria is not None:
        updates["evaluation_criteria"] = [c.model_dump() for c in payload.evaluation_criteria]
    for field, value in updates.items():
        setattr(round_row, field, value)

    if round_row.is_frozen and round_row.elimination_type and round_row.elimination_value is not None:
        round_row.state = PdaEventRoundState.COMPLETED
    db.commit()
    db.refresh(round_row)
    log_admin_action(db, admin, "update_pda_event_round", method="PUT", path=f"/pda-admin/events/{slug}/rounds/{round_id}", meta={"round_id": round_id})
    return PdaManagedRoundResponse.model_validate(round_row)


@router.get("/pda-admin/events/{slug}/rounds/{round_id}/participants")
async def round_participants(
    slug: str,
    round_id: int,
    _: PdaUser = Depends(require_pda_event_admin),
    db: Session = Depends(get_db),
):
    event = _get_event_or_404(db, slug)
    round_row = db.query(PdaEventRound).filter(PdaEventRound.id == round_id, PdaEventRound.event_id == event.id).first()
    if not round_row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Round not found")
    entities = _registered_entities(db, event)
    score_rows = db.query(PdaEventScore).filter(PdaEventScore.event_id == event.id, PdaEventScore.round_id == round_id).all()
    score_map = {}
    for row in score_rows:
        key = ("user", row.user_id) if row.user_id else ("team", row.team_id)
        score_map[key] = row
    result = []
    for entity in entities:
        key = (entity["entity_type"], entity["entity_id"])
        row = score_map.get(key)
        result.append(
            {
                **entity,
                "score_id": row.id if row else None,
                "criteria_scores": row.criteria_scores if row else {},
                "total_score": float(row.total_score or 0.0) if row else 0.0,
                "normalized_score": float(row.normalized_score or 0.0) if row else 0.0,
                "is_present": bool(row.is_present) if row else False,
            }
        )
    return result


@router.post("/pda-admin/events/{slug}/rounds/{round_id}/scores")
async def save_scores(
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
    log_admin_action(db, admin, "save_pda_event_scores", method="POST", path=f"/pda-admin/events/{slug}/rounds/{round_id}/scores", meta={"count": len(entries)})
    return {"message": "Scores saved"}


@router.post("/pda-admin/events/{slug}/rounds/{round_id}/import-scores")
async def import_scores(
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

    wb = load_workbook(filename=io.BytesIO(await file.read()))
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
        else:
            team = db.query(PdaEventTeam).filter(PdaEventTeam.event_id == event.id, PdaEventTeam.team_code == identifier).first()
            if not team:
                errors.append(f"Row {row_idx}: Team code {identifier} not found")
                continue
            entity_type = PdaEventEntityType.TEAM
            team_id = team.id

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
    log_admin_action(db, admin, "import_pda_event_scores", method="POST", path=f"/pda-admin/events/{slug}/rounds/{round_id}/import-scores", meta={"imported": imported, "errors": len(errors)})
    return {"imported": imported, "errors": errors[:20]}


@router.get("/pda-admin/events/{slug}/rounds/{round_id}/score-template")
async def score_template(
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
async def freeze_round(
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
    log_admin_action(db, admin, "freeze_pda_event_round", method="POST", path=f"/pda-admin/events/{slug}/rounds/{round_id}/freeze", meta={"round_id": round_id})
    return {"message": "Round frozen"}


@router.post("/pda-admin/events/{slug}/rounds/{round_id}/unfreeze")
async def unfreeze_round(
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
    log_admin_action(db, admin, "unfreeze_pda_event_round", method="POST", path=f"/pda-admin/events/{slug}/rounds/{round_id}/unfreeze", meta={"round_id": round_id})
    return {"message": "Round unfrozen"}


@router.get("/pda-admin/events/{slug}/leaderboard")
async def event_leaderboard(
    slug: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    response: Response = None,
    _: PdaUser = Depends(require_pda_event_admin),
    db: Session = Depends(get_db),
):
    event = _get_event_or_404(db, slug)
    entities = _registered_entities(db, event)
    rows = []
    for entity in entities:
        if entity["entity_type"] == "user":
            score = db.execute(
                text("SELECT COALESCE(SUM(total_score), 0) FROM pda_event_scores WHERE event_id = :event_id AND user_id = :user_id"),
                {"event_id": event.id, "user_id": entity["entity_id"]},
            ).fetchone()
            attendance = db.execute(
                text("SELECT COALESCE(COUNT(*), 0) FROM pda_event_attendance WHERE event_id = :event_id AND user_id = :user_id AND is_present = true"),
                {"event_id": event.id, "user_id": entity["entity_id"]},
            ).fetchone()
        else:
            score = db.execute(
                text("SELECT COALESCE(SUM(total_score), 0) FROM pda_event_scores WHERE event_id = :event_id AND team_id = :team_id"),
                {"event_id": event.id, "team_id": entity["entity_id"]},
            ).fetchone()
            attendance = db.execute(
                text("SELECT COALESCE(COUNT(*), 0) FROM pda_event_attendance WHERE event_id = :event_id AND team_id = :team_id AND is_present = true"),
                {"event_id": event.id, "team_id": entity["entity_id"]},
            ).fetchone()
        rows.append(
            {
                **entity,
                "cumulative_score": float((score[0] if score else 0) or 0),
                "attendance_count": int((attendance[0] if attendance else 0) or 0),
            }
        )
    rows.sort(key=lambda x: (-x["cumulative_score"], x["name"].lower()))
    for idx, row in enumerate(rows, start=1):
        row["rank"] = idx

    total = len(rows)
    start = (page - 1) * page_size
    end = start + page_size
    paged = rows[start:end]
    if response is not None:
        response.headers["X-Total-Count"] = str(total)
        response.headers["X-Page"] = str(page)
        response.headers["X-Page-Size"] = str(page_size)
    return paged


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
async def export_participants(
    slug: str,
    format: str = Query("csv"),
    _: PdaUser = Depends(require_pda_event_admin),
    db: Session = Depends(get_db),
):
    event = _get_event_or_404(db, slug)
    entities = _registered_entities(db, event)
    headers = ["Entity Type", "Name", "Register/Team Code", "Members Count"]
    rows = [[e["entity_type"], e["name"], e["regno_or_code"], e.get("members_count", 1)] for e in entities]
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
async def export_leaderboard(
    slug: str,
    format: str = Query("csv"),
    _: PdaUser = Depends(require_pda_event_admin),
    db: Session = Depends(get_db),
):
    leaderboard = await event_leaderboard(slug=slug, page=1, page_size=10000, response=None, _=None, db=db)
    headers = ["Rank", "Entity Type", "Name", "Register/Team Code", "Attendance", "Score"]
    rows = [[row["rank"], row["entity_type"], row["name"], row["regno_or_code"], row["attendance_count"], row["cumulative_score"]] for row in leaderboard]
    event = _get_event_or_404(db, slug)
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
async def export_round(
    slug: str,
    round_id: int,
    format: str = Query("csv"),
    _: PdaUser = Depends(require_pda_event_admin),
    db: Session = Depends(get_db),
):
    result = await round_participants(slug=slug, round_id=round_id, _=None, db=db)
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
async def create_badge(
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
    log_admin_action(db, admin, "create_pda_event_badge", method="POST", path=f"/pda-admin/events/{slug}/badges", meta={"badge_id": badge.id})
    return PdaManagedBadgeResponse.model_validate(badge)


@router.get("/pda-admin/events/{slug}/badges", response_model=List[PdaManagedBadgeResponse])
async def list_badges(
    slug: str,
    _: PdaUser = Depends(require_pda_event_admin),
    db: Session = Depends(get_db),
):
    event = _get_event_or_404(db, slug)
    badges = db.query(PdaEventBadge).filter(PdaEventBadge.event_id == event.id).order_by(PdaEventBadge.created_at.desc()).all()
    return [PdaManagedBadgeResponse.model_validate(badge) for badge in badges]
