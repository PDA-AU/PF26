import logging
from typing import Optional, Dict
from fastapi import Depends, HTTPException, status
from fastapi import Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from database import get_db
from auth import decode_token, get_current_pda_user
from models import PdaUser, PdaAdmin, PdaTeam, PersohubAdmin, PersohubClub, PersohubCommunity, PersohubEvent, SystemConfig


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


def can_access_persohub_events(request: Optional[Request] = None) -> bool:
    return bool(getattr(getattr(request, "state", None), "persohub_can_access_events", False))


def require_persohub_community(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(community_bearer),
    db: Session = Depends(get_db),
) -> PersohubCommunity:
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Community authentication required")

    payload = decode_token(credentials.credentials)
    token_type = payload.get("type")
    user_type = payload.get("user_type")
    if token_type != "access":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid community token")

    community = None
    actor_user_id = None
    actor_role = None
    actor_club_id = None
    event_policy = {"events": {}}
    is_club_owner = False
    can_access_events = False

    if user_type == "community":
        profile_id = str(payload.get("sub") or "").strip().lower()
        if not profile_id:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid community token")
        community = db.query(PersohubCommunity).filter(PersohubCommunity.profile_id == profile_id).first()
        if not community:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Community account not found")
        actor_user_id = int(community.admin_id or 0) or None
        actor_role = "community_account"
        actor_club_id = int(community.club_id or 0) or None
        can_access_events = False
    elif user_type == "persohub_admin":
        subject = payload.get("sub")
        try:
            user_id = int(subject)
        except (TypeError, ValueError):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid community token")

        resolved_club_id = None
        raw_club_id = payload.get("club_id")
        if raw_club_id is not None:
            try:
                resolved_club_id = int(raw_club_id)
            except (TypeError, ValueError):
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid community token")
        selected_community_id = None
        raw_community_id = payload.get("community_id")
        if raw_community_id is not None:
            try:
                selected_community_id = int(raw_community_id)
            except (TypeError, ValueError):
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid community token")

        # One-release fallback for legacy community-scoped admin tokens.
        if resolved_club_id is None and selected_community_id:
            legacy_community = db.query(PersohubCommunity).filter(PersohubCommunity.id == selected_community_id).first()
            if not legacy_community:
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Community account not found")
            membership = (
                db.query(PersohubAdmin)
                .filter(
                    PersohubAdmin.community_id == selected_community_id,
                    PersohubAdmin.user_id == user_id,
                    PersohubAdmin.is_active == True,  # noqa: E712
                )
                .first()
            )
            if not membership:
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Community admin access revoked")
            resolved_club_id = int(legacy_community.club_id or 0) or None

        if not resolved_club_id:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid community token")

        club = db.query(PersohubClub).filter(PersohubClub.id == resolved_club_id).first()
        if not club:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Club not found")

        membership_rows = _club_memberships_for_user(db, club_id=resolved_club_id, user_id=user_id)
        is_club_owner = int(club.owner_user_id or 0) == int(user_id)
        if not is_club_owner and not membership_rows:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Community admin access revoked")

        selected_community = None
        if selected_community_id:
            selected_community = (
                db.query(PersohubCommunity)
                .filter(
                    PersohubCommunity.id == selected_community_id,
                    PersohubCommunity.club_id == resolved_club_id,
                    PersohubCommunity.is_active == True,  # noqa: E712
                )
                .first()
            )
        if not selected_community and membership_rows:
            selected_community = membership_rows[0][1]
        if not selected_community:
            selected_community = (
                db.query(PersohubCommunity)
                .filter(
                    PersohubCommunity.club_id == resolved_club_id,
                    PersohubCommunity.is_active == True,  # noqa: E712
                )
                .order_by(PersohubCommunity.id.asc())
                .first()
            )
        if not selected_community:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No active communities in this club")

        community = selected_community
        actor_user_id = int(user_id)
        actor_role = "owner" if is_club_owner else "admin"
        actor_club_id = resolved_club_id
        event_policy = _merge_persohub_admin_policy([row[0] for row in membership_rows])
        can_access_events = bool(is_club_owner or any(bool(value) for value in event_policy["events"].values()))
    else:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid community token")

    if not community.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Community account is inactive")

    request.state.persohub_actor_user_id = actor_user_id
    request.state.persohub_actor_role = actor_role
    request.state.persohub_actor_community_id = int(community.id)
    request.state.persohub_actor_club_id = int(actor_club_id or int(community.club_id or 0) or 0)
    request.state.persohub_is_club_owner = bool(is_club_owner)
    request.state.persohub_event_policy = _normalize_persohub_event_policy(event_policy)
    request.state.persohub_can_access_events = bool(can_access_events)
    request.state.persohub_token_user_type = user_type
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
    token_user_type = str(getattr(request.state, "persohub_token_user_type", "") or "").strip().lower()
    if token_user_type == "community":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Community account token cannot access Persohub admin events",
        )
    admin_user = _resolve_persohub_actor_user(db, community, request=request)
    if not admin_user:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Community admin mapping missing")

    event_slug = request.path_params.get("event_slug") or request.path_params.get("slug")
    if event_slug:
        event = db.query(PersohubEvent).filter(PersohubEvent.slug == event_slug).first()
        actor_club_id = get_persohub_actor_club_id(request) or int(community.club_id or 0)
        if actor_club_id <= 0 or not event or int(event.club_id or 0) != int(actor_club_id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
        if not is_persohub_club_owner(request):
            policy = get_persohub_actor_policy(request)
            if not _can_access_event_policy(policy, event_slug):
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin policy does not allow access to this event")
    return admin_user


def get_persohub_admin_context(
    request: Request,
    community: PersohubCommunity = Depends(require_persohub_community),
    db: Session = Depends(get_db),
):
    token_user_type = str(getattr(request.state, "persohub_token_user_type", "") or "").strip().lower()
    if token_user_type != "persohub_admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Persohub admin access required")
    admin_user = _resolve_persohub_actor_user(db, community, request=request)
    if not admin_user:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Community admin mapping missing")
    event_policy = get_persohub_actor_policy(request)
    is_owner = is_persohub_club_owner(request)
    return {
        "community": community,
        "admin_user": admin_user,
        "admin_row": {"community_id": community.id, "club_id": get_persohub_actor_club_id(request)},
        "policy": event_policy,
        "is_superadmin": bool(is_owner),
        "is_club_owner": bool(is_owner),
        "can_access_events": bool(is_owner or can_access_persohub_events(request)),
    }


