from datetime import datetime, timedelta, timezone
import os
import random
import string
from typing import List, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func, text, or_

from auth import create_access_token
from database import get_db
from emailer import send_email
from models import (
    PdaUser,
    PdaEvent,
    PdaEventStatus,
    PdaEventParticipantMode,
    PdaEventEntityType,
    PdaEventRegistrationStatus,
    PdaEventRegistration,
    PdaEventTeam,
    PdaEventTeamMember,
    PdaEventInvite,
    PdaEventInviteStatus,
    PdaEventRound,
    PdaEventBadge,
    PdaEventAttendance,
    PdaEventScore,
)
from schemas import (
    PdaManagedAchievement,
    PdaManagedCertificateResponse,
    PdaManagedEventDashboard,
    PdaManagedEventResponse,
    PdaManagedMyEvent,
    PdaManagedQrResponse,
    PdaManagedTeamCreate,
    PdaManagedTeamInvite,
    PdaManagedTeamJoin,
    PdaManagedTeamMemberResponse,
    PdaManagedTeamResponse,
    PdaManagedEntityTypeEnum,
)
from security import require_pda_user

router = APIRouter()


def _get_event_or_404(db: Session, slug: str) -> PdaEvent:
    event = db.query(PdaEvent).filter(PdaEvent.slug == slug).first()
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    return event


def _normalize_team_code(value: str) -> str:
    return str(value or "").strip().upper()


def _make_team_code() -> str:
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=5))


def _make_referral_code() -> str:
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=5))


def _batch_from_regno(regno: str) -> Optional[str]:
    value = str(regno or "").strip()
    if len(value) < 4 or not value[:4].isdigit():
        return None
    return value[:4]


def _next_event_referral_code(db: Session, event_id: int) -> str:
    candidate = _make_referral_code()
    while db.query(PdaEventRegistration).filter(
        PdaEventRegistration.event_id == event_id,
        PdaEventRegistration.referral_code == candidate,
    ).first():
        candidate = _make_referral_code()
    return candidate


def _build_team_response(db: Session, team: PdaEventTeam) -> PdaManagedTeamResponse:
    members = (
        db.query(PdaEventTeamMember, PdaUser)
        .join(PdaUser, PdaEventTeamMember.user_id == PdaUser.id)
        .filter(PdaEventTeamMember.team_id == team.id)
        .order_by(PdaEventTeamMember.created_at.asc())
        .all()
    )
    payload = [
        PdaManagedTeamMemberResponse(
            user_id=user.id,
            regno=user.regno,
            name=user.name,
            role=member.role,
        )
        for member, user in members
    ]
    return PdaManagedTeamResponse(
        id=team.id,
        event_id=team.event_id,
        team_code=team.team_code,
        team_name=team.team_name,
        team_lead_user_id=team.team_lead_user_id,
        members=payload,
    )


def _get_user_team_for_event(db: Session, event_id: int, user_id: int) -> Optional[PdaEventTeam]:
    row = (
        db.query(PdaEventTeam)
        .join(PdaEventTeamMember, PdaEventTeamMember.team_id == PdaEventTeam.id)
        .filter(PdaEventTeam.event_id == event_id, PdaEventTeamMember.user_id == user_id)
        .first()
    )
    return row


def _send_registration_email(user: PdaUser, event: PdaEvent, details: str) -> None:
    if not user.email:
        return
    subject = f"Registration Confirmed - {event.title}"
    text = (
        f"Hello {user.name},\n\n"
        f"You are registered for {event.title} ({event.event_code}).\n"
        f"{details}\n\n"
        "Regards,\nPDA WEB TEAM"
    )
    html = (
        "<html><body>"
        f"<p>Hello {user.name},</p>"
        f"<p>You are registered for <strong>{event.title}</strong> ({event.event_code}).</p>"
        f"<p>{details}</p>"
        "<p>Regards,<br/><strong>PDA WEB TEAM</strong></p>"
        "</body></html>"
    )
    try:
        send_email(user.email, subject, html, text)
    except Exception:
        pass


