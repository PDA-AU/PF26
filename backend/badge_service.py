from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional, Tuple

from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from models import Badge, BadgeAssignment, PdaEvent, PersohubEvent


def _clean_text(value: Optional[str]) -> str:
    return str(value or "").strip()


def get_or_create_badge(
    db: Session,
    badge_name: str,
    image_url: Optional[str] = None,
    reveal_video_url: Optional[str] = None,
) -> Badge:
    normalized_name = _clean_text(badge_name)
    if not normalized_name:
        raise ValueError("badge_name is required")
    normalized_image = _clean_text(image_url) or None
    normalized_reveal_video = _clean_text(reveal_video_url) or None

    existing = (
        db.query(Badge)
        .filter(Badge.badge_name.ilike(normalized_name))
        .filter(Badge.image_url == normalized_image)
        .filter(Badge.reveal_video_url == normalized_reveal_video)
        .first()
    )
    if existing:
        return existing

    badge = Badge(
        badge_name=normalized_name,
        image_url=normalized_image,
        reveal_video_url=normalized_reveal_video,
    )
    db.add(badge)
    db.flush()
    return badge


def create_badge_assignment(
    db: Session,
    *,
    badge_name: str,
    image_url: Optional[str] = None,
    reveal_video_url: Optional[str] = None,
    user_id: Optional[int] = None,
    pda_team_id: Optional[int] = None,
    persohub_team_id: Optional[int] = None,
    pda_event_id: Optional[int] = None,
    persohub_event_id: Optional[int] = None,
    meta: Optional[Dict[str, Any]] = None,
) -> BadgeAssignment:
    target_count = int(user_id is not None) + int(pda_team_id is not None) + int(persohub_team_id is not None)
    if target_count != 1:
        raise ValueError("Exactly one target (user_id or team_id) is required")
    if pda_event_id is not None and persohub_event_id is not None:
        raise ValueError("At most one event context is allowed")

    badge = get_or_create_badge(
        db,
        badge_name=badge_name,
        image_url=image_url,
        reveal_video_url=reveal_video_url,
    )
    existing = (
        db.query(BadgeAssignment)
        .filter(BadgeAssignment.badge_id == badge.id)
        .filter(BadgeAssignment.user_id == user_id)
        .filter(BadgeAssignment.pda_team_id == pda_team_id)
        .filter(BadgeAssignment.persohub_team_id == persohub_team_id)
        .filter(BadgeAssignment.pda_event_id == pda_event_id)
        .filter(BadgeAssignment.persohub_event_id == persohub_event_id)
        .first()
    )
    if existing:
        if meta is not None:
            existing.meta = meta
        return existing

    row = BadgeAssignment(
        badge_id=badge.id,
        user_id=user_id,
        pda_team_id=pda_team_id,
        persohub_team_id=persohub_team_id,
        pda_event_id=pda_event_id,
        persohub_event_id=persohub_event_id,
        meta=meta or {},
    )
    db.add(row)
    db.flush()
    return row


def list_event_badges(db: Session, *, platform: str, event_id: int) -> List[Tuple[BadgeAssignment, Badge]]:
    q = db.query(BadgeAssignment, Badge).join(Badge, Badge.id == BadgeAssignment.badge_id)
    if platform == "pda":
        q = q.filter(BadgeAssignment.pda_event_id == event_id)
    else:
        q = q.filter(BadgeAssignment.persohub_event_id == event_id)
    return q.order_by(BadgeAssignment.created_at.desc(), BadgeAssignment.id.desc()).all()


def count_event_badges(db: Session, *, platform: str, event_id: int) -> int:
    q = db.query(BadgeAssignment)
    if platform == "pda":
        q = q.filter(BadgeAssignment.pda_event_id == event_id)
    else:
        q = q.filter(BadgeAssignment.persohub_event_id == event_id)
    return int(q.count())


def delete_badges_for_pda_event(db: Session, event_id: int) -> None:
    db.query(BadgeAssignment).filter(BadgeAssignment.pda_event_id == event_id).delete(synchronize_session=False)


