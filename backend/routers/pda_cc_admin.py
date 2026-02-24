from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from auth import get_password_hash, verify_password
from database import get_db
from emailer import send_email_async
from models import (
    PersohubEvent,
    PersohubEventEntityType,
    PersohubEventRegistration,
    PersohubEventRegistrationStatus,
    PersohubPayment,
    PersohubSympo,
    PersohubSympoEvent,
    PdaUser,
    PersohubAdmin,
    PersohubClub,
    PersohubCommunity,
    PersohubPost,
)
from schemas import (
    CcAdminUserOption,
    CcClubCreateRequest,
    CcClubResponse,
    CcClubUpdateRequest,
    CcCommunityAdminMemberResponse,
    CcCommunityCreateRequest,
    CcPersohubEventOption,
    CcPersohubEventSympoAssignRequest,
    CcPersohubEventSympoAssignResponse,
    CcPersohubPaymentConfirmRequest,
    CcPersohubPaymentDeclineRequest,
    CcPersohubPaymentReviewListItem,
    CcCommunityResetPasswordRequest,
    CcCommunityResponse,
    CcCommunityUpdateRequest,
    CcDeleteSummaryResponse,
    CcSympoCreateRequest,
    CcSympoResponse,
    CcSympoUpdateRequest,
    PresignRequest,
    PresignResponse,
)
from security import require_superadmin
from utils import _generate_presigned_put_url, log_admin_action

router = APIRouter()

_ALLOWED_LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"]


def _build_club_response(db: Session, club: PersohubClub) -> CcClubResponse:
    linked_community_count = int(
        db.query(PersohubCommunity)
        .filter(PersohubCommunity.club_id == club.id)
        .count()
    )
    owner = db.query(PdaUser).filter(PdaUser.id == club.owner_user_id).first() if club.owner_user_id else None
    return CcClubResponse(
        id=club.id,
        name=club.name,
        profile_id=club.profile_id,
        club_url=club.club_url,
        club_logo_url=club.club_logo_url,
        club_tagline=club.club_tagline,
        club_description=club.club_description,
        payment_url_image=club.payment_url_image,
        payment_id=club.payment_id,
        owner_user_id=(int(club.owner_user_id) if club.owner_user_id else None),
        owner_name=(str(owner.name or "") or None) if owner else None,
        owner_regno=(str(owner.regno or "") or None) if owner else None,
        linked_community_count=linked_community_count,
        created_at=club.created_at,
        updated_at=club.updated_at,
    )


def _build_community_response(
    community: PersohubCommunity,
    club: Optional[PersohubClub],
    admin_members: List[CcCommunityAdminMemberResponse],
) -> CcCommunityResponse:
    active_admins = [member for member in admin_members if member.is_active]
    active_admins.sort(key=lambda item: (int(item.user_id), str(item.name or "").lower()))
    primary_admin = active_admins[0] if active_admins else None
    return CcCommunityResponse(
        id=community.id,
        name=community.name,
        profile_id=community.profile_id,
        club_id=community.club_id,
        club_name=(club.name if club else None),
        admin_id=(primary_admin.user_id if primary_admin else None),
        admin_name=(primary_admin.name if primary_admin else None),
        admin_regno=(primary_admin.regno if primary_admin else None),
        admins=admin_members,
        logo_url=community.logo_url,
        description=community.description,
        is_active=community.is_active,
        is_root=community.is_root,
        created_at=community.created_at,
        updated_at=community.updated_at,
    )


def _build_sympo_response(db: Session, sympo: PersohubSympo, club_name: Optional[str]) -> CcSympoResponse:
    linked_events = (
        db.query(PersohubSympoEvent, PersohubEvent)
        .join(PersohubEvent, PersohubEvent.id == PersohubSympoEvent.event_id)
        .filter(PersohubSympoEvent.sympo_id == sympo.id)
        .order_by(PersohubEvent.title.asc(), PersohubEvent.id.asc())
        .all()
    )
    return CcSympoResponse(
        id=sympo.id,
        name=sympo.name,
        organising_club_id=sympo.organising_club_id,
        organising_club_name=club_name,
        content=sympo.content,
        event_ids=[item[0].event_id for item in linked_events],
        event_titles=[item[1].title for item in linked_events],
        created_at=sympo.created_at,
        updated_at=sympo.updated_at,
    )


def _assert_club_exists(db: Session, club_id: Optional[int]) -> Optional[PersohubClub]:
    if club_id is None:
        return None
    club = db.query(PersohubClub).filter(PersohubClub.id == club_id).first()
    if not club:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Club not found")
    return club


