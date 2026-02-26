import json
import re
import secrets
from typing import List, Optional, Set

from sqlalchemy import text
from sqlalchemy.orm import Session

from models import (
    PdaTeam,
    PdaUser,
    PersohubAdmin,
    PersohubClubAdmin,
    PersohubClub,
    PersohubCommunity,
    PersohubCommunityFollow,
    PersohubEvent,
    PersohubHashtag,
    PersohubPost,
    PersohubPostAttachment,
    PersohubPostHashtag,
    PersohubPostMention,
    PersohubSympo,
    PersohubSympoEvent,
)

PROFILE_RE = re.compile(r"[^a-z0-9_]+")
HASHTAG_RE = re.compile(r"(?<!\w)#([A-Za-z0-9_-]{1,80})")

DEFAULT_PERSOHUB_COMMUNITIES = [
    {"name": "PDA Design Team", "profile_id": "designteam", "team": "Design"},
    {"name": "PDA Web Team", "profile_id": "webteam", "team": "Website Design"},
    {"name": "PDA Office", "profile_id": "pdaoffice", "team": "Executive"},
]


def normalize_profile_name(raw: Optional[str]) -> str:
    base = (raw or "").strip().lower()
    base = base.replace(" ", "_")
    base = PROFILE_RE.sub("", base)
    base = re.sub(r"_+", "_", base).strip("_")
    if len(base) < 3:
        base = f"user_{base}" if base else "user"
    return base[:40]


def is_profile_name_valid(value: str) -> bool:
    return bool(re.fullmatch(r"[a-z0-9_]{3,40}", str(value or "")))


def generate_unique_profile_name(
    db: Session,
    base_name: Optional[str],
    *,
    exclude_user_id: Optional[int] = None,
) -> str:
    base = normalize_profile_name(base_name)
    for _ in range(200):
        suffix = f"{secrets.randbelow(100000):05d}"
        candidate = f"{base}_{suffix}"[:40]
        query = db.query(PdaUser).filter(PdaUser.profile_name == candidate)
        if exclude_user_id is not None:
            query = query.filter(PdaUser.id != exclude_user_id)
        if not query.first():
            community_conflict = db.query(PersohubCommunity).filter(PersohubCommunity.profile_id == candidate).first()
            if not community_conflict:
                return candidate
    # Last-resort, add random token.
    return f"{base[:30]}_{secrets.token_hex(4)}"[:40]


def ensure_user_profile_name(db: Session, user: PdaUser) -> str:
    if user.profile_name and is_profile_name_valid(user.profile_name):
        existing = (
            db.query(PdaUser)
            .filter(PdaUser.profile_name == user.profile_name, PdaUser.id != user.id)
            .first()
        )
        if not existing:
            return user.profile_name
    user.profile_name = generate_unique_profile_name(db, user.name, exclude_user_id=user.id)
    db.flush()
    return user.profile_name


def ensure_all_user_profile_names(db: Session) -> int:
    users = db.query(PdaUser).order_by(PdaUser.id.asc()).all()
    changed = 0
    for user in users:
        before = user.profile_name
        after = ensure_user_profile_name(db, user)
        if before != after:
            changed += 1
    db.commit()
    return changed


def extract_hashtags(text_value: Optional[str]) -> List[str]:
    if not text_value:
        return []
    seen: Set[str] = set()
    items: List[str] = []
    for token in HASHTAG_RE.findall(text_value):
        normalized = token.strip().lower()
        if normalized and normalized not in seen:
            seen.add(normalized)
            items.append(normalized)
    return items


def generate_unique_post_slug(db: Session) -> str:
    for _ in range(200):
        token = secrets.token_urlsafe(8).replace("-", "").replace("_", "")[:12].lower()
        if not db.query(PersohubPost).filter(PersohubPost.slug_token == token).first():
            return token
    return secrets.token_hex(8)


def infer_attachment_kind(mime_type: Optional[str], s3_url: Optional[str] = None) -> str:
    raw = (mime_type or "").lower()
    if raw.startswith("image/"):
        return "image"
    if raw.startswith("video/"):
        return "video"
    if raw.startswith("audio/"):
        return "audio"
    if raw == "application/pdf":
        return "pdf"
    if raw.startswith("text/"):
        return "text"

    url = (s3_url or "").lower()
    if url.endswith(".pdf"):
        return "pdf"
    if url.endswith((".png", ".jpg", ".jpeg", ".webp", ".gif")):
        return "image"
    if url.endswith((".mp4", ".webm", ".mov")):
        return "video"
    if url.endswith((".mp3", ".wav", ".ogg")):
        return "audio"
    if url.endswith((".txt", ".md", ".json")):
        return "text"
    return "file"