@router.get("/pda/events/ongoing", response_model=List[PdaManagedEventResponse])
def list_ongoing_events(db: Session = Depends(get_db)):
    events = (
        db.query(PdaEvent)
        .filter(PdaEvent.status == PdaEventStatus.OPEN)
        .order_by(PdaEvent.created_at.desc())
        .all()
    )
    return [PdaManagedEventResponse.model_validate(event) for event in events]


@router.get("/pda/events/{slug}", response_model=PdaManagedEventResponse)
def get_event(slug: str, db: Session = Depends(get_db)):
    event = _get_event_or_404(db, slug)
    return PdaManagedEventResponse.model_validate(event)


@router.get("/pda/events/{slug}/dashboard", response_model=PdaManagedEventDashboard)
def get_event_dashboard(
    slug: str,
    user: PdaUser = Depends(require_pda_user),
    db: Session = Depends(get_db),
):
    event = _get_event_or_404(db, slug)

    team = _get_user_team_for_event(db, event.id, user.id) if event.participant_mode == PdaEventParticipantMode.TEAM else None
    registration = db.query(PdaEventRegistration).filter(
        PdaEventRegistration.event_id == event.id,
        (
            (PdaEventRegistration.user_id == user.id)
            if event.participant_mode == PdaEventParticipantMode.INDIVIDUAL
            else (PdaEventRegistration.team_id == (team.id if team else -1))
        )
    ).first()

    members_payload = []
    if team:
        members = (
            db.query(PdaEventTeamMember, PdaUser)
            .join(PdaUser, PdaEventTeamMember.user_id == PdaUser.id)
            .filter(PdaEventTeamMember.team_id == team.id)
            .all()
        )
        members_payload = [
            {
                "user_id": member.user_id,
                "name": u.name,
                "regno": u.regno,
                "role": member.role,
            }
            for member, u in members
        ]

    rounds_count = db.query(PdaEventRound).filter(PdaEventRound.event_id == event.id).count()
    badges_count = db.query(PdaEventBadge).filter(PdaEventBadge.event_id == event.id).count()

    entity_type = None
    entity_id = None
    if registration:
        entity_type = PdaManagedEntityTypeEnum.TEAM if registration.team_id else PdaManagedEntityTypeEnum.USER
        entity_id = registration.team_id if registration.team_id else registration.user_id

    return PdaManagedEventDashboard(
        event=PdaManagedEventResponse.model_validate(event),
        is_registered=bool(registration),
        entity_type=entity_type,
        entity_id=entity_id,
        team_code=team.team_code if team else None,
        team_name=team.team_name if team else None,
        team_members=members_payload,
        rounds_count=rounds_count,
        badges_count=badges_count,
    )


@router.post("/pda/events/{slug}/register", response_model=PdaManagedEventDashboard)
def register_individual_event(
    slug: str,
    referral_code: Optional[str] = None,
    user: PdaUser = Depends(require_pda_user),
    db: Session = Depends(get_db),
):
    event = _get_event_or_404(db, slug)
    if event.status != PdaEventStatus.OPEN:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Event is closed")
    if event.participant_mode != PdaEventParticipantMode.INDIVIDUAL:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Use team registration for this event")

    existing = db.query(PdaEventRegistration).filter(
        PdaEventRegistration.event_id == event.id,
        PdaEventRegistration.user_id == user.id,
    ).first()
    if existing:
        return get_event_dashboard(slug=slug, user=user, db=db)

    row = PdaEventRegistration(
        event_id=event.id,
        user_id=user.id,
        team_id=None,
        entity_type=PdaEventEntityType.USER,
        status=PdaEventRegistrationStatus.ACTIVE,
        referral_code=_next_event_referral_code(db, event.id),
        referred_by=(str(referral_code or "").strip().upper() or None),
        referral_count=0,
    )
    db.add(row)
    if row.referred_by:
        referrer = db.query(PdaEventRegistration).filter(
            PdaEventRegistration.event_id == event.id,
            PdaEventRegistration.entity_type == PdaEventEntityType.USER,
            PdaEventRegistration.referral_code == row.referred_by,
        ).first()
        if referrer:
            referrer.referral_count = int(referrer.referral_count or 0) + 1
    db.commit()
    _send_registration_email(user, event, "Participant mode: Individual")
    return get_event_dashboard(slug=slug, user=user, db=db)