def _normalize_requested_community_admins(
    payload_admins: Optional[List[dict]],
    fallback_admin_id: Optional[int],
) -> List[dict]:
    members: List[dict] = []
    for raw in payload_admins or []:
        user_id = int(raw.get("user_id") or 0)
        is_active = bool(raw.get("is_active", True))
        if user_id <= 0:
            continue
        members.append({"user_id": user_id, "role": "admin", "is_active": is_active})

    if not members and fallback_admin_id:
        members = [{"user_id": int(fallback_admin_id), "role": "admin", "is_active": True}]

    if not members:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="At least one admin assignment is required")

    deduped_map: Dict[int, dict] = {}
    for member in members:
        deduped_map[int(member["user_id"])] = member
    deduped = list(deduped_map.values())

    for member in deduped:
        member["role"] = "admin"
        member["is_active"] = bool(member["is_active"])

    active_count = sum(1 for member in deduped if member["is_active"])
    if active_count < 1:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="At least one active admin is required")

    deduped.sort(key=lambda member: int(member["user_id"]))
    return deduped


def _assert_admin_users_exist(db: Session, user_ids: List[int]) -> Dict[int, PdaUser]:
    if not user_ids:
        return {}
    rows = db.query(PdaUser).filter(PdaUser.id.in_(user_ids)).all()
    users_by_id = {int(row.id): row for row in rows}
    missing_ids = [user_id for user_id in user_ids if user_id not in users_by_id]
    if missing_ids:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Admin user(s) not found: {', '.join(str(item) for item in missing_ids)}",
        )
    return users_by_id


def _sync_community_admin_members(
    db: Session,
    *,
    community_id: int,
    member_specs: List[dict],
    created_by_user_id: Optional[int],
) -> int:
    existing_rows = db.query(PersohubAdmin).filter(PersohubAdmin.community_id == community_id).all()
    existing_by_user_id = {int(row.user_id): row for row in existing_rows}
    incoming_user_ids = {int(item["user_id"]) for item in member_specs}

    primary_admin_id = None
    for spec in member_specs:
        user_id = int(spec["user_id"])
        role = "admin"
        is_active = bool(spec["is_active"])
        row = existing_by_user_id.get(user_id)
        if row:
            row.role = role
            row.is_active = is_active
            if created_by_user_id and not row.created_by_user_id:
                row.created_by_user_id = created_by_user_id
        else:
            db.add(
                PersohubAdmin(
                    community_id=community_id,
                    user_id=user_id,
                    role=role,
                    is_active=is_active,
                    policy={"events": {}},
                    created_by_user_id=created_by_user_id,
                )
            )
        if is_active and primary_admin_id is None:
            primary_admin_id = user_id

    for row in existing_rows:
        if int(row.user_id) in incoming_user_ids:
            continue
        row.is_active = False
        row.role = "admin"

    if primary_admin_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="At least one active admin is required")
    return primary_admin_id


def _load_community_admin_members(
    db: Session,
    community_ids: List[int],
) -> Dict[int, List[CcCommunityAdminMemberResponse]]:
    if not community_ids:
        return {}
    rows = (
        db.query(PersohubAdmin, PdaUser)
        .join(PdaUser, PdaUser.id == PersohubAdmin.user_id)
        .filter(PersohubAdmin.community_id.in_(community_ids))
        .order_by(
            PersohubAdmin.community_id.asc(),
            PersohubAdmin.is_active.desc(),
            PersohubAdmin.role.asc(),
            PdaUser.name.asc(),
            PdaUser.id.asc(),
        )
        .all()
    )
    grouped: Dict[int, List[CcCommunityAdminMemberResponse]] = {}
    for membership, user in rows:
        grouped.setdefault(int(membership.community_id), []).append(
            CcCommunityAdminMemberResponse(
                id=int(membership.id),
                user_id=int(membership.user_id),
                regno=str(user.regno or ""),
                name=str(user.name or ""),
                role="admin",
                is_active=bool(membership.is_active),
                created_at=membership.created_at,
            )
        )
    for community_id, members in grouped.items():
        grouped[community_id] = sorted(
            members,
            key=lambda item: (0 if item.is_active else 1, item.name or "", int(item.user_id)),
        )
    return grouped


def _validate_event_ids(db: Session, event_ids: List[int]) -> None:
    existing = {
        row[0]
        for row in db.query(PersohubEvent.id)
        .filter(PersohubEvent.id.in_(event_ids))
        .all()
    }
    missing = [event_id for event_id in event_ids if event_id not in existing]
    if missing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"message": "Some events were not found", "missing_event_ids": missing},
        )