def _pick_admin_for_team(db: Session, team_name: str) -> Optional[PdaUser]:
    row = (
        db.query(PdaUser)
        .join(PdaTeam, PdaTeam.user_id == PdaUser.id)
        .filter(PdaTeam.team == team_name)
        .order_by(PdaTeam.designation.asc().nullslast(), PdaUser.id.asc())
        .first()
    )
    if row:
        return row
    return db.query(PdaUser).order_by(PdaUser.id.asc()).first()


def ensure_default_persohub_setup(db: Session) -> None:
    # Make sure user profile names exist before creating community profile ids.
    ensure_all_user_profile_names(db)

    club = db.query(PersohubClub).filter(PersohubClub.name == "PDA").first()
    if not club:
        club = PersohubClub(
            name="PDA",
            profile_id="pda",
            club_url="https://pda.mitindia.edu",
            club_logo_url=None,
            persohub_events_access_status="approved",
        )
        db.add(club)
        db.flush()
    else:
        if str(getattr(club, "profile_id", "") or "").strip().lower() == "pda-mit":
            club.persohub_events_access_status = "approved"

    # Reserve default community profile ids by reassigning conflicting user profile names.
    for item in DEFAULT_PERSOHUB_COMMUNITIES:
        conflict_user = db.query(PdaUser).filter(PdaUser.profile_name == item["profile_id"]).first()
        if conflict_user:
            conflict_user.profile_name = generate_unique_profile_name(
                db,
                conflict_user.name,
                exclude_user_id=conflict_user.id,
            )
    db.flush()

    for item in DEFAULT_PERSOHUB_COMMUNITIES:
        community = db.query(PersohubCommunity).filter(PersohubCommunity.profile_id == item["profile_id"]).first()
        if community:
            continue
        admin_user = _pick_admin_for_team(db, item["team"])
        if not admin_user:
            continue
        community = PersohubCommunity(
            name=item["name"],
            profile_id=item["profile_id"],
            club_id=club.id,
            admin_id=admin_user.id,
            logo_url=club.club_logo_url,
            description=f"Official {item['name']} community",
            is_active=True,
        )
        db.add(community)
        db.flush()

    db.commit()

    default_community_ids = [
        cid
        for (cid,) in db.query(PersohubCommunity.id)
        .filter(PersohubCommunity.profile_id.in_(["designteam", "webteam", "pdaoffice"]))
        .all()
    ]
    if not default_community_ids:
        return

    user_ids = [uid for (uid,) in db.query(PdaUser.id).all()]
    for user_id in user_ids:
        ensure_user_follows_default_communities(db, user_id, default_community_ids)
    db.commit()


def ensure_user_follows_default_communities(
    db: Session,
    user_id: int,
    default_community_ids: Optional[List[int]] = None,
) -> None:
    if default_community_ids is None:
        default_community_ids = [
            cid
            for (cid,) in db.query(PersohubCommunity.id)
            .filter(PersohubCommunity.profile_id.in_(["designteam", "webteam", "pdaoffice"]))
            .all()
        ]

    if not default_community_ids:
        return

    existing = {
        cid
        for (cid,) in db.query(PersohubCommunityFollow.community_id)
        .filter(
            PersohubCommunityFollow.user_id == user_id,
            PersohubCommunityFollow.community_id.in_(default_community_ids),
        )
        .all()
    }

    for cid in default_community_ids:
        if cid in existing:
            continue
        db.add(PersohubCommunityFollow(user_id=user_id, community_id=cid))


def slugify_hashtag(value: Optional[str]) -> str:
    raw = str(value or "").strip().lower()
    raw = re.sub(r"[^a-z0-9-]+", "-", raw).strip("-")
    raw = re.sub(r"-+", "-", raw)
    if len(raw) > 80:
        raw = raw[:80].rstrip("-")
    return raw


def _next_profile_id_from_club(club: PersohubClub) -> str:
    base = slugify_hashtag(club.profile_id or club.name or f"club-{club.id}")
    if not base:
        base = f"club-{int(club.id)}"
    if len(base) < 3:
        base = f"{base}-club"
    return base[:64]


