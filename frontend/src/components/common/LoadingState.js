import React, { useMemo, useState } from 'react';
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
    const minDurationAttr = Number.isFinite(Number(minDurationMs)) ? Math.max(0, Number(minDurationMs)) : 400;
    const sharedVideoProps = useMemo(() => ({
        src: loadingVideo,
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
                {...sharedVideoProps}
                className={className}
                onError={() => setVideoFailed(true)}
            />
        );
    };

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