@router.post("/pda/events/{slug}/teams/create", response_model=PdaManagedTeamResponse)
def create_team(
    slug: str,
    payload: PdaManagedTeamCreate,
    user: PdaUser = Depends(require_pda_user),
    db: Session = Depends(get_db),
):
    event = _get_event_or_404(db, slug)
    if event.status != PdaEventStatus.OPEN:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Event is closed")
    if event.participant_mode != PdaEventParticipantMode.TEAM:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This event is not a team event")

    existing_team = _get_user_team_for_event(db, event.id, user.id)
    if existing_team:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="You are already part of a team")

    team_code = _make_team_code()
    while db.query(PdaEventTeam).filter(PdaEventTeam.event_id == event.id, PdaEventTeam.team_code == team_code).first():
        team_code = _make_team_code()

    team = PdaEventTeam(
        event_id=event.id,
        team_code=team_code,
        team_name=payload.team_name.strip(),
        team_lead_user_id=user.id,
    )
    db.add(team)
    db.flush()

    member = PdaEventTeamMember(team_id=team.id, user_id=user.id, role="leader")
    db.add(member)

    registration = PdaEventRegistration(
        event_id=event.id,
        user_id=None,
        team_id=team.id,
        entity_type=PdaEventEntityType.TEAM,
    )
    db.add(registration)
    db.commit()
    db.refresh(team)

    _send_registration_email(user, event, f"Participant mode: Team\nTeam code: {team.team_code}")
    return _build_team_response(db, team)


@router.post("/pda/events/{slug}/teams/join", response_model=PdaManagedTeamResponse)
def join_team(
    slug: str,
    payload: PdaManagedTeamJoin,
    user: PdaUser = Depends(require_pda_user),
    db: Session = Depends(get_db),
):
    event = _get_event_or_404(db, slug)
    if event.status != PdaEventStatus.OPEN:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Event is closed")
    if event.participant_mode != PdaEventParticipantMode.TEAM:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This event is not a team event")

    existing_team = _get_user_team_for_event(db, event.id, user.id)
    if existing_team:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="You are already part of a team")

    team_code = _normalize_team_code(payload.team_code)
    team = db.query(PdaEventTeam).filter(PdaEventTeam.event_id == event.id, PdaEventTeam.team_code == team_code).first()
    if not team:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")

    if event.team_max_size:
        member_count = db.query(PdaEventTeamMember).filter(PdaEventTeamMember.team_id == team.id).count()
        if member_count >= event.team_max_size:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Team is full")

    db.add(PdaEventTeamMember(team_id=team.id, user_id=user.id, role="member"))
    registration = db.query(PdaEventRegistration).filter(
        PdaEventRegistration.event_id == event.id,
        PdaEventRegistration.team_id == team.id,
    ).first()
    if not registration:
        db.add(
            PdaEventRegistration(
                event_id=event.id,
                user_id=None,
                team_id=team.id,
                entity_type=PdaEventEntityType.TEAM,
            )
        )
    db.commit()

    leader = db.query(PdaUser).filter(PdaUser.id == team.team_lead_user_id).first()
    if leader and leader.email:
        _send_registration_email(
            leader,
            event,
            f"{user.name} ({user.regno}) joined your team {team.team_name} ({team.team_code}).",
        )
    return _build_team_response(db, team)