def _check_event_conflicts(
    db: Session,
    event_ids: List[int],
    *,
    exclude_sympo_id: Optional[int] = None,
) -> None:
    if not event_ids:
        return
    query = db.query(PersohubSympoEvent).filter(PersohubSympoEvent.event_id.in_(event_ids))
    if exclude_sympo_id is not None:
        query = query.filter(PersohubSympoEvent.sympo_id != exclude_sympo_id)
    rows = query.all()
    if not rows:
        return
    conflict_event_ids = sorted({row.event_id for row in rows})
    raise HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail={"message": "Some events are already mapped to another sympo", "event_ids": conflict_event_ids},
    )


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


def _resolve_payment_registration(db: Session, payment: PersohubPayment) -> Optional[PersohubEventRegistration]:
    content = _payment_content_dict(payment)
    entity_type = str(content.get("entity_type") or "").strip().lower()
    team_id = content.get("team_id")
    if entity_type == "team" and team_id is not None:
        return db.query(PersohubEventRegistration).filter(
            PersohubEventRegistration.event_id == payment.event_id,
            PersohubEventRegistration.team_id == int(team_id),
            PersohubEventRegistration.entity_type == PersohubEventEntityType.TEAM,
        ).first()
    return db.query(PersohubEventRegistration).filter(
        PersohubEventRegistration.event_id == payment.event_id,
        PersohubEventRegistration.user_id == payment.user_id,
        PersohubEventRegistration.entity_type == PersohubEventEntityType.USER,
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
            entity_type=PersohubEventEntityType.TEAM,
            status=PersohubEventRegistrationStatus.PENDING,
        )
    else:
        row = PersohubEventRegistration(
            event_id=payment.event_id,
            user_id=payment.user_id,
            team_id=None,
            entity_type=PersohubEventEntityType.USER,
            status=PersohubEventRegistrationStatus.PENDING,
        )
    db.add(row)
    db.flush()
    return row


def _build_payment_list_item(
    payment: PersohubPayment,
    event: PersohubEvent,
    participant: Optional[PdaUser],
    club: Optional[PersohubClub],
) -> CcPersohubPaymentReviewListItem:
    content = _payment_content_dict(payment)
    return CcPersohubPaymentReviewListItem(
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
    if state == "approved":
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


@router.get("/pda-admin/cc/clubs", response_model=List[CcClubResponse])
def list_cc_clubs(
    _: PdaUser = Depends(require_superadmin),
    db: Session = Depends(get_db),
):
    clubs = db.query(PersohubClub).order_by(PersohubClub.name.asc(), PersohubClub.id.asc()).all()
    return [_build_club_response(db, club) for club in clubs]


@router.post("/pda-admin/cc/clubs", response_model=CcClubResponse)
def create_cc_club(
    payload: CcClubCreateRequest,
    admin: PdaUser = Depends(require_superadmin),
    db: Session = Depends(get_db),
    request: Request = None,
):
    if payload.owner_user_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="owner_user_id is required")
    _assert_admin_users_exist(db, [int(payload.owner_user_id)])
    if db.query(PersohubClub).filter(PersohubClub.profile_id == payload.profile_id).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Club profile_id already exists")

    club = PersohubClub(**payload.model_dump())
    db.add(club)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Club with this name/profile_id already exists")

    db.refresh(club)
    log_admin_action(
        db,
        admin,
        "Create C&C club",
        request.method if request else None,
        request.url.path if request else None,
        {"club_id": club.id, "profile_id": club.profile_id},
    )
    return _build_club_response(db, club)


@router.put("/pda-admin/cc/clubs/{club_id}", response_model=CcClubResponse)
def update_cc_club(
    club_id: int,
    payload: CcClubUpdateRequest,
    admin: PdaUser = Depends(require_superadmin),
    db: Session = Depends(get_db),
    request: Request = None,
):
    club = db.query(PersohubClub).filter(PersohubClub.id == club_id).first()
    if not club:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Club not found")

    updates = payload.model_dump(exclude_unset=True)
    if "owner_user_id" in updates:
        if updates["owner_user_id"] is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="owner_user_id cannot be null")
        _assert_admin_users_exist(db, [int(updates["owner_user_id"])])
    elif int(club.owner_user_id or 0) <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="owner_user_id is required")
    if "profile_id" in updates:
        existing = (
            db.query(PersohubClub)
            .filter(PersohubClub.profile_id == updates["profile_id"], PersohubClub.id != club_id)
            .first()
        )
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Club profile_id already exists")

    for key, value in updates.items():
        setattr(club, key, value)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Club update conflicts with existing record")

    db.refresh(club)
    log_admin_action(
        db,
        admin,
        "Update C&C club",
        request.method if request else None,
        request.url.path if request else None,
        {"club_id": club.id, "updated_fields": sorted(list(updates.keys()))},
    )
    return _build_club_response(db, club)


