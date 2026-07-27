import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Award } from 'lucide-react';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export default function BadgeRevealModal({
    open,
    onOpenChange,
    badge,
    videoSrc,
    switchDelayMs = 2500,
}) {
    const [phase, setPhase] = useState('video');
    const timerRef = useRef(null);
    const [imageFailed, setImageFailed] = useState(false);

    const safeBadge = useMemo(() => {
        if (!badge) return null;
        return {
            title: String(badge.title || 'Badge'),
            imageUrl: String(badge.imageUrl || '').trim(),
            subtitle: String(badge.subtitle || '').trim(),
            userName: String(badge.userName || '').trim(),
            regno: String(badge.regno || '').trim(),
        };
    }, [badge]);

    useEffect(() => {
        if (!open) {
            setPhase('video');
            setImageFailed(false);
            if (timerRef.current) {
                clearTimeout(timerRef.current);
                timerRef.current = null;
            }
            return;
        }
        setPhase('video');
        setImageFailed(false);
        timerRef.current = setTimeout(() => {
            setPhase('static');
            timerRef.current = null;
        }, Math.max(0, Number(switchDelayMs) || 2500));
        return () => {
            if (timerRef.current) {
                clearTimeout(timerRef.current);
                timerRef.current = null;
            }
        };
    }, [open, switchDelayMs]);

    const showImage = Boolean(safeBadge?.imageUrl) && !imageFailed;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[calc(100vh-2rem)] overflow-x-hidden overflow-y-auto border-4 border-black bg-white [&>button:hover]:text-red-600">
                <DialogHeader>
                    <DialogTitle className="font-heading text-2xl font-black uppercase tracking-tight">
                        Badge Reveal
                    </DialogTitle>
                </DialogHeader>

                <div className="rounded-md border-2 border-black bg-[#fffdf0] p-3 shadow-neo">
                    <div className="flex min-h-[260px] items-center justify-center rounded-md border-2 border-black bg-white p-3">
                        {phase === 'video' ? (
                            <video
                                key={videoSrc}
                                src={videoSrc}
                                autoPlay
                                muted
                                playsInline
                                preload="metadata"
                                className="h-full w-full max-h-[320px] rounded object-contain"
                                onEnded={() => setPhase('static')}
                                aria-label="Badge reveal animation"
                            />
                        ) : showImage ? (
                            <img
                                src={safeBadge.imageUrl}
                                alt={safeBadge.title}
                                className="h-full w-full max-h-[320px] rounded object-contain"
                                onError={() => setImageFailed(true)}
                            />
                        ) : (
                            <div className="flex h-[220px] w-[220px] flex-col items-center justify-center gap-2 rounded-md border-2 border-black bg-[#FDE047]">
                                <Award className="h-8 w-8 text-black" />
                                <p className="text-center text-sm font-bold uppercase tracking-[0.12em] text-black">
                                    Badge Unlocked
                                </p>
                            </div>
                        )}
                    </div>
                </div>

                <div>
                    <p className="font-heading text-xl font-black uppercase tracking-tight">{safeBadge?.title || 'Badge'}</p>
                    {safeBadge?.subtitle ? (
                        <p className="mt-1 text-xs font-medium uppercase tracking-[0.1em] text-slate-700">
                            {safeBadge.subtitle}
                        </p>
                    ) : null}
                    {safeBadge?.userName ? (
                        <p className="mt-2 text-sm font-semibold text-slate-900">
                            Badge awarded to {safeBadge.userName}{safeBadge.regno ? ` (${safeBadge.regno})` : ''}
                        </p>
                    ) : null}
                </div>
            </DialogContent>
        </Dialog>
    );
}
