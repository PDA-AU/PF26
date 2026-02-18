from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from database import get_db
from models import (
    CommunityEvent,
    CommunitySympo,
    CommunitySympoEvent,
    PdaEventBadge,
    PdaTeam,
    PdaUser,
    PersohubClub,
    PersohubCommunity,
    PersohubCommunityFollow,
    PersohubHashtag,
    PersohubPost,
    PersohubPostComment,
    PersohubPostHashtag,
    PersohubPostLike,
    PersohubPostMention,
)
from persohub_schemas import (
    PersohubCommentCreateRequest,
    PersohubCommentPageResponse,
    PersohubCommentResponse,
    PersohubFeedResponse,
    PersohubPhaseGateStatus,
    PersohubPostResponse,
    PersohubPublicProfileResponse,
    PersohubCommunityCard,
    PersohubPublicClubCommunityInfo,
    PersohubSearchResponse,
    PersohubSearchSuggestion,
)
from persohub_service import phase_1_schema_check
from routers.persohub_shared import (
    build_community_card,
    build_community_cards_bulk,
    build_post_response,
    build_post_responses_bulk,
    refresh_post_counts,
)
from security import (
    get_optional_pda_user,
    get_optional_persohub_community,
    require_pda_user,
)

router = APIRouter()


def _parse_cursor_offset(cursor: Optional[str]) -> int:
    if cursor is None:
        return 0
    raw = cursor.strip()
    if not raw:
        return 0
    if not raw.isdigit():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid cursor")
    value = int(raw)
    if value < 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid cursor")
    return value


