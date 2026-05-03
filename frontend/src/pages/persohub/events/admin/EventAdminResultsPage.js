import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { ExternalLink, Eye, EyeOff, Loader2, Save, Sparkles, Trophy } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { usePersohubAdminAuth } from '@/context/PersohubAdminAuthContext';
import EventAdminShell, { useEventAdminShell } from './EventAdminShell';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const MAX_CAPTION_LENGTH = 500;

const defaultPreviewCaption = (published) => (
    published
        ? 'The final standings are ready. Celebrate the people who made the event unforgettable.'
        : 'The scoreboard is being verified. This page will switch to the official reveal when results are published.'
);

function ResultsPreview({ eventTitle, published, caption }) {
    const previewTitle = published ? `${eventTitle} Results` : `${eventTitle} Reveal`;

    return (
        <section className="rounded-lg border-2 border-black bg-[#09090b] p-5 text-white shadow-neo overflow-hidden">
            <div className="flex items-center justify-between gap-3">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-black uppercase">
                    <Sparkles className="h-3.5 w-3.5 text-teal-300" />
                    Public Hero Preview
                </div>
                <span className={`rounded-full px-3 py-1 text-[11px] font-black uppercase ${published ? 'bg-yellow-300 text-black' : 'bg-sky-300 text-black'}`}>
                    {published ? 'Published' : 'Holding'}
                </span>
            </div>
            <div className="mt-8 grid gap-5 md:grid-cols-[0.9fr_1.1fr] md:items-end">
                <div className="relative min-h-40 rounded-lg border border-white/10 bg-white/[0.03]">
                    <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(180deg,rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:22px_22px]" />
                    <div className="absolute inset-0 grid place-items-center">
                        <Trophy className={`h-20 w-20 ${published ? 'text-yellow-300' : 'text-sky-300'}`} />
                    </div>
                </div>
                <div>
                    <p className="text-xs font-black uppercase text-white/55">{published ? 'official results' : 'holding page'}</p>
                    <h2 className="mt-2 font-heading text-4xl font-black leading-none sm:text-5xl">{previewTitle}</h2>
                    <p className="mt-4 max-w-xl text-sm leading-6 text-white/70">{caption || defaultPreviewCaption(published)}</p>
                </div>
            </div>
        </section>
    );
}

function ResultsAdminContent() {
    const { getAuthHeader } = usePersohubAdminAuth();
    const { eventInfo, eventSlug, refreshEventInfo, pushSavedUndo } = useEventAdminShell();
    const [published, setPublished] = useState(Boolean(eventInfo?.results_published));
    const [caption, setCaption] = useState(eventInfo?.results_caption || '');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setPublished(Boolean(eventInfo?.results_published));
        setCaption(eventInfo?.results_caption || '');
    }, [eventInfo?.results_published, eventInfo?.results_caption]);

    const normalizedCaption = caption.trim();
    const eventTitle = String(eventInfo?.title || 'Event').trim() || 'Event';
    const publicResultsUrl = `/persohub/events/${eventSlug}/results`;
    const dirty = useMemo(() => (
        published !== Boolean(eventInfo?.results_published)
        || normalizedCaption !== String(eventInfo?.results_caption || '').trim()
    ), [eventInfo?.results_caption, eventInfo?.results_published, normalizedCaption, published]);

    const saveResults = async () => {
        setSaving(true);
        try {
            const previousPublished = Boolean(eventInfo?.results_published);
            const previousCaption = String(eventInfo?.results_caption || '').trim() || null;
            await axios.put(`${API}/persohub/admin/persohub-events/${eventSlug}/results`, {
                results_published: published,
                results_caption: normalizedCaption || null,
            }, { headers: getAuthHeader() });
            await refreshEventInfo();
            pushSavedUndo({
                label: 'Undo results settings',
                command: {
                    type: 'event_flags_restore',
                    results_published: previousPublished,
                    results_caption: previousCaption,
                },
            });
            toast.success('Results settings saved');
        } catch (error) {
            toast.error(error?.response?.data?.detail || error?.response?.data?.message || 'Failed to save results settings');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <p className="text-xs font-black uppercase text-slate-500">Results Control</p>
                    <h1 className="font-heading text-3xl font-black leading-tight">Results Page</h1>
                </div>
                <Link to={publicResultsUrl} target="_blank" rel="noreferrer">
                    <Button variant="outline" className="w-full border-2 border-black shadow-neo sm:w-auto">
                        <ExternalLink className="mr-2 h-4 w-4" />
                        View Public Page
                    </Button>
                </Link>
            </div>

            <div className={`neo-card ${published ? 'bg-yellow-50 border-yellow-500' : 'bg-sky-50 border-sky-500'}`}>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex gap-4">
                        <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-lg border-2 border-black ${published ? 'bg-yellow-300' : 'bg-sky-300'}`}>
                            {published ? <Eye className="h-6 w-6" /> : <EyeOff className="h-6 w-6" />}
                        </div>
                        <div>
                            <h2 className="font-heading text-xl font-black">Results are {published ? 'published' : 'in holding mode'}</h2>
                            <p className="mt-1 text-sm text-slate-700">
                                {published
                                    ? 'Visitors see the official results hero with your caption.'
                                    : 'Visitors can open the URL, but they see a polished waiting state.'}
                            </p>
                        </div>
                    </div>
                    <Button
                        type="button"
                        onClick={() => setPublished((value) => !value)}
                        disabled={saving}
                        className={`${published ? 'bg-slate-900 text-white' : 'bg-yellow-300 text-black'} border-2 border-black shadow-neo hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none`}
                    >
                        {published ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
                        {published ? 'Switch to Holding' : 'Publish Results'}
                    </Button>
                </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-[0.82fr_1.18fr]">
                <div className="neo-card space-y-4">
                    <div>
                        <h2 className="font-heading text-xl font-black">Hero Caption</h2>
                        <p className="mt-1 text-sm text-slate-600">This appears directly below the hero text on the public results page.</p>
                    </div>
                    <Textarea
                        value={caption}
                        onChange={(event) => setCaption(event.target.value.slice(0, MAX_CAPTION_LENGTH))}
                        rows={7}
                        placeholder="Write a short, inspiring line for the results reveal."
                        className="border-2 border-black bg-white text-base shadow-none focus-visible:ring-2 focus-visible:ring-black"
                        disabled={saving}
                    />
                    <div className="flex items-center justify-between gap-3 text-xs font-bold text-slate-500">
                        <span>{dirty ? 'Unsaved changes' : 'Saved state loaded'}</span>
                        <span>{caption.length}/{MAX_CAPTION_LENGTH}</span>
                    </div>
                    <Button
                        type="button"
                        onClick={saveResults}
                        disabled={saving || !dirty}
                        className="w-full border-2 border-black bg-primary text-white shadow-neo hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none disabled:opacity-60"
                    >
                        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        {saving ? 'Saving...' : 'Save Results Page'}
                    </Button>
                </div>

                <ResultsPreview eventTitle={eventTitle} published={published} caption={normalizedCaption} />
            </div>
        </div>
    );
}

export default function PersohubEventAdminResultsPage() {
    return (
        <EventAdminShell activeTab="results">
            <ResultsAdminContent />
        </EventAdminShell>
    );
}
