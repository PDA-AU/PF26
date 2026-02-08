#!/usr/bin/env python3
import os
from datetime import datetime, timedelta, timezone

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from auth import get_password_hash
from models import (
    PdaUser,
    PdaEvent,
    PdaEventType,
    PdaEventFormat,
    PdaEventTemplate,
    PdaEventParticipantMode,
    PdaEventRoundMode,
    PdaEventStatus,
    PdaEventEntityType,
    PdaEventRegistration,
    PdaEventTeam,
    PdaEventTeamMember,
    PdaEventRound,
    PdaEventRoundState,
    PdaEventAttendance,
    PdaEventScore,
    PdaEventBadge,
    PdaEventBadgePlace,
)


def load_db_url() -> str:
    load_dotenv('backend/.env')
    db_url = os.environ.get('DATABASE_URL')
    if not db_url:
        raise RuntimeError('DATABASE_URL missing in backend/.env')
    return db_url


def make_session():
    engine = create_engine(load_db_url(), pool_pre_ping=True)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    return SessionLocal()


def ensure_user(db, regno: str, email: str, name: str) -> PdaUser:
    row = db.query(PdaUser).filter(PdaUser.regno == regno).first()
    if row:
        updated = False
        if not row.email:
            row.email = email
            updated = True
        if not row.name:
            row.name = name
            updated = True
        if not row.hashed_password:
            row.hashed_password = get_password_hash('pdaevent123')
            updated = True
        if updated:
            db.flush()
        return row

    row = PdaUser(
        regno=regno,
        email=email,
        hashed_password=get_password_hash('pdaevent123'),
        name=name,
        dob=datetime(2004, 1, 1).date(),
        gender='Male',
        phno='9876543210',
        dept='Information Technology',
        is_member=True,
        json_content={},
    )
    db.add(row)
    db.flush()
    return row


def ensure_event(
    db,
    *,
    slug: str,
    event_code: str,
    title: str,
    description: str,
    template: PdaEventTemplate,
    participant_mode: PdaEventParticipantMode,
    round_mode: PdaEventRoundMode,
    round_count: int,
    status: PdaEventStatus,
    team_min_size=None,
    team_max_size=None,
) -> PdaEvent:
    row = db.query(PdaEvent).filter(PdaEvent.slug == slug).first()
    if row:
        row.title = title
        row.description = description
        row.template_option = template
        row.participant_mode = participant_mode
        row.round_mode = round_mode
        row.round_count = round_count
        row.status = status
        row.team_min_size = team_min_size
        row.team_max_size = team_max_size
        db.flush()
        return row

    row = PdaEvent(
        slug=slug,
        event_code=event_code,
        club_id=1,
        title=title,
        description=description,
        poster_url=None,
        event_type=PdaEventType.EVENT,
        format=PdaEventFormat.OFFLINE,
        template_option=template,
        participant_mode=participant_mode,
        round_mode=round_mode,
        round_count=round_count,
        team_min_size=team_min_size,
        team_max_size=team_max_size,
        status=status,
    )
    db.add(row)
    db.flush()
    return row


def ensure_rounds(db, event: PdaEvent):
    for round_no in range(1, event.round_count + 1):
        round_row = (
            db.query(PdaEventRound)
            .filter(PdaEventRound.event_id == event.id, PdaEventRound.round_no == round_no)
            .first()
        )
        if round_row:
            continue
        db.add(
            PdaEventRound(
                event_id=event.id,
                round_no=round_no,
                name=f'Round {round_no}',
                description=f'Mock round {round_no}',
                date=datetime.now(timezone.utc) + timedelta(days=round_no),
                mode=PdaEventFormat.OFFLINE,
                state=PdaEventRoundState.ACTIVE if round_no == 1 else PdaEventRoundState.PUBLISHED,
                evaluation_criteria=[{'name': 'Score', 'max_marks': 100}],
            )
        )
    db.flush()


def ensure_registration(db, event_id: int, entity_type: PdaEventEntityType, user_id=None, team_id=None):
    row = (
        db.query(PdaEventRegistration)
        .filter(
            PdaEventRegistration.event_id == event_id,
            PdaEventRegistration.user_id == user_id,
            PdaEventRegistration.team_id == team_id,
        )
        .first()
    )
    if row:
        return row
    row = PdaEventRegistration(
        event_id=event_id,
        user_id=user_id,
        team_id=team_id,
        entity_type=entity_type,
    )
    db.add(row)
    db.flush()
    return row


