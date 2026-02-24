import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from auth import verify_password
from badge_service import delete_badges_for_persohub_event, delete_badges_for_persohub_teams
from database import get_db
from emailer import send_email_async
from models import (
    PdaEventFormat,
    PdaEventEntityType,
    PdaEventParticipantMode,
    PdaEventRegistrationStatus,
    PdaEventRoundMode,
    PdaEventRoundState,
    PdaEventStatus,
    PdaEventTemplate,
    PdaEventType,
    PdaUser,
    PersohubAdmin,
    PersohubClub,
    PersohubCommunity,
    PersohubEvent,
    PersohubEventAttendance,
    PersohubEventInvite,
    PersohubEventLog,
    PersohubEventRegistration,
    PersohubEventRound,
    PersohubEventRoundPanel,
    PersohubEventRoundPanelAssignment,
    PersohubEventRoundPanelMember,
    PersohubEventRoundSubmission,
    PersohubEventScore,
    PersohubEventTeam,
    PersohubEventTeamMember,
    PersohubPayment,
    PersohubSympo,
    PersohubSympoEvent,
)
from persohub_schemas import (
    PersohubAdminPaymentConfirmRequest,
    PersohubAdminPaymentDeclineRequest,
    PersohubAdminPaymentReviewListItem,
    PersohubAdminEventCreateRequest,
    PersohubAdminEventResponse,
    PersohubAdminEventSympoAssignRequest,
    PersohubAdminEventSympoAssignResponse,
    PersohubAdminEventUpdateRequest,
    PersohubAdminSympoOption,
)
from security import (
    can_access_persohub_events,
    get_persohub_actor_club_id,
    get_persohub_actor_policy,
    get_persohub_actor_user_id,
    is_persohub_club_owner,
    require_persohub_community,
)

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
    while db.query(PersohubEvent).filter(PersohubEvent.slug == slug).first():
        slug = f"{base}-{counter}"
        counter += 1
    return slug


def _next_event_code(db: Session) -> str:
    latest = db.query(PersohubEvent).order_by(PersohubEvent.id.desc()).first()
    next_id = (latest.id + 1) if latest else 1
    return f"CEV{next_id:03d}"


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


def _to_event_open_for(value) -> str:
    raw = str(value.value if hasattr(value, "value") else value or "").strip().upper()
    return "ALL" if raw == "ALL" else "MIT"


def _enum_value(value) -> str:
    if hasattr(value, "value"):
        return str(value.value)
    return str(value)


def _ensure_events_policy_shape(policy: Optional[dict]) -> dict:
    safe = dict(policy or {})
    if not isinstance(safe.get("events"), dict):
        safe["events"] = {}
    return safe


def _serialize_event(event: PersohubEvent, sympo: Optional[PersohubSympo] = None) -> PersohubAdminEventResponse:
    seat_availability_enabled = bool(getattr(event, "seat_availability_enabled", False))
    seat_capacity = int(event.seat_capacity) if event.seat_capacity is not None else None
    if seat_availability_enabled and (seat_capacity is None or seat_capacity < 1):
        seat_capacity = 100
    return PersohubAdminEventResponse(
        id=event.id,
        slug=event.slug,
        event_code=event.event_code,
        club_id=int(event.club_id or 0),
        community_id=(int(event.community_id) if event.community_id else None),
        title=event.title,
        description=event.description,
        start_date=event.start_date,
        end_date=event.end_date,
        event_time=event.event_time,
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
        registration_fee=event.registration_fee,
        seat_availability_enabled=seat_availability_enabled,
        seat_capacity=seat_capacity,
        is_visible=bool(event.is_visible),
        open_for=_to_event_open_for(event.open_for),
        status=_enum_value(event.status),
        sympo_id=(sympo.id if sympo else None),
        sympo_name=(sympo.name if sympo else None),
        created_at=event.created_at,
        updated_at=event.updated_at,
    )


def _get_event_or_404(db: Session, slug: str, club_id: int) -> PersohubEvent:
    event = (
        db.query(PersohubEvent)
        .filter(
            PersohubEvent.slug == slug,
            PersohubEvent.club_id == club_id,
        )
        .first()
    )
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    return event


