#!/usr/bin/env python3
"""Cleanup PDA full-scale mock data created by seed_pda_full_scale_mock_data.py."""

from __future__ import annotations

import argparse
from pathlib import Path
import sys
from typing import Dict, List

from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from database import SessionLocal
from models import (
    PdaEvent,
    PdaEventAttendance,
    PdaEventBadge,
    PdaEventInvite,
    PdaEventLog,
    PdaEventRegistration,
    PdaEventRound,
    PdaEventRoundPanel,
    PdaEventRoundPanelAssignment,
    PdaEventRoundPanelMember,
    PdaEventRoundSubmission,
    PdaEventScore,
    PdaEventTeam,
    PdaEventTeamMember,
    PdaUser,
)

MOCK_MARKER = "MOCKPDA_"


def cleanup_db(*, dry_run: bool, include_users: bool) -> Dict[str, int]:
    db = SessionLocal()
    counts: Dict[str, int] = {
        "event_invites": 0,
        "event_badges": 0,
        "event_scores": 0,
        "event_attendance": 0,
        "event_round_submissions": 0,
        "event_round_panel_assignments": 0,
        "event_round_panel_members": 0,
        "event_round_panels": 0,
        "event_registrations": 0,
        "event_team_members": 0,
        "event_teams": 0,
        "event_rounds": 0,
        "event_logs": 0,
        "events": 0,
        "users": 0,
    }
    try:
        event_ids = [
            int(row[0])
            for row in db.query(PdaEvent.id).filter(
                or_(
                    PdaEvent.slug.like("mockpda-%"),
                    PdaEvent.event_code.like("MOCKPDA%"),
                    PdaEvent.title.like(f"{MOCK_MARKER}%"),
                    PdaEvent.description.like(f"{MOCK_MARKER}%"),
                )
            ).all()
        ]
        if event_ids:
            team_ids = [int(row[0]) for row in db.query(PdaEventTeam.id).filter(PdaEventTeam.event_id.in_(event_ids)).all()]
            round_ids = [int(row[0]) for row in db.query(PdaEventRound.id).filter(PdaEventRound.event_id.in_(event_ids)).all()]

            counts["event_invites"] = db.query(PdaEventInvite).filter(PdaEventInvite.event_id.in_(event_ids)).delete(
                synchronize_session=False
            ) or 0
            counts["event_badges"] = db.query(PdaEventBadge).filter(PdaEventBadge.event_id.in_(event_ids)).delete(
                synchronize_session=False
            ) or 0
            counts["event_scores"] = db.query(PdaEventScore).filter(PdaEventScore.event_id.in_(event_ids)).delete(
                synchronize_session=False
            ) or 0
            counts["event_attendance"] = db.query(PdaEventAttendance).filter(
                PdaEventAttendance.event_id.in_(event_ids)
            ).delete(synchronize_session=False) or 0
            counts["event_round_submissions"] = db.query(PdaEventRoundSubmission).filter(
                PdaEventRoundSubmission.event_id.in_(event_ids)
            ).delete(synchronize_session=False) or 0
            counts["event_round_panel_assignments"] = db.query(PdaEventRoundPanelAssignment).filter(
                PdaEventRoundPanelAssignment.event_id.in_(event_ids)
            ).delete(synchronize_session=False) or 0
            counts["event_round_panel_members"] = db.query(PdaEventRoundPanelMember).filter(
                PdaEventRoundPanelMember.event_id.in_(event_ids)
            ).delete(synchronize_session=False) or 0
            counts["event_round_panels"] = db.query(PdaEventRoundPanel).filter(
                PdaEventRoundPanel.event_id.in_(event_ids)
            ).delete(synchronize_session=False) or 0
            counts["event_registrations"] = db.query(PdaEventRegistration).filter(
                PdaEventRegistration.event_id.in_(event_ids)
            ).delete(synchronize_session=False) or 0
            if team_ids:
                counts["event_team_members"] = db.query(PdaEventTeamMember).filter(
                    PdaEventTeamMember.team_id.in_(team_ids)
                ).delete(synchronize_session=False) or 0
            counts["event_teams"] = db.query(PdaEventTeam).filter(PdaEventTeam.event_id.in_(event_ids)).delete(
                synchronize_session=False
            ) or 0
            if round_ids:
                counts["event_rounds"] = db.query(PdaEventRound).filter(PdaEventRound.id.in_(round_ids)).delete(
                    synchronize_session=False
                ) or 0
            counts["event_logs"] = db.query(PdaEventLog).filter(
                or_(PdaEventLog.event_id.in_(event_ids), PdaEventLog.event_slug.like("mockpda-%"))
            ).delete(synchronize_session=False) or 0
            counts["events"] = db.query(PdaEvent).filter(PdaEvent.id.in_(event_ids)).delete(synchronize_session=False) or 0

        if include_users:
            user_ids = [
                int(row[0])
                for row in db.query(PdaUser.id).filter(
                    or_(
                        PdaUser.name.like(f"{MOCK_MARKER}%"),
                        PdaUser.email.like("mockpda_user_%@example.local"),
                        PdaUser.profile_name.like("mockpda_u_%"),
                    )
                ).all()
            ]
            if user_ids:
                deleted_users = 0
                for user_id in user_ids:
                    try:
                        with db.begin_nested():
                            deleted_users += db.query(PdaUser).filter(PdaUser.id == user_id).delete(
                                synchronize_session=False
                            ) or 0
                    except IntegrityError:
                        continue
                counts["users"] = deleted_users

        if dry_run:
            db.rollback()
        else:
            db.commit()
        return counts
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def main() -> int:
    parser = argparse.ArgumentParser(description="Cleanup PDA MOCKPDA data")
    parser.add_argument("--dry-run", action="store_true", help="Report counts only; do not delete")
    parser.add_argument("--include-users", action="store_true", help="Also remove mock users created by seed script")
    args = parser.parse_args()

    counts = cleanup_db(dry_run=args.dry_run, include_users=args.include_users)
    print("PDA mock cleanup summary")
    for key, value in counts.items():
        print(f"- {key}: {value}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
