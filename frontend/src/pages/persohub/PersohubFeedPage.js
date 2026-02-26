import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { MessageCircle, Plus, X } from 'lucide-react';
import { toast } from 'sonner';

import { useAuth } from '@/context/AuthContext';
import { usePersohubActor } from '@/context/PersohubActorContext';
import PdaHeader from '@/components/layout/PdaHeader';
import persohubLogo from '@/assets/persohub.png';
import { compressImageToWebp } from '@/utils/imageCompression';
import { copyTextToClipboard } from '@/utils/clipboard';
import { persohubApi } from '@/pages/persohub/api';
import {
    CommunityPostEditModal,
    CommunityListPanel,
    ConfirmModal,
    EmptyState,
    PersohubMobileNav,
    PostCard,
    SearchSuggestionList,
} from '@/pages/persohub/components';
import '@/pages/persohub/persohub.css';

const resetPostForm = {
    description: '',
    files: [],
};
const MAX_POST_DESCRIPTION_LENGTH = 8000;

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
    const [feedType, setFeedType] = useState('event');

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
    const [mobileView, setMobileView] = useState('feed');
    const [isMobileViewport, setIsMobileViewport] = useState(() => (
        typeof window !== 'undefined' ? window.matchMedia('(max-width: 1023px)').matches : false
    ));

    const [activeHashtag, setActiveHashtag] = useState('');
    const feedSentinelRef = useRef(null);

    const isUserLoggedIn = Boolean(user);
    const isGlobalFeedSuperadmin = Boolean(
        user
        && user.is_superadmin
    );
    const userFeedScope = user?.id ?? null;
    const publicProfilePath = user?.profile_name
        ? `/persohub/${encodeURIComponent(user.profile_name)}`
        : '/profile';
    const syncHashtagQueryInUrl = useCallback((hashtagValue) => {
        const normalizedHashtag = String(hashtagValue || '').replace(/^#+/, '').trim();
        const params = new URLSearchParams(location.search);
        const existingHashtag = String(params.get('hashtag') || '').trim();

        if (normalizedHashtag) {
            if (existingHashtag === normalizedHashtag) return;
            params.set('hashtag', normalizedHashtag);
        } else {
            if (!params.has('hashtag')) return;
            params.delete('hashtag');
        }

        const searchText = params.toString();
        navigate(
            {
                pathname: location.pathname,
                search: searchText ? `?${searchText}` : '',
            },
            { replace: true },
        );
    }, [location.pathname, location.search, navigate]);

    const loadInitial = useCallback(async () => {
        setLoading(true);
        try {
            const feedRes = await persohubApi.fetchFeed(100, null, feedType);
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
    }, [feedType]);

    const loadCommunities = useCallback(async () => {
        try {
            const communitiesRes = await persohubApi.fetchCommunities();
            setCommunities(communitiesRes || []);
        } catch (error) {
            toast.error(persohubApi.parseApiError(error, 'Failed to load communities'));
        }
    }, []);

    const handleHashtagClick = useCallback(async (hashtag, options = {}) => {
        const { syncSearchInput = true, syncUrl = true } = options;
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
            if (syncUrl) {
                syncHashtagQueryInUrl(normalizedHashtag);
            }
            setSearchOpen(false);
        } catch (error) {
            toast.error(persohubApi.parseApiError(error, 'Failed to load hashtag posts'));
        }
    }, [syncHashtagQueryInUrl]);

    useEffect(() => {
        loadInitial();
        loadCommunities();
    }, [loadInitial, loadCommunities, userFeedScope]);

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

    useEffect(() => {
        const state = location.state && typeof location.state === 'object' ? location.state : null;
        if (!state) return;
        let consumed = false;

        const requestedView = String(state.mobileView || '').trim().toLowerCase();
        if (requestedView && ['feed', 'communities', 'account'].includes(requestedView)) {
            setMobileView(requestedView);
            if (requestedView === 'account' && !isUserLoggedIn) {
                setMode('user');
                setUserLoginExpanded(true);
            }
            consumed = true;
        }

        const requestedFeedType = String(state.feedType || '').trim().toLowerCase();
        if (requestedFeedType && ['event', 'community'].includes(requestedFeedType)) {
            setFeedType(requestedFeedType);
            consumed = true;
        }

        if (!consumed) return;
        navigate(
            {
                pathname: location.pathname,
                search: location.search,
            },
            { replace: true, state: null },
        );
    }, [location.pathname, location.search, location.state, navigate, isUserLoggedIn, setMode]);

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const hashtag = String(params.get('hashtag') || '').trim();
        if (!hashtag) return;
        setSearch(`#${hashtag}`);
        handleHashtagClick(hashtag, { syncSearchInput: false, syncUrl: false });
    }, [location.search, handleHashtagClick]);

    useEffect(() => {
        const q = search.trim();
        if (!q) {
            setSearchItems([]);
            setSearchOpen(false);
            if (activeHashtag) {
                setActiveHashtag('');
                syncHashtagQueryInUrl('');
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
                    syncHashtagQueryInUrl('');
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
            syncHashtagQueryInUrl('');
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
    }, [activeHashtag, handleHashtagClick, loadInitial, search, syncHashtagQueryInUrl]);

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

    const handleLoadMoreFeed = useCallback(async () => {
        if (!feedHasMore || !feedCursor || feedLoadingMoreRef.current) return;
        feedLoadingMoreRef.current = true;
        setFeedLoadingMore(true);
        try {
            const response = await persohubApi.fetchFeed(25, feedCursor, feedType);
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
    }, [feedCursor, feedHasMore, feedType]);

    const handleFeedTypeChange = (nextType) => {
        const normalized = String(nextType || '').trim().toLowerCase();
        if (!['event', 'community'].includes(normalized)) return;
        setMobileView('feed');
        if (normalized === feedType) return;
        setFeedType(normalized);
        if (activeHashtag) {
            setActiveHashtag('');
            syncHashtagQueryInUrl('');
        }
        setSearch('');
        setSearchItems([]);
        setSearchOpen(false);
    };

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
    const handleExplore = (post) => {
        const eventSlug = String(post?.event?.slug || '').trim();
        if (!eventSlug) return;
        navigate(`/persohub/events/${encodeURIComponent(eventSlug)}`);
    };

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

    const handleInlineUserLogin = async (event, options = {}) => {
        const { redirectToPublicProfile = false } = options;
        event.preventDefault();
        if (userLoginLoading) return;
        setUserLoginLoading(true);
        try {
            const loginResponse = await login(userLoginForm.regno.trim(), userLoginForm.password);
            setUserLoginExpanded(false);
            setMobileView('feed');
            setMode('user');
            setUserLoginForm({ regno: '', password: '' });
            toast.success('Logged in');
            if (redirectToPublicProfile) {
                const loggedInProfileName = String(loginResponse?.user?.profile_name || '').trim();
                const nextPublicProfilePath = loggedInProfileName
                    ? `/persohub/${encodeURIComponent(loggedInProfileName)}`
                    : publicProfilePath;
                navigate(nextPublicProfilePath);
            }
        } catch (error) {
            toast.error(persohubApi.parseApiError(error, 'Login failed'));
        } finally {
            setUserLoginLoading(false);
        }
    };

    const handleMobileCommunityTab = () => {
        setMobileView((prev) => (prev === 'communities' ? 'feed' : 'communities'));
    };

    const handleMobileAccountTab = () => {
        if (!isUserLoggedIn) {
            setMode('user');
            setUserLoginExpanded(true);
            setMobileView((prev) => (prev === 'account' ? 'feed' : 'account'));
            return;
        }

        if (mode === 'user') {
            navigate(publicProfilePath);
            return;
        }

        const communityProfileId = String(
            resolvedCommunity?.profile_id
            || switchableCommunities?.[0]?.profile_id
            || '',
        ).trim();

        if (communityProfileId) {
            navigate(`/persohub/${encodeURIComponent(communityProfileId)}`);
            return;
        }
        setMobileView((prev) => (prev === 'account' ? 'feed' : 'account'));
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

            const description = String(postForm.description || '').trim().slice(0, MAX_POST_DESCRIPTION_LENGTH);
            const mentions = extractInlineMentions(description);

            const created = await persohubApi.createCommunityPost({
                description,
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
        if (isGlobalFeedSuperadmin && mode === 'community') return true;
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
            const description = String(payload.description || '').trim().slice(0, MAX_POST_DESCRIPTION_LENGTH);
            const mentions = extractInlineMentions(description);

            const updated = await persohubApi.updateCommunityPost(editingPost.slug_token, {
                description,
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

    const renderAccountModePanel = ({ mobile = false } = {}) => (
        <section
            className="ph-card ph-side-card"
            style={mobile ? undefined : { marginBottom: '0.8rem' }}
            data-testid={mobile ? 'ph-mobile-account-panel' : 'ph-community-auth-panel'}
        >
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
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.6rem', marginTop: '0.45rem', flexWrap: 'wrap' }}>
                        <p className="ph-muted" style={{ margin: 0 }}>
                            No account?{' '}
                            <a href="https://pdamit.in/signup" target="_blank" rel="noreferrer" className="ph-link transition-colors hover:text-[#c99612]">
                                Register now
                            </a>
                        </p>
                        <Link to="/forgot-password" className="ph-link">Forgot password?</Link>
                    </div>
                </form>
            ) : null}

            {isUserLoggedIn && mode === 'user' ? (
                <button
                    type="button"
                    className="ph-btn"
                    style={{ marginBottom: '0.5rem' }}
                    onClick={() => {
                        navigate(publicProfilePath);
                    }}
                >
                    View Public Profile
                </button>
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
                        {isUserLoggedIn ? (
                            <button
                                type="button"
                                className="ph-btn"
                                style={{ marginTop: '0.5rem' }}
                                onClick={() => {
                                    const communityProfileId = String(resolvedCommunity?.profile_id || '').trim();
                                    if (communityProfileId) {
                                        navigate(`/persohub/${encodeURIComponent(communityProfileId)}`);
                                        return;
                                    }
                                    navigate(publicProfilePath);
                                }}
                            >
                                View Community Profile
                            </button>
                        ) : null}
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
        </section>
    );

    const mobileActiveTab = mobileView === 'communities'
        ? 'communities'
        : (mobileView === 'account'
            ? 'account'
            : (feedType === 'community' ? 'community' : 'event'));

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
                        {mobileView === 'communities' ? (
                            <CommunityListPanel
                                communities={communities}
                                onToggleFollow={handleToggleFollow}
                                isLoggedIn={isUserLoggedIn}
                            />
                        ) : mobileView === 'account' ? (
                            !isUserLoggedIn ? (
                                <div className="mx-auto w-full max-w-xl">
                                    <section className="rounded-md border-4 border-black bg-white p-6 shadow-[8px_8px_0px_0px_#000000] sm:p-8">
                                        <div className="mb-4 flex justify-center">
                                            <img src={persohubLogo} alt="Persohub logo" className="h-16 w-16 object-contain sm:h-20 sm:w-20" />
                                        </div>
                                        <p className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-[#8B5CF6]">PDA Login</p>
                                        <h3 className="mt-2 font-heading text-3xl font-black uppercase tracking-tight">Account Mode</h3>
                                        <p className="mt-2 text-sm font-medium text-slate-700">
                                            Login to use User mode, react to posts, and access your public profile.
                                        </p>
                                        <form className="mt-6" onSubmit={(event) => handleInlineUserLogin(event, { redirectToPublicProfile: true })}>
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
                                            <button
                                                type="submit"
                                                className="mt-3 inline-flex w-full items-center justify-center rounded-md border-2 border-black bg-[#8B5CF6] px-4 py-3 text-xs font-bold uppercase tracking-[0.14em] text-white shadow-neo transition-[background-color,transform,box-shadow] duration-150 hover:bg-[#7C3AED] hover:-translate-x-[1px] hover:-translate-y-[1px] hover:shadow-[6px_6px_0px_0px_#000000] disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-x-0 disabled:hover:translate-y-0 disabled:hover:shadow-neo"
                                                disabled={userLoginLoading}
                                            >
                                                {userLoginLoading ? 'Logging in...' : 'Login'}
                                            </button>
                                        </form>
                                        <div className="mt-4">
                                            <Link
                                                to="/signup"
                                                className="inline-flex w-full items-center justify-center rounded-md border-2 border-black bg-[#C4B5FD] px-4 py-3 text-xs font-bold uppercase tracking-[0.14em] text-black shadow-neo transition-[transform,box-shadow] duration-150 hover:-translate-x-[1px] hover:-translate-y-[1px] hover:shadow-[6px_6px_0px_0px_#000000]"
                                            >
                                                Create Account
                                            </Link>
                                        </div>
                                        <div className="mt-4 text-right">
                                            <Link
                                                to="/forgot-password"
                                                className="text-xs font-bold uppercase tracking-[0.1em] text-[#8B5CF6] transition-[color] duration-150 hover:text-black"
                                            >
                                                Forgot Password?
                                            </Link>
                                        </div>
                                    </section>
                                </div>
                            ) : (
                                renderAccountModePanel({ mobile: true })
                            )
                        ) : (
                            <>
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
                                    <EmptyState
                                        title="Loading feed"
                                        subtitle={feedType === 'event' ? 'Fetching event posts...' : 'Fetching community posts...'}
                                    />
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
                                                onExplore={handleExplore}
                                                onHashtagClick={handleHashtagClick}
                                                isUserLoggedIn={isUserLoggedIn}
                                                fetchComments={persohubApi.fetchComments}
                                                createComment={handleCreateComment}
                                                allowModeration={canModeratePost(post)}
                                                allowEventPostModeration={isGlobalFeedSuperadmin}
                                                onDelete={handleDeletePost}
                                                onEdit={handleEditPost}
                                                onHide={handleHidePost}
                                                compactEventMobile={isMobileViewport && feedType === 'event'}
                                            />
                                        ))}
                                        {!activeHashtag && feedHasMore ? <div ref={feedSentinelRef} className="ph-feed-sentinel" aria-hidden="true" /> : null}
                                        {!activeHashtag && feedLoadingMore ? <p className="ph-feed-status">Loading more posts...</p> : null}
                                        {!activeHashtag && !feedHasMore ? <p className="ph-feed-status">You are all caught up.</p> : null}
                                    </div>
                                ) : null}
                            </>
                        )}
                    </main>

                    <aside className="ph-col ph-col-right">
                        {renderAccountModePanel()}
                        <div className="ph-card ph-side-card ph-feed-type-panel" data-testid="ph-feed-type-panel">
                            <img src={persohubLogo} alt="Persohub logo" className="ph-feed-type-logo" />
                            <div className="ph-feed-type-actions">
                                <button
                                    type="button"
                                    className={`ph-btn ${feedType === 'event' ? 'ph-btn-primary' : ''}`}
                                    onClick={() => handleFeedTypeChange('event')}
                                    data-testid="ph-feed-type-event"
                                >
                                    Event Feed
                                </button>
                                <button
                                    type="button"
                                    className={`ph-btn ${feedType === 'community' ? 'ph-btn-primary' : ''}`}
                                    onClick={() => handleFeedTypeChange('community')}
                                    data-testid="ph-feed-type-community"
                                >
                                    Community Feed
                                </button>
                            </div>
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

            <PersohubMobileNav
                visible={isMobileViewport}
                activeTab={mobileActiveTab}
                isUserLoggedIn={isUserLoggedIn}
                onCommunities={handleMobileCommunityTab}
                onEventFeed={() => handleFeedTypeChange('event')}
                onCommunityFeed={() => handleFeedTypeChange('community')}
                onAccount={handleMobileAccountTab}
                ariaLabel="Persohub mobile feed navigation"
            />

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
