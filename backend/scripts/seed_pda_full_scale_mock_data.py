#!/usr/bin/env python3
"""Seed cleanup-safe full-scale PDA mock data."""

from __future__ import annotations

import argparse
import random
from datetime import datetime, timedelta, timezone
from pathlib import Path
import sys
from typing import Dict, List

from sqlalchemy import or_

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from auth import get_password_hash
from database import SessionLocal
from models import (
    PdaEvent,
    PdaEventAttendance,
    PdaEventBadge,
    PdaEventBadgePlace,
    PdaEventEntityType,
    PdaEventFormat,
    PdaEventParticipantMode,
    PdaEventRegistration,
    PdaEventRound,
    PdaEventRoundMode,
    PdaEventRoundState,
    PdaEventRoundSubmission,
    PdaEventScore,
    PdaEventStatus,
    PdaEventTeam,
    PdaEventTeamMember,
    PdaEventTemplate,
    PdaEventType,
    PdaUser,
)

MOCK_MARKER = "MOCKPDA_"
MOCK_EMAIL_DOMAIN = "example.local"


def _create_mock_users(db, *, count: int, stamp: str) -> List[PdaUser]:
    created: List[PdaUser] = []
    if count <= 0:
        return created

    next_idx = 1
    while len(created) < count:
        regno = f"8{stamp[-7:]}{next_idx:04d}"
        email = f"mockpda_user_{stamp}_{next_idx}@{MOCK_EMAIL_DOMAIN}"
        profile_name = f"mockpda_u_{stamp[-8:]}_{next_idx}"
        existing = db.query(PdaUser).filter(
            or_(
                PdaUser.regno == regno,
                PdaUser.email == email,
                PdaUser.profile_name == profile_name,
            )
        ).first()
        if existing:
            next_idx += 1
            continue
        row = PdaUser(
            regno=regno,
            email=email,
            hashed_password=get_password_hash("password"),
            name=f"{MOCK_MARKER}User_{next_idx}",
            profile_name=profile_name,
            dept="Information Technology",
            phno=f"9{stamp[-7:]}{next_idx:03d}"[-10:],
            is_member=True,
            json_content={"marker": MOCK_MARKER, "stamp": stamp},
        )
        db.add(row)
        created.append(row)
        next_idx += 1
    db.flush()
    return created


def _build_round_criteria() -> list[dict]:
    return [
        {"name": "Presentation", "max_marks": 40},
        {"name": "Content", "max_marks": 35},
        {"name": "Execution", "max_marks": 25},
    ]