@router.delete("/pda-admin/cc/clubs/{club_id}", response_model=CcDeleteSummaryResponse)
def delete_cc_club(
    club_id: int,
    admin: PdaUser = Depends(require_superadmin),
    db: Session = Depends(get_db),
    request: Request = None,
):
    club = db.query(PersohubClub).filter(PersohubClub.id == club_id).first()
    if not club:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Club not found")

    community_ids = [
        row[0]
        for row in db.query(PersohubCommunity.id)
        .filter(PersohubCommunity.club_id == club_id)
        .all()
    ]
    deleted_counts: Dict[str, int] = {
        "linked_communities": len(community_ids),
        "linked_posts": 0,
        "linked_events": 0,
        "legacy_sympo_rows": 0,
        "normalized_sympos": 0,
    }
    if community_ids:
        deleted_counts["linked_posts"] = int(
            db.query(PersohubPost).filter(PersohubPost.community_id.in_(community_ids)).count()
        )
    deleted_counts["linked_events"] = int(
        db.query(PersohubEvent).filter(PersohubEvent.club_id == club_id).count()
    )

    deleted_counts["legacy_sympo_rows"] = 0
    deleted_counts["normalized_sympos"] = int(
        db.query(PersohubSympo).filter(PersohubSympo.organising_club_id == club_id).count()
    )

    if community_ids:
        db.query(PersohubCommunity).filter(PersohubCommunity.id.in_(community_ids)).delete(synchronize_session=False)

    db.delete(club)
    db.commit()

    log_admin_action(
        db,
        admin,
        "Delete C&C club",
        request.method if request else None,
        request.url.path if request else None,
        {"club_id": club_id, "deleted_counts": deleted_counts},
    )

    return CcDeleteSummaryResponse(
        message="Club deleted with cascade cleanup",
        deleted_counts=deleted_counts,
    )


@router.get("/pda-admin/cc/communities", response_model=List[CcCommunityResponse])
def list_cc_communities(
    _: PdaUser = Depends(require_superadmin),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(PersohubCommunity, PersohubClub)
        .outerjoin(PersohubClub, PersohubClub.id == PersohubCommunity.club_id)
        .order_by(PersohubCommunity.name.asc(), PersohubCommunity.id.asc())
        .all()
    )
    admin_members_map = _load_community_admin_members(db, [int(community.id) for community, _club in rows])
    return [
        _build_community_response(community, club, admin_members_map.get(int(community.id), []))
        for community, club in rows
    ]


@router.post("/pda-admin/cc/communities", response_model=CcCommunityResponse)
def create_cc_community(
    payload: CcCommunityCreateRequest,
    admin: PdaUser = Depends(require_superadmin),
    db: Session = Depends(get_db),
    request: Request = None,
):
    club = _assert_club_exists(db, payload.club_id)
    requested_admins = _normalize_requested_community_admins(
        [item.model_dump() for item in payload.admins],
        payload.admin_id,
    )
    _assert_admin_users_exist(db, [int(item["user_id"]) for item in requested_admins])
    active_admin_ids = sorted([int(item["user_id"]) for item in requested_admins if item["is_active"]])
    primary_admin_id = int(active_admin_ids[0])

    if db.query(PersohubCommunity).filter(PersohubCommunity.profile_id == payload.profile_id).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Community profile_id already exists")

    community = PersohubCommunity(
        name=payload.name,
        profile_id=payload.profile_id,
        club_id=payload.club_id,
        admin_id=primary_admin_id,
        hashed_password=get_password_hash(payload.password),
        logo_url=payload.logo_url,
        description=payload.description,
        is_active=payload.is_active,
        is_root=False,
    )
    db.add(community)

    try:
        db.flush()
        resolved_admin_id = _sync_community_admin_members(
            db,
            community_id=int(community.id),
            member_specs=requested_admins,
            created_by_user_id=admin.id,
        )
        community.admin_id = int(resolved_admin_id)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Community create conflicts with existing data")

    db.refresh(community)
    log_admin_action(
        db,
        admin,
        "Create C&C community",
        request.method if request else None,
        request.url.path if request else None,
        {"community_id": community.id, "profile_id": community.profile_id},
    )
    admin_members_map = _load_community_admin_members(db, [int(community.id)])
    return _build_community_response(
        community,
        club,
        admin_members_map.get(int(community.id), []),
    )


