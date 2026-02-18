from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from auth import get_password_hash
from database import get_db
from models import (
    CommunityEvent,
    CommunitySympo,
    CommunitySympoEvent,
    CommunitySympoLegacy,
    PdaUser,
    PersohubClub,
    PersohubCommunity,
    PersohubPost,
)
from schemas import (
    CcAdminUserOption,
    CcClubCreateRequest,
    CcClubResponse,
    CcClubUpdateRequest,
    CcCommunityCreateRequest,
    CcCommunityEventOption,
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
    return CcClubResponse(
        id=club.id,
        name=club.name,
        profile_id=club.profile_id,
        club_url=club.club_url,
        club_logo_url=club.club_logo_url,
        club_tagline=club.club_tagline,
        club_description=club.club_description,
        linked_community_count=linked_community_count,
        created_at=club.created_at,
        updated_at=club.updated_at,
    )


def _build_community_response(
    community: PersohubCommunity,
    club: Optional[PersohubClub],
    admin_user: Optional[PdaUser],
) -> CcCommunityResponse:
    return CcCommunityResponse(
        id=community.id,
        name=community.name,
        profile_id=community.profile_id,
        club_id=community.club_id,
        club_name=(club.name if club else None),
        admin_id=community.admin_id,
        admin_name=(admin_user.name if admin_user else None),
        admin_regno=(admin_user.regno if admin_user else None),
        logo_url=community.logo_url,
        description=community.description,
        is_active=community.is_active,
        is_root=community.is_root,
        created_at=community.created_at,
        updated_at=community.updated_at,
    )


def _build_sympo_response(db: Session, sympo: CommunitySympo, club_name: Optional[str]) -> CcSympoResponse:
    linked_events = (
        db.query(CommunitySympoEvent, CommunityEvent)
        .join(CommunityEvent, CommunityEvent.id == CommunitySympoEvent.event_id)
        .filter(CommunitySympoEvent.sympo_id == sympo.id)
        .order_by(CommunityEvent.title.asc(), CommunityEvent.id.asc())
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


def _assert_admin_user_exists(db: Session, user_id: int) -> PdaUser:
    user = db.query(PdaUser).filter(PdaUser.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Admin user not found")
    return user


def _validate_event_ids(db: Session, event_ids: List[int]) -> None:
    existing = {
        row[0]
        for row in db.query(CommunityEvent.id)
        .filter(CommunityEvent.id.in_(event_ids))
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
    query = db.query(CommunitySympoEvent).filter(CommunitySympoEvent.event_id.in_(event_ids))
    if exclude_sympo_id is not None:
        query = query.filter(CommunitySympoEvent.sympo_id != exclude_sympo_id)
    rows = query.all()
    if not rows:
        return
    conflict_event_ids = sorted({row.event_id for row in rows})
    raise HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail={"message": "Some events are already mapped to another sympo", "event_ids": conflict_event_ids},
    )


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
            db.query(CommunityEvent).filter(CommunityEvent.community_id.in_(community_ids)).count()
        )

    deleted_counts["legacy_sympo_rows"] = int(
        db.query(CommunitySympoLegacy).filter(CommunitySympoLegacy.organising_club_id == club_id).count()
    )
    deleted_counts["normalized_sympos"] = int(
        db.query(CommunitySympo).filter(CommunitySympo.organising_club_id == club_id).count()
    )

    if community_ids:
        db.query(PersohubCommunity).filter(PersohubCommunity.id.in_(community_ids)).delete(synchronize_session=False)

    db.query(CommunitySympoLegacy).filter(CommunitySympoLegacy.organising_club_id == club_id).delete(synchronize_session=False)
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
        db.query(PersohubCommunity, PersohubClub, PdaUser)
        .outerjoin(PersohubClub, PersohubClub.id == PersohubCommunity.club_id)
        .outerjoin(PdaUser, PdaUser.id == PersohubCommunity.admin_id)
        .order_by(PersohubCommunity.name.asc(), PersohubCommunity.id.asc())
        .all()
    )
    return [_build_community_response(community, club, admin_user) for community, club, admin_user in rows]


@router.post("/pda-admin/cc/communities", response_model=CcCommunityResponse)
def create_cc_community(
    payload: CcCommunityCreateRequest,
    admin: PdaUser = Depends(require_superadmin),
    db: Session = Depends(get_db),
    request: Request = None,
):
    club = _assert_club_exists(db, payload.club_id)
    admin_user = _assert_admin_user_exists(db, payload.admin_id)

    if db.query(PersohubCommunity).filter(PersohubCommunity.profile_id == payload.profile_id).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Community profile_id already exists")

    community = PersohubCommunity(
        name=payload.name,
        profile_id=payload.profile_id,
        club_id=payload.club_id,
        admin_id=payload.admin_id,
        hashed_password=get_password_hash(payload.password),
        logo_url=payload.logo_url,
        description=payload.description,
        is_active=payload.is_active,
        is_root=payload.is_root,
    )
    db.add(community)

    try:
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
    return _build_community_response(community, club, admin_user)


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

    club = _assert_club_exists(db, updates.get("club_id", community.club_id))
    admin_user = _assert_admin_user_exists(db, updates.get("admin_id", community.admin_id))

    for key, value in updates.items():
        setattr(community, key, value)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Community update conflicts with existing data")

    db.refresh(community)
    log_admin_action(
        db,
        admin,
        "Update C&C community",
        request.method if request else None,
        request.url.path if request else None,
        {"community_id": community.id, "updated_fields": sorted(list(updates.keys()))},
    )
    return _build_community_response(community, club, admin_user)


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
        "linked_events": int(db.query(CommunityEvent).filter(CommunityEvent.community_id == community.id).count()),
    }

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


