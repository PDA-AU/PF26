import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, X } from 'lucide-react';
import { toast } from 'sonner';

import { useAuth } from '@/context/AuthContext';
import { persohubApi } from '@/pages/persohub/api';
import { copyTextToClipboard } from '@/utils/clipboard';
import { EmptyState, PersohubHeader, PostCard } from '@/pages/persohub/components';
import '@/pages/persohub/persohub.css';

export default function PersohubPostPage() {
    const { slugToken } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();

    const [post, setPost] = useState(null);
    const [loading, setLoading] = useState(true);
    const [shareOpen, setShareOpen] = useState(false);
    const [likePending, setLikePending] = useState(false);
    const likePendingRef = useRef(false);

    const isUserLoggedIn = Boolean(user);

    useEffect(() => {
        const loadPost = async () => {
            if (!slugToken) return;
            setLoading(true);
            try {
                const data = await persohubApi.fetchPost(slugToken);
                setPost(data);
            } catch (error) {
                toast.error(persohubApi.parseApiError(error, 'Unable to load post'));
                setPost(null);
            } finally {
                setLoading(false);
            }
        };
        loadPost();
    }, [slugToken]);

    const handleLike = async (token) => {
        if (!isUserLoggedIn) {
            toast.error('Login as PDA user to react');
            return;
        }
        if (likePendingRef.current) return;
        likePendingRef.current = true;
        setLikePending(true);
        try {
            const updated = await persohubApi.toggleLike(token);
            setPost(updated);
        } catch (error) {
            toast.error(persohubApi.parseApiError(error, 'Failed to toggle like'));
        } finally {
            likePendingRef.current = false;
            setLikePending(false);
        }
    };

    const handleCreateComment = async (token, commentText) => {
        const created = await persohubApi.createComment(token, commentText);
        const fresh = await persohubApi.fetchPost(token);
        setPost(fresh);
        return created;
    };

    return (
        <div className="persohub-page">
            <div className="ph-layer ph-shell">
                <PersohubHeader />
                <div className="ph-card ph-side-card" style={{ marginBottom: '0.9rem' }}>
                    <Link to="/persohub" className="ph-action-btn" style={{ textDecoration: 'none', width: 'fit-content' }}>
                        <ArrowLeft size={14} /> Back to feed
                    </Link>
                </div>

                {loading ? <EmptyState title="Loading post" subtitle="Fetching post details..." /> : null}
                {!loading && !post ? <EmptyState title="Post not found" subtitle="This shared link may have expired." /> : null}

                {!loading && post ? (
                    <PostCard
                        post={post}
                        onLike={handleLike}
                        likePending={likePending}
                        onShare={() => setShareOpen(true)}
                        onHashtagClick={(hashtag) => navigate(`/persohub?hashtag=${encodeURIComponent(hashtag)}`)}
                        isUserLoggedIn={isUserLoggedIn}
                        fetchComments={persohubApi.fetchComments}
                        createComment={handleCreateComment}
                        allowModeration={false}
                    />
                ) : null}
            </div>

            {shareOpen && post ? (
                <div className="ph-modal-overlay" role="dialog" aria-modal="true">
                    <div className="ph-modal">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h2 style={{ marginTop: 0 }}>Share Post</h2>
                            <button type="button" className="ph-action-btn" onClick={() => setShareOpen(false)}>
                                <X size={16} />
                            </button>
                        </div>
                        <input className="ph-input" readOnly value={post.share_url} />
                        <button
                            type="button"
                            className="ph-btn ph-btn-accent"
                            onClick={async () => {
                                try {
                                    const copied = await copyTextToClipboard(post.share_url);
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
        </div>
    );
}
