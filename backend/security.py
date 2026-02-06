from typing import Optional, Dict
from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from database import get_db
from auth import get_current_pda_user, get_current_participant
from models import PdaUser, PdaAdmin, PdaTeam


def _get_team_and_policy(db: Session, user: PdaUser):
    team = db.query(PdaTeam).filter(PdaTeam.user_id == user.id).first()
    admin_row = db.query(PdaAdmin).filter(PdaAdmin.regno == user.regno).first()
    policy: Optional[Dict[str, bool]] = admin_row.policy if admin_row else None
    is_superadmin = bool(admin_row and policy and policy.get("superAdmin"))
    return team, admin_row, policy, is_superadmin


def require_pda_user(user: PdaUser = Depends(get_current_pda_user)) -> PdaUser:
    return user


def require_participant(participant=Depends(get_current_participant)):
    return participant


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


def require_pda_pf_admin(user: PdaUser = Depends(require_pda_admin_policy("pf"))) -> PdaUser:
    return user


def require_superadmin(
    user: PdaUser = Depends(get_current_pda_user),
    db: Session = Depends(get_db)
) -> PdaUser:
    _, admin_row, policy, is_superadmin = _get_team_and_policy(db, user)
    if not admin_row or not policy or not is_superadmin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Superadmin access required")
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
