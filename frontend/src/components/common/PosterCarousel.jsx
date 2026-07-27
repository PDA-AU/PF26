import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { resolvePosterUrl } from '@/utils/posterAssets';

export default function PosterCarousel({
    assets = [],
    title = 'Poster',
    className = '',
    imageClassName = '',
    emptyClassName = '',
    emptyText = 'Poster coming soon',
    autoMs = 4000,
    autoPlay = true,
    onClick,
    initialIndex = 0,
    showArrows = false,
    showPageMeta = false
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
        if (!autoPlay || usableAssets.length <= 1) return undefined;
        const timer = setInterval(() => {
            setIndex((prev) => (prev + 1) % usableAssets.length);
        }, autoMs);
        return () => clearInterval(timer);
    }, [autoMs, autoPlay, usableAssets.length]);

    if (!usableAssets.length) {
        return <div className={emptyClassName}>{emptyText}</div>;
    }

    const current = usableAssets[index];
    const src = resolvePosterUrl(current.url);
    const canSlide = usableAssets.length > 1;
    const goPrev = () => setIndex((prev) => (prev - 1 + usableAssets.length) % usableAssets.length);
    const goNext = () => setIndex((prev) => (prev + 1) % usableAssets.length);
    const content = (
        <div className={`relative ${className}`}>
            <img
                src={src}
                alt={`${title} poster ${index + 1}`}
                className={imageClassName}
            />
            {showArrows && canSlide ? (
                <>
                    <button
                        type="button"
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            goPrev();
                        }}
                        className="absolute left-2 top-1/2 z-20 -translate-y-1/2 rounded-full border-2 border-black bg-white/95 p-1.5 text-black shadow-neo transition hover:bg-white"
                        aria-label="Previous poster"
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button
                        type="button"
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            goNext();
                        }}
                        className="absolute right-2 top-1/2 z-20 -translate-y-1/2 rounded-full border-2 border-black bg-white/95 p-1.5 text-black shadow-neo transition hover:bg-white"
                        aria-label="Next poster"
                    >
                        <ChevronRight className="h-4 w-4" />
                    </button>
                </>
            ) : null}
            {canSlide ? (
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
            {showPageMeta && canSlide ? (
                <div className="pointer-events-none absolute left-0 right-0 top-2 z-20 flex items-center justify-center">
                    <span className="rounded-md border border-black/60 bg-black/65 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-white">
                        Page {index + 1}/{usableAssets.length}
                    </span>
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
