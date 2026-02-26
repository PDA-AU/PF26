import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    CalendarDays,
    ChevronLeft,
    ChevronRight,
    LogIn,
    MessageCircle,
    Heart,
    Newspaper,
    Share2,
    Pencil,
    Trash2,
    UserRound,
    Users,
    X,
    Eye,
    EyeOff,
    ExternalLink,
    MoreVertical,
} from 'lucide-react';
import { toast } from 'sonner';
import ParsedDescription from '@/components/common/ParsedDescription';

export const formatRelativeTime = (value) => {
    if (!value) return '';
    const date = new Date(value);
    const diffMs = Date.now() - date.getTime();
    const sec = Math.floor(diffMs / 1000);
    if (sec < 60) return `${sec}s`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m`;
    const hours = Math.floor(min / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d`;
    return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
};

const PdfAttachmentPreview = ({ pdfUrl, previewImageUrls = [] }) => {
    const pages = previewImageUrls || [];
    const [pageIndex, setPageIndex] = useState(0);

    useEffect(() => {
        setPageIndex(0);
    }, [pdfUrl]);

    const pagesCount = pages.length;
    if (!pagesCount) {
        return (
            <div className="ph-attachment-slide ph-pdf-fallback">
                <p className="ph-muted" style={{ marginBottom: '0.6rem' }}>PDF preview unavailable.</p>
                <a href={pdfUrl} target="_blank" rel="noreferrer" className="ph-btn ph-btn-accent">Open PDF</a>
            </div>
        );
    }

    const visible = pages[Math.min(pageIndex, pagesCount - 1)];
    const goPrevPage = () => setPageIndex((prev) => (prev - 1 + pagesCount) % pagesCount);
    const goNextPage = () => setPageIndex((prev) => (prev + 1) % pagesCount);

    return (
        <div className="ph-pdf-preview">
            <div className="ph-pdf-canvas">
                <img src={visible} alt={`PDF page ${pageIndex + 1}`} className="ph-attachment-slide" loading="lazy" />
                {pagesCount > 1 ? (
                    <>
                        <button type="button" className="ph-slide-btn ph-slide-btn-left" onClick={goPrevPage}>
                            <ChevronLeft size={18} />
                        </button>
                        <button type="button" className="ph-slide-btn ph-slide-btn-right" onClick={goNextPage}>
                            <ChevronRight size={18} />
                        </button>
                    </>
                ) : null}
            </div>
            <div className="ph-pdf-meta">
                <span>PDF page {pageIndex + 1}/{pagesCount}</span>
                <a href={pdfUrl} target="_blank" rel="noreferrer">Open PDF</a>
            </div>
        </div>
    );
};

export const SearchSuggestionList = ({ open, items, onSelect }) => {
    if (!open || !items?.length) return null;
    return (
        <div className="ph-suggest">
            {items.map((item, idx) => (
                <button
                    key={`${item.result_type}-${item.profile_name}-${idx}`}
                    type="button"
                    className="ph-suggest-item"
                    data-testid={`ph-search-suggestion-${idx}`}
                    onClick={() => onSelect(item)}
                >
                    <span>{item.label}</span>
                    <span className="ph-muted">{item.meta || item.result_type}</span>
                </button>
            ))}
        </div>
    );
};

export const PersohubHeader = ({ subtitle = '', leftSlot = null }) => {
    return (
        <header className="ph-header ph-section ph-span-all">
            {leftSlot ? <div className="ph-header-left-control">{leftSlot}</div> : null}
            <div className="ph-title-band">
                <h1 className="ph-title">
                    <span >PERSOHUB</span>

                </h1>
            </div>
            {subtitle ? <p className="ph-sub">{subtitle}</p> : null}
        </header>
    );
};