@router.get("/pda/events/{slug}/team", response_model=PdaManagedTeamResponse)
def get_my_team(
    slug: str,
    user: PdaUser = Depends(require_pda_user),
    db: Session = Depends(get_db),
):
    event = _get_event_or_404(db, slug)
    if event.participant_mode != PdaEventParticipantMode.TEAM:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This event is not a team event")
    team = _get_user_team_for_event(db, event.id, user.id)
    if not team:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")
    return _build_team_response(db, team)


@router.post("/pda/events/{slug}/team/invite")
def invite_to_team(
    slug: str,
    payload: PdaManagedTeamInvite,
    user: PdaUser = Depends(require_pda_user),
    db: Session = Depends(get_db),
):
    event = _get_event_or_404(db, slug)
    if event.participant_mode != PdaEventParticipantMode.TEAM:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This event is not a team event")

    team = _get_user_team_for_event(db, event.id, user.id)
    if not team:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")
    if team.team_lead_user_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only team leader can invite")

    target = db.query(PdaUser).filter(PdaUser.regno == payload.regno.strip()).first()
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if _get_user_team_for_event(db, event.id, target.id):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="User already in a team")
    if event.team_max_size:
        member_count = db.query(PdaEventTeamMember).filter(PdaEventTeamMember.team_id == team.id).count()
        if member_count >= event.team_max_size:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Team is full")

    existing_member = (
        db.query(PdaEventTeamMember)
        .filter(PdaEventTeamMember.team_id == team.id, PdaEventTeamMember.user_id == target.id)
        .first()
    )
    if not existing_member:
        db.add(PdaEventTeamMember(team_id=team.id, user_id=target.id, role="member"))

    invite = (
        db.query(PdaEventInvite)
        .filter(
            PdaEventInvite.event_id == event.id,
            PdaEventInvite.team_id == team.id,
            PdaEventInvite.invited_user_id == target.id,
        )
        .first()
    )
    if invite:
        invite.invited_by_user_id = user.id
        invite.status = PdaEventInviteStatus.ACCEPTED
    else:
        db.add(
            PdaEventInvite(
                event_id=event.id,
                team_id=team.id,
                invited_user_id=target.id,
                invited_by_user_id=user.id,
                status=PdaEventInviteStatus.ACCEPTED,
            )
        )
    db.commit()

    if target.email:
        details = f"You were added to team {team.team_name} ({team.team_code}) for {event.title}."
        _send_registration_email(target, event, details)
    return {"message": "Team member added"}


@router.get("/pda/events/{slug}/qr", response_model=PdaManagedQrResponse)
def get_event_qr_token(
    slug: str,
    user: PdaUser = Depends(require_pda_user),
    db: Session = Depends(get_db),
):
    event = _get_event_or_404(db, slug)
    entity_type = PdaManagedEntityTypeEnum.USER
    entity_id = user.id
    if event.participant_mode == PdaEventParticipantMode.TEAM:
        team = _get_user_team_for_event(db, event.id, user.id)
        if not team:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")
        entity_type = PdaManagedEntityTypeEnum.TEAM
        entity_id = team.id
    else:
        exists = db.query(PdaEventRegistration).filter(
            PdaEventRegistration.event_id == event.id,
            PdaEventRegistration.user_id == user.id,
        ).first()
        if not exists:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registration not found")

    token = create_access_token(
        {
            "sub": user.regno,
            "user_type": "pda",
            "qr": "pda_event_attendance",
            "event_slug": event.slug,
            "entity_type": entity_type.value,
            "entity_id": entity_id,
        },
        expires_delta=timedelta(hours=12),
    )
    return PdaManagedQrResponse(event_slug=event.slug, entity_type=entity_type, entity_id=entity_id, qr_token=token)