def _resolve_default_community_admin_user_id(db: Session, club_id: int, owner_user_id: Optional[int]) -> Optional[int]:
    if owner_user_id:
        owner_exists = db.query(PdaUser).filter(PdaUser.id == int(owner_user_id)).first()
        if owner_exists:
            return int(owner_exists.id)

    superadmin_row = (
        db.query(PersohubClubAdmin.user_id)
        .filter(
            PersohubClubAdmin.club_id == int(club_id),
            PersohubClubAdmin.is_active == True,  # noqa: E712
        )
        .order_by(PersohubClubAdmin.id.asc())
        .first()
    )
    if superadmin_row and superadmin_row[0]:
        return int(superadmin_row[0])

    first_user = db.query(PdaUser.id).order_by(PdaUser.id.asc()).first()
    if first_user and first_user[0]:
        return int(first_user[0])
    return None


def ensure_primary_communities(db: Session) -> None:
    clubs = db.query(PersohubClub).order_by(PersohubClub.id.asc()).all()
    for club in clubs:
        club_id = int(club.id)
        communities = (
            db.query(PersohubCommunity)
            .filter(PersohubCommunity.club_id == club_id)
            .order_by(PersohubCommunity.id.asc())
            .all()
        )
        if not communities:
            admin_user_id = _resolve_default_community_admin_user_id(db, club_id, club.owner_user_id)
            if not admin_user_id:
                continue
            candidate = _next_profile_id_from_club(club)
            profile_id = candidate
            dedupe = 2
            while db.query(PersohubCommunity).filter(PersohubCommunity.profile_id == profile_id).first():
                suffix = f"-{dedupe}"
                profile_id = f"{candidate[:64 - len(suffix)]}{suffix}"
                dedupe += 1
            default_community = PersohubCommunity(
                name=f"{club.name} Community",
                profile_id=profile_id,
                club_id=club_id,
                admin_id=int(admin_user_id),
                logo_url=club.club_logo_url,
                description=f"Official community for {club.name}",
                is_active=True,
                is_root=True,
            )
            db.add(default_community)
            db.flush()
            communities = [default_community]
        root_rows = [row for row in communities if bool(getattr(row, "is_root", False))]
        if not root_rows:
            keep_id = int(communities[0].id)
            for row in communities:
                row.is_root = int(row.id) == keep_id
            continue
        if len(root_rows) > 1:
            keep_id = int(sorted(root_rows, key=lambda item: int(item.id))[0].id)
            for row in communities:
                row.is_root = int(row.id) == keep_id
    db.flush()


def _parse_event_poster_assets(poster_url: Optional[str]) -> List[dict]:
    raw = str(poster_url or "").strip()
    if not raw:
        return []
    if raw.startswith("["):
        try:
            parsed = json.loads(raw)
        except Exception:
            parsed = []
        assets = []
        if isinstance(parsed, list):
            for item in parsed:
                if not isinstance(item, dict):
                    continue
                url = str(item.get("url") or item.get("src") or "").strip()
                if not url:
                    continue
                assets.append(
                    {
                        "url": url,
                        "aspect_ratio": str(item.get("aspect_ratio") or item.get("ratio") or "").strip() or None,
                    }
                )
        return assets
    return [{"url": raw, "aspect_ratio": None}]


def _sync_post_hashtags_only(db: Session, post: PersohubPost) -> None:
    hashtag_values = set(extract_hashtags(post.description))

    existing_links = (
        db.query(PersohubPostHashtag, PersohubHashtag)
        .join(PersohubHashtag, PersohubPostHashtag.hashtag_id == PersohubHashtag.id)
        .filter(PersohubPostHashtag.post_id == post.id)
        .all()
    )
    existing = {tag.hashtag_text: (link, tag) for link, tag in existing_links}

    for hashtag_text, (link, tag) in existing.items():
        if hashtag_text in hashtag_values:
            continue
        db.delete(link)
        tag.count = max(0, int(tag.count or 0) - 1)

    for hashtag_text in sorted(hashtag_values):
        if hashtag_text in existing:
            continue
        tag = db.query(PersohubHashtag).filter(PersohubHashtag.hashtag_text == hashtag_text).first()
        if not tag:
            tag = PersohubHashtag(hashtag_text=hashtag_text, count=0)
            db.add(tag)
            db.flush()
        tag.count = int(tag.count or 0) + 1
        db.add(PersohubPostHashtag(post_id=post.id, hashtag_id=tag.id))


def _build_event_post_description(event: PersohubEvent, sympo_name: Optional[str]) -> str:
    event_tag = slugify_hashtag(event.title) or slugify_hashtag(event.slug)
    sympo_tag = slugify_hashtag(sympo_name) if sympo_name else ""
    tags = [item for item in [event_tag, sympo_tag] if item]
    base_description = str(event.description or "").strip()
    if not tags:
        return base_description
    tag_line = " ".join(f"#{tag}" for tag in tags)
    if not base_description:
        return tag_line
    return f"{base_description}\n\n{tag_line}"


