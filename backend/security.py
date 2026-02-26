import logging
from typing import Optional, Dict
from fastapi import Depends, HTTPException, status
from fastapi import Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from database import get_db
from auth import decode_token, get_current_pda_user
from models import (
    PdaUser,
    PdaAdmin,
    PdaTeam,
    PersohubAdmin,
    PersohubClub,
    PersohubClubAdmin,
    PersohubCommunity,
    PersohubEvent,
    SystemConfig,
)


logger = logging.getLogger(__name__)


def _get_team_and_policy(db: Session, user: PdaUser):
    team = db.query(PdaTeam).filter(PdaTeam.user_id == user.id).first()
    admin_row = db.query(PdaAdmin).filter(PdaAdmin.user_id == user.id).first()
    policy: Optional[Dict[str, bool]] = admin_row.policy if admin_row else None
    is_superadmin = bool(admin_row and policy and policy.get("superAdmin"))
    return team, admin_row, policy, is_superadmin


def _can_access_event_policy(policy: Optional[Dict[str, bool]], event_slug: str) -> bool:
    if not policy:
        return False
    events = policy.get("events") if isinstance(policy, dict) else None
    if not isinstance(events, dict):
        return False
    return bool(events.get(event_slug))


def require_pda_user(user: PdaUser = Depends(get_current_pda_user)) -> PdaUser:
    return user


def require_pda_admin_policy(policy_key: str):
    def _checker(
        user: PdaUser = Depends(get_current_pda_user),
        db: Session = Depends(get_db)
    ) -> PdaUser:
        team, admin_row, policy, is_superadmin = _get_team_and_policy(db, user)
        if is_superadmin:
            return user
        if not admin_row or not policy or not policy.get(policy_key):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin policy does not allow access")
        return user

    return _checker


def require_pda_home_admin(user: PdaUser = Depends(require_pda_admin_policy("home"))) -> PdaUser:
    return user


def require_superadmin(
    user: PdaUser = Depends(get_current_pda_user),
    db: Session = Depends(get_db)
) -> PdaUser:
    _, admin_row, policy, is_superadmin = _get_team_and_policy(db, user)
    if not admin_row or not policy or not is_superadmin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Superadmin access required")
    return user


def require_pda_event_admin(
    request: Request,
    user: PdaUser = Depends(get_current_pda_user),
    db: Session = Depends(get_db)
) -> PdaUser:
    _, admin_row, policy, is_superadmin = _get_team_and_policy(db, user)
    if is_superadmin:
        return user

    event_slug = request.path_params.get("event_slug") or request.path_params.get("slug")
    if not event_slug:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing event slug")

    if not admin_row or not _can_access_event_policy(policy, event_slug):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin policy does not allow access to this event")
    return user


def get_admin_context(
    user: PdaUser = Depends(get_current_pda_user),
    db: Session = Depends(get_db)
):
    team, admin_row, policy, is_superadmin = _get_team_and_policy(db, user)
    return {
        "team": team,
        "admin_row": admin_row,
        "policy": policy,
        "is_superadmin": is_superadmin
    }


optional_bearer = HTTPBearer(auto_error=False)
community_bearer = HTTPBearer(auto_error=False)


def get_optional_pda_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(optional_bearer),
    db: Session = Depends(get_db),
) -> Optional[PdaUser]:
    if not credentials:
        return None
    try:
        payload = decode_token(credentials.credentials)
    except HTTPException:
        return None
    if payload.get("type") != "access" or payload.get("user_type") != "pda":
        return None
    regno = payload.get("sub")
    if not regno:
        return None
    return db.query(PdaUser).filter(PdaUser.regno == regno).first()


def _normalize_persohub_event_policy(policy: Optional[dict]) -> dict:
    if not isinstance(policy, dict):
        return {"events": {}}
    raw_events = policy.get("events")
    if not isinstance(raw_events, dict):
        return {"events": {}}
    normalized_events = {}
    for raw_slug, raw_value in raw_events.items():
        slug = str(raw_slug or "").strip()
        if not slug:
            continue
        normalized_events[slug] = bool(raw_value)
    return {"events": normalized_events}


def _merge_persohub_admin_policy(rows) -> dict:
    merged = {"events": {}}
    for row in rows:
        normalized = _normalize_persohub_event_policy(getattr(row, "policy", None))
        for slug, allowed in normalized["events"].items():
            if allowed:
                merged["events"][slug] = True
            else:
                merged["events"].setdefault(slug, False)
    return merged