@router.get("/pda/me/events", response_model=List[PdaManagedMyEvent])
def my_events(user: PdaUser = Depends(require_pda_user), db: Session = Depends(get_db)):
    registrations = db.query(PdaEventRegistration).filter(PdaEventRegistration.user_id == user.id).all()
    team_rows = (
        db.query(PdaEventTeamMember, PdaEventTeam)
        .join(PdaEventTeam, PdaEventTeamMember.team_id == PdaEventTeam.id)
        .filter(PdaEventTeamMember.user_id == user.id)
        .all()
    )
    team_ids = [team.id for _, team in team_rows]
    if team_ids:
        registrations.extend(
            db.query(PdaEventRegistration).filter(PdaEventRegistration.team_id.in_(team_ids)).all()
        )

    results: List[PdaManagedMyEvent] = []
    seen: set[Tuple[int, Optional[int], Optional[int]]] = set()
    for reg in registrations:
        event = db.query(PdaEvent).filter(PdaEvent.id == reg.event_id).first()
        if not event:
            continue
        key = (event.id, reg.user_id, reg.team_id)
        if key in seen:
            continue
        seen.add(key)

        attendance_query = db.query(func.count(PdaEventAttendance.id)).filter(
            PdaEventAttendance.event_id == event.id,
            PdaEventAttendance.is_present == True,  # noqa: E712
        )
        if reg.user_id:
            attendance_query = attendance_query.filter(PdaEventAttendance.user_id == reg.user_id)
        else:
            attendance_query = attendance_query.filter(PdaEventAttendance.team_id == reg.team_id)
        attendance_count = attendance_query.scalar() or 0

        cumulative_score = 0.0
        if reg.user_id:
            score_rows = db.execute(
                text("SELECT COALESCE(SUM(total_score), 0) AS total FROM pda_event_scores WHERE event_id = :event_id AND user_id = :user_id"),
                {"event_id": event.id, "user_id": reg.user_id},
            ).fetchone()
        else:
            score_rows = db.execute(
                text("SELECT COALESCE(SUM(total_score), 0) AS total FROM pda_event_scores WHERE event_id = :event_id AND team_id = :team_id"),
                {"event_id": event.id, "team_id": reg.team_id},
            ).fetchone()
        if score_rows:
            cumulative_score = float(score_rows[0] or 0.0)

        entity_type = PdaManagedEntityTypeEnum.USER if reg.user_id else PdaManagedEntityTypeEnum.TEAM
        entity_id = reg.user_id if reg.user_id else reg.team_id
        results.append(
            PdaManagedMyEvent(
                event=PdaManagedEventResponse.model_validate(event),
                entity_type=entity_type,
                entity_id=entity_id,
                is_registered=True,
                attendance_count=int(attendance_count),
                cumulative_score=float(cumulative_score),
            )
        )
    return results


@router.get("/pda/events/{slug}/me")
def event_me(
    slug: str,
    user: PdaUser = Depends(require_pda_user),
    db: Session = Depends(get_db),
):
    event = _get_event_or_404(db, slug)
    registration = db.query(PdaEventRegistration).filter(
        PdaEventRegistration.event_id == event.id,
        PdaEventRegistration.user_id == user.id,
        PdaEventRegistration.entity_type == PdaEventEntityType.USER,
    ).first()
    if not registration:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registration not found")
    return {
        "event_slug": event.slug,
        "event_code": event.event_code,
        "user_id": user.id,
        "regno": user.regno,
        "batch": _batch_from_regno(user.regno),
        "name": user.name,
        "email": user.email,
        "phone": user.phno,
        "gender": user.gender,
        "department": user.dept,
        "profile_picture": user.image_url,
        "status": registration.status.value if hasattr(registration.status, "value") else str(registration.status),
        "referral_code": registration.referral_code,
        "referred_by": registration.referred_by,
        "referral_count": int(registration.referral_count or 0),
    }


