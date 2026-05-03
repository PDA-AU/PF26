import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { Box, ExternalLink, Eye, EyeOff, Loader2, Save, Sparkles, Trash2, Trophy, UploadCloud } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { usePersohubAdminAuth } from '@/context/PersohubAdminAuthContext';
import EventAdminShell, { useEventAdminShell } from './EventAdminShell';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const MAX_CAPTION_LENGTH = 500;
const MAX_MODEL_SIZE_BYTES = 25 * 1024 * 1024;

const modelContentTypeForFile = (file) => {
    const name = String(file?.name || '').toLowerCase();
    if (name.endsWith('.glb')) return 'model/gltf-binary';
    if (name.endsWith('.gltf')) return 'model/gltf+json';
    return file?.type || 'application/octet-stream';
};

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
    const [modelUrl, setModelUrl] = useState(eventInfo?.results_model_url || '');
    const [modelFile, setModelFile] = useState(null);
    const [saving, setSaving] = useState(false);
    const [modelUploading, setModelUploading] = useState(false);
    const [publishConfirmOpen, setPublishConfirmOpen] = useState(false);
    const [pendingPublished, setPendingPublished] = useState(null);

    useEffect(() => {
        setPublished(Boolean(eventInfo?.results_published));
        setCaption(eventInfo?.results_caption || '');
        setModelUrl(eventInfo?.results_model_url || '');
        setModelFile(null);
    }, [eventInfo?.results_caption, eventInfo?.results_model_url, eventInfo?.results_published]);

    const normalizedCaption = caption.trim();
    const eventTitle = String(eventInfo?.title || 'Event').trim() || 'Event';
    const publicResultsUrl = `/persohub/events/${eventSlug}/results`;
    const dirty = useMemo(() => (
        published !== Boolean(eventInfo?.results_published)
        || normalizedCaption !== String(eventInfo?.results_caption || '').trim()
        || String(modelUrl || '').trim() !== String(eventInfo?.results_model_url || '').trim()
        || Boolean(modelFile)
    ), [eventInfo?.results_caption, eventInfo?.results_model_url, eventInfo?.results_published, modelFile, modelUrl, normalizedCaption, published]);

    const handleModelFileChange = (event) => {
        const file = event.target.files?.[0] || null;
        event.target.value = '';
        if (!file) return;
        const name = String(file.name || '').toLowerCase();
        if (!name.endsWith('.glb') && !name.endsWith('.gltf')) {
            toast.error('Upload a .glb or .gltf model');
            return;
        }
        if (file.size > MAX_MODEL_SIZE_BYTES) {
            toast.error('Model must be 25 MB or smaller');
            return;
        }
        setModelFile(file);
    };

    const saveResults = async ({ publishedOverride = null, successMessage = 'Results settings saved' } = {}) => {
        setSaving(true);
        try {
            const previousPublished = Boolean(eventInfo?.results_published);
            const previousCaption = String(eventInfo?.results_caption || '').trim() || null;
            const previousModelUrl = String(eventInfo?.results_model_url || '').trim() || null;
            const nextPublished = typeof publishedOverride === 'boolean' ? publishedOverride : published;
            let nextModelUrl = String(modelUrl || '').trim() || null;
            if (modelFile) {
                setModelUploading(true);
                const contentType = modelContentTypeForFile(modelFile);
                const presignRes = await axios.post(
                    `${API}/persohub/admin/persohub-events/${eventSlug}/results/model/presign`,
                    { filename: modelFile.name, content_type: contentType },
                    { headers: getAuthHeader() }
                );
                const { upload_url, public_url, content_type } = presignRes.data || {};
                await axios.put(upload_url, modelFile, {
                    headers: { 'Content-Type': content_type || contentType },
                });
                nextModelUrl = public_url || null;
            }
            await axios.put(`${API}/persohub/admin/persohub-events/${eventSlug}/results`, {
                results_published: nextPublished,
                results_caption: normalizedCaption || null,
                results_model_url: nextModelUrl,
            }, { headers: getAuthHeader() });
            await refreshEventInfo();
            setPublished(nextPublished);
            setModelFile(null);
            setModelUrl(nextModelUrl || '');
            pushSavedUndo({
                label: 'Undo results settings',
                command: {
                    type: 'event_flags_restore',
                    results_published: previousPublished,
                    results_caption: previousCaption,
                    results_model_url: previousModelUrl,
                },
            });
            toast.success(successMessage);
            return true;
        } catch (error) {
            toast.error(error?.response?.data?.detail || error?.response?.data?.message || 'Failed to save results settings');
            return false;
        } finally {
            setSaving(false);
            setModelUploading(false);
        }
    };

    const openPublishConfirm = () => {
        setPendingPublished(!published);
        setPublishConfirmOpen(true);
    };

    const confirmPublishToggle = async () => {
        if (typeof pendingPublished !== 'boolean') return;
        const didSave = await saveResults({
            publishedOverride: pendingPublished,
            successMessage: pendingPublished ? 'Results published' : 'Results moved to holding mode',
        });
        if (didSave) {
            setPublishConfirmOpen(false);
            setPendingPublished(null);
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
                        onClick={openPublishConfirm}
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
                    <div className="rounded-lg border-2 border-black bg-white p-4">
                        <div className="flex items-start gap-3">
                            <Box className="mt-0.5 h-5 w-5 shrink-0" />
                            <div className="min-w-0 flex-1">
                                <h3 className="font-heading text-base font-black">3D Trophy Model</h3>
                                <p className="mt-1 text-xs text-slate-600">Upload a self-contained .glb model to S3. .gltf works only when its external files are hosted with valid relative URLs.</p>
                                {modelFile ? (
                                    <p className="mt-2 truncate text-xs font-bold text-primary">Selected: {modelFile.name}</p>
                                ) : modelUrl ? (
                                    <a href={modelUrl} target="_blank" rel="noreferrer" className="mt-2 block truncate text-xs font-bold text-primary underline">
                                        {modelUrl}
                                    </a>
                                ) : (
                                    <p className="mt-2 text-xs font-bold text-slate-500">Using bundled trophy model.</p>
                                )}
                            </div>
                        </div>
                        <div className="mt-4 grid gap-2 sm:grid-cols-2">
                            <label className="inline-flex cursor-pointer items-center justify-center rounded-md border-2 border-black bg-slate-900 px-4 py-2 text-sm font-bold text-white shadow-neo hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none">
                                <UploadCloud className="mr-2 h-4 w-4" />
                                Choose Model
                                <input
                                    type="file"
                                    accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
                                    className="sr-only"
                                    onChange={handleModelFileChange}
                                    disabled={saving}
                                />
                            </label>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => {
                                    setModelFile(null);
                                    setModelUrl('');
                                }}
                                disabled={saving || (!modelUrl && !modelFile)}
                                className="border-2 border-black shadow-neo"
                            >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Use Default
                            </Button>
                        </div>
                    </div>
                    <Button
                        type="button"
                        onClick={() => saveResults()}
                        disabled={saving || !dirty}
                        className="w-full border-2 border-black bg-primary text-white shadow-neo hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none disabled:opacity-60"
                    >
                        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        {modelUploading ? 'Uploading model...' : saving ? 'Saving...' : 'Save Results Page'}
                    </Button>
                </div>

                <ResultsPreview eventTitle={eventTitle} published={published} caption={normalizedCaption} />
            </div>

            <Dialog open={publishConfirmOpen} onOpenChange={(open) => {
                setPublishConfirmOpen(open);
                if (!open) setPendingPublished(null);
            }}>
                <DialogContent className="border-4 border-black bg-white max-w-md w-[calc(100vw-2rem)] sm:w-full">
                    <DialogHeader>
                        <DialogTitle className="font-heading text-xl font-black">
                            {pendingPublished ? 'Publish Results?' : 'Move Results to Holding?'}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <p className="text-sm text-slate-700">
                            {pendingPublished
                                ? 'This will make the public results page show the official results hero immediately.'
                                : 'This will keep the public URL open, but visitors will see the holding state instead of published results.'}
                        </p>
                        {dirty ? (
                            <p className="rounded-md border-2 border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
                                Your current caption/model edits will be saved with this action.
                            </p>
                        ) : null}
                        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setPublishConfirmOpen(false)}
                                disabled={saving}
                                className="border-2 border-black shadow-neo"
                            >
                                Cancel
                            </Button>
                            <Button
                                type="button"
                                onClick={confirmPublishToggle}
                                disabled={saving}
                                className={`${pendingPublished ? 'bg-yellow-300 text-black' : 'bg-slate-900 text-white'} border-2 border-black shadow-neo hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none`}
                            >
                                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                {modelUploading ? 'Uploading model...' : saving ? 'Saving...' : pendingPublished ? 'Confirm Publish' : 'Confirm Holding'}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
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