def _admin_identity(
    db: Session,
    community: PersohubCommunity,
    *,
    actor_user_id: Optional[int] = None,
) -> tuple[Optional[int], str, str]:
    resolved_actor_id = int(actor_user_id or 0)
    admin = db.query(PdaUser).filter(PdaUser.id == resolved_actor_id).first() if resolved_actor_id > 0 else None
    if not admin:
        admin = db.query(PdaUser).filter(PdaUser.id == community.admin_id).first()
    if not admin:
        return None, "", community.name
    return admin.id, str(admin.regno or ""), str(admin.name or community.name)


def _log_persohub_event_action(
    db: Session,
    community: PersohubCommunity,
    action: str,
    method: str,
    path: str,
    event: Optional[PersohubEvent] = None,
    event_slug: Optional[str] = None,
    meta: Optional[dict] = None,
    actor_user_id: Optional[int] = None,
) -> None:
    admin_id, admin_regno, admin_name = _admin_identity(db, community, actor_user_id=actor_user_id)
    resolved_slug = str(event_slug or (event.slug if event else "") or "")
    db.add(
        PersohubEventLog(
            event_id=(event.id if event else None),
            event_slug=resolved_slug,
            admin_id=admin_id,
            admin_register_number=admin_regno,
            admin_name=admin_name,
            action=action,
            method=method,
            path=path,
            meta=meta or {},
        )
    )


def _resolve_actor_club_id(request: Request, community: PersohubCommunity) -> int:
    club_id = int(get_persohub_actor_club_id(request) or int(community.club_id or 0) or 0)
    if club_id <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Community is not linked to a club")
    return club_id


def _assert_persohub_admin_token(request: Request) -> None:
    token_user_type = str(getattr(request.state, "persohub_token_user_type", "") or "").strip().lower()
    if token_user_type != "persohub_admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Persohub admin access required")


def _assert_owner(request: Request) -> None:
    if not is_persohub_club_owner(request):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Club owner access required")


def _assert_can_access_events(request: Request) -> None:
    if is_persohub_club_owner(request):
        return
    if not can_access_persohub_events(request):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin policy does not allow event access")


def _payment_content_dict(payment: PersohubPayment) -> Dict[str, Any]:
    raw = payment.content if isinstance(payment.content, dict) else {}
    return dict(raw or {})


def _payment_status(payment: Optional[PersohubPayment]) -> str:
    if not payment:
        return "none"
    content = _payment_content_dict(payment)
    raw = str(content.get("status") or "").strip().lower()
    if raw in {"pending", "approved", "declined"}:
        return raw
    return "pending"


def _optional_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _build_payment_list_item(
    payment: PersohubPayment,
    event: PersohubEvent,
    participant: Optional[PdaUser],
    club: Optional[PersohubClub],
) -> PersohubAdminPaymentReviewListItem:
    content = _payment_content_dict(payment)
    return PersohubAdminPaymentReviewListItem(
        id=int(payment.id),
        event_id=int(event.id),
        event_slug=str(event.slug or ""),
        event_title=str(event.title or ""),
        club_id=int(event.club_id or 0),
        club_name=(str(club.name or "") if club else None) or None,
        user_id=int(payment.user_id or 0),
        participant_name=(str(participant.name or "") if participant else "") or f"User {payment.user_id}",
        participant_regno=(str(participant.regno or "") if participant else None) or None,
        participant_email=(str(participant.email or "") if participant else None) or None,
        participant_phno=(str(participant.phno or "") if participant else None) or None,
        participant_college=(str(participant.college or "") if participant else None) or None,
        participant_dept=(str(participant.dept or "") if participant else None) or None,
        payment_info_url=str(payment.payment_info_url or ""),
        status=_payment_status(payment),
        fee_key=(str(content.get("fee_key") or "") or None),
        amount=_optional_float(content.get("amount")),
        currency=(str(content.get("currency") or "") or None),
        comment=(str(content.get("comment") or "") or None),
        entity_type=(str(content.get("entity_type") or "") or None),
        entity_id=(int(content.get("entity_id")) if content.get("entity_id") is not None else None),
        team_id=(int(content.get("team_id")) if content.get("team_id") is not None else None),
        attempt=int(content.get("attempt") or 1),
        review=(content.get("review") if isinstance(content.get("review"), dict) else None),
        created_at=payment.created_at,
        updated_at=payment.updated_at,
    )


