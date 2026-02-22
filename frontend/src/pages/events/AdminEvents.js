import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';

import { useAuth } from '@/context/AuthContext';
import AdminLayout from '@/pages/HomeAdmin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { uploadPoster } from '@/pages/HomeAdmin/adminApi';
import { compressImageToWebp } from '@/utils/imageCompression';
import ParsedDescription from '@/components/common/ParsedDescription';
import {
    filterPosterAssetsByRatio,
    parsePosterAssets,
    pickPosterAssetByRatio,
    POSTER_ASPECT_RATIOS,
    resolvePosterUrl,
    serializePosterAssets
} from '@/utils/posterAssets';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const initialForm = {
    title: '',
    description: '',
    start_date: '',
    end_date: '',
    poster_url: '',
    whatsapp_url: '',
    external_url_name: 'Join whatsapp channel',
    event_type: 'Event',
    format: 'Offline',
    template_option: 'attendance_scoring',
    participant_mode: 'individual',
    open_for: 'MIT',
    round_mode: 'single',
    round_count: 1,
    team_min_size: '',
    team_max_size: ''
};

const makePosterAssetId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const toPosterAssetRows = (rawPosterUrl) => parsePosterAssets(rawPosterUrl).map((asset) => ({
    id: makePosterAssetId(),
    aspect_ratio: asset.aspect_ratio || '4:5',
    url: asset.url,
    file: null,
    preview_url: ''
}));

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

const toEventForm = (eventRow = {}) => ({
    title: eventRow.title || '',
    description: eventRow.description || '',
    start_date: toDateInputValue(eventRow.start_date),
    end_date: toDateInputValue(eventRow.end_date),
    poster_url: eventRow.poster_url || '',
    whatsapp_url: eventRow.whatsapp_url || '',
    external_url_name: eventRow.external_url_name || 'Join whatsapp channel',
    event_type: eventRow.event_type || 'Event',
    format: eventRow.format || 'Offline',
    template_option: eventRow.template_option || 'attendance_scoring',
    participant_mode: eventRow.participant_mode || 'individual',
    open_for: eventRow.open_for || 'MIT',
    round_mode: eventRow.round_mode || 'single',
    round_count: Number(eventRow.round_count || 1),
    team_min_size: eventRow.team_min_size ?? '',
    team_max_size: eventRow.team_max_size ?? ''
});

