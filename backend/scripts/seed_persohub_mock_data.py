#!/usr/bin/env python3
"""Seed cleanup-safe Persohub mock data.

All records created by this script are cleanup-compatible:
- Names/descriptions use the `MOCKPH_` marker.
- Attachment URLs use the `persohub/mock/` key prefix.
- Event slug/event_code include mock markers.
- Optional users created by this script use `MOCKPH_` markers.

Cleanup command:
    python backend/scripts/cleanup_persohub_mock_data.py
"""

from __future__ import annotations

import argparse
import re
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
import sys
from typing import Dict, List, Optional

from sqlalchemy import or_

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from auth import get_password_hash
from database import SessionLocal
from models import (
    PdaEventBadgePlace,
    PdaEventEntityType,
    PdaEventFormat,
    PdaEventInviteStatus,
    PdaEventParticipantMode,
    PdaEventRegistrationStatus,
    PdaEventRoundMode,
    PdaEventRoundState,
    PdaEventStatus,
    PdaEventTemplate,
    PdaEventType,
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
MOCK_EMAIL_DOMAIN = "example.local"
SLUG_CLEAN_RE = re.compile(r"[^a-z0-9]+")
DEFAULT_ROUND_CRITERIA = [{"name": "Score", "max_marks": 100}]
DEFAULT_ALLOWED_MIME_TYPES = [
    "application/pdf",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "image/png",
    "image/jpeg",
    "image/webp",
    "video/mp4",
    "video/quicktime",
    "application/zip",
]


def _pick_users(db, limit: int) -> List[PdaUser]:
    return db.query(PdaUser).order_by(PdaUser.id.asc()).limit(max(1, limit)).all()


def _slugify(raw: str) -> str:
    base = SLUG_CLEAN_RE.sub("-", str(raw or "").strip().lower()).strip("-")
    return base[:110] if base else "mock-event"


def _next_event_slug(db, base: str) -> str:
    root = _slugify(base)
    slug = root
    counter = 2
    while db.query(PersohubEvent).filter(PersohubEvent.slug == slug).first():
        slug = f"{root}-{counter}"
        counter += 1
    return slug


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


def _create_mock_users(db, *, count: int, stamp: str) -> List[PdaUser]:
    created: List[PdaUser] = []
    if count <= 0:
        return created

    next_idx = 1
    while len(created) < count:
        regno = f"7{stamp[-6:]}{next_idx:03d}"
        email = f"mockph_user_{stamp}_{next_idx}@{MOCK_EMAIL_DOMAIN}"
        profile_name = f"mockph_u_{stamp[-8:]}_{next_idx}"
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
        user = PdaUser(
            regno=regno,
            email=email,
            hashed_password=get_password_hash("password"),
            name=f"{MOCK_MARKER}User_{next_idx}",
            profile_name=profile_name,
            dept="Information Technology",
            phno=f"9{stamp[-6:]}{next_idx:03d}"[-10:],
            is_member=True,
        )
        db.add(user)
        created.append(user)
        next_idx += 1
    db.flush()
    return created


def _seed_event_bundle(
    db,
    *,
    counts: Dict[str, int],
    community: PersohubCommunity,
    admin: PdaUser,
    users: List[PdaUser],
    sympo: Optional[PersohubSympo],
    events_per_community: int,
    participants_per_event: int,
    now_utc: datetime,
    stamp: str,
) -> None:
    participant_pool = users[: max(2, min(len(users), participants_per_event))]
    event_types = [PdaEventType.TECHNICAL, PdaEventType.WORKSHOP, PdaEventType.HACKATHON]
    formats = [PdaEventFormat.OFFLINE, PdaEventFormat.ONLINE, PdaEventFormat.HYBRID]

    for event_idx in range(events_per_community):
        is_team_event = ((event_idx % 2) == 1) and len(participant_pool) >= 4
        participant_mode = PdaEventParticipantMode.TEAM if is_team_event else PdaEventParticipantMode.INDIVIDUAL
        round_count = 2 if (event_idx % 2 == 0) else 1
        round_mode = PdaEventRoundMode.MULTI if round_count > 1 else PdaEventRoundMode.SINGLE
        start = date.today() + timedelta(days=(event_idx + 1))
        end = start + timedelta(days=1)
        event_title = f"{MOCK_MARKER}Event_{community.profile_id}_{event_idx + 1}"

        event = PersohubEvent(
            slug=_next_event_slug(db, f"mockph-{community.profile_id}-{stamp[-6:]}-{event_idx + 1}"),
            event_code=f"MOCKPH{stamp[-8:]}{community.id:02d}{event_idx + 1:02d}"[:20],
            club_id=community.club_id,
            community_id=community.id,
            title=event_title,
            description=f"{MOCK_MARKER}Generated event for {community.profile_id}",
            start_date=start,
            end_date=end,
            event_time=time(hour=(10 + event_idx) % 24, minute=30),
            poster_url=f"https://placehold.co/600x900?text={community.profile_id}+event+{event_idx + 1}",
            whatsapp_url="https://chat.whatsapp.com/mockph",
            external_url_name="Register Now",
            event_type=event_types[event_idx % len(event_types)],
            format=formats[event_idx % len(formats)],
            template_option=PdaEventTemplate.ATTENDANCE_SCORING,
            participant_mode=participant_mode,
            round_mode=round_mode,
            round_count=round_count,
            team_min_size=(2 if is_team_event else None),
            team_max_size=(4 if is_team_event else None),
            is_visible=True,
            registration_open=True,
            open_for="ALL",
            status=PdaEventStatus.OPEN,
        )
        db.add(event)
        db.flush()
        counts["events"] += 1

        if sympo:
            db.add(PersohubSympoEvent(sympo_id=sympo.id, event_id=event.id))
            counts["sympo_events"] += 1

        round_rows: List[PersohubEventRound] = []
        panel_by_round: Dict[int, PersohubEventRoundPanel] = {}
        for round_idx in range(round_count):
            round_row = PersohubEventRound(
                event_id=event.id,
                round_no=round_idx + 1,
                name=f"{MOCK_MARKER}Round_{round_idx + 1}",
                description=f"{MOCK_MARKER}Round details",
                mode=event.format,
                state=(PdaEventRoundState.ACTIVE if round_idx == 0 else PdaEventRoundState.DRAFT),
                evaluation_criteria=DEFAULT_ROUND_CRITERIA,
                date=now_utc + timedelta(days=round_idx + 1),
                requires_submission=True,
                submission_mode="file_or_link",
                submission_deadline=now_utc + timedelta(days=round_idx + 2),
                allowed_mime_types=DEFAULT_ALLOWED_MIME_TYPES,
                max_file_size_mb=25,
                panel_mode_enabled=(round_idx == 0),
                panel_team_distribution_mode="team_count",
                panel_structure_locked=False,
            )
            db.add(round_row)
            db.flush()
            counts["event_rounds"] += 1
            round_rows.append(round_row)

            if round_idx == 0:
                panel = PersohubEventRoundPanel(
                    event_id=event.id,
                    round_id=round_row.id,
                    panel_no=1,
                    name=f"{MOCK_MARKER}Panel_1",
                    panel_link=f"https://meet.example/{event.slug}-round-{round_row.round_no}",
                    panel_time=now_utc + timedelta(days=1),
                    instructions=f"{MOCK_MARKER}Panel instructions",
                )
                db.add(panel)
                db.flush()
                counts["event_round_panels"] += 1
                panel_by_round[round_row.id] = panel
                db.add(
                    PersohubEventRoundPanelMember(
                        event_id=event.id,
                        round_id=round_row.id,
                        panel_id=panel.id,
                        admin_user_id=admin.id,
                    )
                )
                counts["event_round_panel_members"] += 1

        created_team_ids: List[int] = []
        created_user_ids: List[int] = []
        if is_team_event:
            team_count = max(1, min(3, len(participant_pool) // 2))
            for team_no in range(team_count):
                member_start = (team_no * 2) % len(participant_pool)
                members = participant_pool[member_start:member_start + 2]
                if len(members) < 2:
                    members = participant_pool[:2]
                team = PersohubEventTeam(
                    event_id=event.id,
                    team_code=f"T{team_no + 1:04d}",
                    team_name=f"{MOCK_MARKER}Team_{team_no + 1}",
                    team_lead_user_id=members[0].id,
                )
                db.add(team)
                db.flush()
                counts["event_teams"] += 1
                created_team_ids.append(team.id)

                for member_idx, member in enumerate(members):
                    db.add(
                        PersohubEventTeamMember(
                            team_id=team.id,
                            user_id=member.id,
                            role=("lead" if member_idx == 0 else "member"),
                        )
                    )
                    counts["event_team_members"] += 1

                db.add(
                    PersohubEventRegistration(
                        event_id=event.id,
                        team_id=team.id,
                        entity_type=PdaEventEntityType.TEAM,
                        status=PdaEventRegistrationStatus.ACTIVE,
                        referral_code=f"MPH{event.id:04d}{team_no + 1}",
                    )
                )
                counts["event_registrations"] += 1

                for round_row in round_rows:
                    score_value = float(65 + (team_no * 8) + round_row.round_no)
                    db.add(
                        PersohubEventAttendance(
                            event_id=event.id,
                            round_id=round_row.id,
                            entity_type=PdaEventEntityType.TEAM,
                            team_id=team.id,
                            is_present=True,
                            marked_by_user_id=admin.id,
                        )
                    )
                    counts["event_attendance"] += 1
                    db.add(
                        PersohubEventScore(
                            event_id=event.id,
                            round_id=round_row.id,
                            entity_type=PdaEventEntityType.TEAM,
                            team_id=team.id,
                            criteria_scores=[{"name": "Score", "max_marks": 100, "score": score_value}],
                            total_score=score_value,
                            normalized_score=score_value,
                            is_present=True,
                        )
                    )
                    counts["event_scores"] += 1
                    panel = panel_by_round.get(round_row.id)
                    if panel:
                        db.add(
                            PersohubEventRoundPanelAssignment(
                                event_id=event.id,
                                round_id=round_row.id,
                                panel_id=panel.id,
                                entity_type=PdaEventEntityType.TEAM,
                                team_id=team.id,
                                assigned_by_user_id=admin.id,
                            )
                        )
                        counts["event_round_panel_assignments"] += 1
                    db.add(
                        PersohubEventRoundSubmission(
                            event_id=event.id,
                            round_id=round_row.id,
                            entity_type=PdaEventEntityType.TEAM,
                            team_id=team.id,
                            submission_type="link",
                            link_url=f"https://example.com/{event.slug}/team/{team.id}",
                            notes=f"{MOCK_MARKER}Team submission",
                            updated_by_user_id=admin.id,
                        )
                    )
                    counts["event_round_submissions"] += 1

            if created_team_ids:
                db.add(
                    PersohubEventBadge(
                        event_id=event.id,
                        title=f"{MOCK_MARKER}Winner",
                        place=PdaEventBadgePlace.WINNER,
                        score=95.0,
                        team_id=created_team_ids[0],
                    )
                )
                counts["event_badges"] += 1
                if len(created_team_ids) > 1:
                    db.add(
                        PersohubEventBadge(
                            event_id=event.id,
                            title=f"{MOCK_MARKER}Runner",
                            place=PdaEventBadgePlace.RUNNER,
                            score=90.0,
                            team_id=created_team_ids[1],
                        )
                    )
                    counts["event_badges"] += 1
                invite_user = participant_pool[-1]
                db.add(
                    PersohubEventInvite(
                        event_id=event.id,
                        team_id=created_team_ids[0],
                        invited_user_id=invite_user.id,
                        invited_by_user_id=admin.id,
                        status=PdaEventInviteStatus.PENDING,
                    )
                )
                counts["event_invites"] += 1
        else:
            entrants = participant_pool[: max(1, min(6, len(participant_pool)))]
            for user_idx, user in enumerate(entrants):
                created_user_ids.append(user.id)
                db.add(
                    PersohubEventRegistration(
                        event_id=event.id,
                        user_id=user.id,
                        entity_type=PdaEventEntityType.USER,
                        status=PdaEventRegistrationStatus.ACTIVE,
                        referral_code=f"MPU{event.id:04d}{user_idx + 1}",
                    )
                )
                counts["event_registrations"] += 1
                for round_row in round_rows:
                    score_value = float(60 + (user_idx * 5) + round_row.round_no)
                    db.add(
                        PersohubEventAttendance(
                            event_id=event.id,
                            round_id=round_row.id,
                            entity_type=PdaEventEntityType.USER,
                            user_id=user.id,
                            is_present=True,
                            marked_by_user_id=admin.id,
                        )
                    )
                    counts["event_attendance"] += 1
                    db.add(
                        PersohubEventScore(
                            event_id=event.id,
                            round_id=round_row.id,
                            entity_type=PdaEventEntityType.USER,
                            user_id=user.id,
                            criteria_scores=[{"name": "Score", "max_marks": 100, "score": score_value}],
                            total_score=score_value,
                            normalized_score=score_value,
                            is_present=True,
                        )
                    )
                    counts["event_scores"] += 1
                    panel = panel_by_round.get(round_row.id)
                    if panel:
                        db.add(
                            PersohubEventRoundPanelAssignment(
                                event_id=event.id,
                                round_id=round_row.id,
                                panel_id=panel.id,
                                entity_type=PdaEventEntityType.USER,
                                user_id=user.id,
                                assigned_by_user_id=admin.id,
                            )
                        )
                        counts["event_round_panel_assignments"] += 1
                    db.add(
                        PersohubEventRoundSubmission(
                            event_id=event.id,
                            round_id=round_row.id,
                            entity_type=PdaEventEntityType.USER,
                            user_id=user.id,
                            submission_type="link",
                            link_url=f"https://example.com/{event.slug}/user/{user.id}",
                            notes=f"{MOCK_MARKER}User submission",
                            updated_by_user_id=admin.id,
                        )
                    )
                    counts["event_round_submissions"] += 1

            if created_user_ids:
                db.add(
                    PersohubEventBadge(
                        event_id=event.id,
                        title=f"{MOCK_MARKER}Winner",
                        place=PdaEventBadgePlace.WINNER,
                        score=94.0,
                        user_id=created_user_ids[0],
                    )
                )
                counts["event_badges"] += 1
                if len(created_user_ids) > 1:
                    db.add(
                        PersohubEventBadge(
                            event_id=event.id,
                            title=f"{MOCK_MARKER}Runner",
                            place=PdaEventBadgePlace.RUNNER,
                            score=90.0,
                            user_id=created_user_ids[1],
                        )
                    )
                    counts["event_badges"] += 1

        db.add(
            PersohubEventLog(
                event_id=event.id,
                event_slug=event.slug,
                admin_id=admin.id,
                admin_register_number=str(admin.regno or ""),
                admin_name=str(admin.name or community.name),
                action="mock_seed_persohub_event",
                method="SEED",
                path="/seed/persohub/mock",
                meta={"marker": MOCK_MARKER, "community_profile": community.profile_id},
            )
        )
        counts["event_logs"] += 1


def seed_mock_data(
    *,
    communities: int,
    posts_per_community: int,
    events_per_community: int,
    users_limit: int,
    participants_per_event: int,
    create_users: int,
) -> Dict[str, int]:
    db = SessionLocal()
    counts = {
        "users": 0,
        "clubs": 0,
        "communities": 0,
        "follows": 0,
        "posts": 0,
        "attachments": 0,
        "likes": 0,
        "comments": 0,
        "hashtags_linked": 0,
        "mentions": 0,
        "sympos": 0,
        "sympo_events": 0,
        "events": 0,
        "event_rounds": 0,
        "event_round_panels": 0,
        "event_round_panel_members": 0,
        "event_round_panel_assignments": 0,
        "event_round_submissions": 0,
        "event_teams": 0,
        "event_team_members": 0,
        "event_registrations": 0,
        "event_attendance": 0,
        "event_scores": 0,
        "event_badges": 0,
        "event_invites": 0,
        "event_logs": 0,
    }
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S%f")
    community_handles = ["designteam", "webteam", "pdaoffice", "events", "media", "ops"]
    file_mimes = ["image/jpeg", "video/mp4", "audio/mpeg", "application/pdf", "text/plain"]
    now_utc = datetime.now(timezone.utc)

    try:
        ensure_all_user_profile_names(db)
        created_users = _create_mock_users(db, count=create_users, stamp=stamp)
        counts["users"] = len(created_users)

        existing_users = _pick_users(db, users_limit)
        user_ids_seen = set()
        users: List[PdaUser] = []
        for row in created_users + existing_users:
            if row.id in user_ids_seen:
                continue
            users.append(row)
            user_ids_seen.add(row.id)
            if len(users) >= users_limit:
                break
        if not users:
            raise RuntimeError("No users found. Seed at least one user before seeding Persohub mock data.")

        club = PersohubClub(
            name=f"{MOCK_MARKER}Club_{stamp}",
            profile_id=f"mockph-club-{stamp[-8:]}",
            club_url="https://pda.mitindia.edu/mock",
            club_logo_url=f"https://placehold.co/400x400?text={MOCK_MARKER}CLUB",
            club_tagline=f"{MOCK_MARKER}Club tagline",
            club_description=f"{MOCK_MARKER}Generated club for persohub mock seeding",
        )
        db.add(club)
        db.flush()
        counts["clubs"] += 1

        sympo = PersohubSympo(
            name=f"{MOCK_MARKER}Sympo_{stamp[-8:]}",
            organising_club_id=club.id,
            content={"marker": MOCK_MARKER, "stamp": stamp},
        )
        db.add(sympo)
        db.flush()
        counts["sympos"] += 1

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
                hashed_password=get_password_hash("password"),
                logo_url=f"https://placehold.co/300x300?text={profile_id}",
                description=f"{MOCK_MARKER}Generated community for Persohub testing",
                is_active=True,
                is_root=(idx == 0),
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

            _seed_event_bundle(
                db,
                counts=counts,
                community=community,
                admin=admin,
                users=users,
                sympo=sympo,
                events_per_community=events_per_community,
                participants_per_event=participants_per_event,
                now_utc=now_utc,
                stamp=stamp,
            )

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
    parser.add_argument("--events-per-community", type=int, default=2, help="Events per mock community")
    parser.add_argument("--users-limit", type=int, default=8, help="Max users reused for follows/likes/comments/events")
    parser.add_argument("--participants-per-event", type=int, default=6, help="Max participants linked per mock event")
    parser.add_argument("--create-users", type=int, default=0, help="Create additional mock users before seeding")
    args = parser.parse_args()

    counts = seed_mock_data(
        communities=max(1, min(50, args.communities)),
        posts_per_community=max(1, min(5000, args.posts_per_community)),
        events_per_community=max(0, min(100, args.events_per_community)),
        users_limit=max(1, min(200, args.users_limit)),
        participants_per_event=max(1, min(100, args.participants_per_event)),
        create_users=max(0, min(500, args.create_users)),
    )
    print("Persohub mock seed summary")
    for key, value in counts.items():
        print(f"- {key}: {value}")
    if counts.get("users"):
        print("- mock user password: password")
    print("- mock community password: password")
    print("Cleanup with: python backend/scripts/cleanup_persohub_mock_data.py")
    if counts.get("users"):
        print("To also remove created MOCKPH users: python backend/scripts/cleanup_persohub_mock_data.py --include-users")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