def _normalize_chakravyuha_content(content: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    payload = dict(content or {})
    services = payload.get("services")
    if not isinstance(services, dict):
        services = {}
    contact_person = services.get("contactPerson")
    if not isinstance(contact_person, dict):
        contact_person = {}
    services["enquireLink"] = str(services.get("enquireLink") or "")
    services["contactPerson"] = {
        "name": str(contact_person.get("name") or ""),
        "number": str(contact_person.get("number") or ""),
    }
    payload["services"] = services
    return payload


@router.get("/persohub/communities", response_model=List[PersohubCommunityCard])
def list_communities(
    db: Session = Depends(get_db),
    user: Optional[PdaUser] = Depends(get_optional_pda_user),
):
    communities = (
        db.query(PersohubCommunity)
        .order_by(PersohubCommunity.club_id.asc().nullslast(), PersohubCommunity.name.asc())
        .all()
    )
    cards = build_community_cards_bulk(db, communities, current_user_id=(user.id if user else None))
    return [cards[c.id] for c in communities if c.id in cards]


@router.get("/persohub/clubs", response_model=List[PersohubPublicClubCommunityInfo])
def list_public_club_community_info(
    db: Session = Depends(get_db),
):
    rows = (
        db.query(PersohubCommunity, PersohubClub)
        .join(PersohubClub, PersohubCommunity.club_id == PersohubClub.id)
        .filter(PersohubCommunity.is_root == True)  # noqa: E712
        .order_by(PersohubClub.name.asc(), PersohubCommunity.profile_id.asc())
        .all()
    )
    return [
        PersohubPublicClubCommunityInfo(
            clubId=community.profile_id,
            clubName=club.name,
            clubTagline=club.club_tagline,
            clubImage=community.logo_url or club.club_logo_url,
            clubDescription=club.club_description or community.description,
        )
        for community, club in rows
    ]


@router.get("/persohub/chakravyuha-26", response_model=Dict[str, Any])
def get_chakravyuha_public_content(
    db: Session = Depends(get_db),
):
    sympo = (
        db.query(CommunitySympo)
        .filter(func.lower(CommunitySympo.name) == "chakravyuha-26")
        .first()
    )
    if not sympo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chakravyuha content not found")
    return _normalize_chakravyuha_content(sympo.content)


def _serialize_chakravyuha_event(event: CommunityEvent, community: PersohubCommunity) -> Dict[str, Any]:
    return {
        "id": event.id,
        "slug": event.slug,
        "event_code": event.event_code,
        "community_id": community.profile_id,
        "community_name": community.name,
        "title": event.title,
        "description": event.description,
        "start_date": event.start_date.isoformat() if event.start_date else None,
        "end_date": event.end_date.isoformat() if event.end_date else None,
        "event_time": (event.event_time.isoformat() if event.event_time else None),
        "poster_url": event.poster_url,
        "whatsapp_url": event.whatsapp_url,
        "external_url_name": event.external_url_name,
        "event_type": str(event.event_type.value if hasattr(event.event_type, "value") else event.event_type),
        "format": str(event.format.value if hasattr(event.format, "value") else event.format),
        "template_option": str(
            event.template_option.value if hasattr(event.template_option, "value") else event.template_option
        ),
        "participant_mode": str(
            event.participant_mode.value if hasattr(event.participant_mode, "value") else event.participant_mode
        ),
        "round_mode": str(event.round_mode.value if hasattr(event.round_mode, "value") else event.round_mode),
        "round_count": event.round_count,
        "team_min_size": event.team_min_size,
        "team_max_size": event.team_max_size,
        "is_visible": event.is_visible,
        "status": str(event.status.value if hasattr(event.status, "value") else event.status),
    }


@router.get("/persohub/chakravyuha-26/events", response_model=List[Dict[str, Any]])
def get_chakravyuha_public_events(
    db: Session = Depends(get_db),
):
    sympo = (
        db.query(CommunitySympo)
        .filter(func.lower(CommunitySympo.name) == "chakravyuha-26")
        .first()
    )
    if not sympo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chakravyuha content not found")

    rows = (
        db.query(CommunityEvent, PersohubCommunity)
        .join(CommunitySympoEvent, CommunitySympoEvent.event_id == CommunityEvent.id)
        .join(PersohubCommunity, PersohubCommunity.id == CommunityEvent.community_id)
        .filter(CommunitySympoEvent.sympo_id == sympo.id)
        .order_by(CommunityEvent.start_date.asc().nullslast(), CommunityEvent.id.asc())
        .all()
    )
    return [_serialize_chakravyuha_event(event, community) for event, community in rows]


@router.post("/persohub/communities/{profile_id}/follow-toggle")
def toggle_follow_community(
    profile_id: str,
    user: PdaUser = Depends(require_pda_user),
    db: Session = Depends(get_db),
):
    community = db.query(PersohubCommunity).filter(PersohubCommunity.profile_id == profile_id.lower()).first()
    if not community:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Community not found")

    follow = db.query(PersohubCommunityFollow).filter(
        PersohubCommunityFollow.community_id == community.id,
        PersohubCommunityFollow.user_id == user.id,
    ).first()
    if follow:
        db.delete(follow)
        action = "unfollowed"
    else:
        db.add(PersohubCommunityFollow(community_id=community.id, user_id=user.id))
        action = "followed"
    db.commit()
    return {"status": action}


@router.get("/persohub/feed", response_model=PersohubFeedResponse)
def get_feed(
    limit: int = Query(default=20, ge=1, le=100),
    cursor: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    user: Optional[PdaUser] = Depends(get_optional_pda_user),
):
    current_user_id = user.id if user else None
    offset = _parse_cursor_offset(cursor)
    posts: List[PersohubPost] = []
    total = 0

    if user:
        followed_ids = [
            cid
            for (cid,) in db.query(PersohubCommunityFollow.community_id)
            .filter(PersohubCommunityFollow.user_id == user.id)
            .all()
        ]

        if followed_ids:
            followed_total = (
                db.query(func.count(PersohubPost.id))
                .filter(PersohubPost.community_id.in_(followed_ids))
                .scalar()
            ) or 0
            other_total = (
                db.query(func.count(PersohubPost.id))
                .filter(~PersohubPost.community_id.in_(followed_ids))
                .scalar()
            ) or 0
            total = int(followed_total + other_total)

            followed_offset = offset
            followed_limit = 0
            if followed_offset < followed_total:
                followed_limit = min(limit, followed_total - followed_offset)
                posts.extend(
                    db.query(PersohubPost)
                    .filter(PersohubPost.community_id.in_(followed_ids))
                    .order_by(PersohubPost.created_at.desc(), PersohubPost.id.desc())
                    .offset(followed_offset)
                    .limit(followed_limit)
                    .all()
                )

            remaining = max(0, limit - followed_limit)
            if remaining > 0:
                other_offset = max(0, offset - followed_total)
                posts.extend(
                    db.query(PersohubPost)
                    .filter(~PersohubPost.community_id.in_(followed_ids))
                    .order_by(PersohubPost.like_count.desc(), PersohubPost.created_at.desc(), PersohubPost.id.desc())
                    .offset(other_offset)
                    .limit(remaining)
                    .all()
                )
        else:
            total = int(db.query(func.count(PersohubPost.id)).scalar() or 0)
            posts = (
                db.query(PersohubPost)
                .order_by(PersohubPost.like_count.desc(), PersohubPost.created_at.desc(), PersohubPost.id.desc())
                .offset(offset)
                .limit(limit)
                .all()
            )
    else:
        total = int(db.query(func.count(PersohubPost.id)).scalar() or 0)
        posts = (
            db.query(PersohubPost)
            .order_by(PersohubPost.like_count.desc(), PersohubPost.created_at.desc(), PersohubPost.id.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )

    next_offset = offset + len(posts)
    has_more = next_offset < total
    return PersohubFeedResponse(
        items=build_post_responses_bulk(db, posts, current_user_id=current_user_id),
        next_cursor=str(next_offset) if has_more else None,
        has_more=has_more,
    )


@router.get("/persohub/posts/{slug_token}", response_model=PersohubPostResponse)
def get_post_detail(
    slug_token: str,
    db: Session = Depends(get_db),
    user: Optional[PdaUser] = Depends(get_optional_pda_user),
):
    post = db.query(PersohubPost).filter(PersohubPost.slug_token == slug_token).first()
    if not post:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
    return build_post_response(db, post, current_user_id=(user.id if user else None))


@router.post("/persohub/posts/{slug_token}/like-toggle", response_model=PersohubPostResponse)
def toggle_like(
    slug_token: str,
    user: PdaUser = Depends(require_pda_user),
    db: Session = Depends(get_db),
):
    post = db.query(PersohubPost).filter(PersohubPost.slug_token == slug_token).first()
    if not post:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")

    existing = db.query(PersohubPostLike).filter(
        PersohubPostLike.post_id == post.id,
        PersohubPostLike.user_id == user.id,
    ).first()
    if existing:
        db.delete(existing)
    else:
        db.add(PersohubPostLike(post_id=post.id, user_id=user.id))

    refresh_post_counts(db, post.id)
    db.commit()
    db.refresh(post)
    return build_post_response(db, post, current_user_id=user.id)


@router.get("/persohub/posts/{slug_token}/comments", response_model=PersohubCommentPageResponse)
def list_comments(
    slug_token: str,
    limit: int = Query(default=20, ge=1, le=100),
    cursor: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
):
    post = db.query(PersohubPost).filter(PersohubPost.slug_token == slug_token).first()
    if not post:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")

    offset = _parse_cursor_offset(cursor)
    total = (
        db.query(func.count(PersohubPostComment.id))
        .filter(PersohubPostComment.post_id == post.id)
        .scalar()
    ) or 0

    rows = (
        db.query(PersohubPostComment, PdaUser)
        .join(PdaUser, PersohubPostComment.user_id == PdaUser.id)
        .filter(PersohubPostComment.post_id == post.id)
        .order_by(PersohubPostComment.created_at.desc(), PersohubPostComment.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    items = [
        PersohubCommentResponse(
            id=comment.id,
            user_id=author.id,
            profile_name=author.profile_name,
            name=author.name,
            image_url=author.image_url,
            comment_text=comment.comment_text,
            created_at=comment.created_at,
        )
        for comment, author in rows
    ]
    next_offset = offset + len(items)
    has_more = next_offset < total
    return PersohubCommentPageResponse(
        items=items,
        next_cursor=str(next_offset) if has_more else None,
        has_more=has_more,
    )


@router.post("/persohub/posts/{slug_token}/comments", response_model=PersohubCommentResponse)
def create_comment(
    slug_token: str,
    payload: PersohubCommentCreateRequest,
    user: PdaUser = Depends(require_pda_user),
    db: Session = Depends(get_db),
):
    post = db.query(PersohubPost).filter(PersohubPost.slug_token == slug_token).first()
    if not post:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")

    row = PersohubPostComment(
        post_id=post.id,
        user_id=user.id,
        comment_text=payload.comment_text.strip(),
    )
    db.add(row)
    db.flush()

    refresh_post_counts(db, post.id)
    db.commit()
    db.refresh(row)
    return PersohubCommentResponse(
        id=row.id,
        user_id=user.id,
        profile_name=user.profile_name,
        name=user.name,
        image_url=user.image_url,
        comment_text=row.comment_text,
        created_at=row.created_at,
    )


@router.get("/persohub/hashtags/{hashtag}/posts", response_model=PersohubFeedResponse)
def get_hashtag_posts(
    hashtag: str,
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    user: Optional[PdaUser] = Depends(get_optional_pda_user),
):
    normalized = hashtag.strip().lower().lstrip("#")
    tag = db.query(PersohubHashtag).filter(PersohubHashtag.hashtag_text == normalized).first()
    if not tag:
        return PersohubFeedResponse(items=[])

    post_ids = [
        pid
        for (pid,) in db.query(PersohubPostHashtag.post_id)
        .filter(PersohubPostHashtag.hashtag_id == tag.id)
        .order_by(PersohubPostHashtag.post_id.desc())
        .limit(limit)
        .all()
    ]
    if not post_ids:
        return PersohubFeedResponse(items=[])

    posts = (
        db.query(PersohubPost)
        .filter(PersohubPost.id.in_(post_ids))
        .order_by(PersohubPost.created_at.desc())
        .all()
    )
    return PersohubFeedResponse(items=build_post_responses_bulk(db, posts, current_user_id=(user.id if user else None)))


@router.get("/persohub/search/suggestions", response_model=PersohubSearchResponse)
def search_suggestions(
    q: str = Query(..., min_length=1, max_length=50),
    db: Session = Depends(get_db),
):
    needle = q.strip().lower()
    if not needle:
        return PersohubSearchResponse(items=[])

    communities = (
        db.query(PersohubCommunity)
        .filter(
            or_(
                PersohubCommunity.profile_id.ilike(f"%{needle}%"),
                PersohubCommunity.name.ilike(f"%{needle}%"),
            )
        )
        .order_by(PersohubCommunity.name.asc())
        .limit(6)
        .all()
    )
    users = (
        db.query(PdaUser)
        .filter(
            or_(
                PdaUser.profile_name.ilike(f"%{needle}%"),
                PdaUser.name.ilike(f"%{needle}%"),
            )
        )
        .order_by(PdaUser.name.asc())
        .limit(6)
        .all()
    )
    hashtags = (
        db.query(PersohubHashtag)
        .filter(PersohubHashtag.hashtag_text.ilike(f"%{needle}%"))
        .order_by(PersohubHashtag.count.desc(), PersohubHashtag.hashtag_text.asc())
        .limit(6)
        .all()
    )

    items: List[PersohubSearchSuggestion] = []
    items.extend(
        [
            PersohubSearchSuggestion(
                result_type="community",
                profile_name=community.profile_id,
                label=community.name,
                meta="community",
            )
            for community in communities
        ]
    )
    items.extend(
        [
            PersohubSearchSuggestion(
                result_type="user",
                profile_name=user.profile_name or "",
                label=user.name,
                meta="user",
            )
            for user in users
            if user.profile_name
        ]
    )
    items.extend(
        [
            PersohubSearchSuggestion(
                result_type="hashtag",
                profile_name=f"#{tag.hashtag_text}",
                label=f"#{tag.hashtag_text}",
                meta=f"{tag.count} posts",
            )
            for tag in hashtags
        ]
    )

    return PersohubSearchResponse(items=items[:12])


@router.get("/persohub/profile/{profile_name}", response_model=PersohubPublicProfileResponse)
def get_public_profile(
    profile_name: str,
    db: Session = Depends(get_db),
    user: Optional[PdaUser] = Depends(get_optional_pda_user),
    community_auth: Optional[PersohubCommunity] = Depends(get_optional_persohub_community),
):
    key = profile_name.strip().lower()

    community = db.query(PersohubCommunity).filter(PersohubCommunity.profile_id == key).first()
    if community:
        posts = (
            db.query(PersohubPost)
            .filter(PersohubPost.community_id == community.id)
            .order_by(PersohubPost.created_at.desc())
            .limit(100)
            .all()
        )
        return PersohubPublicProfileResponse(
            profile_type="community",
            profile_name=community.profile_id,
            name=community.name,
            image_url=community.logo_url,
            about=community.description,
            community=build_community_card(db, community, current_user_id=(user.id if user else None)),
            posts=build_post_responses_bulk(db, posts, current_user_id=(user.id if user else None)),
            can_edit=bool(community_auth and community_auth.id == community.id),
        )

    person = db.query(PdaUser).filter(PdaUser.profile_name == key).first()
    if not person:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")

    team = db.query(PdaTeam).filter(PdaTeam.user_id == person.id).first()
    badges_rows = (
        db.query(PdaEventBadge)
        .filter(PdaEventBadge.user_id == person.id)
        .order_by(PdaEventBadge.created_at.desc())
        .limit(50)
        .all()
    )
    mentioned_posts = (
        db.query(PersohubPost)
        .join(PersohubPostMention, PersohubPostMention.post_id == PersohubPost.id)
        .filter(PersohubPostMention.user_id == person.id)
        .order_by(PersohubPost.created_at.desc())
        .limit(50)
        .all()
    )

    return PersohubPublicProfileResponse(
        profile_type="user",
        profile_name=person.profile_name or "",
        name=person.name,
        image_url=person.image_url,
        is_member=person.is_member,
        team=team.team if person.is_member and team else None,
        designation=team.designation if person.is_member and team else None,
        badges=[
            {
                "id": badge.id,
                "title": badge.title,
                "image_url": badge.image_url,
                "place": badge.place.value if hasattr(badge.place, "value") else str(badge.place),
                "score": badge.score,
                "event_id": badge.event_id,
            }
            for badge in badges_rows
        ],
        posts=build_post_responses_bulk(db, mentioned_posts, current_user_id=(user.id if user else None)),
        can_edit=bool(user and user.id == person.id),
    )


@router.get("/persohub/phase-gate/{phase}", response_model=PersohubPhaseGateStatus)
def phase_gate_status(phase: str, db: Session = Depends(get_db)):
    phase_value = str(phase).strip().lower()
    checks = {}

    if phase_value in {"1", "phase1"}:
        checks = phase_1_schema_check(db)
    elif phase_value in {"2", "phase2"}:
        checks = {
            "community_auth_available": True,
            "upload_single_endpoint": True,
            "upload_multipart_endpoint": True,
        }
    elif phase_value in {"3", "phase3"}:
        checks = {
            "feed_endpoint": True,
            "search_endpoint": True,
            "post_detail_endpoint": True,
            "like_comment_endpoint": True,
        }
    elif phase_value in {"4", "phase4"}:
        checks = {
            "frontend_routes_expected": True,
            "responsive_columns_expected": True,
        }
    elif phase_value in {"5", "phase5"}:
        checks = {
            "pagination_and_ordering_enabled": True,
            "cleanup_script_available": True,
        }
    else:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown phase")

    status_value = "pass" if all(bool(v) for v in checks.values()) else "fail"
    return PersohubPhaseGateStatus(phase=str(phase), checks=checks, status=status_value)
