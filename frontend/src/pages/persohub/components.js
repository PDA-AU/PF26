import React, { useEffect, useMemo, useRef, useState } from 'react';
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
    Maximize2,
    Minimize2,
    Music2,
    Pause,
    Play,
    RotateCcw,
    RotateCw,
    Volume2,
    VolumeX,
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

const mediaPlayerRegistry = new Map();
let activeMediaPlayerId = null;

const registerMediaPlayer = (playerId, controls) => {
    if (!playerId || !controls) return;
    mediaPlayerRegistry.set(playerId, controls);
};

const unregisterMediaPlayer = (playerId) => {
    if (!playerId) return;
    mediaPlayerRegistry.delete(playerId);
    if (activeMediaPlayerId === playerId) {
        activeMediaPlayerId = null;
    }
};

const requestMediaStart = (playerId) => {
    if (!playerId) return;
    if (activeMediaPlayerId && activeMediaPlayerId !== playerId) {
        const controls = mediaPlayerRegistry.get(activeMediaPlayerId);
        if (controls?.pause) controls.pause();
    }
    activeMediaPlayerId = playerId;
};

const notifyMediaPause = (playerId) => {
    if (activeMediaPlayerId === playerId) {
        activeMediaPlayerId = null;
    }
};

const sortAttachmentsByOrder = (attachments) => {
    return [...(attachments || [])].sort((left, right) => {
        const leftOrder = Number.isFinite(Number(left?.order_no)) ? Number(left.order_no) : Number.MAX_SAFE_INTEGER;
        const rightOrder = Number.isFinite(Number(right?.order_no)) ? Number(right.order_no) : Number.MAX_SAFE_INTEGER;
        if (leftOrder !== rightOrder) return leftOrder - rightOrder;
        return String(left?.id || left?.s3_url || '').localeCompare(String(right?.id || right?.s3_url || ''));
    });
};

const formatAudioTime = (seconds) => {
    const value = Number(seconds);
    if (!Number.isFinite(value) || value < 0) return '--:--';
    const total = Math.floor(value);
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
};

const clampPercent = (value) => {
    if (!Number.isFinite(value)) return 0;
    return Math.min(100, Math.max(0, value));
};

const buildTimelineGradient = ({
    playedPercent,
    bufferedPercent,
    playedColor,
    bufferedColor,
    baseColor,
}) => {
    const played = clampPercent(playedPercent);
    const buffered = clampPercent(Math.max(bufferedPercent, played));
    return `linear-gradient(90deg, ${playedColor} 0%, ${playedColor} ${played}%, ${bufferedColor} ${played}%, ${bufferedColor} ${buffered}%, ${baseColor} ${buffered}%, ${baseColor} 100%)`;
};

