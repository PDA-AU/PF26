from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from auth import create_access_token, create_refresh_token, decode_token, verify_password
from database import get_db
from models import PdaAdmin, PdaUser, PersohubAdmin, PersohubClub, PersohubClubAdmin, PersohubCommunity
from persohub_schemas import (
    PersohubAdminClubOption,
    PersohubAdminCommunitySelectRequest,
    PersohubAdminLoginRequest,
    PersohubAdminLoginResponse,
    PersohubAdminTokenResponse,
    PersohubCommunityAuthResponse,
    PersohubCommunityLoginRequest,
    PersohubCommunityTokenResponse,
    PersohubRefreshRequest,
)
from security import (
    can_access_persohub_events,
    get_persohub_actor_policy,
    get_persohub_actor_role,
    get_persohub_actor_user_id,
    is_persohub_club_owner,
    require_pda_user,
    require_persohub_community,
)

router = APIRouter()
HARD_CUT_DETAIL = "Use PDA auth + Persohub account switch"


def _is_pda_superadmin_user(db: Session, user_id: int) -> bool:
    admin_row = db.query(PdaAdmin).filter(PdaAdmin.user_id == int(user_id)).first()
    policy = admin_row.policy if admin_row and isinstance(admin_row.policy, dict) else {}
    return bool(admin_row and policy.get("superAdmin"))


def _normalize_events_policy(policy: Optional[dict]) -> dict:
    if not isinstance(policy, dict):
        return {"events": {}}
    events = policy.get("events")
    if not isinstance(events, dict):
        return {"events": {}}
    normalized: Dict[str, bool] = {}
    for raw_slug, raw_allowed in events.items():
        slug = str(raw_slug or "").strip()
        if not slug:
            continue
        normalized[slug] = bool(raw_allowed)
    return {"events": normalized}


def _merge_admin_policy(rows: List[PersohubAdmin]) -> dict:
    merged = {"events": {}}
    for row in rows:
        normalized = _normalize_events_policy(getattr(row, "policy", None))
        for slug, allowed in normalized["events"].items():
            if allowed:
                merged["events"][slug] = True
            else:
                merged["events"].setdefault(slug, False)
    return merged


def _find_user_by_identifier(db: Session, identifier: str) -> Optional[PdaUser]:
    normalized = str(identifier or "").strip().lower()
    if not normalized:
        return None

    user = (
        db.query(PdaUser)
        .filter(func.lower(func.trim(PdaUser.regno)) == normalized)
        .first()
    )
    if user:
        return user

    user = (
        db.query(PdaUser)
        .filter(PdaUser.profile_name.isnot(None))
        .filter(func.lower(func.trim(PdaUser.profile_name)) == normalized)
        .first()
    )
    if user:
        return user

    return (
        db.query(PdaUser)
        .filter(func.lower(func.trim(PdaUser.email)) == normalized)
        .first()
    )


def _build_community_auth_response(
    db: Session,
    community: PersohubCommunity,
    *,
    actor_user_id: Optional[int],
    actor_role: Optional[str],
    is_owner: bool,
    is_club_superadmin: bool,
    can_access_events: bool,
    event_policy: Optional[dict],
) -> PersohubCommunityAuthResponse:
    club = db.query(PersohubClub).filter(PersohubClub.id == community.club_id).first() if community.club_id else None
    owner_user = db.query(PdaUser).filter(PdaUser.id == community.admin_id).first() if community.admin_id else None
    actor_user = db.query(PdaUser).filter(PdaUser.id == actor_user_id).first() if actor_user_id else None

    return PersohubCommunityAuthResponse(
        id=community.id,
        name=community.name,
        profile_id=community.profile_id,
        admin_id=(owner_user.id if owner_user else None),
        admin_name=(owner_user.name if owner_user else None),
        admin_regno=(owner_user.regno if owner_user else None),
        current_admin_user_id=(actor_user.id if actor_user else None),
        current_admin_name=(actor_user.name if actor_user else None),
        current_admin_regno=(actor_user.regno if actor_user else None),
        current_admin_role=(str(actor_role) if actor_role else None),
        logo_url=community.logo_url or (club.club_logo_url if club else None),
        club_id=community.club_id,
        club_name=(club.name if club else None),
        club_profile_id=(club.profile_id if club else None),
        club_owner_user_id=(int(club.owner_user_id) if club and club.owner_user_id else None),
        is_club_owner=bool(is_owner),
        is_club_superadmin=bool(is_club_superadmin),
        can_access_events=bool(can_access_events),
        event_policy=_normalize_events_policy(event_policy),
        is_root=bool(community.is_root),
    )


