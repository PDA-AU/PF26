import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/context/AuthContext';
import AdminLayout from '@/pages/HomeAdmin/AdminLayout';
import { API, uploadPoster } from '@/pages/HomeAdmin/adminApi';
import { compressImageToWebp } from '@/utils/imageCompression';

const emptyItem = {
    type: 'program',
    title: '',
    description: '',
    tag: '',
    poster_url: '',
    start_date: '',
    end_date: '',
    format: '',
    hero_caption: '',
    hero_url: '',
    is_featured: false
};

export default function ItemsAdmin() {
    const { canAccessHome, getAuthHeader } = useAuth();
    const [programs, setPrograms] = useState([]);
    const [events, setEvents] = useState([]);
    const [itemForm, setItemForm] = useState(emptyItem);
    const [posterFile, setPosterFile] = useState(null);
    const [editingItem, setEditingItem] = useState(null);
    const [loading, setLoading] = useState(true);
    const [savingProgram, setSavingProgram] = useState(false);
    const [savingEvent, setSavingEvent] = useState(false);
    const [programSearch, setProgramSearch] = useState('');
    const [eventSearch, setEventSearch] = useState('');

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
        if (canAccessHome) {
            fetchData();
        }
    }, [canAccessHome]);

    const handleItemChange = (e) => {
        const { name, value, type, checked } = e.target;
        setItemForm(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
    };

    const resetItemForm = () => {
        setItemForm(emptyItem);
        setEditingItem(null);
        setPosterFile(null);
    };

    const submitItem = async (e) => {
        e.preventDefault();
        const isProgram = itemForm.type === 'program';
        const setSaving = isProgram ? setSavingProgram : setSavingEvent;
        setSaving(true);
        let posterUrl = itemForm.poster_url.trim() || null;
        if (posterFile) {
            const processed = await compressImageToWebp(posterFile);
            posterUrl = await uploadPoster(processed, getAuthHeader);
        }
        const payload = {
            title: itemForm.title.trim(),
            description: itemForm.description.trim() || null,
            poster_url: posterUrl,
            start_date: itemForm.start_date || null,
            end_date: itemForm.end_date || null,
            is_featured: itemForm.is_featured,
            tag: itemForm.tag.trim() || null,
            format: itemForm.format.trim() || null,
            hero_caption: itemForm.hero_caption.trim() || null,
            hero_url: itemForm.hero_url.trim() || null
        };
        try {
            const endpoint = isProgram ? 'programs' : 'events';
            if (editingItem) {
                await axios.put(`${API}/pda-admin/${endpoint}/${editingItem.id}`, payload, { headers: getAuthHeader() });
            } else {
                await axios.post(`${API}/pda-admin/${endpoint}`, payload, { headers: getAuthHeader() });
            }
            resetItemForm();
            fetchData();
        } catch (error) {
            console.error('Failed to save item:', error);
        } finally {
            setSaving(false);
        }
    };

    const editProgram = (program) => {
        setItemForm({
            type: 'program',
            title: program.title || '',
            description: program.description || '',
            tag: program.tag || '',
            poster_url: program.poster_url || '',
            start_date: program.start_date || '',
            end_date: program.end_date || '',
            format: program.format || '',
            hero_caption: program.hero_caption || '',
            hero_url: program.hero_url || '',
            is_featured: Boolean(program.is_featured)
        });
        setEditingItem({ id: program.id, type: 'program' });
        setPosterFile(null);
    };

    const editEvent = (event) => {
        setItemForm({
            type: 'event',
            title: event.title || '',
            start_date: event.start_date || '',
            end_date: event.end_date || '',
            format: event.format || '',
            description: event.description || '',
            poster_url: event.poster_url || '',
            hero_caption: event.hero_caption || '',
            hero_url: event.hero_url || '',
            tag: event.tag || '',
            is_featured: Boolean(event.is_featured)
        });
        setEditingItem({ id: event.id, type: 'event' });
        setPosterFile(null);
    };

    const deleteProgram = async (programId) => {
        try {
            await axios.delete(`${API}/pda-admin/programs/${programId}`, { headers: getAuthHeader() });
            fetchData();
        } catch (error) {
            console.error('Failed to delete program:', error);
        }
    };

    const deleteEvent = async (eventId) => {
        try {
            await axios.delete(`${API}/pda-admin/events/${eventId}`, { headers: getAuthHeader() });
            fetchData();
        } catch (error) {
            console.error('Failed to delete event:', error);
        }
    };

    const toggleEventFeatured = async (eventId, nextValue) => {
        try {
            await axios.put(`${API}/pda-admin/events/${eventId}`, { is_featured: nextValue }, { headers: getAuthHeader() });
            fetchData();
        } catch (error) {
            console.error('Failed to update event feature status:', error);
        }
    };

    const toggleProgramFeatured = async (programId, nextValue) => {
        try {
            await axios.put(`${API}/pda-admin/programs/${programId}`, { is_featured: nextValue }, { headers: getAuthHeader() });
            fetchData();
        } catch (error) {
            console.error('Failed to update program feature status:', error);
        }
    };

    const filteredPrograms = programs.filter((program) =>
        [program.title, program.tag, program.description]
            .filter(Boolean)
            .some((value) => value.toLowerCase().includes(programSearch.toLowerCase()))
    );

    const filteredEvents = events.filter((event) =>
        [event.title, event.format, event.description]
            .filter(Boolean)
            .some((value) => value.toLowerCase().includes(eventSearch.toLowerCase()))
    );

    return (
        <AdminLayout title="Manage PDA Items" subtitle="Programs and events showcased on the PDA home page.">
            <section className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <p className="text-xs uppercase tracking-[0.4em] text-slate-400">PDA Items</p>
                        <h2 className="text-2xl font-heading font-black">Create or Update Items</h2>
                    </div>
                    {editingItem ? (
                        <Button variant="outline" onClick={resetItemForm} className="border-black/10 text-sm">
                            Cancel Edit
                        </Button>
                    ) : null}
                </div>

                <form onSubmit={submitItem} className="mt-6 grid gap-4 md:grid-cols-2">
                    <div className="md:col-span-1">
                        <Label htmlFor="item-type">Type</Label>
                        <select
                            id="item-type"
                            name="type"
                            value={itemForm.type}
                            onChange={handleItemChange}
                            className="h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm"
                        >
                            <option value="program">Program</option>
                            <option value="event">Event</option>
                        </select>
                    </div>
                    <div className="md:col-span-1">
                        <Label htmlFor="item-title">Title</Label>
                        <Input
                            id="item-title"
                            name="title"
                            value={itemForm.title}
                            onChange={handleItemChange}
                            placeholder="Title"
                            required
                        />
                    </div>
                    <div className="md:col-span-1">
                        <Label htmlFor="item-tag">Tag</Label>
                        <Input
                            id="item-tag"
                            name="tag"
                            value={itemForm.tag}
                            onChange={handleItemChange}
                            placeholder="Career Guidance"
                        />
                    </div>
                    <div className="md:col-span-1">
                        <Label htmlFor="item-format">Format</Label>
                        <Input
                            id="item-format"
                            name="format"
                            value={itemForm.format}
                            onChange={handleItemChange}
                            placeholder="Offline (Rajam Hall)"
                        />
                    </div>
                    <div>
                        <Label htmlFor="item-start-date">Start Date (Optional)</Label>
                        <Input
                            id="item-start-date"
                            name="start_date"
                            type="date"
                            value={itemForm.start_date}
                            onChange={handleItemChange}
                        />
                    </div>
                    <div>
                        <Label htmlFor="item-end-date">End Date (Optional)</Label>
                        <Input
                            id="item-end-date"
                            name="end_date"
                            type="date"
                            value={itemForm.end_date}
                            onChange={handleItemChange}
                        />
                    </div>
                    <div className="md:col-span-2">
                        <Label htmlFor="item-poster">Poster URL</Label>
                        <Input
                            id="item-poster"
                            name="poster_url"
                            value={itemForm.poster_url}
                            onChange={handleItemChange}
                            placeholder="https://..."
                        />
                    </div>
                    <div className="md:col-span-2">
                        <Label htmlFor="item-poster-file">Or Upload Poster</Label>
                        <Input
                            id="item-poster-file"
                            name="poster_file"
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            onChange={(e) => setPosterFile(e.target.files?.[0] || null)}
                        />
                    </div>
                    <div className="md:col-span-2">
                        <Label htmlFor="item-description">Description</Label>
                        <Textarea
                            id="item-description"
                            name="description"
                            value={itemForm.description}
                            onChange={handleItemChange}
                            placeholder="Short description"
                            rows={4}
                        />
                    </div>
                    <div className="md:col-span-2">
                        <Label htmlFor="item-hero-caption">Hero Caption</Label>
                        <Textarea
                            id="item-hero-caption"
                            name="hero_caption"
                            value={itemForm.hero_caption}
                            onChange={handleItemChange}
                            placeholder="Caption for the homepage hero"
                            rows={3}
                        />
                    </div>
                    <div className="md:col-span-2">
                        <Label htmlFor="item-hero-url">Hero Redirect URL</Label>
                        <Input
                            id="item-hero-url"
                            name="hero_url"
                            value={itemForm.hero_url}
                            onChange={handleItemChange}
                            placeholder="https://..."
                        />
                    </div>
                    <div className="md:col-span-2 flex items-center gap-2">
                        <input
                            id="item-featured"
                            name="is_featured"
                            type="checkbox"
                            checked={itemForm.is_featured}
                            onChange={handleItemChange}
                            className="h-4 w-4"
                        />
                        <Label htmlFor="item-featured">Show this item in featured carousel</Label>
                    </div>
                    <div className="md:col-span-2 flex justify-end">
                        <Button type="submit" className="bg-[#f6c347] text-black hover:bg-[#ffd16b]" disabled={itemForm.type === 'program' ? savingProgram : savingEvent}>
                            {itemForm.type === 'program'
                                ? (savingProgram ? 'Saving...' : editingItem ? 'Update Program' : 'Create Program')
                                : (savingEvent ? 'Saving...' : editingItem ? 'Update Event' : 'Create Event')}
                        </Button>
                    </div>
                </form>

                <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <Label className="text-sm text-slate-600">Programs</Label>
                    <Input
                        value={programSearch}
                        onChange={(e) => setProgramSearch(e.target.value)}
                        placeholder="Search programs..."
                        className="md:max-w-sm"
                    />
                </div>
                <div className="mt-6 grid gap-4 md:grid-cols-2">
                    {filteredPrograms.length ? filteredPrograms.map((program) => (
                        <div key={program.id} className="rounded-2xl border border-black/10 bg-[#fffdf7] p-4">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <h3 className="text-lg font-heading font-bold">{program.title}</h3>
                                    {program.tag ? (
                                        <p className="text-xs uppercase tracking-[0.3em] text-[#b48900]">{program.tag}</p>
                                    ) : null}
                                    {program.is_featured ? (
                                        <p className="mt-1 text-xs font-semibold uppercase tracking-[0.3em] text-[#b48900]">
                                            Featured
                                        </p>
                                    ) : null}
                                </div>
                                <div className="flex gap-2">
                                    <Button variant="outline" onClick={() => editProgram(program)} className="border-black/10 text-xs">
                                        Edit
                                    </Button>
                                    <Button variant="outline" onClick={() => deleteProgram(program.id)} className="border-black/10 text-xs">
                                        Delete
                                    </Button>
                                    <Button
                                        variant="outline"
                                        onClick={() => toggleProgramFeatured(program.id, !program.is_featured)}
                                        className="border-black/10 text-xs"
                                    >
                                        {program.is_featured ? 'Unfeature' : 'Feature'}
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

                <div className="mt-8 rounded-2xl border border-dashed border-black/10 bg-white/70 p-4">
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Featured Programs</p>
                    {programs.filter(program => program.is_featured).length ? (
                        <div className="mt-4 grid gap-3 md:grid-cols-2">
                            {programs.filter(program => program.is_featured).map((program) => (
                                <div key={`featured-${program.id}`} className="rounded-2xl border border-black/10 bg-white p-4">
                                    <h3 className="text-base font-heading font-bold line-clamp-2 break-words">{program.title}</h3>
                                    {program.description ? (
                                        <p className="mt-2 text-sm text-slate-600 line-clamp-3 break-words">{program.description}</p>
                                    ) : null}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="mt-3 text-sm text-slate-500">No featured programs yet.</p>
                    )}
                </div>
            </section>

            <section className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <p className="text-xs uppercase tracking-[0.4em] text-slate-400">Events</p>
                        <h2 className="text-2xl font-heading font-black">Events</h2>
                    </div>
                </div>

                <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <Label className="text-sm text-slate-600">Events</Label>
                    <Input
                        value={eventSearch}
                        onChange={(e) => setEventSearch(e.target.value)}
                        placeholder="Search events..."
                        className="md:max-w-sm"
                    />
                </div>
                <div className="mt-6 grid gap-4 md:grid-cols-2">
                    {filteredEvents.length ? filteredEvents.map((event) => (
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
                                    <Button
                                        variant="outline"
                                        onClick={() => toggleEventFeatured(event.id, !event.is_featured)}
                                        className="border-black/10 text-xs"
                                    >
                                        {event.is_featured ? 'Unfeature' : 'Feature'}
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

                <div className="mt-8 rounded-2xl border border-dashed border-black/10 bg-white/70 p-4">
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Featured Events</p>
                    {events.filter(event => event.is_featured).length ? (
                        <div className="mt-4 grid gap-3 md:grid-cols-2">
                            {events.filter(event => event.is_featured).map((event) => (
                                <div key={`featured-${event.id}`} className="rounded-2xl border border-black/10 bg-white p-4">
                                    <h3 className="text-base font-heading font-bold line-clamp-2 break-words">{event.title}</h3>
                                    <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                                        {event.start_date || 'TBA'}{event.end_date ? ` → ${event.end_date}` : ''}
                                    </p>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="mt-3 text-sm text-slate-500">No featured events yet.</p>
                    )}
                </div>
            </section>
            {loading ? (
                <div className="rounded-3xl border border-black/10 bg-white p-8 text-center shadow-lg">
                    <p className="text-lg font-heading font-black">Loading PDA items...</p>
                </div>
            ) : null}
        </AdminLayout>
    );
}