const resolveAudioTitle = (post) => {
    const eventTitle = String(post?.event?.title || '').trim();
    if (eventTitle) return eventTitle;
    const firstLine = String(post?.description || '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find(Boolean);
    return firstLine || 'Persohub Audio';
};

const resolveAudioSubtitle = (post) => {
    const profileId = String(post?.community?.profile_id || '').trim();
    if (profileId) return `@${profileId}`;
    const communityName = String(post?.community?.name || '').trim();
    return communityName || '@persohub';
};

const PLAYBACK_RATES = [1, 1.25, 1.5, 2];
const VIDEO_PLAYBACK_RATES = [0.5, 1, 1.25, 1.5, 2];

const PersohubAudioPlayer = ({
    src,
    coverUrl = '',
    title = 'Persohub Audio',
    subtitle = '@persohub',
    playerId,
}) => {
    const audioRef = useRef(null);
    const isSeekingRef = useRef(false);
    const [isReady, setIsReady] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [buffered, setBuffered] = useState(0);
    const [playbackRate, setPlaybackRate] = useState(1);
    const [isSeeking, setIsSeeking] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [hasError, setHasError] = useState(false);

    useEffect(() => {
        registerMediaPlayer(playerId, {
            pause: () => {
                if (audioRef.current && !audioRef.current.paused) audioRef.current.pause();
            },
        });
        return () => unregisterMediaPlayer(playerId);
    }, [playerId]);

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;
        audio.playbackRate = playbackRate;
    }, [playbackRate]);

    const sliderMax = Number.isFinite(duration) && duration > 0 ? duration : 0;
    const playedPercent = sliderMax > 0 ? Math.min(100, Math.max(0, (currentTime / sliderMax) * 100)) : 0;
    const bufferedPercent = sliderMax > 0 ? Math.min(100, Math.max(0, (buffered / sliderMax) * 100)) : 0;
    const progressGradient = buildTimelineGradient({
        playedPercent,
        bufferedPercent,
        playedColor: '#fbbf24',
        bufferedColor: 'rgba(255, 255, 255, 0.28)',
        baseColor: 'rgba(255, 255, 255, 0.12)',
    });

    const handlePlayPause = async () => {
        const audio = audioRef.current;
        if (!audio) return;
        if (!audio.paused) {
            audio.pause();
            return;
        }
        requestMediaStart(playerId);
        try {
            await audio.play();
        } catch {
            setIsPlaying(false);
        }
    };

    const toggleMute = () => {
        const audio = audioRef.current;
        if (!audio) return;
        const next = !audio.muted;
        audio.muted = next;
        setIsMuted(next);
    };

    const cyclePlaybackRate = () => {
        setPlaybackRate((prev) => {
            const idx = PLAYBACK_RATES.indexOf(prev);
            return PLAYBACK_RATES[(idx + 1) % PLAYBACK_RATES.length];
        });
    };

    if (!src) return null;

    return (
        <div className="ph-audio-card" data-testid={`ph-audio-player-${playerId}`}>
            <audio
                ref={audioRef}
                className="ph-audio-native-element"
                hidden
                controls={false}
                style={{ display: 'none' }}
                src={src}
                preload="metadata"
                onLoadedMetadata={(event) => {
                    const nextDuration = Number(event.currentTarget?.duration || 0);
                    setDuration(Number.isFinite(nextDuration) ? nextDuration : 0);
                    setIsReady(true);
                    setHasError(false);
                }}
                onTimeUpdate={(event) => {
                    if (isSeekingRef.current) return;
                    setCurrentTime(Number(event.currentTarget?.currentTime || 0));
                }}
                onProgress={(event) => {
                    const media = event.currentTarget;
                    const total = Number(media?.duration || 0);
                    if (!Number.isFinite(total) || total <= 0) {
                        setBuffered(0);
                        return;
                    }
                    try {
                        const ranges = media.buffered;
                        if (!ranges || ranges.length === 0) {
                            setBuffered(0);
                            return;
                        }
                        setBuffered(Number(ranges.end(ranges.length - 1)));
                    } catch {
                        setBuffered(0);
                    }
                }}
                onPlay={() => {
                    requestMediaStart(playerId);
                    setIsPlaying(true);
                }}
                onPause={() => {
                    setIsPlaying(false);
                    notifyMediaPause(playerId);
                }}
                onEnded={() => {
                    setIsPlaying(false);
                    notifyMediaPause(playerId);
                }}
                onError={() => {
                    setHasError(true);
                    setIsReady(false);
                    setIsPlaying(false);
                }}
            />
            <div className="ph-audio-main">
                <div className="ph-audio-cover">
                    {coverUrl ? (
                        <img src={coverUrl} alt={title} />
                    ) : (
                        <div className="ph-audio-cover-fallback">
                            <Music2 size={18} />
                        </div>
                    )}
                </div>
                <div className="ph-audio-meta">
                    <p className="ph-audio-title" title={title}>{title}</p>
                    <p className="ph-audio-subtitle">{subtitle}</p>
                    {hasError ? (
                        <p className="ph-audio-error">
                            Audio preview unavailable. <a href={src} target="_blank" rel="noreferrer">Open audio</a>
                        </p>
                    ) : null}
                </div>
            </div>
            <div className="ph-audio-progress-wrap">
                <input
                    type="range"
                    min={0}
                    max={sliderMax || 0}
                    step="0.1"
                    value={Math.min(currentTime, sliderMax || currentTime || 0)}
                    disabled={!isReady || sliderMax <= 0 || hasError}
                    className="ph-audio-progress"
                    style={{
                        '--progress-bg': progressGradient,
                    }}
                    aria-label="Seek audio"
                    onMouseDown={() => {
                        isSeekingRef.current = true;
                        setIsSeeking(true);
                    }}
                    onMouseUp={() => {
                        isSeekingRef.current = false;
                        setIsSeeking(false);
                    }}
                    onTouchStart={() => {
                        isSeekingRef.current = true;
                        setIsSeeking(true);
                    }}
                    onTouchEnd={() => {
                        isSeekingRef.current = false;
                        setIsSeeking(false);
                    }}
                    onChange={(event) => {
                        const next = Number(event.target.value || 0);
                        setCurrentTime(next);
                        if (audioRef.current) audioRef.current.currentTime = next;
                    }}
                />
            </div>
            <div className="ph-audio-controls">
                <button type="button" className="ph-audio-btn ph-audio-btn-primary" onClick={handlePlayPause} disabled={hasError}>
                    {isPlaying ? <Pause size={14} /> : <Play size={14} />}
                    {isPlaying ? 'Pause' : 'Play'}
                </button>
                <button type="button" className="ph-audio-btn" onClick={toggleMute} disabled={hasError}>
                    {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                </button>
                <button type="button" className="ph-audio-btn" onClick={cyclePlaybackRate} disabled={hasError}>
                    {playbackRate}x
                </button>
                <div className="ph-audio-time">
                    <span>{formatAudioTime(currentTime)}</span>
                    <span className="ph-audio-time-sep">/</span>
                    <span>{formatAudioTime(duration)}</span>
                    {isSeeking ? <span className="ph-audio-time-seek">seeking</span> : null}
                </div>
            </div>
        </div>
    );
};