@router.get("/pda-admin/cc/sympos", response_model=List[CcSympoResponse])
def list_cc_sympos(
    _: PdaUser = Depends(require_superadmin),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(CommunitySympo, PersohubClub)
        .join(PersohubClub, PersohubClub.id == CommunitySympo.organising_club_id)
        .order_by(CommunitySympo.name.asc(), CommunitySympo.id.asc())
        .all()
    )
    return [_build_sympo_response(db, sympo, club.name) for sympo, club in rows]


@router.post("/pda-admin/cc/sympos", response_model=CcSympoResponse)
def create_cc_sympo(
    payload: CcSympoCreateRequest,
    admin: PdaUser = Depends(require_superadmin),
    db: Session = Depends(get_db),
    request: Request = None,
):
    club = _assert_club_exists(db, payload.organising_club_id)
    _validate_event_ids(db, payload.event_ids)
    _check_event_conflicts(db, payload.event_ids)

    sympo = CommunitySympo(
        name=payload.name,
        organising_club_id=payload.organising_club_id,
        content=payload.content,
    )
    db.add(sympo)
    db.flush()

    for event_id in payload.event_ids:
        db.add(CommunitySympoEvent(sympo_id=sympo.id, event_id=event_id))

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


@router.put("/pda-admin/cc/sympos/{sympo_id}", response_model=CcSympoResponse)
def update_cc_sympo(
    sympo_id: int,
    payload: CcSympoUpdateRequest,
    admin: PdaUser = Depends(require_superadmin),
    db: Session = Depends(get_db),
    request: Request = None,
):
    sympo = db.query(CommunitySympo).filter(CommunitySympo.id == sympo_id).first()
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
        db.query(CommunitySympoEvent).filter(CommunitySympoEvent.sympo_id == sympo_id).delete(synchronize_session=False)
        for event_id in updates["event_ids"]:
            db.add(CommunitySympoEvent(sympo_id=sympo_id, event_id=event_id))

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


@router.delete("/pda-admin/cc/sympos/{sympo_id}", response_model=CcDeleteSummaryResponse)
def delete_cc_sympo(
    sympo_id: int,
    admin: PdaUser = Depends(require_superadmin),
    db: Session = Depends(get_db),
    request: Request = None,
):
    sympo = db.query(CommunitySympo).filter(CommunitySympo.id == sympo_id).first()
    if not sympo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sympo not found")

    link_count = int(db.query(CommunitySympoEvent).filter(CommunitySympoEvent.sympo_id == sympo_id).count())
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


@router.get("/pda-admin/cc/options/community-events", response_model=List[CcCommunityEventOption])
def list_cc_community_event_options(
    _: PdaUser = Depends(require_superadmin),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(CommunityEvent, PersohubCommunity)
        .join(PersohubCommunity, PersohubCommunity.id == CommunityEvent.community_id)
        .order_by(CommunityEvent.title.asc(), CommunityEvent.id.asc())
        .all()
    )
    return [
        CcCommunityEventOption(
            id=event.id,
            slug=event.slug,
            event_code=event.event_code,
            title=event.title,
            community_id=community.id,
            community_name=community.name,
        )
        for event, community in rows
    ]


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