export const PersohubMobileNav = ({
    visible = true,
    activeTab = 'event',
    isUserLoggedIn = false,
    onCommunities,
    onEventFeed,
    onCommunityFeed,
    onAccount,
    ariaLabel = 'Persohub mobile navigation',
}) => {
    if (!visible) return null;

    return (
        <nav className="ph-mobile-bottom-nav" aria-label={ariaLabel}>
            <div className="ph-mobile-nav-icon-row">
                <button
                    type="button"
                    aria-label="Communities"
                    title="Communities"
                    className={`ph-mobile-tab-btn ${activeTab === 'communities' ? 'is-active' : ''}`}
                    onClick={onCommunities}
                    data-testid="ph-mobile-tab-communities"
                >
                    <Users size={17} />
                </button>
                <button
                    type="button"
                    aria-label="Event feed"
                    title="Event feed"
                    className={`ph-mobile-tab-btn ${activeTab === 'event' ? 'is-active' : ''}`}
                    onClick={onEventFeed}
                    data-testid="ph-mobile-tab-event"
                >
                    <CalendarDays size={17} />
                </button>
                <button
                    type="button"
                    aria-label="Community feed"
                    title="Community feed"
                    className={`ph-mobile-tab-btn ${activeTab === 'community' ? 'is-active' : ''}`}
                    onClick={onCommunityFeed}
                    data-testid="ph-mobile-tab-community"
                >
                    <Newspaper size={17} />
                </button>
                <button
                    type="button"
                    aria-label={isUserLoggedIn ? 'Public profile' : 'Account login'}
                    title={isUserLoggedIn ? 'Public profile' : 'Account login'}
                    className={`ph-mobile-tab-btn ${activeTab === 'account' ? 'is-active' : ''}`}
                    onClick={onAccount}
                    data-testid="ph-mobile-tab-account"
                >
                    {isUserLoggedIn ? <UserRound size={17} /> : <LogIn size={17} />}
                </button>
            </div>
        </nav>
    );
};

export const AttachmentCarousel = ({ attachments }) => {
    const inputAttachments = attachments || [];
    const hasImageAttachment = inputAttachments.some((entry) => entry?.attachment_kind === 'image');
    const audioAttachments = inputAttachments.filter((entry) => entry?.attachment_kind === 'audio');
    const shouldUseImageAsAudioCover = hasImageAttachment && audioAttachments.length > 0;
    const visibleAttachments = shouldUseImageAsAudioCover
        ? inputAttachments.filter((entry) => entry?.attachment_kind !== 'audio')
        : inputAttachments;

    const [index, setIndex] = useState(0);
    const total = visibleAttachments.length || 0;
    const item = total ? visibleAttachments[index] : null;

    useEffect(() => {
        if (index < total) return;
        setIndex(0);
    }, [index, total]);

    if (!item) return null;

    const audioCoverUrl = shouldUseImageAsAudioCover
        ? (visibleAttachments.find((entry) => entry?.attachment_kind === 'image')?.s3_url || '')
        : '';

    const goPrev = () => setIndex((prev) => (prev - 1 + total) % total);
    const goNext = () => setIndex((prev) => (prev + 1) % total);

    const renderAttachment = () => {
        if (item.attachment_kind === 'image') {
            return <img src={item.s3_url} alt="post attachment" className="ph-attachment-slide" loading="lazy" />;
        }
        if (item.attachment_kind === 'video') {
            return <video src={item.s3_url} className="ph-attachment-slide" controls preload="metadata" />;
        }
        if (item.attachment_kind === 'audio') {
            return (
                <div className="ph-attachment-slide" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff' }}>
                    <audio src={item.s3_url} controls preload="none" style={{ width: '90%' }} />
                </div>
            );
        }
        if (item.attachment_kind === 'pdf') {
            return <PdfAttachmentPreview pdfUrl={item.s3_url} previewImageUrls={item.preview_image_urls || []} />;
        }
        return (
            <div className="ph-attachment-slide" style={{ background: '#fff', color: '#000', padding: '1rem' }}>
                <p className="ph-muted">Attachment</p>
                <a href={item.s3_url} target="_blank" rel="noreferrer" className="ph-btn">Open File</a>
            </div>
        );
    };

    return (
        <div className="ph-attachment" data-testid="ph-attachment-carousel">
            {renderAttachment()}
            {total > 1 ? (
                <>
                    <button type="button" className="ph-slide-btn ph-slide-btn-left" onClick={goPrev} data-testid="ph-attachment-prev">
                        <ChevronLeft size={18} />
                    </button>
                    <button type="button" className="ph-slide-btn ph-slide-btn-right" onClick={goNext} data-testid="ph-attachment-next">
                        <ChevronRight size={18} />
                    </button>
                    <div className="ph-dots">
                        {visibleAttachments.map((_, idx) => (
                            <button
                                key={idx}
                                type="button"
                                className={`ph-dot ${idx === index ? 'ph-dot-active' : ''}`}
                                onClick={() => setIndex(idx)}
                                aria-label={`Attachment ${idx + 1}`}
                            />
                        ))}
                    </div>
                </>
            ) : null}

            {shouldUseImageAsAudioCover ? (
                <div
                    className="ph-audio-cover-player"
                    style={{
                        marginTop: '0.45rem',
                        borderRadius: '12px',
                        border: '1px solid rgba(0,0,0,0.08)',
                        background: '#fff',
                        padding: '0.55rem 0.65rem',
                    }}
                >
                    {audioAttachments.map((audioItem, audioIdx) => (
                        <div key={`${audioItem?.id || audioItem?.s3_url || audioIdx}`} style={{ marginBottom: audioIdx < audioAttachments.length - 1 ? '0.4rem' : 0 }}>
                            <audio
                                src={audioItem?.s3_url}
                                controls
                                preload="metadata"
                                style={{ width: '100%' }}
                            />
                        </div>
                    ))}
                </div>
            ) : null}
        </div>
    );
};