@router.put("/pda-admin/cc/communities/{community_id}", response_model=CcCommunityResponse)
def update_cc_community(
    community_id: int,
    payload: CcCommunityUpdateRequest,
    admin: PdaUser = Depends(require_superadmin),
    db: Session = Depends(get_db),
    request: Request = None,
):
    community = db.query(PersohubCommunity).filter(PersohubCommunity.id == community_id).first()
    if not community:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Community not found")

    updates = payload.model_dump(exclude_unset=True)
    requested_admins_payload = updates.pop("admins", None)
    requested_admin_id = updates.pop("admin_id", None)

    club = _assert_club_exists(db, updates.get("club_id", community.club_id))

    for key, value in updates.items():
        setattr(community, key, value)

    requested_admins = None
    if requested_admins_payload is not None:
        requested_admins = _normalize_requested_community_admins(
            requested_admins_payload,
            requested_admin_id,
        )
    elif requested_admin_id is not None:
        existing_members = db.query(PersohubAdmin).filter(PersohubAdmin.community_id == community.id).all()
        derived_members = []
        for member in existing_members:
            derived_members.append(
                {
                    "user_id": int(member.user_id),
                    "role": "admin",
                    "is_active": True if int(member.user_id) == int(requested_admin_id) else bool(member.is_active),
                }
            )
        if not any(int(item["user_id"]) == int(requested_admin_id) for item in derived_members):
            derived_members.append({"user_id": int(requested_admin_id), "role": "admin", "is_active": True})
        requested_admins = _normalize_requested_community_admins(derived_members, None)

    if requested_admins is not None:
        _assert_admin_users_exist(db, [int(item["user_id"]) for item in requested_admins])
        resolved_admin_id = _sync_community_admin_members(
            db,
            community_id=int(community.id),
            member_specs=requested_admins,
            created_by_user_id=admin.id,
        )
        community.admin_id = int(resolved_admin_id)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Community update conflicts with existing data")

    db.refresh(community)
    updated_fields = sorted(list(updates.keys()))
    if requested_admins_payload is not None or requested_admin_id is not None:
        updated_fields.append("admins")
    log_admin_action(
        db,
        admin,
        "Update C&C community",
        request.method if request else None,
        request.url.path if request else None,
        {"community_id": community.id, "updated_fields": updated_fields},
    )
    admin_members_map = _load_community_admin_members(db, [int(community.id)])
    return _build_community_response(
        community,
        club,
        admin_members_map.get(int(community.id), []),
    )


@router.post("/pda-admin/cc/communities/{community_id}/reset-password")
def reset_cc_community_password(
    community_id: int,
    payload: CcCommunityResetPasswordRequest,
    admin: PdaUser = Depends(require_superadmin),
    db: Session = Depends(get_db),
    request: Request = None,
):
    community = db.query(PersohubCommunity).filter(PersohubCommunity.id == community_id).first()
    if not community:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Community not found")

    community.hashed_password = get_password_hash(payload.new_password)
    db.commit()
    log_admin_action(
        db,
        admin,
        "Reset C&C community password",
        request.method if request else None,
        request.url.path if request else None,
        {"community_id": community.id},
    )
    return {"message": "Community password reset successfully"}


@router.delete("/pda-admin/cc/communities/{community_id}", response_model=CcDeleteSummaryResponse)
def delete_cc_community(
    community_id: int,
    admin: PdaUser = Depends(require_superadmin),
    db: Session = Depends(get_db),
    request: Request = None,
):
    community = db.query(PersohubCommunity).filter(PersohubCommunity.id == community_id).first()
    if not community:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Community not found")

    deleted_counts = {
        "community_id": community.id,
        "linked_posts": int(db.query(PersohubPost).filter(PersohubPost.community_id == community.id).count()),
        "detached_events": int(db.query(PersohubEvent).filter(PersohubEvent.community_id == community.id).count()),
    }

    db.query(PersohubEvent).filter(PersohubEvent.community_id == community.id).update(
        {PersohubEvent.community_id: None},
        synchronize_session=False,
    )
    db.delete(community)
    db.commit()

    log_admin_action(
        db,
        admin,
        "Delete C&C community",
        request.method if request else None,
        request.url.path if request else None,
        {"community_id": community.id, "deleted_counts": deleted_counts},
    )

    return CcDeleteSummaryResponse(
        message="Community deleted with cascade cleanup",
        deleted_counts=deleted_counts,
    )


