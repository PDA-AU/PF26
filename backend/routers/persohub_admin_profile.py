from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from models import PersohubClub, PersohubCommunity
from persohub_schemas import (
    PersohubAdminClubProfile,
    PersohubAdminClubUpdateRequest,
    PersohubAdminCommunityProfile,
    PersohubAdminCommunityUpdateRequest,
    PersohubAdminProfileResponse,
    PersohubAdminProfileUploadPresignRequest,
    PersohubAdminProfileUploadPresignResponse,
)
from security import require_persohub_community
from utils import _generate_presigned_put_url

router = APIRouter()

MAX_PROFILE_UPLOAD_BYTES = 10 * 1024 * 1024
ALLOWED_PROFILE_IMAGE_TYPES = {"image/png", "image/jpeg", "image/webp"}


def _build_club_profile(
    db: Session,
    club_id: int | None,
    *,
    editor_is_root: bool = False,
) -> PersohubAdminClubProfile | None:
    if not club_id:
        return None
    club = db.query(PersohubClub).filter(PersohubClub.id == club_id).first()
    if not club:
        return None
    linked_count = int(
        db.query(func.count(PersohubCommunity.id))
        .filter(PersohubCommunity.club_id == club.id)
        .scalar()
        or 0
    )
    can_edit = bool(editor_is_root)
    return PersohubAdminClubProfile(
        id=club.id,
        name=club.name,
        club_logo_url=club.club_logo_url,
        club_tagline=club.club_tagline,
        club_description=club.club_description,
        club_url=club.club_url,
        linked_community_count=linked_count,
        can_edit=can_edit,
    )


def _build_profile_response(db: Session, community: PersohubCommunity) -> PersohubAdminProfileResponse:
    return PersohubAdminProfileResponse(
        community=PersohubAdminCommunityProfile(
            id=community.id,
            name=community.name,
            profile_id=community.profile_id,
            logo_url=community.logo_url,
            description=community.description,
            is_active=community.is_active,
            is_root=bool(community.is_root),
            club_id=community.club_id,
        ),
        club=_build_club_profile(
            db,
            community.club_id,
            editor_is_root=bool(community.is_root),
        ),
    )


@router.get("/persohub/admin/profile", response_model=PersohubAdminProfileResponse)
def get_persohub_admin_profile(
    community: PersohubCommunity = Depends(require_persohub_community),
    db: Session = Depends(get_db),
):
    return _build_profile_response(db, community)


@router.put("/persohub/admin/profile/community", response_model=PersohubAdminProfileResponse)
def update_persohub_admin_community_profile(
    payload: PersohubAdminCommunityUpdateRequest,
    community: PersohubCommunity = Depends(require_persohub_community),
    db: Session = Depends(get_db),
):
    updates = payload.model_dump(exclude_unset=True)

    if "name" in updates:
        community.name = updates["name"]
    if "logo_url" in updates:
        community.logo_url = updates["logo_url"]
    if "description" in updates:
        community.description = updates["description"]

    db.commit()
    db.refresh(community)
    return _build_profile_response(db, community)


@router.put("/persohub/admin/profile/club", response_model=PersohubAdminProfileResponse)
def update_persohub_admin_club_profile(
    payload: PersohubAdminClubUpdateRequest,
    community: PersohubCommunity = Depends(require_persohub_community),
    db: Session = Depends(get_db),
):
    if not community.club_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No club linked to this community")

    club = db.query(PersohubClub).filter(PersohubClub.id == community.club_id).first()
    if not club:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Linked club not found")

    if not community.is_root:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only root community can edit club profile",
        )

    updates = payload.model_dump(exclude_unset=True)

    if "name" in updates:
        club.name = updates["name"]
    if "club_logo_url" in updates:
        club.club_logo_url = updates["club_logo_url"]
    if "club_tagline" in updates:
        club.club_tagline = updates["club_tagline"]
    if "club_description" in updates:
        club.club_description = updates["club_description"]
    if "club_url" in updates:
        club.club_url = updates["club_url"]

    db.commit()
    db.refresh(community)
    return _build_profile_response(db, community)


@router.post(
    "/persohub/admin/profile/uploads/presign",
    response_model=PersohubAdminProfileUploadPresignResponse,
)
def presign_persohub_profile_upload(
    payload: PersohubAdminProfileUploadPresignRequest,
    community: PersohubCommunity = Depends(require_persohub_community),
):
    if payload.size_bytes > MAX_PROFILE_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File exceeds {MAX_PROFILE_UPLOAD_BYTES // (1024 * 1024)}MB limit",
        )
    if payload.content_type not in ALLOWED_PROFILE_IMAGE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only PNG, JPEG, and WEBP images are allowed",
        )

    presigned = _generate_presigned_put_url(
        key_prefix=f"persohub/community/{community.profile_id}/profile",
        filename=payload.filename,
        content_type=payload.content_type,
        allowed_types=list(ALLOWED_PROFILE_IMAGE_TYPES),
    )
    return PersohubAdminProfileUploadPresignResponse(**presigned)
