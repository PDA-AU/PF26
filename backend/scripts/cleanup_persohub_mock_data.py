#!/usr/bin/env python3
"""Cleanup mock Persohub records and mock S3 objects.

Safety rules:
- Deletes only records tagged with MOCKPH_ marker or mock event/post prefixes.
- Leaves default seeded communities intact.
"""

from __future__ import annotations

import argparse
from pathlib import Path
import sys
from typing import Dict, List

from sqlalchemy import or_, text
from sqlalchemy.exc import IntegrityError

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from database import SessionLocal
from models import (
    PdaUser,
    PersohubClub,
    PersohubCommunity,
    PersohubCommunityFollow,
    PersohubEvent,
    PersohubEventAttendance,
    PersohubEventBadge,
    PersohubEventInvite,
    PersohubEventLog,
    PersohubEventRegistration,
    PersohubEventRound,
    PersohubEventRoundPanel,
    PersohubEventRoundPanelAssignment,
    PersohubEventRoundPanelMember,
    PersohubEventRoundSubmission,
    PersohubEventScore,
    PersohubEventTeam,
    PersohubEventTeamMember,
    PersohubHashtag,
    PersohubPost,
    PersohubPostAttachment,
    PersohubPostComment,
    PersohubPostHashtag,
    PersohubPostLike,
    PersohubPostMention,
    PersohubSympo,
    PersohubSympoEvent,
)
from utils import S3_BUCKET_NAME, S3_CLIENT

MOCK_MARKER = "MOCKPH_"
MOCK_S3_PREFIX = "persohub/mock/"


def _fetch_ids(db, query: str, params: dict | None = None) -> List[int]:
    rows = db.execute(text(query), params or {}).fetchall()
    return [int(r[0]) for r in rows]