const resolveVideoTitle = (post, attachment) => {
    const eventTitle = String(post?.event?.title || '').trim();
    if (eventTitle) return eventTitle;
    const attachmentName = String(attachment?.file_name || '').trim();
    if (attachmentName) return attachmentName;
    const firstLine = String(post?.description || '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find(Boolean);
    return firstLine || 'Persohub Video';
};

const PersohubVideoPlayer = ({
    src,
    playerId,
    posterUrl = '',
    title = 'Persohub Video',
}) => {
    const containerRef = useRef(null);
    const videoRef = useRef(null);
    const volumeWrapRef = useRef(null);
    const hideControlsTimerRef = useRef(null);
    const isSeekingRef = useRef(false);

    const [isReady, setIsReady] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [buffered, setBuffered] = useState(0);
    const [playbackRate, setPlaybackRate] = useState(1);
    const [isSeeking, setIsSeeking] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [volume, setVolume] = useState(1);
    const [hasError, setHasError] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [controlsVisible, setControlsVisible] = useState(true);
    const [volumeOpen, setVolumeOpen] = useState(false);

    useEffect(() => {
        registerMediaPlayer(playerId, {
            pause: () => {
                if (videoRef.current && !videoRef.current.paused) videoRef.current.pause();
            },
        });
        return () => unregisterMediaPlayer(playerId);
    }, [playerId]);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;
        video.playbackRate = playbackRate;
    }, [playbackRate]);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;
        video.muted = isMuted;
        video.volume = volume;
    }, [isMuted, volume]);

    useEffect(() => {
        const getFullscreenElement = () => (
            document.fullscreenElement
            || document.webkitFullscreenElement
            || document.mozFullScreenElement
            || document.msFullscreenElement
            || null
        );
        const onFullscreenChange = () => {
            const holder = containerRef.current;
            const current = getFullscreenElement();
            setIsFullscreen(Boolean(holder && current && (current === holder || holder.contains(current))));
        };
        document.addEventListener('fullscreenchange', onFullscreenChange);
        document.addEventListener('webkitfullscreenchange', onFullscreenChange);

        const video = videoRef.current;
        const onWebkitBeginFullscreen = () => setIsFullscreen(true);
        const onWebkitEndFullscreen = () => setIsFullscreen(false);
        if (video) {
            video.addEventListener('webkitbeginfullscreen', onWebkitBeginFullscreen);
            video.addEventListener('webkitendfullscreen', onWebkitEndFullscreen);
        }

        return () => {
            document.removeEventListener('fullscreenchange', onFullscreenChange);
            document.removeEventListener('webkitfullscreenchange', onFullscreenChange);
            if (video) {
                video.removeEventListener('webkitbeginfullscreen', onWebkitBeginFullscreen);
                video.removeEventListener('webkitendfullscreen', onWebkitEndFullscreen);
            }
        };
    }, []);

    useEffect(() => {
        return () => {
            if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current);
        };
    }, []);

    useEffect(() => {
        if (!volumeOpen) return undefined;
        const handlePointerDown = (event) => {
            if (!volumeWrapRef.current?.contains(event.target)) {
                setVolumeOpen(false);
            }
        };
        document.addEventListener('mousedown', handlePointerDown);
        document.addEventListener('touchstart', handlePointerDown);
        return () => {
            document.removeEventListener('mousedown', handlePointerDown);
            document.removeEventListener('touchstart', handlePointerDown);
        };
    }, [volumeOpen]);

    const sliderMax = Number.isFinite(duration) && duration > 0 ? duration : 0;
    const playedPercent = sliderMax > 0 ? Math.min(100, Math.max(0, (currentTime / sliderMax) * 100)) : 0;
    const bufferedPercent = sliderMax > 0 ? Math.min(100, Math.max(0, (buffered / sliderMax) * 100)) : 0;
    const progressGradient = buildTimelineGradient({
        playedPercent,
        bufferedPercent,
        playedColor: '#f43f5e',
        bufferedColor: 'rgba(255, 255, 255, 0.24)',
        baseColor: 'rgba(255, 255, 255, 0.1)',
    });

    const scheduleHideControls = () => {
        if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current);
        if (!isPlaying) return;
        hideControlsTimerRef.current = setTimeout(() => {
            setControlsVisible(false);
        }, 1800);
    };

    const showControls = () => {
        setControlsVisible(true);
        scheduleHideControls();
    };

    const handlePlayPause = async () => {
        const video = videoRef.current;
        if (!video) return;
        if (!video.paused) {
            video.pause();
            return;
        }
        requestMediaStart(playerId);
        try {
            await video.play();
        } catch {
            setIsPlaying(false);
        }
    };

    const handleVolumeButtonClick = () => {
        setVolumeOpen((prev) => !prev);
        showControls();
    };

    const cyclePlaybackRate = () => {
        setPlaybackRate((prev) => {
            const idx = VIDEO_PLAYBACK_RATES.indexOf(prev);
            return VIDEO_PLAYBACK_RATES[(idx + 1) % VIDEO_PLAYBACK_RATES.length];
        });
    };

    const jumpBySeconds = (deltaSeconds) => {
        const video = videoRef.current;
        if (!video || hasError) return;
        const mediaDuration = Number(video.duration || duration || 0);
        const maxTime = Number.isFinite(mediaDuration) && mediaDuration > 0 ? mediaDuration : Number.MAX_SAFE_INTEGER;
        const current = Number(video.currentTime || 0);
        const next = Math.min(maxTime, Math.max(0, current + Number(deltaSeconds || 0)));
        video.currentTime = next;
        setCurrentTime(next);
        showControls();
    };

    const toggleFullscreen = async () => {
        const holder = containerRef.current;
        const video = videoRef.current;
        if (!holder && !video) return;
        const activeFullscreenElement = (
            document.fullscreenElement
            || document.webkitFullscreenElement
            || document.mozFullScreenElement
            || document.msFullscreenElement
            || null
        );
        try {
            if (!activeFullscreenElement && holder && typeof holder.requestFullscreen === 'function') {
                await holder.requestFullscreen();
                return;
            }
            if (activeFullscreenElement && typeof document.exitFullscreen === 'function') {
                await document.exitFullscreen();
                return;
            }
            if (!isFullscreen && video && typeof video.webkitEnterFullscreen === 'function') {
                video.webkitEnterFullscreen();
                return;
            }
            if (isFullscreen && video && typeof video.webkitExitFullscreen === 'function') {
                video.webkitExitFullscreen();
            }
        } catch {
            // no-op
        }
    };

    if (!src) return null;

    return (
        <div
            ref={containerRef}
            className="ph-video-card"
            data-testid={`ph-video-player-${playerId}`}
            onMouseMove={showControls}
            onTouchStart={showControls}
            onFocus={showControls}
        >
            <video
                ref={videoRef}
                src={src}
                poster={posterUrl || undefined}
                className="ph-video-canvas"
                controls={false}
                playsInline
                preload="metadata"
                onClick={handlePlayPause}
                onLoadedMetadata={(event) => {
                    const nextDuration = Number(event.currentTarget?.duration || 0);
                    setDuration(Number.isFinite(nextDuration) ? nextDuration : 0);
                    setIsReady(true);
                    setHasError(false);
                }}
                onTimeUpdate={(event) => {
                    if (isSeekingRef.current) return;
                    setCurrentTime(Number(event.currentTarget?.currentTime || 0));
                }}
                onProgress={(event) => {
                    const media = event.currentTarget;
                    const total = Number(media?.duration || 0);
                    if (!Number.isFinite(total) || total <= 0) {
                        setBuffered(0);
                        return;
                    }
                    try {
                        const ranges = media.buffered;
                        if (!ranges || ranges.length === 0) {
                            setBuffered(0);
                            return;
                        }
                        setBuffered(Number(ranges.end(ranges.length - 1)));
                    } catch {
                        setBuffered(0);
                    }
                }}
                onPlay={() => {
                    requestMediaStart(playerId);
                    setIsPlaying(true);
                    scheduleHideControls();
                }}
                onPause={() => {
                    setIsPlaying(false);
                    setControlsVisible(true);
                    notifyMediaPause(playerId);
                }}
                onEnded={() => {
                    setIsPlaying(false);
                    setControlsVisible(true);
                    notifyMediaPause(playerId);
                }}
                onError={() => {
                    setHasError(true);
                    setIsPlaying(false);
                    setIsReady(false);
                    setControlsVisible(true);
                }}
            />

            <div className={`ph-video-controls ${controlsVisible || !isPlaying ? 'is-visible' : ''}`}>
                <div className="ph-video-progress-wrap">
                    <input
                        type="range"
                        min={0}
                        max={sliderMax || 0}
                        step="0.1"
                        value={Math.min(currentTime, sliderMax || currentTime || 0)}
                        disabled={!isReady || sliderMax <= 0 || hasError}
                        className="ph-video-progress"
                        style={{
                            '--progress-bg': progressGradient,
                        }}
                        aria-label="Seek video"
                        onMouseDown={() => {
                            isSeekingRef.current = true;
                            setIsSeeking(true);
                        }}
                        onMouseUp={() => {
                            isSeekingRef.current = false;
                            setIsSeeking(false);
                            scheduleHideControls();
                        }}
                        onTouchStart={() => {
                            isSeekingRef.current = true;
                            setIsSeeking(true);
                        }}
                        onTouchEnd={() => {
                            isSeekingRef.current = false;
                            setIsSeeking(false);
                            scheduleHideControls();
                        }}
                        onChange={(event) => {
                            const next = Number(event.target.value || 0);
                            setCurrentTime(next);
                            if (videoRef.current) videoRef.current.currentTime = next;
                        }}
                    />
                </div>
                <div className="ph-video-controls-row">
                    <button type="button" className="ph-video-btn ph-video-btn-primary" onClick={handlePlayPause} disabled={hasError}>
                        {isPlaying ? <Pause size={14} /> : <Play size={14} />}
                    </button>
                    <button
                        type="button"
                        className="ph-video-btn ph-video-jump-btn"
                        onClick={() => jumpBySeconds(-10)}
                        disabled={hasError}
                        aria-label="Back 10 seconds"
                    >
                        <RotateCcw size={13} />
                    </button>
                    <button
                        type="button"
                        className="ph-video-btn ph-video-jump-btn"
                        onClick={() => jumpBySeconds(10)}
                        disabled={hasError}
                        aria-label="Forward 10 seconds"
                    >
                        <RotateCw size={13} />
                    </button>
                    <div className="ph-video-volume-wrap" ref={volumeWrapRef}>
                        <button
                            type="button"
                            className="ph-video-btn"
                            onClick={handleVolumeButtonClick}
                            disabled={hasError}
                            aria-label={volumeOpen ? 'Hide volume slider' : 'Show volume slider'}
                        >
                            {isMuted || volume <= 0 ? <VolumeX size={14} /> : <Volume2 size={14} />}
                        </button>
                        {volumeOpen ? (
                            <div className="ph-video-volume-pop">
                                <input
                                    type="range"
                                    min={0}
                                    max={1}
                                    step="0.05"
                                    value={isMuted ? 0 : volume}
                                    className="ph-video-volume"
                                    aria-label="Video volume"
                                    aria-orientation="vertical"
                                    onChange={(event) => {
                                        const next = Math.min(1, Math.max(0, Number(event.target.value || 0)));
                                        setVolume(next);
                                        setIsMuted(next <= 0);
                                    }}
                                />
                            </div>
                        ) : null}
                    </div>
                    <button type="button" className="ph-video-btn ph-video-speed" onClick={cyclePlaybackRate} disabled={hasError}>
                        {playbackRate}x
                    </button>
                    <div className="ph-video-time">
                        <span>{formatAudioTime(currentTime)}</span>
                        <span className="ph-video-time-sep">/</span>
                        <span>{formatAudioTime(duration)}</span>
                        {isSeeking ? <span className="ph-video-time-seek">seeking</span> : null}
                    </div>
                    <button type="button" className="ph-video-btn ph-video-fullscreen" onClick={toggleFullscreen} disabled={hasError}>
                        {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                    </button>
                </div>
            </div>
            {hasError ? (
                <div className="ph-video-error">
                    Video preview unavailable. <a href={src} target="_blank" rel="noreferrer">Open video</a>
                </div>
            ) : null}
            {!hasError ? <div className="ph-video-title">{title}</div> : null}
        </div>
    );
};

