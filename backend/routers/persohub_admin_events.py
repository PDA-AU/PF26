import re
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from database import get_db
from models import (
    CommunityEvent,
    CommunityEventAttendance,
    CommunityEventBadge,
    CommunityEventInvite,
    CommunityEventLog,
    CommunityEventRegistration,
    CommunityEventRound,
    CommunityEventScore,
    CommunityEventTeam,
    CommunityEventTeamMember,
    CommunitySympoLegacy,
    CommunitySympoEvent,
    PdaEventFormat,
    PdaEventParticipantMode,
    PdaEventRoundMode,
    PdaEventRoundState,
    PdaEventStatus,
    PdaEventTemplate,
    PdaEventType,
    PdaUser,
    PersohubCommunity,
)
from persohub_schemas import (
    PersohubAdminEventCreateRequest,
    PersohubAdminEventResponse,
    PersohubAdminEventUpdateRequest,
)
from security import require_persohub_community

router = APIRouter()

_DEFAULT_EVENT_ACTION = "Join whatsapp channel"
_DEFAULT_ROUND_CRITERIA = [{"name": "Score", "max_marks": 100}]


def _slugify(value: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9]+", "-", value.strip().lower()).strip("-")
    return cleaned[:110] if cleaned else "event"


def _next_slug(db: Session, title: str) -> str:
    base = _slugify(title)
    slug = base
    counter = 2
    while db.query(CommunityEvent).filter(CommunityEvent.slug == slug).first():
        slug = f"{base}-{counter}"
        counter += 1
    return slug


def _next_event_code(db: Session) -> str:
    latest = db.query(CommunityEvent).order_by(CommunityEvent.id.desc()).first()
    next_id = (latest.id + 1) if latest else 1
    return f"CEV{next_id:03d}"


def _resolve_root_community(db: Session, club_id: int) -> Optional[PersohubCommunity]:
    return (
        db.query(PersohubCommunity)
        .filter(PersohubCommunity.club_id == club_id, PersohubCommunity.is_root == True)  # noqa: E712
        .order_by(PersohubCommunity.id.asc())
        .first()
    )


def _require_root_editor(community: PersohubCommunity) -> None:
    if not community.is_root:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only root community can manage events",
        )


def _validate_event_dates(start_date, end_date) -> None:
    if start_date and end_date and start_date > end_date:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="start_date cannot be after end_date")


def _validate_team_constraints(
    participant_mode: PdaEventParticipantMode,
    team_min_size: Optional[int],
    team_max_size: Optional[int],
) -> None:
    if participant_mode == PdaEventParticipantMode.TEAM:
        if team_min_size is None or team_max_size is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="team_min_size and team_max_size are required for team events",
            )
        if team_min_size > team_max_size:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="team_min_size cannot exceed team_max_size",
            )


def _to_event_type(value) -> PdaEventType:
    return PdaEventType(value.value if hasattr(value, "value") else str(value))


def _to_event_format(value) -> PdaEventFormat:
    return PdaEventFormat(value.value if hasattr(value, "value") else str(value))


def _to_event_template(value) -> PdaEventTemplate:
    return PdaEventTemplate(value.value if hasattr(value, "value") else str(value))


def _to_participant_mode(value) -> PdaEventParticipantMode:
    return PdaEventParticipantMode(value.value if hasattr(value, "value") else str(value))


def _to_round_mode(value) -> PdaEventRoundMode:
    return PdaEventRoundMode(value.value if hasattr(value, "value") else str(value))


def _to_event_status(value) -> PdaEventStatus:
    return PdaEventStatus(value.value if hasattr(value, "value") else str(value))


def _enum_value(value) -> str:
    if hasattr(value, "value"):
        return str(value.value)
    return str(value)


def _serialize_event(event: CommunityEvent) -> PersohubAdminEventResponse:
    return PersohubAdminEventResponse(
        id=event.id,
        slug=event.slug,
        event_code=event.event_code,
        community_id=event.community_id,
        title=event.title,
        description=event.description,
        start_date=event.start_date,
        end_date=event.end_date,
        poster_url=event.poster_url,
        whatsapp_url=event.whatsapp_url,
        external_url_name=str(event.external_url_name or _DEFAULT_EVENT_ACTION),
        event_type=_enum_value(event.event_type),
        format=_enum_value(event.format),
        template_option=_enum_value(event.template_option),
        participant_mode=_enum_value(event.participant_mode),
        round_mode=_enum_value(event.round_mode),
        round_count=int(event.round_count or 1),
        team_min_size=event.team_min_size,
        team_max_size=event.team_max_size,
        is_visible=bool(event.is_visible),
        status=_enum_value(event.status),
        created_at=event.created_at,
        updated_at=event.updated_at,
    )


def _get_event_or_404(db: Session, slug: str, root_community_id: int) -> CommunityEvent:
    event = (
        db.query(CommunityEvent)
        .filter(
            CommunityEvent.slug == slug,
            CommunityEvent.community_id == root_community_id,
        )
        .first()
    )
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    return event