@router.get("/pda/events/{slug}/my-rounds")
def my_round_status(
    slug: str,
    user: PdaUser = Depends(require_pda_user),
    db: Session = Depends(get_db),
):
    event = _get_event_or_404(db, slug)
    registration = db.query(PdaEventRegistration).filter(
        PdaEventRegistration.event_id == event.id,
        PdaEventRegistration.user_id == user.id,
        PdaEventRegistration.entity_type == PdaEventEntityType.USER,
    ).first()
    if not registration:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registration not found")

    rounds = (
        db.query(PdaEventRound)
        .filter(PdaEventRound.event_id == event.id)
        .order_by(PdaEventRound.round_no.asc())
        .all()
    )
    statuses = []
    for round_row in rounds:
        score_row = db.query(PdaEventScore).filter(
            PdaEventScore.event_id == event.id,
            PdaEventScore.round_id == round_row.id,
            PdaEventScore.entity_type == PdaEventEntityType.USER,
            PdaEventScore.user_id == user.id,
        ).first()
        if registration.status == PdaEventRegistrationStatus.ELIMINATED:
            status_label = "Eliminated"
            is_present = bool(score_row.is_present) if score_row else None
        elif score_row:
            status_label = "Active" if bool(score_row.is_present) else "Absent"
            is_present = bool(score_row.is_present)
        else:
            status_label = "Pending"
            is_present = None
        statuses.append(
            {
                "round_no": f"PF{int(round_row.round_no):02d}",
                "round_name": round_row.name,
                "status": status_label,
                "is_present": is_present,
            }
        )
    return statuses


@router.get("/pda/me/achievements", response_model=List[PdaManagedAchievement])
def my_achievements(user: PdaUser = Depends(require_pda_user), db: Session = Depends(get_db)):
    team = db.query(PdaEventTeamMember).filter(PdaEventTeamMember.user_id == user.id).all()
    team_ids = [row.team_id for row in team]
    badge_query = db.query(PdaEventBadge, PdaEvent).join(PdaEvent, PdaEventBadge.event_id == PdaEvent.id)
    if team_ids:
        badge_query = badge_query.filter(or_(PdaEventBadge.user_id == user.id, PdaEventBadge.team_id.in_(team_ids)))
    else:
        badge_query = badge_query.filter(PdaEventBadge.user_id == user.id)
    badges = badge_query.order_by(PdaEventBadge.created_at.desc()).all()
    return [
        PdaManagedAchievement(
            event_slug=event.slug,
            event_title=event.title,
            badge_title=badge.title,
            badge_place=badge.place,
            image_url=badge.image_url,
            score=badge.score,
        )
        for badge, event in badges
    ]


@router.get("/pda/me/certificates/{event_slug}", response_model=PdaManagedCertificateResponse)
def get_certificate(
    event_slug: str,
    user: PdaUser = Depends(require_pda_user),
    db: Session = Depends(get_db),
):
    event = _get_event_or_404(db, event_slug)
    registration = db.query(PdaEventRegistration).filter(
        PdaEventRegistration.event_id == event.id,
        PdaEventRegistration.user_id == user.id,
    ).first()
    team = _get_user_team_for_event(db, event.id, user.id)
    if not registration and team:
        registration = db.query(PdaEventRegistration).filter(
            PdaEventRegistration.event_id == event.id,
            PdaEventRegistration.team_id == team.id,
        ).first()
    if not registration:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registration not found")

    attendance_query = db.query(PdaEventAttendance).filter(
        PdaEventAttendance.event_id == event.id,
        PdaEventAttendance.is_present == True  # noqa: E712
    )
    if registration.user_id:
        attendance_query = attendance_query.filter(PdaEventAttendance.user_id == registration.user_id)
    else:
        attendance_query = attendance_query.filter(PdaEventAttendance.team_id == registration.team_id)
    attended = attendance_query.first() is not None
    eligible = bool(event.status == PdaEventStatus.CLOSED and attended)
    text = None
    if eligible:
        text = f"This certifies that {user.name} actively participated in {event.title} ({event.event_code})."
    return PdaManagedCertificateResponse(
        event_slug=event.slug,
        event_title=event.title,
        eligible=eligible,
        certificate_text=text,
        generated_at=datetime.now(timezone.utc) if eligible else None,
    )
