from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from models import PdaUser


def normalize_identifier(value: Optional[str]) -> str:
    return str(value or "").strip().lower()


def ensure_no_identifier_collision(
    db: Session,
    *,
    regno: Optional[str] = None,
    profile_name: Optional[str] = None,
) -> None:
    normalized_regno = normalize_identifier(regno)
    normalized_profile = normalize_identifier(profile_name)

    if normalized_profile:
        regno_conflict = (
            db.query(PdaUser.id)
            .filter(func.lower(func.trim(PdaUser.regno)) == normalized_profile)
            .first()
        )
        if regno_conflict:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Profile name collides with an existing register number",
            )

    if normalized_regno:
        profile_conflict = (
            db.query(PdaUser.id)
            .filter(PdaUser.profile_name.isnot(None))
            .filter(func.lower(func.trim(PdaUser.profile_name)) == normalized_regno)
            .first()
        )
        if profile_conflict:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Register number collides with an existing profile name",
            )