def cleanup_db(dry_run: bool, include_users: bool) -> Dict[str, int]:
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
        "sympo_events": 0,
        "events": 0,
        "sympos": 0,
        "post_comments": 0,
        "post_likes": 0,
        "post_mentions": 0,
        "post_hashtags": 0,
        "post_attachments": 0,
        "posts": 0,
        "follows": 0,
        "communities": 0,
        "clubs": 0,
        "orphan_hashtags": 0,
        "users": 0,
    }

    try:
        post_ids = _fetch_ids(
            db,
            """
            SELECT DISTINCT p.id
            FROM persohub_posts p
            LEFT JOIN persohub_post_attachments a ON a.post_id = p.id
            WHERE COALESCE(p.description, '') LIKE :marker
               OR COALESCE(a.s3_url, '') LIKE :mock_s3
            """,
            {"marker": f"{MOCK_MARKER}%", "mock_s3": f"%{MOCK_S3_PREFIX}%"},
        )

        community_ids = _fetch_ids(
            db,
            """
            SELECT id
            FROM persohub_communities
            WHERE name LIKE :marker
               OR profile_id LIKE :marker_lower
            """,
            {"marker": f"{MOCK_MARKER}%", "marker_lower": f"{MOCK_MARKER.lower()}%"},
        )

        club_ids = _fetch_ids(
            db,
            """
            SELECT id
            FROM persohub_clubs
            WHERE name LIKE :marker
            """,
            {"marker": f"{MOCK_MARKER}%"},
        )

        event_ids = _fetch_ids(
            db,
            """
            SELECT id
            FROM persohub_events
            WHERE COALESCE(title, '') LIKE :marker
               OR COALESCE(description, '') LIKE :marker
               OR COALESCE(slug, '') LIKE :slug_marker
               OR COALESCE(event_code, '') LIKE :event_code_marker
            """,
            {
                "marker": f"{MOCK_MARKER}%",
                "slug_marker": "mockph-%",
                "event_code_marker": "MOCKPH%",
            },
        )
        if community_ids:
            event_ids.extend(
                int(row[0])
                for row in db.query(PersohubEvent.id).filter(PersohubEvent.community_id.in_(community_ids)).all()
            )
        event_ids = sorted(set(event_ids))

        sympo_ids = _fetch_ids(
            db,
            """
            SELECT id
            FROM persohub_sympos
            WHERE COALESCE(name, '') LIKE :marker
            """,
            {"marker": f"{MOCK_MARKER}%"},
        )

        user_ids: List[int] = []
        if include_users:
            user_ids = [
                int(row[0])
                for row in db.query(PdaUser.id).filter(
                    or_(
                        PdaUser.name.like(f"{MOCK_MARKER}%"),
                        PdaUser.email.like("mockph_user_%@example.local"),
                        PdaUser.profile_name.like("mockph_u_%"),
                    )
                ).all()
            ]

        if event_ids:
            team_ids = [
                int(row[0])
                for row in db.query(PersohubEventTeam.id).filter(PersohubEventTeam.event_id.in_(event_ids)).all()
            ]
            round_ids = [
                int(row[0])
                for row in db.query(PersohubEventRound.id).filter(PersohubEventRound.event_id.in_(event_ids)).all()
            ]

            counts["event_invites"] = db.query(PersohubEventInvite).filter(
                PersohubEventInvite.event_id.in_(event_ids)
            ).delete(synchronize_session=False) or 0
            counts["event_badges"] = db.query(PersohubEventBadge).filter(
                PersohubEventBadge.event_id.in_(event_ids)
            ).delete(synchronize_session=False) or 0
            counts["event_scores"] = db.query(PersohubEventScore).filter(
                PersohubEventScore.event_id.in_(event_ids)
            ).delete(synchronize_session=False) or 0
            counts["event_attendance"] = db.query(PersohubEventAttendance).filter(
                PersohubEventAttendance.event_id.in_(event_ids)
            ).delete(synchronize_session=False) or 0
            counts["event_round_submissions"] = db.query(PersohubEventRoundSubmission).filter(
                PersohubEventRoundSubmission.event_id.in_(event_ids)
            ).delete(synchronize_session=False) or 0
            counts["event_round_panel_assignments"] = db.query(PersohubEventRoundPanelAssignment).filter(
                PersohubEventRoundPanelAssignment.event_id.in_(event_ids)
            ).delete(synchronize_session=False) or 0
            counts["event_round_panel_members"] = db.query(PersohubEventRoundPanelMember).filter(
                PersohubEventRoundPanelMember.event_id.in_(event_ids)
            ).delete(synchronize_session=False) or 0
            counts["event_round_panels"] = db.query(PersohubEventRoundPanel).filter(
                PersohubEventRoundPanel.event_id.in_(event_ids)
            ).delete(synchronize_session=False) or 0
            counts["event_registrations"] = db.query(PersohubEventRegistration).filter(
                PersohubEventRegistration.event_id.in_(event_ids)
            ).delete(synchronize_session=False) or 0
            if team_ids:
                counts["event_team_members"] = db.query(PersohubEventTeamMember).filter(
                    PersohubEventTeamMember.team_id.in_(team_ids)
                ).delete(synchronize_session=False) or 0
            counts["event_teams"] = db.query(PersohubEventTeam).filter(
                PersohubEventTeam.event_id.in_(event_ids)
            ).delete(synchronize_session=False) or 0
            if round_ids:
                counts["event_rounds"] = db.query(PersohubEventRound).filter(
                    PersohubEventRound.id.in_(round_ids)
                ).delete(synchronize_session=False) or 0
            counts["event_logs"] = db.query(PersohubEventLog).filter(
                or_(
                    PersohubEventLog.event_id.in_(event_ids),
                    PersohubEventLog.event_slug.like("mockph-%"),
                )
            ).delete(synchronize_session=False) or 0
            counts["sympo_events"] = db.query(PersohubSympoEvent).filter(
                PersohubSympoEvent.event_id.in_(event_ids)
            ).delete(synchronize_session=False) or 0
            counts["events"] = db.query(PersohubEvent).filter(
                PersohubEvent.id.in_(event_ids)
            ).delete(synchronize_session=False) or 0

        if sympo_ids:
            counts["sympo_events"] += db.query(PersohubSympoEvent).filter(
                PersohubSympoEvent.sympo_id.in_(sympo_ids)
            ).delete(synchronize_session=False) or 0
            counts["sympos"] = db.query(PersohubSympo).filter(
                PersohubSympo.id.in_(sympo_ids)
            ).delete(synchronize_session=False) or 0

        if post_ids:
            counts["post_comments"] = db.query(PersohubPostComment).filter(
                PersohubPostComment.post_id.in_(post_ids)
            ).delete(synchronize_session=False) or 0
            counts["post_likes"] = db.query(PersohubPostLike).filter(
                PersohubPostLike.post_id.in_(post_ids)
            ).delete(synchronize_session=False) or 0
            counts["post_mentions"] = db.query(PersohubPostMention).filter(
                PersohubPostMention.post_id.in_(post_ids)
            ).delete(synchronize_session=False) or 0
            counts["post_hashtags"] = db.query(PersohubPostHashtag).filter(
                PersohubPostHashtag.post_id.in_(post_ids)
            ).delete(synchronize_session=False) or 0
            counts["post_attachments"] = db.query(PersohubPostAttachment).filter(
                PersohubPostAttachment.post_id.in_(post_ids)
            ).delete(synchronize_session=False) or 0
            counts["posts"] = db.query(PersohubPost).filter(
                PersohubPost.id.in_(post_ids)
            ).delete(synchronize_session=False) or 0

        if community_ids:
            counts["follows"] = db.query(PersohubCommunityFollow).filter(
                PersohubCommunityFollow.community_id.in_(community_ids)
            ).delete(synchronize_session=False) or 0
            counts["communities"] = db.query(PersohubCommunity).filter(
                PersohubCommunity.id.in_(community_ids)
            ).delete(synchronize_session=False) or 0

        if club_ids:
            counts["clubs"] = db.query(PersohubClub).filter(
                PersohubClub.id.in_(club_ids)
            ).delete(synchronize_session=False) or 0

        counts["orphan_hashtags"] = db.query(PersohubHashtag).filter(
            PersohubHashtag.hashtag_text.ilike(f"{MOCK_MARKER.lower()}%"),
            ~PersohubHashtag.id.in_(
                db.query(PersohubPostHashtag.hashtag_id).distinct()
            ),
        ).delete(synchronize_session=False) or 0

        if user_ids:
            deleted_users = 0
            for user_id in user_ids:
                try:
                    with db.begin_nested():
                        deleted_users += db.query(PdaUser).filter(PdaUser.id == user_id).delete(synchronize_session=False) or 0
                except IntegrityError:
                    continue
            counts["users"] = deleted_users

        if dry_run:
            db.rollback()
        else:
            db.commit()
        return counts
    finally:
        db.close()


