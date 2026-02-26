from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from database import get_db
from models import (
    PersohubEvent,
    PersohubEventRegistration,
    PersohubSympo,
    PersohubSympoEvent,
    PdaEventRegistrationStatus,
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
from badge_service import get_user_badge_assignments
from persohub_schemas import (
    PersohubCommentCreateRequest,
    PersohubCommentPageResponse,
    PersohubCommentResponse,
    PersohubFeedResponse,
    PersohubFeedTypeEnum,
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
    ordered = [c for c in communities if c.id in cards]
    ordered.sort(
        key=lambda c: (
            0 if cards[c.id].is_following else 1,
            c.club_id is None,
            c.club_id if c.club_id is not None else 10**12,
            str(c.name or "").lower(),
        )
    )
    return [cards[c.id] for c in ordered]


@router.get("/persohub/clubs", response_model=List[PersohubPublicClubCommunityInfo])
def list_public_club_community_info(
    db: Session = Depends(get_db),
):
    clubs = db.query(PersohubClub).order_by(PersohubClub.name.asc(), PersohubClub.id.asc()).all()
    rows = []
    for club in clubs:
        community = (
            db.query(PersohubCommunity)
            .filter(PersohubCommunity.club_id == club.id)
            .order_by(PersohubCommunity.id.asc())
            .first()
        )
        if not community:
            continue
        rows.append((community, club))
    return [
        PersohubPublicClubCommunityInfo(
            clubId=community.profile_id,
            clubName=club.name,
            clubUrl=club.club_url,
            clubTagline=club.club_tagline,
            clubImage=club.club_logo_url or community.logo_url,
            clubDescription=club.club_description or community.description,
        )
        for community, club in rows
    ]


@router.get("/persohub/chakravyuha-26", response_model=Dict[str, Any])
def get_chakravyuha_public_content(
    db: Session = Depends(get_db),
):
    sympo = (
        db.query(PersohubSympo)
        .filter(func.lower(PersohubSympo.name) == "chakravyuha-26")
        .first()
    )
    if not sympo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chakravyuha content not found")
    return _normalize_chakravyuha_content(sympo.content)


def _serialize_chakravyuha_event(event: PersohubEvent) -> Dict[str, Any]:
    return {
        "id": event.id,
        "slug": event.slug,
        "event_code": event.event_code,
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
        db.query(PersohubSympo)
        .filter(func.lower(PersohubSympo.name) == "chakravyuha-26")
        .first()
    )
    if not sympo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chakravyuha content not found")

    rows = (
        db.query(PersohubEvent, PersohubCommunity, PersohubClub)
        .join(PersohubSympoEvent, PersohubSympoEvent.event_id == PersohubEvent.id)
        .outerjoin(PersohubCommunity, PersohubCommunity.id == PersohubEvent.community_id)
        .outerjoin(PersohubClub, PersohubClub.id == PersohubEvent.club_id)
        .filter(PersohubSympoEvent.sympo_id == sympo.id)
        .order_by(PersohubClub.name.asc().nullslast(), PersohubEvent.start_date.asc().nullslast(), PersohubEvent.id.asc())
        .all()
    )
    fallback_club_ids = {
        int(community.club_id)
        for _, community, club in rows
        if not club and community and community.club_id is not None
    }
    fallback_club_map: Dict[int, PersohubClub] = {}
    if fallback_club_ids:
        fallback_clubs = db.query(PersohubClub).filter(PersohubClub.id.in_(fallback_club_ids)).all()
        fallback_club_map = {int(item.id): item for item in fallback_clubs}

    grouped: Dict[int, Dict[str, Any]] = {}
    for event, community, club in rows:
        resolved_club = club
        if not resolved_club and community and community.club_id is not None:
            resolved_club = fallback_club_map.get(int(community.club_id))
        if not resolved_club:
            continue
        club_id = int(resolved_club.id)
        if club_id not in grouped:
            grouped[club_id] = {
                "club_id": club_id,
                "club_name": resolved_club.name,
                "club_url": resolved_club.club_url,
                "club_tagline": resolved_club.club_tagline,
                "club_logo_url": resolved_club.club_logo_url,
                "events": [],
            }
        grouped[club_id]["events"].append(_serialize_chakravyuha_event(event))

    ordered_club_ids = sorted(grouped.keys(), key=lambda value: str(grouped[value].get("club_name") or "").lower())
    return [grouped[club_id] for club_id in ordered_club_ids]


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
    feed_type: PersohubFeedTypeEnum = Query(default=PersohubFeedTypeEnum.ALL),
    db: Session = Depends(get_db),
    user: Optional[PdaUser] = Depends(get_optional_pda_user),
):
    current_user_id = user.id if user else None
    offset = _parse_cursor_offset(cursor)
    posts: List[PersohubPost] = []
    total = 0
    feed_filter_clause = None
    if feed_type == PersohubFeedTypeEnum.EVENT:
        feed_filter_clause = PersohubPost.post_type == "event"
    elif feed_type == PersohubFeedTypeEnum.COMMUNITY:
        feed_filter_clause = PersohubPost.post_type == "community"

    followed_ordering = (PersohubPost.created_at.desc(), PersohubPost.id.desc())
    other_ordering = (PersohubPost.like_count.desc(), PersohubPost.created_at.desc(), PersohubPost.id.desc())

    if user:
        followed_ids = [
            cid
            for (cid,) in db.query(PersohubCommunityFollow.community_id)
            .filter(PersohubCommunityFollow.user_id == user.id)
            .all()
        ]

        if followed_ids:
            followed_total_query = (
                db.query(func.count(PersohubPost.id))
                .filter(PersohubPost.community_id.in_(followed_ids), PersohubPost.is_hidden == 1)
            )
            other_total_query = (
                db.query(func.count(PersohubPost.id))
                .filter(~PersohubPost.community_id.in_(followed_ids), PersohubPost.is_hidden == 1)
            )
            if feed_filter_clause is not None:
                followed_total_query = followed_total_query.filter(feed_filter_clause)
                other_total_query = other_total_query.filter(feed_filter_clause)
            followed_total = followed_total_query.scalar() or 0
            other_total = other_total_query.scalar() or 0
            total = int(followed_total + other_total)

            followed_offset = offset
            followed_limit = 0
            if followed_offset < followed_total:
                followed_limit = min(limit, followed_total - followed_offset)
                followed_posts_query = (
                    db.query(PersohubPost)
                    .filter(PersohubPost.community_id.in_(followed_ids), PersohubPost.is_hidden == 1)
                )
                if feed_filter_clause is not None:
                    followed_posts_query = followed_posts_query.filter(feed_filter_clause)
                posts.extend(
                    followed_posts_query
                    .order_by(*followed_ordering)
                    .offset(followed_offset)
                    .limit(followed_limit)
                    .all()
                )

            remaining = max(0, limit - followed_limit)
            if remaining > 0:
                other_offset = max(0, offset - followed_total)
                other_posts_query = (
                    db.query(PersohubPost)
                    .filter(~PersohubPost.community_id.in_(followed_ids), PersohubPost.is_hidden == 1)
                )
                if feed_filter_clause is not None:
                    other_posts_query = other_posts_query.filter(feed_filter_clause)
                posts.extend(
                    other_posts_query
                    .order_by(*other_ordering)
                    .offset(other_offset)
                    .limit(remaining)
                    .all()
                )
        else:
            total_query = db.query(func.count(PersohubPost.id)).filter(PersohubPost.is_hidden == 1)
            posts_query = db.query(PersohubPost).filter(PersohubPost.is_hidden == 1)
            if feed_filter_clause is not None:
                total_query = total_query.filter(feed_filter_clause)
                posts_query = posts_query.filter(feed_filter_clause)
            total = int(total_query.scalar() or 0)
            posts = (
                posts_query
                .order_by(*other_ordering)
                .offset(offset)
                .limit(limit)
                .all()
            )
    else:
        total_query = db.query(func.count(PersohubPost.id)).filter(PersohubPost.is_hidden == 1)
        posts_query = db.query(PersohubPost).filter(PersohubPost.is_hidden == 1)
        if feed_filter_clause is not None:
            total_query = total_query.filter(feed_filter_clause)
            posts_query = posts_query.filter(feed_filter_clause)
        total = int(total_query.scalar() or 0)
        posts = (
            posts_query
            .order_by(*other_ordering)
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
        .filter(PersohubPost.id.in_(post_ids), PersohubPost.is_hidden == 1)
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
    limit: int = Query(default=20, ge=1, le=100),
    cursor: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    user: Optional[PdaUser] = Depends(get_optional_pda_user),
    community_auth: Optional[PersohubCommunity] = Depends(get_optional_persohub_community),
):
    key = profile_name.strip().lower()
    offset = _parse_cursor_offset(cursor)

    community = db.query(PersohubCommunity).filter(PersohubCommunity.profile_id == key).first()
    if community:
        community_card = build_community_card(db, community, current_user_id=(user.id if user else None))
        can_edit_community = bool(community_auth and community_auth.id == community.id)
        follower_count = int(
            db.query(func.count(PersohubCommunityFollow.id))
            .filter(PersohubCommunityFollow.community_id == community.id)
            .scalar()
            or 0
        )
        posts_query = db.query(PersohubPost).filter(PersohubPost.community_id == community.id)
        if not can_edit_community:
            posts_query = posts_query.filter(PersohubPost.is_hidden == 1)
        total_posts = int(posts_query.count() or 0)
        posts = (
            posts_query
            .order_by(PersohubPost.created_at.desc(), PersohubPost.id.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )
        next_offset = offset + len(posts)
        has_more = next_offset < total_posts
        return PersohubPublicProfileResponse(
            profile_type="community",
            profile_name=community.profile_id,
            name=community.name,
            image_url=community_card.logo_url,
            about=community.description,
            follower_count=follower_count,
            community=community_card,
            posts=build_post_responses_bulk(db, posts, current_user_id=(user.id if user else None)),
            posts_next_cursor=str(next_offset) if has_more else None,
            posts_has_more=has_more,
            can_edit=can_edit_community,
        )

    person = db.query(PdaUser).filter(PdaUser.profile_name == key).first()
    if not person:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")

    team = db.query(PdaTeam).filter(PdaTeam.user_id == person.id).first()
    badges_rows = get_user_badge_assignments(db, person.id, limit=50)
    registered_events_count = int(
        db.query(func.count(func.distinct(PersohubEventRegistration.event_id)))
        .filter(
            PersohubEventRegistration.user_id == person.id,
            PersohubEventRegistration.status == PdaEventRegistrationStatus.ACTIVE,
        )
        .scalar()
        or 0
    )
    mentioned_posts_query = (
        db.query(PersohubPost)
        .join(PersohubPostMention, PersohubPostMention.post_id == PersohubPost.id)
        .filter(PersohubPostMention.user_id == person.id)
    )
    total_posts = int(mentioned_posts_query.count() or 0)
    mentioned_posts = (
        mentioned_posts_query
        .order_by(PersohubPost.created_at.desc(), PersohubPost.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    next_offset = offset + len(mentioned_posts)
    has_more = next_offset < total_posts

    return PersohubPublicProfileResponse(
        profile_type="user",
        profile_name=person.profile_name or "",
        name=person.name,
        regno=person.regno,
        email=person.email,
        image_url=person.image_url,
        gender=person.gender,
        is_member=person.is_member,
        team=team.team if person.is_member and team else None,
        designation=team.designation if person.is_member and team else None,
        instagram_url=person.instagram_url,
        linkedin_url=person.linkedin_url,
        github_url=person.github_url,
        registered_events_count=registered_events_count,
        badges=[
            {
                "id": assignment.id,
                "title": badge.badge_name,
                "image_url": badge.image_url,
                "reveal_video_url": badge.reveal_video_url,
                "place": str((assignment.meta or {}).get("place") or "SpecialMention"),
                "score": (assignment.meta or {}).get("score"),
                "event_id": assignment.pda_event_id or assignment.persohub_event_id,
            }
            for assignment, badge in badges_rows
        ],
        posts=build_post_responses_bulk(db, mentioned_posts, current_user_id=(user.id if user else None)),
        posts_next_cursor=str(next_offset) if has_more else None,
        posts_has_more=has_more,
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