def delete_badges_for_persohub_event(db: Session, event_id: int) -> None:
    db.query(BadgeAssignment).filter(BadgeAssignment.persohub_event_id == event_id).delete(synchronize_session=False)


def delete_badges_for_user(db: Session, user_id: int) -> None:
    db.query(BadgeAssignment).filter(BadgeAssignment.user_id == user_id).delete(synchronize_session=False)


def delete_badges_for_pda_event_user(db: Session, event_id: int, user_id: int) -> None:
    db.query(BadgeAssignment).filter(
        and_(BadgeAssignment.pda_event_id == event_id, BadgeAssignment.user_id == user_id)
    ).delete(synchronize_session=False)


def delete_badges_for_pda_event_team(db: Session, event_id: int, team_id: int) -> None:
    db.query(BadgeAssignment).filter(
        and_(BadgeAssignment.pda_event_id == event_id, BadgeAssignment.pda_team_id == team_id)
    ).delete(synchronize_session=False)


def delete_badges_for_persohub_event_user(db: Session, event_id: int, user_id: int) -> None:
    db.query(BadgeAssignment).filter(
        and_(BadgeAssignment.persohub_event_id == event_id, BadgeAssignment.user_id == user_id)
    ).delete(synchronize_session=False)


def delete_badges_for_persohub_event_team(db: Session, event_id: int, team_id: int) -> None:
    db.query(BadgeAssignment).filter(
        and_(BadgeAssignment.persohub_event_id == event_id, BadgeAssignment.persohub_team_id == team_id)
    ).delete(synchronize_session=False)


def delete_badges_for_pda_teams(db: Session, team_ids: Iterable[int]) -> None:
    ids = [int(item) for item in team_ids if item is not None]
    if not ids:
        return
    db.query(BadgeAssignment).filter(BadgeAssignment.pda_team_id.in_(ids)).delete(synchronize_session=False)


def delete_badges_for_persohub_teams(db: Session, team_ids: Iterable[int]) -> None:
    ids = [int(item) for item in team_ids if item is not None]
    if not ids:
        return
    db.query(BadgeAssignment).filter(BadgeAssignment.persohub_team_id.in_(ids)).delete(synchronize_session=False)


def get_user_achievements(db: Session, *, platform: str, user_id: int, team_ids: Iterable[int]) -> List[Tuple[BadgeAssignment, Badge, Optional[Any]]]:
    ids = [int(item) for item in team_ids if item is not None]
    q = db.query(BadgeAssignment, Badge).join(Badge, Badge.id == BadgeAssignment.badge_id)
    if platform == "pda":
        event_join = PdaEvent
        q = q.outerjoin(PdaEvent, PdaEvent.id == BadgeAssignment.pda_event_id)
        q = q.add_columns(PdaEvent)
        if ids:
            q = q.filter(or_(BadgeAssignment.user_id == user_id, BadgeAssignment.pda_team_id.in_(ids)))
        else:
            q = q.filter(BadgeAssignment.user_id == user_id)
    else:
        event_join = PersohubEvent
        q = q.outerjoin(PersohubEvent, PersohubEvent.id == BadgeAssignment.persohub_event_id)
        q = q.add_columns(PersohubEvent)
        if ids:
            q = q.filter(or_(BadgeAssignment.user_id == user_id, BadgeAssignment.persohub_team_id.in_(ids)))
        else:
            q = q.filter(BadgeAssignment.user_id == user_id)
    return q.order_by(BadgeAssignment.created_at.desc(), BadgeAssignment.id.desc()).all()


def get_user_badge_assignments(db: Session, user_id: int, limit: int = 100) -> List[Tuple[BadgeAssignment, Badge]]:
    q = (
        db.query(BadgeAssignment, Badge)
        .join(Badge, Badge.id == BadgeAssignment.badge_id)
        .filter(BadgeAssignment.user_id == user_id)
        .order_by(BadgeAssignment.created_at.desc(), BadgeAssignment.id.desc())
    )
    if limit > 0:
        q = q.limit(int(limit))
    return q.all()
