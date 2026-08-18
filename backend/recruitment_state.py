from datetime import datetime, timezone
from typing import Dict, Iterable, List, Optional

from sqlalchemy.orm import Session

from models import PdaRecruitment, PdaRecruitmentTeam, PdaUser


def _normalize_text(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    normalized = str(value).strip()
    return normalized or None


def _passthrough_dt(value):
    return value or None


def clear_legacy_recruitment_json(user: PdaUser) -> None:
    """Kept as a no-op for backward compatibility with older callers.

    Recruitment data no longer lives in users.json_content; approve/reject
    delete the pda_recruitment row directly via delete_recruitment_application.
    """
    return None


def _title_map(db: Session) -> Dict[str, str]:
    rows = db.query(PdaRecruitmentTeam).all()
    return {row.team_code: row.title for row in rows}


def _build_state(record: Optional[PdaRecruitment], title_map: Dict[str, str]) -> Dict[str, Optional[object]]:
    if not record:
        return {
            "is_applied": False,
            "preferred_team": None,
            "preferred_team_1": None,
            "preferred_team_2": None,
            "preferred_team_3": None,
            "team_preferences": [],
            "resume_url": None,
            "applied_at": None,
        }
    prefs_raw = record.team_preferences or []
    prefs = [_normalize_text(p) for p in prefs_raw if _normalize_text(p)]
    titles = [title_map.get(code, code) for code in prefs]
    padded = titles + [None, None, None]
    return {
        "is_applied": True,
        "preferred_team": padded[0],
        "preferred_team_1": padded[0],
        "preferred_team_2": padded[1],
        "preferred_team_3": padded[2],
        "team_preferences": prefs,
        "resume_url": _normalize_text(record.resume_url),
        "applied_at": _passthrough_dt(record.applied_at),
    }


def get_recruitment_record(db: Session, user_id: int) -> Optional[PdaRecruitment]:
    return db.query(PdaRecruitment).filter(PdaRecruitment.user_id == user_id).first()


def get_recruitment_state(
    db: Session,
    user_id: int,
    *,
    user: Optional[PdaUser] = None,
    resume: Optional[PdaRecruitment] = None,
) -> Dict[str, Optional[object]]:
    record = resume if isinstance(resume, PdaRecruitment) else get_recruitment_record(db, user_id)
    return _build_state(record, _title_map(db))


def get_recruitment_state_map(db: Session, users: Iterable[PdaUser]) -> Dict[int, Dict[str, Optional[object]]]:
    user_list = [user for user in users if user and user.id is not None]
    if not user_list:
        return {}

    user_ids = [user.id for user in user_list]
    records = (
        db.query(PdaRecruitment)
        .filter(PdaRecruitment.user_id.in_(user_ids))
        .all()
    )
    record_map = {row.user_id: row for row in records}
    titles = _title_map(db)
    return {user.id: _build_state(record_map.get(user.id), titles) for user in user_list}


def _resolve_team_code(db: Session, value: Optional[str]) -> Optional[str]:
    """Accept either a team_code or a legacy title; return team_code or None."""
    normalized = _normalize_text(value)
    if not normalized:
        return None
    match = (
        db.query(PdaRecruitmentTeam)
        .filter(PdaRecruitmentTeam.team_code == normalized)
        .first()
    )
    if match:
        return match.team_code
    match = (
        db.query(PdaRecruitmentTeam)
        .filter(PdaRecruitmentTeam.title == normalized)
        .first()
    )
    return match.team_code if match else None


def create_recruitment_application(
    db: Session,
    user: PdaUser,
    preferred_team_1: str,
    preferred_team_2: Optional[str] = None,
    preferred_team_3: Optional[str] = None,
    resume_url: Optional[str] = None,
) -> PdaRecruitment:
    codes: List[str] = []
    for raw in (preferred_team_1, preferred_team_2, preferred_team_3):
        code = _resolve_team_code(db, raw)
        if code and code not in codes:
            codes.append(code)
    if not codes:
        raise ValueError("At least one valid preferred team is required")

    normalized_resume_url = _normalize_text(resume_url)

    existing = get_recruitment_record(db, user.id)
    if existing:
        existing.team_preferences = codes
        if normalized_resume_url:
            existing.resume_url = normalized_resume_url
        existing.applied_at = datetime.now(timezone.utc)
        return existing

    record = PdaRecruitment(
        user_id=user.id,
        team_preferences=codes,
        resume_url=normalized_resume_url,
        applied_at=datetime.now(timezone.utc),
    )
    db.add(record)
    return record


def update_recruitment_resume(
    db: Session,
    user: PdaUser,
    *,
    resume_url: Optional[str] = None,
    remove: bool = False,
) -> Optional[PdaRecruitment]:
    record = get_recruitment_record(db, user.id)
    if not record:
        return None
    if remove:
        record.resume_url = None
        return record
    normalized = _normalize_text(resume_url)
    if normalized:
        record.resume_url = normalized
    return record


def delete_recruitment_application(db: Session, user_id: int) -> bool:
    record = get_recruitment_record(db, user_id)
    if not record:
        return False
    db.delete(record)
    return True
