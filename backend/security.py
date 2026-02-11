from typing import Optional, Dict
from fastapi import Depends, HTTPException, status
from fastapi import Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from database import get_db
from auth import decode_token, get_current_pda_user
from models import PdaUser, PdaAdmin, PdaTeam, PersohubCommunity


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


def require_persohub_community(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(community_bearer),
    db: Session = Depends(get_db),
) -> PersohubCommunity:
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Community authentication required")
    payload = decode_token(credentials.credentials)
    if payload.get("type") != "access" or payload.get("user_type") != "community":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid community token")
    profile_id = payload.get("sub")
    if not profile_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid community token")
    community = db.query(PersohubCommunity).filter(PersohubCommunity.profile_id == profile_id).first()
    if not community:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Community account not found")
    return community


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
    if payload.get("type") != "access" or payload.get("user_type") != "community":
        return None
    profile_id = payload.get("sub")
    if not profile_id:
        return None
    return db.query(PersohubCommunity).filter(PersohubCommunity.profile_id == profile_id).first()
