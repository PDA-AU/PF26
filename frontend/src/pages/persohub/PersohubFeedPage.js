import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { MessageCircle, Plus, X } from 'lucide-react';
import { toast } from 'sonner';

import { useAuth } from '@/context/AuthContext';
import { usePersohubActor } from '@/context/PersohubActorContext';
import PdaHeader from '@/components/layout/PdaHeader';
import { compressImageToWebp } from '@/utils/imageCompression';
import { copyTextToClipboard } from '@/utils/clipboard';
import { persohubApi } from '@/pages/persohub/api';
import {
    CommunityPostEditModal,
    CommunityListPanel,
    ConfirmModal,
    EmptyState,
    PostCard,
    SearchSuggestionList,
} from '@/pages/persohub/components';
import '@/pages/persohub/persohub.css';

const resetPostForm = {
    description: '',
    files: [],
};

const extractInlineMentions = (description) => {
    const matches = String(description || '').match(/@([a-z0-9_]+)/gi) || [];
    return Array.from(
        new Set(
            matches
                .map((value) => value.replace(/^@+/, '').trim().toLowerCase())
                .filter(Boolean),
        ),
    );
};

export default function PersohubFeedPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const { user, login } = useAuth();
    const {
        mode,
        setMode,
        activeCommunityId,
        setActiveCommunityId,
        switchableCommunities,
        resolvedCommunity,
        canUseCommunityMode,
    } = usePersohubActor();

    const [posts, setPosts] = useState([]);
    const [feedCursor, setFeedCursor] = useState(null);
    const [feedHasMore, setFeedHasMore] = useState(false);
    const [feedLoadingMore, setFeedLoadingMore] = useState(false);
    const [communities, setCommunities] = useState([]);
    const [loading, setLoading] = useState(true);

    const [search, setSearch] = useState('');
    const [searchItems, setSearchItems] = useState([]);
    const [searchOpen, setSearchOpen] = useState(false);

    const [sharePost, setSharePost] = useState(null);
    const [userLoginExpanded, setUserLoginExpanded] = useState(false);
    const [userLoginLoading, setUserLoginLoading] = useState(false);
    const [userLoginForm, setUserLoginForm] = useState({ regno: '', password: '' });

    const [postModalOpen, setPostModalOpen] = useState(false);
    const [postForm, setPostForm] = useState(resetPostForm);
    const [postSubmitting, setPostSubmitting] = useState(false);
    const [editPostModalOpen, setEditPostModalOpen] = useState(false);
    const [editingPost, setEditingPost] = useState(null);
    const [editSubmitting, setEditSubmitting] = useState(false);
    const [pendingLikeSlugs, setPendingLikeSlugs] = useState(() => new Set());
    const [pendingHideSlugs, setPendingHideSlugs] = useState(() => new Set());
    const pendingLikeSlugsRef = useRef(new Set());
    const pendingHideSlugsRef = useRef(new Set());
    const feedLoadingMoreRef = useRef(false);
    const [deleteTargetPost, setDeleteTargetPost] = useState(null);
    const [deleteSubmitting, setDeleteSubmitting] = useState(false);
    const [visibilityTargetPost, setVisibilityTargetPost] = useState(null);
    const [communityPickerOpen, setCommunityPickerOpen] = useState(false);

    const [activeHashtag, setActiveHashtag] = useState('');
    const feedSentinelRef = useRef(null);

    const isUserLoggedIn = Boolean(user);
    const loadInitial = useCallback(async () => {
        setLoading(true);
        try {
            const feedRes = await persohubApi.fetchFeed(100, null);
            const nextPosts = feedRes.items || [];
            const nextCursor = feedRes.next_cursor || null;
            const nextHasMore = Boolean(feedRes.has_more);

            setPosts(nextPosts);
            setFeedCursor(nextCursor);
            setFeedHasMore(nextHasMore);
        } catch (error) {
            toast.error(persohubApi.parseApiError(error, 'Failed to load Persohub feed'));
        } finally {
            setLoading(false);
        }
    }, []);

    const loadCommunities = useCallback(async () => {
        try {
            const communitiesRes = await persohubApi.fetchCommunities();
            setCommunities(communitiesRes || []);
        } catch (error) {
            toast.error(persohubApi.parseApiError(error, 'Failed to load communities'));
        }
    }, []);

    useEffect(() => {
        loadInitial();
        loadCommunities();
    }, [loadInitial, loadCommunities]);

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const hashtag = String(params.get('hashtag') || '').trim();
        if (!hashtag) return;
        setSearch(`#${hashtag}`);
        handleHashtagClick(hashtag, { syncSearchInput: false });
    }, [location.search]);

    useEffect(() => {
        const q = search.trim();
        if (!q) {
            setSearchItems([]);
            setSearchOpen(false);
            if (activeHashtag) {
                setActiveHashtag('');
                loadInitial();
            }
            return;
        }
        if (q.startsWith('#')) {
            const hashtag = q.replace(/^#+/, '').trim();
            setSearchItems([]);
            setSearchOpen(false);
            if (!hashtag) {
                if (activeHashtag) {
                    setActiveHashtag('');
                    loadInitial();
                }
                return;
            }
            const timer = setTimeout(() => {
                handleHashtagClick(hashtag, { syncSearchInput: false });
            }, 220);
            return () => clearTimeout(timer);
        }
        if (activeHashtag) {
            setActiveHashtag('');
            loadInitial();
        }
        const timer = setTimeout(async () => {
            try {
                const response = await persohubApi.searchSuggestions(q);
                setSearchItems(response.items || []);
                setSearchOpen(true);
            } catch {
                setSearchItems([]);
                setSearchOpen(false);
            }
        }, 220);
        return () => clearTimeout(timer);
    }, [activeHashtag, loadInitial, search]);

    const patchPost = (nextPost) => {
        setPosts((prev) => prev.map((item) => (item.slug_token === nextPost.slug_token ? nextPost : item)));
    };

    const handleLike = async (slugToken) => {
        if (!isUserLoggedIn) {
            toast.error('Login as PDA user to react');
            return;
        }
        if (mode !== 'user') {
            toast.error('Switch to User mode to react');
            return;
        }
        if (pendingLikeSlugsRef.current.has(slugToken)) return;
        pendingLikeSlugsRef.current.add(slugToken);
        setPendingLikeSlugs(new Set(pendingLikeSlugsRef.current));
        try {
            const updated = await persohubApi.toggleLike(slugToken);
            patchPost(updated);
        } catch (error) {
            toast.error(persohubApi.parseApiError(error, 'Failed to toggle like'));
        } finally {
            pendingLikeSlugsRef.current.delete(slugToken);
            setPendingLikeSlugs(new Set(pendingLikeSlugsRef.current));
        }
    };

    const handleCreateComment = async (slugToken, commentText) => {
        if (!isUserLoggedIn) {
            throw new Error('Login required');
        }
        if (mode !== 'user') {
            throw new Error('Switch to User mode to comment');
        }
        const created = await persohubApi.createComment(slugToken, commentText);
        const fresh = await persohubApi.fetchPost(slugToken);
        patchPost(fresh);
        return created;
    };

    const handleHashtagClick = async (hashtag, options = {}) => {
        const { syncSearchInput = true } = options;
        const normalizedHashtag = String(hashtag || '').replace(/^#+/, '').trim();
        if (!normalizedHashtag) return;
        try {
            const response = await persohubApi.fetchHashtagPosts(normalizedHashtag);
            setPosts(response.items || []);
            setFeedCursor(response.next_cursor || null);
            setFeedHasMore(Boolean(response.has_more));
            setActiveHashtag(normalizedHashtag);
            if (syncSearchInput) {
                setSearch(`#${normalizedHashtag}`);
            }
            setSearchOpen(false);
        } catch (error) {
            toast.error(persohubApi.parseApiError(error, 'Failed to load hashtag posts'));
        }
    };

    const handleLoadMoreFeed = useCallback(async () => {
        if (!feedHasMore || !feedCursor || feedLoadingMoreRef.current) return;
        feedLoadingMoreRef.current = true;
        setFeedLoadingMore(true);
        try {
            const response = await persohubApi.fetchFeed(25, feedCursor);
            const incoming = response.items || [];
            setPosts((prev) => {
                const seen = new Set(prev.map((item) => item.slug_token));
                const merged = [...prev];
                for (const row of incoming) {
                    if (!seen.has(row.slug_token)) merged.push(row);
                }
                return merged;
            });
            setFeedCursor(response.next_cursor || null);
            setFeedHasMore(Boolean(response.has_more));
        } catch (error) {
            toast.error(persohubApi.parseApiError(error, 'Failed to load more posts'));
        } finally {
            feedLoadingMoreRef.current = false;
            setFeedLoadingMore(false);
        }
    }, [feedCursor, feedHasMore]);

    useEffect(() => {
        if (loading || activeHashtag || !feedHasMore || !feedCursor || feedLoadingMore) return;
        const sentinel = feedSentinelRef.current;
        if (!sentinel) return;

        const observer = new IntersectionObserver(
            (entries) => {
                const first = entries[0];
                if (!first?.isIntersecting) return;
                handleLoadMoreFeed();
            },
            {
                root: null,
                threshold: 0,
                rootMargin: '600px 0px 600px 0px',
            },
        );

        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [activeHashtag, feedCursor, feedHasMore, feedLoadingMore, handleLoadMoreFeed, loading]);

    const handleShare = (post) => setSharePost(post);

    const handleSelectSuggestion = (item) => {
        setSearch('');
        setSearchOpen(false);
        if (item.result_type === 'hashtag') {
            const value = String(item.profile_name || '').replace('#', '');
            setSearch(`#${value}`);
            handleHashtagClick(value, { syncSearchInput: false });
            return;
        }
        navigate(`/persohub/${item.profile_name}`);
    };

    const handleToggleFollow = async (profileId) => {
        if (!isUserLoggedIn) {
            toast.error('Login as PDA user to follow communities');
            return;
        }
        if (mode !== 'user') {
            toast.error('Switch to User mode to follow communities');
            return;
        }
        try {
            await persohubApi.toggleCommunityFollow(profileId);
            const refreshed = await persohubApi.fetchCommunities();
            setCommunities(refreshed || []);
        } catch (error) {
            toast.error(persohubApi.parseApiError(error, 'Failed to update follow status'));
        }
    };

    const handleUserModeClick = () => {
        setMode('user');
        if (!isUserLoggedIn) {
            setUserLoginExpanded(true);
        }
    };

    const handleInlineUserLogin = async (event) => {
        event.preventDefault();
        if (userLoginLoading) return;
        setUserLoginLoading(true);
        try {
            await login(userLoginForm.regno.trim(), userLoginForm.password);
            setUserLoginExpanded(false);
            setUserLoginForm({ regno: '', password: '' });
            toast.success('Logged in');
        } catch (error) {
            toast.error(persohubApi.parseApiError(error, 'Login failed'));
        } finally {
            setUserLoginLoading(false);
        }
    };

    const handlePostFormFileChange = (event) => {
        const files = Array.from(event.target.files || []);
        setPostForm((prev) => ({ ...prev, files }));
    };

    const handleCreatePost = async (event) => {
        event.preventDefault();
        if (!resolvedCommunity || mode !== 'community') {
            toast.error('Switch to Community mode to create posts');
            return;
        }

        setPostSubmitting(true);
        try {
            const uploadedAttachments = [];
            for (const originalFile of postForm.files) {
                let targetFile = originalFile;
                if (originalFile.type?.startsWith('image/')) {
                    targetFile = await compressImageToWebp(originalFile, { maxDimension: 1800, quality: 0.84 });
                }
                const attachment = await persohubApi.uploadAttachment(targetFile);
                uploadedAttachments.push(attachment);
            }

            const mentions = extractInlineMentions(postForm.description);

            const created = await persohubApi.createCommunityPost({
                description: postForm.description.trim(),
                mentions,
                attachments: uploadedAttachments,
            });
            setPosts((prev) => [created, ...prev]);
            setPostModalOpen(false);
            setPostForm(resetPostForm);
            toast.success('Community post published');
        } catch (error) {
            toast.error(persohubApi.parseApiError(error, 'Failed to publish post'));
        } finally {
            setPostSubmitting(false);
        }
    };

    const canModeratePost = (post) => {
        if (!resolvedCommunity || mode !== 'community') return false;
        return resolvedCommunity.profile_id === post.community.profile_id;
    };

    const handleDeletePost = async (post) => {
        setDeleteTargetPost(post);
    };

    const handleConfirmDeletePost = async () => {
        if (!deleteTargetPost) return;
        setDeleteSubmitting(true);
        try {
            await persohubApi.deleteCommunityPost(deleteTargetPost.slug_token);
            setPosts((prev) => prev.filter((item) => item.slug_token !== deleteTargetPost.slug_token));
            toast.success('Post deleted');
            setDeleteTargetPost(null);
        } catch (error) {
            toast.error(persohubApi.parseApiError(error, 'Failed to delete post'));
        } finally {
            setDeleteSubmitting(false);
        }
    };

    const handleEditPost = (post) => {
        setEditingPost(post);
        setEditPostModalOpen(true);
    };

    const handleHidePost = async (post) => {
        setVisibilityTargetPost(post || null);
    };

    const handleConfirmToggleVisibility = async () => {
        const post = visibilityTargetPost;
        if (!post?.slug_token) return;
        const slugToken = post.slug_token;
        if (pendingHideSlugsRef.current.has(slugToken)) return;
        pendingHideSlugsRef.current.add(slugToken);
        setPendingHideSlugs(new Set(pendingHideSlugsRef.current));
        try {
            const nextHidden = Number(post.is_hidden || 0) === 1 ? 0 : 1;
            const updated = await persohubApi.updateCommunityPostVisibility(slugToken, nextHidden);
            if (nextHidden === 0) {
                setPosts((prev) => prev.filter((item) => item.slug_token !== slugToken));
                toast.success('Post hidden from feed');
            } else {
                patchPost(updated);
                toast.success('Post unhidden');
            }
            setVisibilityTargetPost(null);
        } catch (error) {
            toast.error(persohubApi.parseApiError(error, 'Failed to hide post'));
        } finally {
            pendingHideSlugsRef.current.delete(slugToken);
            setPendingHideSlugs(new Set(pendingHideSlugsRef.current));
        }
    };

    const handleSubmitEditPost = async (payload) => {
        if (!editingPost) return;
        setEditSubmitting(true);
        try {
            const uploadedAttachments = [];
            for (const originalFile of payload.newFiles || []) {
                let targetFile = originalFile;
                if (originalFile.type?.startsWith('image/')) {
                    targetFile = await compressImageToWebp(originalFile, { maxDimension: 1800, quality: 0.84 });
                }
                const attachment = await persohubApi.uploadAttachment(targetFile);
                uploadedAttachments.push(attachment);
            }

            const retained = (payload.existingAttachments || []).map((item) => ({
                s3_url: item.s3_url,
                preview_image_urls: item.preview_image_urls || [],
                mime_type: item.mime_type,
                size_bytes: item.size_bytes,
            }));
            const mentions = extractInlineMentions(payload.description);

            const updated = await persohubApi.updateCommunityPost(editingPost.slug_token, {
                description: payload.description,
                mentions,
                attachments: [...retained, ...uploadedAttachments],
            });
            patchPost(updated);
            setEditPostModalOpen(false);
            setEditingPost(null);
            toast.success('Post updated');
        } catch (error) {
            toast.error(persohubApi.parseApiError(error, 'Failed to update post'));
        } finally {
            setEditSubmitting(false);
        }
    };

    return (
        <div className="persohub-page ph-feed-page">
            <PdaHeader />
            <div className="ph-layer ph-shell">
                <div className="ph-grid ph-grid-sections">
                    <aside className="ph-col ph-col-left">
                        <CommunityListPanel
                            communities={communities}
                            onToggleFollow={handleToggleFollow}
                            isLoggedIn={isUserLoggedIn}
                        />
                    </aside>

                    <main className="ph-col ph-col-main">
                        <section className="ph-search-wrap ph-search-wrap-plain">
                            <input
                                type="text"
                                className="ph-search"
                                placeholder="Search profile, community, hashtag (#tag)"
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                                data-testid="ph-search-input"
                            />
                            <SearchSuggestionList open={searchOpen} items={searchItems} onSelect={handleSelectSuggestion} />
                        </section>

                        {loading ? (
                            <EmptyState title="Loading feed" subtitle="Fetching community posts..." />
                        ) : null}

                        {!loading && posts.length === 0 ? (
                            <EmptyState title="No posts yet" subtitle="Communities can start posting once they log in." />
                        ) : null}

                        {!loading && posts.length > 0 ? (
                            <div className="ph-feed">
                                {posts.map((post) => (
                                    <PostCard
                                        key={post.slug_token}
                                        post={post}
                                        onLike={handleLike}
                                        likePending={pendingLikeSlugs.has(post.slug_token)}
                                        hidePending={pendingHideSlugs.has(post.slug_token)}
                                        onShare={handleShare}
                                        onHashtagClick={handleHashtagClick}
                                        isUserLoggedIn={isUserLoggedIn}
                                        fetchComments={persohubApi.fetchComments}
                                        createComment={handleCreateComment}
                                        allowModeration={canModeratePost(post)}
                                        onDelete={handleDeletePost}
                                        onEdit={handleEditPost}
                                        onHide={handleHidePost}
                                    />
                                ))}
                                {!activeHashtag && feedHasMore ? <div ref={feedSentinelRef} className="ph-feed-sentinel" aria-hidden="true" /> : null}
                                {!activeHashtag && feedLoadingMore ? <p className="ph-feed-status">Loading more posts...</p> : null}
                                {!activeHashtag && !feedHasMore ? <p className="ph-feed-status">You are all caught up.</p> : null}
                            </div>
                        ) : null}
                    </main>

                    <aside className="ph-col ph-col-right">
                        <div className="ph-card ph-side-card" style={{ marginBottom: '0.8rem' }} data-testid="ph-community-auth-panel">
                            <h3 style={{ marginTop: 0, marginBottom: '0.45rem' }}>Account Mode</h3>
                            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                <button type="button" className={`ph-btn ${mode === 'user' ? 'ph-btn-primary' : ''}`} onClick={handleUserModeClick}>User</button>
                                <button type="button" className={`ph-btn ${mode === 'community' ? 'ph-btn-primary' : ''}`} onClick={() => setMode('community')} disabled={!canUseCommunityMode}>Community</button>
                            </div>
                            {!isUserLoggedIn && userLoginExpanded ? (
                                <form onSubmit={handleInlineUserLogin} style={{ marginBottom: '0.55rem' }}>
                                    <label className="ph-muted">Register Number</label>
                                    <input
                                        className="ph-input"
                                        value={userLoginForm.regno}
                                        onChange={(event) => setUserLoginForm((prev) => ({ ...prev, regno: event.target.value }))}
                                        required
                                    />
                                    <label className="ph-muted">Password</label>
                                    <input
                                        className="ph-input"
                                        type="password"
                                        value={userLoginForm.password}
                                        onChange={(event) => setUserLoginForm((prev) => ({ ...prev, password: event.target.value }))}
                                        required
                                    />
                                    <button type="submit" className="ph-btn ph-btn-primary" style={{ marginTop: '0.5rem' }} disabled={userLoginLoading}>
                                        {userLoginLoading ? 'Logging in...' : 'Login'}
                                    </button>
                                    <p className="ph-muted" style={{ marginTop: '0.45rem', marginBottom: 0 }}>
                                        No account?{' '}
                                        <a href="https://pdamit.in/signup" target="_blank" rel="noreferrer" className="ph-link transition-colors hover:text-[#c99612]">
                                            Register now
                                        </a>
                                    </p>
                                </form>
                            ) : null}
                            {mode === 'community' ? (
                                canUseCommunityMode ? (
                                    <>
                                        <label className="ph-muted">Active Community</label>
                                        <button
                                            type="button"
                                            className="ph-input"
                                            style={{ textAlign: 'left', cursor: 'pointer' }}
                                            onClick={() => setCommunityPickerOpen(true)}
                                        >
                                            {resolvedCommunity
                                                ? `${resolvedCommunity.name} (@${resolvedCommunity.profile_id})`
                                                : 'Choose active community'}
                                        </button>
                                        <p className="ph-muted" style={{ marginTop: '0.5rem', marginBottom: 0 }}>
                                            Acting as <strong>@{resolvedCommunity?.profile_id || '—'}</strong>
                                        </p>
                                    </>
                                ) : (
                                    <p className="ph-muted" style={{ marginBottom: 0 }}>No community admin access available.</p>
                                )
                            ) : (
                                <p className="ph-muted" style={{ marginBottom: 0 }}>User mode: likes, comments, follows are enabled.</p>
                            )}
                        </div>
                    </aside>
                </div>
            </div>

            {mode === 'community' && resolvedCommunity ? (
                <button
                    type="button"
                    className="ph-floating"
                    onClick={() => setPostModalOpen(true)}
                    title="Create community post"
                    data-testid="ph-create-post-floating"
                >
                    <Plus size={24} style={{ margin: 'auto' }} />
                </button>
            ) : null}

            {postModalOpen ? (
                <div className="ph-modal-overlay" role="dialog" aria-modal="true">
                    <div className="ph-modal">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h2 style={{ marginTop: 0 }}>Create Post</h2>
                            <button type="button" className="ph-action-btn" onClick={() => setPostModalOpen(false)}>
                                <X size={16} />
                            </button>
                        </div>
                        <form onSubmit={handleCreatePost}>
                            <label className="ph-muted" htmlFor="ph-post-description">Share your thoughts...</label>
                            <textarea
                                id="ph-post-description"
                                className="ph-textarea"
                                value={postForm.description}
                                onChange={(event) => setPostForm((prev) => ({ ...prev, description: event.target.value }))}
                                placeholder="Use #hashtags and @profile mentions"
                                data-testid="ph-post-description-input"
                            />
                            <label className="ph-muted" htmlFor="ph-post-files">Attachments</label>
                            <input
                                id="ph-post-files"
                                className="ph-input"
                                type="file"
                                multiple
                                onChange={handlePostFormFileChange}
                                data-testid="ph-post-files-input"
                            />
                            <button type="submit" className="ph-btn ph-btn-primary" disabled={postSubmitting}>
                                {postSubmitting ? 'Publishing...' : 'Publish Post'}
                            </button>
                        </form>
                    </div>
                </div>
            ) : null}

            {communityPickerOpen ? (
                <div className="ph-modal-overlay" role="dialog" aria-modal="true">
                    <div className="ph-modal">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h2 style={{ marginTop: 0 }}>Choose Active Community</h2>
                            <button type="button" className="ph-action-btn" onClick={() => setCommunityPickerOpen(false)}>
                                <X size={16} />
                            </button>
                        </div>
                        <div style={{ display: 'grid', gap: '0.45rem' }}>
                            {switchableCommunities.map((item) => {
                                const isSelected = Number(activeCommunityId) === Number(item.id);
                                return (
                                    <button
                                        key={item.id}
                                        type="button"
                                        className={`ph-btn ${isSelected ? 'ph-btn-primary' : ''}`}
                                        style={{ justifyContent: 'space-between' }}
                                        onClick={() => {
                                            setActiveCommunityId(Number(item.id));
                                            setCommunityPickerOpen(false);
                                        }}
                                    >
                                        <span>{item.name} (@{item.profile_id})</span>
                                        {isSelected ? <span>Active</span> : null}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            ) : null}

            {sharePost ? (
                <div className="ph-modal-overlay" role="dialog" aria-modal="true">
                    <div className="ph-modal">
                        <div className="ph-share-modal-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h2 style={{ marginTop: 0 }}>Share Post</h2>
                            <button type="button" className="ph-action-btn ph-action-btn-danger-hover" onClick={() => setSharePost(null)}>
                                <X size={16} />
                            </button>
                        </div>
                        <input className="ph-input" readOnly value={sharePost.share_url} />
                        <div style={{ display: 'flex', gap: '0.55rem', marginTop: '0.6rem', flexWrap: 'wrap' }}>
                            <button
                                type="button"
                                className="ph-btn ph-btn-accent"
                                onClick={async () => {
                                    try {
                                        const copied = await copyTextToClipboard(sharePost.share_url);
                                        if (!copied) throw new Error('copy-failed');
                                        toast.success('Share link copied');
                                    } catch {
                                        toast.error('Failed to copy link');
                                    }
                                }}
                            >
                                Copy Link
                            </button>
                            <button
                                type="button"
                                className="ph-btn ph-btn-whatsapp"
                                onClick={() => {
                                    const text = encodeURIComponent(`Check this post on Persohub: ${sharePost.share_url}`);
                                    window.open(`https://wa.me/?text=${text}`, '_blank', 'noopener,noreferrer');
                                }}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                            >
                                <MessageCircle size={14} />
                                Share on WhatsApp
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}

            <CommunityPostEditModal
                open={editPostModalOpen}
                post={editingPost}
                onClose={() => {
                    setEditPostModalOpen(false);
                    setEditingPost(null);
                }}
                onSubmit={handleSubmitEditPost}
                submitting={editSubmitting}
            />

            <ConfirmModal
                open={Boolean(deleteTargetPost)}
                title="Delete Post"
                message="This action cannot be undone. Delete this post?"
                confirmLabel="Delete"
                pendingLabel="Deleting..."
                onConfirm={handleConfirmDeletePost}
                onCancel={() => setDeleteTargetPost(null)}
                pending={deleteSubmitting}
            />

            <ConfirmModal
                open={Boolean(visibilityTargetPost)}
                title={Number(visibilityTargetPost?.is_hidden || 0) === 1 ? 'Hide Post' : 'Unhide Post'}
                message={
                    Number(visibilityTargetPost?.is_hidden || 0) === 1
                        ? 'Hide this post from feed?'
                        : 'Unhide this post and show it in feed again?'
                }
                confirmLabel={Number(visibilityTargetPost?.is_hidden || 0) === 1 ? 'Hide' : 'Unhide'}
                onConfirm={handleConfirmToggleVisibility}
                onCancel={() => setVisibilityTargetPost(null)}
                pending={Boolean(visibilityTargetPost?.slug_token && pendingHideSlugs.has(visibilityTargetPost.slug_token))}
            />
        </div>
    );
}
