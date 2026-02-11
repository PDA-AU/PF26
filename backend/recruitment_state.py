from datetime import datetime, timezone
from typing import Dict, Iterable, Optional

from sqlalchemy.orm import Session

from models import PdaResume, PdaUser


def _normalize_text(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    normalized = str(value).strip()
    return normalized or None


def clear_legacy_recruitment_json(user: PdaUser) -> None:
    if not isinstance(user.json_content, dict):
        return
    payload = dict(user.json_content)
    changed = False
    for key in (
        "is_applied",
        "preferred_team",
        "preferred_team_1",
        "preferred_team_2",
        "preferred_team_3",
        "applied_at",
        "resume_url",
    ):
        if key in payload:
            payload.pop(key, None)
            changed = True
    if changed:
        user.json_content = payload


def get_recruitment_resume(db: Session, user_id: int) -> Optional[PdaResume]:
    return db.query(PdaResume).filter(PdaResume.user_id == user_id).first()


def _build_recruitment_state(user: Optional[PdaUser], resume: Optional[PdaResume]) -> Dict[str, Optional[str]]:
    payload = user.json_content if user and isinstance(user.json_content, dict) else {}
    preferred_team_1 = _normalize_text(payload.get("preferred_team_1")) or _normalize_text(payload.get("preferred_team"))
    preferred_team_2 = _normalize_text(payload.get("preferred_team_2"))
    preferred_team_3 = _normalize_text(payload.get("preferred_team_3"))
    is_applied = payload.get("is_applied") is True
    if preferred_team_1 and not is_applied:
        is_applied = True
    resume_url = _normalize_text(payload.get("resume_url"))
    if not resume_url:
        resume_url = _normalize_text(resume.s3_url) if resume else None

    return {
        "is_applied": bool(is_applied),
        "preferred_team": preferred_team_1,
        "preferred_team_1": preferred_team_1,
        "preferred_team_2": preferred_team_2,
        "preferred_team_3": preferred_team_3,
        "resume_url": resume_url,
    }


def get_recruitment_state(
    db: Session,
    user_id: int,
    *,
    user: Optional[PdaUser] = None,
    resume: Optional[PdaResume] = None,
) -> Dict[str, Optional[str]]:
    loaded_user = user or db.query(PdaUser).filter(PdaUser.id == user_id).first()
    loaded_resume = resume if resume is not None else get_recruitment_resume(db, user_id)
    return _build_recruitment_state(loaded_user, loaded_resume)


def get_recruitment_state_map(db: Session, users: Iterable[PdaUser]) -> Dict[int, Dict[str, Optional[str]]]:
    user_list = [user for user in users if user and user.id is not None]
    if not user_list:
        return {}

    user_ids = [user.id for user in user_list]
    resumes = (
        db.query(PdaResume)
        .filter(PdaResume.user_id.in_(user_ids))
        .all()
    )
    resume_map = {row.user_id: row for row in resumes}
    return {user.id: _build_recruitment_state(user, resume_map.get(user.id)) for user in user_list}


def create_recruitment_application(
    db: Session,
    user: PdaUser,
    preferred_team_1: str,
    preferred_team_2: Optional[str] = None,
    preferred_team_3: Optional[str] = None,
    resume_url: Optional[str] = None,
) -> PdaUser:
    resume_row = get_recruitment_resume(db, user.id)
    normalized_resume_url = _normalize_text(resume_url)
    effective_resume_url = normalized_resume_url or (_normalize_text(resume_row.s3_url) if resume_row else None)

    if normalized_resume_url:
        if resume_row:
            resume_row.s3_url = normalized_resume_url
        else:
            db.add(PdaResume(user_id=user.id, s3_url=normalized_resume_url))

    payload = dict(user.json_content) if isinstance(user.json_content, dict) else {}
    payload["is_applied"] = True
    payload["preferred_team"] = str(preferred_team_1).strip()
    payload["preferred_team_1"] = str(preferred_team_1).strip()
    preferred_team_2_value = _normalize_text(preferred_team_2)
    preferred_team_3_value = _normalize_text(preferred_team_3)
    if preferred_team_2_value:
        payload["preferred_team_2"] = preferred_team_2_value
    else:
        payload.pop("preferred_team_2", None)
    if preferred_team_3_value:
        payload["preferred_team_3"] = preferred_team_3_value
    else:
        payload.pop("preferred_team_3", None)
    payload["applied_at"] = datetime.now(timezone.utc).isoformat()
    if effective_resume_url:
        payload["resume_url"] = effective_resume_url
    else:
        payload.pop("resume_url", None)

    user.json_content = payload
    return user


def update_recruitment_resume(
    db: Session,
    user: PdaUser,
    *,
    resume_url: Optional[str] = None,
    remove: bool = False,
) -> PdaUser:
    normalized_resume_url = _normalize_text(resume_url)
    resume_row = get_recruitment_resume(db, user.id)

    if remove:
        if resume_row:
            db.delete(resume_row)
        payload = dict(user.json_content) if isinstance(user.json_content, dict) else {}
        payload.pop("resume_url", None)
        user.json_content = payload
        return user

    if not normalized_resume_url:
        return user

    if resume_row:
        resume_row.s3_url = normalized_resume_url
    else:
        db.add(PdaResume(user_id=user.id, s3_url=normalized_resume_url))

    payload = dict(user.json_content) if isinstance(user.json_content, dict) else {}
    payload["resume_url"] = normalized_resume_url
    user.json_content = payload
    return user
