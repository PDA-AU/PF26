import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const emptyProgram = {
    title: '',
    description: '',
    tag: '',
    poster_url: ''
};

const emptyEvent = {
    title: '',
    start_date: '',
    end_date: '',
    format: '',
    description: '',
    poster_url: '',
    hero_caption: '',
    hero_url: '',
    is_featured: false
};

export default function PdaAdmin() {
    const [programs, setPrograms] = useState([]);
    const [events, setEvents] = useState([]);
    const [programForm, setProgramForm] = useState(emptyProgram);
    const [eventForm, setEventForm] = useState(emptyEvent);
    const [programPosterFile, setProgramPosterFile] = useState(null);
    const [eventPosterFile, setEventPosterFile] = useState(null);
    const [editingProgramId, setEditingProgramId] = useState(null);
    const [editingEventId, setEditingEventId] = useState(null);
    const [loading, setLoading] = useState(true);
    const [savingProgram, setSavingProgram] = useState(false);
    const [savingEvent, setSavingEvent] = useState(false);
    const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
    const [passwordDialogLabel, setPasswordDialogLabel] = useState('');
    const [passwordValue, setPasswordValue] = useState('');
    const [passwordError, setPasswordError] = useState('');
    const passwordResolverRef = useRef(null);

    const buildAdminHeaders = (password) => ({
        headers: { 'X-PDA-ADMIN': password }
    });

    const requestPassword = (actionLabel) => {
        return new Promise((resolve) => {
            passwordResolverRef.current = resolve;
            setPasswordDialogLabel(actionLabel);
            setPasswordValue('');
            setPasswordError('');
            setPasswordDialogOpen(true);
        });
    };

    const closePasswordDialog = (result) => {
        setPasswordDialogOpen(false);
        if (passwordResolverRef.current) {
            passwordResolverRef.current(result);
            passwordResolverRef.current = null;
        }
    };

    const fetchData = async () => {
        try {
            const [programsRes, eventsRes] = await Promise.all([
                axios.get(`${API}/pda/programs`),
                axios.get(`${API}/pda/events`)
            ]);
            setPrograms(programsRes.data || []);
            setEvents(eventsRes.data || []);
        } catch (error) {
            console.error('Failed to load PDA content:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleProgramChange = (e) => {
        const { name, value } = e.target;
        setProgramForm(prev => ({ ...prev, [name]: value }));
    };

    const handleEventChange = (e) => {
        const { name, value, type, checked } = e.target;
        setEventForm(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
    };

    const resetProgramForm = () => {
        setProgramForm(emptyProgram);
        setEditingProgramId(null);
        setProgramPosterFile(null);
    };

    const resetEventForm = () => {
        setEventForm(emptyEvent);
        setEditingEventId(null);
        setEventPosterFile(null);
    };

    const uploadPoster = async (file, password) => {
        const formData = new FormData();
        formData.append('file', file);
        const response = await axios.post(`${API}/pda-admin/posters`, formData, {
            headers: {
                'X-PDA-ADMIN': password,
                'Content-Type': 'multipart/form-data'
            }
        });
        return response.data?.url;
    };

    const submitProgram = async (e) => {
        e.preventDefault();
        const password = await requestPassword(editingProgramId ? 'Update program' : 'Create program');
        if (!password) return;
        setSavingProgram(true);
        let posterUrl = programForm.poster_url.trim() || null;
        if (programPosterFile) {
            posterUrl = await uploadPoster(programPosterFile, password);
        }
        const payload = {
            title: programForm.title.trim(),
            description: programForm.description.trim() || null,
            tag: programForm.tag.trim() || null,
            poster_url: posterUrl
        };
        try {
            if (editingProgramId) {
                await axios.put(`${API}/pda-admin/programs/${editingProgramId}`, payload, buildAdminHeaders(password));
            } else {
                await axios.post(`${API}/pda-admin/programs`, payload, buildAdminHeaders(password));
            }
            resetProgramForm();
            fetchData();
        } catch (error) {
            console.error('Failed to save program:', error);
        } finally {
            setSavingProgram(false);
        }
    };

    const submitEvent = async (e) => {
        e.preventDefault();
        const password = await requestPassword(editingEventId ? 'Update event' : 'Create event');
        if (!password) return;
        setSavingEvent(true);
        let posterUrl = eventForm.poster_url.trim() || null;
        if (eventPosterFile) {
            posterUrl = await uploadPoster(eventPosterFile, password);
        }
        const payload = {
            title: eventForm.title.trim(),
            start_date: eventForm.start_date || null,
            end_date: eventForm.end_date || null,
            format: eventForm.format.trim() || null,
            description: eventForm.description.trim() || null,
            poster_url: posterUrl,
            hero_caption: eventForm.hero_caption.trim() || null,
            hero_url: eventForm.hero_url.trim() || null,
            is_featured: eventForm.is_featured
        };
        try {
            if (editingEventId) {
                await axios.put(`${API}/pda-admin/events/${editingEventId}`, payload, buildAdminHeaders(password));
            } else {
                await axios.post(`${API}/pda-admin/events`, payload, buildAdminHeaders(password));
            }
            resetEventForm();
            fetchData();
        } catch (error) {
            console.error('Failed to save event:', error);
        } finally {
            setSavingEvent(false);
        }
    };

    const editProgram = (program) => {
        setProgramForm({
            title: program.title || '',
            description: program.description || '',
            tag: program.tag || '',
            poster_url: program.poster_url || ''
        });
        setEditingProgramId(program.id);
        setProgramPosterFile(null);
    };

    const editEvent = (event) => {
        setEventForm({
            title: event.title || '',
            start_date: event.start_date || '',
            end_date: event.end_date || '',
            format: event.format || '',
            description: event.description || '',
            poster_url: event.poster_url || '',
            hero_caption: event.hero_caption || '',
            hero_url: event.hero_url || '',
            is_featured: Boolean(event.is_featured)
        });
        setEditingEventId(event.id);
        setEventPosterFile(null);
    };

    const deleteProgram = async (programId) => {
        const password = await requestPassword('Delete program');
        if (!password) return;
        try {
            await axios.delete(`${API}/pda-admin/programs/${programId}`, buildAdminHeaders(password));
            fetchData();
        } catch (error) {
            console.error('Failed to delete program:', error);
        }
    };

    const deleteEvent = async (eventId) => {
        const password = await requestPassword('Delete event');
        if (!password) return;
        try {
            await axios.delete(`${API}/pda-admin/events/${eventId}`, buildAdminHeaders(password));
            fetchData();
        } catch (error) {
            console.error('Failed to delete event:', error);
        }
    };

    const setFeatured = async (eventId) => {
        const password = await requestPassword('Feature event on homepage');
        if (!password) return;
        try {
            await axios.post(`${API}/pda-admin/events/${eventId}/feature`, {}, buildAdminHeaders(password));
            fetchData();
        } catch (error) {
            console.error('Failed to feature event:', error);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-[#f7f5f0] flex items-center justify-center">
                <div className="rounded-3xl border border-black/10 bg-white p-8 text-center shadow-lg">
                    <p className="text-lg font-heading font-black">Loading PDA admin...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#f7f5f0] text-[#0f1115]">
            <header className="border-b border-black/10 bg-white">
                <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-5 py-6 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <p className="text-xs uppercase tracking-[0.4em] text-slate-400">PDA Home Admin</p>
                        <h1 className="text-3xl font-heading font-black">Manage Programs & Events</h1>
                    </div>
                </div>
            </header>

            <main className="mx-auto w-full max-w-6xl space-y-10 px-5 py-10">
                <section className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <p className="text-xs uppercase tracking-[0.4em] text-slate-400">Programs</p>
                            <h2 className="text-2xl font-heading font-black">Create or Update Programs</h2>
                        </div>
                        {editingProgramId ? (
                            <Button variant="outline" onClick={resetProgramForm} className="border-black/10 text-sm">
                                Cancel Edit
                            </Button>
                        ) : null}
                    </div>

                    <form onSubmit={submitProgram} className="mt-6 grid gap-4 md:grid-cols-2">
                        <div className="md:col-span-1">
                            <Label htmlFor="program-title">Title</Label>
                            <Input
                                id="program-title"
                                name="title"
                                value={programForm.title}
                                onChange={handleProgramChange}
                                placeholder="Program title"
                                required
                            />
                        </div>
                        <div className="md:col-span-1">
                            <Label htmlFor="program-tag">Tag</Label>
                            <Input
                                id="program-tag"
                                name="tag"
                                value={programForm.tag}
                                onChange={handleProgramChange}
                                placeholder="Career Guidance"
                            />
                        </div>
                        <div className="md:col-span-2">
                            <Label htmlFor="program-poster">Poster URL</Label>
                            <Input
                                id="program-poster"
                                name="poster_url"
                                value={programForm.poster_url}
                                onChange={handleProgramChange}
                                placeholder="https://..."
                            />
                        </div>
                        <div className="md:col-span-2">
                            <Label htmlFor="program-poster-file">Or Upload Poster</Label>
                            <Input
                                id="program-poster-file"
                                name="program_poster_file"
                                type="file"
                                accept="image/png,image/jpeg,image/webp"
                                onChange={(e) => setProgramPosterFile(e.target.files?.[0] || null)}
                            />
                        </div>
                        <div className="md:col-span-2">
                            <Label htmlFor="program-description">Description</Label>
                            <Textarea
                                id="program-description"
                                name="description"
                                value={programForm.description}
                                onChange={handleProgramChange}
                                placeholder="Short description"
                                rows={4}
                            />
                        </div>
                        <div className="md:col-span-2 flex justify-end">
                            <Button type="submit" className="bg-[#f6c347] text-black hover:bg-[#ffd16b]" disabled={savingProgram}>
                                {savingProgram ? 'Saving...' : editingProgramId ? 'Update Program' : 'Create Program'}
                            </Button>
                        </div>
                    </form>

                    <div className="mt-8 grid gap-4 md:grid-cols-2">
                        {programs.length ? programs.map((program) => (
                            <div key={program.id} className="rounded-2xl border border-black/10 bg-[#fffdf7] p-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <h3 className="text-lg font-heading font-bold">{program.title}</h3>
                                        {program.tag ? (
                                            <p className="text-xs uppercase tracking-[0.3em] text-[#b48900]">{program.tag}</p>
                                        ) : null}
                                    </div>
                                    <div className="flex gap-2">
                                        <Button variant="outline" onClick={() => editProgram(program)} className="border-black/10 text-xs">
                                            Edit
                                        </Button>
                                        <Button variant="outline" onClick={() => deleteProgram(program.id)} className="border-black/10 text-xs">
                                            Delete
                                        </Button>
                                    </div>
                                </div>
                                {program.description ? (
                                    <p className="mt-2 text-sm text-slate-600">{program.description}</p>
                                ) : null}
                            </div>
                        )) : (
                            <div className="rounded-2xl border border-black/10 bg-[#fffdf7] p-4 text-sm text-slate-500">
                                No programs yet. Create the first program above.
                            </div>
                        )}
                    </div>
                </section>

                <section className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <p className="text-xs uppercase tracking-[0.4em] text-slate-400">Events</p>
                            <h2 className="text-2xl font-heading font-black">Create or Update Events</h2>
                        </div>
                        {editingEventId ? (
                            <Button variant="outline" onClick={resetEventForm} className="border-black/10 text-sm">
                                Cancel Edit
                            </Button>
                        ) : null}
                    </div>

                    <form onSubmit={submitEvent} className="mt-6 grid gap-4 md:grid-cols-2">
                        <div>
                            <Label htmlFor="event-title">Title</Label>
                            <Input
                                id="event-title"
                                name="title"
                                value={eventForm.title}
                                onChange={handleEventChange}
                                placeholder="Event title"
                                required
                            />
                        </div>
                        <div>
                            <Label htmlFor="event-format">Format</Label>
                            <Input
                                id="event-format"
                                name="format"
                                value={eventForm.format}
                                onChange={handleEventChange}
                                placeholder="Offline (Rajam Hall)"
                            />
                        </div>
                        <div>
                            <Label htmlFor="event-start-date">Start Date</Label>
                            <Input
                                id="event-start-date"
                                name="start_date"
                                type="date"
                                value={eventForm.start_date}
                                onChange={handleEventChange}
                            />
                        </div>
                        <div>
                            <Label htmlFor="event-end-date">End Date</Label>
                            <Input
                                id="event-end-date"
                                name="end_date"
                                type="date"
                                value={eventForm.end_date}
                                onChange={handleEventChange}
                            />
                        </div>
                        <div className="md:col-span-2">
                            <Label htmlFor="event-poster">Poster URL</Label>
                            <Input
                                id="event-poster"
                                name="poster_url"
                                value={eventForm.poster_url}
                                onChange={handleEventChange}
                                placeholder="https://..."
                            />
                        </div>
                        <div className="md:col-span-2">
                            <Label htmlFor="event-poster-file">Or Upload Poster</Label>
                            <Input
                                id="event-poster-file"
                                name="event_poster_file"
                                type="file"
                                accept="image/png,image/jpeg,image/webp"
                                onChange={(e) => setEventPosterFile(e.target.files?.[0] || null)}
                            />
                        </div>
                        <div className="md:col-span-2">
                            <Label htmlFor="event-description">Description</Label>
                            <Textarea
                                id="event-description"
                                name="description"
                                value={eventForm.description}
                                onChange={handleEventChange}
                                placeholder="Describe the event"
                                rows={4}
                            />
                        </div>
                        <div className="md:col-span-2">
                            <Label htmlFor="event-hero-caption">Hero Caption</Label>
                            <Textarea
                                id="event-hero-caption"
                                name="hero_caption"
                                value={eventForm.hero_caption}
                                onChange={handleEventChange}
                                placeholder="Caption for the homepage hero"
                                rows={3}
                            />
                        </div>
                        <div className="md:col-span-2">
                            <Label htmlFor="event-hero-url">Hero Redirect URL</Label>
                            <Input
                                id="event-hero-url"
                                name="hero_url"
                                value={eventForm.hero_url}
                                onChange={handleEventChange}
                                placeholder="https://..."
                            />
                        </div>
                        <div className="md:col-span-2 flex items-center gap-2">
                            <input
                                id="event-featured"
                                name="is_featured"
                                type="checkbox"
                                checked={eventForm.is_featured}
                                onChange={handleEventChange}
                                className="h-4 w-4"
                            />
                            <Label htmlFor="event-featured">Feature this event on the homepage</Label>
                        </div>
                        <div className="md:col-span-2 flex justify-end">
                            <Button type="submit" className="bg-[#f6c347] text-black hover:bg-[#ffd16b]" disabled={savingEvent}>
                                {savingEvent ? 'Saving...' : editingEventId ? 'Update Event' : 'Create Event'}
                            </Button>
                        </div>
                    </form>

                    <div className="mt-8 grid gap-4 md:grid-cols-2">
                        {events.length ? events.map((event) => (
                            <div key={event.id} className="rounded-2xl border border-black/10 bg-[#fffdf7] p-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <h3 className="text-lg font-heading font-bold">{event.title}</h3>
                                        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                                            {event.start_date || 'TBA'}{event.end_date ? ` → ${event.end_date}` : ''}
                                        </p>
                                        {event.is_featured ? (
                                            <p className="mt-1 text-xs font-semibold uppercase tracking-[0.3em] text-[#b48900]">
                                                Featured
                                            </p>
                                        ) : null}
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <Button variant="outline" onClick={() => editEvent(event)} className="border-black/10 text-xs">
                                            Edit
                                        </Button>
                                        <Button variant="outline" onClick={() => deleteEvent(event.id)} className="border-black/10 text-xs">
                                            Delete
                                        </Button>
                                        <Button variant="outline" onClick={() => setFeatured(event.id)} className="border-black/10 text-xs">
                                            Set Featured
                                        </Button>
                                    </div>
                                </div>
                                {event.description ? (
                                    <p className="mt-2 text-sm text-slate-600">{event.description}</p>
                                ) : null}
                            </div>
                        )) : (
                            <div className="rounded-2xl border border-black/10 bg-[#fffdf7] p-4 text-sm text-slate-500">
                                No events yet. Add an event to showcase it on the homepage.
                            </div>
                        )}
                    </div>
                </section>
            </main>

            <Dialog open={passwordDialogOpen} onOpenChange={(open) => !open && closePasswordDialog(null)}>
                <DialogContent className="max-w-md bg-white">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-heading font-black">Confirm Admin Action</DialogTitle>
                        <p className="text-sm text-slate-600">
                            {passwordDialogLabel ? `${passwordDialogLabel}.` : 'Confirm this action.'} Enter the admin password to continue.
                        </p>
                    </DialogHeader>
                    <div className="space-y-3">
                        <div className="space-y-2">
                            <Label htmlFor="pda-admin-password">Admin Password</Label>
                            <Input
                                id="pda-admin-password"
                                type="password"
                                value={passwordValue}
                                onChange={(e) => {
                                    setPasswordValue(e.target.value);
                                    if (passwordError) setPasswordError('');
                                }}
                                placeholder="Enter password"
                            />
                            {passwordError ? (
                                <p className="text-xs text-red-600">{passwordError}</p>
                            ) : null}
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button
                                variant="outline"
                                type="button"
                                onClick={() => closePasswordDialog(null)}
                                className="border-black/10"
                            >
                                Cancel
                            </Button>
                            <Button
                                type="button"
                                onClick={() => {
                                    if (!passwordValue.trim()) {
                                        setPasswordError('Password is required to continue.');
                                        return;
                                    }
                                    closePasswordDialog(passwordValue.trim());
                                }}
                                className="bg-[#0f1115] text-white hover:bg-[#1f2330]"
                            >
                                Confirm
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