const formatDateLabel = (value) => {
    const dateValue = toDateInputValue(value);
    if (!dateValue) return 'TBD';
    const parsed = new Date(`${dateValue}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return dateValue;
    return parsed.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
};

const buildEventPayload = (formState, posterUrl) => ({
    title: formState.title.trim(),
    description: formState.description?.trim() || '',
    start_date: formState.start_date || null,
    end_date: formState.end_date || null,
    poster_url: posterUrl,
    whatsapp_url: formState.whatsapp_url?.trim() || null,
    external_url_name: formState.external_url_name?.trim() || 'Join whatsapp channel',
    event_type: formState.event_type,
    format: formState.format,
    template_option: formState.template_option,
    participant_mode: formState.participant_mode,
    open_for: formState.open_for || 'MIT',
    round_mode: formState.round_mode,
    round_count: Number(formState.round_count || 1),
    team_min_size: formState.participant_mode === 'team' ? Number(formState.team_min_size || 1) : null,
    team_max_size: formState.participant_mode === 'team' ? Number(formState.team_max_size || 1) : null
});

const getCardPosterSrc = (rawPosterUrl) => {
    const assets = filterPosterAssetsByRatio(parsePosterAssets(rawPosterUrl), ['4:5', '5:4']);
    const preferred = pickPosterAssetByRatio(assets, ['4:5', '5:4']);
    return resolvePosterUrl(preferred?.url);
};

function EventFormFields({
    form,
    setForm,
    posterInputId,
    posterAssets,
    setPosterAssets,
    posterUploadRatio,
    setPosterUploadRatio
}) {
    return (
        <>
            <div className="md:col-span-2">
                <Label>Title</Label>
                <Input value={form.title} onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))} required />
            </div>
            <div className="md:col-span-2">
                <Label>Description</Label>
                <Textarea value={form.description} onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))} />
            </div>
            <div>
                <Label>Start Date</Label>
                <Input type="date" value={form.start_date} onChange={(e) => setForm((prev) => ({ ...prev, start_date: e.target.value }))} />
            </div>
            <div>
                <Label>End Date</Label>
                <Input type="date" value={form.end_date} onChange={(e) => setForm((prev) => ({ ...prev, end_date: e.target.value }))} />
            </div>
            <div className="md:col-span-2">
                <Label htmlFor={posterInputId}>Poster Uploads (Multiple)</Label>
                <div className="mt-2 grid gap-2 sm:grid-cols-[160px_1fr]">
                    <select
                        value={posterUploadRatio}
                        onChange={(e) => setPosterUploadRatio(e.target.value)}
                        className="h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm"
                    >
                        {POSTER_ASPECT_RATIOS.map((ratio) => (
                            <option key={ratio} value={ratio}>{ratio}</option>
                        ))}
                    </select>
                    <Input
                        id={posterInputId}
                        type="file"
                        multiple
                        accept="image/png,image/jpeg,image/webp"
                        onChange={(e) => {
                            const files = Array.from(e.target.files || []);
                            if (!files.length) return;
                            setPosterAssets((prev) => ([
                                ...prev,
                                ...files.map((file) => ({
                                    id: makePosterAssetId(),
                                    aspect_ratio: posterUploadRatio,
                                    url: '',
                                    file,
                                    preview_url: URL.createObjectURL(file)
                                }))
                            ]));
                            e.target.value = '';
                        }}
                    />
                </div>
                <p className="mt-2 text-xs text-slate-500">
                    Select an aspect ratio, then upload one or more images for that ratio.
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
                <Label>WhatsApp Channel URL</Label>
                <Input
                    type="url"
                    value={form.whatsapp_url}
                    onChange={(e) => setForm((prev) => ({ ...prev, whatsapp_url: e.target.value }))}
                    placeholder="https://chat.whatsapp.com/..."
                />
            </div>
            <div className="md:col-span-2">
                <Label>External URL Button Name</Label>
                <Input
                    value={form.external_url_name}
                    onChange={(e) => setForm((prev) => ({ ...prev, external_url_name: e.target.value }))}
                    placeholder="Join whatsapp channel"
                />
            </div>
            <div>
                <Label>Type</Label>
                <Select value={form.event_type} onValueChange={(value) => setForm((prev) => ({ ...prev, event_type: value }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="Session">Session</SelectItem>
                        <SelectItem value="Workshop">Workshop</SelectItem>
                        <SelectItem value="Event">Event</SelectItem>
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
                <Label>Open For</Label>
                <Select value={form.open_for || 'MIT'} onValueChange={(value) => setForm((prev) => ({ ...prev, open_for: value }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="MIT">MIT</SelectItem>
                        <SelectItem value="ALL">All</SelectItem>
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

export default function AdminEvents() {
    const { getAuthHeader, isSuperAdmin, canAccessEvents } = useAuth();
    const [events, setEvents] = useState([]);
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
    const [posterUploadRatio, setPosterUploadRatio] = useState('4:5');
    const [editPosterUploadRatio, setEditPosterUploadRatio] = useState('4:5');
    const [uploadingPoster, setUploadingPoster] = useState(false);
    const [uploadingEditPoster, setUploadingEditPoster] = useState(false);
    const [form, setForm] = useState(initialForm);
    const [editForm, setEditForm] = useState(initialForm);
    const [expandedDescriptions, setExpandedDescriptions] = useState({});

    const fetchEvents = useCallback(async () => {
        try {
            const response = await axios.get(`${API}/pda-admin/events`, { headers: getAuthHeader() });
            setEvents(response.data || []);
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Failed to load events');
        } finally {
            setLoading(false);
        }
    }, [getAuthHeader]);

    useEffect(() => {
        if (canAccessEvents || isSuperAdmin) {
            fetchEvents();
        } else {
            setLoading(false);
        }
    }, [canAccessEvents, fetchEvents, isSuperAdmin]);

    const validateDateRange = (formState) => {
        if (formState.start_date && formState.end_date && formState.start_date > formState.end_date) {
            toast.error('Start date cannot be after end date');
            return false;
        }
        return true;
    };

    const onSubmit = async (e) => {
        e.preventDefault();
        if (!isSuperAdmin) return;
        if (!validateDateRange(form)) return;
        setSaving(true);
        try {
            let nextAssets = posterAssets.filter((asset) => asset.url && !asset.file).map((asset) => ({
                url: asset.url,
                aspect_ratio: asset.aspect_ratio
            }));
            const pendingAssets = posterAssets.filter((asset) => asset.file);
            if (pendingAssets.length) {
                setUploadingPoster(true);
                for (const asset of pendingAssets) {
                    const processedPoster = await compressImageToWebp(asset.file);
                    const uploadedUrl = await uploadPoster(processedPoster, getAuthHeader);
                    nextAssets.push({
                        url: uploadedUrl,
                        aspect_ratio: asset.aspect_ratio
                    });
                }
                setUploadingPoster(false);
            }
            const posterUrl = serializePosterAssets(nextAssets);
            const payload = buildEventPayload(form, posterUrl);
            await axios.post(`${API}/pda-admin/events`, payload, { headers: getAuthHeader() });
            toast.success('Event created');
            setForm(initialForm);
            releasePosterPreviewUrls(posterAssets);
            setPosterAssets([]);
            fetchEvents();
        } catch (error) {
            setUploadingPoster(false);
            toast.error(error.response?.data?.detail || 'Failed to create event');
        } finally {
            setSaving(false);
            setUploadingPoster(false);
        }
    };

    const openEditDialog = (eventRow) => {
        if (!isSuperAdmin) return;
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
        if (!isSuperAdmin || !editTarget) return;
        if (!validateDateRange(editForm)) return;
        setSavingEdit(true);
        try {
            let nextAssets = editPosterAssets.filter((asset) => asset.url && !asset.file).map((asset) => ({
                url: asset.url,
                aspect_ratio: asset.aspect_ratio
            }));
            const pendingAssets = editPosterAssets.filter((asset) => asset.file);
            if (pendingAssets.length) {
                setUploadingEditPoster(true);
                for (const asset of pendingAssets) {
                    const processedPoster = await compressImageToWebp(asset.file);
                    const uploadedUrl = await uploadPoster(processedPoster, getAuthHeader);
                    nextAssets.push({
                        url: uploadedUrl,
                        aspect_ratio: asset.aspect_ratio
                    });
                }
                setUploadingEditPoster(false);
            }
            const posterUrl = serializePosterAssets(nextAssets);
            const payload = buildEventPayload(editForm, posterUrl);
            await axios.put(`${API}/pda-admin/events/${editTarget.slug}`, payload, { headers: getAuthHeader() });
            toast.success('Event updated');
            closeEditDialog(true);
            fetchEvents();
        } catch (error) {
            setUploadingEditPoster(false);
            toast.error(error.response?.data?.detail || 'Failed to update event');
        } finally {
            setSavingEdit(false);
            setUploadingEditPoster(false);
        }
    };

    const toggleStatus = async (eventRow) => {
        if (!isSuperAdmin) return;
        const nextStatus = eventRow.status === 'open' ? 'closed' : 'open';
        try {
            await axios.put(`${API}/pda-admin/events/${eventRow.slug}`, { status: nextStatus }, { headers: getAuthHeader() });
            toast.success(`Event ${nextStatus}`);
            fetchEvents();
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Failed to update status');
        }
    };

    const openDeleteDialog = (eventRow) => {
        if (!isSuperAdmin) return;
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
        if (!deleteTarget || deleteConfirmText !== 'DELETE' || !isSuperAdmin) return;
        setDeleting(true);
        try {
            await axios.delete(`${API}/pda-admin/events/${deleteTarget.slug}`, { headers: getAuthHeader() });
            toast.success('Event deleted');
            setDeleteDialogOpen(false);
            setDeleteTarget(null);
            setDeleteConfirmText('');
            fetchEvents();
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Failed to delete event');
        } finally {
            setDeleting(false);
        }
    };

    return (
        <AdminLayout title="Events" subtitle="Managed PDA events with attendance and scoring workflows." allowEventAdmin>
            {isSuperAdmin ? (
                <section className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
                    <h2 className="text-2xl font-heading font-black">Create Event</h2>
                    <form className="mt-4 grid gap-4 md:grid-cols-2" onSubmit={onSubmit}>
                        <EventFormFields
                            form={form}
                            setForm={setForm}
                            posterInputId="event-poster-upload"
                            posterAssets={posterAssets}
                            setPosterAssets={setPosterAssets}
                            posterUploadRatio={posterUploadRatio}
                            setPosterUploadRatio={setPosterUploadRatio}
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
                <h2 className="text-2xl font-heading font-black">Available Events</h2>
                {loading ? (
                    <p className="mt-4 text-sm text-slate-500">Loading...</p>
                ) : events.length === 0 ? (
                    <p className="mt-4 text-sm text-slate-500">No events available for your policy.</p>
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
                                    <div className={`relative mt-3 text-sm text-slate-600 space-y-2 ${shouldClamp ? 'max-h-24 overflow-hidden' : ''}`}>
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
                                        Start: {formatDateLabel(eventRow.start_date)} · End: {formatDateLabel(eventRow.end_date)}
                                    </p>
                                    <div className="mt-4 flex flex-wrap gap-2 text-xs">
                                        <span className="rounded-md border border-black/10 bg-white px-2 py-1">{eventRow.event_type}</span>
                                        <span className="rounded-md border border-black/10 bg-white px-2 py-1">{eventRow.format}</span>
                                        <span className="rounded-md border border-black/10 bg-white px-2 py-1">{eventRow.participant_mode}</span>
                                        <span className="rounded-md border border-black/10 bg-white px-2 py-1">{eventRow.open_for || 'MIT'}</span>
                                        <span className="rounded-md border border-black/10 bg-white px-2 py-1">{eventRow.template_option}</span>
                                    </div>
                                    <div className="mt-4 flex flex-wrap gap-2">
                                        <Link to={`/admin/events/${eventRow.slug}`}>
                                            <Button className="bg-[#11131a] text-white hover:bg-[#1f2330]">Manage</Button>
                                        </Link>
                                        {isSuperAdmin ? (
                                            <>
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
                                            </>
                                        ) : null}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
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
                            posterInputId="event-poster-upload-edit"
                            posterAssets={editPosterAssets}
                            setPosterAssets={setEditPosterAssets}
                            posterUploadRatio={editPosterUploadRatio}
                            setPosterUploadRatio={setEditPosterUploadRatio}
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
        </AdminLayout>
    );
}
