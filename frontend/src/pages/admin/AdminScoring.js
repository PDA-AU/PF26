import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import axios from 'axios';
import { toast } from 'sonner';
import { 
    Save, Lock, ArrowLeft, Search, LogOut, Sparkles, LayoutDashboard,
    Calendar, Users, Trophy, Check, X, AlertTriangle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function AdminScoring() {
    const { roundId } = useParams();
    const navigate = useNavigate();
    const { logout, getAuthHeader } = useAuth();
    const [round, setRound] = useState(null);
    const [participants, setParticipants] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [search, setSearch] = useState('');
    const [freezeDialogOpen, setFreezeDialogOpen] = useState(false);
    const [eliminationConfig, setEliminationConfig] = useState({
        type: 'top_k',
        value: 10
    });

    useEffect(() => {
        fetchRoundData();
    }, [roundId]);

    const fetchRoundData = async () => {
        try {
            const [roundRes, participantsRes] = await Promise.all([
                axios.get(`${API}/admin/rounds`, { headers: getAuthHeader() }),
                axios.get(`${API}/admin/rounds/${roundId}/participants${search ? `?search=${search}` : ''}`, { headers: getAuthHeader() })
            ]);

            const currentRound = roundRes.data.find(r => r.id === parseInt(roundId));
            setRound(currentRound);
            setParticipants(participantsRes.data);

            if (currentRound?.elimination_type) {
                setEliminationConfig({
                    type: currentRound.elimination_type,
                    value: currentRound.elimination_value || 10
                });
            }
        } catch (error) {
            toast.error('Failed to load round data');
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = async () => {
        try {
            const response = await axios.get(
                `${API}/admin/rounds/${roundId}/participants?search=${search}`,
                { headers: getAuthHeader() }
            );
            setParticipants(response.data);
        } catch (error) {
            toast.error('Search failed');
        }
    };

    const handlePresenceChange = (participantId, isPresent) => {
        setParticipants(prev => prev.map(p => 
            p.id === participantId ? { ...p, is_present: isPresent } : p
        ));
    };

    const handleScoreChange = (participantId, criteriaName, value) => {
        setParticipants(prev => prev.map(p => {
            if (p.id === participantId) {
                const criteria_scores = { ...p.criteria_scores, [criteriaName]: parseFloat(value) || 0 };
                return { ...p, criteria_scores };
            }
            return p;
        }));
    };

    const saveScores = async () => {
        setSaving(true);
        try {
            const scores = participants.map(p => ({
                participant_id: p.id,
                criteria_scores: p.criteria_scores || {},
                is_present: p.is_present
            }));

            await axios.post(`${API}/admin/rounds/${roundId}/scores`, scores, {
                headers: getAuthHeader()
            });

            toast.success('Scores saved successfully');
            fetchRoundData();
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Failed to save scores');
        } finally {
            setSaving(false);
        }
    };

    const updateEliminationRules = async () => {
        try {
            await axios.put(`${API}/admin/rounds/${roundId}`, {
                elimination_type: eliminationConfig.type,
                elimination_value: eliminationConfig.value
            }, { headers: getAuthHeader() });
            toast.success('Elimination rules updated');
        } catch (error) {
            toast.error('Failed to update rules');
        }
    };

    const freezeRound = async () => {
        try {
            await updateEliminationRules();
            await axios.post(`${API}/admin/rounds/${roundId}/freeze`, {}, {
                headers: getAuthHeader()
            });
            toast.success('Round frozen and eliminations applied');
            setFreezeDialogOpen(false);
            fetchRoundData();
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Failed to freeze round');
        }
    };

    const handleLogout = () => {
        logout();
        navigate('/');
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-muted flex items-center justify-center">
                <div className="neo-card animate-pulse">
                    <div className="loading-spinner mx-auto"></div>
                    <p className="mt-4 font-heading text-lg">Loading round data...</p>
                </div>
            </div>
        );
    }

    if (!round) {
        return (
            <div className="min-h-screen bg-muted flex items-center justify-center">
                <div className="neo-card text-center">
                    <AlertTriangle className="w-16 h-16 mx-auto mb-4 text-red-500" />
                    <h2 className="font-heading font-bold text-xl mb-4">Round Not Found</h2>
                    <Link to="/admin/rounds">
                        <Button className="bg-primary text-white border-2 border-black shadow-neo">
                            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Rounds
                        </Button>
                    </Link>
                </div>
            </div>
        );
    }

    const criteria = round.evaluation_criteria || [];

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
                        <Link to="/admin/rounds" className="px-4 py-3 font-bold text-sm border-b-4 border-primary bg-secondary">
                            <Calendar className="w-4 h-4 inline mr-2" />Rounds
                        </Link>
                        <Link to="/admin/participants" className="px-4 py-3 font-bold text-sm hover:bg-muted transition-colors">
                            <Users className="w-4 h-4 inline mr-2" />Participants
                        </Link>
                        <Link to="/admin/leaderboard" className="px-4 py-3 font-bold text-sm hover:bg-muted transition-colors">
                            <Trophy className="w-4 h-4 inline mr-2" />Leaderboard
                        </Link>
                    </div>
                </div>
            </nav>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Round Header */}
                <div className="neo-card mb-6">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div className="flex items-center gap-4">
                            <Link to="/admin/rounds">
                                <Button variant="outline" className="border-2 border-black">
                                    <ArrowLeft className="w-4 h-4" />
                                </Button>
                            </Link>
                            <div>
                                <div className="flex items-center gap-2">
                                    <span className="bg-primary text-white px-2 py-1 border-2 border-black font-bold text-sm">
                                        {round.round_no}
                                    </span>
                                    {round.is_frozen && (
                                        <span className="bg-orange-100 text-orange-800 px-2 py-1 border-2 border-orange-500 font-bold text-sm flex items-center gap-1">
                                            <Lock className="w-4 h-4" /> Frozen
                                        </span>
                                    )}
                                </div>
                                <h1 className="font-heading font-bold text-2xl mt-2">{round.name}</h1>
                            </div>
                        </div>

                        {!round.is_frozen && (
                            <div className="flex gap-2">
                                <Button
                                    onClick={saveScores}
                                    disabled={saving}
                                    className="bg-primary text-white border-2 border-black shadow-neo hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none"
                                    data-testid="save-scores-btn"
                                >
                                    <Save className="w-4 h-4 mr-2" />
                                    {saving ? 'Saving...' : 'Save Scores'}
                                </Button>

                                <Dialog open={freezeDialogOpen} onOpenChange={setFreezeDialogOpen}>
                                    <DialogTrigger asChild>
                                        <Button
                                            className="bg-orange-500 text-white border-2 border-black shadow-neo hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none"
                                            data-testid="freeze-round-btn"
                                        >
                                            <Lock className="w-4 h-4 mr-2" /> Freeze & Eliminate
                                        </Button>
                                    </DialogTrigger>
                                    <DialogContent className="border-4 border-black shadow-neo-lg">
                                        <DialogHeader>
                                            <DialogTitle className="font-heading font-bold text-xl flex items-center gap-2">
                                                <AlertTriangle className="w-6 h-6 text-orange-500" />
                                                Freeze Round & Apply Elimination
                                            </DialogTitle>
                                        </DialogHeader>
                                        <div className="space-y-4">
                                            <p className="text-gray-600">
                                                This action is <strong>irreversible</strong>. Once frozen, scores cannot be edited and eliminations will be applied.
                                            </p>

                                            <div className="space-y-4 p-4 bg-muted border-2 border-black">
                                                <div className="space-y-2">
                                                    <Label className="font-bold">Elimination Rule</Label>
                                                    <Select
                                                        value={eliminationConfig.type}
                                                        onValueChange={(value) => setEliminationConfig(prev => ({ ...prev, type: value }))}
                                                    >
                                                        <SelectTrigger className="neo-input">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="top_k">Keep Top K Participants</SelectItem>
                                                            <SelectItem value="min_score">Minimum Score Required</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </div>

                                                <div className="space-y-2">
                                                    <Label className="font-bold">
                                                        {eliminationConfig.type === 'top_k' ? 'Number of participants to keep' : 'Minimum normalized score (out of 100)'}
                                                    </Label>
                                                    <Input
                                                        type="number"
                                                        value={eliminationConfig.value}
                                                        onChange={(e) => setEliminationConfig(prev => ({ ...prev, value: parseFloat(e.target.value) || 0 }))}
                                                        className="neo-input"
                                                        min={0}
                                                    />
                                                </div>
                                            </div>

                                            <div className="flex gap-2">
                                                <Button
                                                    onClick={() => setFreezeDialogOpen(false)}
                                                    variant="outline"
                                                    className="flex-1 border-2 border-black"
                                                >
                                                    Cancel
                                                </Button>
                                                <Button
                                                    onClick={freezeRound}
                                                    className="flex-1 bg-orange-500 text-white border-2 border-black shadow-neo"
                                                    data-testid="confirm-freeze-btn"
                                                >
                                                    <Lock className="w-4 h-4 mr-2" /> Confirm Freeze
                                                </Button>
                                            </div>
                                        </div>
                                    </DialogContent>
                                </Dialog>
                            </div>
                        )}
                    </div>
                </div>

                {/* Search */}
                <div className="neo-card mb-6">
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                            <Input
                                placeholder="Search by name or register number..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                                className="neo-input pl-10"
                                data-testid="score-search-input"
                            />
                        </div>
                        <Button
                            onClick={handleSearch}
                            className="bg-primary text-white border-2 border-black shadow-neo hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none"
                        >
                            Search
                        </Button>
                    </div>
                </div>

                {/* Scoring Table */}
                {participants.length === 0 ? (
                    <div className="neo-card text-center py-12">
                        <Users className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                        <h3 className="font-heading font-bold text-xl mb-2">No Participants Found</h3>
                        <p className="text-gray-600">Try adjusting your search.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="neo-table">
                            <thead>
                                <tr>
                                    <th>Register No</th>
                                    <th>Name</th>
                                    <th>Present</th>
                                    {criteria.map(c => (
                                        <th key={c.name}>{c.name} (/{c.max_marks})</th>
                                    ))}
                                    <th>Total</th>
                                    <th>Normalized</th>
                                </tr>
                            </thead>
                            <tbody>
                                {participants.map(participant => {
                                    const totalScore = criteria.reduce((sum, c) => 
                                        sum + (participant.criteria_scores?.[c.name] || 0), 0
                                    );
                                    const maxScore = criteria.reduce((sum, c) => sum + c.max_marks, 0);
                                    const normalized = maxScore > 0 ? (totalScore / maxScore * 100).toFixed(2) : 0;

                                    return (
                                        <tr key={participant.id} data-testid={`score-row-${participant.register_number}`}>
                                            <td className="font-mono font-bold">{participant.register_number}</td>
                                            <td className="font-medium">{participant.name}</td>
                                            <td>
                                                <Checkbox
                                                    checked={participant.is_present}
                                                    onCheckedChange={(checked) => handlePresenceChange(participant.id, checked)}
                                                    disabled={round.is_frozen}
                                                    className="border-2 border-black data-[state=checked]:bg-primary"
                                                    data-testid={`presence-${participant.register_number}`}
                                                />
                                            </td>
                                            {criteria.map(c => (
                                                <td key={c.name}>
                                                    <Input
                                                        type="number"
                                                        value={participant.criteria_scores?.[c.name] || ''}
                                                        onChange={(e) => handleScoreChange(participant.id, c.name, e.target.value)}
                                                        disabled={round.is_frozen || !participant.is_present}
                                                        className="neo-input w-20"
                                                        min={0}
                                                        max={c.max_marks}
                                                        data-testid={`score-${participant.register_number}-${c.name}`}
                                                    />
                                                </td>
                                            ))}
                                            <td className="font-bold">{totalScore}</td>
                                            <td>
                                                <span className="bg-primary text-white px-2 py-1 border-2 border-black font-bold">
                                                    {normalized}
                                                </span>
                                            </td>
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
