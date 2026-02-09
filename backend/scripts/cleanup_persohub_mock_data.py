#!/usr/bin/env python3
"""Cleanup mock Persohub records and mock S3 objects.

Safety rules:
- Deletes only records tagged with MOCKPH_ marker or S3 URL containing /persohub/mock/.
- Leaves default seeded communities intact.
"""

from __future__ import annotations

import argparse
from typing import Dict, List
from pathlib import Path
import sys

from sqlalchemy import text

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from database import SessionLocal
from models import (
    PersohubClub,
    PersohubCommunity,
    PersohubCommunityFollow,
    PersohubHashtag,
    PersohubPost,
    PersohubPostAttachment,
    PersohubPostComment,
    PersohubPostHashtag,
    PersohubPostLike,
    PersohubPostMention,
)
from utils import S3_BUCKET_NAME, S3_CLIENT

MOCK_MARKER = "MOCKPH_"
MOCK_S3_PREFIX = "persohub/mock/"


def _fetch_ids(db, query: str, params: dict | None = None) -> List[int]:
    rows = db.execute(text(query), params or {}).fetchall()
    return [int(r[0]) for r in rows]


def cleanup_db(dry_run: bool) -> Dict[str, int]:
    db = SessionLocal()
    counts: Dict[str, int] = {
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

        if post_ids:
            counts["post_comments"] = db.query(PersohubPostComment).filter(PersohubPostComment.post_id.in_(post_ids)).delete(synchronize_session=False) or 0
            counts["post_likes"] = db.query(PersohubPostLike).filter(PersohubPostLike.post_id.in_(post_ids)).delete(synchronize_session=False) or 0
            counts["post_mentions"] = db.query(PersohubPostMention).filter(PersohubPostMention.post_id.in_(post_ids)).delete(synchronize_session=False) or 0
            counts["post_hashtags"] = db.query(PersohubPostHashtag).filter(PersohubPostHashtag.post_id.in_(post_ids)).delete(synchronize_session=False) or 0
            counts["post_attachments"] = db.query(PersohubPostAttachment).filter(PersohubPostAttachment.post_id.in_(post_ids)).delete(synchronize_session=False) or 0
            counts["posts"] = db.query(PersohubPost).filter(PersohubPost.id.in_(post_ids)).delete(synchronize_session=False) or 0

        if community_ids:
            counts["follows"] = db.query(PersohubCommunityFollow).filter(
                PersohubCommunityFollow.community_id.in_(community_ids)
            ).delete(synchronize_session=False) or 0
            counts["communities"] = db.query(PersohubCommunity).filter(
                PersohubCommunity.id.in_(community_ids)
            ).delete(synchronize_session=False) or 0

        if club_ids:
            counts["clubs"] = db.query(PersohubClub).filter(PersohubClub.id.in_(club_ids)).delete(synchronize_session=False) or 0

        counts["orphan_hashtags"] = db.query(PersohubHashtag).filter(
            PersohubHashtag.hashtag_text.ilike(f"{MOCK_MARKER.lower()}%"),
            ~PersohubHashtag.id.in_(
                db.query(PersohubPostHashtag.hashtag_id).distinct()
            )
        ).delete(synchronize_session=False) or 0

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
    args = parser.parse_args()

    counts = cleanup_db(dry_run=args.dry_run)
    s3_deleted = cleanup_s3(dry_run=args.dry_run)

    print("Persohub mock cleanup summary")
    for key, value in counts.items():
        print(f"- {key}: {value}")
    print(f"- s3_objects: {s3_deleted}")
    print(f"- mode: {'dry-run' if args.dry_run else 'apply'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
