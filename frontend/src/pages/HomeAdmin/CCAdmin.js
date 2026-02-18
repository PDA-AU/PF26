import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import AdminLayout from '@/pages/HomeAdmin/AdminLayout';
import { useAuth } from '@/context/AuthContext';
import { ccAdminApi, uploadCcLogo } from '@/pages/HomeAdmin/ccAdminApi';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { compressImageToWebp } from '@/utils/imageCompression';

const EMPTY_CLUB = {
    name: '',
    profile_id: '',
    club_url: '',
    club_logo_url: '',
    club_tagline: '',
    club_description: '',
};

const EMPTY_COMMUNITY = {
    name: '',
    profile_id: '',
    club_id: 'none',
    admin_id: '',
    password: '',
    logo_url: '',
    description: '',
    is_active: true,
    is_root: false,
};

const EMPTY_SYMPO = {
    name: '',
    organising_club_id: '',
    content_text: '',
};

const parseApiError = (error, fallback) => {
    const detail = error?.response?.data?.detail;
    if (Array.isArray(detail)) {
        return detail.map((item) => item?.msg || item?.detail || JSON.stringify(item)).join(', ');
    }
    if (detail && typeof detail === 'object') {
        if (detail.message && Array.isArray(detail.event_ids)) {
            return `${detail.message}: ${detail.event_ids.join(', ')}`;
        }
        if (detail.message && Array.isArray(detail.missing_event_ids)) {
            return `${detail.message}: ${detail.missing_event_ids.join(', ')}`;
        }
        return detail.message || detail.msg || detail.detail || JSON.stringify(detail);
    }
    return detail || fallback;
};

const normalizeCommunityPayload = (form, isCreate) => {
    const payload = {
        name: form.name.trim(),
        club_id: form.club_id === 'none' ? null : Number(form.club_id),
        admin_id: Number(form.admin_id),
        logo_url: form.logo_url.trim() || null,
        description: form.description.trim() || null,
        is_active: Boolean(form.is_active),
        is_root: Boolean(form.is_root),
    };
    if (isCreate) {
        payload.profile_id = form.profile_id.trim().toLowerCase();
        payload.password = form.password;
    }
    return payload;
};