def seed_mock_data(
    *,
    users: int,
    events: int,
    participants_per_event: int,
    teams_per_event: int,
    rounds_per_event: int,
    seed: int,
) -> Dict[str, int]:
    rng = random.Random(seed)
    now_utc = datetime.now(timezone.utc)
    stamp = now_utc.strftime("%Y%m%d%H%M%S%f")

    counts = {
        "users": 0,
        "events": 0,
        "rounds": 0,
        "registrations": 0,
        "teams": 0,
        "team_members": 0,
        "attendance": 0,
        "scores": 0,
        "submissions": 0,
        "badges": 0,
    }

    db = SessionLocal()
    try:
        user_rows = _create_mock_users(db, count=max(1, users), stamp=stamp)
        counts["users"] = len(user_rows)
        if not user_rows:
            raise RuntimeError("Unable to create mock users.")

        event_types = [PdaEventType.TECHNICAL, PdaEventType.NONTECHINICAL, PdaEventType.WORKSHOP, PdaEventType.HACKATHON]
        formats = [PdaEventFormat.OFFLINE, PdaEventFormat.ONLINE, PdaEventFormat.HYBRID]

        for event_idx in range(max(1, events)):
            is_team_event = (event_idx % 2) == 1
            round_count = max(1, rounds_per_event)
            participant_mode = PdaEventParticipantMode.TEAM if is_team_event else PdaEventParticipantMode.INDIVIDUAL
            event = PdaEvent(
                slug=f"mockpda-{stamp[-8:]}-{event_idx + 1}",
                event_code=f"MOCKPDA{stamp[-6:]}{event_idx + 1:02d}"[:20],
                club_id=1,
                title=f"{MOCK_MARKER}Event_{event_idx + 1}",
                description=f"{MOCK_MARKER}Generated full-scale PDA event",
                event_type=event_types[event_idx % len(event_types)],
                format=formats[event_idx % len(formats)],
                template_option=PdaEventTemplate.ATTENDANCE_SCORING,
                participant_mode=participant_mode,
                round_mode=(PdaEventRoundMode.MULTI if round_count > 1 else PdaEventRoundMode.SINGLE),
                round_count=round_count,
                team_min_size=(2 if is_team_event else None),
                team_max_size=(5 if is_team_event else None),
                status=PdaEventStatus.OPEN,
                registration_open=True,
                is_visible=True,
            )
            db.add(event)
            db.flush()
            counts["events"] += 1

            rounds: List[PdaEventRound] = []
            for round_idx in range(round_count):
                round_row = PdaEventRound(
                    event_id=event.id,
                    round_no=round_idx + 1,
                    name=f"{MOCK_MARKER}Round_{round_idx + 1}",
                    description=f"{MOCK_MARKER}Round instructions",
                    date=now_utc + timedelta(days=round_idx + 1),
                    mode=event.format,
                    state=PdaEventRoundState.ACTIVE if round_idx == 0 else PdaEventRoundState.PUBLISHED,
                    evaluation_criteria=_build_round_criteria(),
                    requires_submission=(round_idx == 0),
                    submission_mode="file_or_link",
                    submission_deadline=now_utc + timedelta(days=round_idx + 2),
                    max_file_size_mb=25,
                )
                db.add(round_row)
                db.flush()
                counts["rounds"] += 1
                rounds.append(round_row)

            first_round = rounds[0]
            if is_team_event:
                shuffled = user_rows[:]
                rng.shuffle(shuffled)
                member_cursor = 0
                teams_to_create = min(max(1, teams_per_event), max(1, len(shuffled) // 2))
                created_teams: List[PdaEventTeam] = []
                for team_idx in range(teams_to_create):
                    team_size = rng.randint(2, min(5, max(2, len(shuffled) - member_cursor)))
                    members = shuffled[member_cursor : member_cursor + team_size]
                    if len(members) < 2:
                        break
                    member_cursor += team_size
                    team = PdaEventTeam(
                        event_id=event.id,
                        team_code=f"T{team_idx + 1:04d}"[:5],
                        team_name=f"{MOCK_MARKER}Team_{event_idx + 1}_{team_idx + 1}",
                        team_lead_user_id=members[0].id,
                    )
                    db.add(team)
                    db.flush()
                    counts["teams"] += 1
                    created_teams.append(team)

                    for idx, member in enumerate(members):
                        db.add(
                            PdaEventTeamMember(
                                team_id=team.id,
                                user_id=member.id,
                                role=("leader" if idx == 0 else "member"),
                            )
                        )
                        counts["team_members"] += 1

                    db.add(
                        PdaEventRegistration(
                            event_id=event.id,
                            team_id=team.id,
                            entity_type=PdaEventEntityType.TEAM,
                        )
                    )
                    counts["registrations"] += 1

                    present = rng.random() > 0.08
                    db.add(
                        PdaEventAttendance(
                            event_id=event.id,
                            round_id=first_round.id,
                            entity_type=PdaEventEntityType.TEAM,
                            team_id=team.id,
                            is_present=present,
                        )
                    )
                    counts["attendance"] += 1

                    if present:
                        crit = {
                            "Presentation": float(rng.randint(15, 40)),
                            "Content": float(rng.randint(12, 35)),
                            "Execution": float(rng.randint(8, 25)),
                        }
                        total = float(sum(crit.values()))
                        db.add(
                            PdaEventScore(
                                event_id=event.id,
                                round_id=first_round.id,
                                entity_type=PdaEventEntityType.TEAM,
                                team_id=team.id,
                                is_present=True,
                                criteria_scores=crit,
                                total_score=total,
                                normalized_score=total,
                            )
                        )
                        counts["scores"] += 1
                        db.add(
                            PdaEventRoundSubmission(
                                event_id=event.id,
                                round_id=first_round.id,
                                entity_type=PdaEventEntityType.TEAM,
                                team_id=team.id,
                                submission_type="link",
                                link_url=f"https://example.local/mockpda/{event.slug}/team/{team.id}",
                                notes=f"{MOCK_MARKER}Submission by team {team.team_name}",
                            )
                        )
                        counts["submissions"] += 1

                if created_teams:
                    db.add(
                        PdaEventBadge(
                            event_id=event.id,
                            title="Winner",
                            place=PdaEventBadgePlace.WINNER,
                            team_id=created_teams[0].id,
                            score=95.0,
                        )
                    )
                    counts["badges"] += 1
            else:
                take_n = min(max(1, participants_per_event), len(user_rows))
                selected = user_rows[:]
                rng.shuffle(selected)
                selected = selected[:take_n]
                for user in selected:
                    db.add(
                        PdaEventRegistration(
                            event_id=event.id,
                            user_id=user.id,
                            entity_type=PdaEventEntityType.USER,
                        )
                    )
                    counts["registrations"] += 1
                    present = rng.random() > 0.05
                    db.add(
                        PdaEventAttendance(
                            event_id=event.id,
                            round_id=first_round.id,
                            entity_type=PdaEventEntityType.USER,
                            user_id=user.id,
                            is_present=present,
                        )
                    )
                    counts["attendance"] += 1

                    if present:
                        crit = {
                            "Presentation": float(rng.randint(15, 40)),
                            "Content": float(rng.randint(12, 35)),
                            "Execution": float(rng.randint(8, 25)),
                        }
                        total = float(sum(crit.values()))
                        db.add(
                            PdaEventScore(
                                event_id=event.id,
                                round_id=first_round.id,
                                entity_type=PdaEventEntityType.USER,
                                user_id=user.id,
                                is_present=True,
                                criteria_scores=crit,
                                total_score=total,
                                normalized_score=total,
                            )
                        )
                        counts["scores"] += 1
                        db.add(
                            PdaEventRoundSubmission(
                                event_id=event.id,
                                round_id=first_round.id,
                                entity_type=PdaEventEntityType.USER,
                                user_id=user.id,
                                submission_type="link",
                                link_url=f"https://example.local/mockpda/{event.slug}/user/{user.id}",
                                notes=f"{MOCK_MARKER}Submission by {user.name}",
                            )
                        )
                        counts["submissions"] += 1

                if selected:
                    db.add(
                        PdaEventBadge(
                            event_id=event.id,
                            title="Winner",
                            place=PdaEventBadgePlace.WINNER,
                            user_id=selected[0].id,
                            score=96.0,
                        )
                    )
                    counts["badges"] += 1

        db.commit()
        return counts
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def main() -> int:
    parser = argparse.ArgumentParser(description="Seed cleanup-safe PDA full-scale mock data")
    parser.add_argument("--users", type=int, default=120, help="Mock users to create (>=100 recommended)")
    parser.add_argument("--events", type=int, default=12, help="Mock PDA events to create")
    parser.add_argument("--participants-per-event", type=int, default=36, help="Max individual participants per event")
    parser.add_argument("--teams-per-event", type=int, default=12, help="Max teams per team event")
    parser.add_argument("--rounds-per-event", type=int, default=3, help="Rounds per event")
    parser.add_argument("--seed", type=int, default=26, help="Random seed for repeatable distribution")
    args = parser.parse_args()

    counts = seed_mock_data(
        users=max(1, min(500, args.users)),
        events=max(1, min(100, args.events)),
        participants_per_event=max(1, min(300, args.participants_per_event)),
        teams_per_event=max(1, min(100, args.teams_per_event)),
        rounds_per_event=max(1, min(10, args.rounds_per_event)),
        seed=args.seed,
    )
    print("PDA full-scale mock seed summary")
    for key, value in counts.items():
        print(f"- {key}: {value}")
    print("- mock user password: password")
    print("Cleanup with: python backend/scripts/cleanup_pda_full_scale_mock_data.py --include-users")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
