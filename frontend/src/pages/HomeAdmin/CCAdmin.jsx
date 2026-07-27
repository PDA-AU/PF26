import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight } from 'lucide-react';

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
    owner_user_id: '',
};

const EMPTY_COMMUNITY = {
    name: '',
    profile_id: '',
    club_id: 'none',
    admins: [{ row_id: 'admin-0', user_id: '', is_active: true }],
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
const EVENTS_PAGE_SIZE = 20;
const makeAdminRowId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

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
    const normalizedAdmins = (form.admins || [])
        .filter((item) => item?.user_id && String(item.user_id).trim())
        .map((item) => ({
            user_id: Number(item.user_id),
            is_active: Boolean(item.is_active),
        }));

    const activeAdmins = normalizedAdmins.filter((item) => item.is_active);
    if (!activeAdmins.length) {
        throw new Error('At least one active admin is required');
    }

    const payload = {
        name: form.name.trim(),
        club_id: form.club_id === 'none' ? null : Number(form.club_id),
        admin_id: Number(activeAdmins[0].user_id),
        admins: normalizedAdmins,
        logo_url: form.logo_url.trim() || null,
        description: form.description.trim() || null,
        is_active: Boolean(form.is_active),
        is_root: Boolean(form.is_root),
    };
    if (isCreate) {
        payload.profile_id = form.profile_id.trim().toLowerCase();
    }
    return payload;
};

