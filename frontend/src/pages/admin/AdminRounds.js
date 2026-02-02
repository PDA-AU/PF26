import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import axios from 'axios';
import { toast } from 'sonner';
import { 
    Calendar, Plus, Edit2, Trash2, Eye, Play, Lock, LogOut, Sparkles,
    LayoutDashboard, Users, Trophy, ChevronRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const ROUND_STATES = ['Draft', 'Published', 'Active', 'Completed'];
const ROUND_MODES = ['Online', 'Offline'];
const TAGS = ['Creative', 'Aptitude', 'Communication'];

export default function AdminRounds() {
    const navigate = useNavigate();
    const { user, logout, getAuthHeader } = useAuth();
    const [rounds, setRounds] = useState([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingRound, setEditingRound] = useState(null);
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        tags: [],
        date: '',
        mode: 'Offline',
        conducted_by: '',
        evaluation_criteria: [{ name: '', max_marks: 0 }]
    });

    useEffect(() => {
        fetchRounds();
    }, []);

    const fetchRounds = async () => {
        try {
            const response = await axios.get(`${API}/admin/rounds`, {
                headers: getAuthHeader()
            });
            setRounds(response.data);
        } catch (error) {
            toast.error('Failed to load rounds');
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => {
        setFormData({
            name: '',
            description: '',
            tags: [],
            date: '',
            mode: 'Offline',
            conducted_by: '',
            evaluation_criteria: [{ name: '', max_marks: 0 }]
        });
        setEditingRound(null);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const payload = {
                ...formData,
                date: formData.date ? new Date(formData.date).toISOString() : null,
                evaluation_criteria: formData.evaluation_criteria.filter(c => c.name && c.max_marks > 0)
            };

            if (editingRound) {
                await axios.put(`${API}/admin/rounds/${editingRound.id}`, payload, {
                    headers: getAuthHeader()
                });
                toast.success('Round updated successfully');
            } else {
                await axios.post(`${API}/admin/rounds`, payload, {
                    headers: getAuthHeader()
                });
                toast.success('Round created successfully');
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
        setFormData({
            name: round.name,
            description: round.description || '',
            tags: round.tags || [],
            date: round.date ? new Date(round.date).toISOString().split('T')[0] : '',
            mode: round.mode,
            conducted_by: round.conducted_by || '',
            evaluation_criteria: round.evaluation_criteria?.length > 0 
                ? round.evaluation_criteria 
                : [{ name: '', max_marks: 0 }]
        });
        setDialogOpen(true);
    };

    const handleDelete = async (roundId) => {
        if (!window.confirm('Are you sure you want to delete this round?')) return;
        
        try {
            await axios.delete(`${API}/admin/rounds/${roundId}`, {
                headers: getAuthHeader()
            });
            toast.success('Round deleted');
            fetchRounds();
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Failed to delete round');
        }
    };

    const handleStateChange = async (roundId, newState) => {
        try {
            await axios.put(`${API}/admin/rounds/${roundId}`, { state: newState }, {
                headers: getAuthHeader()
            });
            toast.success(`Round state changed to ${newState}`);
            fetchRounds();
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Failed to update state');
        }
    };

    const addCriteria = () => {
        setFormData(prev => ({
            ...prev,
            evaluation_criteria: [...prev.evaluation_criteria, { name: '', max_marks: 0 }]
        }));
    };

    const updateCriteria = (index, field, value) => {
        setFormData(prev => {
            const newCriteria = [...prev.evaluation_criteria];
            if (field === 'max_marks') {
                newCriteria[index] = { ...newCriteria[index], max_marks: parseFloat(value) || 0 };
            } else {
                newCriteria[index] = { ...newCriteria[index], [field]: value };
            }
            return { ...prev, evaluation_criteria: newCriteria };
        });
    };

    const removeCriteria = (index) => {
        setFormData(prev => ({
            ...prev,
            evaluation_criteria: prev.evaluation_criteria.filter((_, i) => i !== index)
        }));
    };

    const toggleTag = (tag) => {
        setFormData(prev => ({
            ...prev,
            tags: prev.tags.includes(tag) 
                ? prev.tags.filter(t => t !== tag)
                : [...prev.tags, tag]
        }));
    };

    const getStateBadgeColor = (state) => {
        const colors = {
            'Draft': 'bg-gray-100 text-gray-800 border-gray-500',
            'Published': 'bg-blue-100 text-blue-800 border-blue-500',
            'Active': 'bg-green-100 text-green-800 border-green-500',
            'Completed': 'bg-purple-100 text-purple-800 border-purple-500'
        };
        return colors[state] || colors['Draft'];
    };

    const handleLogout = () => {
        logout();
        navigate('/');
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
                {/* Header */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
                    <div>
                        <h1 className="font-heading font-bold text-3xl">Round Management</h1>
                        <p className="text-gray-600">Create and manage competition rounds</p>
                    </div>
                    <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
                        <DialogTrigger asChild>
                            <Button 
                                className="bg-primary text-white border-2 border-black shadow-neo hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none"
                                data-testid="create-round-btn"
                            >
                                <Plus className="w-5 h-5 mr-2" /> Create Round
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto border-4 border-black shadow-neo-lg">
                            <DialogHeader>
                                <DialogTitle className="font-heading font-bold text-2xl">
                                    {editingRound ? 'Edit Round' : 'Create New Round'}
                                </DialogTitle>
                            </DialogHeader>
                            <form onSubmit={handleSubmit} className="space-y-6">
                                <div className="grid md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label className="font-bold">Round Name *</Label>
                                        <Input
                                            value={formData.name}
                                            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                                            required
                                            className="neo-input"
                                            data-testid="round-name-input"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="font-bold">Mode *</Label>
                                        <Select value={formData.mode} onValueChange={(value) => setFormData(prev => ({ ...prev, mode: value }))}>
                                            <SelectTrigger className="neo-input">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {ROUND_MODES.map(mode => (
                                                    <SelectItem key={mode} value={mode}>{mode}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label className="font-bold">Description</Label>
                                    <Textarea
                                        value={formData.description}
                                        onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                                        className="neo-input min-h-[100px]"
                                        data-testid="round-description-input"
                                    />
                                </div>

                                <div className="grid md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label className="font-bold">Date</Label>
                                        <Input
                                            type="date"
                                            value={formData.date}
                                            onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
                                            className="neo-input"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="font-bold">Conducted By</Label>
                                        <Input
                                            value={formData.conducted_by}
                                            onChange={(e) => setFormData(prev => ({ ...prev, conducted_by: e.target.value }))}
                                            className="neo-input"
                                            placeholder="Faculty/Team name"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label className="font-bold">Tags</Label>
                                    <div className="flex flex-wrap gap-2">
                                        {TAGS.map(tag => (
                                            <button
                                                key={tag}
                                                type="button"
                                                onClick={() => toggleTag(tag)}
                                                className={`tag border-2 border-black ${formData.tags.includes(tag) ? 'tag-primary' : 'bg-white'}`}
                                            >
                                                {tag}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <div className="flex justify-between items-center">
                                        <Label className="font-bold">Evaluation Criteria</Label>
                                        <Button type="button" onClick={addCriteria} variant="outline" size="sm" className="border-2 border-black">
                                            <Plus className="w-4 h-4 mr-1" /> Add
                                        </Button>
                                    </div>
                                    <div className="space-y-2">
                                        {formData.evaluation_criteria.map((criteria, index) => (
                                            <div key={index} className="flex gap-2 items-center">
                                                <Input
                                                    placeholder="Criteria name"
                                                    value={criteria.name}
                                                    onChange={(e) => updateCriteria(index, 'name', e.target.value)}
                                                    className="neo-input flex-1"
                                                />
                                                <Input
                                                    type="number"
                                                    placeholder="Max"
                                                    value={criteria.max_marks || ''}
                                                    onChange={(e) => updateCriteria(index, 'max_marks', e.target.value)}
                                                    className="neo-input w-24"
                                                />
                                                {formData.evaluation_criteria.length > 1 && (
                                                    <Button type="button" onClick={() => removeCriteria(index)} variant="outline" size="sm" className="border-2 border-black">
                                                        <Trash2 className="w-4 h-4" />
                                                    </Button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <Button 
                                    type="submit" 
                                    className="w-full bg-primary text-white border-2 border-black shadow-neo hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none"
                                    data-testid="submit-round-btn"
                                >
                                    {editingRound ? 'Update Round' : 'Create Round'}
                                </Button>
                            </form>
                        </DialogContent>
                    </Dialog>
                </div>

                {/* Rounds Grid */}
                {loading ? (
                    <div className="neo-card text-center py-12">
                        <div className="loading-spinner mx-auto"></div>
                        <p className="mt-4">Loading rounds...</p>
                    </div>
                ) : rounds.length === 0 ? (
                    <div className="neo-card text-center py-12">
                        <Calendar className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                        <h3 className="font-heading font-bold text-xl mb-2">No Rounds Yet</h3>
                        <p className="text-gray-600">Create your first competition round to get started.</p>
                    </div>
                ) : (
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {rounds.map(round => (
                            <div key={round.id} className="neo-card hover-lift" data-testid={`round-card-${round.round_no}`}>
                                <div className="flex justify-between items-start mb-4">
                                    <div>
                                        <span className="bg-primary text-white px-2 py-1 border-2 border-black font-bold text-sm">
                                            {round.round_no}
                                        </span>
                                    </div>
                                    <span className={`tag border-2 ${getStateBadgeColor(round.state)}`}>
                                        {round.state}
                                    </span>
                                </div>

                                <h3 className="font-heading font-bold text-xl mb-2">{round.name}</h3>
                                <p className="text-gray-600 text-sm mb-4 line-clamp-2">{round.description || 'No description'}</p>

                                {round.tags?.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mb-4">
                                        {round.tags.map(tag => (
                                            <span key={tag} className="text-xs bg-secondary px-2 py-1 border border-black">{tag}</span>
                                        ))}
                                    </div>
                                )}

                                <div className="text-sm text-gray-500 mb-4">
                                    <p><strong>Mode:</strong> {round.mode}</p>
                                    <p><strong>Date:</strong> {round.date ? new Date(round.date).toLocaleDateString() : 'TBA'}</p>
                                    {round.is_frozen && (
                                        <p className="text-primary font-bold flex items-center gap-1 mt-2">
                                            <Lock className="w-4 h-4" /> Frozen
                                        </p>
                                    )}
                                </div>

                                <div className="flex flex-wrap gap-2">
                                    {!round.is_frozen && (
                                        <>
                                            <Button 
                                                size="sm" 
                                                variant="outline" 
                                                onClick={() => handleEdit(round)}
                                                className="border-2 border-black"
                                                data-testid={`edit-round-${round.round_no}`}
                                            >
                                                <Edit2 className="w-4 h-4" />
                                            </Button>
                                            {round.state === 'Draft' && (
                                                <Button 
                                                    size="sm" 
                                                    variant="outline" 
                                                    onClick={() => handleDelete(round.id)}
                                                    className="border-2 border-black text-red-500"
                                                    data-testid={`delete-round-${round.round_no}`}
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </Button>
                                            )}
                                        </>
                                    )}
                                    
                                    {round.state === 'Draft' && (
                                        <Button 
                                            size="sm"
                                            onClick={() => handleStateChange(round.id, 'Published')}
                                            className="bg-blue-500 text-white border-2 border-black"
                                        >
                                            Publish
                                        </Button>
                                    )}
                                    
                                    {round.state === 'Published' && (
                                        <Button 
                                            size="sm"
                                            onClick={() => handleStateChange(round.id, 'Active')}
                                            className="bg-green-500 text-white border-2 border-black"
                                        >
                                            <Play className="w-4 h-4 mr-1" /> Activate
                                        </Button>
                                    )}

                                    {(round.state === 'Active' || round.state === 'Completed') && (
                                        <Link to={`/admin/scoring/${round.id}`}>
                                            <Button 
                                                size="sm"
                                                className="bg-primary text-white border-2 border-black"
                                                data-testid={`score-round-${round.round_no}`}
                                            >
                                                <ChevronRight className="w-4 h-4 mr-1" /> Scores
                                            </Button>
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
