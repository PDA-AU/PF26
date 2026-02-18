#!/usr/bin/env python3
"""Seed cleanup-safe Persohub mock data.

All records created by this script are cleanup-compatible:
- Names/descriptions use the `MOCKPH_` marker.
- Attachment URLs use the `persohub/mock/` key prefix.

Cleanup command:
    python backend/scripts/cleanup_persohub_mock_data.py
"""

from __future__ import annotations

import argparse
from datetime import datetime, timedelta, timezone
from pathlib import Path
import sys
from typing import Dict, List

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from auth import get_password_hash
from database import SessionLocal
from models import (
    PdaUser,
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
from persohub_service import (
    ensure_all_user_profile_names,
    extract_hashtags,
    generate_unique_post_slug,
    infer_attachment_kind,
)
from routers.persohub_shared import refresh_post_counts
from utils import S3_BUCKET_NAME

MOCK_MARKER = "MOCKPH_"
MOCK_S3_PREFIX = "persohub/mock/"


def _pick_users(db, limit: int) -> List[PdaUser]:
    return db.query(PdaUser).order_by(PdaUser.id.asc()).limit(max(1, limit)).all()


def _upsert_hashtags(db, post_id: int, description: str) -> int:
    total = 0
    for tag_text in extract_hashtags(description):
        tag = db.query(PersohubHashtag).filter(PersohubHashtag.hashtag_text == tag_text).first()
        if not tag:
            tag = PersohubHashtag(hashtag_text=tag_text, count=0)
            db.add(tag)
            db.flush()
        linked = db.query(PersohubPostHashtag).filter(
            PersohubPostHashtag.post_id == post_id,
            PersohubPostHashtag.hashtag_id == tag.id,
        ).first()
        if linked:
            continue
        db.add(PersohubPostHashtag(post_id=post_id, hashtag_id=tag.id))
        tag.count = int(tag.count or 0) + 1
        total += 1
    return total


def seed_mock_data(
    *,
    communities: int,
    posts_per_community: int,
    users_limit: int,
) -> Dict[str, int]:
    db = SessionLocal()
    counts = {
        "clubs": 0,
        "communities": 0,
        "follows": 0,
        "posts": 0,
        "attachments": 0,
        "likes": 0,
        "comments": 0,
        "hashtags_linked": 0,
        "mentions": 0,
    }
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    community_handles = ["designteam", "webteam", "pdaoffice", "events", "media", "ops"]
    file_mimes = ["image/jpeg", "video/mp4", "audio/mpeg", "application/pdf", "text/plain"]
    now_utc = datetime.now(timezone.utc)

    try:
        ensure_all_user_profile_names(db)
        users = _pick_users(db, users_limit)
        if not users:
            raise RuntimeError("No users found. Seed at least one user before seeding Persohub mock data.")

        club = PersohubClub(
            name=f"{MOCK_MARKER}Club_{stamp}",
            profile_id=f"mockph-club-{stamp[-8:]}",
            club_url="https://pda.mitindia.edu/mock",
            club_logo_url=f"https://placehold.co/400x400?text={MOCK_MARKER}CLUB",
        )
        db.add(club)
        db.flush()
        counts["clubs"] += 1

        created_posts: List[PersohubPost] = []

        for idx in range(communities):
            admin = users[idx % len(users)]
            handle_base = community_handles[idx % len(community_handles)]
            profile_id = f"mockph_{handle_base}_{stamp[-6:]}_{idx + 1}"
            community = PersohubCommunity(
                name=f"{MOCK_MARKER}Community_{handle_base}_{idx + 1}",
                profile_id=profile_id,
                club_id=club.id,
                admin_id=admin.id,
                hashed_password=get_password_hash(f"{profile_id}@123"),
                logo_url=f"https://placehold.co/300x300?text={profile_id}",
                description=f"{MOCK_MARKER}Generated community for Persohub testing",
                is_active=True,
            )
            db.add(community)
            db.flush()
            counts["communities"] += 1

            for follower in users:
                db.add(PersohubCommunityFollow(community_id=community.id, user_id=follower.id))
                counts["follows"] += 1

            for post_idx in range(posts_per_community):
                mention_target = users[(post_idx + idx + 1) % len(users)]
                hashtags = [
                    "mockph_seed",
                    f"mockph_c{idx + 1}",
                    f"mockph_post{post_idx + 1}",
                ]
                description = (
                    f"{MOCK_MARKER}post_{idx + 1}_{post_idx + 1} for @{community.profile_id} "
                    f"with @{mention_target.profile_name} "
                    + " ".join(f"#{tag}" for tag in hashtags)
                )
                post = PersohubPost(
                    community_id=community.id,
                    admin_id=admin.id,
                    slug_token=generate_unique_post_slug(db),
                    description=description,
                    created_at=now_utc - timedelta(hours=(idx * 2 + post_idx)),
                )
                db.add(post)
                db.flush()
                counts["posts"] += 1
                created_posts.append(post)

                mime = file_mimes[(idx + post_idx) % len(file_mimes)]
                ext = {
                    "image/jpeg": "jpg",
                    "video/mp4": "mp4",
                    "audio/mpeg": "mp3",
                    "application/pdf": "pdf",
                    "text/plain": "txt",
                }[mime]
                file_key = f"{MOCK_S3_PREFIX}{stamp}/{community.profile_id}/post_{post.id}.{ext}"
                s3_url = f"https://{S3_BUCKET_NAME or 'mock-bucket'}.s3.amazonaws.com/{file_key}"
                db.add(
                    PersohubPostAttachment(
                        post_id=post.id,
                        s3_url=s3_url,
                        mime_type=mime,
                        attachment_kind=infer_attachment_kind(mime, s3_url),
                        size_bytes=2048 + (post_idx * 256),
                        order_no=0,
                    )
                )
                counts["attachments"] += 1

                counts["hashtags_linked"] += _upsert_hashtags(db, post.id, description)

                db.add(PersohubPostMention(post_id=post.id, user_id=mention_target.id))
                counts["mentions"] += 1

                for liker in users[: min(3, len(users))]:
                    db.add(PersohubPostLike(post_id=post.id, user_id=liker.id))
                    counts["likes"] += 1

                commenter = users[(post_idx + idx + 2) % len(users)]
                db.add(
                    PersohubPostComment(
                        post_id=post.id,
                        user_id=commenter.id,
                        comment_text=f"{MOCK_MARKER}comment_{post.id}",
                    )
                )
                counts["comments"] += 1

        db.flush()
        for post in created_posts:
            refresh_post_counts(db, post.id)

        db.commit()
        return counts
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def main() -> int:
    parser = argparse.ArgumentParser(description="Seed Persohub cleanup-safe mock data")
    parser.add_argument("--communities", type=int, default=3, help="Number of mock communities to create")
    parser.add_argument("--posts-per-community", type=int, default=3, help="Posts per mock community")
    parser.add_argument("--users-limit", type=int, default=8, help="Max users reused for follows/likes/comments")
    args = parser.parse_args()

    counts = seed_mock_data(
        communities=max(1, min(50, args.communities)),
        posts_per_community=max(1, min(5000, args.posts_per_community)),
        users_limit=max(1, min(100, args.users_limit)),
    )
    print("Persohub mock seed summary")
    for key, value in counts.items():
        print(f"- {key}: {value}")
    print("Cleanup with: python backend/scripts/cleanup_persohub_mock_data.py")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
