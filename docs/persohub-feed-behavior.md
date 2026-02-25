# Persohub Feed Behavior (Current Implementation)

This document explains how communities, posts, featured posts, likes, comments, hashtags, mentions, and followers are currently handled in code.

## Communities: how they are shown and ordered

Source:
- `GET /api/persohub/communities` in `backend/routers/persohub_public.py`

Order rules:
1. Communities followed by the logged-in user are shown first.
2. Inside each bucket, communities are ordered by `club_id` ascending (`NULL` club last).
3. Tie-breaker is community name (case-insensitive ascending).

Extra behavior:
- `is_following` is computed per user from `persohub_community_follows`.
- Community card includes club data (`club_name`, `club_logo_url`, `club_tagline`, `club_description`, `club_url`) via `build_community_card(s)` in `backend/routers/persohub_shared.py`.
- Frontend community column supports local search by community name, handle, and club name (`CommunityListPanel` in `frontend/src/pages/persohub/components.js`).

## Feed posts: how they are shown and ordered

Source:
- `GET /api/persohub/feed` in `backend/routers/persohub_public.py`

Visibility rule:
- Feed only shows posts with `is_hidden == 1`.

Order rules:
- If user is logged in and follows at least one community:
  1. Posts from followed communities first, ordered by `created_at DESC, id DESC`.
  2. Then posts from other communities, ordered by `like_count DESC, created_at DESC, id DESC`.
- If user has no follows (or is logged out):
  - All visible posts ordered by `like_count DESC, created_at DESC, id DESC`.

Pagination:
- Cursor is offset-based (`cursor` is numeric offset string).
- Response includes `next_cursor` and `has_more`.

## Featured posts: how they are shown and ordered

Source:
- `featuredPosts` in `frontend/src/pages/persohub/PersohubFeedPage.js`
- `FeaturedRail` in `frontend/src/pages/persohub/components.js`

Rules:
1. Frontend sorts currently loaded `posts` by `like_count DESC`.
2. Takes top 6 into `featuredPosts`.
3. `FeaturedRail` renders top 5 from that input.

Important note:
- Featured is computed from the posts currently loaded in client state, not from a separate backend featured endpoint.

## Likes: how handled

Source:
- `POST /api/persohub/posts/{slug_token}/like-toggle` in `backend/routers/persohub_public.py`

Rules:
- Toggling like creates/deletes a row in `persohub_post_likes` for `(post_id, user_id)`.
- After toggle, `refresh_post_counts()` recalculates `like_count` and `comment_count` and stores in `persohub_posts`.
- Response returns updated post payload including `is_liked` for current user.

## Comments: how handled

Source:
- `GET /api/persohub/posts/{slug_token}/comments`
- `POST /api/persohub/posts/{slug_token}/comments`
- both in `backend/routers/persohub_public.py`

Rules:
- Create comment inserts into `persohub_post_comments`.
- Counts are recomputed using `refresh_post_counts()`.
- Comment list is paginated (offset cursor), ordered by `created_at DESC, id DESC`.

## Hashtags: how handled

Extraction and storage:
- Hashtags are extracted from post description on backend (`extract_hashtags()` in `backend/persohub_service.py`).
- `sync_post_tags_and_mentions()` in `backend/routers/persohub_shared.py`:
  - Adds/removes `persohub_post_hashtags` links.
  - Maintains aggregate count in `persohub_hashtags.count`.

Search/filter behavior:
- `GET /api/persohub/hashtags/{hashtag}/posts` returns visible posts for that hashtag.
- Feed search bar supports `#tag`; clicking hashtag in post sets/uses this filter.

Rendering/clickability:
- `ParsedDescription` makes hashtags clickable.
- In feed, hashtag click routes to hashtag-filtered feed.

## Mentions: how handled

Input capture:
- Frontend extracts inline mentions from description using regex `@([a-z0-9_]+)` in:
  - `PersohubFeedPage.js`
  - `PersohubProfilePage.js`
- Extracted handles are sent as `mentions` in create/update payload.

Persistence:
- Backend `sync_post_tags_and_mentions()` maps valid profile handles to users and stores rows in `persohub_post_mentions`.
- Invalid handles are ignored (no error, just no mention row).

Rendering/clickability:
- `ParsedDescription` renders `@handle` as clickable link to `/persohub/{handle}`.

## Followers: how handled

Follow/unfollow:
- `POST /api/persohub/communities/{profile_id}/follow-toggle` in `backend/routers/persohub_public.py` toggles row in `persohub_community_follows`.

Follower count:
- Community public profile computes `follower_count` using `COUNT(*)` on `persohub_community_follows`.

Defaults:
- On setup, helper functions in `backend/persohub_service.py` can auto-follow default communities for users.

## Related profile post behavior

- `GET /api/persohub/profile/{profile_name}` also supports cursor pagination for profile posts (`limit`, `cursor`).
- Response carries `posts`, `posts_next_cursor`, `posts_has_more`.
- Community profile post visibility:
  - viewers: only `is_hidden == 1`
  - community editor view: can include hidden posts for moderation.
