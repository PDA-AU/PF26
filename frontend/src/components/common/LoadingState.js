import React, { useEffect, useMemo, useRef, useState } from 'react';
import loadingVideo from '@/assets/loading.webm';

export default function LoadingState({
    fullScreen = false,
    variant = 'card',
    message = 'Loading...',
    minDurationMs = 400,
    containerClassName = '',
    cardClassName = '',
}) {
    const [videoFailed, setVideoFailed] = useState(false);
    const videoRef = useRef(null);
    const minDurationAttr = Number.isFinite(Number(minDurationMs)) ? Math.max(0, Number(minDurationMs)) : 400;
    const loadingVideoMp4 = useMemo(() => loadingVideo.replace(/\.webm(\?.*)?$/i, '.mp4$1'), []);
    const sharedVideoProps = useMemo(() => ({
        autoPlay: true,
        loop: true,
        muted: true,
        playsInline: true,
        preload: 'auto',
    }), []);

    const renderLoaderMedia = (className) => {
        if (videoFailed) {
            return <div className={`loading-spinner ${className}`.trim()}></div>;
        }
        return (
            <video
                ref={videoRef}
                {...sharedVideoProps}
                src={loadingVideo}
                controls={false}
                disablePictureInPicture
                controlsList="nodownload nofullscreen noplaybackrate noremoteplayback"
                className={`${className} pointer-events-none select-none`.trim()}
                onError={() => setVideoFailed(true)}
            >
                <source src={loadingVideoMp4} type="video/mp4" />
                <source src={loadingVideo} type="video/webm" />
            </video>
        );
    };

    useEffect(() => {
        if (videoFailed) return;
        const node = videoRef.current;
        if (!node) return;
        const playPromise = node.play?.();
        if (playPromise && typeof playPromise.catch === 'function') {
            playPromise.catch(() => {
                setVideoFailed(true);
            });
        }
    }, [videoFailed]);

    if (fullScreen) {
        return (
            <div
                className={`min-h-screen flex items-center justify-center bg-white ${containerClassName}`.trim()}
                data-min-loader-ms={minDurationAttr}
            >
                <div className={`neo-card text-center ${cardClassName}`.trim()}>
                    <div className="mx-auto w-full max-w-[220px] sm:max-w-[260px] md:max-w-[320px]">
                        {renderLoaderMedia('mx-auto aspect-square h-auto w-full rounded-xl object-contain')}
                    </div>
                    {videoFailed ? <p className="mt-3 font-heading text-lg sm:text-xl">{message}</p> : null}
                </div>
            </div>
        );
    }

    if (variant === 'inline') {
        return (
            <div
                className={`flex items-center justify-center gap-2 text-sm text-slate-500 ${containerClassName}`.trim()}
                data-min-loader-ms={minDurationAttr}
            >
                <span>{message}</span>
            </div>
        );
    }

    return (
        <div
            className={`neo-card text-center py-12 ${containerClassName}`.trim()}
            data-min-loader-ms={minDurationAttr}
        >
            <p className={`mt-4 ${cardClassName}`.trim()}>{message}</p>
        </div>
    );
}