def _is_pda_superadmin_user(db: Session, user_id: int) -> bool:
    admin_row = db.query(PdaAdmin).filter(PdaAdmin.user_id == int(user_id)).first()
    policy = admin_row.policy if admin_row and isinstance(admin_row.policy, dict) else {}
    return bool(admin_row and policy.get("superAdmin"))


def _club_memberships_for_user(
    db: Session,
    *,
    club_id: int,
    user_id: int,
):
    return (
        db.query(PersohubAdmin, PersohubCommunity)
        .join(PersohubCommunity, PersohubCommunity.id == PersohubAdmin.community_id)
        .filter(
            PersohubCommunity.club_id == club_id,
            PersohubCommunity.is_active == True,  # noqa: E712
            PersohubAdmin.user_id == user_id,
            PersohubAdmin.is_active == True,  # noqa: E712
        )
        .order_by(PersohubCommunity.id.asc(), PersohubAdmin.id.asc())
        .all()
    )


def _is_persohub_club_superadmin_user(db: Session, club_id: int, user_id: int) -> bool:
    if int(club_id or 0) <= 0 or int(user_id or 0) <= 0:
        return False
    row = (
        db.query(PersohubClubAdmin)
        .filter(
            PersohubClubAdmin.club_id == int(club_id),
            PersohubClubAdmin.user_id == int(user_id),
            PersohubClubAdmin.is_active == True,  # noqa: E712
        )
        .first()
    )
    return bool(row)


def _resolve_persohub_actor_user(
    db: Session,
    community: PersohubCommunity,
    request: Optional[Request] = None,
) -> Optional[PdaUser]:
    actor_user_id = int(getattr(getattr(request, "state", None), "persohub_actor_user_id", 0) or 0)
    if actor_user_id <= 0:
        actor_user_id = int(community.admin_id or 0)
    if actor_user_id <= 0:
        return None
    return db.query(PdaUser).filter(PdaUser.id == actor_user_id).first()


def get_persohub_actor_user_id(request: Optional[Request] = None) -> Optional[int]:
    actor_user_id = int(getattr(getattr(request, "state", None), "persohub_actor_user_id", 0) or 0)
    return actor_user_id if actor_user_id > 0 else None


def get_persohub_actor_role(request: Optional[Request] = None) -> Optional[str]:
    role = str(getattr(getattr(request, "state", None), "persohub_actor_role", "") or "").strip().lower()
    return role or None


def get_persohub_actor_club_id(request: Optional[Request] = None) -> Optional[int]:
    club_id = int(getattr(getattr(request, "state", None), "persohub_actor_club_id", 0) or 0)
    return club_id if club_id > 0 else None


def get_persohub_actor_policy(request: Optional[Request] = None) -> dict:
    raw = getattr(getattr(request, "state", None), "persohub_event_policy", None)
    return _normalize_persohub_event_policy(raw)


def is_persohub_club_owner(request: Optional[Request] = None) -> bool:
    return bool(getattr(getattr(request, "state", None), "persohub_is_club_owner", False))


def is_persohub_club_superadmin(request: Optional[Request] = None) -> bool:
    return bool(getattr(getattr(request, "state", None), "persohub_is_club_superadmin", False))


def can_access_persohub_events(request: Optional[Request] = None) -> bool:
    return bool(getattr(getattr(request, "state", None), "persohub_can_access_events", False))


def is_persohub_club_events_access_approved(club: Optional[PersohubClub]) -> bool:
    if not club:
        return False
    profile_id = str(getattr(club, "profile_id", "") or "").strip().lower()
    if profile_id == "pda":
        return True
    raw = str(getattr(club, "persohub_events_access_status", "") or "").strip().lower()
    return raw == "approved"


def get_persohub_club_events_access_status(club: Optional[PersohubClub]) -> str:
    if not club:
        return "rejected"
    profile_id = str(getattr(club, "profile_id", "") or "").strip().lower()
    if profile_id == "pda":
        return "approved"
    raw = str(getattr(club, "persohub_events_access_status", "") or "").strip().lower()
    if raw in {"pending", "approved", "rejected"}:
        return raw
    return "rejected"


