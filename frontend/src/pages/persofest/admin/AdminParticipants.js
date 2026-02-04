import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import axios from 'axios';
import { toast } from 'sonner';
import { 
    Users, Search, Filter, LogOut, Sparkles, LayoutDashboard, Calendar,
    Trophy, UserCheck, UserX, Download
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

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
const GENDERS = ["Male", "Female"];
const STATUSES = ["Active", "Eliminated"];

export default function AdminParticipants() {
    const navigate = useNavigate();
    const { logout, getAuthHeader } = useAuth();
    const [participants, setParticipants] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedParticipant, setSelectedParticipant] = useState(null);
    const [roundStats, setRoundStats] = useState([]);
    const [roundStatsLoading, setRoundStatsLoading] = useState(false);
    const [roundStatsError, setRoundStatsError] = useState('');
    const [filters, setFilters] = useState({
        department: '',
        year: '',
        gender: '',
        status: '',
        search: ''
    });

    const fetchParticipants = useCallback(async () => {
        try {
            const params = new URLSearchParams();
            if (filters.department) params.append('department', filters.department);
            if (filters.year) params.append('year', filters.year);
            if (filters.gender) params.append('gender', filters.gender);
            if (filters.status) params.append('status', filters.status);
            if (filters.search) params.append('search', filters.search);

            const response = await axios.get(`${API}/admin/participants?${params.toString()}`, {
                headers: getAuthHeader()
            });
            setParticipants(response.data);
        } catch (error) {
            toast.error('Failed to load participants');
        } finally {
            setLoading(false);
        }
    }, [filters, getAuthHeader]);

    useEffect(() => {
        fetchParticipants();
    }, [fetchParticipants]);

    const handleStatusChange = async (participantId, newStatus) => {
        try {
            await axios.put(
                `${API}/admin/participants/${participantId}/status?new_status=${newStatus}`,
                {},
                { headers: getAuthHeader() }
            );
            toast.success('Status updated');
            fetchParticipants();
        } catch (error) {
            toast.error('Failed to update status');
        }
    };

    const handleExport = async (format) => {
        try {
            const params = new URLSearchParams();
            params.append('format', format);
            if (filters.department) params.append('department', filters.department);
            if (filters.year) params.append('year', filters.year);
            if (filters.status) params.append('status', filters.status);

            const response = await axios.get(`${API}/admin/export/participants?${params.toString()}`, {
                headers: getAuthHeader(),
                responseType: 'blob'
            });

            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `participants.${format}`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);

            toast.success('Export successful');
        } catch (error) {
            toast.error('Export failed');
        }
    };

    const clearFilters = () => {
        setFilters({
            department: '',
            year: '',
            gender: '',
            status: '',
            search: ''
        });
    };

    const handleLogout = () => {
        logout();
        navigate('/');
    };

    const getProfileImageUrl = (participant) => {
        if (!participant?.profile_picture) return null;
        if (participant.profile_picture.startsWith('http')) return participant.profile_picture;
        return `${process.env.REACT_APP_BACKEND_URL}${participant.profile_picture}`;
    };

    const openParticipantModal = async (participant) => {
        setSelectedParticipant(participant);
        setRoundStats([]);
        setRoundStatsError('');
        setRoundStatsLoading(true);
        try {
            const response = await axios.get(`${API}/admin/participants/${participant.id}/rounds`, {
                headers: getAuthHeader()
            });
            setRoundStats(response.data || []);
        } catch (error) {
            setRoundStatsError('Failed to load round stats');
        } finally {
            setRoundStatsLoading(false);
        }
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
            <nav className="bg-white border-b-2 border-black overflow-x-auto">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex gap-1">
                        <Link to="/admin" className="px-4 py-3 font-bold text-sm hover:bg-muted transition-colors">
                            <LayoutDashboard className="w-4 h-4 inline mr-2" />Dashboard
                        </Link>
                        <Link to="/admin/rounds" className="px-4 py-3 font-bold text-sm hover:bg-muted transition-colors">
                            <Calendar className="w-4 h-4 inline mr-2" />Rounds
                        </Link>
                        <Link to="/admin/participants" className="px-4 py-3 font-bold text-sm border-b-4 border-primary bg-secondary">
                            <Users className="w-4 h-4 inline mr-2" />Participants
                        </Link>
                        <Link to="/admin/leaderboard" className="px-4 py-3 font-bold text-sm hover:bg-muted transition-colors">
                            <Trophy className="w-4 h-4 inline mr-2" />Leaderboard
                        </Link>
                    </div>
                </div>
            </nav>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Header & Filters */}
                <div className="neo-card mb-6">
                    <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6">
                        <div>
                            <h1 className="font-heading font-bold text-3xl">Participants</h1>
                            <p className="text-gray-600">{participants.length} participants found</p>
                        </div>
                        <div className="flex gap-2">
                            <Button
                                onClick={() => handleExport('csv')}
                                variant="outline"
                                className="border-2 border-black shadow-neo hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none"
                                data-testid="export-csv-btn"
                            >
                                <Download className="w-4 h-4 mr-2" /> CSV
                            </Button>
                            <Button
                                onClick={() => handleExport('xlsx')}
                                variant="outline"
                                className="border-2 border-black shadow-neo hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none"
                                data-testid="export-xlsx-btn"
                            >
                                <Download className="w-4 h-4 mr-2" /> Excel
                            </Button>
                        </div>
                    </div>

                    {/* Filters */}
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                        <div className="relative col-span-2 md:col-span-3 lg:col-span-2">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                            <Input
                                placeholder="Search by name, register no, email..."
                                value={filters.search}
                                onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                                className="neo-input pl-10"
                                data-testid="search-input"
                            />
                        </div>

                        <Select value={filters.department} onValueChange={(value) => setFilters(prev => ({ ...prev, department: value }))}>
                            <SelectTrigger className="neo-input" data-testid="filter-department">
                                <SelectValue placeholder="Department" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Departments</SelectItem>
                                {DEPARTMENTS.map(d => (
                                    <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <Select value={filters.year} onValueChange={(value) => setFilters(prev => ({ ...prev, year: value }))}>
                            <SelectTrigger className="neo-input" data-testid="filter-year">
                                <SelectValue placeholder="Year" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Years</SelectItem>
                                {YEARS.map(y => (
                                    <SelectItem key={y} value={y}>{y}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <Select value={filters.gender} onValueChange={(value) => setFilters(prev => ({ ...prev, gender: value }))}>
                            <SelectTrigger className="neo-input" data-testid="filter-gender">
                                <SelectValue placeholder="Gender" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Genders</SelectItem>
                                {GENDERS.map(g => (
                                    <SelectItem key={g} value={g}>{g}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <Select value={filters.status} onValueChange={(value) => setFilters(prev => ({ ...prev, status: value }))}>
                            <SelectTrigger className="neo-input" data-testid="filter-status">
                                <SelectValue placeholder="Status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Statuses</SelectItem>
                                {STATUSES.map(s => (
                                    <SelectItem key={s} value={s}>{s}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {(filters.department || filters.year || filters.gender || filters.status || filters.search) && (
                        <Button
                            onClick={clearFilters}
                            variant="outline"
                            size="sm"
                            className="mt-4 border-2 border-black"
                        >
                            <Filter className="w-4 h-4 mr-2" /> Clear Filters
                        </Button>
                    )}
                </div>

                {/* Participants Table */}
                {loading ? (
                    <div className="neo-card text-center py-12">
                        <div className="loading-spinner mx-auto"></div>
                        <p className="mt-4">Loading participants...</p>
                    </div>
                ) : participants.length === 0 ? (
                    <div className="neo-card text-center py-12">
                        <Users className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                        <h3 className="font-heading font-bold text-xl mb-2">No Participants Found</h3>
                        <p className="text-gray-600">No participants match your filters.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="neo-table">
                            <thead>
                                <tr>
                                    <th>Register No</th>
                                    <th>Name</th>
                                    <th>Email</th>
                                    <th>Department</th>
                                    <th>Year</th>
                                    <th>Gender</th>
                                    <th>Referrals</th>
                                    <th>Status</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {participants.map(participant => (
                                    <tr
                                        key={participant.id}
                                        data-testid={`participant-row-${participant.register_number}`}
                                        className="cursor-pointer hover:bg-secondary"
                                        onClick={() => openParticipantModal(participant)}
                                    >
                                        <td className="font-mono font-bold">{participant.register_number}</td>
                                        <td className="font-medium">{participant.name}</td>
                                        <td className="text-sm">{participant.email}</td>
                                        <td className="text-sm">
                                            {DEPARTMENTS.find(d => d.value === participant.department)?.label || participant.department}
                                        </td>
                                        <td className="text-sm">{participant.year_of_study}</td>
                                        <td className="text-sm">{participant.gender}</td>
                                        <td>
                                            <span className="bg-accent px-2 py-1 border border-black font-bold text-sm">
                                                {participant.referral_count}
                                            </span>
                                        </td>
                                        <td>
                                            <span className={`tag border-2 ${participant.status === 'Active' ? 'bg-green-100 text-green-800 border-green-500' : 'bg-red-100 text-red-800 border-red-500'}`}>
                                                {participant.status}
                                            </span>
                                        </td>
                                        <td>
                                            {participant.status === 'Active' ? (
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        handleStatusChange(participant.id, 'Eliminated');
                                                    }}
                                                    className="border-2 border-black text-red-500"
                                                    data-testid={`eliminate-${participant.register_number}`}
                                                >
                                                    <UserX className="w-4 h-4" />
                                                </Button>
                                            ) : (
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        handleStatusChange(participant.id, 'Active');
                                                    }}
                                                    className="border-2 border-black text-green-500"
                                                    data-testid={`activate-${participant.register_number}`}
                                                >
                                                    <UserCheck className="w-4 h-4" />
                                                </Button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </main>

            <Dialog open={Boolean(selectedParticipant)} onOpenChange={() => setSelectedParticipant(null)}>
                <DialogContent className="max-w-3xl bg-white">
                    {selectedParticipant ? (
                        <>
                            <DialogHeader>
                                <DialogTitle className="text-2xl font-heading font-black">Participant Details</DialogTitle>
                                <p className="text-sm text-gray-600">Profile + round stats snapshot.</p>
                            </DialogHeader>
                            <div className="grid gap-6 md:grid-cols-[0.9fr_1.1fr]">
                                <div className="rounded-2xl border-2 border-black bg-[#fff3cc] p-5">
                                    <div className="flex flex-col items-center text-center gap-3">
                                        {selectedParticipant.profile_picture ? (
                                            <img
                                                src={getProfileImageUrl(selectedParticipant)}
                                                alt={selectedParticipant.name}
                                                className="h-28 w-28 rounded-full border-4 border-black object-cover"
                                            />
                                        ) : (
                                            <div className="h-28 w-28 rounded-full border-4 border-black bg-white text-3xl font-bold flex items-center justify-center">
                                                {selectedParticipant.name?.charAt(0)?.toUpperCase() || '?'}
                                            </div>
                                        )}
                                        <div>
                                            <h3 className="font-heading font-bold text-xl">{selectedParticipant.name}</h3>
                                            <p className="text-sm text-gray-700">{selectedParticipant.register_number}</p>
                                            <p className="text-sm text-gray-700">{selectedParticipant.email}</p>
                                        </div>
                                        <div className="w-full text-left space-y-2 text-sm">
                                            <div className="flex justify-between">
                                                <span className="font-semibold">Department</span>
                                                <span>{DEPARTMENTS.find(d => d.value === selectedParticipant.department)?.label || selectedParticipant.department}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="font-semibold">Year</span>
                                                <span>{selectedParticipant.year_of_study}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="font-semibold">Gender</span>
                                                <span>{selectedParticipant.gender}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="font-semibold">Status</span>
                                                <span>{selectedParticipant.status}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="font-semibold">Referrals</span>
                                                <span>{selectedParticipant.referral_count}</span>
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
                                                        <div>Score: {round.total_score ?? '—'}</div>
                                                        <div>Normalized: {round.normalized_score ?? '—'}</div>
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
