import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, X } from 'lucide-react';
import { toast } from 'sonner';

import { useAuth } from '@/context/AuthContext';
import { compressImageToWebp } from '@/utils/imageCompression';
import { copyTextToClipboard } from '@/utils/clipboard';
import { persohubApi } from '@/pages/persohub/api';
import { CommunityPostEditModal, ConfirmModal, EmptyState, PersohubHeader, PostCard } from '@/pages/persohub/components';
import '@/pages/persohub/persohub.css';

export default function PersohubProfilePage() {
    const { profileName } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();

    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [sharePost, setSharePost] = useState(null);
    const [editPostModalOpen, setEditPostModalOpen] = useState(false);
    const [editingPost, setEditingPost] = useState(null);
    const [editSubmitting, setEditSubmitting] = useState(false);
    const [pendingLikeSlugs, setPendingLikeSlugs] = useState(() => new Set());
    const pendingLikeSlugsRef = useRef(new Set());
    const [deleteTargetPost, setDeleteTargetPost] = useState(null);
    const [deleteSubmitting, setDeleteSubmitting] = useState(false);

    const isUserLoggedIn = Boolean(user);

    const loadProfile = useCallback(async () => {
        if (!profileName) return;
        setLoading(true);
        try {
            const data = await persohubApi.fetchProfile(profileName);
            setProfile(data);
        } catch (error) {
            toast.error(persohubApi.parseApiError(error, 'Failed to load profile'));
            navigate('/persohub', { replace: true });
        } finally {
            setLoading(false);
        }
    }, [profileName, navigate]);

    useEffect(() => {
        loadProfile();
    }, [loadProfile]);

    const patchPost = (nextPost) => {
        setProfile((prev) => ({
            ...prev,
            posts: (prev?.posts || []).map((item) => (item.slug_token === nextPost.slug_token ? nextPost : item)),
        }));
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
        const created = await persohubApi.createComment(slugToken, commentText);
        const fresh = await persohubApi.fetchPost(slugToken);
        patchPost(fresh);
        return created;
    };

    const handleDeletePost = async (post) => {
        setDeleteTargetPost(post);
    };

    const handleConfirmDeletePost = async () => {
        if (!deleteTargetPost) return;
        setDeleteSubmitting(true);
        try {
            await persohubApi.deleteCommunityPost(deleteTargetPost.slug_token);
            setProfile((prev) => ({
                ...prev,
                posts: (prev?.posts || []).filter((item) => item.slug_token !== deleteTargetPost.slug_token),
            }));
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

    if (loading) {
        return (
            <div className="persohub-page">
                <div className="ph-layer ph-shell">
                    <PersohubHeader />
                    <div style={{ marginTop: '0.4rem' }}>
                        <EmptyState title="Loading profile" subtitle="Fetching Persohub profile details..." />
                    </div>
                </div>
            </div>
        );
    }

    if (!profile) {
        return null;
    }

    const profilePosts = profile.posts || [];
    const profileBadges = profile.badges || [];

    return (
        <div className="persohub-page">
            <div className="ph-layer ph-shell">
                <PersohubHeader />
                <div className="ph-card ph-side-card" style={{ marginTop: '0.4rem', marginBottom: '0.8rem' }}>
                    <Link to="/persohub" className="ph-action-btn" style={{ textDecoration: 'none', width: 'fit-content' }}>
                        <ArrowLeft size={14} /> Back to feed
                    </Link>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', marginTop: '0.7rem' }}>
                        <img src={profile.image_url || 'https://placehold.co/80x80?text=PDA'} alt={profile.name} className="ph-avatar" style={{ width: '62px', height: '62px' }} />
                        <div>
                            <h1 style={{ margin: 0 }}>{profile.name}</h1>
                            <div className="ph-muted">@{profile.profile_name}</div>
                            <div className="ph-muted">{profile.profile_type}</div>
                        </div>
                    </div>
                    {profile.about ? <p style={{ marginBottom: '0.4rem' }}>{profile.about}</p> : null}
                    {profile.profile_type === 'user' ? (
                        <>
                            {profile.is_member ? (
                                <p style={{ marginTop: 0 }}>
                                    <strong>PDA Member</strong>
                                    {profile.team ? ` · ${profile.team}` : ''}
                                    {profile.designation ? ` · ${profile.designation}` : ''}
                                </p>
                            ) : (
                                <p style={{ marginTop: 0 }}>Public profile</p>
                            )}
                            {profileBadges.length > 0 ? (
                                <div>
                                    <p style={{ marginBottom: '0.4rem', fontWeight: 700 }}>Badges earned</p>
                                    <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                                        {profileBadges.map((badge) => (
                                            <span key={badge.id} className="ph-chip">{badge.title}</span>
                                        ))}
                                    </div>
                                </div>
                            ) : null}
                        </>
                    ) : null}
                    {profile.profile_type === 'community' && profile.can_edit ? (
                        <p className="ph-muted">Community admin mode enabled: posts are editable.</p>
                    ) : null}
                </div>

                {profilePosts.length === 0 ? (
                    <EmptyState title="No posts" subtitle="Nothing to show on this profile yet." />
                ) : (
                    <div className="ph-feed">
                        {profilePosts.map((post) => (
                            <PostCard
                                key={post.slug_token}
                                post={post}
                                onLike={handleLike}
                                likePending={pendingLikeSlugs.has(post.slug_token)}
                                onShare={setSharePost}
                                onHashtagClick={(hashtag) => navigate(`/persohub?hashtag=${encodeURIComponent(hashtag)}`)}
                                isUserLoggedIn={isUserLoggedIn}
                                fetchComments={persohubApi.fetchComments}
                                createComment={handleCreateComment}
                                allowModeration={Boolean(profile.can_edit)}
                                onDelete={handleDeletePost}
                                onEdit={handleEditPost}
                            />
                        ))}
                    </div>
                )}
            </div>

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
        </div>
    );
}