def _admin_identity(db: Session, community: PersohubCommunity) -> tuple[Optional[int], str, str]:
    admin = db.query(PdaUser).filter(PdaUser.id == community.admin_id).first()
    if not admin:
        return None, "", community.name
    return admin.id, str(admin.regno or ""), str(admin.name or community.name)


def _log_community_event_action(
    db: Session,
    community: PersohubCommunity,
    action: str,
    method: str,
    path: str,
    event: CommunityEvent,
    meta: Optional[dict] = None,
) -> None:
    admin_id, admin_regno, admin_name = _admin_identity(db, community)
    db.add(
        CommunityEventLog(
            event_id=event.id,
            event_slug=event.slug,
            admin_id=admin_id,
            admin_register_number=admin_regno,
            admin_name=admin_name,
            action=action,
            method=method,
            path=path,
            meta=meta or {},
        )
    )


@router.get("/persohub/admin/events", response_model=List[PersohubAdminEventResponse])
def list_admin_events(
    community: PersohubCommunity = Depends(require_persohub_community),
    db: Session = Depends(get_db),
):
    if not community.club_id:
        return []
    root_community = _resolve_root_community(db, community.club_id)
    if not root_community:
        return []
    events = (
        db.query(CommunityEvent)
        .filter(CommunityEvent.community_id == root_community.id)
        .order_by(CommunityEvent.created_at.desc(), CommunityEvent.id.desc())
        .all()
    )
    return [_serialize_event(event) for event in events]


@router.post("/persohub/admin/events", response_model=PersohubAdminEventResponse)
def create_admin_event(
    payload: PersohubAdminEventCreateRequest,
    request: Request,
    community: PersohubCommunity = Depends(require_persohub_community),
    db: Session = Depends(get_db),
):
    if not community.club_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Community is not linked to a club")
    _require_root_editor(community)

    root_community = _resolve_root_community(db, community.club_id)
    if not root_community:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Root community not found")

    _validate_event_dates(payload.start_date, payload.end_date)
    participant_mode = _to_participant_mode(payload.participant_mode)
    _validate_team_constraints(participant_mode, payload.team_min_size, payload.team_max_size)

    round_mode = _to_round_mode(payload.round_mode)
    round_count = 1 if round_mode == PdaEventRoundMode.SINGLE else int(payload.round_count or 1)
    team_min_size = payload.team_min_size
    team_max_size = payload.team_max_size
    if participant_mode != PdaEventParticipantMode.TEAM:
        team_min_size = None
        team_max_size = None

    event = CommunityEvent(
        slug=_next_slug(db, payload.title),
        event_code=_next_event_code(db),
        community_id=root_community.id,
        title=payload.title.strip(),
        description=payload.description,
        start_date=payload.start_date,
        end_date=payload.end_date,
        poster_url=payload.poster_url,
        whatsapp_url=payload.whatsapp_url,
        external_url_name=str(payload.external_url_name or _DEFAULT_EVENT_ACTION).strip() or _DEFAULT_EVENT_ACTION,
        event_type=_to_event_type(payload.event_type),
        format=_to_event_format(payload.format),
        template_option=_to_event_template(payload.template_option),
        participant_mode=participant_mode,
        round_mode=round_mode,
        round_count=round_count,
        team_min_size=team_min_size,
        team_max_size=team_max_size,
        is_visible=True,
        status=PdaEventStatus.CLOSED,
    )
    db.add(event)
    db.flush()

    for round_no in range(1, round_count + 1):
        db.add(
            CommunityEventRound(
                event_id=event.id,
                round_no=round_no,
                name=f"Round {round_no}",
                mode=event.format,
                state=PdaEventRoundState.DRAFT,
                evaluation_criteria=_DEFAULT_ROUND_CRITERIA,
            )
        )

    _log_community_event_action(
        db,
        community,
        action="create_community_managed_event",
        method=request.method,
        path=request.url.path,
        event=event,
        meta={"event_id": event.id, "slug": event.slug},
    )

    db.commit()
    db.refresh(event)
    return _serialize_event(event)


