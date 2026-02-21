import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Award } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/context/AuthContext';

import EventAdminShell, { useEventAdminShell } from './EventAdminShell';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

function BadgesContent() {
    const { getAuthHeader } = useAuth();
    const {
        eventInfo,
        eventSlug,
        pushLocalUndo,
        warnNonUndoable,
    } = useEventAdminShell();
    const [badges, setBadges] = useState([]);
    const [entities, setEntities] = useState([]);
    const [loading, setLoading] = useState(true);
    const [form, setForm] = useState({
        title: '',
        place: 'Winner',
        score: '',
        image_url: '',
        entity_id: '',
    });

    const isTeamMode = eventInfo?.participant_mode === 'team';

    const getErrorMessage = (error, fallback) => (
        error?.response?.data?.detail || error?.response?.data?.message || fallback
    );

    const fetchBadges = useCallback(async () => {
        const response = await axios.get(`${API}/pda-admin/events/${eventSlug}/badges`, {
            headers: getAuthHeader(),
        });
        setBadges(response.data || []);
    }, [eventSlug, getAuthHeader]);

    const fetchEntities = useCallback(async () => {
        const response = await axios.get(`${API}/pda-admin/events/${eventSlug}/participants?page_size=200`, {
            headers: getAuthHeader(),
        });
        setEntities(response.data || []);
    }, [eventSlug, getAuthHeader]);

    useEffect(() => {
        let mounted = true;
        const load = async () => {
            setLoading(true);
            try {
                await Promise.all([fetchBadges(), fetchEntities()]);
            } catch (error) {
                if (mounted) {
                    toast.error(getErrorMessage(error, 'Failed to load badges'));
                }
            } finally {
                if (mounted) {
                    setLoading(false);
                }
            }
        };
        load();
        return () => {
            mounted = false;
        };
    }, [fetchBadges, fetchEntities]);

    const entityOptions = useMemo(() => {
        return entities.filter((item) => (isTeamMode ? item.entity_type === 'team' : item.entity_type === 'user'));
    }, [entities, isTeamMode]);

    const createBadge = async () => {
        if (!form.entity_id) {
            toast.error(`Select a ${isTeamMode ? 'team' : 'participant'} to assign badge`);
            return;
        }
        try {
            await axios.post(`${API}/pda-admin/events/${eventSlug}/badges`, {
                title: form.title,
                place: form.place,
                score: form.score ? Number(form.score) : null,
                image_url: form.image_url || null,
                user_id: isTeamMode ? null : Number(form.entity_id),
                team_id: isTeamMode ? Number(form.entity_id) : null,
            }, { headers: getAuthHeader() });

            toast.success('Badge added');
            setForm({
                title: '',
                place: 'Winner',
                score: '',
                image_url: '',
                entity_id: '',
            });
            fetchBadges();
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to add badge'));
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!form.entity_id) {
            toast.error(`Select a ${isTeamMode ? 'team' : 'participant'} to assign badge`);
            return;
        }
        warnNonUndoable({
            title: 'Badge Creation Is Not Undoable',
            message: 'Creating a badge cannot be undone from header Undo. Continue?',
            proceed: createBadge,
        });
    };

    return (
        <>
            <div className="neo-card mb-6">
                <h1 className="font-heading font-bold text-3xl mb-2">Badges</h1>
                <p className="text-gray-600">Create and manage badge assignments for this event.</p>
            </div>

            <div className="neo-card mb-6">
                <h3 className="font-heading font-bold text-lg mb-4">Create Badge</h3>
                <form className="grid gap-3 md:grid-cols-3" onSubmit={handleSubmit}>
                    <div className="md:col-span-2">
                        <Label>Title</Label>
                        <Input
                            value={form.title}
                            onChange={(e) => {
                                const previous = { ...form };
                                const nextValue = e.target.value;
                                setForm((prev) => ({ ...prev, title: nextValue }));
                                pushLocalUndo({
                                    label: 'Undo badge title edit',
                                    undoFn: () => setForm(previous),
                                });
                            }}
                            required
                        />
                    </div>
                    <div>
                        <Label>Place</Label>
                        <Select
                            value={form.place}
                            onValueChange={(value) => {
                                const previous = { ...form };
                                setForm((prev) => ({ ...prev, place: value }));
                                pushLocalUndo({
                                    label: 'Undo badge place change',
                                    undoFn: () => setForm(previous),
                                });
                            }}
                        >
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="Winner">Winner</SelectItem>
                                <SelectItem value="Runner">Runner</SelectItem>
                                <SelectItem value="SpecialMention">Special Mention</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div>
                        <Label>Score</Label>
                        <Input
                            type="number"
                            value={form.score}
                            onChange={(e) => {
                                const previous = { ...form };
                                const nextValue = e.target.value;
                                setForm((prev) => ({ ...prev, score: nextValue }));
                                pushLocalUndo({
                                    label: 'Undo badge score edit',
                                    undoFn: () => setForm(previous),
                                });
                            }}
                        />
                    </div>
                    <div className="md:col-span-2">
                        <Label>{isTeamMode ? 'Team' : 'Participant'}</Label>
                        <Select
                            value={form.entity_id || 'none'}
                            onValueChange={(value) => {
                                const previous = { ...form };
                                setForm((prev) => ({ ...prev, entity_id: value === 'none' ? '' : value }));
                                pushLocalUndo({
                                    label: 'Undo badge entity selection',
                                    undoFn: () => setForm(previous),
                                });
                            }}
                        >
                            <SelectTrigger><SelectValue placeholder={`Select ${isTeamMode ? 'team' : 'participant'}`} /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">Select {isTeamMode ? 'team' : 'participant'}</SelectItem>
                                {entityOptions.map((entry) => (
                                    <SelectItem key={entry.entity_id} value={String(entry.entity_id)}>
                                        {entry.name} ({entry.regno_or_code})
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="md:col-span-3">
                        <Label>Image URL</Label>
                        <Input
                            value={form.image_url}
                            onChange={(e) => {
                                const previous = { ...form };
                                const nextValue = e.target.value;
                                setForm((prev) => ({ ...prev, image_url: nextValue }));
                                pushLocalUndo({
                                    label: 'Undo badge image URL edit',
                                    undoFn: () => setForm(previous),
                                });
                            }}
                        />
                    </div>
                    <div className="md:col-span-3 flex justify-end">
                        <Button type="submit" className="bg-[#11131a] text-white hover:bg-[#1f2330] border-2 border-black">Add Badge</Button>
                    </div>
                </form>
            </div>

            {loading ? (
                <div className="neo-card text-center py-12">
                    <div className="loading-spinner mx-auto"></div>
                    <p className="mt-4">Loading badges...</p>
                </div>
            ) : badges.length === 0 ? (
                <div className="neo-card text-center py-12">
                    <Award className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                    <h3 className="font-heading font-bold text-xl mb-2">No Badges Yet</h3>
                    <p className="text-gray-600">Create the first badge above.</p>
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="neo-table">
                        <thead>
                            <tr>
                                <th>Title</th>
                                <th>Place</th>
                                <th>Score</th>
                                <th>User ID</th>
                                <th>Team ID</th>
                                <th>Issued At</th>
                            </tr>
                        </thead>
                        <tbody>
                            {badges.map((badge) => (
                                <tr key={badge.id}>
                                    <td className="font-medium">{badge.title}</td>
                                    <td>{badge.place}</td>
                                    <td>{badge.score ?? '—'}</td>
                                    <td>{badge.user_id ?? '—'}</td>
                                    <td>{badge.team_id ?? '—'}</td>
                                    <td>{badge.issued_at ? new Date(badge.issued_at).toLocaleString() : '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </>
    );
}

export default function EventAdminBadgesPage() {
    return (
        <EventAdminShell activeTab="badges">
            <BadgesContent />
        </EventAdminShell>
    );
}
