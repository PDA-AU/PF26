import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import axios from 'axios';
import { toast } from 'sonner';
import { 
    Trophy, Search, Download, LogOut, Sparkles, LayoutDashboard,
    Calendar, Users, Medal
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const LEADERBOARD_CACHE_TTL_MS = 10 * 60 * 1000;
const ROUND_STATS_CACHE_TTL_MS = 10 * 60 * 1000;

const getLeaderboardCacheKey = (params) => `pf26_leaderboard_${params || 'all'}`;
const getRoundStatsCacheKey = (participantId) => `pf26_leaderboard_rounds_${participantId}`;

const loadCache = (key, ttlMs) => {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed.ts !== 'number' || parsed.data === undefined) return null;
        if (Date.now() - parsed.ts > ttlMs) return null;
        return parsed.data;
    } catch (error) {
        return null;
    }
};

const saveCache = (key, data) => {
    try {
        localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }));
    } catch (error) {
        // ignore storage errors
    }
};

const DEPARTMENTS = [
    { value: "Artificial Intelligence and Data Science", label: "AI & DS" },
    { value: "Aerospace Engineering", label: "Aerospace" },
    { value: "Automobile Engineering", label: "Automobile" },
    { value: "Computer Technology", label: "CT" },
    { value: "Electronics and Communication Engineering", label: "ECE" },
    { value: "Electronics and Instrumentation Engineering", label: "EIE" },
    { value: "Production Technology", label: "Production" },
    { value: "Robotics and Automation", label: "Robotics" },
    { value: "Rubber and Plastics Technology", label: "RPT" },
    { value: "Information Technology", label: "IT" }
];

const YEARS = ["First Year", "Second Year", "Third Year"];

