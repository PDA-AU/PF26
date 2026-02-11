import React, { useEffect, useMemo, useState } from 'react';
import { resolvePosterUrl } from '@/utils/posterAssets';

export default function PosterCarousel({
    assets = [],
    title = 'Poster',
    className = '',
    imageClassName = '',
    emptyClassName = '',
    emptyText = 'Poster coming soon',
    autoMs = 4000,
    onClick,
    initialIndex = 0
}) {
    const usableAssets = useMemo(() => (assets || []).filter((asset) => asset?.url), [assets]);
    const [index, setIndex] = useState(0);

    useEffect(() => {
        if (!usableAssets.length) {
            setIndex(0);
            return;
        }
        const next = Number.isFinite(initialIndex) ? Math.max(0, Math.min(initialIndex, usableAssets.length - 1)) : 0;
        setIndex(next);
    }, [initialIndex, usableAssets.length, title]);

    useEffect(() => {
        if (usableAssets.length <= 1) return undefined;
        const timer = setInterval(() => {
            setIndex((prev) => (prev + 1) % usableAssets.length);
        }, autoMs);
        return () => clearInterval(timer);
    }, [autoMs, usableAssets.length]);

    if (!usableAssets.length) {
        return <div className={emptyClassName}>{emptyText}</div>;
    }

    const current = usableAssets[index];
    const src = resolvePosterUrl(current.url);
    const content = (
        <div className={`relative ${className}`}>
            <img
                src={src}
                alt={`${title} poster ${index + 1}`}
                className={imageClassName}
            />
            {usableAssets.length > 1 ? (
                <div className="pointer-events-none absolute bottom-2 left-0 right-0 flex items-center justify-center gap-1.5">
                    {usableAssets.map((asset, dotIndex) => (
                        <button
                            key={`${asset.url}-${dotIndex}`}
                            type="button"
                            onClick={(e) => {
                                e.preventDefault();
                                setIndex(dotIndex);
                            }}
                            className={`pointer-events-auto h-1.5 w-1.5 rounded-full transition ${dotIndex === index ? 'bg-white' : 'bg-white/50'}`}
                            aria-label={`Show poster ${dotIndex + 1}`}
                        />
                    ))}
                </div>
            ) : null}
        </div>
    );

    if (!onClick) return content;
    return (
        <button type="button" onClick={() => onClick(current, index, usableAssets)} className="w-full">
            {content}
        </button>
    );
}
