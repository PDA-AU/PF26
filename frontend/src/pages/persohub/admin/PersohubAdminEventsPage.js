import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import ParsedDescription from '@/components/common/ParsedDescription';
import { usePersohubAdminAuth } from '@/context/PersohubAdminAuthContext';
import { persohubAdminApi } from '@/pages/persohub/admin/api';
import PersohubAdminLayout from '@/pages/persohub/admin/PersohubAdminLayout';
import { compressImageToWebp } from '@/utils/imageCompression';
import {
    filterPosterAssetsByRatio,
    parsePosterAssets,
    pickPosterAssetByRatio,
    resolvePosterUrl,
    serializePosterAssets,
} from '@/utils/posterAssets';

const initialForm = {
    title: '',
    description: '',
    start_date: '',
    end_date: '',
    event_time: '',
    poster_url: '',
    whatsapp_url: '',
    external_url_name: 'Click To Register',
    event_type: 'Technical',
    format: 'Offline',
    template_option: 'attendance_scoring',
    participant_mode: 'individual',
    round_mode: 'single',
    round_count: 1,
    team_min_size: '',
    team_max_size: '',
    sympo_id: 'none',
};

const makePosterAssetId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const toPosterAssetRows = (rawPosterUrl) => {
    const preferred = pickPosterAssetByRatio(
        filterPosterAssetsByRatio(parsePosterAssets(rawPosterUrl), ['4:5']),
        ['4:5'],
    );
    if (!preferred?.url) return [];
    return [{
        id: makePosterAssetId(),
        aspect_ratio: '4:5',
        url: preferred.url,
        file: null,
        preview_url: '',
    }];
};

const releasePosterPreviewUrls = (rows) => {
    (rows || []).forEach((row) => {
        if (row?.preview_url) {
            URL.revokeObjectURL(row.preview_url);
        }
    });
};

const toDateInputValue = (value) => {
    if (!value) return '';
    const raw = String(value).trim();
    if (!raw) return '';
    return raw.slice(0, 10);
};

const toTimeInputValue = (value) => {
    if (!value) return '';
    const raw = String(value).trim();
    if (!raw) return '';
    return raw.slice(0, 5);
};

const toEventForm = (eventRow = {}) => ({
    title: eventRow.title || '',
    description: eventRow.description || '',
    start_date: toDateInputValue(eventRow.start_date),
    end_date: toDateInputValue(eventRow.end_date),
    event_time: toTimeInputValue(eventRow.event_time),
    poster_url: eventRow.poster_url || '',
    whatsapp_url: eventRow.whatsapp_url || '',
    external_url_name: eventRow.external_url_name || 'Click To Register',
    event_type: eventRow.event_type || 'Technical',
    format: eventRow.format || 'Offline',
    template_option: eventRow.template_option || 'attendance_scoring',
    participant_mode: eventRow.participant_mode || 'individual',
    round_mode: eventRow.round_mode || 'single',
    round_count: Number(eventRow.round_count || 1),
    team_min_size: eventRow.team_min_size ?? '',
    team_max_size: eventRow.team_max_size ?? '',
    sympo_id: eventRow.sympo_id ? String(eventRow.sympo_id) : 'none',
});

