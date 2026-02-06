import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import axios from 'axios';
import { toast } from 'sonner';
import { Save, Lock, ArrowLeft, Search, LogOut, Sparkles, LayoutDashboard, Calendar, Users, Trophy, AlertTriangle, Upload, Download, FileSpreadsheet, ListChecks } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function AdminScoring() {
    const { roundId } = useParams();
    const navigate = useNavigate();
    const { user, logout, getAuthHeader } = useAuth();
    const [round, setRound] = useState(null);
    const [participants, setParticipants] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [importing, setImporting] = useState(false);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [presenceFilter, setPresenceFilter] = useState('all');
    const [sortBy, setSortBy] = useState('register_asc');
    const [freezeDialogOpen, setFreezeDialogOpen] = useState(false);
    const fileInputRef = useRef(null);
    const isSuperAdmin = user?.is_superadmin;

    const roundRankMap = (() => {
        const map = {};
        if (!round?.is_frozen) return map;
        const scored = participants
            .filter((p) => p.is_present)
            .slice()
            .sort((a, b) => (Number(b.normalized_score || 0) - Number(a.normalized_score || 0)));
        scored.forEach((p, idx) => {
            const pid = p.participant_id ?? p.id;
            if (pid != null) map[pid] = idx + 1;
        });
        return map;
    })();

    const getTotalScore = useCallback((participant) => {
        return (round?.evaluation_criteria || []).reduce((sum, c) => {
            const parsed = Number.parseFloat(participant?.criteria_scores?.[c.name]);
            return sum + (Number.isNaN(parsed) ? 0 : parsed);
        }, 0);
    }, [round]);

    const displayedParticipants = useMemo(() => {
        const filtered = participants.filter((p) => {
            if (statusFilter !== 'all') {
                if (statusFilter === 'active' && p.participant_status !== 'Active') return false;
                if (statusFilter === 'eliminated' && p.participant_status !== 'Eliminated') return false;
            }
            if (presenceFilter !== 'all') {
                if (presenceFilter === 'present' && !p.is_present) return false;
                if (presenceFilter === 'absent' && p.is_present) return false;
            }
            return true;
        });

        const sorted = filtered.slice().sort((a, b) => {
            const regA = String(a.participant_register_number || a.register_number || '');
            const regB = String(b.participant_register_number || b.register_number || '');
            const nameA = String(a.participant_name || a.name || '');
            const nameB = String(b.participant_name || b.name || '');
            const scoreA = getTotalScore(a);
            const scoreB = getTotalScore(b);
            const rankA = Number(roundRankMap[a.participant_id ?? a.id] || Number.MAX_SAFE_INTEGER);
            const rankB = Number(roundRankMap[b.participant_id ?? b.id] || Number.MAX_SAFE_INTEGER);

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

        return sorted;
    }, [participants, statusFilter, presenceFilter, sortBy, getTotalScore, roundRankMap]);

    const fetchRoundData = useCallback(async () => {
        try {
            const [roundRes, participantsRes] = await Promise.all([
                axios.get(`${API}/persofest/admin/rounds`, { headers: getAuthHeader() }),
                axios.get(`${API}/persofest/admin/rounds/${roundId}/participants${search ? `?search=${search}` : ''}`, { headers: getAuthHeader() })
            ]);
            const currentRound = roundRes.data.find(r => r.id === parseInt(roundId));
            setRound(currentRound);
            setParticipants(participantsRes.data);
        } catch (error) {
            toast.error('Failed to load round data');
        } finally {
            setLoading(false);
        }
    }, [getAuthHeader, roundId, search]);

    useEffect(() => { fetchRoundData(); }, [fetchRoundData]);

    const handleSearch = async () => {
        try {
            const response = await axios.get(`${API}/persofest/admin/rounds/${roundId}/participants?search=${search}`, { headers: getAuthHeader() });
            setParticipants(response.data);
        } catch (error) {
            toast.error('Search failed');
        }
    };

    const handlePresenceChange = (participantId, isPresent) => {
        const present = isPresent === true;
        setParticipants(prev => prev.map((p) => {
            const pid = p.participant_id ?? p.id;
            if (pid !== participantId) return p;

            // When marked absent, wipe all criteria scores immediately in UI.
            if (!present) {
                const zeroed = Object.fromEntries(
                    (round?.evaluation_criteria || []).map((c) => [c.name, 0])
                );
                return { ...p, is_present: false, criteria_scores: zeroed };
            }

            return { ...p, is_present: true };
        }));
    };

    const handleScoreChange = (participantId, criteriaName, value) => {
        if (!/^$|^\d*\.?\d*$/.test(value)) return;
        setParticipants(prev => prev.map((p) => {
            const pid = p.participant_id ?? p.id;
            if (pid === participantId) {
                const criteria_scores = { ...p.criteria_scores, [criteriaName]: value };
                return { ...p, criteria_scores };
            }
            return p;
        }));
    };

    const handleScoreBlur = (participantId, criteriaName) => {
        const maxMarks = Number((round?.evaluation_criteria || []).find((c) => c.name === criteriaName)?.max_marks ?? 100);
        setParticipants((prev) => prev.map((p) => {
            const pid = p.participant_id ?? p.id;
            if (pid !== participantId) return p;
            const raw = p.criteria_scores?.[criteriaName];
            const parsed = Number.parseFloat(raw);
            const clamped = Number.isNaN(parsed) ? 0 : Math.min(Math.max(parsed, 0), maxMarks);
            return {
                ...p,
                criteria_scores: { ...p.criteria_scores, [criteriaName]: clamped }
            };
        }));
    };

    const saveScores = async () => {
        setSaving(true);
        try {
            const maxByCriteria = Object.fromEntries((criteria || []).map((c) => [c.name, Number(c.max_marks || 0)]));
            const scores = participants
                .map(p => ({
                participant_id: p.participant_id ?? p.id,
                criteria_scores: Object.keys(maxByCriteria).reduce((acc, cname) => {
                    const max = maxByCriteria[cname];
                    const parsed = Number.parseFloat(p.criteria_scores?.[cname]);
                    const safe = Number.isNaN(parsed) ? 0 : Math.min(Math.max(parsed, 0), max);
                    acc[cname] = safe;
                    return acc;
                }, {}),
                is_present: Boolean(p.is_present)
            }))
                .filter((row) => row.participant_id != null);
            await axios.post(`${API}/persofest/admin/rounds/${roundId}/scores`, scores, { headers: getAuthHeader() });
            toast.success('Scores saved successfully');
            fetchRoundData();
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Failed to save scores');
        } finally {
            setSaving(false);
        }
    };

    const downloadTemplate = async () => {
        try {
            const response = await axios.get(`${API}/persofest/admin/rounds/${roundId}/score-template`, {
                headers: getAuthHeader(),
                responseType: 'blob'
            });
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `${round?.round_no || 'round'}_score_template.xlsx`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            toast.success('Template downloaded');
        } catch (error) {
            toast.error('Failed to download template');
        }
    };

    const handleFileUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setImporting(true);
        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await axios.post(`${API}/persofest/admin/rounds/${roundId}/import-scores`, formData, {
                headers: { ...getAuthHeader(), 'Content-Type': 'multipart/form-data' }
            });
            toast.success(response.data.message);
            if (response.data.errors?.length > 0) {
                response.data.errors.forEach(err => toast.error(err));
            }
            fetchRoundData();
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Import failed');
        } finally {
            setImporting(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const exportRoundEvaluation = async () => {
        try {
            const response = await axios.get(`${API}/persofest/admin/export/round/${roundId}?format=xlsx`, {
                headers: getAuthHeader(),
                responseType: 'blob'
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
            toast.error('Failed to export round evaluation');
        }
    };

    const freezeRound = async () => {
        try {
            await axios.post(`${API}/persofest/admin/rounds/${roundId}/freeze`, {}, { headers: getAuthHeader() });
            toast.success('Round frozen');
            setFreezeDialogOpen(false);
            fetchRoundData();
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Failed to freeze round');
        }
    };

    const unfreezeRound = async () => {
        try {
            await axios.post(`${API}/persofest/admin/rounds/${roundId}/unfreeze`, {}, { headers: getAuthHeader() });
            toast.success('Round unfrozen');
            fetchRoundData();
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Failed to unfreeze round');
        }
    };

    const handleLogout = () => { logout(); navigate('/'); };

    if (loading) {
        return (
            <div className="min-h-screen bg-muted flex items-center justify-center">
                <div className="neo-card"><div className="loading-spinner mx-auto"></div><p className="mt-4">Loading...</p></div>
            </div>
        );
    }

    if (!round) {
        return (
            <div className="min-h-screen bg-muted flex items-center justify-center">
                <div className="neo-card text-center">
                    <AlertTriangle className="w-16 h-16 mx-auto mb-4 text-red-500" />
                    <h2 className="font-heading font-bold text-xl mb-4">Round Not Found</h2>
                    <Link to="/persofest/admin/rounds"><Button className="bg-primary text-white border-2 border-black shadow-neo"><ArrowLeft className="w-4 h-4 mr-2" /> Back</Button></Link>
                </div>
            </div>
        );
    }

    const criteria = round.evaluation_criteria || [];

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
                {/* Header */}
                <div className="neo-card mb-6">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div className="flex items-center gap-4">
                            <Link to="/persofest/admin/rounds"><Button variant="outline" className="border-2 border-black"><ArrowLeft className="w-4 h-4" /></Button></Link>
                            <div>
                                <div className="flex items-center gap-2">
                                    <span className="bg-primary text-white px-2 py-1 border-2 border-black font-bold text-sm">{round.round_no}</span>
                                    {round.is_frozen && <span className="bg-orange-100 text-orange-800 px-2 py-1 border-2 border-orange-500 font-bold text-sm flex items-center gap-1"><Lock className="w-4 h-4" /> Frozen</span>}
                                </div>
                                <h1 className="font-heading font-bold text-2xl mt-2">{round.name}</h1>
                            </div>
                        </div>

                        {!round.is_frozen ? (
                            <div className="flex flex-wrap gap-2">
                                <Button onClick={downloadTemplate} variant="outline" className="border-2 border-black shadow-neo" data-testid="download-template-btn">
                                    <Download className="w-4 h-4 mr-2" /> Template
                                </Button>
                                <input type="file" ref={fileInputRef} accept=".xlsx,.xls" onChange={handleFileUpload} className="hidden" />
                                <Button onClick={() => fileInputRef.current?.click()} disabled={importing} variant="outline" className="border-2 border-black shadow-neo bg-green-50" data-testid="import-scores-btn">
                                    <Upload className="w-4 h-4 mr-2" /> {importing ? 'Importing...' : 'Import Excel'}
                                </Button>
                                <Button onClick={saveScores} disabled={saving} className="bg-primary text-white border-2 border-black shadow-neo" data-testid="save-scores-btn">
                                    <Save className="w-4 h-4 mr-2" /> {saving ? 'Saving...' : 'Save'}
                                </Button>
                                <Dialog open={freezeDialogOpen} onOpenChange={setFreezeDialogOpen}>
                                    <DialogTrigger asChild>
                                        <Button className="bg-orange-500 text-white border-2 border-black shadow-neo" data-testid="freeze-round-btn">
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
                                                <Button onClick={freezeRound} className="flex-1 bg-orange-500 text-white border-2 border-black"><Lock className="w-4 h-4 mr-2" /> Confirm</Button>
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
                                {isSuperAdmin && (
                                    <Button onClick={unfreezeRound} className="bg-orange-500 text-white border-2 border-black shadow-neo">
                                        <Lock className="w-4 h-4 mr-2" /> Unfreeze
                                    </Button>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Bulk Import Info */}
                {!round.is_frozen && (
                    <div className="neo-card mb-6 bg-blue-50 border-blue-500">
                        <div className="flex items-start gap-4">
                            <FileSpreadsheet className="w-8 h-8 text-blue-600 flex-shrink-0" />
                            <div>
                                <h3 className="font-heading font-bold text-lg">Bulk Score Import</h3>
                                <p className="text-gray-600 text-sm">1. Download the template with participant list → 2. Fill in scores → 3. Upload the Excel file</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Search */}
                <div className="neo-card mb-6">
                    <div className="flex gap-2 mb-4">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                            <Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleSearch()} className="neo-input pl-10" />
                        </div>
                        <Button onClick={handleSearch} className="bg-primary text-white border-2 border-black shadow-neo">Search</Button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger className="neo-input">
                                <SelectValue placeholder="Filter by status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Status</SelectItem>
                                <SelectItem value="active">Active</SelectItem>
                                <SelectItem value="eliminated">Eliminated</SelectItem>
                            </SelectContent>
                        </Select>
                        <Select value={presenceFilter} onValueChange={setPresenceFilter}>
                            <SelectTrigger className="neo-input">
                                <SelectValue placeholder="Filter by presence" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Presence</SelectItem>
                                <SelectItem value="present">Present</SelectItem>
                                <SelectItem value="absent">Absent</SelectItem>
                            </SelectContent>
                        </Select>
                        <Select value={sortBy} onValueChange={setSortBy}>
                            <SelectTrigger className="neo-input">
                                <SelectValue placeholder="Sort candidates" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="register_asc">Reg No (Asc)</SelectItem>
                                <SelectItem value="register_desc">Reg No (Desc)</SelectItem>
                                <SelectItem value="name_asc">Name (A-Z)</SelectItem>
                                <SelectItem value="name_desc">Name (Z-A)</SelectItem>
                                <SelectItem value="score_desc">Score (High-Low)</SelectItem>
                                <SelectItem value="score_asc">Score (Low-High)</SelectItem>
                                {round?.is_frozen ? <SelectItem value="rank_asc">Rank (Top-Down)</SelectItem> : null}
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                {/* Scoring Table */}
                {displayedParticipants.length === 0 ? (
                    <div className="neo-card text-center py-12">
                        <Users className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                        <h3 className="font-heading font-bold text-xl">No Candidates Match Current Filters</h3>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="neo-table">
                            <thead>
                                <tr>
                                    <th>Register No</th>
                                    <th>Name</th>
                                    <th>Round Status</th>
                                    <th>Present</th>
                                    {criteria.map((c, idx) => <th key={`${c.name}-${idx}`}>{c.name} (/{c.max_marks})</th>)}
                                    <th>Total</th>
                                    <th>Round Score</th>
                                    {round?.is_frozen && <th>Round Rank</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {displayedParticipants.map(p => {
                                    const rowKey = p.participant_id ?? p.id ?? p.participant_register_number;
                                    const totalScore = getTotalScore(p);
                                    const maxScore = criteria.reduce((sum, c) => sum + c.max_marks, 0);
                                    const normalized = maxScore > 0 ? (totalScore / maxScore * 100).toFixed(2) : 0;
                                    const roundRank = round?.is_frozen ? (roundRankMap[rowKey] || '—') : null;
                                    const registerNumber = p.participant_register_number || p.register_number || '—';
                                    const participantName = p.participant_name || p.name || '—';
                                    const roundStatus = !p.is_present
                                        ? 'Absent'
                                        : (p.participant_status === 'Eliminated' ? 'Eliminated' : 'Active');
                                    const roundStatusClass = roundStatus === 'Active'
                                        ? 'bg-green-100 text-green-800 border-green-500'
                                        : (roundStatus === 'Eliminated'
                                            ? 'bg-red-100 text-red-800 border-red-500'
                                            : 'bg-orange-100 text-orange-800 border-orange-500');
                                    return (
                                        <tr key={`${rowKey}-${registerNumber}`}>
                                            <td className="font-mono font-bold">{registerNumber}</td>
                                            <td className="font-medium">{participantName}</td>
                                            <td>
                                                <span className={`tag border-2 ${roundStatusClass}`}>
                                                    {roundStatus}
                                                </span>
                                            </td>
                                            <td>
                                                <Checkbox checked={Boolean(p.is_present)} onCheckedChange={(c) => handlePresenceChange(rowKey, c)} disabled={round.is_frozen} className="border-2 border-black data-[state=checked]:bg-primary" />
                                            </td>
                                            {criteria.map((c, idx) => (
                                                <td key={`${c.name}-${idx}`}>
                                                    <Input type="number" value={p.criteria_scores?.[c.name] ?? ''} onChange={(e) => handleScoreChange(rowKey, c.name, e.target.value)} onBlur={() => handleScoreBlur(rowKey, c.name)} disabled={round.is_frozen || !p.is_present} className="neo-input w-20" min={0} max={c.max_marks} />
                                                </td>
                                            ))}
                                            <td className="font-bold">{totalScore}</td>
                                            <td><span className="bg-primary text-white px-2 py-1 border-2 border-black font-bold">{normalized}</span></td>
                                            {round?.is_frozen && <td className="font-bold">{roundRank}</td>}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </main>
        </div>
    );
}
