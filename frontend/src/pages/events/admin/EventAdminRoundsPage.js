import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import {
    Calendar,
    Plus,
    Edit2,
    Trash2,
    Play,
    Lock,
    ChevronRight,
    X,
    ArrowUp,
    ArrowDown,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import ParsedDescription from '@/components/common/ParsedDescription';
import { generatePosterPdfPreview, uploadPoster } from '@/pages/HomeAdmin/adminApi';
import { compressImageToWebp } from '@/utils/imageCompression';
import { parsePosterAssets, resolvePosterUrl, serializePosterAssets } from '@/utils/posterAssets';

import { useAuth } from '@/context/AuthContext';
import EventAdminShell, { useEventAdminShell } from './EventAdminShell';
import EventRoundStatsCard from './EventRoundStatsCard';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const createCriterion = (name = '', maxMarks = 0) => ({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    max_marks: maxMarks,
});

const normalizeState = (state) => String(state || '').trim().toLowerCase();
const isDraftState = (state) => normalizeState(state) === 'draft';
const isPublishedState = (state) => normalizeState(state) === 'published';
const isActiveState = (state) => normalizeState(state) === 'active';
const isCompletedState = (state) => normalizeState(state) === 'completed';
const isRevealState = (state) => normalizeState(state) === 'reveal';

function RoundsContent() {
    const navigate = useNavigate();
    const { getAuthHeader } = useAuth();
    const { eventSlug } = useEventAdminShell();

    const [rounds, setRounds] = useState([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingRound, setEditingRound] = useState(null);
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [roundPoster, setRoundPoster] = useState('');
    const [roundPosterFile, setRoundPosterFile] = useState(null);
    const [roundPosterPreview, setRoundPosterPreview] = useState('');
    const [externalUrl, setExternalUrl] = useState('');
    const [externalUrlName, setExternalUrlName] = useState('Explore Round');
    const [date, setDate] = useState('');
    const [mode, setMode] = useState('Offline');
    const [criteria, setCriteria] = useState([createCriterion('Score', 100)]);
    const [roundStats, setRoundStats] = useState({});
    const [revealRound, setRevealRound] = useState(null);
    const [revealing, setRevealing] = useState(false);
    const [savingRound, setSavingRound] = useState(false);
    const [movingRoundId, setMovingRoundId] = useState(null);

    const getErrorMessage = (error, fallback) => (
        error?.response?.data?.detail || error?.response?.data?.message || fallback
    );

    const clearRoundPosterPreview = useCallback(() => {
        setRoundPosterPreview((prev) => {
            if (String(prev || '').startsWith('blob:')) {
                URL.revokeObjectURL(prev);
            }
            return '';
        });
    }, []);

    const resetPosterPicker = useCallback((nextPosterUrl = '') => {
        clearRoundPosterPreview();
        setRoundPosterFile(null);
        setRoundPoster(String(nextPosterUrl || ''));
    }, [clearRoundPosterPreview]);

    const fetchRounds = useCallback(async () => {
        setLoading(true);
        try {
            const response = await axios.get(`${API}/pda-admin/events/${eventSlug}/rounds`, {
                headers: getAuthHeader(),
            });
            setRounds(response.data || []);
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to load rounds'));
            setRounds([]);
        } finally {
            setLoading(false);
        }
    }, [eventSlug, getAuthHeader]);

    useEffect(() => {
        fetchRounds();
    }, [fetchRounds]);

    const fetchRoundStats = useCallback(async (roundId) => {
        setRoundStats((prev) => ({
            ...prev,
            [roundId]: { loading: true, error: null, stats: null },
        }));
        try {
            const response = await axios.get(`${API}/pda-admin/events/${eventSlug}/rounds/${roundId}/stats`, {
                headers: getAuthHeader(),
            });
            setRoundStats((prev) => ({
                ...prev,
                [roundId]: { loading: false, error: null, stats: response.data || null },
            }));
        } catch (error) {
            setRoundStats((prev) => ({
                ...prev,
                [roundId]: { loading: false, error: 'Failed to load stats', stats: null },
            }));
        }
    }, [eventSlug, getAuthHeader]);

    useEffect(() => {
        const finalizedRounds = rounds.filter((round) => isCompletedState(round.state) || isRevealState(round.state));
        finalizedRounds.forEach((round) => {
            if (!roundStats[round.id]) {
                fetchRoundStats(round.id);
            }
        });
    }, [fetchRoundStats, roundStats, rounds]);

    const resetForm = () => {
        setName('');
        setDescription('');
        resetPosterPicker('');
        setExternalUrl('');
        setExternalUrlName('Explore Round');
        setDate('');
        setMode('Offline');
        setCriteria([createCriterion('Score', 100)]);
        setEditingRound(null);
    };

    const nextRoundNo = useMemo(() => {
        if (!rounds.length) return 1;
        return Math.max(...rounds.map((round) => Number(round.round_no || 0))) + 1;
    }, [rounds]);
    const roundPosterAssets = useMemo(() => parsePosterAssets(roundPoster), [roundPoster]);
    const existingPosterPreview = useMemo(
        () => resolvePosterUrl((roundPosterAssets[0] || {}).url || ''),
        [roundPosterAssets]
    );

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSavingRound(true);
        const cleanedCriteria = criteria
            .map((criterion) => ({
                name: String(criterion.name || '').trim(),
                max_marks: parseFloat(criterion.max_marks) || 0,
            }))
            .filter((criterion) => criterion.name);

        try {
            let uploadedPosterUrl = String(roundPoster || '').trim();
            if (roundPosterFile) {
                const isPdf = String(roundPosterFile.type || '').toLowerCase() === 'application/pdf'
                    || String(roundPosterFile.name || '').toLowerCase().endsWith('.pdf');
                if (isPdf) {
                    const uploadedPdfUrl = await uploadPoster(roundPosterFile, getAuthHeader);
                    const previewRes = await generatePosterPdfPreview(uploadedPdfUrl, getAuthHeader, 20);
                    const previewImageUrls = Array.isArray(previewRes?.preview_image_urls) ? previewRes.preview_image_urls : [];
                    if (!previewImageUrls.length) {
                        throw new Error('Failed to generate preview image from PDF');
                    }
                    uploadedPosterUrl = serializePosterAssets(previewImageUrls.map((url) => ({ url }))) || '';
                } else {
                    const processedPoster = await compressImageToWebp(roundPosterFile);
                    uploadedPosterUrl = await uploadPoster(processedPoster, getAuthHeader);
                }
            }
            const payload = {
                round_no: editingRound ? Number(editingRound.round_no) : Number(nextRoundNo),
                name,
                description,
                round_poster: uploadedPosterUrl || null,
                external_url: externalUrl || null,
                external_url_name: String(externalUrlName || '').trim() || 'Explore Round',
                date: date ? new Date(date).toISOString() : null,
                mode,
                evaluation_criteria: cleanedCriteria.length > 0 ? cleanedCriteria : [{ name: 'Score', max_marks: 100 }],
            };
            if (editingRound) {
                await axios.put(`${API}/pda-admin/events/${eventSlug}/rounds/${editingRound.id}`, payload, {
                    headers: getAuthHeader(),
                });
                toast.success('Round updated');
            } else {
                await axios.post(`${API}/pda-admin/events/${eventSlug}/rounds`, payload, {
                    headers: getAuthHeader(),
                });
                toast.success('Round created');
            }
            setDialogOpen(false);
            resetForm();
            fetchRounds();
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to save round'));
        } finally {
            setSavingRound(false);
        }
    };

    const handleEdit = (round) => {
        setEditingRound(round);
        setName(round.name || '');
        setDescription(round.description || '');
        resetPosterPicker(round.round_poster || '');
        setExternalUrl(round.external_url || round.whatsapp_url || '');
        setExternalUrlName(round.external_url_name || 'Explore Round');
        setDate(round.date ? new Date(round.date).toISOString().split('T')[0] : '');
        setMode(round.mode || 'Offline');
        setCriteria((round.evaluation_criteria && round.evaluation_criteria.length > 0)
            ? round.evaluation_criteria.map((criterion) => createCriterion(criterion.name || '', criterion.max_marks || 0))
            : [createCriterion('Score', 100)]);
        setDialogOpen(true);
    };

    const handlePosterSelect = (file) => {
        if (!file) return;
        clearRoundPosterPreview();
        setRoundPosterFile(file);
        const isPdf = String(file.type || '').toLowerCase() === 'application/pdf'
            || String(file.name || '').toLowerCase().endsWith('.pdf');
        if (!isPdf) {
            const preview = URL.createObjectURL(file);
            setRoundPosterPreview(preview);
        }
    };

    const handleDelete = async (roundId) => {
        try {
            await axios.delete(`${API}/pda-admin/events/${eventSlug}/rounds/${roundId}`, {
                headers: getAuthHeader(),
            });
            toast.success('Round deleted');
            fetchRounds();
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to delete round'));
        }
    };

    const handleStateChange = async (roundId, newState) => {
        try {
            await axios.put(`${API}/pda-admin/events/${eventSlug}/rounds/${roundId}`, {
                state: newState,
            }, { headers: getAuthHeader() });
            toast.success(`State changed to ${newState}`);
            fetchRounds();
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to update state'));
        }
    };

    const confirmReveal = async () => {
        if (!revealRound) return;
        setRevealing(true);
        try {
            await axios.put(`${API}/pda-admin/events/${eventSlug}/rounds/${revealRound.id}`, {
                state: 'Reveal',
            }, { headers: getAuthHeader() });
            toast.success(`Round ${revealRound.round_no} revealed`);
            setRevealRound(null);
            fetchRounds();
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to reveal round'));
        } finally {
            setRevealing(false);
        }
    };

    const getBadgeColor = (state) => {
        if (isDraftState(state)) return 'bg-gray-100 text-gray-800';
        if (isPublishedState(state)) return 'bg-blue-100 text-blue-800';
        if (isActiveState(state)) return 'bg-green-100 text-green-800';
        if (isRevealState(state)) return 'bg-amber-100 text-amber-800';
        return 'bg-purple-100 text-purple-800';
    };

    const sortedRounds = useMemo(
        () => [...rounds].sort((a, b) => Number(a.round_no || 0) - Number(b.round_no || 0)),
        [rounds]
    );

    const moveRound = async (roundId, direction) => {
        const current = sortedRounds;
        const fromIndex = current.findIndex((round) => round.id === roundId);
        if (fromIndex < 0) return;
        const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1;
        if (toIndex < 0 || toIndex >= current.length) return;
        const targetRound = current[toIndex];
        if (!targetRound) return;
        setMovingRoundId(roundId);
        try {
            await axios.put(`${API}/pda-admin/events/${eventSlug}/rounds/${roundId}`, {
                round_no: Number(targetRound.round_no),
            }, { headers: getAuthHeader() });
            toast.success('Round order updated');
            fetchRounds();
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to update round order'));
        } finally {
            setMovingRoundId(null);
        }
    };

    return (
        <>
            <div className="flex justify-between items-center mb-8">
                <h1 className="font-heading font-bold text-3xl">Round Management</h1>
                <Dialog
                    open={dialogOpen}
                    onOpenChange={(open) => {
                        setDialogOpen(open);
                        if (!open) resetForm();
                    }}
                >
                    <DialogTrigger asChild>
                        <Button className="bg-primary text-white border-2 border-black shadow-neo">
                            <Plus className="w-5 h-5 mr-2" />
                            Create Round
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="w-[calc(100vw-1rem)] max-w-3xl max-h-[calc(100vh-2rem)] overflow-x-hidden overflow-y-auto border-4 border-black p-4 sm:p-6">
                        <DialogHeader>
                            <DialogTitle className="font-heading font-bold text-2xl">{editingRound ? 'Edit Round' : 'Create Round'}</DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <Label className="font-bold">Round No</Label>
                                <Input value={editingRound ? editingRound.round_no : nextRoundNo} className="neo-input" disabled />
                            </div>
                            <div>
                                <Label className="font-bold">Name *</Label>
                                <Input value={name} onChange={(e) => setName(e.target.value)} required className="neo-input" />
                            </div>
                            <div>
                                <Label className="font-bold">Description</Label>
                                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} className="neo-input" />
                            </div>
                            <div>
                                <Label className="font-bold">Round Poster</Label>
                                <Input
                                    type="file"
                                    accept="image/png,image/jpeg,image/webp,application/pdf,.pdf"
                                    className="neo-input"
                                    onChange={(e) => {
                                        handlePosterSelect((e.target.files || [])[0] || null);
                                        e.target.value = '';
                                    }}
                                />
                                {(roundPosterFile && (String(roundPosterFile.type || '').toLowerCase() === 'application/pdf'
                                    || String(roundPosterFile.name || '').toLowerCase().endsWith('.pdf'))) ? (
                                    <div className="mt-3 rounded-md border-2 border-black bg-muted p-3 text-sm">
                                        <p className="font-semibold">{roundPosterFile.name}</p>
                                        <p className="text-gray-600">PDF selected. First page preview image will be generated on upload.</p>
                                        <div className="mt-2 flex gap-2">
                                            <Button
                                                type="button"
                                                variant="outline"
                                                className="border-2 border-black"
                                                onClick={() => resetPosterPicker('')}
                                            >
                                                Remove File
                                            </Button>
                                        </div>
                                    </div>
                                ) : null}
                                {(roundPosterPreview || existingPosterPreview) ? (
                                    <div className="mt-3 rounded-md border-2 border-black bg-muted p-2">
                                        <img
                                            src={roundPosterPreview || existingPosterPreview}
                                            alt="Round poster preview"
                                            className="w-full max-h-56 object-contain rounded border border-black/10 bg-white"
                                        />
                                        <div className="mt-2 flex gap-2">
                                            <Button
                                                type="button"
                                                variant="outline"
                                                className="border-2 border-black"
                                                onClick={() => resetPosterPicker('')}
                                            >
                                                Remove Poster
                                            </Button>
                                        </div>
                                    </div>
                                ) : null}
                            </div>
                            <div>
                                <Label className="font-bold">External URL</Label>
                                <Input value={externalUrl} onChange={(e) => setExternalUrl(e.target.value)} placeholder="https://..." className="neo-input" />
                            </div>
                            <div>
                                <Label className="font-bold">External URL Name</Label>
                                <Input value={externalUrlName} onChange={(e) => setExternalUrlName(e.target.value)} placeholder="Explore Round" className="neo-input" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <Label className="font-bold">Date</Label>
                                    <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="neo-input" />
                                </div>
                                <div>
                                    <Label className="font-bold">Mode</Label>
                                    <Select value={mode} onValueChange={setMode}>
                                        <SelectTrigger className="neo-input"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="Online">Online</SelectItem>
                                            <SelectItem value="Offline">Offline</SelectItem>
                                            <SelectItem value="Hybrid">Hybrid</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <Label className="font-bold">Evaluation Criteria</Label>
                                    <Button type="button" variant="outline" className="border-2 border-black" onClick={() => setCriteria((prev) => [...prev, createCriterion('', 0)])}>
                                        <Plus className="w-4 h-4 mr-2" /> Add
                                    </Button>
                                </div>
                                <div className="space-y-2">
                                    {criteria.map((criterion) => (
                                        <div key={criterion.id} className="grid grid-cols-[1fr_120px_auto] gap-2 items-center">
                                            <Input
                                                value={criterion.name}
                                                onChange={(e) => setCriteria((prev) => prev.map((item) => item.id === criterion.id ? { ...item, name: e.target.value } : item))}
                                                placeholder="Criteria name"
                                                className="neo-input"
                                            />
                                            <Input
                                                type="number"
                                                value={criterion.max_marks}
                                                onChange={(e) => setCriteria((prev) => prev.map((item) => item.id === criterion.id ? { ...item, max_marks: e.target.value } : item))}
                                                placeholder="Max marks"
                                                className="neo-input"
                                            />
                                            <Button
                                                type="button"
                                                variant="outline"
                                                className="border-2 border-black"
                                                onClick={() => setCriteria((prev) => (prev.length > 1 ? prev.filter((item) => item.id !== criterion.id) : prev))}
                                                disabled={criteria.length === 1}
                                            >
                                                <X className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <Button type="submit" disabled={savingRound} className="w-full bg-primary text-white border-2 border-black shadow-neo">
                                {savingRound ? 'Saving...' : (editingRound ? 'Update' : 'Create')}
                            </Button>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>

            {loading ? (
                <div className="neo-card text-center py-12"><div className="loading-spinner mx-auto"></div></div>
            ) : rounds.length === 0 ? (
                <div className="neo-card text-center py-12">
                    <Calendar className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                    <h3 className="font-heading font-bold text-xl">No Rounds Yet</h3>
                </div>
            ) : (
                <div className="grid md:grid-cols-1 lg:grid-cols-2 gap-8">
                    {sortedRounds.map((round, index) => (
                        <div key={round.id} className="neo-card p-6 min-h-[420px]">
                            <div className="flex justify-between mb-4">
                                <span className="bg-primary text-white px-2 py-1 border-2 border-black font-bold text-sm">Round {round.round_no}</span>
                                <span className={`tag border-2 border-black ${getBadgeColor(round.state)}`}>{round.state}</span>
                            </div>
                            {parsePosterAssets(round.round_poster || '').length ? (
                                <img
                                    src={resolvePosterUrl((parsePosterAssets(round.round_poster || '')[0] || {}).url || '')}
                                    alt={`${round.name} poster`}
                                    className="mb-4 w-full h-56 object-cover rounded-md border-2 border-black bg-white"
                                />
                            ) : null}
                            <h3 className="font-heading font-bold text-xl mb-2">{round.name}</h3>
                            <div className="text-gray-700 text-sm mb-4 space-y-2">
                                <ParsedDescription
                                    description={round.description || ''}
                                    emptyText="No description"
                                    listClassName="list-disc space-y-1 pl-5"
                                />
                            </div>
                            <p className="text-sm text-gray-500 mb-4">Mode: {round.mode} | Date: {round.date ? new Date(round.date).toLocaleDateString() : 'TBA'}</p>
                            {round.is_frozen ? (
                                <p className="text-primary font-bold mb-4"><Lock className="w-4 h-4 inline" /> Frozen</p>
                            ) : null}

                            {(isCompletedState(round.state) || isRevealState(round.state)) ? <EventRoundStatsCard statsState={roundStats[round.id]} /> : null}

                            <div className="flex flex-wrap gap-2">
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="border-2 border-black"
                                    onClick={() => moveRound(round.id, 'up')}
                                    disabled={index === 0 || movingRoundId === round.id}
                                    title="Move up"
                                >
                                    <ArrowUp className="w-4 h-4" />
                                </Button>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="border-2 border-black"
                                    onClick={() => moveRound(round.id, 'down')}
                                    disabled={index === sortedRounds.length - 1 || movingRoundId === round.id}
                                    title="Move down"
                                >
                                    <ArrowDown className="w-4 h-4" />
                                </Button>
                                {!round.is_frozen ? (
                                    <>
                                        <Button size="sm" variant="outline" onClick={() => handleEdit(round)} className="border-2 border-black">
                                            <Edit2 className="w-4 h-4" />
                                        </Button>
                                        {isDraftState(round.state) ? (
                                            <Button size="sm" variant="outline" onClick={() => handleDelete(round.id)} className="border-2 border-black text-red-500">
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        ) : null}
                                    </>
                                ) : null}

                                {isDraftState(round.state) ? (
                                    <Button size="sm" onClick={() => handleStateChange(round.id, 'Published')} className="bg-blue-500 text-white border-2 border-black">Publish</Button>
                                ) : null}
                                {isPublishedState(round.state) ? (
                                    <>
                                        <Button size="sm" onClick={() => handleStateChange(round.id, 'Active')} className="bg-green-500 text-white border-2 border-black">
                                            <Play className="w-4 h-4 mr-1" /> Activate
                                        </Button>
                                        <Button size="sm" variant="outline" onClick={() => handleStateChange(round.id, 'Draft')} className="border-2 border-black">
                                            Unpublish
                                        </Button>
                                    </>
                                ) : null}
                                {(isActiveState(round.state) || isCompletedState(round.state) || isRevealState(round.state)) ? (
                                    <Link to={`/admin/events/${eventSlug}/rounds/${round.id}/scoring`}>
                                        <Button size="sm" className="bg-primary text-white border-2 border-black">
                                            <ChevronRight className="w-4 h-4" /> Scores
                                        </Button>
                                    </Link>
                                ) : null}
                                {(isCompletedState(round.state) || isRevealState(round.state)) ? (
                                    <Button
                                        size="sm"
                                        onClick={() => {
                                            if (isRevealState(round.state)) {
                                                handleStateChange(round.id, 'Completed');
                                                return;
                                            }
                                            setRevealRound(round);
                                        }}
                                        className={`border-2 border-black text-white ${isRevealState(round.state) ? 'bg-slate-700' : 'bg-amber-500'}`}
                                    >
                                        {isRevealState(round.state) ? 'Unreveal' : 'Reveal'}
                                    </Button>
                                ) : null}
                            </div>
                        </div>
                    ))}
                </div>
            )}
            <Dialog
                open={Boolean(revealRound)}
                onOpenChange={(open) => {
                    if (!open && !revealing) setRevealRound(null);
                }}
            >
                <DialogContent className="w-[calc(100vw-1rem)] max-w-md max-h-[calc(100vh-2rem)] overflow-x-hidden overflow-y-auto border-4 border-black p-4 sm:p-6">
                    <DialogHeader>
                        <DialogTitle className="font-heading font-bold text-xl">Reveal Round Results</DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-slate-700">
                        Reveal will make participant statuses visible for Round {revealRound?.round_no}.
                    </p>
                    <div className="mt-2 flex gap-2">
                        <Button
                            variant="outline"
                            className="flex-1 border-2 border-black"
                            onClick={() => setRevealRound(null)}
                            disabled={revealing}
                        >
                            Cancel
                        </Button>
                        <Button
                            className="flex-1 border-2 border-black bg-amber-500 text-white"
                            onClick={confirmReveal}
                            disabled={revealing}
                        >
                            {revealing ? 'Revealing...' : 'Confirm Reveal'}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}

export default function EventAdminRoundsPage() {
    return (
        <EventAdminShell activeTab="rounds">
            <RoundsContent />
        </EventAdminShell>
    );
}