def cleanup_s3(dry_run: bool) -> int:
    if not S3_CLIENT or not S3_BUCKET_NAME:
        return 0

    deleted = 0
    continuation = None
    while True:
        kwargs = {"Bucket": S3_BUCKET_NAME, "Prefix": MOCK_S3_PREFIX}
        if continuation:
            kwargs["ContinuationToken"] = continuation
        response = S3_CLIENT.list_objects_v2(**kwargs)
        items = response.get("Contents") or []
        if not items:
            break

        keys = [{"Key": item["Key"]} for item in items]
        deleted += len(keys)
        if not dry_run:
            S3_CLIENT.delete_objects(Bucket=S3_BUCKET_NAME, Delete={"Objects": keys})

        if response.get("IsTruncated"):
            continuation = response.get("NextContinuationToken")
        else:
            break

    return deleted


def main() -> int:
    parser = argparse.ArgumentParser(description="Cleanup Persohub MOCKPH_ data")
    parser.add_argument("--dry-run", action="store_true", help="Print potential deletions without committing")
    parser.add_argument(
        "--include-users",
        action="store_true",
        help="Also delete MOCKPH users created by seed script",
    )
    args = parser.parse_args()

    counts = cleanup_db(dry_run=args.dry_run, include_users=args.include_users)
    s3_deleted = cleanup_s3(dry_run=args.dry_run)

    print("Persohub mock cleanup summary")
    for key, value in counts.items():
        print(f"- {key}: {value}")
    print(f"- s3_objects: {s3_deleted}")
    print(f"- include_users: {bool(args.include_users)}")
    print(f"- mode: {'dry-run' if args.dry_run else 'apply'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