export default function AdminLeaderboard() {
    const navigate = useNavigate();
    const { logout, getAuthHeader } = useAuth();
    const [leaderboard, setLeaderboard] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedEntry, setSelectedEntry] = useState(null);
    const [roundStats, setRoundStats] = useState([]);
    const [roundStatsLoading, setRoundStatsLoading] = useState(false);
    const [roundStatsError, setRoundStatsError] = useState('');
    const [filters, setFilters] = useState({
        department: '',
        year: '',
        search: ''
    });

    const fetchLeaderboard = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (filters.department) params.append('department', filters.department);
            if (filters.year) params.append('year', filters.year);
            if (filters.search) params.append('search', filters.search);

            const paramString = params.toString();
            const cacheKey = getLeaderboardCacheKey(paramString);
            const cached = loadCache(cacheKey, LEADERBOARD_CACHE_TTL_MS);
            if (cached) {
                setLeaderboard(cached);
                setLoading(false);
                return;
            }

            const response = await axios.get(`${API}/admin/leaderboard?${paramString}`, {
                headers: getAuthHeader()
            });
            setLeaderboard(response.data);
            saveCache(cacheKey, response.data);
        } catch (error) {
            toast.error('Failed to load leaderboard');
        } finally {
            setLoading(false);
        }
    }, [filters, getAuthHeader]);

    useEffect(() => {
        fetchLeaderboard();
    }, [fetchLeaderboard]);

    const handleExport = async (format) => {
        try {
            const response = await axios.get(`${API}/admin/export/leaderboard?format=${format}`, {
                headers: getAuthHeader(),
                responseType: 'blob'
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
            toast.error('Export failed');
        }
    };

    const handleLogout = () => {
        logout();
        navigate('/');
    };

    const getProfileImageUrl = (entry) => {
        if (!entry?.profile_picture) return null;
        if (entry.profile_picture.startsWith('http')) return entry.profile_picture;
        return `${process.env.REACT_APP_BACKEND_URL}${entry.profile_picture}`;
    };

    const openLeaderboardModal = async (entry) => {
        setSelectedEntry(entry);
        setRoundStats([]);
        setRoundStatsError('');
        setRoundStatsLoading(true);
        try {
            const cacheKey = getRoundStatsCacheKey(entry.participant_id);
            const cached = loadCache(cacheKey, ROUND_STATS_CACHE_TTL_MS);
            if (cached) {
                setRoundStats(cached);
                setRoundStatsLoading(false);
                return;
            }
            const response = await axios.get(`${API}/admin/participants/${entry.participant_id}/rounds`, {
                headers: getAuthHeader()
            });
            setRoundStats(response.data || []);
            saveCache(cacheKey, response.data || []);
        } catch (error) {
            setRoundStatsError('Failed to load round stats');
        } finally {
            setRoundStatsLoading(false);
        }
    };

    const getRankBadge = (rank) => {
        if (rank === 1) return 'bg-yellow-400 text-black';
        if (rank === 2) return 'bg-gray-300 text-black';
        if (rank === 3) return 'bg-orange-400 text-black';
        return 'bg-primary text-white';
    };

    return (
        <div className="min-h-screen bg-muted">
            {/* Header */}
            <header className="bg-primary text-white border-b-4 border-black sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center h-16">
                        <div className="flex items-center gap-4">
                            <Link to="/" className="flex items-center gap-2">
                                <div className="w-10 h-10 bg-white border-2 border-black shadow-neo flex items-center justify-center">
                                    <Sparkles className="w-6 h-6 text-primary" />
                                </div>
                                <span className="font-heading font-black text-xl tracking-tight hidden md:block">PERSOFEST'26</span>
                            </Link>
                            <span className="bg-accent text-black px-2 py-1 border-2 border-black text-xs font-bold">ADMIN</span>
                        </div>
                        <Button
                            variant="outline"
                            onClick={handleLogout}
                            className="bg-white text-black border-2 border-black shadow-neo hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all"
                        >
                            <LogOut className="w-5 h-5" />
                        </Button>
                    </div>
                </div>
            </header>

            {/* Navigation */}
            <nav className="bg-white border-b-2 border-black">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex gap-1 sm:gap-1">
                        <Link to="/admin" aria-label="Dashboard" className="flex-1 sm:flex-none flex items-center justify-center px-2 sm:px-4 py-3 font-bold text-xs sm:text-sm hover:bg-muted transition-colors">
                            <LayoutDashboard className="w-5 h-5 sm:w-4 sm:h-4 sm:mr-2" />
                            <span className="hidden sm:inline">Dashboard</span>
                        </Link>
                        <Link to="/admin/rounds" aria-label="Rounds" className="flex-1 sm:flex-none flex items-center justify-center px-2 sm:px-4 py-3 font-bold text-xs sm:text-sm hover:bg-muted transition-colors">
                            <Calendar className="w-5 h-5 sm:w-4 sm:h-4 sm:mr-2" />
                            <span className="hidden sm:inline">Rounds</span>
                        </Link>
                        <Link to="/admin/participants" aria-label="Participants" className="flex-1 sm:flex-none flex items-center justify-center px-2 sm:px-4 py-3 font-bold text-xs sm:text-sm hover:bg-muted transition-colors">
                            <Users className="w-5 h-5 sm:w-4 sm:h-4 sm:mr-2" />
                            <span className="hidden sm:inline">Participants</span>
                        </Link>
                        <Link to="/admin/leaderboard" aria-label="Leaderboard" className="flex-1 sm:flex-none flex items-center justify-center px-2 sm:px-4 py-3 font-bold text-xs sm:text-sm border-b-4 border-primary bg-secondary">
                            <Trophy className="w-5 h-5 sm:w-4 sm:h-4 sm:mr-2" />
                            <span className="hidden sm:inline">Leaderboard</span>
                        </Link>
                    </div>
                </div>
            </nav>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Header & Filters */}
                <div className="neo-card mb-6">
                    <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6">
                        <div>
                            <h1 className="font-heading font-bold text-3xl flex items-center gap-2">
                                <Trophy className="w-8 h-8 text-yellow-500" />
                                Leaderboard
                            </h1>
                            <p className="text-gray-600">Cumulative scores from frozen rounds only</p>
                        </div>
                        <div className="flex gap-2">
                            <Button
                                onClick={() => handleExport('csv')}
                                variant="outline"
                                className="border-2 border-black shadow-neo hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none"
                                data-testid="export-leaderboard-csv"
                            >
                                <Download className="w-4 h-4 mr-2" /> CSV
                            </Button>
                            <Button
                                onClick={() => handleExport('xlsx')}
                                variant="outline"
                                className="border-2 border-black shadow-neo hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none"
                                data-testid="export-leaderboard-xlsx"
                            >
                                <Download className="w-4 h-4 mr-2" /> Excel
                            </Button>
                        </div>
                    </div>

                    {/* Filters */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                        <div className="relative md:col-span-2">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                            <Input
                                placeholder="Search by name or register number..."
                                value={filters.search}
                                onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                                className="neo-input pl-10"
                                data-testid="leaderboard-search"
                            />
                        </div>

                        <Select value={filters.department} onValueChange={(value) => setFilters(prev => ({ ...prev, department: value === 'all' ? '' : value }))}>
                            <SelectTrigger className="neo-input" data-testid="filter-department">
                                <SelectValue placeholder="All Departments" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Departments</SelectItem>
                                {DEPARTMENTS.map(d => (
                                    <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <Select value={filters.year} onValueChange={(value) => setFilters(prev => ({ ...prev, year: value === 'all' ? '' : value }))}>
                            <SelectTrigger className="neo-input" data-testid="filter-year">
                                <SelectValue placeholder="All Years" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Years</SelectItem>
                                {YEARS.map(y => (
                                    <SelectItem key={y} value={y}>{y}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                {/* Top 3 */}
                {leaderboard.length >= 3 && (
                    <div className="grid md:grid-cols-3 gap-6 mb-8">
                        {/* Second Place */}
                        <div className="neo-card bg-gray-100 order-2 md:order-1 transform md:translate-y-4" data-testid="rank-2">
                            <div className="text-center">
                                <div className="w-16 h-16 mx-auto bg-gray-300 border-4 border-black flex items-center justify-center mb-4">
                                    <Medal className="w-8 h-8" />
                                </div>
                                <div className="font-bold text-2xl text-gray-600">#2</div>
                                <h3 className="font-heading font-bold text-xl">{leaderboard[1]?.name}</h3>
                                <p className="text-sm text-gray-600">{leaderboard[1]?.register_number}</p>
                                <p className="text-sm text-gray-500 mt-1">
                                    {DEPARTMENTS.find(d => d.value === leaderboard[1]?.department)?.label}
                                </p>
                                <div className="mt-4 bg-gray-300 border-2 border-black px-4 py-2 inline-block">
                                    <span className="font-bold text-2xl">{leaderboard[1]?.cumulative_score?.toFixed(2)}</span>
                                    <span className="text-sm ml-1">pts</span>
                                </div>
                            </div>
                        </div>

                        {/* First Place */}
                        <div className="neo-card bg-yellow-100 border-yellow-500 order-1 md:order-2" data-testid="rank-1">
                            <div className="text-center">
                                <div className="w-20 h-20 mx-auto bg-yellow-400 border-4 border-black flex items-center justify-center mb-4 shadow-neo">
                                    <Trophy className="w-10 h-10" />
                                </div>
                                <div className="font-bold text-3xl text-yellow-600">#1</div>
                                <h3 className="font-heading font-bold text-2xl">{leaderboard[0]?.name}</h3>
                                <p className="text-sm text-gray-600">{leaderboard[0]?.register_number}</p>
                                <p className="text-sm text-gray-500 mt-1">
                                    {DEPARTMENTS.find(d => d.value === leaderboard[0]?.department)?.label}
                                </p>
                                <div className="mt-4 bg-yellow-400 border-2 border-black px-6 py-3 inline-block shadow-neo">
                                    <span className="font-bold text-3xl">{leaderboard[0]?.cumulative_score?.toFixed(2)}</span>
                                    <span className="text-sm ml-1">pts</span>
                                </div>
                            </div>
                        </div>

                        {/* Third Place */}
                        <div className="neo-card bg-orange-100 order-3 transform md:translate-y-8" data-testid="rank-3">
                            <div className="text-center">
                                <div className="w-14 h-14 mx-auto bg-orange-400 border-4 border-black flex items-center justify-center mb-4">
                                    <Medal className="w-7 h-7" />
                                </div>
                                <div className="font-bold text-xl text-orange-600">#3</div>
                                <h3 className="font-heading font-bold text-lg">{leaderboard[2]?.name}</h3>
                                <p className="text-sm text-gray-600">{leaderboard[2]?.register_number}</p>
                                <p className="text-sm text-gray-500 mt-1">
                                    {DEPARTMENTS.find(d => d.value === leaderboard[2]?.department)?.label}
                                </p>
                                <div className="mt-4 bg-orange-400 border-2 border-black px-4 py-2 inline-block">
                                    <span className="font-bold text-xl">{leaderboard[2]?.cumulative_score?.toFixed(2)}</span>
                                    <span className="text-sm ml-1">pts</span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Leaderboard Table */}
                {loading ? (
                    <div className="neo-card text-center py-12">
                        <div className="loading-spinner mx-auto"></div>
                        <p className="mt-4">Loading leaderboard...</p>
                    </div>
                ) : leaderboard.length === 0 ? (
                    <div className="neo-card text-center py-12">
                        <Trophy className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                        <h3 className="font-heading font-bold text-xl mb-2">No Leaderboard Data</h3>
                        <p className="text-gray-600">Complete and freeze rounds to see the leaderboard.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="neo-table">
                            <thead>
                                <tr>
                                    <th>Rank</th>
                                    <th>Register No</th>
                                    <th>Name</th>
                                    <th>Department</th>
                                    <th>Year</th>
                                    <th>Rounds</th>
                                    <th>Score</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {leaderboard.map((entry) => (
                                    <tr
                                        key={entry.participant_id}
                                        data-testid={`leaderboard-row-${entry.register_number}`}
                                        className="cursor-pointer hover:bg-secondary"
                                        onClick={() => openLeaderboardModal(entry)}
                                    >
                                        <td>
                                            <span className={`w-8 h-8 inline-flex items-center justify-center border-2 border-black font-bold ${getRankBadge(entry.rank)}`}>
                                                {entry.rank}
                                            </span>
                                        </td>
                                        <td className="font-mono font-bold">{entry.register_number}</td>
                                        <td className="font-medium">{entry.name}</td>
                                        <td className="text-sm">
                                            {DEPARTMENTS.find(d => d.value === entry.department)?.label || entry.department}
                                        </td>
                                        <td className="text-sm">{entry.year_of_study}</td>
                                        <td>
                                            <span className="bg-secondary px-2 py-1 border border-black font-bold">
                                                {entry.rounds_participated}
                                            </span>
                                        </td>
                                        <td>
                                            <span className="bg-primary text-white px-3 py-1 border-2 border-black font-bold">
                                                {entry.cumulative_score?.toFixed(2)}
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
            </main>

            <Dialog open={Boolean(selectedEntry)} onOpenChange={() => setSelectedEntry(null)}>
                <DialogContent className="max-w-3xl bg-white">
                    {selectedEntry ? (
                        <>
                            <DialogHeader>
                                <DialogTitle className="text-2xl font-heading font-black">Leaderboard Entry</DialogTitle>
                                <p className="text-sm text-gray-600">Profile + round stats snapshot.</p>
                            </DialogHeader>
                            <div className="grid gap-6 md:grid-cols-[0.9fr_1.1fr]">
                                <div className="rounded-2xl border-2 border-black bg-[#fff3cc] p-5">
                                    <div className="flex flex-col items-center text-center gap-3">
                                        {selectedEntry.profile_picture ? (
                                            <img
                                                src={getProfileImageUrl(selectedEntry)}
                                                alt={selectedEntry.name}
                                                className="h-28 w-28 rounded-full border-4 border-black object-cover"
                                            />
                                        ) : (
                                            <div className="h-28 w-28 rounded-full border-4 border-black bg-white text-3xl font-bold flex items-center justify-center">
                                                {selectedEntry.name?.charAt(0)?.toUpperCase() || '?'}
                                            </div>
                                        )}
                                        <div>
                                            <h3 className="font-heading font-bold text-xl">{selectedEntry.name}</h3>
                                            <p className="text-sm text-gray-700">{selectedEntry.register_number}</p>
                                        </div>
                                        <div className="w-full text-left space-y-2 text-sm">
                                            <div className="flex justify-between">
                                                <span className="font-semibold">Department</span>
                                                <span>{DEPARTMENTS.find(d => d.value === selectedEntry.department)?.label || selectedEntry.department}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="font-semibold">Year</span>
                                                <span>{selectedEntry.year_of_study}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="font-semibold">Status</span>
                                                <span>{selectedEntry.status}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="font-semibold">Cumulative</span>
                                                <span>{selectedEntry.cumulative_score?.toFixed(2)}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="font-semibold">Rounds</span>
                                                <span>{selectedEntry.rounds_participated}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="rounded-2xl border-2 border-black bg-white p-5">
                                    <div className="flex items-center justify-between mb-4">
                                        <h4 className="font-heading font-bold text-lg">Round Stats</h4>
                                        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
                                            {roundStats.length} rounds
                                        </span>
                                    </div>
                                    {roundStatsLoading ? (
                                        <div className="text-sm text-gray-600">Loading round stats...</div>
                                    ) : roundStatsError ? (
                                        <div className="text-sm text-red-600">{roundStatsError}</div>
                                    ) : roundStats.length === 0 ? (
                                        <div className="text-sm text-gray-600">No rounds yet.</div>
                                    ) : (
                                        <div className="space-y-3">
                                            {roundStats.map((round) => (
                                                <details key={round.round_id} className="rounded-xl border border-black/10 bg-[#fff8e1] px-4 py-3">
                                                    <summary className="flex cursor-pointer list-none items-center justify-between">
                                                        <div>
                                                            <p className="text-xs uppercase tracking-[0.2em] text-gray-500">
                                                                {round.round_no} · {round.round_state}
                                                            </p>
                                                            <p className="font-semibold">{round.round_name}</p>
                                                        </div>
                                                        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-700">
                                                            {round.status}
                                                        </span>
                                                    </summary>
                                                    <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-gray-700">
                                                        <div>Present: {round.is_present === null ? '—' : round.is_present ? 'Yes' : 'No'}</div>
                                                        <div>Total Score: {round.total_score ?? '—'}</div>
                                                        <div>Actual Score: {round.normalized_score ?? '—'}</div>
                                                        <div></div>
                                                    </div>
                                                </details>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </>
                    ) : null}
                </DialogContent>
            </Dialog>
        </div>
    );
}