export const AttachmentCarousel = ({ attachments, post = null }) => {
    const inputAttachments = useMemo(
        () => (Array.isArray(attachments) ? attachments : []),
        [attachments],
    );
    const mediaAttachments = useMemo(
        () => inputAttachments.filter((entry) => String(entry?.attachment_kind || '').toLowerCase() !== 'audio'),
        [inputAttachments],
    );
    const audioAttachments = useMemo(
        () => sortAttachmentsByOrder(
            inputAttachments.filter((entry) => String(entry?.attachment_kind || '').toLowerCase() === 'audio'),
        ),
        [inputAttachments],
    );
    const imageAttachments = useMemo(
        () => sortAttachmentsByOrder(
            mediaAttachments.filter((entry) => String(entry?.attachment_kind || '').toLowerCase() === 'image'),
        ),
        [mediaAttachments],
    );

    const [index, setIndex] = useState(0);
    const mediaTotal = mediaAttachments.length || 0;
    const item = mediaTotal ? mediaAttachments[index] : null;

    useEffect(() => {
        if (index < mediaTotal) return;
        setIndex(0);
    }, [index, mediaTotal]);

    if (!mediaTotal && !audioAttachments.length) return null;

    const sharedCoverUrl = imageAttachments[0]?.s3_url || '';
    const audioTitle = resolveAudioTitle(post);
    const audioSubtitle = resolveAudioSubtitle(post);
    const videoPosterUrl = sharedCoverUrl;

    const goPrev = () => setIndex((prev) => (prev - 1 + mediaTotal) % mediaTotal);
    const goNext = () => setIndex((prev) => (prev + 1) % mediaTotal);

    const renderAttachment = () => {
        if (!item) return null;
        const kind = String(item?.attachment_kind || '').toLowerCase();
        if (kind === 'image') {
            return <img src={item.s3_url} alt="post attachment" className="ph-attachment-slide" loading="lazy" />;
        }
        if (kind === 'video') {
            return (
                <PersohubVideoPlayer
                    src={item.s3_url}
                    playerId={`${post?.slug_token || 'post'}:video:${item?.id || item?.order_no || index}`}
                    posterUrl={videoPosterUrl}
                    title={resolveVideoTitle(post, item)}
                />
            );
        }
        if (kind === 'pdf') {
            return <PdfAttachmentPreview pdfUrl={item.s3_url} previewImageUrls={item.preview_image_urls || []} />;
        }
        return (
            <div className="ph-attachment-slide ph-attachment-fallback">
                <p className="ph-muted">Attachment</p>
                <a href={item.s3_url} target="_blank" rel="noreferrer" className="ph-btn">Open File</a>
            </div>
        );
    };

    return (
        <div className={`ph-attachment ${!mediaTotal && audioAttachments.length ? 'ph-attachment-audio-only' : ''}`} data-testid="ph-attachment-carousel">
            {mediaTotal ? (
                <>
                    {renderAttachment()}
                    {mediaTotal > 1 ? (
                        <>
                            <button type="button" className="ph-slide-btn ph-slide-btn-left" onClick={goPrev} data-testid="ph-attachment-prev">
                                <ChevronLeft size={18} />
                            </button>
                            <button type="button" className="ph-slide-btn ph-slide-btn-right" onClick={goNext} data-testid="ph-attachment-next">
                                <ChevronRight size={18} />
                            </button>
                            <div className="ph-dots">
                                {mediaAttachments.map((entry, dotIndex) => (
                                    <button
                                        key={`${entry?.id || entry?.s3_url || dotIndex}`}
                                        type="button"
                                        className={`ph-dot ${dotIndex === index ? 'ph-dot-active' : ''}`}
                                        onClick={() => setIndex(dotIndex)}
                                        aria-label={`Attachment ${dotIndex + 1}`}
                                    />
                                ))}
                            </div>
                        </>
                    ) : null}
                </>
            ) : null}

            {audioAttachments.length ? (
                <div className="ph-audio-cover-player">
                    {audioAttachments.map((audioItem, audioIdx) => (
                        <div key={`${audioItem?.id || audioItem?.s3_url || audioIdx}`} className="ph-audio-track-row">
                            <PersohubAudioPlayer
                                src={audioItem?.s3_url}
                                coverUrl={sharedCoverUrl}
                                title={audioTitle}
                                subtitle={audioSubtitle}
                                playerId={`${post?.slug_token || 'post'}:${audioItem?.id || audioItem?.order_no || audioIdx}`}
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
    allowEventPostModeration = false,
    onDelete,
    onEdit,
    onHide,
    hidePending = false,
    onExplore,
    compactEventMobile = false,
}) => {
    const READ_MORE_PREVIEW_LIMIT = 800;
    const fallbackLogo = 'https://placehold.co/64x64?text=PDA';
    const communityLogoUrl = String(post?.community?.logo_url || '').trim();
    const communityClubLogoUrl = String(post?.community?.club_logo_url || '').trim();
    const resolvedCommunityAvatar = communityLogoUrl || communityClubLogoUrl || fallbackLogo;
    const [communityAvatarSrc, setCommunityAvatarSrc] = useState(
        resolvedCommunityAvatar,
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
        setCommunityAvatarSrc(resolvedCommunityAvatar);
    }, [resolvedCommunityAvatar]);

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
    const compactHashtags = Array.from(new Set([
        matchedEventTag,
        sympoTag,
        ...allHashtags,
    ].filter(Boolean)));
    const compactDescription = compactHashtags
        .map((tag) => `#${tag}`)
        .join(' ');
    const hasFullDescription = Boolean(String(post.description || '').trim());
    const shouldShowCompactPreview = Boolean(shouldUseCompactEventMobile && !expanded);
    const renderedDescription = shouldShowCompactPreview
        ? compactDescription
        : (expanded ? (post.description || '') : visibleText);
    const canEditDeletePost = Boolean(allowModeration && (!isEventPost || allowEventPostModeration));
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
                            if (communityAvatarSrc === (communityClubLogoUrl || fallbackLogo)) {
                                setCommunityAvatarSrc(fallbackLogo);
                                return;
                            }
                            setCommunityAvatarSrc(communityClubLogoUrl || fallbackLogo);
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
                    {showInlineModeration && canEditDeletePost ? (
                        <button type="button" className="ph-action-btn" onClick={() => onEdit?.(post)} data-testid={`ph-post-edit-${post.slug_token}`}>
                            <Pencil size={14} />
                        </button>
                    ) : null}
                    {showInlineModeration && canEditDeletePost ? (
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
                <AttachmentCarousel attachments={post.attachments} post={post} />

                <div className="ph-desc">
                    <div className={shouldShowCompactPreview ? 'ph-desc-mobile-event-compact' : ''}>
                        <ParsedDescription
                            description={renderedDescription}
                            onHashtagClick={onHashtagClick}
                        />
                    </div>
                    {shouldUseCompactEventMobile && hasFullDescription ? (
                        <span
                            role="button"
                            tabIndex={0}
                            className="ph-muted"
                            onClick={() => setExpanded((prev) => !prev)}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault();
                                    setExpanded((prev) => !prev);
                                }
                            }}
                            style={{ cursor: 'pointer', textDecoration: 'underline' }}
                        >
                            {expanded ? 'Read less' : 'Read more'}
                        </span>
                    ) : null}
                    {!shouldUseCompactEventMobile && showReadMore ? (
                        <span
                            role="button"
                            tabIndex={0}
                            className="ph-muted"
                            onClick={() => setExpanded((prev) => !prev)}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault();
                                    setExpanded((prev) => !prev);
                                }
                            }}
                            style={{ cursor: 'pointer', textDecoration: 'underline' }}
                        >
                            {expanded ? 'Read less' : 'Read more'}
                        </span>
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
                            {canEditDeletePost ? (
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
                            {canEditDeletePost ? (
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
