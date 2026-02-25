from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from models import (
    AdminLog,
    PdaUser,
    PersohubAdmin,
    PersohubClub,
    PersohubClubAdmin,
    PersohubCommunity,
    PersohubCommunityFollow,
    PersohubEvent,
    PersohubHashtag,
    PersohubPost,
    PersohubPostAttachment,
    PersohubPostComment,
    PersohubPostHashtag,
    PersohubPostLike,
    PersohubPostMention,
)
from persohub_schemas import (
    PersohubAdminClubSuperadminCreateRequest,
    PersohubAdminClubSuperadminResponse,
    PersohubAdminCommunityManageCreateRequest,
    PersohubAdminCommunityManageResponse,
    PersohubAdminCommunityManageUpdateRequest,
    PersohubAdminEventAdminCreateRequest,
    PersohubAdminEventPoliciesResponse,
    PersohubAdminEventPolicyAdminRow,
    PersohubAdminEventPolicyUpdateRequest,
    PersohubAdminEventResponse,
    PersohubAdminUserOption,
)
from security import (
    get_persohub_actor_club_id,
    get_persohub_actor_user_id,
    is_persohub_club_owner,
    is_persohub_club_superadmin,
    require_persohub_community,
)

router = APIRouter()


def _assert_owner(request: Request) -> None:
    if not is_persohub_club_owner(request):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Club owner access required")


def _assert_owner_or_superadmin(request: Request) -> None:
    if not (is_persohub_club_owner(request) or is_persohub_club_superadmin(request)):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Club superadmin access required")


def _resolve_actor_club_id(request: Request, community: PersohubCommunity) -> int:
    club_id = int(get_persohub_actor_club_id(request) or int(community.club_id or 0) or 0)
    if club_id <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Community is not linked to a club")
    return club_id


def _actor_log_identity(db: Session, request: Request) -> tuple[str, str, int]:
    actor_id = int(get_persohub_actor_user_id(request) or 0)
    actor_user = db.query(PdaUser).filter(PdaUser.id == actor_id).first() if actor_id > 0 else None
    register_number = str(getattr(actor_user, "regno", "") or "").strip()
    if not register_number:
        register_number = str(getattr(getattr(request, "state", None), "persohub_actor_role", "") or "owner").strip()
    register_number = (register_number[:64] or "owner")
    actor_name = str(getattr(actor_user, "name", "") or "").strip() or "persohub_owner"
    return register_number, actor_name, actor_id


def _normalize_events_policy(policy: Optional[dict]) -> dict:
    if not isinstance(policy, dict):
        return {"events": {}}
    events = policy.get("events")
    if not isinstance(events, dict):
        return {"events": {}}
    normalized = {}
    for raw_slug, raw_allowed in events.items():
        slug = str(raw_slug or "").strip()
        if not slug:
            continue
        normalized[slug] = bool(raw_allowed)
    return {"events": normalized}


def _build_community_admin_members(db: Session, community_id: int):
    rows = (
        db.query(PersohubAdmin, PdaUser)
        .join(PdaUser, PdaUser.id == PersohubAdmin.user_id)
        .filter(PersohubAdmin.community_id == community_id)
        .order_by(PersohubAdmin.is_active.desc(), PdaUser.name.asc(), PdaUser.id.asc())
        .all()
    )
    payload = []
    for membership, user in rows:
        payload.append(
            {
                "user_id": int(membership.user_id),
                "regno": str(user.regno or "") or None,
                "name": str(user.name or "") or None,
                "is_active": bool(membership.is_active),
            }
        )
    return payload


def _build_community_response(db: Session, community: PersohubCommunity) -> PersohubAdminCommunityManageResponse:
    members = _build_community_admin_members(db, int(community.id))
    active_members = [item for item in members if bool(item.get("is_active"))]
    active_members.sort(key=lambda item: (int(item.get("user_id") or 0), str(item.get("name") or "").lower()))
    primary_admin_id = int(active_members[0]["user_id"]) if active_members else None
    primary_admin_name = active_members[0].get("name") if active_members else None
    primary_admin_regno = active_members[0].get("regno") if active_members else None

    return PersohubAdminCommunityManageResponse(
        id=int(community.id),
        name=str(community.name or ""),
        profile_id=str(community.profile_id or ""),
        club_id=(int(community.club_id) if community.club_id else None),
        club_name=None,
        admin_id=primary_admin_id,
        admin_name=primary_admin_name,
        admin_regno=primary_admin_regno,
        admins=members,
        logo_url=(str(community.logo_url or "") or None),
        description=(str(community.description or "") or None),
        is_active=bool(community.is_active),
        created_at=community.created_at,
        updated_at=community.updated_at,
    )


