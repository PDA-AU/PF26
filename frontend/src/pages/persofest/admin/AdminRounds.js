import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import axios from 'axios';
import { toast } from 'sonner';
import { Calendar, Plus, Edit2, Trash2, Play, Lock, LogOut, Sparkles, LayoutDashboard, Users, Trophy, ChevronRight, X, ListChecks } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import RoundStatsCard from './RoundStatsCard';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const STATS_CACHE_TTL_MS = 10 * 60 * 1000;
const createCriterion = (name = '', maxMarks = 0) => ({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    max_marks: maxMarks
});

const getStatsCacheKey = (roundId) => `pf26_round_stats_${roundId}`;

const loadCachedStats = (roundId) => {
    try {
        const raw = localStorage.getItem(getStatsCacheKey(roundId));
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed.ts !== 'number' || !parsed.data) return null;
        if (Date.now() - parsed.ts > STATS_CACHE_TTL_MS) return null;
        return parsed.data;
    } catch (error) {
        return null;
    }
};

const saveCachedStats = (roundId, data) => {
    try {
        localStorage.setItem(getStatsCacheKey(roundId), JSON.stringify({
            ts: Date.now(),
            data
        }));
    } catch (error) {
        // ignore storage errors
    }
};

export default function AdminRounds() {
    const navigate = useNavigate();
    const { user, logout, getAuthHeader } = useAuth();
    const isSuperAdmin = user?.is_superadmin;
    const [rounds, setRounds] = useState([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingRound, setEditingRound] = useState(null);
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [date, setDate] = useState('');
    const [mode, setMode] = useState('Offline');
    const [conductedBy, setConductedBy] = useState('');
    const [criteria, setCriteria] = useState([createCriterion('Overall', 100)]);
    const [roundPdfFile, setRoundPdfFile] = useState(null);
    const [roundStats, setRoundStats] = useState({});
    const roundStatsRef = useRef({});

    const fetchRounds = useCallback(async () => {
        try {
            const response = await axios.get(`${API}/persofest/admin/rounds`, { headers: getAuthHeader() });
            setRounds(response.data);
        } catch (error) {
            toast.error('Failed to load rounds');
        } finally {
            setLoading(false);
        }
    }, [getAuthHeader]);

    useEffect(() => { fetchRounds(); }, [fetchRounds]);

    useEffect(() => {
        if (!rounds || rounds.length === 0) return;
        const completedRounds = rounds.filter((r) => r.state === 'Completed');
        const roundsToFetch = completedRounds.filter((r) => !roundStatsRef.current[r.id]);
        if (roundsToFetch.length === 0) return;

        const fetchStats = async (roundId) => {
            try {
                const cached = loadCachedStats(roundId);
                if (cached) {
                    setRoundStats((prev) => {
                        const next = {
                            ...prev,
                            [roundId]: { loading: false, error: null, stats: cached }
                        };
                        roundStatsRef.current = next;
                        return next;
                    });
                    return;
                }
                const response = await axios.get(`${API}/persofest/admin/rounds/${roundId}/stats`, {
                    headers: getAuthHeader()
                });
                setRoundStats((prev) => {
                    const next = {
                        ...prev,
                        [roundId]: {
                            loading: false,
                            error: null,
                            stats: response.data
                        }
                    };
                    roundStatsRef.current = next;
                    return next;
                });
                saveCachedStats(roundId, response.data);
            } catch (error) {
                setRoundStats((prev) => {
                    const next = {
                        ...prev,
                        [roundId]: { loading: false, error: 'Failed to load stats', stats: null }
                    };
                    roundStatsRef.current = next;
                    return next;
                });
            }
        };

        roundsToFetch.forEach((r) => {
            setRoundStats((prev) => {
                const next = {
                    ...prev,
                    [r.id]: { loading: true, error: null, stats: null }
                };
                roundStatsRef.current = next;
                return next;
            });
            fetchStats(r.id);
        });
    }, [rounds, getAuthHeader]);

    const resetForm = () => {
        setName('');
        setDescription('');
        setDate('');
        setMode('Offline');
        setConductedBy('');
        setCriteria([createCriterion('Overall', 100)]);
        setRoundPdfFile(null);
        setEditingRound(null);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const cleanedCriteria = criteria
                .map((c) => ({ name: c.name.trim(), max_marks: parseFloat(c.max_marks) || 0 }))
                .filter((c) => c.name);
            const finalCriteria = cleanedCriteria.length > 0 ? cleanedCriteria : [{ name: 'Overall', max_marks: 100 }];
            const payload = {
                name,
                description,
                date: date ? new Date(date).toISOString() : null,
                mode,
                conducted_by: conductedBy,
                evaluation_criteria: finalCriteria
            };

            let savedRound = null;
            if (editingRound) {
                const response = await axios.put(`${API}/persofest/admin/rounds/${editingRound.id}`, payload, { headers: getAuthHeader() });
                savedRound = response.data;
                toast.success('Round updated');
            } else {
                const response = await axios.post(`${API}/persofest/admin/rounds`, payload, { headers: getAuthHeader() });
                savedRound = response.data;
                toast.success('Round created');
            }
            if (roundPdfFile && savedRound) {
                const formData = new FormData();
                formData.append('file', roundPdfFile);
                await axios.post(`${API}/persofest/admin/rounds/${savedRound.id}/description-pdf`, formData, {
                    headers: { ...getAuthHeader(), 'Content-Type': 'multipart/form-data' }
                });
            }
            setDialogOpen(false);
            resetForm();
            fetchRounds();
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Failed to save round');
        }
    };

    const handleEdit = (round) => {
        setEditingRound(round);
        setName(round.name);
        setDescription(round.description || '');
        setDate(round.date ? new Date(round.date).toISOString().split('T')[0] : '');
        setMode(round.mode);
        setConductedBy(round.conducted_by || '');
        setCriteria((round.evaluation_criteria && round.evaluation_criteria.length > 0)
            ? round.evaluation_criteria.map((c) => createCriterion(c.name || '', c.max_marks || 0))
            : [createCriterion('Overall', 100)]
        );
        setRoundPdfFile(null);
        setDialogOpen(true);
    };

    const handleDelete = async (roundId) => {
        if (!window.confirm('Delete this round?')) return;
        try {
            await axios.delete(`${API}/persofest/admin/rounds/${roundId}`, { headers: getAuthHeader() });
            toast.success('Round deleted');
            fetchRounds();
        } catch (error) {
            toast.error('Failed to delete');
        }
    };

    const handleStateChange = async (roundId, newState) => {
        try {
            await axios.put(`${API}/persofest/admin/rounds/${roundId}`, { state: newState }, { headers: getAuthHeader() });
            toast.success(`State changed to ${newState}`);
            fetchRounds();
        } catch (error) {
            toast.error('Failed to update state');
        }
    };

    const handleLogout = () => { logout(); navigate('/'); };

    const getBadgeColor = (state) => {
        if (state === 'Draft') return 'bg-gray-100 text-gray-800';
        if (state === 'Published') return 'bg-blue-100 text-blue-800';
        if (state === 'Active') return 'bg-green-100 text-green-800';
        return 'bg-purple-100 text-purple-800';
    };


    return (
        <div className="min-h-screen bg-muted">
            <header className="bg-primary text-white border-b-4 border-black sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center h-16">
                        <div className="flex items-center gap-4">
                            <Link to="/" className="flex items-center gap-2">
                                <div className="w-10 h-10 bg-white border-2 border-black shadow-neo flex items-center justify-center">
                                    <Sparkles className="w-6 h-6 text-primary" />
                                </div>
                                <span className="font-heading font-black text-xl hidden md:block">PERSOFEST'26</span>
                            </Link>
                            <span className="bg-accent text-black px-2 py-1 border-2 border-black text-xs font-bold">ADMIN</span>
                        </div>
                        <Button variant="outline" onClick={handleLogout} className="bg-white text-black border-2 border-black shadow-neo">
                            <LogOut className="w-5 h-5" />
                        </Button>
                    </div>
                </div>
            </header>

            <nav className="bg-white border-b-2 border-black">
                <div className="max-w-7xl mx-auto px-4">
                    <div className="flex gap-1 sm:gap-1">
                        <Link to="/persofest/admin" aria-label="Dashboard" className="flex-1 sm:flex-none flex items-center justify-center px-2 sm:px-4 py-3 font-bold text-xs sm:text-sm">
                            <LayoutDashboard className="w-5 h-5 sm:w-4 sm:h-4 sm:mr-2" />
                            <span className="hidden sm:inline">Dashboard</span>
                        </Link>
                        <Link to="/persofest/admin/rounds" aria-label="Rounds" className="flex-1 sm:flex-none flex items-center justify-center px-2 sm:px-4 py-3 font-bold text-xs sm:text-sm border-b-4 border-primary bg-secondary">
                            <Calendar className="w-5 h-5 sm:w-4 sm:h-4 sm:mr-2" />
                            <span className="hidden sm:inline">Rounds</span>
                        </Link>
                        <Link to="/persofest/admin/participants" aria-label="Participants" className="flex-1 sm:flex-none flex items-center justify-center px-2 sm:px-4 py-3 font-bold text-xs sm:text-sm">
                            <Users className="w-5 h-5 sm:w-4 sm:h-4 sm:mr-2" />
                            <span className="hidden sm:inline">Participants</span>
                        </Link>
                        <Link to="/persofest/admin/leaderboard" aria-label="Leaderboard" className="flex-1 sm:flex-none flex items-center justify-center px-2 sm:px-4 py-3 font-bold text-xs sm:text-sm">
                            <Trophy className="w-5 h-5 sm:w-4 sm:h-4 sm:mr-2" />
                            <span className="hidden sm:inline">Leaderboard</span>
                        </Link>
                        {isSuperAdmin && (
                            <Link to="/persofest/admin/logs" aria-label="Logs" className="flex-1 sm:flex-none flex items-center justify-center px-2 sm:px-4 py-3 font-bold text-xs sm:text-sm">
                                <ListChecks className="w-5 h-5 sm:w-4 sm:h-4 sm:mr-2" />
                                <span className="hidden sm:inline">Logs</span>
                            </Link>
                        )}
                    </div>
                </div>
            </nav>

            <main className="max-w-7xl mx-auto px-4 py-8">
                <div className="flex justify-between items-center mb-8">
                    <h1 className="font-heading font-bold text-3xl">Round Management</h1>
                    <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
                        <DialogTrigger asChild>
                            <Button className="bg-primary text-white border-2 border-black shadow-neo" data-testid="create-round-btn">
                                <Plus className="w-5 h-5 mr-2" /> Create Round
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="border-4 border-black">
                            <DialogHeader>
                                <DialogTitle className="font-heading font-bold text-2xl">{editingRound ? 'Edit Round' : 'Create Round'}</DialogTitle>
                            </DialogHeader>
                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div>
                                    <Label className="font-bold">Name *</Label>
                                    <Input value={name} onChange={(e) => setName(e.target.value)} required className="neo-input" />
                                </div>
                                <div>
                                    <Label className="font-bold">Description</Label>
                                    <Textarea value={description} onChange={(e) => setDescription(e.target.value)} className="neo-input" />
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
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                                <div>
                                    <Label className="font-bold">Conducted By</Label>
                                    <Input value={conductedBy} onChange={(e) => setConductedBy(e.target.value)} className="neo-input" />
                                </div>
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <Label className="font-bold">Evaluation Criteria</Label>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            className="border-2 border-black"
                                            onClick={() => setCriteria((prev) => [...prev, createCriterion('', 0)])}
                                        >
                                            <Plus className="w-4 h-4 mr-2" /> Add
                                        </Button>
                                    </div>
                                    <div className="space-y-2">
                                        {criteria.map((c) => (
                                            <div key={c.id} className="grid grid-cols-[1fr_120px_auto] gap-2 items-center">
                                                <Input
                                                    value={c.name}
                                                    onChange={(e) => setCriteria((prev) => prev.map((item) => item.id === c.id ? { ...item, name: e.target.value } : item))}
                                                    placeholder="Criteria name"
                                                    className="neo-input"
                                                />
                                                <Input
                                                    type="number"
                                                    value={c.max_marks}
                                                    onChange={(e) => setCriteria((prev) => prev.map((item) => item.id === c.id ? { ...item, max_marks: e.target.value } : item))}
                                                    placeholder="Max marks"
                                                    className="neo-input"
                                                />
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    className="border-2 border-black"
                                                    onClick={() => setCriteria((prev) => prev.length > 1 ? prev.filter((item) => item.id !== c.id) : prev)}
                                                    disabled={criteria.length === 1}
                                                >
                                                    <X className="w-4 h-4" />
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <Label className="font-bold">Round Description PDF</Label>
                                    <Input
                                        type="file"
                                        accept="application/pdf"
                                        className="neo-input"
                                        onChange={(e) => setRoundPdfFile(e.target.files?.[0] || null)}
                                    />
                                </div>
                                <Button type="submit" className="w-full bg-primary text-white border-2 border-black shadow-neo">
                                    {editingRound ? 'Update' : 'Create'}
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
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {rounds.map(round => (
                            <div key={round.id} className="neo-card" data-testid={`round-card-${round.round_no}`}>
                                <div className="flex justify-between mb-4">
                                    <span className="bg-primary text-white px-2 py-1 border-2 border-black font-bold text-sm">{round.round_no}</span>
                                    <span className={`tag border-2 border-black ${getBadgeColor(round.state)}`}>{round.state}</span>
                                </div>
                                <h3 className="font-heading font-bold text-xl mb-2">{round.name}</h3>
                                <p className="text-gray-600 text-sm mb-4">{round.description || 'No description'}</p>
                                <p className="text-sm text-gray-500 mb-4">Mode: {round.mode} | Date: {round.date ? new Date(round.date).toLocaleDateString() : 'TBA'}</p>
                                {round.is_frozen && <p className="text-primary font-bold mb-4"><Lock className="w-4 h-4 inline" /> Frozen</p>}
                                {round.state === 'Completed' && <RoundStatsCard roundId={round.id} statsState={roundStats[round.id]} />}
                                <div className="flex flex-wrap gap-2">
                                    {!round.is_frozen && (
                                        <>
                                            <Button size="sm" variant="outline" onClick={() => handleEdit(round)} className="border-2 border-black"><Edit2 className="w-4 h-4" /></Button>
                                            {round.state === 'Draft' && <Button size="sm" variant="outline" onClick={() => handleDelete(round.id)} className="border-2 border-black text-red-500"><Trash2 className="w-4 h-4" /></Button>}
                                        </>
                                    )}
                                    {round.state === 'Draft' && <Button size="sm" onClick={() => handleStateChange(round.id, 'Published')} className="bg-blue-500 text-white border-2 border-black">Publish</Button>}
                                    {round.state === 'Published' && <Button size="sm" onClick={() => handleStateChange(round.id, 'Active')} className="bg-green-500 text-white border-2 border-black"><Play className="w-4 h-4 mr-1" />Activate</Button>}
                                    {(round.state === 'Active' || round.state === 'Completed') && (
                                        <Link to={`/persofest/admin/scoring/${round.id}`}>
                                            <Button size="sm" className="bg-primary text-white border-2 border-black"><ChevronRight className="w-4 h-4" />Scores</Button>
                                        </Link>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}