def get_persohub_event_access_status(event: Optional[PersohubEvent], club: Optional[PersohubClub] = None) -> str:
    if not event:
        return "rejected"
    profile_id = str(getattr(club, "profile_id", "") or "").strip().lower()
    if profile_id == "pda":
        return "approved"
    raw = str(getattr(event, "persohub_access_status", "") or "").strip().lower()
    if raw in {"pending", "approved", "rejected"}:
        return raw
    return "rejected"


def is_persohub_event_access_approved(event: Optional[PersohubEvent], club: Optional[PersohubClub] = None) -> bool:
    return get_persohub_event_access_status(event, club) == "approved"


def get_persohub_actor_events_access_status(request: Optional[Request] = None) -> str:
    raw = str(getattr(getattr(request, "state", None), "persohub_events_access_status", "") or "").strip().lower()
    if raw in {"pending", "approved", "rejected"}:
        return raw
    return "rejected"


def is_persohub_actor_events_access_approved(request: Optional[Request] = None) -> bool:
    return bool(getattr(getattr(request, "state", None), "persohub_events_access_approved", False))


def require_persohub_community(
    request: Request,
    user: PdaUser = Depends(get_current_pda_user),
    db: Session = Depends(get_db),
) -> PersohubCommunity:
    raw_community_id = str(request.headers.get("X-Persohub-Community-Id") or "").strip()
    if not raw_community_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Community switch required")
    try:
        selected_community_id = int(raw_community_id)
    except (TypeError, ValueError):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid X-Persohub-Community-Id")
    if selected_community_id <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid X-Persohub-Community-Id")

    community = (
        db.query(PersohubCommunity)
        .filter(PersohubCommunity.id == selected_community_id)
        .first()
    )
    if not community:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Community account not found")
    if not community.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Community account is inactive")

    resolved_club_id = int(community.club_id or 0)
    if resolved_club_id <= 0:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Community not linked to a club")

    user_id = int(user.id)
    club = db.query(PersohubClub).filter(PersohubClub.id == resolved_club_id).first()
    if not club:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Club not found")

    membership_rows = _club_memberships_for_user(db, club_id=resolved_club_id, user_id=user_id)
    membership_community_ids = {int(row[1].id) for row in membership_rows}
    is_pda_superadmin = _is_pda_superadmin_user(db, user_id)
    is_club_owner = int(club.owner_user_id or 0) == user_id or is_pda_superadmin
    is_club_superadmin_user = _is_persohub_club_superadmin_user(db, int(club.id), user_id)
    if not is_club_owner and not is_club_superadmin_user and not membership_rows:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Community admin access revoked")
    if not is_club_owner and not is_club_superadmin_user and int(community.id) not in membership_community_ids:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Community admin access revoked")
    path = str(getattr(request.url, "path", "") or "")
    if path.startswith("/api/persohub/admin/") and not (is_club_owner or is_club_superadmin_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Club admin access required")

    actor_user_id = user_id
    actor_role = "owner" if is_club_owner else ("superadmin" if is_club_superadmin_user else "admin")
    actor_club_id = resolved_club_id
    event_policy = _merge_persohub_admin_policy([row[0] for row in membership_rows])
    can_access_events = bool(is_club_owner or is_club_superadmin_user or any(bool(value) for value in event_policy["events"].values()))
    events_access_status = get_persohub_club_events_access_status(club)
    events_access_approved = is_persohub_club_events_access_approved(club)

    request.state.persohub_actor_user_id = actor_user_id
    request.state.persohub_actor_role = actor_role
    request.state.persohub_actor_community_id = int(community.id)
    request.state.persohub_actor_club_id = int(actor_club_id or int(community.club_id or 0) or 0)
    request.state.persohub_is_club_owner = bool(is_club_owner)
    request.state.persohub_is_club_superadmin = bool(is_club_superadmin_user)
    request.state.persohub_event_policy = _normalize_persohub_event_policy(event_policy)
    request.state.persohub_can_access_events = bool(can_access_events)
    request.state.persohub_events_access_status = events_access_status
    request.state.persohub_events_access_approved = bool(events_access_approved)
    request.state.persohub_events_access_review_note = (str(getattr(club, "persohub_events_access_review_note", "") or "").strip() or None)
    request.state.persohub_token_user_type = "pda"
    return community


def require_persohub_events_parity_enabled(
    db: Session = Depends(get_db),
) -> bool:
    row = db.query(SystemConfig).filter(SystemConfig.key == "persohub_events_parity_enabled").first()
    enabled = bool(row and str(row.value or "").strip().lower() in {"1", "true", "yes", "on"})
    if not enabled:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return True


def require_persohub_root_community_admin(
    request: Request,
    community: PersohubCommunity = Depends(require_persohub_community),
    db: Session = Depends(get_db),
) -> PdaUser:
    if not is_persohub_club_owner(request):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Club owner access required")
    admin_user = _resolve_persohub_actor_user(db, community, request=request)
    if not admin_user:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Club owner mapping missing")
    return admin_user


def require_persohub_event_admin(
    request: Request,
    community: PersohubCommunity = Depends(require_persohub_community),
    db: Session = Depends(get_db),
) -> PdaUser:
    admin_user = _resolve_persohub_actor_user(db, community, request=request)
    if not admin_user:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Community admin mapping missing")

    event_slug = request.path_params.get("event_slug") or request.path_params.get("slug")
    if event_slug:
        event = db.query(PersohubEvent).filter(PersohubEvent.slug == event_slug).first()
        actor_club_id = get_persohub_actor_club_id(request) or int(community.club_id or 0)
        if actor_club_id <= 0 or not event or int(event.club_id or 0) != int(actor_club_id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
        club = db.query(PersohubClub).filter(PersohubClub.id == int(event.club_id or 0)).first()
        if not is_persohub_event_access_approved(event, club):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Event access pending C&C approval")
        if not (is_persohub_club_owner(request) or is_persohub_club_superadmin(request)):
            policy = get_persohub_actor_policy(request)
            if not _can_access_event_policy(policy, event_slug):
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin policy does not allow access to this event")
    return admin_user


def get_persohub_admin_context(
    request: Request,
    community: PersohubCommunity = Depends(require_persohub_community),
    db: Session = Depends(get_db),
):
    admin_user = _resolve_persohub_actor_user(db, community, request=request)
    if not admin_user:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Community admin mapping missing")
    event_policy = get_persohub_actor_policy(request)
    is_owner = is_persohub_club_owner(request)
    is_club_super = is_persohub_club_superadmin(request)
    return {
        "community": community,
        "admin_user": admin_user,
        "admin_row": {"community_id": community.id, "club_id": get_persohub_actor_club_id(request)},
        "policy": event_policy,
        "is_superadmin": bool(is_owner or is_club_super),
        "is_club_owner": bool(is_owner),
        "is_club_superadmin": bool(is_club_super),
        "can_access_events": bool(is_owner or is_club_super or can_access_persohub_events(request)),
        "persohub_events_access_status": get_persohub_actor_events_access_status(request),
        "persohub_events_access_approved": bool(is_persohub_actor_events_access_approved(request)),
        "persohub_events_access_review_note": (str(getattr(request.state, "persohub_events_access_review_note", "") or "").strip() or None),
    }


def get_optional_persohub_community(
    request: Request,
    user: Optional[PdaUser] = Depends(get_optional_pda_user),
    db: Session = Depends(get_db),
) -> Optional[PersohubCommunity]:
    if not user:
        return None
    raw_community_id = str(request.headers.get("X-Persohub-Community-Id") or "").strip()
    if not raw_community_id:
        return None
    try:
        selected_community_id = int(raw_community_id)
    except (TypeError, ValueError):
        return None
    if selected_community_id <= 0:
        return None

    community = (
        db.query(PersohubCommunity)
        .filter(
            PersohubCommunity.id == selected_community_id,
            PersohubCommunity.is_active == True,  # noqa: E712
        )
        .first()
    )
    if not community:
        return None
    club_id = int(community.club_id or 0)
    if club_id <= 0:
        return None

    user_id = int(user.id)
    club = db.query(PersohubClub).filter(PersohubClub.id == club_id).first()
    if not club:
        return None
    is_owner = int(club.owner_user_id or 0) == user_id or _is_pda_superadmin_user(db, user_id)
    if is_owner:
        return community
    memberships = _club_memberships_for_user(db, club_id=club_id, user_id=user_id)
    for _admin_row, member_community in memberships:
        if int(member_community.id) == int(community.id):
            return community
    return None