@router.get("/pda-admin/cc/persohub-sympos", response_model=List[CcSympoResponse])
def list_cc_sympos(
    _: PdaUser = Depends(require_superadmin),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(PersohubSympo, PersohubClub)
        .join(PersohubClub, PersohubClub.id == PersohubSympo.organising_club_id)
        .order_by(PersohubSympo.name.asc(), PersohubSympo.id.asc())
        .all()
    )
    if not rows:
        return []

    sympo_ids = [sympo.id for sympo, _club in rows]
    linked_rows = (
        db.query(PersohubSympoEvent.sympo_id, PersohubEvent.id, PersohubEvent.title)
        .join(PersohubEvent, PersohubEvent.id == PersohubSympoEvent.event_id)
        .filter(PersohubSympoEvent.sympo_id.in_(sympo_ids))
        .order_by(PersohubSympoEvent.sympo_id.asc(), PersohubEvent.title.asc(), PersohubEvent.id.asc())
        .all()
    )

    event_ids_by_sympo: Dict[int, List[int]] = {}
    event_titles_by_sympo: Dict[int, List[str]] = {}
    for sympo_id, event_id, event_title in linked_rows:
        event_ids_by_sympo.setdefault(sympo_id, []).append(event_id)
        event_titles_by_sympo.setdefault(sympo_id, []).append(event_title)

    return [
        CcSympoResponse(
            id=sympo.id,
            name=sympo.name,
            organising_club_id=sympo.organising_club_id,
            organising_club_name=club.name,
            content=sympo.content,
            event_ids=event_ids_by_sympo.get(sympo.id, []),
            event_titles=event_titles_by_sympo.get(sympo.id, []),
            created_at=sympo.created_at,
            updated_at=sympo.updated_at,
        )
        for sympo, club in rows
    ]


@router.post("/pda-admin/cc/persohub-sympos", response_model=CcSympoResponse)
def create_cc_sympo(
    payload: CcSympoCreateRequest,
    admin: PdaUser = Depends(require_superadmin),
    db: Session = Depends(get_db),
    request: Request = None,
):
    club = _assert_club_exists(db, payload.organising_club_id)
    _validate_event_ids(db, payload.event_ids)
    _check_event_conflicts(db, payload.event_ids)

    sympo = PersohubSympo(
        name=payload.name,
        organising_club_id=payload.organising_club_id,
        content=payload.content,
    )
    db.add(sympo)
    db.flush()

    for event_id in payload.event_ids:
        db.add(PersohubSympoEvent(sympo_id=sympo.id, event_id=event_id))

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Sympo create conflicts with existing data")

    db.refresh(sympo)
    log_admin_action(
        db,
        admin,
        "Create C&C sympo",
        request.method if request else None,
        request.url.path if request else None,
        {"sympo_id": sympo.id, "event_ids": payload.event_ids},
    )
    return _build_sympo_response(db, sympo, club.name)


@router.put("/pda-admin/cc/persohub-sympos/{sympo_id}", response_model=CcSympoResponse)
def update_cc_sympo(
    sympo_id: int,
    payload: CcSympoUpdateRequest,
    admin: PdaUser = Depends(require_superadmin),
    db: Session = Depends(get_db),
    request: Request = None,
):
    sympo = db.query(PersohubSympo).filter(PersohubSympo.id == sympo_id).first()
    if not sympo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sympo not found")

    updates = payload.model_dump(exclude_unset=True)

    if "organising_club_id" in updates:
        _assert_club_exists(db, updates["organising_club_id"])
    if "event_ids" in updates:
        _validate_event_ids(db, updates["event_ids"])
        _check_event_conflicts(db, updates["event_ids"], exclude_sympo_id=sympo_id)

    for key in ["name", "organising_club_id", "content"]:
        if key in updates:
            setattr(sympo, key, updates[key])

    if "event_ids" in updates:
        db.query(PersohubSympoEvent).filter(PersohubSympoEvent.sympo_id == sympo_id).delete(synchronize_session=False)
        for event_id in updates["event_ids"]:
            db.add(PersohubSympoEvent(sympo_id=sympo_id, event_id=event_id))

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Sympo update conflicts with existing data")

    db.refresh(sympo)
    club = _assert_club_exists(db, sympo.organising_club_id)
    log_admin_action(
        db,
        admin,
        "Update C&C sympo",
        request.method if request else None,
        request.url.path if request else None,
        {"sympo_id": sympo.id, "updated_fields": sorted(list(updates.keys()))},
    )
    return _build_sympo_response(db, sympo, club.name)