export default function CCAdmin() {
    const { isSuperAdmin, getAuthHeader } = useAuth();

    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [uploadingField, setUploadingField] = useState('');

    const [clubs, setClubs] = useState([]);
    const [communities, setCommunities] = useState([]);
    const [sympos, setSympos] = useState([]);
    const [adminOptions, setAdminOptions] = useState([]);
    const [eventOptions, setEventOptions] = useState([]);

    const [activeTab, setActiveTab] = useState('clubs');
    const [search, setSearch] = useState('');

    const [clubModalOpen, setClubModalOpen] = useState(false);
    const [clubEditing, setClubEditing] = useState(null);
    const [clubForm, setClubForm] = useState(EMPTY_CLUB);

    const [communityModalOpen, setCommunityModalOpen] = useState(false);
    const [communityEditing, setCommunityEditing] = useState(null);
    const [communityForm, setCommunityForm] = useState(EMPTY_COMMUNITY);

    const [sympoModalOpen, setSympoModalOpen] = useState(false);
    const [sympoEditing, setSympoEditing] = useState(null);
    const [sympoForm, setSympoForm] = useState(EMPTY_SYMPO);
    const [eventMapModalOpen, setEventMapModalOpen] = useState(false);
    const [eventMapTarget, setEventMapTarget] = useState(null);
    const [eventMapIds, setEventMapIds] = useState([]);

    const [passwordModalOpen, setPasswordModalOpen] = useState(false);
    const [passwordTarget, setPasswordTarget] = useState(null);
    const [newPassword, setNewPassword] = useState('');

    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [deleteState, setDeleteState] = useState({ label: '', onConfirm: null, estimate: '' });
    const [deleteConfirmText, setDeleteConfirmText] = useState('');

    const headers = useMemo(() => getAuthHeader(), [getAuthHeader]);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [clubsRes, communitiesRes, symposRes, adminRes, eventRes] = await Promise.all([
                ccAdminApi.listClubs(headers),
                ccAdminApi.listCommunities(headers),
                ccAdminApi.listSympos(headers),
                ccAdminApi.listAdminUserOptions(headers),
                ccAdminApi.listCommunityEventOptions(headers),
            ]);
            setClubs(clubsRes.data || []);
            setCommunities(communitiesRes.data || []);
            setSympos(symposRes.data || []);
            setAdminOptions(adminRes.data || []);
            setEventOptions(eventRes.data || []);
        } catch (error) {
            toast.error(parseApiError(error, 'Failed to load C&C data'));
        } finally {
            setLoading(false);
        }
    }, [headers]);

    useEffect(() => {
        if (isSuperAdmin) {
            loadData();
        }
    }, [isSuperAdmin, loadData]);

    const filteredClubs = useMemo(() => {
        const s = search.trim().toLowerCase();
        if (!s) return clubs;
        return clubs.filter((club) => [club.name, club.profile_id, club.club_tagline]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
            .includes(s));
    }, [clubs, search]);

    const filteredCommunities = useMemo(() => {
        const s = search.trim().toLowerCase();
        if (!s) return communities;
        return communities.filter((community) => [community.name, community.profile_id, community.club_name, community.admin_name]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
            .includes(s));
    }, [communities, search]);

    const filteredSympos = useMemo(() => {
        const s = search.trim().toLowerCase();
        if (!s) return sympos;
        return sympos.filter((sympo) => [sympo.name, sympo.organising_club_name, ...(sympo.event_titles || [])]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
            .includes(s));
    }, [sympos, search]);

    const handleLogoUpload = async (file, onValue) => {
        if (!file) return;
        setUploadingField('logo');
        try {
            const processed = await compressImageToWebp(file);
            const url = await uploadCcLogo(processed, getAuthHeader);
            onValue(url);
            toast.success('Logo uploaded');
        } catch (error) {
            toast.error(parseApiError(error, 'Logo upload failed'));
        } finally {
            setUploadingField('');
        }
    };

    const openClubModal = (club = null) => {
        setClubEditing(club);
        setClubForm(club ? {
            name: club.name || '',
            profile_id: club.profile_id || '',
            club_url: club.club_url || '',
            club_logo_url: club.club_logo_url || '',
            club_tagline: club.club_tagline || '',
            club_description: club.club_description || '',
        } : EMPTY_CLUB);
        setClubModalOpen(true);
    };

    const submitClub = async (e) => {
        e.preventDefault();
        if (submitting) return;
        setSubmitting(true);
        try {
            const payload = {
                name: clubForm.name.trim(),
                profile_id: clubForm.profile_id.trim().toLowerCase(),
                club_url: clubForm.club_url.trim() || null,
                club_logo_url: clubForm.club_logo_url.trim() || null,
                club_tagline: clubForm.club_tagline.trim() || null,
                club_description: clubForm.club_description.trim() || null,
            };
            if (clubEditing) {
                await ccAdminApi.updateClub(clubEditing.id, payload, headers);
                toast.success('Club updated');
            } else {
                await ccAdminApi.createClub(payload, headers);
                toast.success('Club created');
            }
            setClubModalOpen(false);
            await loadData();
        } catch (error) {
            toast.error(parseApiError(error, 'Failed to save club'));
        } finally {
            setSubmitting(false);
        }
    };

    const openCommunityModal = (community = null) => {
        setCommunityEditing(community);
        setCommunityForm(community ? {
            name: community.name || '',
            profile_id: community.profile_id || '',
            club_id: community.club_id ? String(community.club_id) : 'none',
            admin_id: community.admin_id ? String(community.admin_id) : '',
            password: '',
            logo_url: community.logo_url || '',
            description: community.description || '',
            is_active: Boolean(community.is_active),
            is_root: Boolean(community.is_root),
        } : EMPTY_COMMUNITY);
        setCommunityModalOpen(true);
    };

    const submitCommunity = async (e) => {
        e.preventDefault();
        if (submitting) return;
        setSubmitting(true);
        try {
            const isCreate = !communityEditing;
            const payload = normalizeCommunityPayload(communityForm, isCreate);
            if (isCreate) {
                await ccAdminApi.createCommunity(payload, headers);
                toast.success('Community created');
            } else {
                await ccAdminApi.updateCommunity(communityEditing.id, payload, headers);
                toast.success('Community updated');
            }
            setCommunityModalOpen(false);
            await loadData();
        } catch (error) {
            toast.error(parseApiError(error, 'Failed to save community'));
        } finally {
            setSubmitting(false);
        }
    };

    const openResetPassword = (community) => {
        setPasswordTarget(community);
        setNewPassword('');
        setPasswordModalOpen(true);
    };

    const submitResetPassword = async (e) => {
        e.preventDefault();
        if (!passwordTarget || submitting) return;
        setSubmitting(true);
        try {
            await ccAdminApi.resetCommunityPassword(passwordTarget.id, { new_password: newPassword }, headers);
            toast.success('Community password reset');
            setPasswordModalOpen(false);
        } catch (error) {
            toast.error(parseApiError(error, 'Failed to reset password'));
        } finally {
            setSubmitting(false);
        }
    };

    const openSympoModal = (sympo = null) => {
        setSympoEditing(sympo);
        setSympoForm(sympo ? {
            name: sympo.name || '',
            organising_club_id: sympo.organising_club_id ? String(sympo.organising_club_id) : '',
            content_text: sympo.content ? JSON.stringify(sympo.content, null, 2) : '',
        } : EMPTY_SYMPO);
        setSympoModalOpen(true);
    };

    const openEventMapModal = (sympo) => {
        setEventMapTarget(sympo);
        setEventMapIds((sympo.event_ids || []).map((id) => Number(id)));
        setEventMapModalOpen(true);
    };

    const toggleEventMapId = (eventId) => {
        setEventMapIds((prev) => {
            const has = prev.includes(eventId);
            return has ? prev.filter((id) => id !== eventId) : [...prev, eventId];
        });
    };

    const submitSympo = async (e) => {
        e.preventDefault();
        if (submitting) return;

        let content = null;
        if (sympoForm.content_text.trim()) {
            try {
                content = JSON.parse(sympoForm.content_text);
            } catch {
                toast.error('Sympo content must be valid JSON');
                return;
            }
        }

        setSubmitting(true);
        try {
            const payload = {
                name: sympoForm.name.trim(),
                organising_club_id: Number(sympoForm.organising_club_id),
            };
            if (sympoEditing) {
                payload.content = content;
            }
            if (sympoEditing) {
                await ccAdminApi.updateSympo(sympoEditing.id, payload, headers);
                toast.success('Sympo updated');
            } else {
                await ccAdminApi.createSympo(payload, headers);
                toast.success('Sympo created');
            }
            setSympoModalOpen(false);
            await loadData();
        } catch (error) {
            toast.error(parseApiError(error, 'Failed to save sympo'));
        } finally {
            setSubmitting(false);
        }
    };

    const submitEventMapping = async (e) => {
        e.preventDefault();
        if (!eventMapTarget || submitting) return;
        setSubmitting(true);
        try {
            await ccAdminApi.updateSympo(eventMapTarget.id, { event_ids: eventMapIds }, headers);
            toast.success('Sympo events updated');
            setEventMapModalOpen(false);
            await loadData();
        } catch (error) {
            toast.error(parseApiError(error, 'Failed to update sympo events'));
        } finally {
            setSubmitting(false);
        }
    };

    const openDeleteDialog = ({ label, estimate = '', onConfirm }) => {
        setDeleteState({ label, estimate, onConfirm });
        setDeleteConfirmText('');
        setDeleteModalOpen(true);
    };

    const confirmDelete = async () => {
        if (deleteConfirmText.trim() !== 'DELETE' || !deleteState.onConfirm) return;
        setSubmitting(true);
        try {
            const res = await deleteState.onConfirm();
            const counts = res?.data?.deleted_counts;
            const summary = counts ? Object.entries(counts).map(([key, value]) => `${key}: ${value}`).join(', ') : '';
            toast.success(summary ? `Deleted. ${summary}` : 'Deleted successfully');
            setDeleteModalOpen(false);
            await loadData();
        } catch (error) {
            toast.error(parseApiError(error, 'Delete failed'));
        } finally {
            setSubmitting(false);
        }
    };

    const clubsById = useMemo(() => {
        const map = {};
        for (const club of clubs) map[club.id] = club;
        return map;
    }, [clubs]);

    return (
        <AdminLayout title="C&C" subtitle="Manage Persohub clubs, communities, and sympos." allowEventAdmin>
            <section className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder={`Search ${activeTab}`}
                        className="max-w-md"
                    />
                    <div className="flex gap-2">
                        {activeTab === 'clubs' ? <Button onClick={() => openClubModal()}>Add Club</Button> : null}
                        {activeTab === 'communities' ? <Button onClick={() => openCommunityModal()}>Add Community</Button> : null}
                        {activeTab === 'sympos' ? <Button onClick={() => openSympoModal()}>Add Sympo</Button> : null}
                    </div>
                </div>

                <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList className="grid w-full grid-cols-3 md:w-[420px]">
                        <TabsTrigger value="clubs">Clubs</TabsTrigger>
                        <TabsTrigger value="communities">Communities</TabsTrigger>
                        <TabsTrigger value="sympos">Sympos</TabsTrigger>
                    </TabsList>

                    <TabsContent value="clubs" className="space-y-3">
                        <div className="hidden md:block rounded-2xl border border-black/10 bg-white overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50">
                                    <tr>
                                        <th className="px-3 py-2 text-left">Name</th>
                                        <th className="px-3 py-2 text-left">Profile ID</th>
                                        <th className="px-3 py-2 text-left">Linked Communities</th>
                                        <th className="px-3 py-2 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredClubs.map((club) => (
                                        <tr key={club.id} className="border-t border-black/10">
                                            <td className="px-3 py-2">{club.name}</td>
                                            <td className="px-3 py-2">{club.profile_id}</td>
                                            <td className="px-3 py-2">{club.linked_community_count}</td>
                                            <td className="px-3 py-2 text-right space-x-2">
                                                <Button variant="outline" size="sm" onClick={() => openClubModal(club)}>Edit</Button>
                                                <Button
                                                    variant="destructive"
                                                    size="sm"
                                                    onClick={() => openDeleteDialog({
                                                        label: `Delete club ${club.name}`,
                                                        estimate: `Estimated linked communities: ${club.linked_community_count}`,
                                                        onConfirm: () => ccAdminApi.deleteClub(club.id, headers),
                                                    })}
                                                >
                                                    Delete
                                                </Button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="space-y-2 md:hidden">
                            {filteredClubs.map((club) => (
                                <div key={club.id} className="rounded-2xl border border-black/10 bg-white p-3">
                                    <p className="font-semibold">{club.name}</p>
                                    <p className="text-xs text-slate-500">{club.profile_id}</p>
                                    <p className="text-xs mt-1">Linked communities: {club.linked_community_count}</p>
                                    <div className="mt-3 flex gap-2">
                                        <Button variant="outline" size="sm" onClick={() => openClubModal(club)}>Edit</Button>
                                        <Button variant="destructive" size="sm" onClick={() => openDeleteDialog({
                                            label: `Delete club ${club.name}`,
                                            estimate: `Estimated linked communities: ${club.linked_community_count}`,
                                            onConfirm: () => ccAdminApi.deleteClub(club.id, headers),
                                        })}>Delete</Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </TabsContent>

                    <TabsContent value="communities" className="space-y-2">
                        {filteredCommunities.map((community) => (
                            <div key={community.id} className="rounded-2xl border border-black/10 bg-white p-4">
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                    <div>
                                        <p className="font-semibold">{community.name}</p>
                                        <p className="text-xs text-slate-500">{community.profile_id}</p>
                                        <p className="text-xs text-slate-500">Club: {community.club_name || '—'} | Admin: {community.admin_name || '—'} ({community.admin_regno || '—'})</p>
                                        <p className="text-xs text-slate-500">Active: {community.is_active ? 'Yes' : 'No'} | Root: {community.is_root ? 'Yes' : 'No'}</p>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <Button variant="outline" size="sm" onClick={() => openCommunityModal(community)}>Edit</Button>
                                        <Button variant="outline" size="sm" onClick={() => openResetPassword(community)}>Reset Password</Button>
                                        <Button
                                            variant="destructive"
                                            size="sm"
                                            onClick={() => openDeleteDialog({
                                                label: `Delete community ${community.name}`,
                                                onConfirm: () => ccAdminApi.deleteCommunity(community.id, headers),
                                            })}
                                        >
                                            Delete
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </TabsContent>

                    <TabsContent value="sympos" className="space-y-2">
                        {filteredSympos.map((sympo) => (
                            <div key={sympo.id} className="rounded-2xl border border-black/10 bg-white p-4">
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                    <div>
                                        <p className="font-semibold">{sympo.name}</p>
                                        <p className="text-xs text-slate-500">Organising club: {sympo.organising_club_name || '—'}</p>
                                        <p className="text-xs text-slate-500">Events: {(sympo.event_titles || []).join(', ') || '—'}</p>
                                    </div>
                                    <div className="flex gap-2">
                                        <Button variant="outline" size="sm" onClick={() => openSympoModal(sympo)}>Edit</Button>
                                        <Button variant="outline" size="sm" onClick={() => openEventMapModal(sympo)}>Add Events</Button>
                                        <Button
                                            variant="destructive"
                                            size="sm"
                                            onClick={() => openDeleteDialog({
                                                label: `Delete sympo ${sympo.name}`,
                                                estimate: `Event links: ${(sympo.event_ids || []).length}`,
                                                onConfirm: () => ccAdminApi.deleteSympo(sympo.id, headers),
                                            })}
                                        >
                                            Delete
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </TabsContent>
                </Tabs>
            </section>

            <Dialog open={clubModalOpen} onOpenChange={setClubModalOpen}>
                <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
                    <DialogHeader>
                        <DialogTitle>{clubEditing ? 'Edit Club' : 'Create Club'}</DialogTitle>
                    </DialogHeader>
                    <form className="space-y-4" onSubmit={submitClub}>
                        <div className="grid gap-2">
                            <Label>Club Name</Label>
                            <Input value={clubForm.name} onChange={(e) => setClubForm((p) => ({ ...p, name: e.target.value }))} required />
                        </div>
                        <div className="grid gap-2">
                            <Label>Profile ID</Label>
                            <Input value={clubForm.profile_id} onChange={(e) => setClubForm((p) => ({ ...p, profile_id: e.target.value }))} required />
                        </div>
                        <div className="grid gap-2">
                            <Label>Logo URL</Label>
                            <Input value={clubForm.club_logo_url} onChange={(e) => setClubForm((p) => ({ ...p, club_logo_url: e.target.value }))} />
                            <Input
                                type="file"
                                accept="image/png,image/jpeg,image/webp"
                                onChange={(e) => handleLogoUpload(e.target.files?.[0], (url) => setClubForm((p) => ({ ...p, club_logo_url: url })))}
                                disabled={uploadingField === 'logo'}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label>Club URL</Label>
                            <Input value={clubForm.club_url} onChange={(e) => setClubForm((p) => ({ ...p, club_url: e.target.value }))} />
                        </div>
                        <div className="grid gap-2">
                            <Label>Tagline</Label>
                            <Input value={clubForm.club_tagline} onChange={(e) => setClubForm((p) => ({ ...p, club_tagline: e.target.value }))} />
                        </div>
                        <div className="grid gap-2">
                            <Label>Description</Label>
                            <Textarea rows={4} value={clubForm.club_description} onChange={(e) => setClubForm((p) => ({ ...p, club_description: e.target.value }))} />
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button type="button" variant="outline" onClick={() => setClubModalOpen(false)}>Cancel</Button>
                            <Button type="submit" disabled={submitting}>{submitting ? 'Saving...' : 'Save'}</Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>

            <Dialog open={communityModalOpen} onOpenChange={setCommunityModalOpen}>
                <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
                    <DialogHeader>
                        <DialogTitle>{communityEditing ? 'Edit Community' : 'Create Community'}</DialogTitle>
                    </DialogHeader>
                    <form className="space-y-4" onSubmit={submitCommunity}>
                        <div className="grid gap-2">
                            <Label>Name</Label>
                            <Input value={communityForm.name} onChange={(e) => setCommunityForm((p) => ({ ...p, name: e.target.value }))} required />
                        </div>
                        <div className="grid gap-2">
                            <Label>Profile ID</Label>
                            <Input
                                value={communityForm.profile_id}
                                onChange={(e) => setCommunityForm((p) => ({ ...p, profile_id: e.target.value }))}
                                required
                                disabled={Boolean(communityEditing)}
                            />
                        </div>
                        {!communityEditing ? (
                            <div className="grid gap-2">
                                <Label>Password</Label>
                                <Input
                                    type="password"
                                    value={communityForm.password}
                                    onChange={(e) => setCommunityForm((p) => ({ ...p, password: e.target.value }))}
                                    required
                                    minLength={8}
                                />
                            </div>
                        ) : null}
                        <div className="grid gap-2">
                            <Label>Club</Label>
                            <Select value={communityForm.club_id} onValueChange={(v) => setCommunityForm((p) => ({ ...p, club_id: v }))}>
                                <SelectTrigger><SelectValue placeholder="Select club" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">No club</SelectItem>
                                    {clubs.map((club) => <SelectItem key={club.id} value={String(club.id)}>{club.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid gap-2">
                            <Label>Admin User</Label>
                            <Select value={communityForm.admin_id} onValueChange={(v) => setCommunityForm((p) => ({ ...p, admin_id: v }))}>
                                <SelectTrigger><SelectValue placeholder="Select admin" /></SelectTrigger>
                                <SelectContent>
                                    {adminOptions.map((user) => (
                                        <SelectItem key={user.id} value={String(user.id)}>{user.name} ({user.regno})</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid gap-2">
                            <Label>Logo URL</Label>
                            <Input value={communityForm.logo_url} onChange={(e) => setCommunityForm((p) => ({ ...p, logo_url: e.target.value }))} />
                            <Input
                                type="file"
                                accept="image/png,image/jpeg,image/webp"
                                onChange={(e) => handleLogoUpload(e.target.files?.[0], (url) => setCommunityForm((p) => ({ ...p, logo_url: url })))}
                                disabled={uploadingField === 'logo'}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label>Description</Label>
                            <Textarea rows={4} value={communityForm.description} onChange={(e) => setCommunityForm((p) => ({ ...p, description: e.target.value }))} />
                        </div>
                        <label className="flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={communityForm.is_active} onChange={(e) => setCommunityForm((p) => ({ ...p, is_active: e.target.checked }))} />
                            Active
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={communityForm.is_root} onChange={(e) => setCommunityForm((p) => ({ ...p, is_root: e.target.checked }))} />
                            Root community
                        </label>
                        <div className="flex justify-end gap-2">
                            <Button type="button" variant="outline" onClick={() => setCommunityModalOpen(false)}>Cancel</Button>
                            <Button type="submit" disabled={submitting}>{submitting ? 'Saving...' : 'Save'}</Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>

            <Dialog open={sympoModalOpen} onOpenChange={setSympoModalOpen}>
                <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>{sympoEditing ? 'Edit Sympo' : 'Create Sympo'}</DialogTitle>
                    </DialogHeader>
                    <form className="space-y-4" onSubmit={submitSympo}>
                        <div className="grid gap-2">
                            <Label>Name</Label>
                            <Input value={sympoForm.name} onChange={(e) => setSympoForm((p) => ({ ...p, name: e.target.value }))} required />
                        </div>
                        <div className="grid gap-2">
                            <Label>Organising Club</Label>
                            <Select value={sympoForm.organising_club_id} onValueChange={(v) => setSympoForm((p) => ({ ...p, organising_club_id: v }))}>
                                <SelectTrigger><SelectValue placeholder="Select club" /></SelectTrigger>
                                <SelectContent>
                                    {clubs.map((club) => <SelectItem key={club.id} value={String(club.id)}>{club.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        {sympoEditing ? (
                            <div className="grid gap-2">
                                <Label>Content (JSON)</Label>
                                <Textarea rows={8} value={sympoForm.content_text} onChange={(e) => setSympoForm((p) => ({ ...p, content_text: e.target.value }))} />
                            </div>
                        ) : null}
                        <div className="flex justify-end gap-2">
                            <Button type="button" variant="outline" onClick={() => setSympoModalOpen(false)}>Cancel</Button>
                            <Button type="submit" disabled={submitting}>{submitting ? 'Saving...' : 'Save'}</Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>

            <Dialog open={eventMapModalOpen} onOpenChange={setEventMapModalOpen}>
                <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Add Events: {eventMapTarget?.name || ''}</DialogTitle>
                    </DialogHeader>
                    <form className="space-y-4" onSubmit={submitEventMapping}>
                        <div className="grid gap-2">
                            <Label>Map Events</Label>
                            <div className="max-h-64 overflow-y-auto rounded-lg border border-black/10 p-2 space-y-1">
                                {eventOptions.map((event) => (
                                    <label key={event.id} className="flex items-start gap-2 text-sm p-1 rounded hover:bg-slate-50">
                                        <input
                                            type="checkbox"
                                            checked={eventMapIds.includes(event.id)}
                                            onChange={() => toggleEventMapId(event.id)}
                                        />
                                        <span>{event.title} <span className="text-slate-500">({event.slug})</span></span>
                                    </label>
                                ))}
                            </div>
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button type="button" variant="outline" onClick={() => setEventMapModalOpen(false)}>Cancel</Button>
                            <Button type="submit" disabled={submitting}>{submitting ? 'Saving...' : 'Save Events'}</Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>

            <Dialog open={passwordModalOpen} onOpenChange={setPasswordModalOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Reset Password: {passwordTarget?.name || ''}</DialogTitle>
                    </DialogHeader>
                    <form className="space-y-4" onSubmit={submitResetPassword}>
                        <div className="grid gap-2">
                            <Label>New Password</Label>
                            <Input type="password" minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button type="button" variant="outline" onClick={() => setPasswordModalOpen(false)}>Cancel</Button>
                            <Button type="submit" disabled={submitting}>{submitting ? 'Resetting...' : 'Reset Password'}</Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>

            <Dialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>{deleteState.label}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3 text-sm">
                        <p className="text-slate-700">This is a hard delete and will cascade to dependent data.</p>
                        {deleteState.estimate ? <p className="text-slate-500">{deleteState.estimate}</p> : null}
                        <div className="grid gap-2">
                            <Label>Type `DELETE` to confirm</Label>
                            <Input value={deleteConfirmText} onChange={(e) => setDeleteConfirmText(e.target.value)} />
                        </div>
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" onClick={() => setDeleteModalOpen(false)}>Cancel</Button>
                        <Button type="button" variant="destructive" onClick={confirmDelete} disabled={deleteConfirmText.trim() !== 'DELETE' || submitting}>
                            {submitting ? 'Deleting...' : 'Delete'}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {loading ? <p className="text-sm text-slate-500">Loading C&C data...</p> : null}
        </AdminLayout>
    );
}