def ensure_team(db, event_id: int, team_code: str, team_name: str, lead_user_id: int) -> PdaEventTeam:
    row = (
        db.query(PdaEventTeam)
        .filter(PdaEventTeam.event_id == event_id, PdaEventTeam.team_code == team_code)
        .first()
    )
    if row:
        row.team_name = team_name
        row.team_lead_user_id = lead_user_id
        db.flush()
        return row

    row = PdaEventTeam(
        event_id=event_id,
        team_code=team_code,
        team_name=team_name,
        team_lead_user_id=lead_user_id,
    )
    db.add(row)
    db.flush()
    return row


def ensure_team_member(db, team_id: int, user_id: int, role: str):
    existing = (
        db.query(PdaEventTeamMember)
        .filter(PdaEventTeamMember.team_id == team_id, PdaEventTeamMember.user_id == user_id)
        .first()
    )
    if existing:
        existing.role = role
        db.flush()
        return existing
    row = PdaEventTeamMember(team_id=team_id, user_id=user_id, role=role)
    db.add(row)
    db.flush()
    return row


def ensure_attendance(db, event_id: int, round_id: int, entity_type: PdaEventEntityType, user_id=None, team_id=None, present=True):
    row = (
        db.query(PdaEventAttendance)
        .filter(
            PdaEventAttendance.event_id == event_id,
            PdaEventAttendance.round_id == round_id,
            PdaEventAttendance.entity_type == entity_type,
            PdaEventAttendance.user_id == user_id,
            PdaEventAttendance.team_id == team_id,
        )
        .first()
    )
    if row:
        row.is_present = present
        db.flush()
        return row
    row = PdaEventAttendance(
        event_id=event_id,
        round_id=round_id,
        entity_type=entity_type,
        user_id=user_id,
        team_id=team_id,
        is_present=present,
    )
    db.add(row)
    db.flush()
    return row


def ensure_score(db, event_id: int, round_id: int, entity_type: PdaEventEntityType, score: float, user_id=None, team_id=None):
    row = (
        db.query(PdaEventScore)
        .filter(
            PdaEventScore.event_id == event_id,
            PdaEventScore.round_id == round_id,
            PdaEventScore.entity_type == entity_type,
            PdaEventScore.user_id == user_id,
            PdaEventScore.team_id == team_id,
        )
        .first()
    )
    payload = {'Score': float(score)}
    if row:
        row.criteria_scores = payload
        row.total_score = float(score)
        row.normalized_score = float(score)
        row.is_present = True
        db.flush()
        return row

    row = PdaEventScore(
        event_id=event_id,
        round_id=round_id,
        entity_type=entity_type,
        user_id=user_id,
        team_id=team_id,
        criteria_scores=payload,
        total_score=float(score),
        normalized_score=float(score),
        is_present=True,
    )
    db.add(row)
    db.flush()
    return row


def ensure_badge(db, event_id: int, title: str, place: PdaEventBadgePlace, score: float, user_id=None, team_id=None):
    row = (
        db.query(PdaEventBadge)
        .filter(
            PdaEventBadge.event_id == event_id,
            PdaEventBadge.title == title,
            PdaEventBadge.user_id == user_id,
            PdaEventBadge.team_id == team_id,
        )
        .first()
    )
    if row:
        row.place = place
        row.score = score
        db.flush()
        return row

    row = PdaEventBadge(
        event_id=event_id,
        title=title,
        image_url=None,
        place=place,
        score=score,
        user_id=user_id,
        team_id=team_id,
    )
    db.add(row)
    db.flush()
    return row


