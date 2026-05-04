import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { Box, ChevronDown, ChevronUp, ExternalLink, Eye, EyeOff, Loader2, RefreshCcw, Save, Trash2, UploadCloud, Video } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { usePersohubAdminAuth } from '@/context/PersohubAdminAuthContext';
import EventAdminShell, { useEventAdminShell } from './EventAdminShell';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const MAX_CAPTION_LENGTH = 500;
const MAX_MODEL_SIZE_BYTES = 8 * 1024 * 1024;
const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_SIZE_BYTES = 40 * 1024 * 1024;
const WINNER_THEME_OPTIONS = [
    { value: '', label: 'Auto / rank default' },
    { value: 'wildcard', label: 'Wildcard' },
    { value: 'grand', label: 'Grand' },
    { value: 'classic', label: 'Classic' },
    { value: 'performer', label: 'Performer' },
    { value: 'orator', label: 'Orator' },
    { value: 'creative', label: 'Creative' },
];
const HIGHLIGHT_PALETTE_KEYS = ['gold', 'teal', 'coral', 'blue', 'lime', 'rose'];

const extractErrorMessage = (error, fallback) => {
    const detail = error?.response?.data?.detail;
    const message = error?.response?.data?.message;
    if (Array.isArray(detail)) {
        const text = detail
            .map((item) => {
                if (typeof item === 'string') return item;
                if (item && typeof item === 'object') {
                    const loc = Array.isArray(item.loc) ? item.loc.join('.') : '';
                    const msg = String(item.msg || '').trim();
                    return loc && msg ? `${loc}: ${msg}` : msg || JSON.stringify(item);
                }
                return '';
            })
            .filter(Boolean)
            .join(' | ');
        return text || fallback;
    }
    if (detail && typeof detail === 'object') return JSON.stringify(detail);
    if (typeof detail === 'string' && detail.trim()) return detail.trim();
    if (typeof message === 'string' && message.trim()) return message.trim();
    return fallback;
};

const modelContentTypeForFile = (file) => {
    const name = String(file?.name || '').toLowerCase();
    if (name.endsWith('.glb')) return 'model/gltf-binary';
    if (name.endsWith('.gltf')) return 'model/gltf+json';
    return file?.type || 'application/octet-stream';
};

function EntityAutocompleteInput({
    value,
    onChange,
    options,
    selectedOption,
    onSelect,
    placeholder,
    loading,
}) {
    const [open, setOpen] = useState(false);
    const normalizedValue = String(value || '').trim().toLowerCase();
    const filteredOptions = useMemo(() => {
        const base = normalizedValue
            ? options.filter((option) => option.searchText.includes(normalizedValue))
            : options;
        return base.slice(0, 8);
    }, [normalizedValue, options]);

    return (
        <div className="relative">
            <input
                value={value}
                onChange={(event) => {
                    onChange(event.target.value);
                    setOpen(true);
                }}
                onFocus={() => setOpen(true)}
                onBlur={() => window.setTimeout(() => setOpen(false), 120)}
                placeholder={loading ? 'Loading active entities...' : placeholder}
                className="w-full rounded-md border-2 border-black px-3 py-2 text-sm"
            />
            {open && !loading && filteredOptions.length > 0 ? (
                <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-md border-2 border-black bg-white shadow-[6px_6px_0_0_#000]">
                    {filteredOptions.map((option) => (
                        <button
                            key={option.key}
                            type="button"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => {
                                onSelect(option);
                                setOpen(false);
                            }}
                            className={`flex w-full items-center justify-between gap-3 border-b border-black/10 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-slate-100 ${selectedOption?.key === option.key ? 'bg-yellow-100' : 'bg-white'}`}
                        >
                            <span className="font-semibold text-slate-900">{option.label}</span>
                            <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">{option.entity_type}</span>
                        </button>
                    ))}
                </div>
            ) : null}
            {selectedOption ? (
                <p className="mt-2 text-xs font-bold text-slate-600">
                    Selected: {selectedOption.label}
                </p>
            ) : null}
        </div>
    );
}

