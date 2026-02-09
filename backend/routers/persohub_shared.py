import os
from typing import Dict, List, Optional, Sequence

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

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
from persohub_schemas import (
    PersohubAttachmentIn,
    PersohubAttachmentResponse,
    PersohubCommunityCard,
    PersohubMentionResponse,
    PersohubPostResponse,
)
from persohub_service import extract_hashtags, infer_attachment_kind
from utils import _generate_presigned_get_url_from_s3_url


def _frontend_base_url() -> str:
    return (os.environ.get("FRONTEND_BASE_URL") or "http://localhost:3000").rstrip("/")


def build_community_card(
    db: Session,
    community: PersohubCommunity,
    current_user_id: Optional[int] = None,
) -> PersohubCommunityCard:
    club = db.query(PersohubClub).filter(PersohubClub.id == community.club_id).first() if community.club_id else None
    is_following = None
    if current_user_id:
        is_following = bool(
            db.query(PersohubCommunityFollow)
            .filter(
                PersohubCommunityFollow.community_id == community.id,
                PersohubCommunityFollow.user_id == current_user_id,
            )
            .first()
        )
    return PersohubCommunityCard(
        id=community.id,
        name=community.name,
        profile_id=community.profile_id,
        logo_url=community.logo_url or (club.club_logo_url if club else None),
        club_id=community.club_id,
        club_name=club.name if club else None,
        is_following=is_following,
    )


def build_community_cards_bulk(
    db: Session,
    communities: Sequence[PersohubCommunity],
    current_user_id: Optional[int] = None,
) -> Dict[int, PersohubCommunityCard]:
    community_list = list(communities or [])
    if not community_list:
        return {}

    community_ids = [c.id for c in community_list]
    club_ids = list({c.club_id for c in community_list if c.club_id})

    clubs_map = {}
    if club_ids:
        clubs = db.query(PersohubClub).filter(PersohubClub.id.in_(club_ids)).all()
        clubs_map = {club.id: club for club in clubs}

    following_ids = set()
    if current_user_id:
        following_ids = {
            cid
            for (cid,) in (
                db.query(PersohubCommunityFollow.community_id)
                .filter(
                    PersohubCommunityFollow.user_id == current_user_id,
                    PersohubCommunityFollow.community_id.in_(community_ids),
                )
                .all()
            )
        }

    result = {}
    for community in community_list:
        club = clubs_map.get(community.club_id) if community.club_id else None
        result[community.id] = PersohubCommunityCard(
            id=community.id,
            name=community.name,
            profile_id=community.profile_id,
            logo_url=community.logo_url or (club.club_logo_url if club else None),
            club_id=community.club_id,
            club_name=club.name if club else None,
            is_following=(community.id in following_ids) if current_user_id else None,
        )
    return result


def replace_post_attachments(db: Session, post_id: int, attachments: Sequence[PersohubAttachmentIn]) -> None:
    db.query(PersohubPostAttachment).filter(PersohubPostAttachment.post_id == post_id).delete()
    for idx, item in enumerate(attachments):
        db.add(
            PersohubPostAttachment(
                post_id=post_id,
                s3_url=item.s3_url,
                preview_image_urls=item.preview_image_urls,
                mime_type=item.mime_type,
                attachment_kind=infer_attachment_kind(item.mime_type, item.s3_url),
                size_bytes=item.size_bytes,
                order_no=idx,
            )
        )


def sync_post_tags_and_mentions(
    db: Session,
    post: PersohubPost,
    mention_profile_names: Optional[List[str]],
) -> None:
    hashtag_values = set(extract_hashtags(post.description))

    existing_hashtag_links = (
        db.query(PersohubPostHashtag, PersohubHashtag)
        .join(PersohubHashtag, PersohubPostHashtag.hashtag_id == PersohubHashtag.id)
        .filter(PersohubPostHashtag.post_id == post.id)
        .all()
    )
    existing_hashtags = {tag.hashtag_text: (link, tag) for link, tag in existing_hashtag_links}

    to_remove = [name for name in existing_hashtags.keys() if name not in hashtag_values]
    to_add = [name for name in hashtag_values if name not in existing_hashtags]

    for name in to_remove:
        link, tag = existing_hashtags[name]
        db.delete(link)
        tag.count = max(0, int(tag.count or 0) - 1)

    for name in to_add:
        tag = db.query(PersohubHashtag).filter(PersohubHashtag.hashtag_text == name).first()
        if not tag:
            tag = PersohubHashtag(hashtag_text=name, count=0)
            db.add(tag)
            db.flush()
        tag.count = int(tag.count or 0) + 1
        db.add(PersohubPostHashtag(post_id=post.id, hashtag_id=tag.id))

    if mention_profile_names is None:
        return

    normalized_mentions = list({name.strip().lower() for name in mention_profile_names if name and name.strip()})
    if not normalized_mentions:
        db.query(PersohubPostMention).filter(PersohubPostMention.post_id == post.id).delete()
        return

    users = db.query(PdaUser).filter(PdaUser.profile_name.in_(normalized_mentions)).all()
    found = {u.profile_name for u in users if u.profile_name}
    missing = sorted(set(normalized_mentions) - found)
    if missing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid mention profile names: {', '.join(missing)}",
        )

    target_user_ids = {u.id for u in users}
    current_mentions = db.query(PersohubPostMention).filter(PersohubPostMention.post_id == post.id).all()
    current_user_ids = {m.user_id for m in current_mentions}

    for row in current_mentions:
        if row.user_id not in target_user_ids:
            db.delete(row)

    for user_id in target_user_ids:
        if user_id not in current_user_ids:
            db.add(PersohubPostMention(post_id=post.id, user_id=user_id))