def _sync_community_admins(
    db: Session,
    *,
    community: PersohubCommunity,
    admins_payload: List[dict],
    created_by_user_id: Optional[int],
) -> int:
    requested_user_ids = [int(item.get("user_id")) for item in admins_payload if int(item.get("user_id") or 0) > 0]
    if not requested_user_ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="At least one active admin is required")

    users = db.query(PdaUser).filter(PdaUser.id.in_(requested_user_ids)).all()
    users_by_id = {int(user.id): user for user in users}
    missing_ids = [user_id for user_id in requested_user_ids if user_id not in users_by_id]
    if missing_ids:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Admin user(s) not found: {', '.join(str(item) for item in missing_ids)}",
        )

    existing_rows = db.query(PersohubAdmin).filter(PersohubAdmin.community_id == community.id).all()
    existing_by_user_id = {int(row.user_id): row for row in existing_rows}

    for item in admins_payload:
        user_id = int(item.get("user_id"))
        is_active = bool(item.get("is_active", True))
        row = existing_by_user_id.get(user_id)
        if row:
            row.role = "admin"
            row.is_active = is_active
            if created_by_user_id and not row.created_by_user_id:
                row.created_by_user_id = created_by_user_id
        else:
            db.add(
                PersohubAdmin(
                    community_id=int(community.id),
                    user_id=user_id,
                    role="admin",
                    is_active=is_active,
                    policy={"events": {}},
                    created_by_user_id=created_by_user_id,
                )
            )

    requested_id_set = set(requested_user_ids)
    for row in existing_rows:
        if int(row.user_id) in requested_id_set:
            continue
        row.is_active = False
        row.role = "admin"

    # Deterministic primary admin pointer for community account posting flows.
    active_user_ids = sorted(
        [int(item.get("user_id")) for item in admins_payload if bool(item.get("is_active", True))]
    )
    if not active_user_ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="At least one active admin is required")
    community.admin_id = int(active_user_ids[0])
    return int(community.admin_id)


def _serialize_policy_admin_rows(db: Session, club_id: int) -> List[PersohubAdminEventPolicyAdminRow]:
    rows = (
        db.query(PersohubAdmin, PersohubCommunity, PdaUser)
        .join(PersohubCommunity, PersohubCommunity.id == PersohubAdmin.community_id)
        .join(PdaUser, PdaUser.id == PersohubAdmin.user_id)
        .filter(
            PersohubCommunity.club_id == club_id,
            PersohubCommunity.is_active == True,  # noqa: E712
            PersohubAdmin.is_active == True,  # noqa: E712
        )
        .order_by(PdaUser.name.asc(), PdaUser.id.asc(), PersohubAdmin.id.asc())
        .all()
    )
    per_user: Dict[int, Dict[str, object]] = {}
    for membership, _community, user in rows:
        user_id = int(user.id)
        if user_id not in per_user:
            per_user[user_id] = {
                "user": user,
                "policy": {"events": {}},
            }
        normalized = _normalize_events_policy(membership.policy)
        policy_events = per_user[user_id]["policy"]["events"]
        for slug, allowed in normalized["events"].items():
            if allowed:
                policy_events[slug] = True
            else:
                policy_events.setdefault(slug, False)

    return [
        PersohubAdminEventPolicyAdminRow(
            user_id=user_id,
            regno=str(meta["user"].regno or "") or None,
            name=str(meta["user"].name or "") or None,
            is_club_owner=False,
            policy=meta["policy"],
        )
        for user_id, meta in sorted(per_user.items(), key=lambda item: (str(item[1]["user"].name or "").lower(), item[0]))
    ]