def main():
    db = make_session()
    try:
        users = [
            ensure_user(db, '9000001001', 'managed_mock_1@example.com', 'Managed Mock User 1'),
            ensure_user(db, '9000001002', 'managed_mock_2@example.com', 'Managed Mock User 2'),
            ensure_user(db, '9000001003', 'managed_mock_3@example.com', 'Managed Mock User 3'),
            ensure_user(db, '9000001004', 'managed_mock_4@example.com', 'Managed Mock User 4'),
            ensure_user(db, '9000001005', 'managed_mock_5@example.com', 'Managed Mock User 5'),
            ensure_user(db, '9000001006', 'managed_mock_6@example.com', 'Managed Mock User 6'),
        ]

        individual_event = ensure_event(
            db,
            slug='pda-mock-individual',
            event_code='EVT901',
            title='PDA Mock Individual Challenge',
            description='Mock individual event with attendance and scoring.',
            template=PdaEventTemplate.ATTENDANCE_SCORING,
            participant_mode=PdaEventParticipantMode.INDIVIDUAL,
            round_mode=PdaEventRoundMode.MULTI,
            round_count=2,
            status=PdaEventStatus.OPEN,
        )

        team_event = ensure_event(
            db,
            slug='pda-mock-team',
            event_code='EVT902',
            title='PDA Mock Team Arena',
            description='Mock team event with shared attendance and scoring.',
            template=PdaEventTemplate.ATTENDANCE_SCORING,
            participant_mode=PdaEventParticipantMode.TEAM,
            round_mode=PdaEventRoundMode.MULTI,
            round_count=2,
            status=PdaEventStatus.OPEN,
            team_min_size=2,
            team_max_size=4,
        )

        attendance_event = ensure_event(
            db,
            slug='pda-mock-attendance',
            event_code='EVT903',
            title='PDA Mock Attendance Session',
            description='Mock attendance-only event for certificate flow.',
            template=PdaEventTemplate.ATTENDANCE_ONLY,
            participant_mode=PdaEventParticipantMode.INDIVIDUAL,
            round_mode=PdaEventRoundMode.SINGLE,
            round_count=1,
            status=PdaEventStatus.CLOSED,
        )

        ensure_rounds(db, individual_event)
        ensure_rounds(db, team_event)
        ensure_rounds(db, attendance_event)

        ind_round_1 = (
            db.query(PdaEventRound)
            .filter(PdaEventRound.event_id == individual_event.id, PdaEventRound.round_no == 1)
            .first()
        )
        team_round_1 = (
            db.query(PdaEventRound)
            .filter(PdaEventRound.event_id == team_event.id, PdaEventRound.round_no == 1)
            .first()
        )
        attendance_round_1 = (
            db.query(PdaEventRound)
            .filter(PdaEventRound.event_id == attendance_event.id, PdaEventRound.round_no == 1)
            .first()
        )

        ensure_registration(db, individual_event.id, PdaEventEntityType.USER, user_id=users[0].id)
        ensure_registration(db, individual_event.id, PdaEventEntityType.USER, user_id=users[1].id)
        ensure_registration(db, individual_event.id, PdaEventEntityType.USER, user_id=users[2].id)

        ensure_attendance(db, individual_event.id, ind_round_1.id, PdaEventEntityType.USER, user_id=users[0].id, present=True)
        ensure_attendance(db, individual_event.id, ind_round_1.id, PdaEventEntityType.USER, user_id=users[1].id, present=True)
        ensure_attendance(db, individual_event.id, ind_round_1.id, PdaEventEntityType.USER, user_id=users[2].id, present=True)

        ensure_score(db, individual_event.id, ind_round_1.id, PdaEventEntityType.USER, 88, user_id=users[0].id)
        ensure_score(db, individual_event.id, ind_round_1.id, PdaEventEntityType.USER, 81, user_id=users[1].id)
        ensure_score(db, individual_event.id, ind_round_1.id, PdaEventEntityType.USER, 74, user_id=users[2].id)

        team_a = ensure_team(db, team_event.id, 'TM901', 'Mock Team Alpha', users[3].id)
        team_b = ensure_team(db, team_event.id, 'TM902', 'Mock Team Beta', users[5].id)

        ensure_team_member(db, team_a.id, users[3].id, 'leader')
        ensure_team_member(db, team_a.id, users[4].id, 'member')
        ensure_team_member(db, team_b.id, users[5].id, 'leader')

        ensure_registration(db, team_event.id, PdaEventEntityType.TEAM, team_id=team_a.id)
        ensure_registration(db, team_event.id, PdaEventEntityType.TEAM, team_id=team_b.id)

        ensure_attendance(db, team_event.id, team_round_1.id, PdaEventEntityType.TEAM, team_id=team_a.id, present=True)
        ensure_attendance(db, team_event.id, team_round_1.id, PdaEventEntityType.TEAM, team_id=team_b.id, present=True)

        ensure_score(db, team_event.id, team_round_1.id, PdaEventEntityType.TEAM, 92, team_id=team_a.id)
        ensure_score(db, team_event.id, team_round_1.id, PdaEventEntityType.TEAM, 79, team_id=team_b.id)

        ensure_registration(db, attendance_event.id, PdaEventEntityType.USER, user_id=users[0].id)
        ensure_attendance(db, attendance_event.id, attendance_round_1.id, PdaEventEntityType.USER, user_id=users[0].id, present=True)

        ensure_badge(
            db,
            individual_event.id,
            'Winner',
            PdaEventBadgePlace.WINNER,
            88,
            user_id=users[0].id,
        )
        ensure_badge(
            db,
            team_event.id,
            'Runner',
            PdaEventBadgePlace.RUNNER,
            79,
            team_id=team_b.id,
        )

        db.commit()

        print('Seeded/updated managed-event mock data:')
        print(f'  - users: {len(users)}')
        print(f'  - events: {[individual_event.slug, team_event.slug, attendance_event.slug]}')
        print('  - credentials for mock users: password=pdaevent123')
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == '__main__':
    main()