def _club_options_for_user(db: Session, user_id: int) -> List[PersohubAdminClubOption]:
    options: Dict[int, Dict[str, object]] = {}
    is_pda_superadmin = _is_pda_superadmin_user(db, int(user_id))

    if is_pda_superadmin:
        all_clubs = (
            db.query(PersohubClub)
            .order_by(PersohubClub.name.asc(), PersohubClub.id.asc())
            .all()
        )
        for club in all_clubs:
            options[int(club.id)] = {
                "club": club,
                "role": "owner",
                "can_access_events": True,
            }

    owned = (
        db.query(PersohubClub)
        .filter(PersohubClub.owner_user_id == user_id)
        .order_by(PersohubClub.name.asc(), PersohubClub.id.asc())
        .all()
    )
    for club in owned:
        options[int(club.id)] = {
            "club": club,
            "role": "owner",
            "can_access_events": True,
        }

    club_superadmin_rows = (
        db.query(PersohubClubAdmin, PersohubClub)
        .join(PersohubClub, PersohubClub.id == PersohubClubAdmin.club_id)
        .filter(
            PersohubClubAdmin.user_id == user_id,
            PersohubClubAdmin.is_active == True,  # noqa: E712
        )
        .order_by(PersohubClub.name.asc(), PersohubClub.id.asc())
        .all()
    )
    for club_admin, club in club_superadmin_rows:
        club_id = int(club.id)
        if club_id in options:
            continue
        options[club_id] = {
            "club": club,
            "role": "superadmin",
            "can_access_events": True,
        }

    delegated_rows = (
        db.query(PersohubAdmin, PersohubCommunity, PersohubClub)
        .join(PersohubCommunity, PersohubCommunity.id == PersohubAdmin.community_id)
        .join(PersohubClub, PersohubClub.id == PersohubCommunity.club_id)
        .filter(
            PersohubAdmin.user_id == user_id,
            PersohubAdmin.is_active == True,  # noqa: E712
            PersohubCommunity.is_active == True,  # noqa: E712
        )
        .order_by(PersohubClub.name.asc(), PersohubClub.id.asc(), PersohubCommunity.id.asc(), PersohubAdmin.id.asc())
        .all()
    )

    policy_rows_by_club: Dict[int, List[PersohubAdmin]] = {}
    for admin_row, _community, club in delegated_rows:
        club_id = int(club.id)
        policy_rows_by_club.setdefault(club_id, []).append(admin_row)
        if club_id not in options:
            options[club_id] = {
                "club": club,
                "role": "admin",
                "can_access_events": False,
            }

    for club_id, rows in policy_rows_by_club.items():
        merged_policy = _merge_admin_policy(rows)
        has_access = any(bool(value) for value in merged_policy["events"].values())
        if options[club_id]["role"] not in {"owner", "superadmin"}:
            options[club_id]["can_access_events"] = bool(has_access)

    result: List[PersohubAdminClubOption] = []
    for club_id in sorted(options.keys(), key=lambda key: (str(options[key]["club"].name or "").lower(), key)):
        option = options[club_id]
        club = option["club"]
        result.append(
            PersohubAdminClubOption(
                club_id=int(club.id),
                club_name=str(club.name or f"Club {club.id}"),
                club_profile_id=str(club.profile_id or "") or None,
                role=("owner" if option["role"] == "owner" else ("superadmin" if option["role"] == "superadmin" else "admin")),
                can_access_events=bool(option["can_access_events"]),
            )
        )
    return result


