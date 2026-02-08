import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';

import { useAuth } from '@/context/AuthContext';
import AdminLayout from '@/pages/HomeAdmin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const initialForm = {
    title: '',
    description: '',
    poster_url: '',
    event_type: 'Event',
    format: 'Offline',
    template_option: 'attendance_scoring',
    participant_mode: 'individual',
    round_mode: 'single',
    round_count: 1,
    team_min_size: '',
    team_max_size: ''
};

export default function AdminEvents() {
    const { getAuthHeader, isSuperAdmin, canAccessEvents } = useAuth();
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState(initialForm);

    const fetchEvents = useCallback(async () => {
        try {
            const response = await axios.get(`${API}/pda-admin/events`, { headers: getAuthHeader() });
            setEvents(response.data || []);
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Failed to load events');
        } finally {
            setLoading(false);
        }
    }, [getAuthHeader]);

    useEffect(() => {
        if (canAccessEvents || isSuperAdmin) {
            fetchEvents();
        } else {
            setLoading(false);
        }
    }, [canAccessEvents, fetchEvents, isSuperAdmin]);

    const onSubmit = async (e) => {
        e.preventDefault();
        if (!isSuperAdmin) return;
        setSaving(true);
        try {
            const payload = {
                ...form,
                round_count: Number(form.round_count || 1),
                team_min_size: form.participant_mode === 'team' ? Number(form.team_min_size || 1) : null,
                team_max_size: form.participant_mode === 'team' ? Number(form.team_max_size || 1) : null
            };
            await axios.post(`${API}/pda-admin/events`, payload, { headers: getAuthHeader() });
            toast.success('Event created');
            setForm(initialForm);
            fetchEvents();
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Failed to create event');
        } finally {
            setSaving(false);
        }
    };

    const toggleStatus = async (eventRow) => {
        if (!isSuperAdmin) return;
        const nextStatus = eventRow.status === 'open' ? 'closed' : 'open';
        try {
            await axios.put(`${API}/pda-admin/events/${eventRow.slug}`, { status: nextStatus }, { headers: getAuthHeader() });
            toast.success(`Event ${nextStatus}`);
            fetchEvents();
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Failed to update status');
        }
    };

    return (
        <AdminLayout title="Events" subtitle="Managed PDA events with attendance and scoring workflows." allowEventAdmin>
            {isSuperAdmin ? (
                <section className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
                    <h2 className="text-2xl font-heading font-black">Create Event</h2>
                    <form className="mt-4 grid gap-4 md:grid-cols-2" onSubmit={onSubmit}>
                        <div className="md:col-span-2">
                            <Label>Title</Label>
                            <Input value={form.title} onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))} required />
                        </div>
                        <div className="md:col-span-2">
                            <Label>Description</Label>
                            <Textarea value={form.description} onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))} />
                        </div>
                        <div className="md:col-span-2">
                            <Label>Poster URL</Label>
                            <Input value={form.poster_url} onChange={(e) => setForm((prev) => ({ ...prev, poster_url: e.target.value }))} />
                        </div>
                        <div>
                            <Label>Type</Label>
                            <Select value={form.event_type} onValueChange={(value) => setForm((prev) => ({ ...prev, event_type: value }))}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Session">Session</SelectItem>
                                    <SelectItem value="Workshop">Workshop</SelectItem>
                                    <SelectItem value="Event">Event</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label>Format</Label>
                            <Select value={form.format} onValueChange={(value) => setForm((prev) => ({ ...prev, format: value }))}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Online">Online</SelectItem>
                                    <SelectItem value="Offline">Offline</SelectItem>
                                    <SelectItem value="Hybrid">Hybrid</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label>Template</Label>
                            <Select value={form.template_option} onValueChange={(value) => setForm((prev) => ({ ...prev, template_option: value }))}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="attendance_only">Only Attendance</SelectItem>
                                    <SelectItem value="attendance_scoring">Attendance + Scoring</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label>Participant Mode</Label>
                            <Select value={form.participant_mode} onValueChange={(value) => setForm((prev) => ({ ...prev, participant_mode: value }))}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="individual">Individual</SelectItem>
                                    <SelectItem value="team">Team</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label>Round Mode</Label>
                            <Select value={form.round_mode} onValueChange={(value) => setForm((prev) => ({ ...prev, round_mode: value }))}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="single">Single Round</SelectItem>
                                    <SelectItem value="multi">Multi Round</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label>Round Count</Label>
                            <Input
                                type="number"
                                min={1}
                                max={20}
                                value={form.round_count}
                                disabled={form.round_mode === 'single'}
                                onChange={(e) => setForm((prev) => ({ ...prev, round_count: e.target.value }))}
                            />
                        </div>
                        {form.participant_mode === 'team' ? (
                            <>
                                <div>
                                    <Label>Team Min Size</Label>
                                    <Input type="number" min={1} value={form.team_min_size} onChange={(e) => setForm((prev) => ({ ...prev, team_min_size: e.target.value }))} required />
                                </div>
                                <div>
                                    <Label>Team Max Size</Label>
                                    <Input type="number" min={1} value={form.team_max_size} onChange={(e) => setForm((prev) => ({ ...prev, team_max_size: e.target.value }))} required />
                                </div>
                            </>
                        ) : null}
                        <div className="md:col-span-2 flex justify-end">
                            <Button type="submit" className="bg-[#f6c347] text-black hover:bg-[#ffd16b]" disabled={saving}>
                                {saving ? 'Creating...' : 'Create Event'}
                            </Button>
                        </div>
                    </form>
                </section>
            ) : null}

            <section className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
                <h2 className="text-2xl font-heading font-black">Available Events</h2>
                {loading ? (
                    <p className="mt-4 text-sm text-slate-500">Loading...</p>
                ) : events.length === 0 ? (
                    <p className="mt-4 text-sm text-slate-500">No events available for your policy.</p>
                ) : (
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                        {events.map((eventRow) => (
                            <div key={eventRow.id} className="rounded-2xl border border-black/10 bg-[#fffdf7] p-4">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <p className="text-xs uppercase tracking-[0.3em] text-slate-400">{eventRow.event_code}</p>
                                        <h3 className="font-heading text-xl font-black">{eventRow.title}</h3>
                                        <p className="text-xs text-slate-500">{eventRow.slug}</p>
                                    </div>
                                    <span className={`rounded-full border px-3 py-1 text-xs uppercase tracking-[0.2em] ${eventRow.status === 'open' ? 'border-[#c99612] bg-[#fff3c4] text-[#7a5a00]' : 'border-black/10 bg-[#11131a] text-[#f6c347]'}`}>
                                        {eventRow.status}
                                    </span>
                                </div>
                                <p className="mt-3 text-sm text-slate-600">{eventRow.description || 'No description provided.'}</p>
                                <div className="mt-4 flex flex-wrap gap-2 text-xs">
                                    <span className="rounded-md border border-black/10 bg-white px-2 py-1">{eventRow.event_type}</span>
                                    <span className="rounded-md border border-black/10 bg-white px-2 py-1">{eventRow.format}</span>
                                    <span className="rounded-md border border-black/10 bg-white px-2 py-1">{eventRow.participant_mode}</span>
                                    <span className="rounded-md border border-black/10 bg-white px-2 py-1">{eventRow.template_option}</span>
                                </div>
                                <div className="mt-4 flex flex-wrap gap-2">
                                    <Link to={`/admin/events/${eventRow.slug}`}>
                                        <Button className="bg-[#11131a] text-white hover:bg-[#1f2330]">Manage</Button>
                                    </Link>
                                    {isSuperAdmin ? (
                                        <Button variant="outline" className="border-black/20" onClick={() => toggleStatus(eventRow)}>
                                            {eventRow.status === 'open' ? 'Close Event' : 'Open Event'}
                                        </Button>
                                    ) : null}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </AdminLayout>
    );
}