function ResultsAdminContent() {
    const { getAuthHeader } = usePersohubAdminAuth();
    const { eventInfo, eventSlug, refreshEventInfo, pushSavedUndo } = useEventAdminShell();
    const [published, setPublished] = useState(Boolean(eventInfo?.results_published));
    const [revealWinners, setRevealWinners] = useState(Boolean(eventInfo?.results_winners_revealed));
    const [caption, setCaption] = useState(eventInfo?.results_caption || '');
    const [modelUrl, setModelUrl] = useState(eventInfo?.results_model_url || '');
    const [modelFile, setModelFile] = useState(null);
    const [saving, setSaving] = useState(false);
    const [modelUploading, setModelUploading] = useState(false);
    const [publishConfirmOpen, setPublishConfirmOpen] = useState(false);
    const [revealConfirmOpen, setRevealConfirmOpen] = useState(false);
    const [pendingPublished, setPendingPublished] = useState(null);

    const [roundRows, setRoundRows] = useState([]);
    const [roundsLoading, setRoundsLoading] = useState(false);
    const [activeRoundActionId, setActiveRoundActionId] = useState(null);
    const [refreshingSnapshots, setRefreshingSnapshots] = useState(false);

    const [participantRows, setParticipantRows] = useState([]);
    const [participantsLoading, setParticipantsLoading] = useState(false);

    const [titleRows, setTitleRows] = useState([]);
    const [titlesLoading, setTitlesLoading] = useState(false);
    const [editingTitleId, setEditingTitleId] = useState(null);
    const [titleName, setTitleName] = useState('');
    const [titleThemeKey, setTitleThemeKey] = useState('');
    const [titleRank, setTitleRank] = useState('');
    const [titleEntityKey, setTitleEntityKey] = useState('');
    const [titleEntityQuery, setTitleEntityQuery] = useState('');
    const [titleSaving, setTitleSaving] = useState(false);

    const [finalistRows, setFinalistRows] = useState([]);
    const [finalistsLoading, setFinalistsLoading] = useState(false);
    const [editingFinalistId, setEditingFinalistId] = useState(null);
    const [finalistEntityKey, setFinalistEntityKey] = useState('');
    const [finalistEntityQuery, setFinalistEntityQuery] = useState('');
    const [finalistPhotoUrl, setFinalistPhotoUrl] = useState('');
    const [finalistVideoUrl, setFinalistVideoUrl] = useState('');
    const [finalistPhotoFile, setFinalistPhotoFile] = useState(null);
    const [finalistVideoFile, setFinalistVideoFile] = useState(null);
    const [finalistSaving, setFinalistSaving] = useState(false);
    const [finalistContentText, setFinalistContentText] = useState('');

    const [highlightRows, setHighlightRows] = useState([]);
    const [highlightsLoading, setHighlightsLoading] = useState(false);
    const [editingHighlightId, setEditingHighlightId] = useState(null);
    const [highlightEmoji, setHighlightEmoji] = useState('');
    const [highlightTag, setHighlightTag] = useState('');
    const [highlightTitle, setHighlightTitle] = useState('');
    const [highlightEntityKey, setHighlightEntityKey] = useState('');
    const [highlightEntityQuery, setHighlightEntityQuery] = useState('');
    const [highlightQuantity, setHighlightQuantity] = useState('');
    const [highlightDescription, setHighlightDescription] = useState('');
    const [highlightContentText, setHighlightContentText] = useState('');
    const [highlightSaving, setHighlightSaving] = useState(false);

    useEffect(() => {
        setPublished(Boolean(eventInfo?.results_published));
        setRevealWinners(Boolean(eventInfo?.results_winners_revealed));
        setCaption(eventInfo?.results_caption || '');
        setModelUrl(eventInfo?.results_model_url || '');
        setModelFile(null);
    }, [eventInfo?.results_caption, eventInfo?.results_model_url, eventInfo?.results_published, eventInfo?.results_winners_revealed]);

    useEffect(() => {
        let mounted = true;
        const load = async () => {
            setRoundsLoading(true);
            try {
                const response = await axios.get(`${API}/persohub/admin/persohub-events/${eventSlug}/results/rounds`, {
                    headers: getAuthHeader(),
                });
                if (mounted) setRoundRows(Array.isArray(response?.data) ? response.data : []);
            } catch (error) {
                if (mounted) toast.error(extractErrorMessage(error, 'Failed to load round publish table'));
            } finally {
                if (mounted) setRoundsLoading(false);
            }
        };
        load();
        return () => { mounted = false; };
    }, [eventSlug, getAuthHeader]);

    useEffect(() => {
        let mounted = true;
        const load = async () => {
            setParticipantsLoading(true);
            try {
                const response = await axios.get(`${API}/persohub/admin/persohub-events/${eventSlug}/participants`, {
                    params: { page: 1, page_size: 200 },
                    headers: getAuthHeader(),
                });
                if (!mounted) return;
                const payload = Array.isArray(response?.data)
                    ? response.data
                    : Array.isArray(response?.data?.items)
                        ? response.data.items
                        : [];
                setParticipantRows(payload);
            } catch (error) {
                if (mounted) toast.error(extractErrorMessage(error, 'Failed to load active participants'));
            } finally {
                if (mounted) setParticipantsLoading(false);
            }
        };
        load();
        return () => { mounted = false; };
    }, [eventSlug, getAuthHeader]);

    const loadTitles = async () => {
        setTitlesLoading(true);
        try {
            const response = await axios.get(`${API}/persohub/admin/persohub-events/${eventSlug}/results/titles`, {
                headers: getAuthHeader(),
            });
            setTitleRows(Array.isArray(response?.data) ? response.data : []);
        } catch (error) {
            toast.error(extractErrorMessage(error, 'Failed to load title winners'));
        } finally {
            setTitlesLoading(false);
        }
    };

    const loadFinalists = async () => {
        setFinalistsLoading(true);
        try {
            const response = await axios.get(`${API}/persohub/admin/persohub-events/${eventSlug}/results/finalists`, {
                headers: getAuthHeader(),
            });
            setFinalistRows(Array.isArray(response?.data) ? response.data : []);
        } catch (error) {
            toast.error(extractErrorMessage(error, 'Failed to load finalists'));
        } finally {
            setFinalistsLoading(false);
        }
    };

    const loadHighlights = async () => {
        setHighlightsLoading(true);
        try {
            const response = await axios.get(`${API}/persohub/admin/persohub-events/${eventSlug}/results/highlights`, {
                headers: getAuthHeader(),
            });
            setHighlightRows(Array.isArray(response?.data) ? response.data : []);
        } catch (error) {
            toast.error(extractErrorMessage(error, 'Failed to load result highlights'));
        } finally {
            setHighlightsLoading(false);
        }
    };

    useEffect(() => {
        loadTitles();
        loadFinalists();
        loadHighlights();
    }, [eventSlug]); // eslint-disable-line react-hooks/exhaustive-deps

    const normalizedCaption = caption.trim();
    const publicResultsUrl = `/persohub/events/${eventSlug}/results`;
    const publishableRounds = roundRows.filter((row) => Boolean(row?.publishable));
    const unpublishedPublishableRounds = publishableRounds.filter((row) => !Boolean(row?.results_published));
    const dirty = useMemo(() => (
        published !== Boolean(eventInfo?.results_published)
        || normalizedCaption !== String(eventInfo?.results_caption || '').trim()
        || String(modelUrl || '').trim() !== String(eventInfo?.results_model_url || '').trim()
        || Boolean(modelFile)
    ), [eventInfo?.results_caption, eventInfo?.results_model_url, eventInfo?.results_published, modelFile, modelUrl, normalizedCaption, published]);

    const entityOptions = useMemo(() => (
        participantRows.map((row) => ({
            key: `${row.entity_type}:${row.entity_id}`,
            label: `${row.name} (${row.regno_or_code || '-'})`,
            entity_type: row.entity_type,
            entity_id: row.entity_id,
            status: String(row?.status || '').trim(),
            searchText: `${row?.name || ''} ${row?.regno_or_code || ''} ${row?.entity_type || ''}`.toLowerCase(),
        }))
    ), [participantRows]);

    const activeEntityOptions = useMemo(
        () => entityOptions.filter((row) => !row.status || String(row.status).toLowerCase() === 'active'),
        [entityOptions]
    );

    const selectedTitleEntity = useMemo(
        () => entityOptions.find((opt) => opt.key === titleEntityKey) || null,
        [entityOptions, titleEntityKey]
    );

    const selectedFinalistEntity = useMemo(
        () => activeEntityOptions.find((opt) => opt.key === finalistEntityKey) || null,
        [activeEntityOptions, finalistEntityKey]
    );

    const selectedHighlightEntity = useMemo(
        () => entityOptions.find((opt) => opt.key === highlightEntityKey) || null,
        [entityOptions, highlightEntityKey]
    );

    const parseJsonContent = (label, raw) => {
        const normalized = String(raw || '').trim();
        if (!normalized) return { ok: true, value: null };
        try {
            const parsed = JSON.parse(normalized);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                return { ok: true, value: parsed };
            }
            toast.error(`${label} must be a JSON object`);
            return { ok: false, value: null };
        } catch (_error) {
            toast.error(`${label} is not valid JSON`);
            return { ok: false, value: null };
        }
    };

    const refreshRoundRows = async () => {
        const response = await axios.get(`${API}/persohub/admin/persohub-events/${eventSlug}/results/rounds`, {
            headers: getAuthHeader(),
        });
        setRoundRows(Array.isArray(response?.data) ? response.data : []);
    };

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
            toast.error('Model must be 8 MB or smaller');
            return;
        }
        setModelFile(file);
    };

    const uploadFileViaPresign = async ({ endpoint, file, fallbackTypes }) => {
        if (!file) return null;
        const contentType = file.type || fallbackTypes[0] || 'application/octet-stream';
        const presignRes = await axios.post(
            endpoint,
            { filename: file.name, content_type: contentType },
            { headers: getAuthHeader() }
        );
        const { upload_url, public_url, content_type } = presignRes.data || {};
        await axios.put(upload_url, file, {
            headers: { 'Content-Type': content_type || contentType },
        });
        return public_url || null;
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
            toast.error(extractErrorMessage(error, 'Failed to save results settings'));
            return false;
        } finally {
            setSaving(false);
            setModelUploading(false);
        }
    };

    const openPublishConfirm = () => {
        if (!published && unpublishedPublishableRounds.length > 0) {
            toast.error('Publish all completed rounds before releasing final event results');
            return;
        }
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

    const handleRoundPublishState = async (roundId, publish, label) => {
        setActiveRoundActionId(roundId);
        try {
            await axios.put(
                `${API}/persohub/admin/persohub-events/${eventSlug}/results/rounds/${roundId}`,
                { publish },
                { headers: getAuthHeader() }
            );
            await Promise.all([refreshRoundRows(), refreshEventInfo()]);
            toast.success(label);
        } catch (error) {
            toast.error(extractErrorMessage(error, 'Failed to update round results publish state'));
        } finally {
            setActiveRoundActionId(null);
        }
    };

    const handleRefreshAllSnapshots = async () => {
        setRefreshingSnapshots(true);
        try {
            await axios.post(
                `${API}/persohub/admin/persohub-events/${eventSlug}/results/rounds/refresh`,
                {},
                { headers: getAuthHeader() }
            );
            await Promise.all([refreshRoundRows(), refreshEventInfo()]);
            toast.success('Published round snapshots refreshed');
        } catch (error) {
            toast.error(extractErrorMessage(error, 'Failed to refresh round snapshots'));
        } finally {
            setRefreshingSnapshots(false);
        }
    };

    const handleRevealWinnersSave = async () => {
        try {
            await axios.put(
                `${API}/persohub/admin/persohub-events/${eventSlug}/results/winners-reveal`,
                { results_winners_revealed: !revealWinners },
                { headers: getAuthHeader() }
            );
            await refreshEventInfo();
            setRevealWinners((prev) => !prev);
            setRevealConfirmOpen(false);
            toast.success(!revealWinners ? 'Winners revealed' : 'Winners hidden');
        } catch (error) {
            toast.error(extractErrorMessage(error, 'Failed to update winners reveal state'));
        }
    };

    const resetTitleForm = () => {
        setEditingTitleId(null);
        setTitleName('');
        setTitleThemeKey('');
        setTitleRank('');
        setTitleEntityKey('');
        setTitleEntityQuery('');
    };

    const saveTitle = async () => {
        if (!selectedTitleEntity) {
            toast.error('Select an active participant/team');
            return;
        }
        const parsedRank = Number.parseInt(String(titleRank || '').trim(), 10);
        if (!Number.isFinite(parsedRank) || parsedRank <= 0) {
            toast.error('Enter a valid precedence rank');
            return;
        }
        setTitleSaving(true);
        try {
            const payload = {
                title_name: String(titleName || '').trim(),
                theme_key: String(titleThemeKey || '').trim() || null,
                precedence_rank: parsedRank,
                entity_type: selectedTitleEntity.entity_type,
                user_id: selectedTitleEntity.entity_type === 'user' ? selectedTitleEntity.entity_id : null,
                team_id: selectedTitleEntity.entity_type === 'team' ? selectedTitleEntity.entity_id : null,
            };
            if (!payload.title_name) {
                toast.error('Title name is required');
                return;
            }
            if (editingTitleId) {
                await axios.put(`${API}/persohub/admin/persohub-events/${eventSlug}/results/titles/${editingTitleId}`, payload, { headers: getAuthHeader() });
                toast.success('Title winner updated');
            } else {
                await axios.post(`${API}/persohub/admin/persohub-events/${eventSlug}/results/titles`, payload, { headers: getAuthHeader() });
                toast.success('Title winner added');
            }
            await loadTitles();
            resetTitleForm();
        } catch (error) {
            toast.error(extractErrorMessage(error, 'Failed to save title winner'));
        } finally {
            setTitleSaving(false);
        }
    };

    const editTitle = (row) => {
        const winner = row?.winner || {};
        const entityKey = `${winner.entity_type}:${winner.entity_id}`;
        const matchedOption = entityOptions.find((opt) => opt.key === entityKey);
        setEditingTitleId(row.id);
        setTitleName(row.title_name || '');
        setTitleThemeKey(row.theme_key || '');
        setTitleRank(String(row.precedence_rank || ''));
        setTitleEntityKey(entityKey);
        setTitleEntityQuery(matchedOption?.label || '');
    };

    const removeTitle = async (titleId) => {
        try {
            await axios.delete(`${API}/persohub/admin/persohub-events/${eventSlug}/results/titles/${titleId}`, { headers: getAuthHeader() });
            toast.success('Title winner removed');
            await loadTitles();
        } catch (error) {
            toast.error(extractErrorMessage(error, 'Failed to remove title winner'));
        }
    };

    const resetFinalistForm = () => {
        setEditingFinalistId(null);
        setFinalistEntityKey('');
        setFinalistEntityQuery('');
        setFinalistPhotoUrl('');
        setFinalistVideoUrl('');
        setFinalistPhotoFile(null);
        setFinalistVideoFile(null);
        setFinalistContentText('');
    };

    const saveFinalist = async () => {
        if (!selectedFinalistEntity) {
            toast.error('Select an active participant/team');
            return;
        }
        setFinalistSaving(true);
        try {
            const parsedContent = parseJsonContent('Finalist content', finalistContentText);
            if (!parsedContent.ok) return;
            let photoUrl = String(finalistPhotoUrl || '').trim() || null;
            let videoUrl = String(finalistVideoUrl || '').trim() || null;
            if (finalistPhotoFile) {
                photoUrl = await uploadFileViaPresign({
                    endpoint: `${API}/persohub/admin/persohub-events/${eventSlug}/results/finalists/photo/presign`,
                    file: finalistPhotoFile,
                    fallbackTypes: ['image/png'],
                });
            }
            if (finalistVideoFile) {
                videoUrl = await uploadFileViaPresign({
                    endpoint: `${API}/persohub/admin/persohub-events/${eventSlug}/results/finalists/video/presign`,
                    file: finalistVideoFile,
                    fallbackTypes: ['video/mp4'],
                });
            }
            const payload = {
                entity_type: selectedFinalistEntity.entity_type,
                user_id: selectedFinalistEntity.entity_type === 'user' ? selectedFinalistEntity.entity_id : null,
                team_id: selectedFinalistEntity.entity_type === 'team' ? selectedFinalistEntity.entity_id : null,
                photo_url: photoUrl,
                video_url: videoUrl,
                content: parsedContent.value,
            };
            if (editingFinalistId) {
                await axios.put(`${API}/persohub/admin/persohub-events/${eventSlug}/results/finalists/${editingFinalistId}`, payload, { headers: getAuthHeader() });
                toast.success('Finalist updated');
            } else {
                await axios.post(`${API}/persohub/admin/persohub-events/${eventSlug}/results/finalists`, payload, { headers: getAuthHeader() });
                toast.success('Finalist added');
            }
            await loadFinalists();
            resetFinalistForm();
        } catch (error) {
            toast.error(extractErrorMessage(error, 'Failed to save finalist'));
        } finally {
            setFinalistSaving(false);
        }
    };

    const editFinalist = (row) => {
        const finalist = row?.finalist || {};
        const entityKey = `${finalist.entity_type}:${finalist.entity_id}`;
        const matchedOption = entityOptions.find((opt) => opt.key === entityKey);
        setEditingFinalistId(row.id);
        setFinalistEntityKey(entityKey);
        setFinalistEntityQuery(matchedOption?.label || '');
        setFinalistPhotoUrl(finalist.resolved_photo_url || '');
        setFinalistVideoUrl(finalist.resolved_video_url || '');
        setFinalistPhotoFile(null);
        setFinalistVideoFile(null);
        setFinalistContentText(finalist?.content ? JSON.stringify(finalist.content, null, 2) : '');
    };

    const removeFinalist = async (id) => {
        try {
            await axios.delete(`${API}/persohub/admin/persohub-events/${eventSlug}/results/finalists/${id}`, { headers: getAuthHeader() });
            toast.success('Finalist removed');
            await loadFinalists();
        } catch (error) {
            toast.error(extractErrorMessage(error, 'Failed to remove finalist'));
        }
    };

    const resetHighlightForm = () => {
        setEditingHighlightId(null);
        setHighlightEmoji('');
        setHighlightTag('');
        setHighlightTitle('');
        setHighlightEntityKey('');
        setHighlightEntityQuery('');
        setHighlightQuantity('');
        setHighlightDescription('');
        setHighlightContentText('');
    };

    const saveHighlight = async () => {
        const parsedContent = parseJsonContent('Highlight content', highlightContentText);
        if (!parsedContent.ok) return;
        if (!String(highlightTitle || '').trim()) {
            toast.error('Highlight title is required');
            return;
        }
        setHighlightSaving(true);
        try {
            const nextPalette = HIGHLIGHT_PALETTE_KEYS[Math.floor(Math.random() * HIGHLIGHT_PALETTE_KEYS.length)];
            const contentValue = parsedContent.value ? { ...parsedContent.value } : {};
            if (!contentValue.palette_key) contentValue.palette_key = nextPalette;
            const payload = {
                emoji: String(highlightEmoji || '').trim() || null,
                tag: String(highlightTag || '').trim() || null,
                title: String(highlightTitle || '').trim(),
                entity_type: selectedHighlightEntity?.entity_type || null,
                user_id: selectedHighlightEntity?.entity_type === 'user' ? selectedHighlightEntity.entity_id : null,
                team_id: selectedHighlightEntity?.entity_type === 'team' ? selectedHighlightEntity.entity_id : null,
                quantity: String(highlightQuantity || '').trim() || null,
                description: String(highlightDescription || '').trim() || null,
                content: contentValue,
                sort_order: editingHighlightId
                    ? (highlightRows.find((row) => row.id === editingHighlightId)?.sort_order || 1)
                    : (highlightRows.length > 0 ? Math.max(...highlightRows.map((row) => Number(row.sort_order || 0))) + 1 : 1),
            };
            if (editingHighlightId) {
                await axios.put(`${API}/persohub/admin/persohub-events/${eventSlug}/results/highlights/${editingHighlightId}`, payload, { headers: getAuthHeader() });
                toast.success('Highlight updated');
            } else {
                await axios.post(`${API}/persohub/admin/persohub-events/${eventSlug}/results/highlights`, payload, { headers: getAuthHeader() });
                toast.success('Highlight added');
            }
            await loadHighlights();
            resetHighlightForm();
        } catch (error) {
            toast.error(extractErrorMessage(error, 'Failed to save highlight'));
        } finally {
            setHighlightSaving(false);
        }
    };

    const editHighlight = (row) => {
        const participant = row?.participant || null;
        const entityKey = participant ? `${participant.entity_type}:${participant.entity_id}` : '';
        const matchedOption = entityOptions.find((opt) => opt.key === entityKey);
        setEditingHighlightId(row.id);
        setHighlightEmoji(row.emoji || '');
        setHighlightTag(row.tag || '');
        setHighlightTitle(row.title || '');
        setHighlightEntityKey(entityKey);
        setHighlightEntityQuery(matchedOption?.label || '');
        setHighlightQuantity(row.quantity || '');
        setHighlightDescription(row.description || '');
        setHighlightContentText(row.content ? JSON.stringify(row.content, null, 2) : '');
    };

    const removeHighlight = async (id) => {
        try {
            await axios.delete(`${API}/persohub/admin/persohub-events/${eventSlug}/results/highlights/${id}`, { headers: getAuthHeader() });
            toast.success('Highlight removed');
            await loadHighlights();
        } catch (error) {
            toast.error(extractErrorMessage(error, 'Failed to remove highlight'));
        }
    };

    const buildHighlightPayloadFromRow = (row, sortOrder) => ({
        emoji: row.emoji || null,
        tag: row.tag || null,
        title: row.title,
        entity_type: row?.participant?.entity_type || null,
        user_id: row?.participant?.entity_type === 'user' ? row.participant.entity_id : null,
        team_id: row?.participant?.entity_type === 'team' ? row.participant.entity_id : null,
        quantity: row.quantity || null,
        description: row.description || null,
        content: row.content || null,
        sort_order: sortOrder,
    });

    const moveHighlight = async (rowIndex, direction) => {
        const swapIndex = rowIndex + direction;
        if (rowIndex < 0 || swapIndex < 0 || swapIndex >= highlightRows.length) return;
        const current = highlightRows[rowIndex];
        const target = highlightRows[swapIndex];
        try {
            await Promise.all([
                axios.put(
                    `${API}/persohub/admin/persohub-events/${eventSlug}/results/highlights/${current.id}`,
                    buildHighlightPayloadFromRow(current, target.sort_order),
                    { headers: getAuthHeader() }
                ),
                axios.put(
                    `${API}/persohub/admin/persohub-events/${eventSlug}/results/highlights/${target.id}`,
                    buildHighlightPayloadFromRow(target, current.sort_order),
                    { headers: getAuthHeader() }
                ),
            ]);
            await loadHighlights();
        } catch (error) {
            toast.error(extractErrorMessage(error, 'Failed to reorder highlights'));
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

            <div className="neo-card space-y-4">
                <div>
                    <h2 className="font-heading text-xl font-black">Hero Caption</h2>
                    <p className="mt-1 text-sm text-slate-600">This appears directly below the hero text on the public results page.</p>
                </div>
                <Textarea
                    value={caption}
                    onChange={(event) => setCaption(event.target.value.slice(0, MAX_CAPTION_LENGTH))}
                    rows={5}
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
                            <h3 className="font-heading text-base font-black">3D Hero Model</h3>
                            <p className="mt-1 text-xs text-slate-600">Upload a self-contained .glb under 8 MB, ideally 1-3 MB with Draco or Meshopt compression.</p>
                            {modelFile ? (
                                <p className="mt-2 truncate text-xs font-bold text-primary">Selected: {modelFile.name}</p>
                            ) : modelUrl ? (
                                <a href={modelUrl} target="_blank" rel="noreferrer" className="mt-2 block truncate text-xs font-bold text-primary underline">{modelUrl}</a>
                            ) : (
                                <p className="mt-2 text-xs font-bold text-slate-500">Using bundled trophy model.</p>
                            )}
                        </div>
                    </div>
                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                        <label className="inline-flex cursor-pointer items-center justify-center rounded-md border-2 border-black bg-slate-900 px-4 py-2 text-sm font-bold text-white shadow-neo hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none">
                            <UploadCloud className="mr-2 h-4 w-4" />
                            Choose Model
                            <input type="file" accept=".glb,.gltf,model/gltf-binary,model/gltf+json" className="sr-only" onChange={handleModelFileChange} disabled={saving} />
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

            <div className="neo-card space-y-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h2 className="font-heading text-xl font-black">Title Winners</h2>
                        <p className="mt-1 text-sm text-slate-600">Pick active participant/team, title name, and precedence rank.</p>
                    </div>
                    <Button
                        type="button"
                        onClick={() => setRevealConfirmOpen(true)}
                        className={`${revealWinners ? 'bg-cyan-600 text-white' : 'bg-slate-900 text-white'} border-2 border-black shadow-neo`}
                    >
                        {revealWinners ? <Eye className="mr-2 h-4 w-4" /> : <EyeOff className="mr-2 h-4 w-4" />}
                        {revealWinners ? 'Winners Revealed' : 'Reveal Winners'}
                    </Button>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                    <EntityAutocompleteInput
                        value={titleEntityQuery}
                        onChange={(nextValue) => {
                            setTitleEntityQuery(nextValue);
                            setTitleEntityKey('');
                        }}
                        options={activeEntityOptions}
                        selectedOption={selectedTitleEntity}
                        onSelect={(option) => {
                            setTitleEntityKey(option.key);
                            setTitleEntityQuery(option.label);
                        }}
                        placeholder="Search active participant/team"
                        loading={participantsLoading}
                    />
                    <input
                        value={titleName}
                        onChange={(event) => setTitleName(event.target.value)}
                        placeholder="Title name"
                        className="rounded-md border-2 border-black px-3 py-2 text-sm"
                    />
                    <select
                        value={titleThemeKey}
                        onChange={(event) => setTitleThemeKey(event.target.value)}
                        className="rounded-md border-2 border-black px-3 py-2 text-sm"
                    >
                        {WINNER_THEME_OPTIONS.map((option) => <option key={option.value || 'auto'} value={option.value}>{option.label}</option>)}
                    </select>
                    <input
                        value={titleRank}
                        onChange={(event) => setTitleRank(event.target.value)}
                        placeholder="Precedence rank"
                        className="rounded-md border-2 border-black px-3 py-2 text-sm"
                    />
                </div>
                <div className="flex gap-2">
                    <Button onClick={saveTitle} disabled={titleSaving} className="border-2 border-black bg-primary text-white shadow-neo">
                        {titleSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        {editingTitleId ? 'Update Title' : 'Add Title'}
                    </Button>
                    {editingTitleId ? (
                        <Button variant="outline" onClick={resetTitleForm} className="border-2 border-black shadow-neo">Cancel Edit</Button>
                    ) : null}
                </div>
                <div className="overflow-x-auto rounded-lg border-2 border-black bg-white">
                    <table className="min-w-full text-sm">
                        <thead className="bg-slate-900 text-left text-white">
                            <tr>
                                <th className="px-4 py-3 font-black uppercase">Rank</th>
                                <th className="px-4 py-3 font-black uppercase">Title</th>
                                <th className="px-4 py-3 font-black uppercase">Theme</th>
                                <th className="px-4 py-3 font-black uppercase">Winner</th>
                                <th className="px-4 py-3 font-black uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {titlesLoading ? (
                                <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-500">Loading title winners...</td></tr>
                            ) : titleRows.length === 0 ? (
                                <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-500">No title winners added yet.</td></tr>
                            ) : titleRows.map((row) => (
                                <tr key={row.id} className="border-t border-black/10">
                                    <td className="px-4 py-3 font-bold">#{row.precedence_rank}</td>
                                    <td className="px-4 py-3">{row.title_name}</td>
                                    <td className="px-4 py-3">{row.theme_key || 'auto'}</td>
                                    <td className="px-4 py-3">{row?.winner?.display_name} ({row?.winner?.rollno_or_code || '-'})</td>
                                    <td className="px-4 py-3">
                                        <div className="flex gap-2">
                                            <Button variant="outline" className="border-2 border-black shadow-neo" onClick={() => editTitle(row)}>Edit</Button>
                                            <Button variant="outline" className="border-2 border-black shadow-neo" onClick={() => removeTitle(row.id)}>
                                                <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
                                            </Button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="neo-card space-y-4">
                <div>
                    <h2 className="font-heading text-xl font-black">Finalists</h2>
                    <p className="mt-1 text-sm text-slate-600">Shared active finalist pool for nominees and winner media fallback.</p>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                    <EntityAutocompleteInput
                        value={finalistEntityQuery}
                        onChange={(nextValue) => {
                            setFinalistEntityQuery(nextValue);
                            setFinalistEntityKey('');
                        }}
                        options={activeEntityOptions}
                        selectedOption={selectedFinalistEntity}
                        onSelect={(option) => {
                            setFinalistEntityKey(option.key);
                            setFinalistEntityQuery(option.label);
                        }}
                        placeholder="Search active participant/team"
                        loading={participantsLoading}
                    />
                    <input
                        value={finalistPhotoUrl}
                        onChange={(event) => setFinalistPhotoUrl(event.target.value)}
                        placeholder="Photo URL (optional)"
                        className="rounded-md border-2 border-black px-3 py-2 text-sm"
                    />
                    <input
                        value={finalistVideoUrl}
                        onChange={(event) => setFinalistVideoUrl(event.target.value)}
                        placeholder="Video URL (optional)"
                        className="rounded-md border-2 border-black px-3 py-2 text-sm"
                    />
                    <div className="grid gap-2 sm:grid-cols-2">
                        <label className="inline-flex cursor-pointer items-center justify-center rounded-md border-2 border-black bg-white px-3 py-2 text-xs font-bold">
                            <UploadCloud className="mr-2 h-4 w-4" /> Upload Photo
                            <input
                                type="file"
                                accept="image/png,image/jpeg,image/jpg,image/webp"
                                className="sr-only"
                                onChange={(event) => {
                                    const file = event.target.files?.[0] || null;
                                    event.target.value = '';
                                    if (!file) return;
                                    if (file.size > MAX_IMAGE_SIZE_BYTES) {
                                        toast.error('Photo must be 10 MB or smaller');
                                        return;
                                    }
                                    setFinalistPhotoFile(file);
                                }}
                            />
                        </label>
                        <label className="inline-flex cursor-pointer items-center justify-center rounded-md border-2 border-black bg-white px-3 py-2 text-xs font-bold">
                            <Video className="mr-2 h-4 w-4" /> Upload Video
                            <input
                                type="file"
                                accept="video/mp4,video/webm,video/quicktime"
                                className="sr-only"
                                onChange={(event) => {
                                    const file = event.target.files?.[0] || null;
                                    event.target.value = '';
                                    if (!file) return;
                                    if (file.size > MAX_VIDEO_SIZE_BYTES) {
                                        toast.error('Video must be 40 MB or smaller');
                                        return;
                                    }
                                    setFinalistVideoFile(file);
                                }}
                            />
                        </label>
                    </div>
                    <Textarea
                        value={finalistContentText}
                        onChange={(event) => setFinalistContentText(event.target.value)}
                        rows={4}
                        placeholder='Content JSON (optional), e.g. {"quote":"Finalist note"}'
                        className="border-2 border-black bg-white text-sm shadow-none focus-visible:ring-2 focus-visible:ring-black md:col-span-2"
                    />
                </div>
                {(finalistPhotoFile || finalistVideoFile) ? (
                    <p className="text-xs font-bold text-slate-600">
                        {finalistPhotoFile ? `Photo: ${finalistPhotoFile.name}. ` : ''}
                        {finalistVideoFile ? `Video: ${finalistVideoFile.name}` : ''}
                    </p>
                ) : null}
                <div className="flex gap-2">
                    <Button onClick={saveFinalist} disabled={finalistSaving} className="border-2 border-black bg-primary text-white shadow-neo">
                        {finalistSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        {editingFinalistId ? 'Update Finalist' : 'Add Finalist'}
                    </Button>
                    {editingFinalistId ? (
                        <Button variant="outline" onClick={resetFinalistForm} className="border-2 border-black shadow-neo">Cancel Edit</Button>
                    ) : null}
                </div>
                <div className="overflow-x-auto rounded-lg border-2 border-black bg-white">
                    <table className="min-w-full text-sm">
                        <thead className="bg-slate-900 text-left text-white">
                            <tr>
                                <th className="px-4 py-3 font-black uppercase">Entity</th>
                                <th className="px-4 py-3 font-black uppercase">Photo</th>
                                <th className="px-4 py-3 font-black uppercase">Video</th>
                                <th className="px-4 py-3 font-black uppercase">Content</th>
                                <th className="px-4 py-3 font-black uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {finalistsLoading ? (
                                <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-500">Loading finalists...</td></tr>
                            ) : finalistRows.length === 0 ? (
                                <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-500">No finalists added yet.</td></tr>
                            ) : finalistRows.map((row) => (
                                <tr key={row.id} className="border-t border-black/10">
                                    <td className="px-4 py-3">{row?.finalist?.display_name} ({row?.finalist?.rollno_or_code || '-'})</td>
                                    <td className="px-4 py-3">
                                        {row?.finalist?.resolved_photo_url
                                            ? <a href={row.finalist.resolved_photo_url} target="_blank" rel="noreferrer" className="underline text-primary">View</a>
                                            : <span className="text-slate-500">—</span>}
                                    </td>
                                    <td className="px-4 py-3">
                                        {row?.finalist?.resolved_video_url
                                            ? <a href={row.finalist.resolved_video_url} target="_blank" rel="noreferrer" className="underline text-primary">View</a>
                                            : <span className="text-slate-500">—</span>}
                                    </td>
                                    <td className="px-4 py-3">
                                        {row?.finalist?.content ? (
                                            <pre className="max-w-[18rem] overflow-x-auto whitespace-pre-wrap text-xs text-slate-700">{JSON.stringify(row.finalist.content)}</pre>
                                        ) : <span className="text-slate-500">—</span>}
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex gap-2">
                                            <Button variant="outline" className="border-2 border-black shadow-neo" onClick={() => editFinalist(row)}>Edit</Button>
                                            <Button variant="outline" className="border-2 border-black shadow-neo" onClick={() => removeFinalist(row.id)}>
                                                <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
                                            </Button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="neo-card space-y-4">
                <div>
                    <h2 className="font-heading text-xl font-black">Result Highlights</h2>
                    <p className="mt-1 text-sm text-slate-600">Curated insight cards shown on the public results page. Choose any participant from the event roster, add emoji, tag, quantity, description, and optional JSON content.</p>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                    <input
                        value={highlightEmoji}
                        onChange={(event) => setHighlightEmoji(event.target.value)}
                        placeholder="Emoji"
                        className="rounded-md border-2 border-black px-3 py-2 text-sm"
                    />
                    <input
                        value={highlightTag}
                        onChange={(event) => setHighlightTag(event.target.value)}
                        placeholder="Tag"
                        className="rounded-md border-2 border-black px-3 py-2 text-sm"
                    />
                    <input
                        value={highlightTitle}
                        onChange={(event) => setHighlightTitle(event.target.value)}
                        placeholder="Highlight title"
                        className="rounded-md border-2 border-black px-3 py-2 text-sm"
                    />
                    <input
                        value={highlightQuantity}
                        onChange={(event) => setHighlightQuantity(event.target.value)}
                        placeholder="Quantity / stat"
                        className="rounded-md border-2 border-black px-3 py-2 text-sm"
                    />
                    <EntityAutocompleteInput
                        value={highlightEntityQuery}
                        onChange={(nextValue) => {
                            setHighlightEntityQuery(nextValue);
                            setHighlightEntityKey('');
                        }}
                        options={entityOptions}
                        selectedOption={selectedHighlightEntity}
                        onSelect={(option) => {
                            setHighlightEntityKey(option.key);
                            setHighlightEntityQuery(option.label);
                        }}
                        placeholder="Search participant/team from full roster"
                        loading={participantsLoading}
                    />
                    <div className="rounded-md border-2 border-dashed border-black px-3 py-2 text-xs font-bold uppercase tracking-[0.08em] text-slate-500">
                        Sort order is assigned automatically. Reorder after create using the arrows in the list.
                    </div>
                    <Textarea
                        value={highlightDescription}
                        onChange={(event) => setHighlightDescription(event.target.value)}
                        rows={4}
                        placeholder="Description"
                        className="border-2 border-black bg-white text-sm shadow-none focus-visible:ring-2 focus-visible:ring-black md:col-span-2"
                    />
                    <Textarea
                        value={highlightContentText}
                        onChange={(event) => setHighlightContentText(event.target.value)}
                        rows={4}
                        placeholder='Content JSON (optional), e.g. {"palette":"gold"}'
                        className="border-2 border-black bg-white text-sm shadow-none focus-visible:ring-2 focus-visible:ring-black md:col-span-2"
                    />
                </div>
                <div className="flex gap-2">
                    <Button onClick={saveHighlight} disabled={highlightSaving} className="border-2 border-black bg-primary text-white shadow-neo">
                        {highlightSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        {editingHighlightId ? 'Update Highlight' : 'Add Highlight'}
                    </Button>
                    {editingHighlightId ? (
                        <Button variant="outline" onClick={resetHighlightForm} className="border-2 border-black shadow-neo">Cancel Edit</Button>
                    ) : null}
                </div>
                <div className="overflow-x-auto rounded-lg border-2 border-black bg-white">
                    <table className="min-w-full text-sm">
                        <thead className="bg-slate-900 text-left text-white">
                            <tr>
                                <th className="px-4 py-3 font-black uppercase">Order</th>
                                <th className="px-4 py-3 font-black uppercase">Tag</th>
                                <th className="px-4 py-3 font-black uppercase">Title</th>
                                <th className="px-4 py-3 font-black uppercase">Participant</th>
                                <th className="px-4 py-3 font-black uppercase">Quantity</th>
                                <th className="px-4 py-3 font-black uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {highlightsLoading ? (
                                <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-500">Loading highlights...</td></tr>
                            ) : highlightRows.length === 0 ? (
                                <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-500">No highlights added yet.</td></tr>
                            ) : highlightRows.map((row) => (
                                <tr key={row.id} className="border-t border-black/10">
                                    <td className="px-4 py-3 font-bold">#{row.sort_order}</td>
                                    <td className="px-4 py-3">{row.emoji ? `${row.emoji} ` : ''}{row.tag || '—'}</td>
                                    <td className="px-4 py-3">
                                        <div className="font-semibold">{row.title}</div>
                                        {row.description ? <div className="mt-1 text-xs text-slate-500">{row.description}</div> : null}
                                    </td>
                                    <td className="px-4 py-3">{row?.participant ? `${row.participant.display_name} (${row.participant.rollno_or_code || '-'})` : '—'}</td>
                                    <td className="px-4 py-3">{row.quantity || '—'}</td>
                                    <td className="px-4 py-3">
                                        <div className="flex gap-2">
                                            <div className="flex flex-col gap-1">
                                                <Button
                                                    variant="outline"
                                                    className="border-2 border-black shadow-neo px-2"
                                                    onClick={() => moveHighlight(index, -1)}
                                                    disabled={index === 0}
                                                >
                                                    <ChevronUp className="h-3.5 w-3.5" />
                                                </Button>
                                                <Button
                                                    variant="outline"
                                                    className="border-2 border-black shadow-neo px-2"
                                                    onClick={() => moveHighlight(index, 1)}
                                                    disabled={index === highlightRows.length - 1}
                                                >
                                                    <ChevronDown className="h-3.5 w-3.5" />
                                                </Button>
                                            </div>
                                            <Button variant="outline" className="border-2 border-black shadow-neo" onClick={() => editHighlight(row)}>Edit</Button>
                                            <Button variant="outline" className="border-2 border-black shadow-neo" onClick={() => removeHighlight(row.id)}>
                                                <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
                                            </Button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="neo-card space-y-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <h2 className="font-heading text-xl font-black">Round Results Publish</h2>
                        <p className="mt-1 text-sm text-slate-600">
                            Completed, reveal, or frozen rounds can publish snapshots. Final event reveal stays blocked until all publishable rounds are live.
                        </p>
                    </div>
                    <div className="rounded-lg border-2 border-black bg-[#fffdf7] px-3 py-2 text-xs font-bold uppercase tracking-[0.08em] text-slate-700">
                        {publishableRounds.length - unpublishedPublishableRounds.length}/{publishableRounds.length} publishable rounds live
                    </div>
                </div>
                <div className="flex justify-end">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={handleRefreshAllSnapshots}
                        disabled={refreshingSnapshots || roundsLoading}
                        className="border-2 border-black shadow-neo"
                    >
                        {refreshingSnapshots ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
                        Refresh Published Snapshots
                    </Button>
                </div>
                <div className="overflow-x-auto rounded-lg border-2 border-black bg-white">
                    <table className="min-w-full text-sm">
                        <thead className="bg-slate-900 text-left text-white">
                            <tr>
                                <th className="px-4 py-3 font-black uppercase tracking-[0.08em]">Round</th>
                                <th className="px-4 py-3 font-black uppercase tracking-[0.08em]">State</th>
                                <th className="px-4 py-3 font-black uppercase tracking-[0.08em]">Counts</th>
                                <th className="px-4 py-3 font-black uppercase tracking-[0.08em]">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {roundsLoading ? (
                                <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-500">Loading round publish table...</td></tr>
                            ) : roundRows.length === 0 ? (
                                <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-500">No rounds configured yet.</td></tr>
                            ) : roundRows.map((row) => {
                                const busy = activeRoundActionId === row.round_id;
                                return (
                                    <tr key={row.round_id} className="border-t border-black/10 align-top">
                                        <td className="px-4 py-4">
                                            <div className="font-black">Round {row.round_no}</div>
                                            <div className="mt-1 font-semibold text-slate-800">{row.name}</div>
                                            <div className="mt-2 inline-flex rounded-full border border-black/10 bg-slate-100 px-2 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-600">
                                                {row.results_published ? 'Published' : row.publishable ? 'Ready to Publish' : 'Locked'}
                                            </div>
                                        </td>
                                        <td className="px-4 py-4">
                                            <div className="rounded-full border border-black/10 bg-[#fff7d6] px-3 py-1 text-[11px] font-black uppercase tracking-[0.08em] text-slate-800 w-fit">
                                                {row.state}
                                            </div>
                                        </td>
                                        <td className="px-4 py-4">
                                            <div className="text-slate-700">Scores: <strong>{row.score_rows_count}</strong></div>
                                            <div className="text-slate-700">Present: <strong>{row.present_count}</strong> / {row.total_count}</div>
                                        </td>
                                        <td className="px-4 py-4">
                                            <div className="flex flex-col gap-2 sm:flex-row">
                                                <Button
                                                    type="button"
                                                    onClick={() => handleRoundPublishState(row.round_id, true, 'Round snapshot published')}
                                                    disabled={!row.publishable || row.results_published || busy || refreshingSnapshots}
                                                    className="border-2 border-black bg-[#fde047] text-black shadow-neo"
                                                >
                                                    {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Eye className="mr-2 h-4 w-4" />}
                                                    {row.results_published ? 'Published' : 'Publish'}
                                                </Button>
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    onClick={() => handleRoundPublishState(row.round_id, false, 'Round snapshot unpublished')}
                                                    disabled={!row.results_published || busy || refreshingSnapshots}
                                                    className="border-2 border-black shadow-neo"
                                                >
                                                    <EyeOff className="mr-2 h-4 w-4" />
                                                    Unpublish
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
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
                                ? 'This makes the public results page officially live.'
                                : 'This keeps the public URL open but returns the page to holding mode.'}
                        </p>
                        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                            <Button type="button" variant="outline" onClick={() => setPublishConfirmOpen(false)} disabled={saving} className="border-2 border-black shadow-neo">Cancel</Button>
                            <Button
                                type="button"
                                onClick={confirmPublishToggle}
                                disabled={saving}
                                className={`${pendingPublished ? 'bg-yellow-300 text-black' : 'bg-slate-900 text-white'} border-2 border-black shadow-neo`}
                            >
                                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                {modelUploading ? 'Uploading model...' : saving ? 'Saving...' : pendingPublished ? 'Confirm Publish' : 'Confirm Holding'}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={revealConfirmOpen} onOpenChange={setRevealConfirmOpen}>
                <DialogContent className="border-4 border-black bg-white max-w-md w-[calc(100vw-2rem)] sm:w-full">
                    <DialogHeader>
                        <DialogTitle className="font-heading text-xl font-black">
                            {revealWinners ? 'Hide Winners?' : 'Reveal Winners?'}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <p className="text-sm text-slate-700">
                            {revealWinners
                                ? 'Public winners cards will return to locked state. Nominees remain visible.'
                                : 'Public winners cards will unlock immediately. Nominees stay visible.'}
                        </p>
                        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                            <Button type="button" variant="outline" onClick={() => setRevealConfirmOpen(false)} className="border-2 border-black shadow-neo">Cancel</Button>
                            <Button type="button" onClick={handleRevealWinnersSave} className="border-2 border-black bg-cyan-600 text-white shadow-neo">
                                Confirm
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
