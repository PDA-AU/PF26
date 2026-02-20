import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import {
    Trophy,
    Medal,
    Search,
    Download,
    RefreshCw,
    ChevronLeft,
    ChevronRight,
    ChevronDown,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useAuth } from '@/context/AuthContext';

import EventAdminShell, { useEventAdminShell } from './EventAdminShell';
import EntityDetailsModal from './EntityDetailsModal';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const PAGE_SIZE = 10;

const DEPARTMENTS = [
    { value: 'Artificial Intelligence and Data Science', label: 'AI & DS' },
    { value: 'Aerospace Engineering', label: 'Aerospace' },
    { value: 'Automobile Engineering', label: 'Automobile' },
    { value: 'Computer Technology', label: 'CT' },
    { value: 'Electronics and Communication Engineering', label: 'ECE' },
    { value: 'Electronics and Instrumentation Engineering', label: 'EIE' },
    { value: 'Production Technology', label: 'Production' },
    { value: 'Robotics and Automation', label: 'Robotics' },
    { value: 'Rubber and Plastics Technology', label: 'RPT' },
    { value: 'Information Technology', label: 'IT' },
];

const normalizeRoundState = (value) => String(value || '').trim().toLowerCase();

function LeaderboardContent() {
    const { getAuthHeader } = useAuth();
    const { eventInfo, eventSlug } = useEventAdminShell();

    const [rows, setRows] = useState([]);
    const [podium, setPodium] = useState([]);
    const [rounds, setRounds] = useState([]);
    const [loading, setLoading] = useState(true);
    const [totalRows, setTotalRows] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [selectedEntry, setSelectedEntry] = useState(null);
    const [roundStats, setRoundStats] = useState([]);
    const [roundStatsLoading, setRoundStatsLoading] = useState(false);
    const [roundStatsError, setRoundStatsError] = useState('');
    const [entrySummary, setEntrySummary] = useState(null);
    const [teamMembers, setTeamMembers] = useState([]);
    const [shortlistDialogOpen, setShortlistDialogOpen] = useState(false);
    const [shortlisting, setShortlisting] = useState(false);
    const [eliminationConfig, setEliminationConfig] = useState({ type: 'top_k', value: 10 });
    const [eliminateAbsent, setEliminateAbsent] = useState(true);
    const [filters, setFilters] = useState({
        department: '',
        gender: '',
        batch: '',
        status: '',
        search: '',
        roundIds: [],
    });

    const isTeamMode = eventInfo?.participant_mode === 'team';

    const getErrorMessage = (error, fallback) => (
        error?.response?.data?.detail || error?.response?.data?.message || fallback
    );

    const fetchRows = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (filters.search) params.append('search', filters.search);
            if (filters.status) params.append('status', filters.status);
            if (!isTeamMode) {
                if (filters.department) params.append('department', filters.department);
                if (filters.gender) params.append('gender', filters.gender);
                if (filters.batch) params.append('batch', filters.batch);
            }
            (filters.roundIds || []).forEach((roundId) => {
                params.append('round_ids', String(roundId));
            });
            params.append('page', String(currentPage));
            params.append('page_size', String(PAGE_SIZE));

            const response = await axios.get(`${API}/pda-admin/events/${eventSlug}/leaderboard?${params.toString()}`, {
                headers: getAuthHeader(),
            });
            const data = Array.isArray(response.data) ? response.data : [];
            setRows(data);
            setTotalRows(Number(response.headers['x-total-count'] || data.length || 0));
            if (currentPage === 1) {
                const activeRows = data.filter((row) => String(row?.status || '').toLowerCase() === 'active');
                setPodium(activeRows.slice(0, 3));
            }
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to load leaderboard'));
            setRows([]);
            setTotalRows(0);
            if (currentPage === 1) {
                setPodium([]);
            }
        } finally {
            setLoading(false);
        }
    }, [currentPage, eventSlug, filters.batch, filters.department, filters.gender, filters.roundIds, filters.search, filters.status, getAuthHeader, isTeamMode]);

    const fetchRounds = useCallback(async () => {
        try {
            const response = await axios.get(`${API}/pda-admin/events/${eventSlug}/rounds`, {
                headers: getAuthHeader(),
            });
            setRounds(response.data || []);
        } catch (error) {
            setRounds([]);
        }
    }, [eventSlug, getAuthHeader]);

    useEffect(() => {
        fetchRows();
    }, [fetchRows]);

    useEffect(() => {
        fetchRounds();
    }, [fetchRounds]);

    useEffect(() => {
        setCurrentPage(1);
    }, [filters.batch, filters.department, filters.gender, filters.roundIds, filters.search, filters.status]);

    const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));

    useEffect(() => {
        if (currentPage > totalPages) {
            setCurrentPage(totalPages);
        }
    }, [currentPage, totalPages]);

    const frozenNotCompletedRounds = useMemo(
        () => rounds.filter((round) => round.is_frozen && round.state !== 'Completed' && round.state !== 'Reveal'),
        [rounds]
    );
    const eligibleFilterRounds = useMemo(
        () => rounds.filter((round) => Boolean(round?.is_frozen) || normalizeRoundState(round?.state) === 'completed'),
        [rounds]
    );
    const selectedRoundIdSet = useMemo(
        () => new Set((filters.roundIds || []).map((value) => Number(value))),
        [filters.roundIds]
    );
    const roundFilterLabel = useMemo(() => {
        const count = (filters.roundIds || []).length;
        if (count === 0) return 'All rounds';
        if (count === 1) return '1 round selected';
        return `${count} rounds selected`;
    }, [filters.roundIds]);

    useEffect(() => {
        const allowedRoundIds = new Set(eligibleFilterRounds.map((round) => Number(round.id)));
        setFilters((prev) => {
            const existing = (prev.roundIds || []).map((value) => Number(value));
            const next = existing.filter((roundId) => allowedRoundIds.has(roundId));
            if (next.length === existing.length) return prev;
            return { ...prev, roundIds: next };
        });
    }, [eligibleFilterRounds]);

    const targetShortlistRound = useMemo(
        () => frozenNotCompletedRounds.reduce((latest, round) => {
            if (!latest || round.id > latest.id) return round;
            return latest;
        }, null),
        [frozenNotCompletedRounds]
    );

    const batchOptions = useMemo(() => {
        const values = new Set();
        rows.forEach((row) => {
            if (row.batch) values.add(String(row.batch));
        });
        return Array.from(values).sort();
    }, [rows]);

    const handleShortlist = async () => {
        if (!targetShortlistRound) return;
        setShortlisting(true);
        try {
            await axios.put(`${API}/pda-admin/events/${eventSlug}/rounds/${targetShortlistRound.id}`, {
                elimination_type: eliminationConfig.type,
                elimination_value: eliminationConfig.value,
                eliminate_absent: eliminateAbsent,
            }, { headers: getAuthHeader() });
            toast.success('Shortlist completed');
            setShortlistDialogOpen(false);
            fetchRows();
            fetchRounds();
        } catch (error) {
            toast.error(getErrorMessage(error, 'Shortlist failed'));
        } finally {
            setShortlisting(false);
        }
    };

    const handleExport = async (format) => {
        try {
            const params = new URLSearchParams();
            params.append('format', format);
            if (filters.search) params.append('search', filters.search);
            if (filters.status) params.append('status', filters.status);
            if (!isTeamMode) {
                if (filters.department) params.append('department', filters.department);
                if (filters.gender) params.append('gender', filters.gender);
                if (filters.batch) params.append('batch', filters.batch);
            }
            (filters.roundIds || []).forEach((roundId) => {
                params.append('round_ids', String(roundId));
            });

            const response = await axios.get(`${API}/pda-admin/events/${eventSlug}/export/leaderboard?${params.toString()}`, {
                headers: getAuthHeader(),
                responseType: 'blob',
            });

            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `leaderboard.${format}`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);

            toast.success('Leaderboard exported');
        } catch (error) {
            toast.error(getErrorMessage(error, 'Export failed'));
        }
    };

    const handleRefresh = () => {
        fetchRounds();
        fetchRows();
        toast.success('Leaderboard refreshed');
    };

    const toggleRoundSelection = useCallback((roundId, checked) => {
        const targetId = Number(roundId);
        setFilters((prev) => {
            const nextSet = new Set((prev.roundIds || []).map((value) => Number(value)));
            if (checked) nextSet.add(targetId);
            else nextSet.delete(targetId);
            return { ...prev, roundIds: Array.from(nextSet) };
        });
    }, []);

    const openEntityModal = async (entry) => {
        const entityId = entry.entity_id || entry.participant_id;
        setSelectedEntry(entry);
        setRoundStats([]);
        setRoundStatsError('');
        setRoundStatsLoading(true);
        setEntrySummary(null);
        setTeamMembers([]);
        try {
            const [roundRes, summaryRes] = await Promise.all([
                axios.get(`${API}/pda-admin/events/${eventSlug}/participants/${entityId}/rounds`, {
                    headers: getAuthHeader(),
                }),
                axios.get(`${API}/pda-admin/events/${eventSlug}/participants/${entityId}/summary`, {
                    headers: getAuthHeader(),
                }),
            ]);
            setRoundStats(roundRes.data || []);
            setEntrySummary(summaryRes.data || null);
            if (isTeamMode) {
                const teamRes = await axios.get(`${API}/pda-admin/events/${eventSlug}/teams/${entityId}`, {
                    headers: getAuthHeader(),
                });
                setTeamMembers(teamRes.data?.members || []);
            }
        } catch (error) {
            setRoundStatsError('Failed to load round stats');
        } finally {
            setRoundStatsLoading(false);
        }
    };

    const getRankBadge = (rank) => {
        if (rank === null || rank === undefined) return 'bg-gray-200 text-gray-700';
        if (rank === 1) return 'bg-yellow-400 text-black';
        if (rank === 2) return 'bg-gray-300 text-black';
        if (rank === 3) return 'bg-orange-400 text-black';
        return 'bg-primary text-white';
    };

    const departmentLabel = selectedEntry
        ? (DEPARTMENTS.find((d) => d.value === selectedEntry.department)?.label || selectedEntry.department)
        : '';

    return (
        <>
            {targetShortlistRound ? (
                <div className="neo-card mb-6 bg-orange-50 border-orange-500">
                    <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
                        <div>
                            <h2 className="font-heading font-bold text-xl">Shortlist participants</h2>
                            <p className="text-gray-700 text-sm">
                                Frozen round {targetShortlistRound.round_no} is ready for shortlisting. This uses cumulative
                                scores from completed + frozen rounds.
                            </p>
                        </div>
                        <Dialog open={shortlistDialogOpen} onOpenChange={setShortlistDialogOpen}>
                            <DialogTrigger asChild>
                                <Button className="bg-orange-500 text-white border-2 border-black shadow-neo">Shortlist</Button>
                            </DialogTrigger>
                            <DialogContent className="border-4 border-black">
                                <DialogHeader>
                                    <DialogTitle className="font-heading font-bold text-xl">Shortlist {isTeamMode ? 'Teams' : 'Participants'}</DialogTitle>
                                </DialogHeader>
                                <div className="space-y-4">
                                    <p className="text-gray-600">
                                        This will eliminate {isTeamMode ? 'teams' : 'participants'} based on cumulative scores.
                                        Round {targetShortlistRound.round_no} will be marked as completed.
                                    </p>
                                    <div className="space-y-2">
                                        <div className="font-bold">Elimination Rule</div>
                                        <Select value={eliminationConfig.type} onValueChange={(value) => setEliminationConfig((prev) => ({ ...prev, type: value }))}>
                                            <SelectTrigger className="neo-input"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="top_k">Keep Top K</SelectItem>
                                                <SelectItem value="min_score">Minimum Score</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <div className="font-bold">{eliminationConfig.type === 'top_k' ? 'Keep top:' : 'Min score:'}</div>
                                        <Input
                                            type="number"
                                            value={eliminationConfig.value}
                                            onChange={(e) => setEliminationConfig((prev) => ({ ...prev, value: parseFloat(e.target.value) || 0 }))}
                                            className="neo-input"
                                        />
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Checkbox
                                            checked={eliminateAbsent}
                                            onCheckedChange={(checked) => setEliminateAbsent(checked === true)}
                                            className="border-2 border-black data-[state=checked]:bg-primary"
                                        />
                                        <span className="text-sm font-medium">Eliminate absent entries</span>
                                    </div>
                                    <div className="flex gap-2">
                                        <Button onClick={() => setShortlistDialogOpen(false)} variant="outline" className="flex-1 border-2 border-black">Cancel</Button>
                                        <Button onClick={handleShortlist} disabled={shortlisting} className="flex-1 bg-orange-500 text-white border-2 border-black">
                                            {shortlisting ? 'Shortlisting...' : 'Confirm'}
                                        </Button>
                                    </div>
                                </div>
                            </DialogContent>
                        </Dialog>
                    </div>
                </div>
            ) : null}

            <div className="neo-card mb-6">
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6">
                    <div>
                        <h1 className="font-heading font-bold text-3xl flex items-center gap-2">
                            <Trophy className="w-8 h-8 text-yellow-500" /> Leaderboard
                        </h1>
                        <p className="text-gray-600">Cumulative scores from completed + frozen rounds</p>
                    </div>
                    <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
                        <Button onClick={handleRefresh} variant="outline" className="w-full border-2 border-black shadow-neo sm:w-auto">
                            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
                        </Button>
                        <Button onClick={() => handleExport('csv')} variant="outline" className="w-full border-2 border-black shadow-neo sm:w-auto">
                            <Download className="w-4 h-4 mr-2" /> CSV
                        </Button>
                        <Button onClick={() => handleExport('xlsx')} variant="outline" className="w-full border-2 border-black shadow-neo sm:w-auto">
                            <Download className="w-4 h-4 mr-2" /> Excel
                        </Button>
                    </div>
                </div>

                <div className={`grid gap-3 ${isTeamMode ? 'grid-cols-1 md:grid-cols-3' : 'grid-cols-1 md:grid-cols-3 lg:grid-cols-6'}`}>
                    <div className={`relative ${isTeamMode ? 'md:col-span-2' : 'md:col-span-3 lg:col-span-2'}`}>
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <Input
                            placeholder={`Search ${isTeamMode ? 'team' : 'participant'}...`}
                            value={filters.search}
                            onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
                            className="neo-input pl-10"
                        />
                    </div>

                    {!isTeamMode ? (
                        <Select value={filters.department || 'all'} onValueChange={(value) => setFilters((prev) => ({ ...prev, department: value === 'all' ? '' : value }))}>
                            <SelectTrigger className="neo-input"><SelectValue placeholder="Department" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Departments</SelectItem>
                                {DEPARTMENTS.map((d) => (
                                    <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    ) : null}

                    {!isTeamMode ? (
                        <Select value={filters.batch || 'all'} onValueChange={(value) => setFilters((prev) => ({ ...prev, batch: value === 'all' ? '' : value }))}>
                            <SelectTrigger className="neo-input"><SelectValue placeholder="Batch" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Batches</SelectItem>
                                {batchOptions.map((batch) => (
                                    <SelectItem key={batch} value={batch}>{batch}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    ) : null}

                    {!isTeamMode ? (
                        <Select value={filters.gender || 'all'} onValueChange={(value) => setFilters((prev) => ({ ...prev, gender: value === 'all' ? '' : value }))}>
                            <SelectTrigger className="neo-input"><SelectValue placeholder="Gender" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Genders</SelectItem>
                                <SelectItem value="Male">Male</SelectItem>
                                <SelectItem value="Female">Female</SelectItem>
                            </SelectContent>
                        </Select>
                    ) : null}

                    <Select value={filters.status || 'all'} onValueChange={(value) => setFilters((prev) => ({ ...prev, status: value === 'all' ? '' : value }))}>
                        <SelectTrigger className="neo-input"><SelectValue placeholder="Status" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Statuses</SelectItem>
                            <SelectItem value="Active">Active</SelectItem>
                            <SelectItem value="Eliminated">Eliminated</SelectItem>
                        </SelectContent>
                    </Select>

                    <Popover>
                        <PopoverTrigger asChild>
                            <Button type="button" variant="outline" className="neo-input justify-between font-normal">
                                <span className="truncate">{roundFilterLabel}</span>
                                <ChevronDown className="h-4 w-4" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-80 border-2 border-black p-3" align="end">
                            <div className="mb-2 flex items-center justify-between">
                                <p className="text-sm font-bold">Eligible Rounds</p>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    className="h-7 px-2 text-xs"
                                    onClick={() => setFilters((prev) => ({ ...prev, roundIds: [] }))}
                                >
                                    All rounds
                                </Button>
                            </div>
                            {eligibleFilterRounds.length === 0 ? (
                                <p className="text-xs text-gray-600">No completed/frozen rounds yet.</p>
                            ) : (
                                <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                                    {eligibleFilterRounds.map((round) => (
                                        <label key={round.id} className="flex cursor-pointer items-start gap-2 rounded-md border border-black/10 bg-[#fffdf7] px-2 py-2">
                                            <Checkbox
                                                checked={selectedRoundIdSet.has(Number(round.id))}
                                                onCheckedChange={(checked) => toggleRoundSelection(round.id, checked === true)}
                                                className="mt-0.5 border-2 border-black data-[state=checked]:bg-primary"
                                            />
                                            <span className="text-sm">
                                                <span className="font-semibold">
                                                    {String(round.round_no || '').toLowerCase().startsWith('pf')
                                                        ? String(round.round_no)
                                                        : `PF${String(round.round_no || '').padStart(2, '0')}`}
                                                </span>
                                                <span className="mx-1 text-gray-400">-</span>
                                                <span>{round.name}</span>
                                            </span>
                                        </label>
                                    ))}
                                </div>
                            )}
                        </PopoverContent>
                    </Popover>
                </div>
            </div>

            {podium.length >= 3 ? (
                <div className="grid md:grid-cols-3 gap-6 mb-8">
                    <div className="neo-card bg-gray-100 order-2 md:order-1 transform md:translate-y-4">
                        <div className="text-center">
                            <div className="w-16 h-16 mx-auto bg-gray-300 border-4 border-black flex items-center justify-center mb-4">
                                <Medal className="w-8 h-8" />
                            </div>
                            <div className="font-bold text-2xl text-gray-600">#2</div>
                            <h3 className="font-heading font-bold text-xl">{podium[1]?.name}</h3>
                            <p className="text-sm text-gray-600">{podium[1]?.regno_or_code || podium[1]?.register_number}</p>
                            {!isTeamMode ? (
                                <p className="text-sm text-gray-500 mt-1">
                                    {DEPARTMENTS.find((d) => d.value === podium[1]?.department)?.label || podium[1]?.department || '—'}
                                </p>
                            ) : null}
                            <div className="mt-4 bg-gray-300 border-2 border-black px-4 py-2 inline-block">
                                <span className="font-bold text-2xl">{Number(podium[1]?.cumulative_score || 0).toFixed(2)}</span>
                                <span className="text-sm ml-1">pts</span>
                            </div>
                        </div>
                    </div>

                    <div className="neo-card bg-yellow-100 border-yellow-500 order-1 md:order-2">
                        <div className="text-center">
                            <div className="w-20 h-20 mx-auto bg-yellow-400 border-4 border-black flex items-center justify-center mb-4 shadow-neo">
                                <Trophy className="w-10 h-10" />
                            </div>
                            <div className="font-bold text-3xl text-yellow-600">#1</div>
                            <h3 className="font-heading font-bold text-2xl">{podium[0]?.name}</h3>
                            <p className="text-sm text-gray-600">{podium[0]?.regno_or_code || podium[0]?.register_number}</p>
                            {!isTeamMode ? (
                                <p className="text-sm text-gray-500 mt-1">
                                    {DEPARTMENTS.find((d) => d.value === podium[0]?.department)?.label || podium[0]?.department || '—'}
                                </p>
                            ) : null}
                            <div className="mt-4 bg-yellow-400 border-2 border-black px-6 py-3 inline-block shadow-neo">
                                <span className="font-bold text-3xl">{Number(podium[0]?.cumulative_score || 0).toFixed(2)}</span>
                                <span className="text-sm ml-1">pts</span>
                            </div>
                        </div>
                    </div>

                    <div className="neo-card bg-orange-100 order-3 transform md:translate-y-8">
                        <div className="text-center">
                            <div className="w-14 h-14 mx-auto bg-orange-400 border-4 border-black flex items-center justify-center mb-4">
                                <Medal className="w-7 h-7" />
                            </div>
                            <div className="font-bold text-xl text-orange-600">#3</div>
                            <h3 className="font-heading font-bold text-lg">{podium[2]?.name}</h3>
                            <p className="text-sm text-gray-600">{podium[2]?.regno_or_code || podium[2]?.register_number}</p>
                            {!isTeamMode ? (
                                <p className="text-sm text-gray-500 mt-1">
                                    {DEPARTMENTS.find((d) => d.value === podium[2]?.department)?.label || podium[2]?.department || '—'}
                                </p>
                            ) : null}
                            <div className="mt-4 bg-orange-400 border-2 border-black px-4 py-2 inline-block">
                                <span className="font-bold text-xl">{Number(podium[2]?.cumulative_score || 0).toFixed(2)}</span>
                                <span className="text-sm ml-1">pts</span>
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}

            {loading ? (
                <div className="neo-card text-center py-12">
                    <div className="loading-spinner mx-auto"></div>
                    <p className="mt-4">Loading leaderboard...</p>
                </div>
            ) : rows.length === 0 ? (
                <div className="neo-card text-center py-12">
                    <Trophy className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                    <h3 className="font-heading font-bold text-xl mb-2">No Leaderboard Data</h3>
                    <p className="text-gray-600">Freeze rounds to see the leaderboard.</p>
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="neo-table">
                        <thead>
                            <tr>
                                <th>Rank</th>
                                <th>{isTeamMode ? 'Team Code' : 'Register No'}</th>
                                <th>{isTeamMode ? 'Team Name' : 'Name'}</th>
                                {!isTeamMode ? <th>Department</th> : null}
                                {!isTeamMode ? <th>Batch</th> : null}
                                <th>Rounds</th>
                                <th>Score</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((entry) => (
                                <tr
                                    key={`${entry.entity_type}-${entry.entity_id}`}
                                    className="cursor-pointer hover:bg-secondary"
                                    onClick={() => openEntityModal(entry)}
                                >
                                    <td>
                                        <span className={`w-8 h-8 inline-flex items-center justify-center border-2 border-black font-bold ${getRankBadge(entry.rank)}`}>
                                            {entry.rank ?? '—'}
                                        </span>
                                    </td>
                                    <td className="font-mono font-bold">{entry.regno_or_code || entry.register_number}</td>
                                    <td className="font-medium">{entry.name}</td>
                                    {!isTeamMode ? (
                                        <td className="text-sm">{DEPARTMENTS.find((d) => d.value === entry.department)?.label || entry.department}</td>
                                    ) : null}
                                    {!isTeamMode ? <td className="text-sm">{entry.batch}</td> : null}
                                    <td>
                                        <span className="bg-secondary px-2 py-1 border border-black font-bold">{entry.rounds_participated ?? '—'}</span>
                                    </td>
                                    <td>
                                        <span className="bg-primary text-white px-3 py-1 border-2 border-black font-bold">
                                            {Number(entry.cumulative_score || 0).toFixed(2)}
                                        </span>
                                    </td>
                                    <td>
                                        <span className={`tag border-2 ${entry.status === 'Active' ? 'bg-green-100 text-green-800 border-green-500' : 'bg-red-100 text-red-800 border-red-500'}`}>
                                            {entry.status}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {!loading && totalRows > 0 ? (
                <div className="mt-4 flex items-center justify-between">
                    <p className="text-sm text-gray-600">
                        Showing {(currentPage - 1) * PAGE_SIZE + 1}-{Math.min((currentPage - 1) * PAGE_SIZE + rows.length, totalRows)} of {totalRows}
                    </p>
                    <div className="flex items-center gap-2">
                        <Button type="button" variant="outline" size="icon" onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))} disabled={currentPage === 1} className="border-2 border-black shadow-neo disabled:opacity-50">
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <span className="min-w-20 text-center text-sm font-bold">Page {currentPage} / {totalPages}</span>
                        <Button type="button" variant="outline" size="icon" onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))} disabled={currentPage === totalPages} className="border-2 border-black shadow-neo disabled:opacity-50">
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            ) : null}

            <EntityDetailsModal
                open={Boolean(selectedEntry)}
                onOpenChange={() => setSelectedEntry(null)}
                entity={selectedEntry}
                roundStats={roundStats}
                roundStatsLoading={roundStatsLoading}
                roundStatsError={roundStatsError}
                overallPoints={entrySummary?.overall_points}
                overallRank={entrySummary?.overall_rank}
                entityMode={isTeamMode ? 'team' : 'individual'}
                teamMembers={teamMembers}
                departmentLabel={departmentLabel}
            />
        </>
    );
}

export default function EventAdminLeaderboardPage() {
    return (
        <EventAdminShell activeTab="leaderboard">
            <LeaderboardContent />
        </EventAdminShell>
    );
}
