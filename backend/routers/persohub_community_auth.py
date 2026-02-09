from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from auth import create_access_token, create_refresh_token, decode_token, verify_password
from database import get_db
from models import PdaUser, PersohubClub, PersohubCommunity
from persohub_schemas import (
    PersohubCommunityAuthResponse,
    PersohubCommunityLoginRequest,
    PersohubCommunityTokenResponse,
    PersohubRefreshRequest,
)
from security import require_persohub_community

router = APIRouter()



def _build_community_auth_response(db: Session, community: PersohubCommunity) -> PersohubCommunityAuthResponse:
    admin = db.query(PdaUser).filter(PdaUser.id == community.admin_id).first()
    club = db.query(PersohubClub).filter(PersohubClub.id == community.club_id).first() if community.club_id else None
    return PersohubCommunityAuthResponse(
        id=community.id,
        name=community.name,
        profile_id=community.profile_id,
        admin_id=community.admin_id,
        admin_name=admin.name if admin else None,
        logo_url=community.logo_url or (club.club_logo_url if club else None),
        club_id=community.club_id,
        club_name=club.name if club else None,
    )


@router.post("/persohub/community/auth/login", response_model=PersohubCommunityTokenResponse)
def community_login(payload: PersohubCommunityLoginRequest, db: Session = Depends(get_db)):
    profile_id = payload.profile_id.strip().lower()
    community = db.query(PersohubCommunity).filter(PersohubCommunity.profile_id == profile_id).first()
    if not community or not verify_password(payload.password, community.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid community credentials")
    if not community.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Community account is inactive")

    access_token = create_access_token({"sub": community.profile_id, "user_type": "community"})
    refresh_token = create_refresh_token({"sub": community.profile_id, "user_type": "community"})
    return PersohubCommunityTokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        community=_build_community_auth_response(db, community),
    )


@router.post("/persohub/community/auth/refresh", response_model=PersohubCommunityTokenResponse)
def community_refresh(payload: PersohubRefreshRequest, db: Session = Depends(get_db)):
    token_payload = decode_token(payload.refresh_token)
    if token_payload.get("type") != "refresh" or token_payload.get("user_type") != "community":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    profile_id = token_payload.get("sub")
    community = db.query(PersohubCommunity).filter(PersohubCommunity.profile_id == profile_id).first()
    if not community:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Community account not found")
    if not community.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Community account is inactive")

    access_token = create_access_token({"sub": community.profile_id, "user_type": "community"})
    refresh_token = create_refresh_token({"sub": community.profile_id, "user_type": "community"})
    return PersohubCommunityTokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        community=_build_community_auth_response(db, community),
    )


@router.get("/persohub/community/auth/me", response_model=PersohubCommunityAuthResponse)
def community_me(
    community: PersohubCommunity = Depends(require_persohub_community),
    db: Session = Depends(get_db),
):
    return _build_community_auth_response(db, community)