def get_optional_persohub_community(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(optional_bearer),
    db: Session = Depends(get_db),
) -> Optional[PersohubCommunity]:
    if not credentials:
        return None
    try:
        payload = decode_token(credentials.credentials)
    except HTTPException:
        return None
    if payload.get("type") != "access":
        return None
    user_type = payload.get("user_type")
    if user_type == "community":
        profile_id = payload.get("sub")
        if not profile_id:
            return None
        return db.query(PersohubCommunity).filter(PersohubCommunity.profile_id == profile_id).first()
    if user_type == "persohub_admin":
        try:
            user_id = int(payload.get("sub"))
        except (TypeError, ValueError):
            return None
        club_id = payload.get("club_id")
        if club_id is None and payload.get("community_id") is not None:
            try:
                community_id = int(payload.get("community_id"))
            except (TypeError, ValueError):
                return None
            community = db.query(PersohubCommunity).filter(PersohubCommunity.id == community_id).first()
            if not community:
                return None
            club_id = int(community.club_id or 0) or None
        try:
            resolved_club_id = int(club_id)
        except (TypeError, ValueError):
            return None
        club = db.query(PersohubClub).filter(PersohubClub.id == resolved_club_id).first()
        if not club:
            return None
        is_owner = int(club.owner_user_id or 0) == int(user_id)
        memberships = _club_memberships_for_user(db, club_id=resolved_club_id, user_id=user_id)
        if not is_owner and not memberships:
            return None
        if payload.get("community_id") is not None:
            try:
                selected_community_id = int(payload.get("community_id"))
            except (TypeError, ValueError):
                selected_community_id = None
            if selected_community_id:
                selected = (
                    db.query(PersohubCommunity)
                    .filter(
                        PersohubCommunity.id == selected_community_id,
                        PersohubCommunity.club_id == resolved_club_id,
                        PersohubCommunity.is_active == True,  # noqa: E712
                    )
                    .first()
                )
                if selected:
                    return selected
        if memberships:
            return memberships[0][1]
        return (
            db.query(PersohubCommunity)
            .filter(
                PersohubCommunity.club_id == resolved_club_id,
                PersohubCommunity.is_active == True,  # noqa: E712
            )
            .order_by(PersohubCommunity.id.asc())
            .first()
        )
    return None