def _serialize_event_for_policy(event: PersohubEvent) -> PersohubAdminEventResponse:
    return PersohubAdminEventResponse(
        id=int(event.id),
        slug=str(event.slug),
        event_code=str(event.event_code),
        club_id=int(event.club_id),
        community_id=(int(event.community_id) if event.community_id else None),
        title=str(event.title or ""),
        description=event.description,
        start_date=event.start_date,
        end_date=event.end_date,
        event_time=event.event_time,
        poster_url=event.poster_url,
        whatsapp_url=event.whatsapp_url,
        external_url_name=str(event.external_url_name or "Join whatsapp channel"),
        event_type=str(event.event_type.value if hasattr(event.event_type, "value") else event.event_type),
        format=str(event.format.value if hasattr(event.format, "value") else event.format),
        template_option=str(event.template_option.value if hasattr(event.template_option, "value") else event.template_option),
        participant_mode=str(event.participant_mode.value if hasattr(event.participant_mode, "value") else event.participant_mode),
        round_mode=str(event.round_mode.value if hasattr(event.round_mode, "value") else event.round_mode),
        round_count=int(event.round_count or 1),
        team_min_size=event.team_min_size,
        team_max_size=event.team_max_size,
        is_visible=bool(event.is_visible),
        status=str(event.status.value if hasattr(event.status, "value") else event.status),
        sympo_id=None,
        sympo_name=None,
        created_at=event.created_at,
        updated_at=event.updated_at,
    )


@router.get("/persohub/admin/options/admin-users", response_model=List[PersohubAdminUserOption])
def list_owner_admin_user_options(
    request: Request,
    community: PersohubCommunity = Depends(require_persohub_community),
    db: Session = Depends(get_db),
):
    _assert_owner_or_superadmin(request)
    _resolve_actor_club_id(request, community)
    users = db.query(PdaUser).order_by(PdaUser.name.asc(), PdaUser.id.asc()).all()
    return [
        PersohubAdminUserOption(id=int(user.id), regno=str(user.regno or "") or None, name=str(user.name or "") or None)
        for user in users
    ]


@router.get("/persohub/admin/communities", response_model=List[PersohubAdminCommunityManageResponse])
def list_owner_communities(
    request: Request,
    community: PersohubCommunity = Depends(require_persohub_community),
    db: Session = Depends(get_db),
):
    _assert_owner_or_superadmin(request)
    club_id = _resolve_actor_club_id(request, community)
    rows = (
        db.query(PersohubCommunity)
        .filter(PersohubCommunity.club_id == club_id)
        .order_by(PersohubCommunity.name.asc(), PersohubCommunity.id.asc())
        .all()
    )
    return [_build_community_response(db, row) for row in rows]


@router.post("/persohub/admin/communities", response_model=PersohubAdminCommunityManageResponse)
def create_owner_community(
    payload: PersohubAdminCommunityManageCreateRequest,
    request: Request,
    community: PersohubCommunity = Depends(require_persohub_community),
    db: Session = Depends(get_db),
):
    _assert_owner_or_superadmin(request)
    club_id = _resolve_actor_club_id(request, community)

    if db.query(PersohubCommunity).filter(PersohubCommunity.profile_id == payload.profile_id).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Community profile_id already exists")

    new_community = PersohubCommunity(
        name=payload.name,
        profile_id=payload.profile_id,
        club_id=club_id,
        admin_id=1,
        logo_url=payload.logo_url,
        description=payload.description,
        is_active=bool(payload.is_active),
        is_root=False,
    )
    db.add(new_community)
    db.flush()

    _sync_community_admins(
        db,
        community=new_community,
        admins_payload=[item.model_dump() for item in payload.admins],
        created_by_user_id=get_persohub_actor_user_id(request),
    )
    db.commit()
    db.refresh(new_community)
    return _build_community_response(db, new_community)


