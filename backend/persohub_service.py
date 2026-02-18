import re
import secrets
from typing import List, Optional, Set

from sqlalchemy import text
from sqlalchemy.orm import Session

from auth import get_password_hash
from models import (
    PdaTeam,
    PdaUser,
    PersohubClub,
    PersohubCommunity,
    PersohubCommunityFollow,
    PersohubPost,
)

PROFILE_RE = re.compile(r"[^a-z0-9_]+")
HASHTAG_RE = re.compile(r"(?<!\w)#([A-Za-z0-9_]{1,80})")

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
        club = PersohubClub(name="PDA", club_url="https://pda.mitindia.edu", club_logo_url=None)
        db.add(club)
        db.flush()

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
            hashed_password=get_password_hash(f"{item['profile_id']}@123"),
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