def _resolve_club_id_from_select_payload(db: Session, payload: PersohubAdminCommunitySelectRequest) -> int:
    if payload.club_id is not None:
        return int(payload.club_id)
    community = db.query(PersohubCommunity).filter(PersohubCommunity.id == int(payload.community_id)).first()
    if not community or not community.club_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Community not linked to a club")
    return int(community.club_id)


def _resolve_club_admin_context(
    db: Session,
    *,
    user_id: int,
    club_id: int,
    preferred_community_id: Optional[int] = None,
):
    club = db.query(PersohubClub).filter(PersohubClub.id == club_id).first()
    if not club:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Club not found")

    is_owner = int(club.owner_user_id or 0) == int(user_id)
    is_pda_superadmin = _is_pda_superadmin_user(db, int(user_id))
    is_club_superadmin = bool(
        db.query(PersohubClubAdmin)
        .filter(
            PersohubClubAdmin.club_id == int(club_id),
            PersohubClubAdmin.user_id == int(user_id),
            PersohubClubAdmin.is_active == True,  # noqa: E712
        )
        .first()
    )
    memberships = (
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
    membership_community_ids = {int(community.id) for _admin_row, community in memberships}

    if not is_owner and not is_pda_superadmin and not is_club_superadmin and not memberships:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Community admin access revoked")

    selected_community = None
    if preferred_community_id is not None:
        selected_community = (
            db.query(PersohubCommunity)
            .filter(
                PersohubCommunity.id == int(preferred_community_id),
                PersohubCommunity.club_id == club_id,
                PersohubCommunity.is_active == True,  # noqa: E712
            )
            .first()
        )
        if selected_community and not is_owner and not is_pda_superadmin and not is_club_superadmin and int(selected_community.id) not in membership_community_ids:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Community admin access revoked")

    if not selected_community and memberships:
        selected_community = memberships[0][1]

    if not selected_community:
        selected_community = (
            db.query(PersohubCommunity)
            .filter(
                PersohubCommunity.club_id == club_id,
                PersohubCommunity.is_active == True,  # noqa: E712
            )
            .order_by(PersohubCommunity.id.asc())
            .first()
        )

    if not selected_community:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No active communities in this club")

    merged_policy = _merge_admin_policy([row[0] for row in memberships])
    can_access_events = bool(is_owner or is_pda_superadmin or is_club_superadmin or any(bool(value) for value in merged_policy["events"].values()))

    return {
        "club": club,
        "community": selected_community,
        "is_owner": bool(is_owner or is_pda_superadmin),
        "is_club_superadmin": bool(is_club_superadmin and not (is_owner or is_pda_superadmin)),
        "event_policy": merged_policy,
        "can_access_events": can_access_events,
    }


def _issue_admin_tokens(user_id: int, club_id: int, community_id: int) -> tuple[str, str]:
    token_data = {
        "sub": str(user_id),
        "user_type": "persohub_admin",
        "club_id": int(club_id),
        "community_id": int(community_id),
    }
    return create_access_token(token_data), create_refresh_token(token_data)


@router.get("/persohub/session/options")
def persohub_session_options(
    user: PdaUser = Depends(require_pda_user),
    db: Session = Depends(get_db),
):
    user_id = int(user.id)
    options = _club_options_for_user(db, user_id)
    rows: List[PersohubCommunityAuthResponse] = []
    seen_community_ids: set[int] = set()

    for option in options:
        club_id = int(option.club_id)
        context = _resolve_club_admin_context(db, user_id=user_id, club_id=club_id)
        is_owner = bool(context["is_owner"])
        is_club_superadmin = bool(context["is_club_superadmin"])
        role = "owner" if is_owner else ("superadmin" if is_club_superadmin else "admin")
        event_policy = context["event_policy"]
        can_access_events = bool(context["can_access_events"])

        if is_owner or is_club_superadmin:
            communities = (
                db.query(PersohubCommunity)
                .filter(
                    PersohubCommunity.club_id == club_id,
                    PersohubCommunity.is_active == True,  # noqa: E712
                )
                .order_by(PersohubCommunity.id.asc())
                .all()
            )
        else:
            memberships = (
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
            communities = [item[1] for item in memberships]

        for community in communities:
            community_id = int(community.id)
            if community_id in seen_community_ids:
                continue
            seen_community_ids.add(community_id)
            rows.append(
                _build_community_auth_response(
                    db,
                    community,
                    actor_user_id=user_id,
                    actor_role=role,
                    is_owner=is_owner,
                    is_club_superadmin=is_club_superadmin,
                    can_access_events=can_access_events,
                    event_policy=event_policy,
                )
            )

    return {"items": rows}


@router.get("/persohub/session/active-community/{community_id}", response_model=PersohubCommunityAuthResponse)
def persohub_session_active_community(
    community_id: int,
    user: PdaUser = Depends(require_pda_user),
    db: Session = Depends(get_db),
):
    if int(community_id) <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid community id")
    community = (
        db.query(PersohubCommunity)
        .filter(
            PersohubCommunity.id == int(community_id),
            PersohubCommunity.is_active == True,  # noqa: E712
        )
        .first()
    )
    if not community:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Community account not found")
    club_id = int(community.club_id or 0)
    if club_id <= 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Community not linked to a club")

    context = _resolve_club_admin_context(
        db,
        user_id=int(user.id),
        club_id=club_id,
        preferred_community_id=int(community.id),
    )
    selected = context["community"]
    return _build_community_auth_response(
        db,
        selected,
        actor_user_id=int(user.id),
        actor_role=("owner" if context["is_owner"] else ("superadmin" if context["is_club_superadmin"] else "admin")),
        is_owner=bool(context["is_owner"]),
        is_club_superadmin=bool(context["is_club_superadmin"]),
        can_access_events=bool(context["can_access_events"]),
        event_policy=context["event_policy"],
    )


@router.post("/persohub/admin/auth/login", response_model=PersohubAdminLoginResponse)
def admin_login(payload: PersohubAdminLoginRequest, db: Session = Depends(get_db)):
    raise HTTPException(status_code=status.HTTP_410_GONE, detail=HARD_CUT_DETAIL)


@router.post("/persohub/admin/auth/select-club", response_model=PersohubAdminTokenResponse)
def admin_select_club(payload: PersohubAdminCommunitySelectRequest, db: Session = Depends(get_db)):
    raise HTTPException(status_code=status.HTTP_410_GONE, detail=HARD_CUT_DETAIL)


# One-release compatibility alias.
@router.post("/persohub/admin/auth/select-community", response_model=PersohubAdminTokenResponse)
def admin_select_community(payload: PersohubAdminCommunitySelectRequest, db: Session = Depends(get_db)):
    raise HTTPException(status_code=status.HTTP_410_GONE, detail=HARD_CUT_DETAIL)


@router.post("/persohub/admin/auth/refresh", response_model=PersohubAdminTokenResponse)
def admin_refresh(payload: PersohubRefreshRequest, db: Session = Depends(get_db)):
    raise HTTPException(status_code=status.HTTP_410_GONE, detail=HARD_CUT_DETAIL)


@router.get("/persohub/admin/auth/me", response_model=PersohubCommunityAuthResponse)
def admin_me():
    raise HTTPException(status_code=status.HTTP_410_GONE, detail=HARD_CUT_DETAIL)


@router.post("/persohub/community/auth/login", response_model=PersohubCommunityTokenResponse)
def community_login(payload: PersohubCommunityLoginRequest, db: Session = Depends(get_db)):
    raise HTTPException(status_code=status.HTTP_410_GONE, detail=HARD_CUT_DETAIL)


@router.post("/persohub/community/auth/refresh", response_model=PersohubCommunityTokenResponse)
def community_refresh(payload: PersohubRefreshRequest, db: Session = Depends(get_db)):
    raise HTTPException(status_code=status.HTTP_410_GONE, detail=HARD_CUT_DETAIL)


@router.get("/persohub/community/auth/me", response_model=PersohubCommunityAuthResponse)
def community_me():
    raise HTTPException(status_code=status.HTTP_410_GONE, detail=HARD_CUT_DETAIL)