const formatDateLabel = (value) => {
    const dateValue = toDateInputValue(value);
    if (!dateValue) return 'TBD';
    const parsed = new Date(`${dateValue}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return dateValue;
    return parsed.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
};

const formatTimeLabel = (value) => {
    const timeValue = toTimeInputValue(value);
    if (!timeValue) return 'TBD';
    return timeValue;
};

const buildEventPayload = (formState, posterUrl) => ({
    title: formState.title.trim(),
    description: formState.description?.trim() || '',
    start_date: formState.start_date || null,
    end_date: formState.end_date || null,
    event_time: formState.event_time || null,
    poster_url: posterUrl,
    whatsapp_url: formState.whatsapp_url?.trim() || null,
    external_url_name: formState.external_url_name?.trim() || 'Click To Register',
    event_type: formState.event_type,
    format: formState.format,
    template_option: formState.template_option,
    participant_mode: formState.participant_mode,
    round_mode: formState.round_mode,
    round_count: Number(formState.round_count || 1),
    team_min_size: formState.participant_mode === 'team' ? Number(formState.team_min_size || 1) : null,
    team_max_size: formState.participant_mode === 'team' ? Number(formState.team_max_size || 1) : null,
});

const getCardPosterSrc = (rawPosterUrl) => {
    const assets = filterPosterAssetsByRatio(parsePosterAssets(rawPosterUrl), ['4:5']);
    const preferred = pickPosterAssetByRatio(assets, ['4:5']);
    return resolvePosterUrl(preferred?.url);
};

function EventFormFields({
    form,
    setForm,
    posterInputId,
    posterAssets,
    setPosterAssets,
    sympoOptions,
}) {
    return (
        <>
            <div className="md:col-span-2">
                <Label>Title</Label>
                <Input value={form.title} onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))} required />
            </div>
            <div className="md:col-span-2">
                <Label>Description</Label>
                <Textarea
                    value={form.description}
                    onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                    rows={8}
                    className="min-h-[180px]"
                />
                <div className="mt-2 rounded-lg border border-black/10 bg-slate-50 p-3 text-xs text-slate-600">
                    <p className="font-semibold uppercase tracking-[0.08em] text-slate-700">Parsing Hints</p>
                    <p className="mt-1">Use plain text with these formats:</p>
                    <ul className="mt-1 list-disc space-y-1 pl-4">
                        <li><code>*bold text*</code> or <code>**bold text**</code> for bold emphasis.</li>
                        <li><code>@profile_name</code> for mentions (example: <code>@pdawebteam</code>).</li>
                        <li><code>#tag</code> for hashtags (example: <code>#hackathon</code>).</li>
                        <li><code>https://example.com/register</code> for clickable links.</li>
                        <li>Use a new line to continue content on the next line.</li>
                        <li>Use an empty line to start a new paragraph block.</li>
                        <li>Typed <code>\\n</code> is also treated as a new line.</li>
                        <li><code>- point one</code>, <code>- point two</code> for bullet lists.</li>
                        <li><code>1. step one</code>, <code>2. step two</code> for numbered lines.</li>
                    </ul>
                </div>
            </div>
            <div>
                <Label>Start Date</Label>
                <Input type="date" value={form.start_date} onChange={(e) => setForm((prev) => ({ ...prev, start_date: e.target.value }))} />
            </div>
            <div>
                <Label>End Date</Label>
                <Input type="date" value={form.end_date} onChange={(e) => setForm((prev) => ({ ...prev, end_date: e.target.value }))} />
            </div>
            <div>
                <Label>Time</Label>
                <Input type="time" value={form.event_time} onChange={(e) => setForm((prev) => ({ ...prev, event_time: e.target.value }))} />
            </div>
            <div>
                <Label>Sympo</Label>
                <Select value={form.sympo_id} onValueChange={(value) => setForm((prev) => ({ ...prev, sympo_id: value }))}>
                    <SelectTrigger><SelectValue placeholder="No sympo" /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="none">No sympo</SelectItem>
                        {sympoOptions.map((sympo) => (
                            <SelectItem key={sympo.id} value={String(sympo.id)}>{sympo.name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            <div className="md:col-span-2">
                <Label htmlFor={posterInputId}>Poster Upload (4:5 only, single)</Label>
                <div className="mt-2">
                    <Input
                        id={posterInputId}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={(e) => {
                            const files = Array.from(e.target.files || []);
                            if (!files.length) return;
                            const file = files[0];
                            setPosterAssets((prev) => {
                                releasePosterPreviewUrls(prev);
                                return [{
                                    id: makePosterAssetId(),
                                    aspect_ratio: '4:5',
                                    url: '',
                                    file,
                                    preview_url: URL.createObjectURL(file),
                                }];
                            });
                            e.target.value = '';
                        }}
                    />
                </div>
                <p className="mt-2 text-xs text-slate-500">
                    Only one 4:5 poster is supported temporarily.
                </p>
                {posterAssets.length ? (
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        {posterAssets.map((asset) => (
                            <div key={asset.id} className="rounded-xl border border-black/10 bg-[#fffdf7] p-3">
                                <div className="mb-2 flex items-center justify-between gap-2">
                                    <span className="rounded-full border border-black/10 bg-white px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.08em]">
                                        {asset.aspect_ratio}
                                    </span>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="h-7 border-black/10 px-2 text-xs"
                                        onClick={() => {
                                            if (asset.preview_url) URL.revokeObjectURL(asset.preview_url);
                                            setPosterAssets((prev) => prev.filter((row) => row.id !== asset.id));
                                        }}
                                    >
                                        Remove
                                    </Button>
                                </div>
                                <img
                                    src={asset.preview_url || asset.url}
                                    alt="Poster preview"
                                    className="max-h-44 w-full rounded-lg border border-black/10 object-contain bg-white"
                                />
                            </div>
                        ))}
                    </div>
                ) : null}
            </div>
            <div className="md:col-span-2">
                <Label>External Registration / Wp Link</Label>
                <Input
                    type="url"
                    value={form.whatsapp_url}
                    onChange={(e) => setForm((prev) => ({ ...prev, whatsapp_url: e.target.value }))}
                    placeholder="https://chat.whatsapp.com/..."
                />
            </div>
            <div className="md:col-span-2">
                <Label>External Link Button Name</Label>
                <Input
                    value={form.external_url_name}
                    onChange={(e) => setForm((prev) => ({ ...prev, external_url_name: e.target.value }))}
                    placeholder="Click To Register"
                />
            </div>
            <div>
                <Label>Type</Label>
                <Select value={form.event_type} onValueChange={(value) => setForm((prev) => ({ ...prev, event_type: value }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="Technical">Technical</SelectItem>
                        <SelectItem value="FunTechinical">FunTechinical</SelectItem>
                        <SelectItem value="Hackathon">Hackathon</SelectItem>
                        <SelectItem value="Signature">Signature</SelectItem>
                        <SelectItem value="NonTechinical">NonTechinical</SelectItem>
                        <SelectItem value="Session">Session</SelectItem>
                        <SelectItem value="Workshop">Workshop</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            <div>
                <Label>Format</Label>
                <Select value={form.format} onValueChange={(value) => setForm((prev) => ({ ...prev, format: value }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="Online">Online</SelectItem>
                        <SelectItem value="Offline">Offline</SelectItem>
                        <SelectItem value="Hybrid">Hybrid</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            <div>
                <Label>Template</Label>
                <Select value={form.template_option} onValueChange={(value) => setForm((prev) => ({ ...prev, template_option: value }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="attendance_only">Only Attendance</SelectItem>
                        <SelectItem value="attendance_scoring">Attendance + Scoring</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            <div>
                <Label>Participant Mode</Label>
                <Select value={form.participant_mode} onValueChange={(value) => setForm((prev) => ({ ...prev, participant_mode: value }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="individual">Individual</SelectItem>
                        <SelectItem value="team">Team</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            <div>
                <Label>Round Mode</Label>
                <Select value={form.round_mode} onValueChange={(value) => setForm((prev) => ({ ...prev, round_mode: value }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="single">Single Round</SelectItem>
                        <SelectItem value="multi">Multi Round</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            <div>
                <Label>Round Count</Label>
                <Input
                    type="number"
                    min={1}
                    max={20}
                    value={form.round_count}
                    disabled={form.round_mode === 'single'}
                    onChange={(e) => setForm((prev) => ({ ...prev, round_count: e.target.value }))}
                />
            </div>
            {form.participant_mode === 'team' ? (
                <>
                    <div>
                        <Label>Team Min Size</Label>
                        <Input type="number" min={1} value={form.team_min_size} onChange={(e) => setForm((prev) => ({ ...prev, team_min_size: e.target.value }))} required />
                    </div>
                    <div>
                        <Label>Team Max Size</Label>
                        <Input type="number" min={1} value={form.team_max_size} onChange={(e) => setForm((prev) => ({ ...prev, team_max_size: e.target.value }))} required />
                    </div>
                </>
            ) : null}
        </>
    );
}

export default function PersohubAdminEventsPage() {
    const { community } = usePersohubAdminAuth();
    const canMutate = Boolean(community?.is_root);

    const [events, setEvents] = useState([]);
    const [sympoOptions, setSympoOptions] = useState([]);
    const [eventSympoDrafts, setEventSympoDrafts] = useState({});
    const [assigningSympoSlug, setAssigningSympoSlug] = useState('');
    const [query, setQuery] = useState('');
    const [queryDebounced, setQueryDebounced] = useState('');
    const [page, setPage] = useState(1);
    const [pageSize] = useState(20);
    const [totalCount, setTotalCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [savingEdit, setSavingEdit] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [deleteConfirmText, setDeleteConfirmText] = useState('');
    const [editDialogOpen, setEditDialogOpen] = useState(false);
    const [editTarget, setEditTarget] = useState(null);
    const [posterAssets, setPosterAssets] = useState([]);
    const [editPosterAssets, setEditPosterAssets] = useState([]);
    const [uploadingPoster, setUploadingPoster] = useState(false);
    const [uploadingEditPoster, setUploadingEditPoster] = useState(false);
    const [parityEnabled, setParityEnabled] = useState(false);
    const [form, setForm] = useState(initialForm);
    const [editForm, setEditForm] = useState(initialForm);
    const [expandedDescriptions, setExpandedDescriptions] = useState({});

    useEffect(() => {
        const timer = setTimeout(() => setQueryDebounced(query.trim()), 250);
        return () => clearTimeout(timer);
    }, [query]);

    const fetchEvents = useCallback(async () => {
        if (!community) {
            setEvents([]);
            setTotalCount(0);
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const response = await persohubAdminApi.listPersohubEvents({
                page,
                page_size: pageSize,
                q: queryDebounced || undefined,
            });
            const rows = response?.items || [];
            setEvents(rows);
            setTotalCount(Number(response?.totalCount || 0));
            setEventSympoDrafts(
                rows.reduce((acc, eventRow) => {
                    acc[eventRow.slug] = eventRow.sympo_id ? String(eventRow.sympo_id) : 'none';
                    return acc;
                }, {})
            );
        } catch (error) {
            toast.error(persohubAdminApi.parseApiError(error, 'Failed to load events'));
        } finally {
            setLoading(false);
        }
    }, [community, page, pageSize, queryDebounced]);

    const fetchSympoOptions = useCallback(async () => {
        if (!community) {
            setSympoOptions([]);
            return;
        }
        try {
            const rows = await persohubAdminApi.listPersohubSympoOptions();
            setSympoOptions(rows || []);
        } catch (error) {
            toast.error(persohubAdminApi.parseApiError(error, 'Failed to load sympos'));
        }
    }, [community]);

    const fetchParityEnabled = useCallback(async () => {
        if (!community) {
            setParityEnabled(false);
            return;
        }
        try {
            const enabled = await persohubAdminApi.isPersohubEventsParityEnabled();
            setParityEnabled(Boolean(enabled));
        } catch (error) {
            setParityEnabled(false);
            toast.error(persohubAdminApi.parseApiError(error, 'Failed to read parity status'));
        }
    }, [community]);

    useEffect(() => {
        fetchEvents();
    }, [fetchEvents]);

    useEffect(() => {
        fetchSympoOptions();
    }, [fetchSympoOptions]);

    useEffect(() => {
        fetchParityEnabled();
    }, [fetchParityEnabled]);

    const validateDateRange = (formState) => {
        if (formState.start_date && formState.end_date && formState.start_date > formState.end_date) {
            toast.error('Start date cannot be after end date');
            return false;
        }
        return true;
    };

    const onSubmit = async (e) => {
        e.preventDefault();
        if (!canMutate) return;
        if (!validateDateRange(form)) return;
        setSaving(true);
        try {
            let posterUrl = null;
            const currentAsset = posterAssets[0];
            if (currentAsset?.file) {
                setUploadingPoster(true);
                const processedPoster = await compressImageToWebp(currentAsset.file);
                const uploadedUrl = await persohubAdminApi.uploadEventPoster(processedPoster);
                posterUrl = serializePosterAssets([{ url: uploadedUrl, aspect_ratio: '4:5' }]);
                setUploadingPoster(false);
            } else if (currentAsset?.url) {
                posterUrl = serializePosterAssets([{ url: currentAsset.url, aspect_ratio: '4:5' }]);
            }
            const payload = buildEventPayload(form, posterUrl);
            const createdEvent = await persohubAdminApi.createPersohubEvent(payload);
            if (form.sympo_id && form.sympo_id !== 'none') {
                await persohubAdminApi.assignPersohubEventSympo(createdEvent.slug, { sympo_id: Number(form.sympo_id) });
            }
            toast.success('Event created');
            setForm(initialForm);
            releasePosterPreviewUrls(posterAssets);
            setPosterAssets([]);
            fetchEvents();
        } catch (error) {
            setUploadingPoster(false);
            toast.error(persohubAdminApi.parseApiError(error, 'Failed to create event'));
        } finally {
            setSaving(false);
            setUploadingPoster(false);
        }
    };

    const openEditDialog = (eventRow) => {
        if (!canMutate) return;
        setEditTarget(eventRow);
        setEditForm(toEventForm(eventRow));
        releasePosterPreviewUrls(editPosterAssets);
        setEditPosterAssets(toPosterAssetRows(eventRow.poster_url));
        setEditDialogOpen(true);
    };

    const closeEditDialog = (force = false) => {
        if (!force && (savingEdit || uploadingEditPoster)) return;
        setEditDialogOpen(false);
        setEditTarget(null);
        setEditForm(initialForm);
        releasePosterPreviewUrls(editPosterAssets);
        setEditPosterAssets([]);
    };

    const updateEvent = async (e) => {
        e.preventDefault();
        if (!canMutate || !editTarget) return;
        if (!validateDateRange(editForm)) return;
        setSavingEdit(true);
        try {
            let posterUrl = null;
            const currentAsset = editPosterAssets[0];
            if (currentAsset?.file) {
                setUploadingEditPoster(true);
                const processedPoster = await compressImageToWebp(currentAsset.file);
                const uploadedUrl = await persohubAdminApi.uploadEventPoster(processedPoster);
                posterUrl = serializePosterAssets([{ url: uploadedUrl, aspect_ratio: '4:5' }]);
                setUploadingEditPoster(false);
            } else if (currentAsset?.url) {
                posterUrl = serializePosterAssets([{ url: currentAsset.url, aspect_ratio: '4:5' }]);
            }
            const payload = buildEventPayload(editForm, posterUrl);
            await persohubAdminApi.updatePersohubEvent(editTarget.slug, payload);
            await persohubAdminApi.assignPersohubEventSympo(editTarget.slug, {
                sympo_id: editForm.sympo_id === 'none' ? null : Number(editForm.sympo_id),
            });
            toast.success('Event updated');
            closeEditDialog(true);
            fetchEvents();
        } catch (error) {
            setUploadingEditPoster(false);
            toast.error(persohubAdminApi.parseApiError(error, 'Failed to update event'));
        } finally {
            setSavingEdit(false);
            setUploadingEditPoster(false);
        }
    };

    const toggleStatus = async (eventRow) => {
        if (!canMutate) return;
        const nextStatus = eventRow.status === 'open' ? 'closed' : 'open';
        try {
            await persohubAdminApi.updatePersohubEvent(eventRow.slug, { status: nextStatus });
            toast.success(`Event ${nextStatus}`);
            fetchEvents();
        } catch (error) {
            toast.error(persohubAdminApi.parseApiError(error, 'Failed to update status'));
        }
    };

    const openDeleteDialog = (eventRow) => {
        if (!canMutate) return;
        setDeleteTarget(eventRow);
        setDeleteConfirmText('');
        setDeleteDialogOpen(true);
    };

    const closeDeleteDialog = () => {
        if (deleting) return;
        setDeleteDialogOpen(false);
        setDeleteTarget(null);
        setDeleteConfirmText('');
    };

    const deleteEvent = async () => {
        if (!deleteTarget || deleteConfirmText !== 'DELETE' || !canMutate) return;
        setDeleting(true);
        try {
            await persohubAdminApi.deletePersohubEvent(deleteTarget.slug);
            toast.success('Event deleted');
            setDeleteDialogOpen(false);
            setDeleteTarget(null);
            setDeleteConfirmText('');
            fetchEvents();
        } catch (error) {
            toast.error(persohubAdminApi.parseApiError(error, 'Failed to delete event'));
        } finally {
            setDeleting(false);
        }
    };

    const assignEventSympo = async (eventRow) => {
        if (!canMutate || assigningSympoSlug) return;
        const currentValue = eventRow.sympo_id ? String(eventRow.sympo_id) : 'none';
        const draftValue = eventSympoDrafts[eventRow.slug] || currentValue;
        if (currentValue === draftValue) return;
        setAssigningSympoSlug(eventRow.slug);
        try {
            const payload = { sympo_id: draftValue === 'none' ? null : Number(draftValue) };
            const response = await persohubAdminApi.assignPersohubEventSympo(eventRow.slug, payload);
            toast.success(response?.message || 'Event mapping updated');
            fetchEvents();
        } catch (error) {
            toast.error(persohubAdminApi.parseApiError(error, 'Failed to update event mapping'));
        } finally {
            setAssigningSympoSlug('');
        }
    };

    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    const startIndex = totalCount ? ((page - 1) * pageSize) + 1 : 0;
    const endIndex = totalCount ? Math.min(totalCount, page * pageSize) : 0;

    return (
        <PersohubAdminLayout
            title="Persohub Admin Events"
            subtitle="Manage root-owned events for your club community."
            activeTab="events"
        >
            {!canMutate ? (
                <section className="rounded-2xl border border-[#c99612]/40 bg-[#fff8df] p-4 text-sm text-[#7a5a00]">
                    Read-only mode: only the root community account for your club can create, edit, close, or delete events.
                </section>
            ) : null}
            {canMutate && !parityEnabled ? (
                <section className="rounded-2xl border border-black/10 bg-slate-50 p-4 text-sm text-slate-700">
                    Parity admin screens are currently disabled by feature flag. Core event CRUD is still available here.
                </section>
            ) : null}

            {canMutate ? (
                <section className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
                    <h2 className="text-2xl font-heading font-black">Create Event</h2>
                    <form className="mt-4 grid gap-4 md:grid-cols-2" onSubmit={onSubmit}>
                        <EventFormFields
                            form={form}
                            setForm={setForm}
                            posterInputId="persohub-event-poster-upload"
                            posterAssets={posterAssets}
                            setPosterAssets={setPosterAssets}
                            sympoOptions={sympoOptions}
                        />
                        <div className="md:col-span-2 flex justify-end">
                            <Button type="submit" className="bg-[#f6c347] text-black hover:bg-[#ffd16b]" disabled={saving || uploadingPoster}>
                                {uploadingPoster ? 'Uploading Poster...' : saving ? 'Creating...' : 'Create Event'}
                            </Button>
                        </div>
                    </form>
                </section>
            ) : null}

            <section className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <h2 className="text-2xl font-heading font-black">Root-Owned Club Events</h2>
                    <Input
                        value={query}
                        onChange={(e) => {
                            setQuery(e.target.value);
                            setPage(1);
                        }}
                        placeholder="Search events"
                        className="sm:max-w-sm"
                    />
                </div>
                {loading ? (
                    <p className="mt-4 text-sm text-slate-500">Loading...</p>
                ) : events.length === 0 ? (
                    <p className="mt-4 text-sm text-slate-500">No root-owned events available yet.</p>
                ) : (
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                        {events.map((eventRow) => {
                            const description = String(eventRow.description || '').trim();
                            const isExpanded = Boolean(expandedDescriptions[eventRow.id]);
                            const canToggle = description.length > 160;
                            const shouldClamp = canToggle && !isExpanded;

                            return (
                                <div key={eventRow.id} className="rounded-2xl border border-black/10 bg-[#fffdf7] p-4">
                                    {getCardPosterSrc(eventRow.poster_url) ? (
                                        <img
                                            src={getCardPosterSrc(eventRow.poster_url)}
                                            alt={`${eventRow.title} poster`}
                                            className="mb-3 aspect-[4/5] w-full rounded-xl border border-black/10 object-cover bg-white"
                                        />
                                    ) : null}
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">{eventRow.event_code}</p>
                                            <h3 className="font-heading text-xl font-black">{eventRow.title}</h3>
                                            <p className="text-xs text-slate-500">{eventRow.slug}</p>
                                        </div>
                                        <span className={`rounded-full border px-3 py-1 text-xs uppercase tracking-[0.2em] ${eventRow.status === 'open' ? 'border-[#c99612] bg-[#fff3c4] text-[#7a5a00]' : 'border-black/10 bg-[#11131a] text-[#f6c347]'}`}>
                                            {eventRow.status}
                                        </span>
                                    </div>
                                    <div className={`relative mt-3 space-y-2 text-sm text-slate-600 ${shouldClamp ? 'max-h-24 overflow-hidden' : ''}`}>
                                        <ParsedDescription
                                            description={eventRow.description}
                                            emptyText="No description provided."
                                            listClassName="list-disc space-y-1 pl-5"
                                        />
                                        {shouldClamp ? (
                                            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-[#fffdf7] to-transparent" />
                                        ) : null}
                                    </div>
                                    {canToggle ? (
                                        <button
                                            type="button"
                                            className="mt-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 hover:text-slate-800"
                                            onClick={() => setExpandedDescriptions((prev) => ({ ...prev, [eventRow.id]: !isExpanded }))}
                                        >
                                            {isExpanded ? 'Read less' : 'Read more'}
                                        </button>
                                    ) : null}
                                    <p className="mt-2 text-xs font-medium text-slate-500">
                                        Start: {formatDateLabel(eventRow.start_date)} · End: {formatDateLabel(eventRow.end_date)} · Time: {formatTimeLabel(eventRow.event_time)}
                                    </p>
                                    <div className="mt-4 flex flex-wrap gap-2 text-xs">
                                        <span className="rounded-md border border-black/10 bg-white px-2 py-1">{eventRow.event_type}</span>
                                        <span className="rounded-md border border-black/10 bg-white px-2 py-1">{eventRow.format}</span>
                                        <span className="rounded-md border border-black/10 bg-white px-2 py-1">{eventRow.participant_mode}</span>
                                        <span className="rounded-md border border-black/10 bg-white px-2 py-1">{eventRow.template_option}</span>
                                    </div>
                                    <div className="mt-4 rounded-xl border border-black/10 bg-white p-3">
                                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Add to symp</p>
                                        <p className="mt-1 text-xs text-slate-500">Current: {eventRow.sympo_name || 'Standalone'}</p>
                                        {canMutate ? (
                                            <div className="mt-2 flex flex-wrap items-center gap-2">
                                                <Select
                                                    value={eventSympoDrafts[eventRow.slug] || (eventRow.sympo_id ? String(eventRow.sympo_id) : 'none')}
                                                    onValueChange={(value) => setEventSympoDrafts((prev) => ({ ...prev, [eventRow.slug]: value }))}
                                                >
                                                    <SelectTrigger className="w-full sm:w-[260px]">
                                                        <SelectValue placeholder="Select sympo" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="none">Standalone</SelectItem>
                                                        {sympoOptions.map((sympo) => (
                                                            <SelectItem key={sympo.id} value={String(sympo.id)}>{sympo.name}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                                <Button
                                                    size="sm"
                                                    className="bg-[#11131a] text-white hover:bg-[#1f2330]"
                                                    disabled={
                                                        assigningSympoSlug === eventRow.slug
                                                        || (eventSympoDrafts[eventRow.slug] || (eventRow.sympo_id ? String(eventRow.sympo_id) : 'none'))
                                                            === (eventRow.sympo_id ? String(eventRow.sympo_id) : 'none')
                                                    }
                                                    onClick={() => assignEventSympo(eventRow)}
                                                >
                                                    {assigningSympoSlug === eventRow.slug ? 'Saving...' : 'Save Sympo'}
                                                </Button>
                                            </div>
                                        ) : null}
                                    </div>

                                    {canMutate ? (
                                        <div className="mt-4 flex flex-wrap gap-2">
                                            {parityEnabled ? (
                                                <Button asChild className="bg-[#11131a] text-white hover:bg-[#1f2330]">
                                                    <Link to={`/persohub/admin/persohub-events/${eventRow.slug}/dashboard`}>
                                                        Manage Event
                                                    </Link>
                                                </Button>
                                            ) : null}
                                            <Button variant="outline" className="border-black/20" onClick={() => openEditDialog(eventRow)}>
                                                Edit Event
                                            </Button>
                                            <Button variant="outline" className="border-black/20" onClick={() => toggleStatus(eventRow)}>
                                                {eventRow.status === 'open' ? 'Close Event' : 'Open Event'}
                                            </Button>
                                            <Button
                                                variant="outline"
                                                className="border-red-300 text-red-600 hover:bg-red-50"
                                                onClick={() => openDeleteDialog(eventRow)}
                                            >
                                                Delete Event
                                            </Button>
                                        </div>
                                    ) : null}
                                </div>
                            );
                        })}
                    </div>
                )}
                <div className="mt-5 flex items-center justify-between gap-2 text-sm">
                    <p className="text-slate-500">Showing {startIndex}-{endIndex} of {totalCount}</p>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                            disabled={loading || page <= 1}
                        >
                            Prev
                        </Button>
                        <span className="text-xs text-slate-600">Page {page} / {totalPages}</span>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                            disabled={loading || page >= totalPages}
                        >
                            Next
                        </Button>
                    </div>
                </div>
            </section>

            <Dialog open={editDialogOpen} onOpenChange={(open) => (open ? setEditDialogOpen(true) : closeEditDialog())}>
                <DialogContent className="max-h-[85vh] w-[92vw] max-w-[720px] overflow-y-auto border-4 border-black">
                    <DialogHeader>
                        <DialogTitle className="font-heading text-2xl font-black">Edit Event</DialogTitle>
                    </DialogHeader>
                    <form className="mt-2 grid gap-4 md:grid-cols-2" onSubmit={updateEvent}>
                        <EventFormFields
                            form={editForm}
                            setForm={setEditForm}
                            posterInputId="persohub-event-poster-upload-edit"
                            posterAssets={editPosterAssets}
                            setPosterAssets={setEditPosterAssets}
                            sympoOptions={sympoOptions}
                        />
                        <div className="md:col-span-2 flex justify-end gap-2">
                            <Button type="button" variant="outline" className="border-black/20" onClick={() => closeEditDialog()} disabled={savingEdit || uploadingEditPoster}>
                                Cancel
                            </Button>
                            <Button type="submit" className="bg-[#11131a] text-white hover:bg-[#1f2330]" disabled={savingEdit || uploadingEditPoster}>
                                {uploadingEditPoster ? 'Uploading Poster...' : savingEdit ? 'Saving...' : 'Save Changes'}
                            </Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>

            <Dialog open={deleteDialogOpen} onOpenChange={(open) => (open ? setDeleteDialogOpen(true) : closeDeleteDialog())}>
                <DialogContent className="w-[92vw] max-w-[520px] border-4 border-black">
                    <DialogHeader>
                        <DialogTitle className="font-heading font-bold text-2xl text-red-600">Delete Event</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <p className="text-sm text-slate-700">
                            This will permanently delete the event and cascade all related rounds, teams, registrations, attendance, scores, badges, invites, and logs.
                        </p>
                        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm">
                            <p className="font-semibold">{deleteTarget?.title || '-'}</p>
                            <p className="text-slate-600">{deleteTarget?.slug || '-'}</p>
                        </div>
                        <div>
                            <Label>Type <span className="font-bold">DELETE</span> to confirm</Label>
                            <Input
                                value={deleteConfirmText}
                                onChange={(e) => setDeleteConfirmText(e.target.value)}
                                placeholder="DELETE"
                                className="mt-2"
                            />
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button variant="outline" className="border-black/20" onClick={closeDeleteDialog} disabled={deleting}>
                                Cancel
                            </Button>
                            <Button
                                className="bg-red-600 text-white hover:bg-red-700"
                                onClick={deleteEvent}
                                disabled={deleting || deleteConfirmText !== 'DELETE'}
                            >
                                {deleting ? 'Deleting...' : 'Delete Event'}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </PersohubAdminLayout>
    );
}