def _resolve_payment_registration(db: Session, payment: PersohubPayment) -> Optional[PersohubEventRegistration]:
    content = _payment_content_dict(payment)
    entity_type = str(content.get("entity_type") or "").strip().lower()
    team_id = content.get("team_id")
    if entity_type == "team" and team_id is not None:
        return db.query(PersohubEventRegistration).filter(
            PersohubEventRegistration.event_id == payment.event_id,
            PersohubEventRegistration.team_id == int(team_id),
            PersohubEventRegistration.entity_type == PdaEventEntityType.TEAM,
        ).first()
    return db.query(PersohubEventRegistration).filter(
        PersohubEventRegistration.event_id == payment.event_id,
        PersohubEventRegistration.user_id == payment.user_id,
        PersohubEventRegistration.entity_type == PdaEventEntityType.USER,
    ).first()


def _ensure_payment_registration_row(db: Session, payment: PersohubPayment) -> PersohubEventRegistration:
    existing = _resolve_payment_registration(db, payment)
    if existing:
        return existing
    content = _payment_content_dict(payment)
    entity_type = str(content.get("entity_type") or "").strip().lower()
    team_id = content.get("team_id")
    if entity_type == "team" and team_id is not None:
        row = PersohubEventRegistration(
            event_id=payment.event_id,
            user_id=None,
            team_id=int(team_id),
            entity_type=PdaEventEntityType.TEAM,
            status=PdaEventRegistrationStatus.PENDING,
        )
    else:
        row = PersohubEventRegistration(
            event_id=payment.event_id,
            user_id=payment.user_id,
            team_id=None,
            entity_type=PdaEventEntityType.USER,
            status=PdaEventRegistrationStatus.PENDING,
        )
    db.add(row)
    db.flush()
    return row


def _send_payment_status_email(
    participant: Optional[PdaUser],
    event: PersohubEvent,
    *,
    state: str,
    reason: Optional[str] = None,
) -> None:
    if not participant or not participant.email:
        return
    safe_name = str(participant.name or "Participant")
    event_title = str(event.title or "event")
    whatsapp_url = str(getattr(event, "whatsapp_url", "") or "").strip()
    whatsapp_text = f"\nJoin updates: {whatsapp_url}\n" if whatsapp_url else ""
    if state == "submitted":
        subject = f"Payment received for review - {event_title}"
        text = (
            f"Hello {safe_name},\n\n"
            f"We received your payment proof for {event_title}.\n"
            "Your registration is now pending confirmation.\n"
            f"{whatsapp_text}\n"
            "Regards,\nPersohub Team"
        )
    elif state == "approved":
        subject = f"Registration confirmed - {event_title}"
        text = (
            f"Hello {safe_name},\n\n"
            f"Your payment has been approved and your registration for {event_title} is confirmed.\n"
            f"{whatsapp_text}\n"
            "Regards,\nPersohub Team"
        )
    else:
        subject = f"Payment review update - {event_title}"
        reason_text = f"\nReason: {reason}\n" if reason else "\n"
        text = (
            f"Hello {safe_name},\n\n"
            f"Your payment submission for {event_title} was declined."
            f"{reason_text}"
            "You can resubmit payment proof from the event dashboard.\n\n"
            "Regards,\nPersohub Team"
        )
    html = "<html><body>" + "".join(f"<p>{line}</p>" for line in text.split("\n") if line) + "</body></html>"
    try:
        send_email_async(participant.email, subject, html, text)
    except Exception:
        pass


def _upsert_policy_slug_for_club_admin_rows(db: Session, club_id: int, slug: str) -> None:
    rows = (
        db.query(PersohubAdmin)
        .join(PersohubCommunity, PersohubCommunity.id == PersohubAdmin.community_id)
        .filter(PersohubCommunity.club_id == club_id)
        .all()
    )
    for row in rows:
        policy = _ensure_events_policy_shape(row.policy)
        if slug not in policy["events"]:
            policy["events"][slug] = False
        row.policy = policy