def refresh_post_counts(db: Session, post_id: int) -> None:
    # SessionLocal uses autoflush=False, so pending like/comment changes
    # must be flushed before aggregate counts are recalculated.
    db.flush()
    likes_count = (
        db.query(func.count(PersohubPostLike.id))
        .filter(PersohubPostLike.post_id == post_id)
        .scalar()
    )
    comments_count = (
        db.query(func.count(PersohubPostComment.id))
        .filter(PersohubPostComment.post_id == post_id)
        .scalar()
    )
    post = db.query(PersohubPost).filter(PersohubPost.id == post_id).first()
    if post:
        post.like_count = int(likes_count or 0)
        post.comment_count = int(comments_count or 0)


def build_post_response(
    db: Session,
    post: PersohubPost,
    current_user_id: Optional[int] = None,
) -> PersohubPostResponse:
    responses = build_post_responses_bulk(db, [post], current_user_id=current_user_id)
    if not responses:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
    return responses[0]


def build_post_responses_bulk(
    db: Session,
    posts: Sequence[PersohubPost],
    current_user_id: Optional[int] = None,
) -> List[PersohubPostResponse]:
    post_list = list(posts or [])
    if not post_list:
        return []

    post_ids = [p.id for p in post_list]
    community_ids = list({p.community_id for p in post_list})

    communities = db.query(PersohubCommunity).filter(PersohubCommunity.id.in_(community_ids)).all()
    community_cards = build_community_cards_bulk(db, communities, current_user_id=current_user_id)

    attachments_by_post: Dict[int, List[PersohubPostAttachment]] = {}
    attachment_rows = (
        db.query(PersohubPostAttachment)
        .filter(PersohubPostAttachment.post_id.in_(post_ids))
        .order_by(
            PersohubPostAttachment.post_id.asc(),
            PersohubPostAttachment.order_no.asc(),
            PersohubPostAttachment.id.asc(),
        )
        .all()
    )
    for item in attachment_rows:
        attachments_by_post.setdefault(item.post_id, []).append(item)

    hashtags_by_post: Dict[int, List[str]] = {}
    hashtag_rows = (
        db.query(PersohubPostHashtag.post_id, PersohubHashtag.hashtag_text)
        .join(PersohubHashtag, PersohubPostHashtag.hashtag_id == PersohubHashtag.id)
        .filter(PersohubPostHashtag.post_id.in_(post_ids))
        .order_by(PersohubPostHashtag.post_id.asc(), PersohubHashtag.hashtag_text.asc())
        .all()
    )
    for post_id, hashtag_text in hashtag_rows:
        hashtags_by_post.setdefault(int(post_id), []).append(hashtag_text)

    mentions_by_post: Dict[int, List[PersohubMentionResponse]] = {}
    mention_rows = (
        db.query(PersohubPostMention.post_id, PdaUser.id, PdaUser.profile_name, PdaUser.name)
        .join(PdaUser, PersohubPostMention.user_id == PdaUser.id)
        .filter(PersohubPostMention.post_id.in_(post_ids))
        .order_by(PersohubPostMention.post_id.asc(), PdaUser.profile_name.asc())
        .all()
    )
    for post_id, user_id, profile_name, name in mention_rows:
        if not profile_name:
            continue
        mentions_by_post.setdefault(int(post_id), []).append(
            PersohubMentionResponse(
                user_id=int(user_id),
                profile_name=profile_name,
                name=name,
            )
        )

    liked_post_ids = set()
    if current_user_id:
        liked_post_ids = {
            pid
            for (pid,) in (
                db.query(PersohubPostLike.post_id)
                .filter(
                    PersohubPostLike.user_id == current_user_id,
                    PersohubPostLike.post_id.in_(post_ids),
                )
                .all()
            )
        }

    responses: List[PersohubPostResponse] = []
    for post in post_list:
        community_card = community_cards.get(post.community_id)
        if not community_card:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post community not found")
        attachments = attachments_by_post.get(post.id, [])
        responses.append(
            PersohubPostResponse(
                id=post.id,
                slug_token=post.slug_token,
                description=post.description,
                created_at=post.created_at,
                updated_at=post.updated_at,
                like_count=int(post.like_count or 0),
                comment_count=int(post.comment_count or 0),
                is_liked=post.id in liked_post_ids,
                community=community_card,
                attachments=[
                    PersohubAttachmentResponse(
                        id=item.id,
                        s3_url=_generate_presigned_get_url_from_s3_url(item.s3_url) or item.s3_url,
                        preview_image_urls=[
                            _generate_presigned_get_url_from_s3_url(url) or url
                            for url in (item.preview_image_urls or [])
                        ],
                        mime_type=item.mime_type,
                        attachment_kind=item.attachment_kind,
                        size_bytes=item.size_bytes,
                        order_no=item.order_no,
                    )
                    for item in attachments
                ],
                hashtags=hashtags_by_post.get(post.id, []),
                mentions=mentions_by_post.get(post.id, []),
                share_url=f"{_frontend_base_url()}/persohub/p/{post.slug_token}",
            )
        )
    return responses