export const PostCard = ({
    post,
    onLike,
    likePending = false,
    onShare,
    onHashtagClick,
    isUserLoggedIn,
    fetchComments,
    createComment,
    allowModeration,
    onDelete,
    onEdit,
    onHide,
    hidePending = false,
    onExplore,
    compactEventMobile = false,
}) => {
    const READ_MORE_PREVIEW_LIMIT = 800;
    const fallbackLogo = 'https://placehold.co/64x64?text=PDA';
    const [communityAvatarSrc, setCommunityAvatarSrc] = useState(
        post?.community?.logo_url || post?.community?.club_logo_url || fallbackLogo,
    );
    const [expanded, setExpanded] = useState(false);
    const [commentsOpen, setCommentsOpen] = useState(false);
    const [comments, setComments] = useState([]);
    const [commentsLoading, setCommentsLoading] = useState(false);
    const [commentsLoadingMore, setCommentsLoadingMore] = useState(false);
    const [commentsCursor, setCommentsCursor] = useState(null);
    const [commentsHasMore, setCommentsHasMore] = useState(false);
    const [commentText, setCommentText] = useState('');
    const [commentSubmitting, setCommentSubmitting] = useState(false);
    const [moderationMenuOpen, setModerationMenuOpen] = useState(false);
    const [isMobileViewport, setIsMobileViewport] = useState(() => (
        typeof window !== 'undefined' ? window.matchMedia('(max-width: 1023px)').matches : false
    ));

    useEffect(() => {
        setCommunityAvatarSrc(post?.community?.logo_url || post?.community?.club_logo_url || fallbackLogo);
    }, [post?.community?.logo_url, post?.community?.club_logo_url]);

    useEffect(() => {
        if (typeof window === 'undefined') return undefined;
        const media = window.matchMedia('(max-width: 1023px)');
        const handleViewportChange = (event) => {
            setIsMobileViewport(Boolean(event.matches));
        };
        setIsMobileViewport(Boolean(media.matches));
        if (typeof media.addEventListener === 'function') {
            media.addEventListener('change', handleViewportChange);
            return () => media.removeEventListener('change', handleViewportChange);
        }
        media.addListener(handleViewportChange);
        return () => media.removeListener(handleViewportChange);
    }, []);

    const showReadMore = (post.description || '').length > READ_MORE_PREVIEW_LIMIT;
    const visibleText = expanded || !showReadMore
        ? (post.description || '')
        : `${(post.description || '').slice(0, READ_MORE_PREVIEW_LIMIT)}...`;
    const isEventPost = String(post?.post_type || '').toLowerCase() === 'event';
    const hasPosterAttachment = (post?.attachments || []).some((item) => String(item?.attachment_kind || '').toLowerCase() === 'image');
    const shouldUseCompactEventMobile = Boolean(compactEventMobile && isEventPost && hasPosterAttachment);
    const allHashtags = Array.isArray(post?.hashtags)
        ? post.hashtags.map((value) => String(value || '').trim().toLowerCase()).filter(Boolean)
        : [];
    const slugifyTag = (value) => String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .replace(/-+/g, '-');
    const eventTagCandidates = Array.from(new Set([
        slugifyTag(post?.event?.title),
        slugifyTag(post?.event?.slug),
        String(post?.event?.slug || '').trim().toLowerCase(),
    ].filter(Boolean)));
    const matchedEventTag = eventTagCandidates.find((candidate) => allHashtags.includes(candidate)) || eventTagCandidates[0] || '';
    const sympoTag = allHashtags.find((tag) => tag && tag !== matchedEventTag) || '';
    const compactDescription = [matchedEventTag, sympoTag]
        .filter(Boolean)
        .map((tag) => `#${tag}`)
        .join(' ');
    const showInlineModeration = Boolean(allowModeration && !isMobileViewport);
    const showMobileModerationMenu = Boolean(allowModeration && isMobileViewport);
    const communityProfileId = String(post?.community?.profile_id || '').trim().toLowerCase();

    const loadComments = async ({ reset = false } = {}) => {
        if (!fetchComments) return;
        const targetCursor = reset ? null : commentsCursor;
        if (reset) {
            setCommentsLoading(true);
        } else {
            setCommentsLoadingMore(true);
        }
        try {
            const page = await fetchComments(post.slug_token, { cursor: targetCursor, limit: 20 });
            const nextItems = page?.items || [];
            setComments((prev) => (reset ? nextItems : [...prev, ...nextItems]));
            setCommentsCursor(page?.next_cursor || null);
            setCommentsHasMore(Boolean(page?.has_more));
        } finally {
            if (reset) {
                setCommentsLoading(false);
            } else {
                setCommentsLoadingMore(false);
            }
        }
    };

    const handleToggleComments = async () => {
        const next = !commentsOpen;
        setCommentsOpen(next);
        if (next && comments.length === 0) await loadComments({ reset: true });
    };

    const handleCommentSubmit = async (event) => {
        event.preventDefault();
        if (!commentText.trim() || !createComment) return;
        setCommentSubmitting(true);
        try {
            const created = await createComment(post.slug_token, commentText.trim());
            setComments((prev) => [created, ...prev]);
            setCommentText('');
        } catch (error) {
            const message = String(error?.message || 'Failed to post comment');
            toast.error(message);
        } finally {
            setCommentSubmitting(false);
        }
    };

    return (
        <article className="ph-card ph-post" data-testid={`ph-post-${post.slug_token}`}>
            <div className="ph-post-head">
                <div className="ph-post-head-left">
                    <img
                        src={communityAvatarSrc}
                        alt={post.community.name}
                        className="ph-avatar"
                        onError={() => {
                            if (communityAvatarSrc === (post?.community?.club_logo_url || fallbackLogo)) {
                                setCommunityAvatarSrc(fallbackLogo);
                                return;
                            }
                            setCommunityAvatarSrc(post?.community?.club_logo_url || fallbackLogo);
                        }}
                    />
                    <div>
                        <Link to={`/persohub/${post.community.profile_id}`} className="ph-community-name">
                            {post.community.name}
                        </Link>
                        <div className="ph-community-handle">@{communityProfileId || post.community.profile_id} · {formatRelativeTime(post.created_at)}</div>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                    {showInlineModeration && !isEventPost ? (
                        <button type="button" className="ph-action-btn" onClick={() => onEdit?.(post)} data-testid={`ph-post-edit-${post.slug_token}`}>
                            <Pencil size={14} />
                        </button>
                    ) : null}
                    {showInlineModeration && !isEventPost ? (
                        <button type="button" className="ph-action-btn" onClick={() => onDelete?.(post)} data-testid={`ph-post-delete-${post.slug_token}`}>
                            <Trash2 size={14} />
                        </button>
                    ) : null}
                    {showInlineModeration ? (
                        <button
                            type="button"
                            className="ph-action-btn"
                            onClick={() => onHide?.(post)}
                            data-testid={`ph-post-hide-${post.slug_token}`}
                            disabled={hidePending}
                            title={Number(post?.is_hidden || 0) === 1 ? 'Visible in feed (click to hide)' : 'Hidden from feed (click to unhide)'}
                        >
                            {Number(post?.is_hidden || 0) === 1 ? <Eye size={14} /> : <EyeOff size={14} />}
                        </button>
                    ) : null}
                    {showMobileModerationMenu ? (
                        <button
                            type="button"
                            className="ph-action-btn"
                            onClick={() => setModerationMenuOpen(true)}
                            data-testid={`ph-post-menu-${post.slug_token}`}
                            aria-label="Post actions"
                        >
                            <MoreVertical size={14} />
                        </button>
                    ) : null}
                </div>
            </div>

            <div className="ph-post-body">
                <AttachmentCarousel attachments={post.attachments} />

                <div className={`ph-desc ${shouldUseCompactEventMobile ? 'ph-desc-mobile-event-compact' : ''}`}>
                    <ParsedDescription
                        description={shouldUseCompactEventMobile ? compactDescription : visibleText}
                        onHashtagClick={onHashtagClick}
                    />
                    {!shouldUseCompactEventMobile && showReadMore ? (
                        <button type="button" className="ph-action-btn" onClick={() => setExpanded((prev) => !prev)}>
                            {expanded ? 'Show less' : 'Read more'}
                        </button>
                    ) : null}
                </div>

                <div className="ph-post-actions">
                    <button
                        type="button"
                        className="ph-action-btn ph-like-btn"
                        onClick={() => onLike?.(post.slug_token)}
                        disabled={!isUserLoggedIn || likePending}
                        aria-busy={likePending}
                        data-testid={`ph-like-${post.slug_token}`}
                    >
                        <Heart size={14} className={`ph-like-heart ${post.is_liked ? 'ph-like-heart-on' : ''}`} /> {post.like_count}
                    </button>
                    <button type="button" className="ph-action-btn" onClick={handleToggleComments} data-testid={`ph-comments-toggle-${post.slug_token}`}>
                        <MessageCircle size={14} /> {post.comment_count}
                    </button>
                    <button type="button" className="ph-action-btn" onClick={() => onShare?.(post)} data-testid={`ph-share-${post.slug_token}`}>
                        <Share2 size={14} /> Share
                    </button>
                    {isEventPost && post?.event?.slug ? (
                        <button type="button" className="ph-action-btn ph-btn-accent" onClick={() => onExplore?.(post)} data-testid={`ph-explore-${post.slug_token}`}>
                            <ExternalLink size={14} /> Explore
                        </button>
                    ) : null}
                </div>

                {commentsOpen ? (
                    <div className="ph-comments" data-testid={`ph-comments-${post.slug_token}`}>
                        {isUserLoggedIn ? (
                            <form onSubmit={handleCommentSubmit} className="ph-comment-input-row">
                                <input
                                    className="ph-comment-input"
                                    value={commentText}
                                    onChange={(event) => setCommentText(event.target.value)}
                                    placeholder="Write a comment"
                                    data-testid={`ph-comment-input-${post.slug_token}`}
                                />
                                <button type="submit" className="ph-btn ph-btn-accent" disabled={commentSubmitting}>
                                    {commentSubmitting ? 'Posting...' : 'Post'}
                                </button>
                            </form>
                        ) : (
                            <p className="ph-muted">Login as PDA user to comment.</p>
                        )}

                        {commentsLoading ? <p className="ph-muted">Loading comments...</p> : null}
                        {!commentsLoading && comments.length === 0 ? <p className="ph-muted">No comments yet</p> : null}
                        {comments.map((comment) => (
                            <div key={comment.id} className="ph-comment">
                                {comment.profile_name ? (
                                    <Link to={`/persohub/${comment.profile_name}`} style={{ fontWeight: 700, fontSize: '0.83rem', textDecoration: 'none', color: 'inherit' }}>
                                        @{comment.profile_name}
                                    </Link>
                                ) : (
                                    <div style={{ fontWeight: 700, fontSize: '0.83rem' }}>
                                        @user
                                    </div>
                                )}
                                <div style={{ fontSize: '0.88rem' }}>{comment.comment_text}</div>
                            </div>
                        ))}
                        {!commentsLoading && commentsHasMore ? (
                            <button
                                type="button"
                                className="ph-btn"
                                onClick={() => loadComments({ reset: false })}
                                disabled={commentsLoadingMore}
                            >
                                {commentsLoadingMore ? 'Loading...' : 'Load more comments'}
                            </button>
                        ) : null}
                    </div>
                ) : null}
            </div>

            {showMobileModerationMenu && moderationMenuOpen ? (
                <div className="ph-modal-overlay" role="dialog" aria-modal="true">
                    <div className="ph-modal" style={{ width: 'min(420px, 92vw)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                            <h2 style={{ marginTop: 0, marginBottom: 0 }}>Post Actions</h2>
                            <button type="button" className="ph-action-btn" onClick={() => setModerationMenuOpen(false)}>
                                <X size={14} />
                            </button>
                        </div>
                        <div style={{ display: 'grid', gap: '0.45rem' }}>
                            {!isEventPost ? (
                                <button
                                    type="button"
                                    className="ph-btn"
                                    onClick={() => {
                                        setModerationMenuOpen(false);
                                        onEdit?.(post);
                                    }}
                                    data-testid={`ph-post-edit-${post.slug_token}`}
                                >
                                    <Pencil size={14} /> Edit
                                </button>
                            ) : null}
                            {!isEventPost ? (
                                <button
                                    type="button"
                                    className="ph-btn ph-btn-danger"
                                    onClick={() => {
                                        setModerationMenuOpen(false);
                                        onDelete?.(post);
                                    }}
                                    data-testid={`ph-post-delete-${post.slug_token}`}
                                >
                                    <Trash2 size={14} /> Delete
                                </button>
                            ) : null}
                            <button
                                type="button"
                                className="ph-btn"
                                onClick={() => {
                                    setModerationMenuOpen(false);
                                    onHide?.(post);
                                }}
                                data-testid={`ph-post-hide-${post.slug_token}`}
                                disabled={hidePending}
                            >
                                {Number(post?.is_hidden || 0) === 1 ? <Eye size={14} /> : <EyeOff size={14} />}
                                {Number(post?.is_hidden || 0) === 1 ? 'Hide' : 'Unhide'}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </article>
    );
};

export const CommunityListPanel = ({ communities, onToggleFollow, isLoggedIn }) => {
    const [query, setQuery] = useState('');
    const normalized = String(query || '').trim().toLowerCase();
    const filteredCommunities = normalized
        ? (communities || []).filter((item) => {
            const name = String(item?.name || '').toLowerCase();
            const handle = String(item?.profile_id || '').toLowerCase();
            const club = String(item?.club_name || '').toLowerCase();
            return name.includes(normalized) || handle.includes(normalized) || club.includes(normalized);
        })
        : (communities || []);

    return (
        <section className="ph-card ph-side-card" data-testid="ph-community-panel">
            <h3 style={{ marginTop: 0, marginBottom: '0.7rem' }}>Communities</h3>
            <input
                className="ph-input"
                placeholder="Search communities..."
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                style={{ marginBottom: '0.6rem' }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                {filteredCommunities.map((item) => (
                    <div key={item.id} className="ph-community-item" style={{ borderRadius: '12px', padding: '0.55rem', background: '#fff', boxShadow: 'inset 0 0 0 1px rgba(96,74,134,0.18)' }}>
                        <Link to={`/persohub/${item.profile_id}`} className="ph-community-link" style={{ fontWeight: 800 }}>{item.name}</Link>
                        <div className="ph-muted ph-community-meta">@{item.profile_id} {item.club_name ? `· ${item.club_name}` : ''}</div>
                        <button
                            type="button"
                            className={`ph-action-btn ${item.is_following ? 'ph-btn-accent' : ''}`.trim()}
                            disabled={!isLoggedIn}
                            onClick={() => onToggleFollow?.(item.profile_id)}
                            style={{ marginTop: '0.35rem' }}
                            data-testid={`ph-follow-${item.profile_id}`}
                        >
                            {item.is_following ? 'Following' : 'Follow'}
                        </button>
                    </div>
                ))}
                {filteredCommunities.length === 0 ? (
                    <p className="ph-muted" style={{ margin: 0 }}>No communities found.</p>
                ) : null}
            </div>
        </section>
    );
};

export const FeaturedRail = ({ posts }) => {
    const featured = posts.slice(0, 5);
    return (
        <section className="ph-card ph-side-card" data-testid="ph-featured-rail">
            <h3 style={{ marginTop: 0, marginBottom: '0.75rem' }}>Featured</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                {featured.map((post) => (
                    <Link key={post.slug_token} to={`/persohub/p/${post.slug_token}`} style={{ textDecoration: 'none', color: '#000' }}>
                        <div style={{ borderRadius: '12px', background: '#f5e9ff', padding: '0.55rem', boxShadow: 'inset 0 0 0 1px rgba(96,74,134,0.2)' }}>
                            <div style={{ fontSize: '0.7rem' }}>@{post.community.profile_id}</div>
                            <div className="ph-muted">{(post.description || '').slice(0, 42) || 'Post update'}</div>
                            <div className="ph-muted">{post.like_count} likes · {post.comment_count} comments</div>
                        </div>
                    </Link>
                ))}
            </div>
        </section>
    );
};

export const EmptyState = ({ title, subtitle }) => (
    <div className="ph-card ph-side-card" data-testid="ph-empty-state">
        <h3 style={{ marginTop: 0 }}>{title}</h3>
        <p style={{ marginBottom: 0 }}>{subtitle}</p>
    </div>
);

export const ConfirmModal = ({
    open,
    title = 'Confirm Action',
    message = 'Are you sure?',
    confirmLabel = 'Confirm',
    pendingLabel = 'Processing...',
    cancelLabel = 'Cancel',
    confirmClassName = 'ph-btn ph-btn-danger',
    onConfirm,
    onCancel,
    pending = false,
}) => {
    if (!open) return null;
    return (
        <div className="ph-modal-overlay" role="dialog" aria-modal="true">
            <div className="ph-modal" style={{ width: 'min(520px, 95vw)' }}>
                <h2 style={{ marginTop: 0, marginBottom: '0.45rem' }}>{title}</h2>
                <p style={{ marginTop: 0, marginBottom: '0.9rem' }}>{message}</p>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                    <button type="button" className="ph-btn" onClick={onCancel} disabled={pending}>
                        {cancelLabel}
                    </button>
                    <button type="button" className={confirmClassName} onClick={onConfirm} disabled={pending}>
                        {pending ? pendingLabel : confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
};

const fileNameFromUrl = (url) => {
    try {
        const clean = String(url || '').split('?')[0];
        const parts = clean.split('/');
        return parts[parts.length - 1] || 'attachment';
    } catch {
        return 'attachment';
    }
};

export const CommunityPostEditModal = ({ open, post, onClose, onSubmit, submitting }) => {
    const MAX_POST_DESCRIPTION_LENGTH = 8000;
    const [description, setDescription] = useState('');
    const [existingAttachments, setExistingAttachments] = useState([]);
    const [newFiles, setNewFiles] = useState([]);

    useEffect(() => {
        if (!open || !post) return;
        setDescription(post.description || '');
        setExistingAttachments(post.attachments || []);
        setNewFiles([]);
    }, [open, post]);

    if (!open || !post) return null;

    return (
        <div className="ph-modal-overlay" role="dialog" aria-modal="true">
            <div className="ph-modal">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2 style={{ marginTop: 0 }}>Edit Post</h2>
                    <button type="button" className="ph-action-btn" onClick={onClose}>
                        <X size={16} />
                    </button>
                </div>
                <form
                    onSubmit={(event) => {
                        event.preventDefault();
                        onSubmit?.({
                            description: description.trim().slice(0, MAX_POST_DESCRIPTION_LENGTH),
                            existingAttachments,
                            newFiles,
                        });
                    }}
                >
                    <label className="ph-muted" htmlFor="ph-edit-post-description">Description</label>
                    <textarea
                        id="ph-edit-post-description"
                        className="ph-textarea"
                        value={description}
                        onChange={(event) => setDescription(event.target.value)}
                        placeholder="Use #hashtags and @profile mentions"
                    />

                    <p className="ph-muted" style={{ marginBottom: '0.3rem' }}>Existing attachments</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.7rem' }}>
                        {existingAttachments.length === 0 ? <span className="ph-muted">No existing attachments</span> : null}
                        {existingAttachments.map((item) => (
                            <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'center' }}>
                                <a href={item.s3_url} target="_blank" rel="noreferrer" className="ph-muted">
                                    {fileNameFromUrl(item.s3_url)}
                                </a>
                                <button
                                    type="button"
                                    className="ph-action-btn"
                                    onClick={() => setExistingAttachments((prev) => prev.filter((row) => row.id !== item.id))}
                                >
                                    Remove
                                </button>
                            </div>
                        ))}
                    </div>

                    <label className="ph-muted" htmlFor="ph-edit-post-files">Add new attachments</label>
                    <input
                        id="ph-edit-post-files"
                        className="ph-input"
                        type="file"
                        multiple
                        onChange={(event) => setNewFiles(Array.from(event.target.files || []))}
                    />

                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                        <button type="button" className="ph-btn" onClick={onClose}>Cancel</button>
                        <button type="submit" className="ph-btn ph-btn-primary" disabled={submitting}>
                            {submitting ? 'Saving...' : 'Save Changes'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
