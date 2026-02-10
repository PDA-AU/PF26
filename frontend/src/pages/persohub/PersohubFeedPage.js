import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Menu, Plus, X } from 'lucide-react';
import { toast } from 'sonner';

import { useAuth } from '@/context/AuthContext';
import PdaFooter from '@/components/layout/PdaFooter';
import PdaHeader from '@/components/layout/PdaHeader';
import { compressImageToWebp } from '@/utils/imageCompression';
import { copyTextToClipboard } from '@/utils/clipboard';
import { persohubApi } from '@/pages/persohub/api';
import {
    CommunityPostEditModal,
    CommunityListPanel,
    ConfirmModal,
    EmptyState,
    FeaturedRail,
    PostCard,
    SearchSuggestionList,
} from '@/pages/persohub/components';
import '@/pages/persohub/persohub.css';

const resetPostForm = {
    description: '',
    mentions: '',
    files: [],
};

export default function PersohubFeedPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const { user } = useAuth();

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

    const [communityAccount, setCommunityAccount] = useState(null);
    const [communityAuthExpanded, setCommunityAuthExpanded] = useState(false);
    const [communityForm, setCommunityForm] = useState({ profileId: '', password: '' });
    const [communityAuthLoading, setCommunityAuthLoading] = useState(false);

    const [postModalOpen, setPostModalOpen] = useState(false);
    const [postForm, setPostForm] = useState(resetPostForm);
    const [postSubmitting, setPostSubmitting] = useState(false);
    const [editPostModalOpen, setEditPostModalOpen] = useState(false);
    const [editingPost, setEditingPost] = useState(null);
    const [editSubmitting, setEditSubmitting] = useState(false);
    const [pendingLikeSlugs, setPendingLikeSlugs] = useState(() => new Set());
    const pendingLikeSlugsRef = useRef(new Set());
    const [deleteTargetPost, setDeleteTargetPost] = useState(null);
    const [deleteSubmitting, setDeleteSubmitting] = useState(false);

    const [activeHashtag, setActiveHashtag] = useState('');

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

    const loadCommunitySession = async () => {
        try {
            const me = await persohubApi.communityMe();
            setCommunityAccount(me);
        } catch {
            setCommunityAccount(null);
        }
    };

    useEffect(() => {
        loadInitial();
        loadCommunities();
        loadCommunitySession();
    }, [loadInitial, loadCommunities]);

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const hashtag = params.get('hashtag');
        if (!hashtag) return;
        handleHashtagClick(hashtag);
    }, [location.search]);

    useEffect(() => {
        const q = search.trim();
        if (!q) {
            setSearchItems([]);
            setSearchOpen(false);
            return;
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
    }, [search]);

    const featuredPosts = useMemo(() => {
        return [...posts].sort((a, b) => (b.like_count || 0) - (a.like_count || 0)).slice(0, 6);
    }, [posts]);

    const patchPost = (nextPost) => {
        setPosts((prev) => prev.map((item) => (item.slug_token === nextPost.slug_token ? nextPost : item)));
    };

    const handleLike = async (slugToken) => {
        if (!isUserLoggedIn) {
            toast.error('Login as PDA user to react');
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
        const created = await persohubApi.createComment(slugToken, commentText);
        const fresh = await persohubApi.fetchPost(slugToken);
        patchPost(fresh);
        return created;
    };

    const handleHashtagClick = async (hashtag) => {
        try {
            const response = await persohubApi.fetchHashtagPosts(hashtag);
            setPosts(response.items || []);
            setFeedCursor(response.next_cursor || null);
            setFeedHasMore(Boolean(response.has_more));
            setActiveHashtag(hashtag);
        } catch (error) {
            toast.error(persohubApi.parseApiError(error, 'Failed to load hashtag posts'));
        }
    };

    const clearHashtagFilter = async () => {
        setActiveHashtag('');
        await loadInitial();
    };

    const handleLoadMoreFeed = async () => {
        if (!feedHasMore || feedLoadingMore || !feedCursor) return;
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
            setFeedLoadingMore(false);
        }
    };

    const handleShare = (post) => setSharePost(post);

    const handleSelectSuggestion = (item) => {
        setSearch('');
        setSearchOpen(false);
        if (item.result_type === 'hashtag') {
            const value = String(item.profile_name || '').replace('#', '');
            handleHashtagClick(value);
            return;
        }
        navigate(`/persohub/${item.profile_name}`);
    };

    const handleToggleFollow = async (profileId) => {
        if (!isUserLoggedIn) {
            toast.error('Login as PDA user to follow communities');
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

    const handleCommunityLogin = async (event) => {
        event.preventDefault();
        setCommunityAuthLoading(true);
        try {
            const response = await persohubApi.communityLogin(communityForm.profileId, communityForm.password);
            setCommunityAccount(response.community);
            setCommunityAuthExpanded(false);
            setCommunityForm({ profileId: '', password: '' });
            toast.success(`Community login: @${response.community.profile_id}`);
        } catch (error) {
            toast.error(persohubApi.parseApiError(error, 'Community login failed'));
        } finally {
            setCommunityAuthLoading(false);
        }
    };

    const handleCommunityLogout = () => {
        persohubApi.clearCommunityTokens();
        setCommunityAccount(null);
        setCommunityAuthExpanded(false);
        toast.success('Community session ended');
    };

    const renderCommunityAuthForm = (idPrefix = 'default') => (
        <form onSubmit={handleCommunityLogin}>
            <label htmlFor={`ph-community-profile-${idPrefix}`} className="ph-muted">Community Profile ID</label>
            <input
                id={`ph-community-profile-${idPrefix}`}
                className="ph-input"
                value={communityForm.profileId}
                onChange={(event) => setCommunityForm((prev) => ({ ...prev, profileId: event.target.value }))}
                required
                data-testid="ph-community-profile-input"
            />
            <label htmlFor={`ph-community-password-${idPrefix}`} className="ph-muted">Password</label>
            <input
                id={`ph-community-password-${idPrefix}`}
                type="password"
                className="ph-input"
                value={communityForm.password}
                onChange={(event) => setCommunityForm((prev) => ({ ...prev, password: event.target.value }))}
                required
                data-testid="ph-community-password-input"
            />
            <button type="submit" className="ph-btn ph-btn-primary" disabled={communityAuthLoading}>
                {communityAuthLoading ? 'Logging in...' : 'Login'}
            </button>
            <p className="ph-muted" style={{ marginTop: '0.6rem', marginBottom: 0 }}>
                Default seeded accounts use <code>profile_id@123</code> password.
            </p>
        </form>
    );

    const handlePostFormFileChange = (event) => {
        const files = Array.from(event.target.files || []);
        setPostForm((prev) => ({ ...prev, files }));
    };

    const handleCreatePost = async (event) => {
        event.preventDefault();
        if (!communityAccount) {
            toast.error('Community login required');
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

            const mentions = postForm.mentions
                .split(',')
                .map((item) => item.trim().replace(/^@+/, '').toLowerCase())
                .filter(Boolean);

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
        if (!communityAccount) return false;
        return communityAccount.profile_id === post.community.profile_id;
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
            const mentions = (payload.mentions || '')
                .split(',')
                .map((item) => item.trim().replace(/^@+/, '').toLowerCase())
                .filter(Boolean);

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
        <div className="persohub-page">
            <PdaHeader />
            <div className="ph-layer ph-shell">
                <div className="ph-grid ph-grid-sections">
                    <header className="ph-header ph-section ph-span-all">
                        <div className="ph-header-left-control">
                            <button
                                type="button"
                                className="ph-action-btn ph-header-toggle-btn"
                                onClick={() => setCommunityAuthExpanded((prev) => !prev)}
                                data-testid="ph-mobile-community-toggle"
                                aria-label={communityAuthExpanded ? 'Close community auth panel' : 'Open community auth panel'}
                            >
                                <Menu size={14} />
                            </button>
                        </div>
                        <div className="ph-title-band">
                            <h1 className="ph-title">PERSOHUB FEED</h1>
                        </div>
                        <p className="ph-sub">Discover. Discuss. Build your public voice.</p>
                    </header>

                    <section className="ph-search-wrap ph-section ph-span-all">
                        <input
                            type="text"
                            className="ph-search"
                            placeholder="Search profile, community, hashtag"
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            data-testid="ph-search-input"
                        />
                        <SearchSuggestionList open={searchOpen} items={searchItems} onSelect={handleSelectSuggestion} />
                    </section>

                    {communityAuthExpanded ? (
                        <section className="ph-section ph-span-all ph-mobile-auth-panel" data-testid="ph-mobile-auth-panel">
                            {communityAccount ? (
                                <div className="ph-mobile-auth-panel-inner">
                                    <p style={{ marginTop: 0, marginBottom: '0.45rem' }}>
                                        Logged in as <strong>@{communityAccount.profile_id}</strong>
                                    </p>
                                    <button type="button" className="ph-btn ph-btn-accent" onClick={handleCommunityLogout}>
                                        Logout
                                    </button>
                                </div>
                            ) : renderCommunityAuthForm('mobile')}
                        </section>
                    ) : null}

                    {activeHashtag ? (
                        <div className="ph-section ph-span-all ph-hashtag-row">
                            <span style={{ fontWeight: 800 }}>Showing posts for #{activeHashtag}</span>
                            <button type="button" className="ph-btn" onClick={clearHashtagFilter}>Clear</button>
                        </div>
                    ) : null}

                    <aside className="ph-col ph-col-left ph-section">
                        <CommunityListPanel
                            communities={communities}
                            onToggleFollow={handleToggleFollow}
                            isLoggedIn={isUserLoggedIn}
                        />
                    </aside>

                    <main className="ph-col ph-col-main ph-section">
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
                                        onShare={handleShare}
                                        onHashtagClick={handleHashtagClick}
                                        isUserLoggedIn={isUserLoggedIn}
                                        fetchComments={persohubApi.fetchComments}
                                        createComment={handleCreateComment}
                                        allowModeration={canModeratePost(post)}
                                        onDelete={handleDeletePost}
                                        onEdit={handleEditPost}
                                    />
                                ))}
                                {!activeHashtag && feedHasMore ? (
                                    <button
                                        type="button"
                                        className="ph-btn"
                                        onClick={handleLoadMoreFeed}
                                        disabled={feedLoadingMore}
                                        style={{ alignSelf: 'center' }}
                                    >
                                        {feedLoadingMore ? 'Loading...' : 'Load more posts'}
                                    </button>
                                ) : null}
                            </div>
                        ) : null}
                    </main>

                    <aside className="ph-col ph-col-right ph-section">
                        <div className="ph-card ph-side-card" style={{ marginBottom: '0.8rem' }} data-testid="ph-community-auth-panel">
                            <h3 style={{ marginTop: 0, marginBottom: '0.45rem' }}>Community Auth</h3>
                            {communityAccount ? (
                                <>
                                    <p style={{ marginTop: 0, marginBottom: '0.45rem' }}>
                                        Logged in as <strong>@{communityAccount.profile_id}</strong>
                                    </p>
                                    <button type="button" className="ph-btn ph-btn-accent" onClick={handleCommunityLogout}>Logout</button>
                                </>
                            ) : (
                                <>
                                    <button type="button" className="ph-btn ph-btn-primary" onClick={() => setCommunityAuthExpanded((prev) => !prev)}>
                                        {communityAuthExpanded ? 'Hide Login' : 'Community Login'}
                                    </button>
                                    {communityAuthExpanded ? (
                                        <div style={{ marginTop: '0.6rem' }}>
                                            {renderCommunityAuthForm('desktop')}
                                        </div>
                                    ) : null}
                                </>
                            )}
                        </div>
                        <FeaturedRail posts={featuredPosts} />
                    </aside>
                </div>
            </div>

            {communityAccount ? (
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
                            <label className="ph-muted" htmlFor="ph-post-description">Description</label>
                            <textarea
                                id="ph-post-description"
                                className="ph-textarea"
                                value={postForm.description}
                                onChange={(event) => setPostForm((prev) => ({ ...prev, description: event.target.value }))}
                                placeholder="Use #hashtags and @profile mentions"
                                data-testid="ph-post-description-input"
                            />
                            <label className="ph-muted" htmlFor="ph-post-mentions">Mentions (comma separated profile names)</label>
                            <input
                                id="ph-post-mentions"
                                className="ph-input"
                                value={postForm.mentions}
                                onChange={(event) => setPostForm((prev) => ({ ...prev, mentions: event.target.value }))}
                                placeholder="profile_one, profile_two"
                                data-testid="ph-post-mentions-input"
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
                            <p className="ph-muted">Images are compressed before upload. Files above 100MB use multipart upload.</p>
                            <button type="submit" className="ph-btn ph-btn-primary" disabled={postSubmitting}>
                                {postSubmitting ? 'Publishing...' : 'Publish Post'}
                            </button>
                        </form>
                    </div>
                </div>
            ) : null}

            {sharePost ? (
                <div className="ph-modal-overlay" role="dialog" aria-modal="true">
                    <div className="ph-modal">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h2 style={{ marginTop: 0 }}>Share Post</h2>
                            <button type="button" className="ph-action-btn" onClick={() => setSharePost(null)}>
                                <X size={16} />
                            </button>
                        </div>
                        <input className="ph-input" readOnly value={sharePost.share_url} />
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
                onConfirm={handleConfirmDeletePost}
                onCancel={() => setDeleteTargetPost(null)}
                pending={deleteSubmitting}
            />
            <PdaFooter />
        </div>
    );
}