def _remove_policy_slug_for_club_admin_rows(db: Session, club_id: int, slug: str) -> None:
    rows = (
        db.query(PersohubAdmin)
        .join(PersohubCommunity, PersohubCommunity.id == PersohubAdmin.community_id)
        .filter(PersohubCommunity.club_id == club_id)
        .all()
    )
    for row in rows:
        policy = _ensure_events_policy_shape(row.policy)
        if slug in policy["events"]:
            del policy["events"][slug]
            row.policy = policy


@router.get("/persohub/admin/persohub-events", response_model=List[PersohubAdminEventResponse])
def list_admin_events(
    request: Request,
    response: Response,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    q: Optional[str] = Query(default=None),
    community: PersohubCommunity = Depends(require_persohub_community),
    db: Session = Depends(get_db),
):
    _assert_persohub_admin_token(request)
    _assert_can_access_events(request)

    club_id = _resolve_actor_club_id(request, community)
    query = (
        db.query(PersohubEvent, PersohubSympo)
        .outerjoin(PersohubSympoEvent, PersohubSympoEvent.event_id == PersohubEvent.id)
        .outerjoin(PersohubSympo, PersohubSympo.id == PersohubSympoEvent.sympo_id)
        .filter(PersohubEvent.club_id == club_id)
    )

    if not is_persohub_club_owner(request):
        policy = get_persohub_actor_policy(request)
        events_map = policy.get("events") if isinstance(policy.get("events"), dict) else {}
        allowed_slugs = [slug for slug, allowed in events_map.items() if bool(allowed)]
        if not allowed_slugs:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin policy does not allow event access")
        query = query.filter(PersohubEvent.slug.in_(allowed_slugs))

    if q and q.strip():
        keyword = f"%{q.strip()}%"
        query = query.filter(
            or_(
                PersohubEvent.title.ilike(keyword),
                PersohubEvent.slug.ilike(keyword),
                PersohubEvent.event_code.ilike(keyword),
            )
        )

    total_count = int(query.count())
    rows = (
        query.order_by(PersohubEvent.created_at.desc(), PersohubEvent.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    response.headers["X-Total-Count"] = str(total_count)
    response.headers["X-Page"] = str(page)
    response.headers["X-Page-Size"] = str(page_size)
    return [_serialize_event(event, sympo) for event, sympo in rows]


@router.get("/persohub/admin/persohub-sympo-options", response_model=List[PersohubAdminSympoOption])
def list_admin_sympo_options(
    request: Request,
    community: PersohubCommunity = Depends(require_persohub_community),
    db: Session = Depends(get_db),
):
    _assert_persohub_admin_token(request)
    _assert_owner(request)
    rows = (
        db.query(PersohubSympo, PersohubClub)
        .join(PersohubClub, PersohubClub.id == PersohubSympo.organising_club_id)
        .order_by(PersohubSympo.name.asc(), PersohubSympo.id.asc())
        .all()
    )
    return [
        PersohubAdminSympoOption(
            id=sympo.id,
            name=sympo.name,
            organising_club_id=sympo.organising_club_id,
            organising_club_name=club.name,
        )
        for sympo, club in rows
    ]


@router.post("/persohub/admin/persohub-events", response_model=PersohubAdminEventResponse)
def create_admin_event(
    payload: PersohubAdminEventCreateRequest,
    request: Request,
    community: PersohubCommunity = Depends(require_persohub_community),
    db: Session = Depends(get_db),
):
    _assert_persohub_admin_token(request)
    _assert_owner(request)

    club_id = _resolve_actor_club_id(request, community)
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
    seat_availability_enabled = bool(payload.seat_availability_enabled)
    seat_capacity = int(payload.seat_capacity or 100) if seat_availability_enabled else (
        int(payload.seat_capacity) if payload.seat_capacity is not None else None
    )

    event = PersohubEvent(
        slug=_next_slug(db, payload.title),
        event_code=_next_event_code(db),
        club_id=club_id,
        community_id=None,
        title=payload.title.strip(),
        description=payload.description,
        start_date=payload.start_date,
        end_date=payload.end_date,
        event_time=payload.event_time,
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
        registration_fee=(payload.registration_fee.model_dump() if payload.registration_fee else None),
        seat_availability_enabled=seat_availability_enabled,
        seat_capacity=seat_capacity,
        is_visible=True,
        open_for=_to_event_open_for(payload.open_for),
        status=PdaEventStatus.CLOSED,
    )
    db.add(event)
    db.flush()

    for round_no in range(1, round_count + 1):
        db.add(
            PersohubEventRound(
                event_id=event.id,
                round_no=round_no,
                name=f"Round {round_no}",
                mode=event.format,
                state=PdaEventRoundState.DRAFT,
                evaluation_criteria=_DEFAULT_ROUND_CRITERIA,
            )
        )

    _upsert_policy_slug_for_club_admin_rows(db, club_id, event.slug)
    _log_persohub_event_action(
        db,
        community,
        action="create_persohub_managed_event",
        method=request.method,
        path=request.url.path,
        event=event,
        meta={"event_id": event.id, "slug": event.slug, "club_id": club_id},
        actor_user_id=get_persohub_actor_user_id(request),
    )

    db.commit()
    db.refresh(event)
    return _serialize_event(event)


@router.put("/persohub/admin/persohub-events/{slug}", response_model=PersohubAdminEventResponse)
def update_admin_event(
    slug: str,
    payload: PersohubAdminEventUpdateRequest,
    request: Request,
    community: PersohubCommunity = Depends(require_persohub_community),
    db: Session = Depends(get_db),
):
    _assert_persohub_admin_token(request)
    _assert_owner(request)

    club_id = _resolve_actor_club_id(request, community)
    event = _get_event_or_404(db, slug, club_id)
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
    if "open_for" in updates:
        updates["open_for"] = _to_event_open_for(payload.open_for)
    if "external_url_name" in updates:
        updates["external_url_name"] = str(updates.get("external_url_name") or "").strip() or _DEFAULT_EVENT_ACTION
    if "registration_fee" in updates:
        updates["registration_fee"] = dict(updates["registration_fee"] or {}) if updates["registration_fee"] else None
    if "seat_availability_enabled" in updates:
        updates["seat_availability_enabled"] = bool(updates["seat_availability_enabled"])
    if "seat_capacity" in updates:
        updates["seat_capacity"] = int(updates["seat_capacity"]) if updates["seat_capacity"] is not None else None

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

    next_seat_availability_enabled = bool(
        updates["seat_availability_enabled"]
        if "seat_availability_enabled" in updates
        else getattr(event, "seat_availability_enabled", False)
    )
    if next_seat_availability_enabled:
        current_capacity = int(event.seat_capacity) if event.seat_capacity is not None else None
        resolved_capacity = updates["seat_capacity"] if "seat_capacity" in updates else current_capacity
        if resolved_capacity is None or int(resolved_capacity) < 1:
            resolved_capacity = 100
        updates["seat_capacity"] = int(resolved_capacity)

    for field, value in updates.items():
        setattr(event, field, value)

    _log_persohub_event_action(
        db,
        community,
        action="update_persohub_managed_event",
        method=request.method,
        path=request.url.path,
        event=event,
        meta={"event_id": event.id, "slug": event.slug, "updated_fields": sorted(list(updates.keys()))},
        actor_user_id=get_persohub_actor_user_id(request),
    )

    db.commit()
    db.refresh(event)
    return _serialize_event(event)


@router.get("/persohub/admin/payments", response_model=List[PersohubAdminPaymentReviewListItem])
def list_owner_payments(
    request: Request,
    response: Response,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    community: PersohubCommunity = Depends(require_persohub_community),
    db: Session = Depends(get_db),
):
    _assert_persohub_admin_token(request)
    _assert_owner(request)
    club_id = _resolve_actor_club_id(request, community)
    rows = (
        db.query(PersohubPayment, PersohubEvent, PdaUser, PersohubClub)
        .join(PersohubEvent, PersohubEvent.id == PersohubPayment.event_id)
        .join(PdaUser, PdaUser.id == PersohubPayment.user_id)
        .outerjoin(PersohubClub, PersohubClub.id == PersohubEvent.club_id)
        .filter(PersohubEvent.club_id == club_id)
        .order_by(PersohubPayment.created_at.desc(), PersohubPayment.id.desc())
        .all()
    )
    items = [_build_payment_list_item(payment, event, participant, club) for payment, event, participant, club in rows]
    items.sort(
        key=lambda row: (
            0 if str(row.status or "").strip().lower() == "pending" else 1,
            -(row.created_at.timestamp() if row.created_at else 0.0),
            -int(row.id),
        )
    )

    total_count = len(items)
    start = (page - 1) * page_size
    end = start + page_size
    paged_items = items[start:end]

    response.headers["X-Total-Count"] = str(total_count)
    response.headers["X-Page"] = str(page)
    response.headers["X-Page-Size"] = str(page_size)
    return paged_items


@router.post("/persohub/admin/payments/{payment_id}/confirm", response_model=PersohubAdminPaymentReviewListItem)
def confirm_owner_payment(
    payment_id: int,
    payload: PersohubAdminPaymentConfirmRequest,
    request: Request,
    community: PersohubCommunity = Depends(require_persohub_community),
    db: Session = Depends(get_db),
):
    _assert_persohub_admin_token(request)
    _assert_owner(request)
    club_id = _resolve_actor_club_id(request, community)
    row = (
        db.query(PersohubPayment, PersohubEvent, PdaUser, PersohubClub)
        .join(PersohubEvent, PersohubEvent.id == PersohubPayment.event_id)
        .join(PdaUser, PdaUser.id == PersohubPayment.user_id)
        .outerjoin(PersohubClub, PersohubClub.id == PersohubEvent.club_id)
        .filter(PersohubPayment.id == payment_id, PersohubEvent.club_id == club_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment not found")
    payment, event, participant, club = row
    current_status = _payment_status(payment)
    if current_status != "pending":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Payment is already {current_status}")

    actor_user_id = int(get_persohub_actor_user_id(request) or 0)
    actor = db.query(PdaUser).filter(PdaUser.id == actor_user_id).first() if actor_user_id > 0 else None
    if not actor or not actor.hashed_password:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Approver account unavailable")
    if not verify_password(payload.password, actor.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid password")

    content = _payment_content_dict(payment)
    content["status"] = "approved"
    content["review"] = {
        "by_user_id": int(actor.id),
        "by_name": str(actor.name or ""),
        "at": datetime.now(timezone.utc).isoformat(),
        "reason": None,
    }
    payment.content = content

    registration = _ensure_payment_registration_row(db, payment)
    registration.status = PdaEventRegistrationStatus.ACTIVE

    _log_persohub_event_action(
        db,
        community,
        action="confirm_persohub_payment",
        method=request.method,
        path=request.url.path,
        event=event,
        meta={"payment_id": int(payment.id), "status": "approved"},
        actor_user_id=get_persohub_actor_user_id(request),
    )
    _send_payment_status_email(participant, event, state="approved")
    db.commit()
    db.refresh(payment)
    return _build_payment_list_item(payment, event, participant, club)


@router.post("/persohub/admin/payments/{payment_id}/decline", response_model=PersohubAdminPaymentReviewListItem)
def decline_owner_payment(
    payment_id: int,
    payload: PersohubAdminPaymentDeclineRequest,
    request: Request,
    community: PersohubCommunity = Depends(require_persohub_community),
    db: Session = Depends(get_db),
):
    _assert_persohub_admin_token(request)
    _assert_owner(request)
    club_id = _resolve_actor_club_id(request, community)
    row = (
        db.query(PersohubPayment, PersohubEvent, PdaUser, PersohubClub)
        .join(PersohubEvent, PersohubEvent.id == PersohubPayment.event_id)
        .join(PdaUser, PdaUser.id == PersohubPayment.user_id)
        .outerjoin(PersohubClub, PersohubClub.id == PersohubEvent.club_id)
        .filter(PersohubPayment.id == payment_id, PersohubEvent.club_id == club_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment not found")
    payment, event, participant, club = row
    current_status = _payment_status(payment)
    if current_status != "pending":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Payment is already {current_status}")

    actor_user_id = int(get_persohub_actor_user_id(request) or 0)
    actor = db.query(PdaUser).filter(PdaUser.id == actor_user_id).first() if actor_user_id > 0 else None

    content = _payment_content_dict(payment)
    content["status"] = "declined"
    content["review"] = {
        "by_user_id": int(actor.id) if actor else None,
        "by_name": str(actor.name or "") if actor else None,
        "at": datetime.now(timezone.utc).isoformat(),
        "reason": payload.reason,
    }
    payment.content = content

    registration = _ensure_payment_registration_row(db, payment)
    registration.status = PdaEventRegistrationStatus.PENDING

    _log_persohub_event_action(
        db,
        community,
        action="decline_persohub_payment",
        method=request.method,
        path=request.url.path,
        event=event,
        meta={"payment_id": int(payment.id), "status": "declined", "reason": payload.reason},
        actor_user_id=get_persohub_actor_user_id(request),
    )
    _send_payment_status_email(participant, event, state="declined", reason=payload.reason)
    db.commit()
    db.refresh(payment)
    return _build_payment_list_item(payment, event, participant, club)


@router.put("/persohub/admin/persohub-events/{slug}/sympo", response_model=PersohubAdminEventSympoAssignResponse)
def assign_admin_event_sympo(
    slug: str,
    payload: PersohubAdminEventSympoAssignRequest,
    request: Request,
    community: PersohubCommunity = Depends(require_persohub_community),
    db: Session = Depends(get_db),
):
    _assert_persohub_admin_token(request)
    _assert_owner(request)

    club_id = _resolve_actor_club_id(request, community)
    event = _get_event_or_404(db, slug, club_id)
    existing = db.query(PersohubSympoEvent).filter(PersohubSympoEvent.event_id == event.id).first()
    previous_sympo_id = existing.sympo_id if existing else None

    next_sympo = None
    if payload.sympo_id is not None:
        next_sympo = db.query(PersohubSympo).filter(PersohubSympo.id == payload.sympo_id).first()
        if not next_sympo:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sympo not found")

    if existing and next_sympo and existing.sympo_id == next_sympo.id:
        return PersohubAdminEventSympoAssignResponse(
            event_id=event.id,
            sympo_id=next_sympo.id,
            sympo_name=next_sympo.name,
            message="Event already mapped to selected sympo",
        )

    if existing:
        db.delete(existing)
        db.flush()
    if next_sympo:
        db.add(PersohubSympoEvent(sympo_id=next_sympo.id, event_id=event.id))

    _log_persohub_event_action(
        db,
        community,
        action="assign_persohub_event_sympo",
        method=request.method,
        path=request.url.path,
        event=event,
        meta={
            "event_id": event.id,
            "slug": event.slug,
            "previous_sympo_id": previous_sympo_id,
            "next_sympo_id": (next_sympo.id if next_sympo else None),
        },
        actor_user_id=get_persohub_actor_user_id(request),
    )
    db.commit()
    return PersohubAdminEventSympoAssignResponse(
        event_id=event.id,
        sympo_id=(next_sympo.id if next_sympo else None),
        sympo_name=(next_sympo.name if next_sympo else None),
        message=("Event unassigned from sympo" if next_sympo is None else "Event mapped to sympo"),
    )


@router.delete("/persohub/admin/persohub-events/{slug}")
def delete_admin_event(
    slug: str,
    request: Request,
    community: PersohubCommunity = Depends(require_persohub_community),
    db: Session = Depends(get_db),
):
    _assert_persohub_admin_token(request)
    _assert_owner(request)

    club_id = _resolve_actor_club_id(request, community)
    event = _get_event_or_404(db, slug, club_id)
    event_id = int(event.id)
    event_slug = str(event.slug)

    team_ids = [
        int(row[0])
        for row in db.query(PersohubEventTeam.id).filter(PersohubEventTeam.event_id == event_id).all()
    ]
    round_ids = [
        int(row[0])
        for row in db.query(PersohubEventRound.id).filter(PersohubEventRound.event_id == event_id).all()
    ]

    if team_ids:
        db.query(PersohubEventRoundPanelAssignment).filter(PersohubEventRoundPanelAssignment.team_id.in_(team_ids)).delete(synchronize_session=False)
        db.query(PersohubEventInvite).filter(PersohubEventInvite.team_id.in_(team_ids)).delete(synchronize_session=False)
        delete_badges_for_persohub_teams(db, team_ids)
        db.query(PersohubEventScore).filter(PersohubEventScore.team_id.in_(team_ids)).delete(synchronize_session=False)
        db.query(PersohubEventRoundSubmission).filter(PersohubEventRoundSubmission.team_id.in_(team_ids)).delete(synchronize_session=False)
        db.query(PersohubEventAttendance).filter(PersohubEventAttendance.team_id.in_(team_ids)).delete(synchronize_session=False)
        db.query(PersohubEventRegistration).filter(PersohubEventRegistration.team_id.in_(team_ids)).delete(synchronize_session=False)
        db.query(PersohubEventTeamMember).filter(PersohubEventTeamMember.team_id.in_(team_ids)).delete(synchronize_session=False)

    if round_ids:
        db.query(PersohubEventRoundPanelAssignment).filter(PersohubEventRoundPanelAssignment.round_id.in_(round_ids)).delete(synchronize_session=False)
        db.query(PersohubEventRoundPanelMember).filter(PersohubEventRoundPanelMember.round_id.in_(round_ids)).delete(synchronize_session=False)
        db.query(PersohubEventRoundPanel).filter(PersohubEventRoundPanel.round_id.in_(round_ids)).delete(synchronize_session=False)
        db.query(PersohubEventScore).filter(PersohubEventScore.round_id.in_(round_ids)).delete(synchronize_session=False)
        db.query(PersohubEventRoundSubmission).filter(PersohubEventRoundSubmission.round_id.in_(round_ids)).delete(synchronize_session=False)
        db.query(PersohubEventAttendance).filter(PersohubEventAttendance.round_id.in_(round_ids)).delete(synchronize_session=False)

    db.query(PersohubEventInvite).filter(PersohubEventInvite.event_id == event_id).delete(synchronize_session=False)
    delete_badges_for_persohub_event(db, event_id)
    db.query(PersohubEventRoundPanelAssignment).filter(PersohubEventRoundPanelAssignment.event_id == event_id).delete(synchronize_session=False)
    db.query(PersohubEventRoundPanelMember).filter(PersohubEventRoundPanelMember.event_id == event_id).delete(synchronize_session=False)
    db.query(PersohubEventRoundPanel).filter(PersohubEventRoundPanel.event_id == event_id).delete(synchronize_session=False)
    db.query(PersohubEventScore).filter(PersohubEventScore.event_id == event_id).delete(synchronize_session=False)
    db.query(PersohubEventRoundSubmission).filter(PersohubEventRoundSubmission.event_id == event_id).delete(synchronize_session=False)
    db.query(PersohubEventAttendance).filter(PersohubEventAttendance.event_id == event_id).delete(synchronize_session=False)
    db.query(PersohubEventRegistration).filter(PersohubEventRegistration.event_id == event_id).delete(synchronize_session=False)
    db.query(PersohubEventTeamMember).filter(
        PersohubEventTeamMember.team_id.in_(
            db.query(PersohubEventTeam.id).filter(PersohubEventTeam.event_id == event_id)
        )
    ).delete(synchronize_session=False)
    db.query(PersohubEventTeam).filter(PersohubEventTeam.event_id == event_id).delete(synchronize_session=False)
    db.query(PersohubEventRound).filter(PersohubEventRound.event_id == event_id).delete(synchronize_session=False)
    db.query(PersohubSympoEvent).filter(PersohubSympoEvent.event_id == event_id).delete(synchronize_session=False)
    db.query(PersohubEventLog).filter(
        (PersohubEventLog.event_id == event_id) | (PersohubEventLog.event_slug == event_slug)
    ).delete(synchronize_session=False)

    _remove_policy_slug_for_club_admin_rows(db, club_id, event_slug)
    _log_persohub_event_action(
        db,
        community,
        action="delete_persohub_managed_event",
        method=request.method,
        path=request.url.path,
        event=None,
        event_slug=event_slug,
        meta={"event_id": event_id, "slug": event_slug, "club_id": club_id},
        actor_user_id=get_persohub_actor_user_id(request),
    )

    db.delete(event)
    db.commit()
    return {"message": "Event deleted"}