@router.put("/persohub/admin/communities/{community_id}", response_model=PersohubAdminCommunityManageResponse)
def update_owner_community(
    community_id: int,
    payload: PersohubAdminCommunityManageUpdateRequest,
    request: Request,
    community: PersohubCommunity = Depends(require_persohub_community),
    db: Session = Depends(get_db),
):
    _assert_owner_or_superadmin(request)
    club_id = _resolve_actor_club_id(request, community)

    row = db.query(PersohubCommunity).filter(PersohubCommunity.id == community_id).first()
    if not row or int(row.club_id or 0) != int(club_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Community not found")

    updates = payload.model_dump(exclude_unset=True)
    admins_payload = updates.pop("admins", None)

    for field in ["name", "logo_url", "description", "is_active"]:
        if field in updates:
            setattr(row, field, updates[field])

    if admins_payload is not None:
        _sync_community_admins(
            db,
            community=row,
            admins_payload=admins_payload,
            created_by_user_id=get_persohub_actor_user_id(request),
        )

    db.commit()
    db.refresh(row)
    return _build_community_response(db, row)


@router.delete("/persohub/admin/communities/{community_id}")
def delete_owner_community(
    community_id: int,
    request: Request,
    community: PersohubCommunity = Depends(require_persohub_community),
    db: Session = Depends(get_db),
):
    _assert_owner_or_superadmin(request)
    club_id = _resolve_actor_club_id(request, community)

    row = db.query(PersohubCommunity).filter(PersohubCommunity.id == community_id).first()
    if not row or int(row.club_id or 0) != int(club_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Community not found")

    detached_events = int(
        db.query(PersohubEvent)
        .filter(PersohubEvent.community_id == int(row.id), PersohubEvent.club_id == club_id)
        .update({PersohubEvent.community_id: None}, synchronize_session=False)
    )

    # Cleanup dependent records explicitly to support databases where
    # historical FK constraints were created without ON DELETE CASCADE.
    deleted_follows = int(
        db.query(PersohubCommunityFollow)
        .filter(PersohubCommunityFollow.community_id == int(row.id))
        .delete(synchronize_session=False)
    )
    deleted_admin_memberships = int(
        db.query(PersohubAdmin)
        .filter(PersohubAdmin.community_id == int(row.id))
        .delete(synchronize_session=False)
    )

    post_ids = [
        int(post_id)
        for (post_id,) in (
            db.query(PersohubPost.id)
            .filter(PersohubPost.community_id == int(row.id))
            .all()
        )
    ]

    deleted_post_mentions = 0
    deleted_post_hashtags = 0
    deleted_post_likes = 0
    deleted_post_comments = 0
    deleted_post_attachments = 0
    deleted_posts = 0

    if post_ids:
        hashtag_usage_rows = (
            db.query(PersohubPostHashtag.hashtag_id, func.count(PersohubPostHashtag.id))
            .filter(PersohubPostHashtag.post_id.in_(post_ids))
            .group_by(PersohubPostHashtag.hashtag_id)
            .all()
        )

        deleted_post_mentions = int(
            db.query(PersohubPostMention)
            .filter(PersohubPostMention.post_id.in_(post_ids))
            .delete(synchronize_session=False)
        )
        deleted_post_likes = int(
            db.query(PersohubPostLike)
            .filter(PersohubPostLike.post_id.in_(post_ids))
            .delete(synchronize_session=False)
        )
        deleted_post_comments = int(
            db.query(PersohubPostComment)
            .filter(PersohubPostComment.post_id.in_(post_ids))
            .delete(synchronize_session=False)
        )
        deleted_post_attachments = int(
            db.query(PersohubPostAttachment)
            .filter(PersohubPostAttachment.post_id.in_(post_ids))
            .delete(synchronize_session=False)
        )
        deleted_post_hashtags = int(
            db.query(PersohubPostHashtag)
            .filter(PersohubPostHashtag.post_id.in_(post_ids))
            .delete(synchronize_session=False)
        )
        deleted_posts = int(
            db.query(PersohubPost)
            .filter(PersohubPost.id.in_(post_ids))
            .delete(synchronize_session=False)
        )

        for hashtag_id, removed_count in hashtag_usage_rows:
            tag = db.query(PersohubHashtag).filter(PersohubHashtag.id == int(hashtag_id)).first()
            if not tag:
                continue
            tag.count = max(0, int(tag.count or 0) - int(removed_count or 0))

    deleted_counts = {
        "community_id": int(row.id),
        "detached_events": detached_events,
        "deleted_follows": deleted_follows,
        "deleted_admin_memberships": deleted_admin_memberships,
        "deleted_posts": deleted_posts,
        "deleted_post_mentions": deleted_post_mentions,
        "deleted_post_hashtags": deleted_post_hashtags,
        "deleted_post_likes": deleted_post_likes,
        "deleted_post_comments": deleted_post_comments,
        "deleted_post_attachments": deleted_post_attachments,
    }

    db.delete(row)
    db.commit()
    return {"message": "Community deleted", "deleted_counts": deleted_counts}


def _serialize_club_superadmin_row(
    db: Session,
    row: PersohubClubAdmin,
) -> PersohubAdminClubSuperadminResponse:
    user = db.query(PdaUser).filter(PdaUser.id == int(row.user_id)).first()
    return PersohubAdminClubSuperadminResponse(
        id=int(row.id),
        club_id=int(row.club_id),
        user_id=int(row.user_id),
        regno=(str(user.regno or "") if user else None) or None,
        name=(str(user.name or "") if user else None) or None,
        role="superadmin",
        is_active=bool(row.is_active),
        created_by_user_id=(int(row.created_by_user_id) if row.created_by_user_id else None),
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get("/persohub/admin/policies/superadmins", response_model=List[PersohubAdminClubSuperadminResponse])
def list_club_superadmins(
    request: Request,
    community: PersohubCommunity = Depends(require_persohub_community),
    db: Session = Depends(get_db),
):
    _assert_owner(request)
    club_id = _resolve_actor_club_id(request, community)
    rows = (
        db.query(PersohubClubAdmin)
        .filter(
            PersohubClubAdmin.club_id == int(club_id),
            PersohubClubAdmin.is_active == True,  # noqa: E712
        )
        .order_by(PersohubClubAdmin.created_at.desc(), PersohubClubAdmin.id.desc())
        .all()
    )
    return [_serialize_club_superadmin_row(db, row) for row in rows]


@router.post("/persohub/admin/policies/superadmins", response_model=PersohubAdminClubSuperadminResponse)
def add_club_superadmin(
    payload: PersohubAdminClubSuperadminCreateRequest,
    request: Request,
    community: PersohubCommunity = Depends(require_persohub_community),
    db: Session = Depends(get_db),
):
    _assert_owner(request)
    club_id = _resolve_actor_club_id(request, community)
    user = db.query(PdaUser).filter(PdaUser.id == int(payload.user_id)).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    club_row = db.query(PersohubClub).filter(PersohubClub.id == int(club_id)).first()
    owner_user_id = int(getattr(club_row, "owner_user_id", 0) or 0)
    owner_actor_id = int(get_persohub_actor_user_id(request) or 0)
    if int(payload.user_id) in {owner_user_id, owner_actor_id}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Owner cannot be added as club superadmin")

    row = (
        db.query(PersohubClubAdmin)
        .filter(
            PersohubClubAdmin.club_id == int(club_id),
            PersohubClubAdmin.user_id == int(payload.user_id),
        )
        .first()
    )
    if row:
        row.role = "superadmin"
        row.is_active = True
        if not row.created_by_user_id:
            row.created_by_user_id = owner_actor_id if owner_actor_id > 0 else None
    else:
        row = PersohubClubAdmin(
            club_id=int(club_id),
            user_id=int(payload.user_id),
            role="superadmin",
            is_active=True,
            created_by_user_id=owner_actor_id if owner_actor_id > 0 else None,
        )
        db.add(row)
    db.flush()
    admin_register_number, admin_name, _actor_id = _actor_log_identity(db, request)
    db.add(
        AdminLog(
            admin_id=owner_actor_id if owner_actor_id > 0 else 0,
            admin_register_number=admin_register_number,
            admin_name=admin_name,
            action="grant_persohub_club_superadmin",
            method=request.method,
            path=request.url.path,
            meta={"club_id": int(club_id), "target_user_id": int(payload.user_id)},
        )
    )
    db.commit()
    db.refresh(row)
    return _serialize_club_superadmin_row(db, row)


@router.delete("/persohub/admin/policies/superadmins/{user_id}")
def revoke_club_superadmin(
    user_id: int,
    request: Request,
    community: PersohubCommunity = Depends(require_persohub_community),
    db: Session = Depends(get_db),
):
    _assert_owner(request)
    club_id = _resolve_actor_club_id(request, community)
    row = (
        db.query(PersohubClubAdmin)
        .filter(
            PersohubClubAdmin.club_id == int(club_id),
            PersohubClubAdmin.user_id == int(user_id),
            PersohubClubAdmin.is_active == True,  # noqa: E712
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Active club superadmin not found")
    row.is_active = False
    admin_register_number, admin_name, actor_id = _actor_log_identity(db, request)
    db.add(
        AdminLog(
            admin_id=actor_id if actor_id > 0 else 0,
            admin_register_number=admin_register_number,
            admin_name=admin_name,
            action="revoke_persohub_club_superadmin",
            method=request.method,
            path=request.url.path,
            meta={"club_id": int(club_id), "target_user_id": int(user_id)},
        )
    )
    db.commit()
    return {"message": "Club superadmin revoked"}


@router.post("/persohub/admin/policies/event-admins", response_model=PersohubAdminEventPolicyAdminRow)
def add_event_admin_user(
    payload: PersohubAdminEventAdminCreateRequest,
    request: Request,
    community: PersohubCommunity = Depends(require_persohub_community),
    db: Session = Depends(get_db),
):
    _assert_owner(request)
    club_id = _resolve_actor_club_id(request, community)
    user = db.query(PdaUser).filter(PdaUser.id == int(payload.user_id)).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    owner_user_id = int(get_persohub_actor_user_id(request) or 0)
    if int(payload.user_id) == owner_user_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Owner is already an admin")

    if payload.community_id:
        target_community = (
            db.query(PersohubCommunity)
            .filter(
                PersohubCommunity.id == int(payload.community_id),
                PersohubCommunity.club_id == int(club_id),
                PersohubCommunity.is_active == True,  # noqa: E712
            )
            .first()
        )
        if not target_community:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Community not found")
    else:
        target_community = (
            db.query(PersohubCommunity)
            .filter(
                PersohubCommunity.club_id == int(club_id),
                PersohubCommunity.is_active == True,  # noqa: E712
            )
            .order_by(PersohubCommunity.id.asc())
            .first()
        )
        if not target_community:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No active community found in this club")

    row = (
        db.query(PersohubAdmin)
        .filter(
            PersohubAdmin.community_id == int(target_community.id),
            PersohubAdmin.user_id == int(payload.user_id),
        )
        .first()
    )
    if row:
        row.role = "admin"
        row.is_active = True
        if not isinstance(row.policy, dict):
            row.policy = {"events": {}}
        elif not isinstance(row.policy.get("events"), dict):
            row.policy = {"events": {}}
    else:
        row = PersohubAdmin(
            community_id=int(target_community.id),
            user_id=int(payload.user_id),
            role="admin",
            is_active=True,
            policy={"events": {}},
            created_by_user_id=(owner_user_id if owner_user_id > 0 else None),
        )
        db.add(row)

    admin_register_number, admin_name, actor_id = _actor_log_identity(db, request)
    db.add(
        AdminLog(
            admin_id=actor_id if actor_id > 0 else 0,
            admin_register_number=admin_register_number,
            admin_name=admin_name,
            action="add_persohub_event_admin",
            method=request.method,
            path=request.url.path,
            meta={
                "club_id": int(club_id),
                "community_id": int(target_community.id),
                "target_user_id": int(payload.user_id),
            },
        )
    )
    db.commit()

    return PersohubAdminEventPolicyAdminRow(
        user_id=int(payload.user_id),
        regno=(str(user.regno or "") or None),
        name=(str(user.name or "") or None),
        is_club_owner=False,
        policy={"events": {}},
    )


@router.delete("/persohub/admin/policies/event-admins/{user_id}")
def remove_event_admin_user(
    user_id: int,
    request: Request,
    community: PersohubCommunity = Depends(require_persohub_community),
    db: Session = Depends(get_db),
):
    _assert_owner(request)
    club_id = _resolve_actor_club_id(request, community)
    owner_user_id = int(get_persohub_actor_user_id(request) or 0)
    if int(user_id) == owner_user_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Owner cannot be removed")

    rows = (
        db.query(PersohubAdmin)
        .join(PersohubCommunity, PersohubCommunity.id == PersohubAdmin.community_id)
        .filter(
            PersohubCommunity.club_id == club_id,
            PersohubCommunity.is_active == True,  # noqa: E712
            PersohubAdmin.user_id == int(user_id),
            PersohubAdmin.is_active == True,  # noqa: E712
        )
        .all()
    )
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event admin not found in this club")

    for row in rows:
        row.is_active = False

    admin_register_number, admin_name, actor_id = _actor_log_identity(db, request)
    db.add(
        AdminLog(
            admin_id=actor_id if actor_id > 0 else 0,
            admin_register_number=admin_register_number,
            admin_name=admin_name,
            action="remove_persohub_event_admin",
            method=request.method,
            path=request.url.path,
            meta={
                "club_id": int(club_id),
                "target_user_id": int(user_id),
                "rows_affected": len(rows),
            },
        )
    )
    db.commit()
    return {"message": "Event admin removed"}


@router.get("/persohub/admin/policies/events", response_model=PersohubAdminEventPoliciesResponse)
def list_owner_event_policies(
    request: Request,
    community: PersohubCommunity = Depends(require_persohub_community),
    db: Session = Depends(get_db),
):
    _assert_owner(request)
    club_id = _resolve_actor_club_id(request, community)

    event_rows = (
        db.query(PersohubEvent)
        .filter(PersohubEvent.club_id == club_id)
        .order_by(PersohubEvent.title.asc(), PersohubEvent.id.asc())
        .all()
    )
    events = [_serialize_event_for_policy(event) for event in event_rows]
    admins = _serialize_policy_admin_rows(db, club_id)

    owner_user_id = int(get_persohub_actor_user_id(request) or 0)
    if owner_user_id > 0:
        owner_user = db.query(PdaUser).filter(PdaUser.id == owner_user_id).first()
        owner_entry = PersohubAdminEventPolicyAdminRow(
            user_id=owner_user_id,
            regno=(str(owner_user.regno or "") if owner_user else None) or None,
            name=(str(owner_user.name or "") if owner_user else None) or None,
            is_club_owner=True,
            policy={"events": {}},
        )
        if all(int(item.user_id) != owner_user_id for item in admins):
            admins.insert(0, owner_entry)
        else:
            for item in admins:
                if int(item.user_id) == owner_user_id:
                    item.is_club_owner = True

    return PersohubAdminEventPoliciesResponse(events=events, admins=admins)


@router.put("/persohub/admin/policies/events/{user_id}", response_model=PersohubAdminEventPolicyAdminRow)
def update_owner_event_policy(
    user_id: int,
    payload: PersohubAdminEventPolicyUpdateRequest,
    request: Request,
    community: PersohubCommunity = Depends(require_persohub_community),
    db: Session = Depends(get_db),
):
    _assert_owner(request)
    club_id = _resolve_actor_club_id(request, community)

    if int(user_id) == int(get_persohub_actor_user_id(request) or 0):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Owner policy is not editable")

    normalized_policy = _normalize_events_policy(payload.policy)
    allowed_slugs = {
        str(slug)
        for slug, in db.query(PersohubEvent.slug).filter(PersohubEvent.club_id == club_id).all()
    }
    invalid_slugs = [slug for slug in normalized_policy["events"].keys() if slug not in allowed_slugs]
    if invalid_slugs:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid event slug(s) for this club: {', '.join(sorted(invalid_slugs))}",
        )

    rows = (
        db.query(PersohubAdmin)
        .join(PersohubCommunity, PersohubCommunity.id == PersohubAdmin.community_id)
        .filter(
            PersohubCommunity.club_id == club_id,
            PersohubCommunity.is_active == True,  # noqa: E712
            PersohubAdmin.user_id == user_id,
            PersohubAdmin.is_active == True,  # noqa: E712
        )
        .all()
    )
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Admin user not found in this club")

    for row in rows:
        row.policy = {"events": dict(normalized_policy["events"])}

    actor_id = int(get_persohub_actor_user_id(request) or 0)
    admin_register_number, admin_name, actor_id = _actor_log_identity(db, request)
    db.add(
        AdminLog(
            admin_id=actor_id if actor_id > 0 else 0,
            admin_register_number=admin_register_number,
            admin_name=admin_name,
            action="update_persohub_event_policy",
            method=request.method,
            path=request.url.path,
            meta={
                "club_id": club_id,
                "target_user_id": int(user_id),
                "event_keys": sorted(list(normalized_policy["events"].keys())),
            },
        )
    )
    db.commit()

    user = db.query(PdaUser).filter(PdaUser.id == user_id).first()
    return PersohubAdminEventPolicyAdminRow(
        user_id=int(user_id),
        regno=(str(user.regno or "") if user else None) or None,
        name=(str(user.name or "") if user else None) or None,
        is_club_owner=False,
        policy={"events": dict(normalized_policy["events"])} ,
    )
