import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import {
    Save,
    Lock,
    ArrowLeft,
    Search,
    AlertTriangle,
    Upload,
    Download,
    FileSpreadsheet,
    Users,
    Edit2,
    Plus,
    X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

import { useAuth } from '@/context/AuthContext';
import EventAdminShell, { useEventAdminShell } from './EventAdminShell';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const SCORING_PAGE_SIZE_KEY = 'event_admin_scoring_page_size';
const SCORING_PAGE_SIZE_OPTIONS = [10, 20, 50];

const loadPageSize = (storageKey, fallback, allowedValues) => {
    if (typeof window === 'undefined') return fallback;
    const raw = window.localStorage.getItem(storageKey);
    const parsed = Number.parseInt(raw || '', 10);
    return allowedValues.includes(parsed) ? parsed : fallback;
};

const createCriterionDraft = (name = '', maxMarks = 0) => ({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    max_marks: maxMarks,
});

function ScoringContent() {
    const navigate = useNavigate();
    const { roundId } = useParams();
    const { getAuthHeader } = useAuth();
    const { eventSlug, eventInfo } = useEventAdminShell();

    const [round, setRound] = useState(null);
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [importing, setImporting] = useState(false);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [presenceFilter, setPresenceFilter] = useState('all');
    const [sortBy, setSortBy] = useState('register_asc');
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(() => loadPageSize(SCORING_PAGE_SIZE_KEY, 10, SCORING_PAGE_SIZE_OPTIONS));
    const [freezeDialogOpen, setFreezeDialogOpen] = useState(false);
    const [criteriaDialogOpen, setCriteriaDialogOpen] = useState(false);
    const [criteriaDraft, setCriteriaDraft] = useState([]);
    const [savingCriteria, setSavingCriteria] = useState(false);
    const [importPreviewOpen, setImportPreviewOpen] = useState(false);
    const [importPreview, setImportPreview] = useState(null);
    const [pendingImportFile, setPendingImportFile] = useState(null);
    const [confirmingImport, setConfirmingImport] = useState(false);
    const fileInputRef = useRef(null);

    const getErrorMessage = (error, fallback) => (
        error?.response?.data?.detail || error?.response?.data?.message || fallback
    );

    const entityMode = eventInfo?.participant_mode === 'team' ? 'team' : 'user';

    const normalizeRow = useCallback((row) => {
        const entityId = row.entity_id ?? row.participant_id ?? row.id;
        return {
            ...row,
            _entityType: row.entity_type || entityMode,
            _entityId: entityId,
            _name: row.participant_name || row.name,
            _code: row.participant_register_number || row.regno_or_code || row.register_number,
            _status: row.participant_status || row.status,
        };
    }, [entityMode]);

    const fetchRoundData = useCallback(async () => {
        setLoading(true);
        try {
            const [roundRes, rowsRes] = await Promise.all([
                axios.get(`${API}/pda-admin/events/${eventSlug}/rounds`, { headers: getAuthHeader() }),
                axios.get(`${API}/pda-admin/events/${eventSlug}/rounds/${roundId}/participants`, {
                    headers: getAuthHeader(),
                }),
            ]);

            const currentRound = (roundRes.data || []).find((item) => Number(item.id) === Number(roundId));
            setRound(currentRound || null);
            setRows((rowsRes.data || []).map(normalizeRow));
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to load scoring data'));
            setRound(null);
            setRows([]);
        } finally {
            setLoading(false);
        }
    }, [eventSlug, getAuthHeader, normalizeRow, roundId]);

    useEffect(() => {
        fetchRoundData();
    }, [fetchRoundData]);

    const criteria = useMemo(() => round?.evaluation_criteria || [{ name: 'Score', max_marks: 100 }], [round?.evaluation_criteria]);
    const isRoundActive = String(round?.state || '').trim().toLowerCase() === 'active';
    const criteriaDraftMaxTotal = useMemo(
        () => criteriaDraft.reduce((sum, criterion) => {
            const parsed = Number.parseFloat(criterion.max_marks);
            return sum + (Number.isNaN(parsed) ? 0 : parsed);
        }, 0),
        [criteriaDraft]
    );

    const getTotalScore = useCallback((row) => (
        criteria.reduce((sum, criterion) => {
            const parsed = Number.parseFloat(row.criteria_scores?.[criterion.name]);
            return sum + (Number.isNaN(parsed) ? 0 : parsed);
        }, 0)
    ), [criteria]);

    const roundRankMap = useMemo(() => {
        if (!round?.is_frozen) return {};
        const scored = rows
            .filter((row) => row.is_present)
            .slice()
            .sort((a, b) => Number(b.normalized_score || 0) - Number(a.normalized_score || 0));
        const map = {};
        scored.forEach((row, index) => {
            map[row._entityId] = index + 1;
        });
        return map;
    }, [round?.is_frozen, rows]);

    const displayedRows = useMemo(() => {
        const needle = search.trim().toLowerCase();
        const filtered = rows.filter((row) => {
            if (needle) {
                const haystack = [
                    String(row._name || ''),
                    String(row._code || ''),
                    String(row.email || ''),
                    String(row.department || ''),
                ].join(' ').toLowerCase();
                if (!haystack.includes(needle)) return false;
            }
            if (statusFilter !== 'all') {
                if (statusFilter === 'active' && row._status !== 'Active') return false;
                if (statusFilter === 'eliminated' && row._status !== 'Eliminated') return false;
            }
            if (presenceFilter !== 'all') {
                if (presenceFilter === 'present' && !row.is_present) return false;
                if (presenceFilter === 'absent' && row.is_present) return false;
            }
            return true;
        });

        return filtered.sort((a, b) => {
            const regA = String(a._code || '');
            const regB = String(b._code || '');
            const nameA = String(a._name || '');
            const nameB = String(b._name || '');
            const scoreA = getTotalScore(a);
            const scoreB = getTotalScore(b);
            const rankA = Number(roundRankMap[a._entityId] || Number.MAX_SAFE_INTEGER);
            const rankB = Number(roundRankMap[b._entityId] || Number.MAX_SAFE_INTEGER);

            switch (sortBy) {
                case 'register_desc':
                    return regB.localeCompare(regA, undefined, { numeric: true, sensitivity: 'base' });
                case 'name_asc':
                    return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
                case 'name_desc':
                    return nameB.localeCompare(nameA, undefined, { sensitivity: 'base' });
                case 'score_desc':
                    return scoreB - scoreA;
                case 'score_asc':
                    return scoreA - scoreB;
                case 'rank_asc':
                    return rankA - rankB;
                case 'register_asc':
                default:
                    return regA.localeCompare(regB, undefined, { numeric: true, sensitivity: 'base' });
            }
        });
    }, [getTotalScore, presenceFilter, roundRankMap, rows, search, sortBy, statusFilter]);

    const totalRows = displayedRows.length;
    const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
    const pageStart = totalRows ? ((currentPage - 1) * pageSize + 1) : 0;
    const pageEnd = Math.min((currentPage - 1) * pageSize + pageSize, totalRows);
    const pagedRows = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return displayedRows.slice(start, start + pageSize);
    }, [currentPage, displayedRows, pageSize]);

    useEffect(() => {
        setCurrentPage(1);
    }, [search, statusFilter, presenceFilter, sortBy, pageSize]);

    useEffect(() => {
        if (currentPage > totalPages) {
            setCurrentPage(totalPages);
        }
    }, [currentPage, totalPages]);

    const handlePageSizeChange = (value) => {
        const nextSize = Number.parseInt(value, 10);
        if (!SCORING_PAGE_SIZE_OPTIONS.includes(nextSize)) return;
        setPageSize(nextSize);
        setCurrentPage(1);
        if (typeof window !== 'undefined') {
            window.localStorage.setItem(SCORING_PAGE_SIZE_KEY, String(nextSize));
        }
    };

    const handlePresenceChange = (entityId, isPresent) => {
        const present = isPresent === true;
        setRows((prev) => prev.map((row) => {
            if (row._entityId !== entityId) return row;
            if (!present) {
                const zeroed = Object.fromEntries(criteria.map((criterion) => [criterion.name, 0]));
                return { ...row, is_present: false, criteria_scores: zeroed };
            }
            return { ...row, is_present: true };
        }));
    };

    const handleScoreChange = (entityId, criteriaName, value) => {
        if (!/^$|^\d*\.?\d*$/.test(value)) return;
        setRows((prev) => prev.map((row) => {
            if (row._entityId !== entityId) return row;
            return {
                ...row,
                criteria_scores: { ...row.criteria_scores, [criteriaName]: value },
            };
        }));
    };

    const handleScoreBlur = (entityId, criteriaName) => {
        const maxMarks = Number(criteria.find((criterion) => criterion.name === criteriaName)?.max_marks ?? 100);
        setRows((prev) => prev.map((row) => {
            if (row._entityId !== entityId) return row;
            const parsed = Number.parseFloat(row.criteria_scores?.[criteriaName]);
            const clamped = Number.isNaN(parsed) ? 0 : Math.min(Math.max(parsed, 0), maxMarks);
            return {
                ...row,
                criteria_scores: { ...row.criteria_scores, [criteriaName]: clamped },
            };
        }));
    };

    const saveScores = async () => {
        setSaving(true);
        try {
            const maxByCriteria = Object.fromEntries(criteria.map((criterion) => [criterion.name, Number(criterion.max_marks || 0)]));
            const payload = rows.map((row) => ({
                entity_type: row._entityType,
                user_id: row._entityType === 'user' ? row._entityId : null,
                team_id: row._entityType === 'team' ? row._entityId : null,
                criteria_scores: Object.keys(maxByCriteria).reduce((acc, criteriaName) => {
                    const max = maxByCriteria[criteriaName];
                    const parsed = Number.parseFloat(row.criteria_scores?.[criteriaName]);
                    const safe = Number.isNaN(parsed) ? 0 : Math.min(Math.max(parsed, 0), max);
                    acc[criteriaName] = safe;
                    return acc;
                }, {}),
                is_present: Boolean(row.is_present),
            }));

            await axios.post(`${API}/pda-admin/events/${eventSlug}/rounds/${roundId}/scores`, payload, {
                headers: getAuthHeader(),
            });
            toast.success('Scores saved successfully');
            fetchRoundData();
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to save scores'));
        } finally {
            setSaving(false);
        }
    };

    const downloadTemplate = async () => {
        try {
            const response = await axios.get(`${API}/pda-admin/events/${eventSlug}/rounds/${roundId}/score-template`, {
                headers: getAuthHeader(),
                responseType: 'blob',
            });
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `${round?.round_no || 'round'}_score_template.xlsx`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
            toast.success('Template downloaded');
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to download template'));
        }
    };

    const handleFileUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setImporting(true);
        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await axios.post(`${API}/pda-admin/events/${eventSlug}/rounds/${roundId}/import-scores`, formData, {
                headers: { ...getAuthHeader(), 'Content-Type': 'multipart/form-data' },
                params: { preview: true },
            });
            setImportPreview(response.data || null);
            setPendingImportFile(file);
            setImportPreviewOpen(true);
            toast.success('Import preview ready');
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to validate import file'));
        } finally {
            setImporting(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const closeImportPreview = () => {
        if (confirmingImport) return;
        setImportPreviewOpen(false);
        setImportPreview(null);
        setPendingImportFile(null);
    };

    const confirmImportUpdate = async () => {
        if (!pendingImportFile) return;
        setConfirmingImport(true);
        const formData = new FormData();
        formData.append('file', pendingImportFile);
        try {
            const response = await axios.post(`${API}/pda-admin/events/${eventSlug}/rounds/${roundId}/import-scores`, formData, {
                headers: { ...getAuthHeader(), 'Content-Type': 'multipart/form-data' },
            });
            const imported = Number(response.data?.imported || 0);
            const totalRows = Number(response.data?.total_rows || 0);
            const skipped = Math.max(totalRows - imported, 0);
            toast.success(`Imported ${imported} row${imported === 1 ? '' : 's'}`);
            if (skipped > 0) {
                toast.error(`Skipped ${skipped} row${skipped === 1 ? '' : 's'} due to validation issues`);
            }
            if (Array.isArray(response.data?.errors) && response.data.errors.length > 0) {
                response.data.errors.slice(0, 5).forEach((msg) => toast.error(msg));
            }
            setImportPreviewOpen(false);
            setImportPreview(null);
            setPendingImportFile(null);
            fetchRoundData();
        } catch (error) {
            toast.error(getErrorMessage(error, 'Import failed'));
        } finally {
            setConfirmingImport(false);
        }
    };

    const exportRoundEvaluation = async () => {
        try {
            const response = await axios.get(`${API}/pda-admin/events/${eventSlug}/export/round/${roundId}?format=xlsx`, {
                headers: getAuthHeader(),
                responseType: 'blob',
            });
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `${round?.round_no || 'round'}_evaluation.xlsx`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
            toast.success('Round evaluation exported');
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to export round evaluation'));
        }
    };

    const freezeRound = async () => {
        try {
            await axios.post(`${API}/pda-admin/events/${eventSlug}/rounds/${roundId}/freeze`, {}, { headers: getAuthHeader() });
            toast.success('Round frozen');
            setFreezeDialogOpen(false);
            fetchRoundData();
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to freeze round'));
        }
    };

    const unfreezeRound = async () => {
        try {
            await axios.post(`${API}/pda-admin/events/${eventSlug}/rounds/${roundId}/unfreeze`, {}, { headers: getAuthHeader() });
            toast.success('Round unfrozen');
            fetchRoundData();
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to unfreeze round'));
        }
    };

    const openCriteriaEditor = () => {
        const base = (round?.evaluation_criteria && round.evaluation_criteria.length > 0)
            ? round.evaluation_criteria
            : [{ name: 'Score', max_marks: 100 }];
        setCriteriaDraft(base.map((criterion) => createCriterionDraft(criterion.name || '', criterion.max_marks || 0)));
        setCriteriaDialogOpen(true);
    };

    const closeCriteriaEditor = () => {
        if (savingCriteria) return;
        setCriteriaDialogOpen(false);
        setCriteriaDraft([]);
    };

    const saveCriteria = async () => {
        if (savingCriteria) return;
        const normalized = criteriaDraft.map((criterion) => ({
            name: String(criterion.name || '').trim(),
            max_marks: Number.parseFloat(criterion.max_marks),
        }));

        if (!normalized.length) {
            toast.error('Add at least one evaluation criterion');
            return;
        }

        if (normalized.some((criterion) => !criterion.name)) {
            toast.error('Criterion name is required');
            return;
        }

        const names = normalized.map((criterion) => criterion.name.toLowerCase());
        if (new Set(names).size !== names.length) {
            toast.error('Criterion names must be unique');
            return;
        }

        if (normalized.some((criterion) => Number.isNaN(criterion.max_marks) || !Number.isFinite(criterion.max_marks) || criterion.max_marks <= 0)) {
            toast.error('Max marks must be a number greater than 0');
            return;
        }

        setSavingCriteria(true);
        try {
            await axios.put(`${API}/pda-admin/events/${eventSlug}/rounds/${roundId}`, {
                evaluation_criteria: normalized,
            }, { headers: getAuthHeader() });
            toast.success('Evaluation criteria updated');
            setCriteriaDialogOpen(false);
            setCriteriaDraft([]);
            fetchRoundData();
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to update criteria'));
        } finally {
            setSavingCriteria(false);
        }
    };

    const previewData = importPreview && typeof importPreview === 'object' ? importPreview : {};
    const previewIdentifiedRows = Array.isArray(previewData.identified_rows) ? previewData.identified_rows : [];
    const previewMismatchedRows = Array.isArray(previewData.mismatched_rows) ? previewData.mismatched_rows : [];
    const previewUnidentifiedRows = Array.isArray(previewData.unidentified_rows) ? previewData.unidentified_rows : [];
    const previewOtherRequiredRows = Array.isArray(previewData.other_required_rows) ? previewData.other_required_rows : [];
    const previewIdentifiedCount = Number(previewData.identified_count || 0);
    const previewMismatchedCount = Number(previewData.mismatched_count || 0);
    const previewUnidentifiedCount = Number(previewData.unidentified_count || 0);
    const previewOtherRequiredCount = Number(previewData.other_required_count || 0);
    const previewReadyCount = Number(previewData.ready_to_import || 0);

    if (loading) {
        return (
            <div className="neo-card text-center py-12">
                <div className="loading-spinner mx-auto"></div>
                <p className="mt-4">Loading...</p>
            </div>
        );
    }

    if (!round) {
        return (
            <div className="neo-card text-center py-12">
                <AlertTriangle className="w-16 h-16 mx-auto mb-4 text-red-500" />
                <h2 className="font-heading font-bold text-xl mb-4">Round Not Found</h2>
                <Button className="bg-primary text-white border-2 border-black shadow-neo" onClick={() => navigate(`/admin/events/${eventSlug}/rounds`)}>
                    <ArrowLeft className="w-4 h-4 mr-2" /> Back
                </Button>
            </div>
        );
    }

    return (
        <>
            <div className="neo-card mb-6">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div className="flex items-center gap-4">
                        <Link to={`/admin/events/${eventSlug}/rounds`}>
                            <Button variant="outline" className="border-2 border-black">
                                <ArrowLeft className="w-4 h-4" />
                            </Button>
                        </Link>
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="bg-primary text-white px-2 py-1 border-2 border-black font-bold text-sm">Round {round.round_no}</span>
                                {round.is_frozen ? (
                                    <span className="bg-orange-100 text-orange-800 px-2 py-1 border-2 border-orange-500 font-bold text-sm flex items-center gap-1">
                                        <Lock className="w-4 h-4" /> Frozen
                                    </span>
                                ) : null}
                            </div>
                            <h1 className="font-heading font-bold text-2xl mt-2">{round.name}</h1>
                            {!isRoundActive ? (
                                <p className="mt-2 text-xs font-semibold text-slate-600">
                                    Attendance can be edited only when round is Active.
                                </p>
                            ) : null}
                        </div>
                    </div>

                    {!round.is_frozen ? (
                        <div className="flex flex-wrap gap-2">
                            <Button onClick={openCriteriaEditor} variant="outline" className="border-2 border-black shadow-neo">
                                <Edit2 className="w-4 h-4 mr-2" /> Edit Criteria
                            </Button>
                            <Button onClick={downloadTemplate} variant="outline" className="border-2 border-black shadow-neo">
                                <Download className="w-4 h-4 mr-2" /> Template
                            </Button>
                            <input type="file" ref={fileInputRef} accept=".xlsx" onChange={handleFileUpload} className="hidden" />
                            <Button onClick={() => fileInputRef.current?.click()} disabled={importing || confirmingImport} variant="outline" className="border-2 border-black shadow-neo bg-green-50">
                                <Upload className="w-4 h-4 mr-2" /> {importing ? 'Validating...' : 'Import Excel'}
                            </Button>
                            <Button onClick={saveScores} disabled={saving} className="bg-primary text-white border-2 border-black shadow-neo">
                                <Save className="w-4 h-4 mr-2" /> {saving ? 'Saving...' : 'Save'}
                            </Button>
                            <Dialog open={freezeDialogOpen} onOpenChange={setFreezeDialogOpen}>
                                <DialogTrigger asChild>
                                    <Button className="bg-orange-500 text-white border-2 border-black shadow-neo">
                                        <Lock className="w-4 h-4 mr-2" /> Freeze
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="border-4 border-black">
                                    <DialogHeader>
                                        <DialogTitle className="font-heading font-bold text-xl flex items-center gap-2">
                                            <AlertTriangle className="w-6 h-6 text-orange-500" /> Freeze Round
                                        </DialogTitle>
                                    </DialogHeader>
                                    <div className="space-y-4">
                                        <p className="text-gray-600">
                                            This action freezes scores for this round. Shortlisting is handled from the leaderboard.
                                        </p>
                                        <div className="flex gap-2">
                                            <Button onClick={() => setFreezeDialogOpen(false)} variant="outline" className="flex-1 border-2 border-black">Cancel</Button>
                                            <Button onClick={freezeRound} className="flex-1 bg-orange-500 text-white border-2 border-black">
                                                <Lock className="w-4 h-4 mr-2" /> Confirm
                                            </Button>
                                        </div>
                                    </div>
                                </DialogContent>
                            </Dialog>
                        </div>
                    ) : (
                        <div className="flex flex-wrap gap-2">
                            <Button onClick={exportRoundEvaluation} variant="outline" className="border-2 border-black shadow-neo">
                                <Download className="w-4 h-4 mr-2" /> Export Excel
                            </Button>
                            <Button onClick={unfreezeRound} className="bg-orange-500 text-white border-2 border-black shadow-neo">
                                <Lock className="w-4 h-4 mr-2" /> Unfreeze
                            </Button>
                        </div>
                    )}
                </div>
            </div>

            <Dialog
                open={criteriaDialogOpen}
                onOpenChange={(open) => {
                    if (!open) {
                        closeCriteriaEditor();
                    } else {
                        setCriteriaDialogOpen(true);
                    }
                }}
            >
                <DialogContent className="border-4 border-black max-w-3xl">
                    <DialogHeader>
                        <DialogTitle className="font-heading font-bold text-xl">Edit Evaluation Criteria</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <p className="text-sm text-gray-600">
                            Update the scoring criteria and maximum marks for this round. Unsaved score edits in the table may be reset after refresh.
                        </p>
                        <div className="space-y-2">
                            {criteriaDraft.map((criterion) => (
                                <div key={criterion.id} className="grid grid-cols-[1fr_130px_auto] gap-2 items-end">
                                    <div className="space-y-1">
                                        <Label className="text-xs uppercase tracking-wide text-gray-500">Criterion</Label>
                                        <Input
                                            value={criterion.name}
                                            onChange={(e) => setCriteriaDraft((prev) => prev.map((item) => (
                                                item.id === criterion.id ? { ...item, name: e.target.value } : item
                                            )))}
                                            placeholder="Criteria name"
                                            className="neo-input"
                                            disabled={savingCriteria}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-xs uppercase tracking-wide text-gray-500">Max Marks</Label>
                                        <Input
                                            type="number"
                                            value={criterion.max_marks}
                                            onChange={(e) => setCriteriaDraft((prev) => prev.map((item) => (
                                                item.id === criterion.id ? { ...item, max_marks: e.target.value } : item
                                            )))}
                                            min={0}
                                            step="0.01"
                                            placeholder="100"
                                            className="neo-input"
                                            disabled={savingCriteria}
                                        />
                                    </div>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="border-2 border-black"
                                        onClick={() => setCriteriaDraft((prev) => (prev.length > 1 ? prev.filter((item) => item.id !== criterion.id) : prev))}
                                        disabled={savingCriteria || criteriaDraft.length === 1}
                                    >
                                        <X className="w-4 h-4" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                className="border-2 border-black"
                                onClick={() => setCriteriaDraft((prev) => [...prev, createCriterionDraft('', 0)])}
                                disabled={savingCriteria}
                            >
                                <Plus className="w-4 h-4 mr-2" /> Add Criterion
                            </Button>
                            <p className="text-sm font-semibold text-gray-700">Total Max: {criteriaDraftMaxTotal}</p>
                        </div>
                        <div className="flex gap-2">
                            <Button
                                onClick={closeCriteriaEditor}
                                variant="outline"
                                className="flex-1 border-2 border-black"
                                disabled={savingCriteria}
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={saveCriteria}
                                className="flex-1 bg-primary text-white border-2 border-black"
                                disabled={savingCriteria}
                            >
                                {savingCriteria ? 'Updating...' : 'Update Criteria'}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {!round.is_frozen ? (
                <div className="neo-card mb-6 bg-blue-50 border-blue-500">
                    <div className="flex items-start gap-4">
                        <FileSpreadsheet className="w-8 h-8 text-blue-600 flex-shrink-0" />
                        <div>
                            <h3 className="font-heading font-bold text-lg">Bulk Score Import</h3>
                            <p className="text-gray-600 text-sm">1. Download template → 2. Fill code + scores → 3. Upload Excel → 4. Review & Confirm</p>
                        </div>
                    </div>
                </div>
            ) : null}

            <Dialog
                open={importPreviewOpen}
                onOpenChange={(open) => {
                    if (!open) {
                        closeImportPreview();
                    } else {
                        setImportPreviewOpen(true);
                    }
                }}
            >
                <DialogContent className="border-4 border-black max-w-4xl">
                    <DialogHeader>
                        <DialogTitle className="font-heading font-bold text-xl">Import Preview</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                            <div className="rounded border-2 border-black bg-white p-3">
                                <p className="text-xs uppercase tracking-wide text-gray-500">Rows Identified</p>
                                <p className="text-xl font-bold">{previewIdentifiedCount}</p>
                            </div>
                            <div className="rounded border-2 border-black bg-white p-3">
                                <p className="text-xs uppercase tracking-wide text-gray-500">Mismatched</p>
                                <p className="text-xl font-bold">{previewMismatchedCount}</p>
                            </div>
                            <div className="rounded border-2 border-black bg-white p-3">
                                <p className="text-xs uppercase tracking-wide text-gray-500">Unidentified</p>
                                <p className="text-xl font-bold">{previewUnidentifiedCount}</p>
                            </div>
                            <div className="rounded border-2 border-black bg-white p-3">
                                <p className="text-xs uppercase tracking-wide text-gray-500">Required/Invalid</p>
                                <p className="text-xl font-bold">{previewOtherRequiredCount}</p>
                            </div>
                            <div className="rounded border-2 border-black bg-white p-3">
                                <p className="text-xs uppercase tracking-wide text-gray-500">Ready</p>
                                <p className="text-xl font-bold">{previewReadyCount}</p>
                            </div>
                        </div>

                        {previewIdentifiedRows.length > 0 ? (
                            <div className="rounded border-2 border-black bg-white p-3">
                                <p className="font-semibold mb-2">Identified Rows</p>
                                <div className="max-h-32 overflow-y-auto text-sm space-y-1">
                                    {previewIdentifiedRows.map((item, index) => (
                                        <p key={`identified-${index}`}>
                                            Row {item.row}: {item.identifier} {item.name ? `(${item.name})` : ''}
                                        </p>
                                    ))}
                                </div>
                            </div>
                        ) : null}

                        {previewMismatchedRows.length > 0 ? (
                            <div className="rounded border-2 border-amber-400 bg-amber-50 p-3">
                                <p className="font-semibold mb-2">Mismatched Rows</p>
                                <div className="max-h-32 overflow-y-auto text-sm space-y-1">
                                    {previewMismatchedRows.map((item, index) => (
                                        <p key={`mismatch-${index}`}>
                                            Row {item.row}: {item.identifier} - Provided "{item.provided_name || '—'}", Expected "{item.expected_name || '—'}"
                                        </p>
                                    ))}
                                </div>
                            </div>
                        ) : null}

                        {previewUnidentifiedRows.length > 0 ? (
                            <div className="rounded border-2 border-red-500 bg-red-50 p-3">
                                <p className="font-semibold mb-2">Unidentified Rows</p>
                                <div className="max-h-32 overflow-y-auto text-sm space-y-1">
                                    {previewUnidentifiedRows.map((item, index) => (
                                        <p key={`unidentified-${index}`}>
                                            Row {item.row}: {item.identifier || '—'} - {item.reason}
                                        </p>
                                    ))}
                                </div>
                            </div>
                        ) : null}

                        {previewOtherRequiredRows.length > 0 ? (
                            <div className="rounded border-2 border-red-500 bg-red-50 p-3">
                                <p className="font-semibold mb-2">Required/Invalid Rows</p>
                                <div className="max-h-32 overflow-y-auto text-sm space-y-1">
                                    {previewOtherRequiredRows.map((item, index) => (
                                        <p key={`required-${index}`}>
                                            Row {item.row}: {item.identifier || '—'} - {item.reason}
                                        </p>
                                    ))}
                                </div>
                            </div>
                        ) : null}

                        <div className="flex gap-2">
                            <Button onClick={closeImportPreview} variant="outline" className="flex-1 border-2 border-black" disabled={confirmingImport}>
                                Cancel
                            </Button>
                            <Button
                                onClick={confirmImportUpdate}
                                className="flex-1 bg-primary text-white border-2 border-black"
                                disabled={confirmingImport || !pendingImportFile || previewReadyCount <= 0}
                            >
                                {confirmingImport ? 'Updating...' : `Confirm Update (${previewReadyCount})`}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            <div className="neo-card mb-6">
                <div className="flex gap-2 mb-4">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <Input
                            placeholder="Search..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="neo-input pl-10"
                        />
                    </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="neo-input"><SelectValue placeholder="Filter by status" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Status</SelectItem>
                            <SelectItem value="active">Active</SelectItem>
                            <SelectItem value="eliminated">Eliminated</SelectItem>
                        </SelectContent>
                    </Select>
                    <Select value={presenceFilter} onValueChange={setPresenceFilter}>
                        <SelectTrigger className="neo-input"><SelectValue placeholder="Filter by presence" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Presence</SelectItem>
                            <SelectItem value="present">Present</SelectItem>
                            <SelectItem value="absent">Absent</SelectItem>
                        </SelectContent>
                    </Select>
                    <Select value={sortBy} onValueChange={setSortBy}>
                        <SelectTrigger className="neo-input"><SelectValue placeholder="Sort entries" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="register_asc">Code (Asc)</SelectItem>
                            <SelectItem value="register_desc">Code (Desc)</SelectItem>
                            <SelectItem value="name_asc">Name (A-Z)</SelectItem>
                            <SelectItem value="name_desc">Name (Z-A)</SelectItem>
                            <SelectItem value="score_desc">Score (High-Low)</SelectItem>
                            <SelectItem value="score_asc">Score (Low-High)</SelectItem>
                            {round?.is_frozen ? <SelectItem value="rank_asc">Rank (Top-Down)</SelectItem> : null}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {!loading && totalRows > 0 ? (
                <div className="mb-3 flex items-center justify-between text-sm text-gray-600">
                    <span>Showing {pageStart}-{pageEnd} of {totalRows}</span>
                    <span>Page {currentPage} / {totalPages}</span>
                </div>
            ) : null}

            {displayedRows.length === 0 ? (
                <div className="neo-card text-center py-12">
                    <Users className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                    <h3 className="font-heading font-bold text-xl">No Entries Match Current Filters</h3>
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="neo-table">
                        <thead>
                            <tr>
                                <th>{entityMode === 'team' ? 'Team Code' : 'Register No'}</th>
                                <th>{entityMode === 'team' ? 'Team Name' : 'Name'}</th>
                                <th>Round Status</th>
                                <th>Submission</th>
                                <th>Present</th>
                                {criteria.map((criterion, index) => (
                                    <th key={`${criterion.name}-${index}`}>{criterion.name} (/{criterion.max_marks})</th>
                                ))}
                                <th>Total</th>
                                <th>Round Score</th>
                                {round?.is_frozen ? <th>Round Rank</th> : null}
                            </tr>
                        </thead>
                        <tbody>
                            {pagedRows.map((row) => {
                                const totalScore = getTotalScore(row);
                                const maxScore = criteria.reduce((sum, criterion) => sum + Number(criterion.max_marks || 0), 0);
                                const normalized = maxScore > 0 ? (totalScore / maxScore * 100).toFixed(2) : '0.00';
                                const roundRank = round?.is_frozen ? (roundRankMap[row._entityId] || '—') : null;
                                const roundStatus = !row.is_present
                                    ? 'Absent'
                                    : (row._status === 'Eliminated' ? 'Eliminated' : 'Active');
                                const roundStatusClass = roundStatus === 'Active'
                                    ? 'bg-green-100 text-green-800 border-green-500'
                                    : (roundStatus === 'Eliminated'
                                        ? 'bg-red-100 text-red-800 border-red-500'
                                        : 'bg-orange-100 text-orange-800 border-orange-500');

                                return (
                                    <tr key={`${row._entityType}-${row._entityId}`}>
                                        <td className="font-mono font-bold">{row._code || '—'}</td>
                                        <td className="font-medium">{row._name || '—'}</td>
                                        <td>
                                            <span className={`tag border-2 ${roundStatusClass}`}>{roundStatus}</span>
                                        </td>
                                        <td>
                                            {row.submission_file_url || row.submission_link_url ? (
                                                <div className="flex items-center gap-2">
                                                    <a
                                                        href={row.submission_file_url || row.submission_link_url}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="text-xs font-bold underline"
                                                    >
                                                        View
                                                    </a>
                                                    {row.submission_is_locked ? (
                                                        <span className="tag border-2 border-slate-500 bg-slate-100 text-slate-700">Locked</span>
                                                    ) : null}
                                                </div>
                                            ) : (
                                                <span className="text-xs text-slate-500">Missing</span>
                                            )}
                                        </td>
                                        <td>
                                            <Checkbox
                                                checked={Boolean(row.is_present)}
                                                onCheckedChange={(checked) => handlePresenceChange(row._entityId, checked)}
                                                disabled={round.is_frozen || !isRoundActive}
                                                className="border-2 border-black data-[state=checked]:bg-primary"
                                            />
                                        </td>
                                        {criteria.map((criterion, index) => (
                                            <td key={`${criterion.name}-${index}`}>
                                                <Input
                                                    type="number"
                                                    value={row.criteria_scores?.[criterion.name] ?? ''}
                                                    onChange={(e) => handleScoreChange(row._entityId, criterion.name, e.target.value)}
                                                    onBlur={() => handleScoreBlur(row._entityId, criterion.name)}
                                                    disabled={round.is_frozen || !row.is_present}
                                                    className="neo-input w-20"
                                                    min={0}
                                                    max={criterion.max_marks}
                                                />
                                            </td>
                                        ))}
                                        <td className="font-bold">{totalScore}</td>
                                        <td>
                                            <span className="bg-primary text-white px-2 py-1 border-2 border-black font-bold">{normalized}</span>
                                        </td>
                                        {round?.is_frozen ? <td className="font-bold">{roundRank}</td> : null}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {!loading && totalRows > 0 ? (
                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-gray-600">
                        Showing {pageStart}-{pageEnd} of {totalRows}
                    </p>
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Rows per page</span>
                        <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
                            <SelectTrigger className="w-[90px] neo-input">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {SCORING_PAGE_SIZE_OPTIONS.map((option) => (
                                    <SelectItem key={option} value={String(option)}>{option}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                            disabled={currentPage === 1}
                            className="border-2 border-black shadow-neo disabled:opacity-50"
                        >
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                        <span className="min-w-24 text-center text-sm font-bold">Page {currentPage} / {totalPages}</span>
                        <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                            disabled={currentPage === totalPages}
                            className="border-2 border-black shadow-neo disabled:opacity-50"
                        >
                            <ArrowLeft className="h-4 w-4 rotate-180" />
                        </Button>
                    </div>
                </div>
            ) : null}
        </>
    );
}

export default function EventAdminScoringPage() {
    return (
        <EventAdminShell activeTab="scoring">
            <ScoringContent />
        </EventAdminShell>
    );
}