export default function CCAdmin() {
    const { isSuperAdmin, getAuthHeader } = useAuth();

    const [loading, setLoading] = useState(true);
    const [eventsLoading, setEventsLoading] = useState(false);
    const [adminOptionsLoading, setAdminOptionsLoading] = useState(false);
    const [eventOptionsLoading, setEventOptionsLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [uploadingField, setUploadingField] = useState('');

    const [clubs, setClubs] = useState([]);
    const [communities, setCommunities] = useState([]);
    const [sympos, setSympos] = useState([]);
    const [adminOptions, setAdminOptions] = useState([]);
    const [eventOptions, setEventOptions] = useState([]);
    const [events, setEvents] = useState([]);

    const [activeTab, setActiveTab] = useState('clubs');
    const [search, setSearch] = useState('');
    const [eventsQuery, setEventsQuery] = useState('');
    const [eventsQueryDebounced, setEventsQueryDebounced] = useState('');
    const [eventsPage, setEventsPage] = useState(1);
    const [eventsTotalCount, setEventsTotalCount] = useState(0);
    const [assigningEventId, setAssigningEventId] = useState(null);
    const [reviewingEventAccessId, setReviewingEventAccessId] = useState(null);
    const [eventSympoDrafts, setEventSympoDrafts] = useState({});

    const [clubModalOpen, setClubModalOpen] = useState(false);
    const [clubEditing, setClubEditing] = useState(null);
    const [clubForm, setClubForm] = useState(EMPTY_CLUB);

    const [communityModalOpen, setCommunityModalOpen] = useState(false);
    const [communityEditing, setCommunityEditing] = useState(null);
    const [communityForm, setCommunityForm] = useState(EMPTY_COMMUNITY);
    const [communityAdminSearch, setCommunityAdminSearch] = useState('');

    const [sympoModalOpen, setSympoModalOpen] = useState(false);
    const [sympoEditing, setSympoEditing] = useState(null);
    const [sympoForm, setSympoForm] = useState(EMPTY_SYMPO);
    const [eventMapModalOpen, setEventMapModalOpen] = useState(false);
    const [eventMapTarget, setEventMapTarget] = useState(null);
    const [eventMapIds, setEventMapIds] = useState([]);

    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [deleteState, setDeleteState] = useState({ label: '', onConfirm: null, estimate: '', expectedText: 'DELETE', warning: '' });
    const [deleteConfirmText, setDeleteConfirmText] = useState('');

    const headers = useMemo(() => getAuthHeader(), [getAuthHeader]);

    useEffect(() => {
        const timer = setTimeout(() => setEventsQueryDebounced(eventsQuery.trim()), 250);
        return () => clearTimeout(timer);
    }, [eventsQuery]);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [clubsRes, communitiesRes, symposRes] = await Promise.all([
                ccAdminApi.listClubs(headers),
                ccAdminApi.listCommunities(headers),
                ccAdminApi.listSympos(headers),
            ]);
            setClubs(clubsRes.data || []);
            setCommunities(communitiesRes.data || []);
            setSympos(symposRes.data || []);
        } catch (error) {
            toast.error(parseApiError(error, 'Failed to load C&C data'));
        } finally {
            setLoading(false);
        }
    }, [headers]);

    const loadAdminOptions = useCallback(async () => {
        if (adminOptionsLoading || adminOptions.length) return;
        setAdminOptionsLoading(true);
        try {
            const response = await ccAdminApi.listAdminUserOptions(headers);
            setAdminOptions(response?.data || []);
        } catch (error) {
            toast.error(parseApiError(error, 'Failed to load admin user options'));
        } finally {
            setAdminOptionsLoading(false);
        }
    }, [headers, adminOptionsLoading, adminOptions.length]);

    const loadEventOptions = useCallback(async () => {
        if (eventOptionsLoading) return;
        setEventOptionsLoading(true);
        try {
            const response = await ccAdminApi.listPersohubEventOptions(headers, { page: 1, page_size: 200 });
            setEventOptions(response?.data || []);
        } catch (error) {
            toast.error(parseApiError(error, 'Failed to load event options'));
        } finally {
            setEventOptionsLoading(false);
        }
    }, [headers, eventOptionsLoading]);

    const loadEventsPage = useCallback(async () => {
        setEventsLoading(true);
        try {
            const response = await ccAdminApi.listPersohubEventOptions(headers, {
                page: eventsPage,
                page_size: EVENTS_PAGE_SIZE,
                q: eventsQueryDebounced || undefined,
            });
            const rows = response?.data || [];
            const total = Number(response?.headers?.['x-total-count'] || 0);
            setEvents(rows);
            setEventsTotalCount(total);
            setEventSympoDrafts(
                rows.reduce((acc, row) => {
                    acc[row.id] = row.sympo_id ? String(row.sympo_id) : 'none';
                    return acc;
                }, {})
            );
        } catch (error) {
            toast.error(parseApiError(error, 'Failed to load events'));
        } finally {
            setEventsLoading(false);
        }
    }, [headers, eventsPage, eventsQueryDebounced]);

    useEffect(() => {
        if (isSuperAdmin) {
            loadData();
        }
    }, [isSuperAdmin, loadData]);

    useEffect(() => {
        if (!isSuperAdmin || activeTab !== 'events') return;
        loadEventsPage();
    }, [isSuperAdmin, activeTab, loadEventsPage]);

    const refreshData = useCallback(async () => {
        await loadData();
        if (activeTab === 'events') {
            await loadEventsPage();
        }
    }, [activeTab, loadData, loadEventsPage]);

    const filteredClubs = useMemo(() => {
        const s = search.trim().toLowerCase();
        if (!s) return clubs;
        return clubs.filter((club) => [club.name, club.profile_id, club.club_tagline, club.owner_name, club.owner_regno]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
            .includes(s));
    }, [clubs, search]);

    const filteredCommunities = useMemo(() => {
        const s = search.trim().toLowerCase();
        if (!s) return communities;
        return communities.filter((community) => {
            const adminNames = (community.admins || []).map((item) => item.name).filter(Boolean).join(' ');
            return [community.name, community.profile_id, community.club_name, community.admin_name, adminNames]
                .filter(Boolean)
                .join(' ')
                .toLowerCase()
                .includes(s);
        });
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

    const totalEventPages = useMemo(() => {
        if (!eventsTotalCount) return 1;
        return Math.max(1, Math.ceil(eventsTotalCount / EVENTS_PAGE_SIZE));
    }, [eventsTotalCount]);

    const eventRangeLabel = useMemo(() => {
        if (!eventsTotalCount) return '0-0';
        const start = (eventsPage - 1) * EVENTS_PAGE_SIZE + 1;
        const end = Math.min(eventsTotalCount, eventsPage * EVENTS_PAGE_SIZE);
        return `${start}-${end}`;
    }, [eventsPage, eventsTotalCount]);

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
        loadAdminOptions();
        setClubEditing(club);
        setClubForm(club ? {
            name: club.name || '',
            profile_id: club.profile_id || '',
            club_url: club.club_url || '',
            club_logo_url: club.club_logo_url || '',
            club_tagline: club.club_tagline || '',
            club_description: club.club_description || '',
            owner_user_id: club.owner_user_id ? String(club.owner_user_id) : '',
        } : EMPTY_CLUB);
        setClubModalOpen(true);
    };

    const submitClub = async (e) => {
        e.preventDefault();
        if (submitting) return;
        if (!clubForm.owner_user_id || !String(clubForm.owner_user_id).trim()) {
            toast.error('Select a club owner');
            return;
        }
        setSubmitting(true);
        try {
            const payload = {
                name: clubForm.name.trim(),
                profile_id: clubForm.profile_id.trim().toLowerCase(),
                club_url: clubForm.club_url.trim() || null,
                club_logo_url: clubForm.club_logo_url.trim() || null,
                club_tagline: clubForm.club_tagline.trim() || null,
                club_description: clubForm.club_description.trim() || null,
                owner_user_id: clubForm.owner_user_id ? Number(clubForm.owner_user_id) : null,
            };
            if (clubEditing) {
                await ccAdminApi.updateClub(clubEditing.id, payload, headers);
                toast.success('Club updated');
            } else {
                await ccAdminApi.createClub(payload, headers);
                toast.success('Club created');
            }
            setClubModalOpen(false);
            await refreshData();
        } catch (error) {
            toast.error(parseApiError(error, 'Failed to save club'));
        } finally {
            setSubmitting(false);
        }
    };

    const openCommunityModal = (community = null) => {
        loadAdminOptions();
        setCommunityEditing(community);
        setCommunityAdminSearch('');
        const sourceAdmins = (community?.admins || []).length
            ? community.admins
            : (community?.admin_id ? [{
                user_id: Number(community.admin_id),
                is_active: true,
            }] : [{ user_id: '', is_active: true }]);
        setCommunityForm(community ? {
            name: community.name || '',
            profile_id: community.profile_id || '',
            club_id: community.club_id ? String(community.club_id) : 'none',
            admins: sourceAdmins.map((item, index) => ({
                row_id: `edit-${index}-${makeAdminRowId()}`,
                user_id: item.user_id ? String(item.user_id) : '',
                is_active: item.is_active !== false,
            })),
            logo_url: community.logo_url || '',
            description: community.description || '',
            is_active: Boolean(community.is_active),
            is_root: Boolean(community.is_root),
        } : {
            ...EMPTY_COMMUNITY,
            admins: [{ row_id: `new-${makeAdminRowId()}`, user_id: '', is_active: true }],
        });
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
            await refreshData();
        } catch (error) {
            toast.error(parseApiError(error, 'Failed to save community'));
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
        loadEventOptions();
    };

    const toggleEventMapId = (eventId) => {
        setEventMapIds((prev) => {
            const has = prev.includes(eventId);
            return has ? prev.filter((id) => id !== eventId) : [...prev, eventId];
        });
    };

    const assignEventToSympo = async (eventRow) => {
        if (assigningEventId) return;
        const currentSympoValue = eventRow.sympo_id ? String(eventRow.sympo_id) : 'none';
        const draftValue = eventSympoDrafts[eventRow.id] || currentSympoValue;
        if (draftValue === currentSympoValue) return;
        setAssigningEventId(eventRow.id);
        try {
            const payload = {
                sympo_id: draftValue === 'none' ? null : Number(draftValue),
            };
            const response = await ccAdminApi.assignPersohubEventSympo(eventRow.id, payload, headers);
            toast.success(response?.data?.message || 'Event mapping updated');
            await refreshData();
        } catch (error) {
            toast.error(parseApiError(error, 'Failed to update event mapping'));
        } finally {
            setAssigningEventId(null);
        }
    };

    const reviewEventAccess = async (eventRow, nextStatus) => {
        if (!eventRow?.id || reviewingEventAccessId) return;
        setReviewingEventAccessId(eventRow.id);
        try {
            const apiCall = nextStatus === 'approved'
                ? ccAdminApi.approvePersohubEventAccess(eventRow.id, {}, headers)
                : ccAdminApi.rejectPersohubEventAccess(eventRow.id, {}, headers);
            const response = await apiCall;
            toast.success(response?.data?.persohub_access_status === 'approved' ? 'Event access approved' : 'Event access rejected');
            await refreshData();
        } catch (error) {
            toast.error(parseApiError(error, 'Failed to update event access'));
        } finally {
            setReviewingEventAccessId(null);
        }
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
            await refreshData();
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
            await refreshData();
        } catch (error) {
            toast.error(parseApiError(error, 'Failed to update sympo events'));
        } finally {
            setSubmitting(false);
        }
    };

    const openDeleteDialog = ({ label, estimate = '', onConfirm, expectedText = 'DELETE', warning = '' }) => {
        setDeleteState({ label, estimate, onConfirm, expectedText, warning });
        setDeleteConfirmText('');
        setDeleteModalOpen(true);
    };

    const confirmDelete = async () => {
        if (deleteConfirmText.trim() !== String(deleteState.expectedText || 'DELETE') || !deleteState.onConfirm) return;
        setSubmitting(true);
        try {
            const res = await deleteState.onConfirm();
            const counts = res?.data?.deleted_counts;
            const summary = counts ? Object.entries(counts).map(([key, value]) => `${key}: ${value}`).join(', ') : '';
            toast.success(summary ? `Deleted. ${summary}` : 'Deleted successfully');
            setDeleteModalOpen(false);
            await refreshData();
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

    const usedCommunityAdminIds = useMemo(() => {
        return new Set((communityForm.admins || []).map((item) => String(item.user_id || '')).filter(Boolean));
    }, [communityForm.admins]);

    const filteredCommunityAdminOptions = useMemo(() => {
        const query = String(communityAdminSearch || '').trim().toLowerCase();
        if (!query) return adminOptions;
        return (adminOptions || []).filter((user) => (
            `${user.name || ''} ${user.regno || ''} ${user.id || ''}`.toLowerCase().includes(query)
        ));
    }, [adminOptions, communityAdminSearch]);

    const communityAdminSuggestions = useMemo(() => {
        const query = String(communityAdminSearch || '').trim();
        if (!query) return [];
        return (filteredCommunityAdminOptions || [])
            .filter((user) => !usedCommunityAdminIds.has(String(user.id)))
            .slice(0, 8);
    }, [filteredCommunityAdminOptions, usedCommunityAdminIds, communityAdminSearch]);

    const applyCommunityAdminSuggestion = (userId) => {
        const nextUserId = String(userId || '');
        if (!nextUserId) return;
        if (usedCommunityAdminIds.has(nextUserId)) {
            toast.error('Admin already added');
            return;
        }
        setCommunityForm((prev) => {
            const rows = [...(prev.admins || [])];
            const emptyRowIndex = rows.findIndex((row) => !String(row.user_id || '').trim());
            if (emptyRowIndex >= 0) {
                rows[emptyRowIndex] = { ...rows[emptyRowIndex], user_id: nextUserId };
                return { ...prev, admins: rows };
            }
            return {
                ...prev,
                admins: [...rows, { row_id: `add-${makeAdminRowId()}`, user_id: nextUserId, is_active: true }],
            };
        });
        setCommunityAdminSearch('');
    };

    return (
        <AdminLayout title="C&C" subtitle="Manage Persohub clubs, communities, and sympos." allowEventAdmin>
            <section className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <Input
                        value={activeTab === 'events' ? eventsQuery : search}
                        onChange={(e) => {
                            if (activeTab === 'events') {
                                setEventsQuery(e.target.value);
                                setEventsPage(1);
                                return;
                            }
                            setSearch(e.target.value);
                        }}
                        placeholder={`Search ${activeTab === 'events' ? 'events' : activeTab}`}
                        className="max-w-md"
                    />
                    <div className="flex gap-2">
                        {activeTab === 'clubs' ? <Button onClick={() => openClubModal()}>Add Club</Button> : null}
                        {activeTab === 'communities' ? <Button onClick={() => openCommunityModal()}>Add Community</Button> : null}
                        {activeTab === 'sympos' ? <Button onClick={() => openSympoModal()}>Add Sympo</Button> : null}
                    </div>
                </div>

                <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList className="grid w-full grid-cols-4 md:w-[700px]">
                        <TabsTrigger value="clubs">Clubs</TabsTrigger>
                        <TabsTrigger value="communities">Communities</TabsTrigger>
                        <TabsTrigger value="sympos">Sympos</TabsTrigger>
                        <TabsTrigger value="events">Events</TabsTrigger>
                    </TabsList>

                    <TabsContent value="clubs" className="space-y-3">
                        <div className="hidden md:block rounded-2xl border border-black/10 bg-white overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50">
                                    <tr>
                                        <th className="px-3 py-2 text-left">Name</th>
                                        <th className="px-3 py-2 text-left">Profile ID</th>
                                        <th className="px-3 py-2 text-left">Owner</th>
                                        <th className="px-3 py-2 text-left">Linked Communities</th>
                                        <th className="px-3 py-2 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredClubs.map((club) => (
                                        <tr key={club.id} className="border-t border-black/10">
                                            <td className="px-3 py-2">{club.name}</td>
                                            <td className="px-3 py-2">{club.profile_id}</td>
                                            <td className="px-3 py-2">{club.owner_name || club.owner_regno || '—'}</td>
                                            <td className="px-3 py-2">{club.linked_community_count}</td>
                                            <td className="px-3 py-2 text-right space-x-2">
                                                <Button variant="outline" size="sm" onClick={() => openClubModal(club)}>Edit</Button>
                                                <Button
                                                    variant="destructive"
                                                    size="sm"
                                                    onClick={() => openDeleteDialog({
                                                        label: `Delete club ${club.name}`,
                                                        estimate: `Estimated linked communities: ${club.linked_community_count}`,
                                                        warning: 'This permanently deletes the club and related communities/sympos data.',
                                                        expectedText: club.name,
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
                                    <p className="text-xs mt-1">Owner: {club.owner_name || club.owner_regno || '—'}</p>
                                    <p className="text-xs mt-1">Linked communities: {club.linked_community_count}</p>
                                    <div className="mt-3 flex gap-2">
                                        <Button variant="outline" size="sm" onClick={() => openClubModal(club)}>Edit</Button>
                                        <Button variant="destructive" size="sm" onClick={() => openDeleteDialog({
                                            label: `Delete club ${club.name}`,
                                            estimate: `Estimated linked communities: ${club.linked_community_count}`,
                                            warning: 'This permanently deletes the club and related communities/sympos data.',
                                            expectedText: club.name,
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
                                        {(() => {
                                            const adminSummary = (community.admins || [])
                                                .map((member) => {
                                                    const baseName = member.name || `User ${member.user_id}`;
                                                    const activeLabel = member.is_active ? '' : ' (inactive)';
                                                    return `${baseName}${activeLabel}`;
                                                })
                                                .join(', ');
                                            return (
                                                <>
                                                    <p className="font-semibold">{community.name}</p>
                                                    <p className="text-xs text-slate-500">{community.profile_id}</p>
                                                    <p className="text-xs text-slate-500">Club: {community.club_name || '—'}</p>
                                                    <p className="text-xs text-slate-500">Admins: {adminSummary || '—'}</p>
                                                    <p className="text-xs text-slate-500">Active: {community.is_active ? 'Yes' : 'No'}</p>
                                                    <p className="text-xs text-slate-500">Root: {community.is_root ? 'Yes' : 'No'}</p>
                                                </>
                                            );
                                        })()}
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <Button variant="outline" size="sm" onClick={() => openCommunityModal(community)}>Edit</Button>
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

                    <TabsContent value="events" className="space-y-3">
                        <div className="flex items-center justify-between gap-2 text-sm">
                            <p className="text-slate-500">
                                Showing {eventRangeLabel} of {eventsTotalCount}
                            </p>
                            {totalEventPages > 1 ? (
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setEventsPage((prev) => Math.max(1, prev - 1))}
                                        className="rounded-full border border-[#c99612] bg-[#f6c347] p-2 text-[#11131a] transition hover:bg-[#ffd16b] disabled:cursor-not-allowed disabled:opacity-50"
                                        aria-label="Previous events page"
                                        disabled={eventsPage <= 1 || eventsLoading}
                                    >
                                        <ChevronLeft className="h-4 w-4" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setEventsPage((prev) => Math.min(totalEventPages, prev + 1))}
                                        className="rounded-full border border-[#c99612] bg-[#f6c347] p-2 text-[#11131a] transition hover:bg-[#ffd16b] disabled:cursor-not-allowed disabled:opacity-50"
                                        aria-label="Next events page"
                                        disabled={eventsPage >= totalEventPages || eventsLoading}
                                    >
                                        <ChevronRight className="h-4 w-4" />
                                    </button>
                                </div>
                            ) : null}
                        </div>
                        <div className="hidden md:block rounded-2xl border border-black/10 bg-white overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50">
                                    <tr>
                                        <th className="px-3 py-2 text-left">Title</th>
                                        <th className="px-3 py-2 text-left">Code / Slug</th>
                                        <th className="px-3 py-2 text-left">Community</th>
                                        <th className="px-3 py-2 text-left">Access</th>
                                        <th className="px-3 py-2 text-right">Add to symp</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {events.map((event) => {
                                        const currentSympoValue = event.sympo_id ? String(event.sympo_id) : 'none';
                                        const draftValue = eventSympoDrafts[event.id] || currentSympoValue;
                                        return (
                                            <tr key={event.id} className="border-t border-black/10">
                                                <td className="px-3 py-2 font-medium">{event.title}</td>
                                                <td className="px-3 py-2 text-xs text-slate-600">
                                                    <div>{event.event_code}</div>
                                                    <div>{event.slug}</div>
                                                </td>
                                                <td className="px-3 py-2">{event.community_name}</td>
                                                <td className="px-3 py-2">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <span className={`rounded-md border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${
                                                            event.persohub_access_approved
                                                                ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                                                                : (event.persohub_access_status === 'pending'
                                                                    ? 'border-amber-300 bg-amber-50 text-amber-700'
                                                                    : 'border-red-300 bg-red-50 text-red-700')
                                                        }`}>
                                                            {event.persohub_access_status || 'rejected'}
                                                        </span>
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            disabled={reviewingEventAccessId === event.id || event.persohub_access_status === 'approved'}
                                                            onClick={() => reviewEventAccess(event, 'approved')}
                                                        >
                                                            Approve
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            disabled={reviewingEventAccessId === event.id || event.persohub_access_status === 'rejected'}
                                                            onClick={() => reviewEventAccess(event, 'rejected')}
                                                        >
                                                            Reject
                                                        </Button>
                                                    </div>
                                                </td>
                                                <td className="px-3 py-2">
                                                    <div className="flex items-center justify-end gap-2">
                                                        <span className="text-xs text-slate-500">{event.sympo_name || 'Standalone'}</span>
                                                        <Select
                                                            value={draftValue}
                                                            onValueChange={(value) => setEventSympoDrafts((prev) => ({ ...prev, [event.id]: value }))}
                                                        >
                                                            <SelectTrigger className="w-[220px]">
                                                                <SelectValue placeholder="Select sympo" />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="none">Standalone</SelectItem>
                                                                {sympos.map((sympo) => (
                                                                    <SelectItem key={sympo.id} value={String(sympo.id)}>{sympo.name}</SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                        <Button
                                                            size="sm"
                                                            disabled={draftValue === currentSympoValue || assigningEventId === event.id}
                                                            onClick={() => assignEventToSympo(event)}
                                                        >
                                                            {assigningEventId === event.id ? 'Saving...' : 'Save'}
                                                        </Button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        <div className="space-y-2 md:hidden">
                            {events.map((event) => {
                                const currentSympoValue = event.sympo_id ? String(event.sympo_id) : 'none';
                                const draftValue = eventSympoDrafts[event.id] || currentSympoValue;
                                return (
                                    <div key={event.id} className="rounded-2xl border border-black/10 bg-white p-3">
                                        <p className="font-semibold">{event.title}</p>
                                        <p className="text-xs text-slate-500">{event.event_code} · {event.slug}</p>
                                        <p className="text-xs text-slate-500">Community: {event.community_name}</p>
                                        <p className="text-xs text-slate-500">Access: {event.persohub_access_status || 'rejected'}</p>
                                        <p className="text-xs text-slate-500">Add to symp: {event.sympo_name || 'Standalone'}</p>
                                        <div className="mt-3 space-y-2">
                                            <div className="flex gap-2">
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    disabled={reviewingEventAccessId === event.id || event.persohub_access_status === 'approved'}
                                                    onClick={() => reviewEventAccess(event, 'approved')}
                                                >
                                                    Approve
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    disabled={reviewingEventAccessId === event.id || event.persohub_access_status === 'rejected'}
                                                    onClick={() => reviewEventAccess(event, 'rejected')}
                                                >
                                                    Reject
                                                </Button>
                                            </div>
                                            <Select
                                                value={draftValue}
                                                onValueChange={(value) => setEventSympoDrafts((prev) => ({ ...prev, [event.id]: value }))}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select sympo" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="none">Standalone</SelectItem>
                                                    {sympos.map((sympo) => (
                                                        <SelectItem key={sympo.id} value={String(sympo.id)}>{sympo.name}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <Button
                                                size="sm"
                                                disabled={draftValue === currentSympoValue || assigningEventId === event.id}
                                                onClick={() => assignEventToSympo(event)}
                                            >
                                                {assigningEventId === event.id ? 'Saving...' : 'Save'}
                                            </Button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        {eventsLoading ? <p className="text-xs text-slate-500">Loading events...</p> : null}
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
                            <Label>Club Logo</Label>
                            <Input
                                type="file"
                                accept="image/png,image/jpeg,image/webp"
                                onChange={(e) => handleLogoUpload(e.target.files?.[0], (url) => setClubForm((p) => ({ ...p, club_logo_url: url })))}
                                disabled={uploadingField === 'logo'}
                            />
                            {clubForm.club_logo_url ? (
                                <p className="text-xs text-slate-500 break-all">{clubForm.club_logo_url}</p>
                            ) : null}
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
                        <div className="grid gap-2">
                            <Label>Club Owner</Label>
                            <Select
                                value={clubForm.owner_user_id || 'none'}
                                onValueChange={(value) => setClubForm((p) => ({ ...p, owner_user_id: value === 'none' ? '' : value }))}
                            >
                                <SelectTrigger><SelectValue placeholder="Select owner" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">Select owner</SelectItem>
                                    {adminOptions.map((user) => (
                                        <SelectItem key={user.id} value={String(user.id)}>
                                            {user.name} ({user.regno})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {adminOptionsLoading ? <p className="text-xs text-slate-500">Loading users...</p> : null}
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
                        <div className="space-y-2">
                            <Label>Community Admins</Label>
                            <Input
                                value={communityAdminSearch}
                                onChange={(e) => setCommunityAdminSearch(e.target.value)}
                                placeholder="Search admin users by name, regno, or id"
                            />
                            {communityAdminSuggestions.length ? (
                                <div className="max-h-44 overflow-auto rounded-md border border-black/10 bg-white p-1">
                                    {communityAdminSuggestions.map((user) => (
                                        <button
                                            key={user.id}
                                            type="button"
                                            onClick={() => applyCommunityAdminSuggestion(user.id)}
                                            className="w-full rounded px-2 py-1 text-left text-sm hover:bg-slate-100"
                                        >
                                            {user.name || user.regno || user.id} ({user.regno || user.id})
                                        </button>
                                    ))}
                                </div>
                            ) : null}
                            <div className="space-y-2">
                                {(communityForm.admins || []).map((member) => (
                                    <div key={member.row_id} className="rounded-lg border border-black/10 p-3 space-y-2">
                                        <Select
                                            value={member.user_id || ''}
                                            onValueChange={(value) => setCommunityForm((prev) => ({
                                                ...prev,
                                                admins: (prev.admins || []).map((row) => (row.row_id === member.row_id ? { ...row, user_id: value } : row)),
                                            }))}
                                        >
                                            <SelectTrigger><SelectValue placeholder="Select admin user" /></SelectTrigger>
                                            <SelectContent>
                                                {filteredCommunityAdminOptions.map((user) => {
                                                    const optionValue = String(user.id);
                                                    const alreadyUsed = usedCommunityAdminIds.has(optionValue) && String(member.user_id || '') !== optionValue;
                                                    return (
                                                        <SelectItem key={user.id} value={optionValue} disabled={alreadyUsed}>
                                                            {user.name} ({user.regno})
                                                        </SelectItem>
                                                    );
                                                })}
                                            </SelectContent>
                                        </Select>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <label className="flex items-center gap-2 text-xs">
                                                <input
                                                    type="checkbox"
                                                    checked={Boolean(member.is_active)}
                                                    onChange={(e) => setCommunityForm((prev) => ({
                                                        ...prev,
                                                        admins: (prev.admins || []).map((row) => (
                                                            row.row_id === member.row_id
                                                                ? { ...row, is_active: e.target.checked }
                                                                : row
                                                        )),
                                                    }))}
                                                />
                                                Active
                                            </label>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                disabled={(communityForm.admins || []).length <= 1}
                                                onClick={() => setCommunityForm((prev) => ({
                                                    ...prev,
                                                    admins: (prev.admins || []).filter((row) => row.row_id !== member.row_id),
                                                }))}
                                            >
                                                Remove
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="flex items-center justify-between gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setCommunityForm((prev) => ({
                                        ...prev,
                                        admins: [
                                            ...(prev.admins || []),
                                            { row_id: `add-${makeAdminRowId()}`, user_id: '', is_active: true },
                                        ],
                                    }))}
                                >
                                    Add Admin
                                </Button>
                                <p className="text-xs text-slate-500">At least one active admin is required.</p>
                            </div>
                            {adminOptionsLoading ? <p className="text-xs text-slate-500">Loading admin users...</p> : null}
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
                            Root Community
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
                                {eventOptionsLoading ? <p className="p-2 text-xs text-slate-500">Loading events...</p> : null}
                                {!eventOptionsLoading && !eventOptions.length ? <p className="p-2 text-xs text-slate-500">No events available.</p> : null}
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

            <Dialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>{deleteState.label}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3 text-sm">
                        <p className="text-slate-700">This is a hard delete and will cascade to dependent data.</p>
                        {deleteState.warning ? <p className="font-semibold text-red-600">{deleteState.warning}</p> : null}
                        {deleteState.estimate ? <p className="text-slate-500">{deleteState.estimate}</p> : null}
                        <div className="grid gap-2">
                            <Label>Type `{deleteState.expectedText || 'DELETE'}` to confirm</Label>
                            <Input value={deleteConfirmText} onChange={(e) => setDeleteConfirmText(e.target.value)} />
                        </div>
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" onClick={() => setDeleteModalOpen(false)}>Cancel</Button>
                        <Button type="button" variant="destructive" onClick={confirmDelete} disabled={deleteConfirmText.trim() !== String(deleteState.expectedText || 'DELETE') || submitting}>
                            {submitting ? 'Deleting...' : 'Delete'}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {loading ? <p className="text-sm text-slate-500">Loading C&C data...</p> : null}
        </AdminLayout>
    );
}