@router.delete("/pda-admin/cc/persohub-sympos/{sympo_id}", response_model=CcDeleteSummaryResponse)
def delete_cc_sympo(
    sympo_id: int,
    admin: PdaUser = Depends(require_superadmin),
    db: Session = Depends(get_db),
    request: Request = None,
):
    sympo = db.query(PersohubSympo).filter(PersohubSympo.id == sympo_id).first()
    if not sympo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sympo not found")

    link_count = int(db.query(PersohubSympoEvent).filter(PersohubSympoEvent.sympo_id == sympo_id).count())
    db.delete(sympo)
    db.commit()

    log_admin_action(
        db,
        admin,
        "Delete C&C sympo",
        request.method if request else None,
        request.url.path if request else None,
        {"sympo_id": sympo_id, "removed_event_links": link_count},
    )

    return CcDeleteSummaryResponse(
        message="Sympo deleted",
        deleted_counts={"removed_event_links": link_count},
    )


@router.get("/pda-admin/cc/options/persohub-events", response_model=List[CcPersohubEventOption])
def list_cc_persohub_event_options(
    response: Response,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    q: Optional[str] = Query(default=None),
    _: PdaUser = Depends(require_superadmin),
    db: Session = Depends(get_db),
):
    query = (
        db.query(PersohubEvent, PersohubCommunity, PersohubClub, PersohubSympoEvent, PersohubSympo)
        .outerjoin(PersohubCommunity, PersohubCommunity.id == PersohubEvent.community_id)
        .outerjoin(PersohubClub, PersohubClub.id == PersohubEvent.club_id)
        .outerjoin(PersohubSympoEvent, PersohubSympoEvent.event_id == PersohubEvent.id)
        .outerjoin(PersohubSympo, PersohubSympo.id == PersohubSympoEvent.sympo_id)
    )
    if q and q.strip():
        keyword = f"%{q.strip()}%"
        query = query.filter(
            or_(
                PersohubEvent.title.ilike(keyword),
                PersohubEvent.slug.ilike(keyword),
                PersohubEvent.event_code.ilike(keyword),
                PersohubCommunity.name.ilike(keyword),
                PersohubClub.name.ilike(keyword),
            )
        )

    total_count = int(query.count())
    rows = (
        query.order_by(PersohubEvent.title.asc(), PersohubEvent.id.asc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    response.headers["X-Total-Count"] = str(total_count)
    response.headers["X-Page"] = str(page)
    response.headers["X-Page-Size"] = str(page_size)

    return [
        CcPersohubEventOption(
            id=event.id,
            slug=event.slug,
            event_code=event.event_code,
            title=event.title,
            club_id=(club.id if club else event.club_id),
            club_name=(club.name if club else None),
            community_id=(community.id if community else None),
            community_name=(community.name if community else None),
            sympo_id=(sympo.id if sympo else None),
            sympo_name=(sympo.name if sympo else None),
        )
        for event, community, club, _mapping, sympo in rows
    ]


@router.put("/pda-admin/cc/persohub-events/{event_id}/sympo", response_model=CcPersohubEventSympoAssignResponse)
def assign_cc_event_sympo(
    event_id: int,
    payload: CcPersohubEventSympoAssignRequest,
    admin: PdaUser = Depends(require_superadmin),
    db: Session = Depends(get_db),
    request: Request = None,
):
    event = db.query(PersohubEvent).filter(PersohubEvent.id == event_id).first()
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Persohub event not found")

    existing = db.query(PersohubSympoEvent).filter(PersohubSympoEvent.event_id == event_id).first()
    previous_sympo_id = existing.sympo_id if existing else None

    next_sympo = None
    if payload.sympo_id is not None:
        next_sympo = db.query(PersohubSympo).filter(PersohubSympo.id == payload.sympo_id).first()
        if not next_sympo:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sympo not found")

    if existing and next_sympo and existing.sympo_id == next_sympo.id:
        return CcPersohubEventSympoAssignResponse(
            event_id=event_id,
            sympo_id=next_sympo.id,
            sympo_name=next_sympo.name,
            message="Event already mapped to selected sympo",
        )

    if existing:
        db.delete(existing)
        db.flush()

    if next_sympo:
        db.add(PersohubSympoEvent(sympo_id=next_sympo.id, event_id=event_id))

    db.commit()
    log_admin_action(
        db,
        admin,
        "Assign C&C event sympo",
        request.method if request else None,
        request.url.path if request else None,
        {
            "event_id": event_id,
            "previous_sympo_id": previous_sympo_id,
            "next_sympo_id": (next_sympo.id if next_sympo else None),
        },
    )
    return CcPersohubEventSympoAssignResponse(
        event_id=event_id,
        sympo_id=(next_sympo.id if next_sympo else None),
        sympo_name=(next_sympo.name if next_sympo else None),
        message=("Event unassigned from sympo" if next_sympo is None else "Event mapped to sympo"),
    )


@router.get("/pda-admin/cc/payments", response_model=List[CcPersohubPaymentReviewListItem])
def list_cc_payments(
    response: Response,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    _: PdaUser = Depends(require_superadmin),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(PersohubPayment, PersohubEvent, PdaUser, PersohubClub)
        .join(PersohubEvent, PersohubEvent.id == PersohubPayment.event_id)
        .join(PdaUser, PdaUser.id == PersohubPayment.user_id)
        .outerjoin(PersohubClub, PersohubClub.id == PersohubEvent.club_id)
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


@router.post("/pda-admin/cc/payments/{payment_id}/confirm", response_model=CcPersohubPaymentReviewListItem)
def confirm_cc_payment(
    payment_id: int,
    payload: CcPersohubPaymentConfirmRequest,
    admin: PdaUser = Depends(require_superadmin),
    db: Session = Depends(get_db),
    request: Request = None,
):
    row = (
        db.query(PersohubPayment, PersohubEvent, PdaUser, PersohubClub)
        .join(PersohubEvent, PersohubEvent.id == PersohubPayment.event_id)
        .join(PdaUser, PdaUser.id == PersohubPayment.user_id)
        .outerjoin(PersohubClub, PersohubClub.id == PersohubEvent.club_id)
        .filter(PersohubPayment.id == payment_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment not found")
    payment, event, participant, club = row
    current_status = _payment_status(payment)
    if current_status != "pending":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Payment is already {current_status}")

    if not admin.hashed_password or not verify_password(payload.password, admin.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid password")

    content = _payment_content_dict(payment)
    content["status"] = "approved"
    content["review"] = {
        "by_user_id": int(admin.id),
        "by_name": str(admin.name or ""),
        "at": datetime.now(timezone.utc).isoformat(),
        "reason": None,
    }
    payment.content = content

    registration = _ensure_payment_registration_row(db, payment)
    registration.status = PersohubEventRegistrationStatus.ACTIVE

    _send_payment_status_email(participant, event, state="approved")
    db.commit()
    db.refresh(payment)
    log_admin_action(
        db,
        admin,
        "Confirm Persohub payment",
        request.method if request else None,
        request.url.path if request else None,
        {"payment_id": payment_id, "event_id": event.id},
    )
    return _build_payment_list_item(payment, event, participant, club)


@router.post("/pda-admin/cc/payments/{payment_id}/decline", response_model=CcPersohubPaymentReviewListItem)
def decline_cc_payment(
    payment_id: int,
    payload: CcPersohubPaymentDeclineRequest,
    admin: PdaUser = Depends(require_superadmin),
    db: Session = Depends(get_db),
    request: Request = None,
):
    row = (
        db.query(PersohubPayment, PersohubEvent, PdaUser, PersohubClub)
        .join(PersohubEvent, PersohubEvent.id == PersohubPayment.event_id)
        .join(PdaUser, PdaUser.id == PersohubPayment.user_id)
        .outerjoin(PersohubClub, PersohubClub.id == PersohubEvent.club_id)
        .filter(PersohubPayment.id == payment_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment not found")
    payment, event, participant, club = row
    current_status = _payment_status(payment)
    if current_status != "pending":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Payment is already {current_status}")

    content = _payment_content_dict(payment)
    content["status"] = "declined"
    content["review"] = {
        "by_user_id": int(admin.id),
        "by_name": str(admin.name or ""),
        "at": datetime.now(timezone.utc).isoformat(),
        "reason": payload.reason,
    }
    payment.content = content

    registration = _ensure_payment_registration_row(db, payment)
    registration.status = PersohubEventRegistrationStatus.PENDING

    _send_payment_status_email(participant, event, state="declined", reason=payload.reason)
    db.commit()
    db.refresh(payment)
    log_admin_action(
        db,
        admin,
        "Decline Persohub payment",
        request.method if request else None,
        request.url.path if request else None,
        {"payment_id": payment_id, "event_id": event.id},
    )
    return _build_payment_list_item(payment, event, participant, club)


@router.get("/pda-admin/cc/options/admin-users", response_model=List[CcAdminUserOption])
def list_cc_admin_user_options(
    _: PdaUser = Depends(require_superadmin),
    db: Session = Depends(get_db),
):
    users = db.query(PdaUser).order_by(PdaUser.name.asc(), PdaUser.id.asc()).all()
    return [CcAdminUserOption(id=user.id, regno=user.regno, name=user.name) for user in users]


@router.post("/pda-admin/cc/logos/presign", response_model=PresignResponse)
def presign_cc_logo_upload(
    payload: PresignRequest,
    _: PdaUser = Depends(require_superadmin),
):
    return _generate_presigned_put_url(
        "persohub/cc/logos",
        payload.filename,
        payload.content_type,
        allowed_types=_ALLOWED_LOGO_TYPES,
    )
