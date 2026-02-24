import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { ArrowLeft, QrCode, X } from 'lucide-react';
import { toast } from 'sonner';

import { useAuth } from '@/context/AuthContext';
import PdaFooter from '@/components/layout/PdaFooter';
import PdaHeader from '@/components/layout/PdaHeader';
import BadgeRevealModal from '@/components/common/BadgeRevealModal';
import badgeUnlockVideo from '@/assets/loading.mp4';
import zestAvatar from '@/assets/zest.png';
import zynaAvatar from '@/assets/zyna.png';
import { compressImageToWebp } from '@/utils/imageCompression';
import { copyTextToClipboard } from '@/utils/clipboard';
import { persohubApi } from '@/pages/persohub/api';
import { CommunityPostEditModal, ConfirmModal, EmptyState, PostCard } from '@/pages/persohub/components';
import '@/pages/persohub/persohub.css';

const normalizeProfileImageUrl = (value) => {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    const lowered = raw.toLowerCase();
    if (lowered === 'null' || lowered === 'undefined' || lowered === 'none' || lowered === 'n/a') {
        return '';
    }
    return raw;
};

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
    const [profileQrOpen, setProfileQrOpen] = useState(false);
    const [profileQrImageUrl, setProfileQrImageUrl] = useState('');
    const [profileQrLoading, setProfileQrLoading] = useState(false);
    const [profileAvatarSrc, setProfileAvatarSrc] = useState('https://placehold.co/80x80?text=PDA');
    const [badgeModalOpen, setBadgeModalOpen] = useState(false);
    const [selectedBadge, setSelectedBadge] = useState(null);

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

    useEffect(() => {
        const fallback = 'https://placehold.co/80x80?text=PDA';
        const genderValue = String(profile?.gender || '').trim().toLowerCase();
        const userFallbackAvatar = genderValue === 'female' ? zynaAvatar : zestAvatar;
        const sanitizedProfileImage = normalizeProfileImageUrl(profile?.image_url);
        const next = sanitizedProfileImage
            || (profile?.profile_type === 'community' ? profile?.community?.club_logo_url : userFallbackAvatar)
            || fallback;
        setProfileAvatarSrc(next);
    }, [profile?.image_url, profile?.community?.club_logo_url, profile?.profile_type, profile?.gender]);

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

    const handleOpenProfileQr = async () => {
        const targetProfileName = String(profile?.profile_name || profileName || '').trim();
        if (!targetProfileName) {
            toast.error('Profile URL unavailable');
            return;
        }
        setProfileQrLoading(true);
        try {
            const base = window.location.origin;
            const profileUrl = `${base}/persohub/${encodeURIComponent(targetProfileName)}`;
            const dataUrl = await QRCode.toDataURL(profileUrl, {
                width: 360,
                margin: 1,
                color: {
                    dark: '#000000',
                    light: '#FFFFFF',
                },
            });
            setProfileQrImageUrl(dataUrl);
            setProfileQrOpen(true);
        } catch {
            toast.error('Failed to generate profile QR');
        } finally {
            setProfileQrLoading(false);
        }
    };

    const handleOpenBadgeModal = (badge) => {
        if (!badge) return;
        setSelectedBadge({
            title: badge.title || 'Badge',
            imageUrl: badge.image_url || '',
            revealVideoUrl: badge.reveal_video_url || '',
            subtitle: badge.place || '',
            userName: profile?.name || '',
            regno: profile?.regno || profile?.registration_no || '',
        });
        setBadgeModalOpen(true);
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-[#fffdf5] text-black flex flex-col">
                <PdaHeader />
                <main className="relative isolate flex-1 overflow-hidden">
                    <div className="relative z-10 mx-auto w-full max-w-7xl space-y-6 px-4 py-10 sm:px-6 lg:px-8 lg:py-12">
                        <section className="rounded-md border-4 border-black bg-white p-6 shadow-[8px_8px_0px_0px_#000000]">
                            <p className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-[#8B5CF6]">Persohub</p>
                            <h1 className="mt-2 font-heading text-4xl font-black uppercase tracking-tight">Public Profile</h1>
                            <p className="mt-2 text-sm font-medium text-slate-700">Loading profile details...</p>
                            <div className="mt-4">
                                <EmptyState title="Loading profile" subtitle="Fetching Persohub profile details..." />
                            </div>
                        </section>
                    </div>
                </main>
                <PdaFooter />
            </div>
        );
    }

    if (!profile) {
        return null;
    }

    const profilePosts = profile.posts || [];
    const profileBadges = profile.badges || [];
    const totalLikes = profilePosts.reduce((sum, post) => sum + Number(post?.like_count || 0), 0);
    const totalComments = profilePosts.reduce((sum, post) => sum + Number(post?.comment_count || 0), 0);
    const panelClass = 'rounded-md border-4 border-black bg-white p-6 shadow-[8px_8px_0px_0px_#000000]';
    const tileClass = 'rounded-md border-2 border-black bg-[#fffdf0] p-4 shadow-neo';

    return (
        <div className="min-h-screen bg-[#fffdf5] text-black flex flex-col">
            <PdaHeader />
            <main className="relative isolate flex-1 overflow-hidden">
                <div className="pointer-events-none absolute inset-0 z-0">
                    <div className="absolute -left-10 top-20 h-24 w-24 rotate-12 border-4 border-black bg-[#8B5CF6]" />
                    <div className="absolute right-8 top-14 h-12 w-12 border-4 border-black bg-[#FDE047]" />
                    <div className="absolute bottom-20 right-[8%] h-16 w-16 rotate-45 border-4 border-black bg-[#C4B5FD]" />
                </div>
                <div className="relative z-10 mx-auto w-full max-w-7xl space-y-8 px-4 py-10 sm:px-6 lg:px-8 lg:py-12">
                    <section className={`${panelClass} overflow-hidden`}>
                        <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
                            <div>
                                <p className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-[#8B5CF6]">Persohub Public Profile</p>
                                <h1 className="mt-2 font-heading text-4xl font-black uppercase tracking-tight">{profile.name}</h1>
                                <p className="mt-2 text-sm font-medium text-slate-700">
                                    Explore identity, credibility, and timeline activity in one public profile view.
                                </p>
                                <div className="mt-4 flex flex-wrap gap-2">
                                    <Link to="/persohub" className="ph-action-btn" style={{ textDecoration: 'none', width: 'fit-content' }}>
                                        <ArrowLeft size={14} /> Back to feed
                                    </Link>
                                    <button
                                        type="button"
                                        className="ph-action-btn"
                                        onClick={handleOpenProfileQr}
                                        disabled={profileQrLoading}
                                    >
                                        <QrCode size={14} />
                                        {profileQrLoading ? 'Generating...' : 'Profile QR'}
                                    </button>
                                </div>
                                <div className="mt-5 flex flex-wrap items-center gap-4 rounded-md border-2 border-black bg-[#fffdf0] p-4 shadow-neo">
                                    <img
                                        src={profileAvatarSrc}
                                        alt={profile.name}
                                        className="h-20 w-20 border-2 border-black object-cover"
                                        onError={() => {
                                            const fallback = 'https://placehold.co/80x80?text=PDA';
                                            const genderValue = String(profile?.gender || '').trim().toLowerCase();
                                            const userFallbackAvatar = genderValue === 'female' ? zynaAvatar : zestAvatar;
                                            const secondChoice = profile?.profile_type === 'community'
                                                ? (profile?.community?.club_logo_url || fallback)
                                                : (userFallbackAvatar || fallback);
                                            if (profileAvatarSrc === secondChoice) {
                                                setProfileAvatarSrc(fallback);
                                                return;
                                            }
                                            setProfileAvatarSrc(secondChoice);
                                        }}
                                    />
                                    <div className="space-y-1">
                                        <p className="font-heading text-xl font-black tracking-tight">{profile.name}</p>
                                        <p className="font-mono text-xs font-bold tracking-[0.12em] text-[#8B5CF6]">@{profile.profile_name}</p>
                                        <p className="font-mono text-xs font-bold uppercase tracking-[0.12em] text-slate-600">{profile.profile_type}</p>
                                    </div>
                                    <div className="ml-auto">
                                        <span className="inline-flex items-center rounded-md border-2 border-black bg-[#C4B5FD] px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] shadow-neo">
                                            {profile.profile_type === 'community' ? 'Community' : (profile.is_member ? 'PDA Member' : 'Public User')}
                                        </span>
                                    </div>
                                </div>
                                {profile.about ? (
                                    <p className="mt-4 rounded-md border-2 border-black bg-white p-3 text-sm font-medium text-slate-700 shadow-neo">
                                        {profile.about}
                                    </p>
                                ) : null}
                            </div>
                            <div className="relative hidden min-h-[300px] overflow-hidden border-4 border-black bg-[#11131a] shadow-[8px_8px_0px_0px_#000000] lg:block">
                                <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,#fde047_0%,transparent_35%),radial-gradient(circle_at_85%_15%,#c4b5fd_0%,transparent_30%),radial-gradient(circle_at_50%_80%,#8b5cf6_0%,transparent_40%)] opacity-70" />
                                <div className="relative z-10 flex h-full flex-col justify-between p-5 text-white">
                                    <p className="inline-flex w-fit rounded-md border-2 border-black bg-[#FDE047] px-3 py-1 font-mono text-xs font-bold uppercase tracking-[0.14em] text-black">
                                        Profile Snapshot
                                    </p>
                                    <div>
                                        <h2 className="font-heading text-3xl font-black uppercase tracking-tight">Discover.</h2>
                                        <h2 className="font-heading text-3xl font-black uppercase tracking-tight text-[#FDE047]">Connect.</h2>
                                        <h2 className="font-heading text-3xl font-black uppercase tracking-tight text-[#C4B5FD]">Contribute.</h2>
                                       
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>
                    <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
                        <div className={panelClass}>
                            <h2 className="font-heading text-3xl font-black uppercase tracking-tight">Profile Details</h2>
                            <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                <div className={tileClass}>
                                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-600">Posts</p>
                                    <p className="mt-1 font-heading text-3xl font-black">{profilePosts.length}</p>
                                </div>
                                <div className={tileClass}>
                                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-600">Total Likes</p>
                                    <p className="mt-1 font-heading text-3xl font-black">{totalLikes}</p>
                                </div>
                                <div className={tileClass}>
                                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-600">Total Comments</p>
                                    <p className="mt-1 font-heading text-3xl font-black">{totalComments}</p>
                                </div>
                                <div className={tileClass}>
                                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-600">Badges</p>
                                    <p className="mt-1 font-heading text-3xl font-black">{profileBadges.length}</p>
                                </div>
                            </div>
                            {profile.profile_type === 'user' ? (
                                <p className="mt-4 text-sm font-medium text-slate-700">
                                    {profile.is_member ? 'PDA Member' : 'Public user'}
                                    {profile.team ? ` · ${profile.team}` : ''}
                                    {profile.designation ? ` · ${profile.designation}` : ''}
                                </p>
                            ) : null}
                            {profile.profile_type === 'community' && profile.can_edit ? (
                                <p className="mt-4 text-sm font-medium text-slate-700">Community admin mode enabled: posts are editable.</p>
                            ) : null}
                        </div>
                        <div className={panelClass}>
                            <h2 className="font-heading text-3xl font-black uppercase tracking-tight">Badges</h2>
                            {profileBadges.length === 0 ? (
                                <p className="mt-4 rounded-md border-2 border-black bg-[#fffdf0] p-4 text-sm font-medium text-slate-700 shadow-neo">
                                    No badges available for this profile yet.
                                </p>
                            ) : (
                                <div className="mt-4 ph-badge-grid-scroll" role="list" aria-label="Profile badges">
                                    {profileBadges.map((badge) => (
                                        <button
                                            key={badge.id}
                                            type="button"
                                            className="ph-badge-card"
                                            onClick={() => handleOpenBadgeModal(badge)}
                                            role="listitem"
                                        >
                                            <div className="ph-badge-media">
                                                {badge.image_url ? (
                                                    <img src={badge.image_url} alt={badge.title || 'Badge'} className="ph-badge-image" />
                                                ) : (
                                                    <div className="ph-badge-fallback">Badge</div>
                                                )}
                                            </div>
                                            <div className="ph-badge-copy">
                                                <p className="ph-badge-title">{badge.title || 'Badge'}</p>
                                                <p className="ph-badge-meta">{badge.place || 'Achievement'}</p>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </section>

                    <section className={panelClass}>
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <h2 className="font-heading text-3xl font-black uppercase tracking-tight">Public Timeline</h2>
                            <span className="rounded-md border-2 border-black bg-[#FDE047] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] shadow-neo">
                                Posts: {profilePosts.length}
                            </span>
                        </div>
                        {profilePosts.length === 0 ? (
                            <div className="mt-4">
                                <EmptyState title="No posts" subtitle="Nothing to show on this profile yet." />
                            </div>
                        ) : (
                            <div className="mt-5 ph-feed">
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
                    </section>
                </div>
            </main>
            <PdaFooter />

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

            {profileQrOpen ? (
                <div className="ph-modal-overlay" role="dialog" aria-modal="true">
                    <div className="ph-modal">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h2 style={{ marginTop: 0 }}>Profile QR</h2>
                            <button type="button" className="ph-action-btn" onClick={() => setProfileQrOpen(false)}>
                                <X size={16} />
                            </button>
                        </div>
                        <p className="ph-muted" style={{ marginTop: 0 }}>Scan to open this public Persohub profile.</p>
                        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.7rem' }}>
                            {profileQrImageUrl ? (
                                <img src={profileQrImageUrl} alt="Profile QR" className="h-72 w-72 max-w-full" />
                            ) : (
                                <p className="ph-muted">Unable to render QR.</p>
                            )}
                        </div>
                        <button type="button" className="ph-btn ph-btn-accent" onClick={() => setProfileQrOpen(false)}>
                            Close
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

            <BadgeRevealModal
                open={badgeModalOpen}
                onOpenChange={setBadgeModalOpen}
                badge={selectedBadge}
                videoSrc={selectedBadge?.revealVideoUrl || badgeUnlockVideo}
                switchDelayMs={3000}
            />
        </div>
    );
}