@router.put("/persohub/admin/events/{slug}", response_model=PersohubAdminEventResponse)
def update_admin_event(
    slug: str,
    payload: PersohubAdminEventUpdateRequest,
    request: Request,
    community: PersohubCommunity = Depends(require_persohub_community),
    db: Session = Depends(get_db),
):
    if not community.club_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Community is not linked to a club")
    _require_root_editor(community)

    root_community = _resolve_root_community(db, community.club_id)
    if not root_community:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Root community not found")

    event = _get_event_or_404(db, slug, root_community.id)
    updates = payload.model_dump(exclude_unset=True)

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
    if "external_url_name" in updates:
        updates["external_url_name"] = str(updates.get("external_url_name") or "").strip() or _DEFAULT_EVENT_ACTION

    next_start_date = updates.get("start_date", event.start_date)
    next_end_date = updates.get("end_date", event.end_date)
    _validate_event_dates(next_start_date, next_end_date)

    next_participant_mode = updates.get("participant_mode", event.participant_mode)
    next_min_size = updates.get("team_min_size", event.team_min_size)
    next_max_size = updates.get("team_max_size", event.team_max_size)
    _validate_team_constraints(next_participant_mode, next_min_size, next_max_size)

    next_round_mode = updates.get("round_mode", event.round_mode)
    if next_round_mode == PdaEventRoundMode.SINGLE:
        updates["round_count"] = 1

    if next_participant_mode != PdaEventParticipantMode.TEAM:
        updates["team_min_size"] = None
        updates["team_max_size"] = None

    for field, value in updates.items():
        setattr(event, field, value)

    _log_community_event_action(
        db,
        community,
        action="update_community_managed_event",
        method=request.method,
        path=request.url.path,
        event=event,
        meta={"event_id": event.id, "slug": event.slug, "updated_fields": sorted(list(updates.keys()))},
    )

    db.commit()
    db.refresh(event)
    return _serialize_event(event)


@router.delete("/persohub/admin/events/{slug}")
def delete_admin_event(
    slug: str,
    request: Request,
    community: PersohubCommunity = Depends(require_persohub_community),
    db: Session = Depends(get_db),
):
    if not community.club_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Community is not linked to a club")
    _require_root_editor(community)

    root_community = _resolve_root_community(db, community.club_id)
    if not root_community:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Root community not found")

    event = _get_event_or_404(db, slug, root_community.id)
    event_id = int(event.id)
    event_slug = str(event.slug)

    team_ids = [
        int(row[0])
        for row in db.query(CommunityEventTeam.id).filter(CommunityEventTeam.event_id == event_id).all()
    ]
    round_ids = [
        int(row[0])
        for row in db.query(CommunityEventRound.id).filter(CommunityEventRound.event_id == event_id).all()
    ]

    if team_ids:
        db.query(CommunityEventInvite).filter(CommunityEventInvite.team_id.in_(team_ids)).delete(synchronize_session=False)
        db.query(CommunityEventBadge).filter(CommunityEventBadge.team_id.in_(team_ids)).delete(synchronize_session=False)
        db.query(CommunityEventScore).filter(CommunityEventScore.team_id.in_(team_ids)).delete(synchronize_session=False)
        db.query(CommunityEventAttendance).filter(CommunityEventAttendance.team_id.in_(team_ids)).delete(synchronize_session=False)
        db.query(CommunityEventRegistration).filter(CommunityEventRegistration.team_id.in_(team_ids)).delete(synchronize_session=False)
        db.query(CommunityEventTeamMember).filter(CommunityEventTeamMember.team_id.in_(team_ids)).delete(synchronize_session=False)

    if round_ids:
        db.query(CommunityEventScore).filter(CommunityEventScore.round_id.in_(round_ids)).delete(synchronize_session=False)
        db.query(CommunityEventAttendance).filter(CommunityEventAttendance.round_id.in_(round_ids)).delete(synchronize_session=False)

    db.query(CommunityEventInvite).filter(CommunityEventInvite.event_id == event_id).delete(synchronize_session=False)
    db.query(CommunityEventBadge).filter(CommunityEventBadge.event_id == event_id).delete(synchronize_session=False)
    db.query(CommunityEventScore).filter(CommunityEventScore.event_id == event_id).delete(synchronize_session=False)
    db.query(CommunityEventAttendance).filter(CommunityEventAttendance.event_id == event_id).delete(synchronize_session=False)
    db.query(CommunityEventRegistration).filter(CommunityEventRegistration.event_id == event_id).delete(synchronize_session=False)
    db.query(CommunityEventTeamMember).filter(
        CommunityEventTeamMember.team_id.in_(
            db.query(CommunityEventTeam.id).filter(CommunityEventTeam.event_id == event_id)
        )
    ).delete(synchronize_session=False)
    db.query(CommunityEventTeam).filter(CommunityEventTeam.event_id == event_id).delete(synchronize_session=False)
    db.query(CommunityEventRound).filter(CommunityEventRound.event_id == event_id).delete(synchronize_session=False)
    db.query(CommunitySympoLegacy).filter(CommunitySympoLegacy.event_id == event_id).delete(synchronize_session=False)
    db.query(CommunitySympoEvent).filter(CommunitySympoEvent.event_id == event_id).delete(synchronize_session=False)
    db.query(CommunityEventLog).filter(
        (CommunityEventLog.event_id == event_id) | (CommunityEventLog.event_slug == event_slug)
    ).delete(synchronize_session=False)

    _log_community_event_action(
        db,
        community,
        action="delete_community_managed_event",
        method=request.method,
        path=request.url.path,
        event=event,
        meta={"event_id": event_id, "slug": event_slug},
    )

    db.delete(event)
    db.commit()
    return {"message": "Event deleted"}