def sync_persohub_event_posts(db: Session) -> None:
    events = db.query(PersohubEvent).order_by(PersohubEvent.id.asc()).all()
    sympo_map = {
        int(event_id): int(sympo_id)
        for sympo_id, event_id in (
            db.query(PersohubSympoEvent.sympo_id, PersohubSympoEvent.event_id).all()
        )
    }
    sympo_ids = sorted(set(sympo_map.values()))
    sympo_name_map = {}
    if sympo_ids:
        sympos = db.query(PersohubSympo).filter(PersohubSympo.id.in_(sympo_ids)).all()
        sympo_name_map = {int(sympo.id): str(sympo.name or "") for sympo in sympos}

    for event in events:
        club_id = int(event.club_id or 0)
        if club_id <= 0:
            continue
        primary_community = (
            db.query(PersohubCommunity)
            .filter(
                PersohubCommunity.club_id == club_id,
                PersohubCommunity.is_root == True,  # noqa: E712
                PersohubCommunity.is_active == True,  # noqa: E712
            )
            .order_by(PersohubCommunity.id.asc())
            .first()
        )
        if not primary_community:
            continue

        sympo_name = sympo_name_map.get(sympo_map.get(int(event.id)))
        description = _build_event_post_description(event, sympo_name)
        post = db.query(PersohubPost).filter(PersohubPost.source_event_id == int(event.id)).first()
        if not post:
            admin_user_id = int(primary_community.admin_id or 0)
            if admin_user_id <= 0:
                membership = (
                    db.query(PersohubAdmin.user_id)
                    .filter(
                        PersohubAdmin.community_id == int(primary_community.id),
                        PersohubAdmin.is_active == True,  # noqa: E712
                    )
                    .order_by(PersohubAdmin.id.asc())
                    .first()
                )
                admin_user_id = int(membership[0]) if membership and membership[0] else 0
            if admin_user_id <= 0:
                continue
            post = PersohubPost(
                community_id=int(primary_community.id),
                admin_id=admin_user_id,
                slug_token=generate_unique_post_slug(db),
                post_type="event",
                source_event_id=int(event.id),
                is_hidden=1 if bool(getattr(event, "is_visible", True)) else 0,
                description=description,
            )
            db.add(post)
            db.flush()
        else:
            post.community_id = int(primary_community.id)
            post.post_type = "event"
            post.source_event_id = int(event.id)
            post.is_hidden = 1 if bool(getattr(event, "is_visible", True)) else 0
            post.description = description

        poster_assets = _parse_event_poster_assets(event.poster_url)
        db.query(PersohubPostAttachment).filter(PersohubPostAttachment.post_id == int(post.id)).delete()
        for idx, asset in enumerate(poster_assets):
            asset_url = str(asset.get("url") or "").strip()
            if not asset_url:
                continue
            attachment_kind = infer_attachment_kind(None, asset_url)
            if attachment_kind != "image":
                continue
            db.add(
                PersohubPostAttachment(
                    post_id=int(post.id),
                    s3_url=asset_url,
                    preview_image_urls=[],
                    mime_type=None,
                    attachment_kind="image",
                    size_bytes=None,
                    order_no=idx,
                )
            )

        _sync_post_hashtags_only(db, post)
        db.query(PersohubPostMention).filter(PersohubPostMention.post_id == int(post.id)).delete()
    db.flush()


def phase_1_schema_check(db: Session) -> dict:
    checks = {}
    checks["users_profile_name_column"] = bool(
        db.execute(
            text(
                """
                SELECT 1
                FROM information_schema.columns
                WHERE table_name = 'users' AND column_name = 'profile_name'
                """
            )
        ).fetchone()
    )
    tables = [
        "persohub_clubs",
        "persohub_communities",
        "persohub_community_follows",
        "persohub_posts",
        "persohub_post_attachments",
        "persohub_post_likes",
        "persohub_post_comments",
        "persohub_hashtags",
        "persohub_post_hashtags",
        "persohub_post_mentions",
    ]
    for table in tables:
        checks[f"table_{table}"] = bool(
            db.execute(
                text(
                    """
                    SELECT 1
                    FROM information_schema.tables
                    WHERE table_name = :table
                    """
                ),
                {"table": table},
            ).fetchone()
        )
    checks["all_users_have_profile_name"] = (
        db.query(PdaUser).filter((PdaUser.profile_name.is_(None)) | (PdaUser.profile_name == "")).count() == 0
    )
    return checks
