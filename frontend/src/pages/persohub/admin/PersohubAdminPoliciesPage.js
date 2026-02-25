import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import PersohubAdminLayout from '@/pages/persohub/admin/PersohubAdminLayout';
import { persohubAdminApi } from '@/pages/persohub/admin/api';

export default function PersohubAdminPoliciesPage() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [superadminSaving, setSuperadminSaving] = useState(false);

    const [events, setEvents] = useState([]);
    const [admins, setAdmins] = useState([]);
    const [policyEdits, setPolicyEdits] = useState({});
    const [originalPolicies, setOriginalPolicies] = useState({});

    const [userOptions, setUserOptions] = useState([]);
    const [clubSuperadmins, setClubSuperadmins] = useState([]);
    const [superadminSearch, setSuperadminSearch] = useState('');
    const [selectedSuperadminUserId, setSelectedSuperadminUserId] = useState('');
    const [eventAdminSearch, setEventAdminSearch] = useState('');
    const [selectedEventAdminUserId, setSelectedEventAdminUserId] = useState('');
    const [eventAdminSaving, setEventAdminSaving] = useState(false);
    const [removingEventAdminUserId, setRemovingEventAdminUserId] = useState(null);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [policyResponse, optionsRows, superadminRows] = await Promise.all([
                persohubAdminApi.listPersohubEventPolicies(),
                persohubAdminApi.listPersohubAdminUserOptions(),
                persohubAdminApi.listClubSuperadmins(),
            ]);

            const eventRows = policyResponse?.events || [];
            const adminRows = policyResponse?.admins || [];
            const editableAdminRows = adminRows.filter((item) => !item.is_club_owner);

            const edits = {};
            const originals = {};
            editableAdminRows.forEach((admin) => {
                const policy = admin?.policy && typeof admin.policy === 'object' ? admin.policy : { events: {} };
                edits[admin.user_id] = policy;
                originals[admin.user_id] = policy;
            });

            setEvents(eventRows);
            setAdmins(adminRows);
            setPolicyEdits(edits);
            setOriginalPolicies(originals);
            setUserOptions(optionsRows || []);
            setClubSuperadmins(superadminRows || []);

            setSelectedSuperadminUserId((prev) => {
                if (!prev) return '';
                return (optionsRows || []).some((item) => String(item.id) === String(prev)) ? prev : '';
            });
        } catch (error) {
            toast.error(persohubAdminApi.parseApiError(error, 'Failed to load policy data'));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const editableAdmins = useMemo(
        () => admins.filter((item) => !item.is_club_owner),
        [admins],
    );

    const filteredUserOptions = useMemo(() => {
        const q = superadminSearch.trim().toLowerCase();
        if (!q) return [];
        return userOptions.filter((item) => {
            const haystack = `${item?.name || ''} ${item?.regno || ''}`.toLowerCase();
            return haystack.includes(q);
        });
    }, [superadminSearch, userOptions]);

    const selectedSuperadminCandidate = useMemo(
        () => userOptions.find((item) => String(item.id) === String(selectedSuperadminUserId)) || null,
        [selectedSuperadminUserId, userOptions],
    );

    const isSelectedAlreadySuperadmin = useMemo(
        () => Boolean(selectedSuperadminCandidate && clubSuperadmins.some((item) => Number(item.user_id) === Number(selectedSuperadminCandidate.id))),
        [clubSuperadmins, selectedSuperadminCandidate],
    );

    const filteredEventAdminOptions = useMemo(() => {
        const q = eventAdminSearch.trim().toLowerCase();
        if (!q) return [];
        return userOptions.filter((item) => {
            const haystack = `${item?.name || ''} ${item?.regno || ''}`.toLowerCase();
            return haystack.includes(q);
        });
    }, [eventAdminSearch, userOptions]);

    const selectedEventAdminCandidate = useMemo(
        () => userOptions.find((item) => String(item.id) === String(selectedEventAdminUserId)) || null,
        [selectedEventAdminUserId, userOptions],
    );

    const isSelectedAlreadyEventAdmin = useMemo(
        () => Boolean(selectedEventAdminCandidate && editableAdmins.some((item) => Number(item.user_id) === Number(selectedEventAdminCandidate.id))),
        [editableAdmins, selectedEventAdminCandidate],
    );

    const updateEventPolicyEdit = (userId, slug, value) => {
        setPolicyEdits((prev) => {
            const existing = prev[userId] || { events: {} };
            const eventsMap = (existing.events && typeof existing.events === 'object') ? existing.events : {};
            return {
                ...prev,
                [userId]: {
                    ...existing,
                    events: {
                        ...eventsMap,
                        [slug]: Boolean(value),
                    },
                },
            };
        });
    };

    const arePoliciesEqual = (a = {}, b = {}) => {
        const aEvents = (a.events && typeof a.events === 'object') ? a.events : {};
        const bEvents = (b.events && typeof b.events === 'object') ? b.events : {};
        const slugs = new Set([...Object.keys(aEvents), ...Object.keys(bEvents)]);
        for (const slug of slugs) {
            if (Boolean(aEvents[slug]) !== Boolean(bEvents[slug])) return false;
        }
        return true;
    };

    const hasPolicyChanges = editableAdmins.some((admin) => !arePoliciesEqual(policyEdits[admin.user_id], originalPolicies[admin.user_id]));

    const saveAllPolicies = async () => {
        setSaving(true);
        try {
            const updates = editableAdmins
                .filter((admin) => !arePoliciesEqual(policyEdits[admin.user_id], originalPolicies[admin.user_id]))
                .map((admin) => persohubAdminApi.updatePersohubEventPolicy(Number(admin.user_id), {
                    policy: {
                        events: {
                            ...(((policyEdits[admin.user_id] || {}).events && typeof (policyEdits[admin.user_id] || {}).events === 'object')
                                ? (policyEdits[admin.user_id] || {}).events
                                : {}),
                        },
                    },
                }));

            if (updates.length) {
                await Promise.all(updates);
            }
            toast.success(updates.length ? 'Policy changes saved.' : 'No policy changes to save.');
            await loadData();
        } catch (error) {
            toast.error(persohubAdminApi.parseApiError(error, 'Failed to save policy changes'));
        } finally {
            setSaving(false);
        }
    };

    const grantSuperadmin = async (e) => {
        e.preventDefault();
        if (!selectedSuperadminUserId) {
            toast.error('Select a user to grant superadmin access.');
            return;
        }
        if (isSelectedAlreadySuperadmin) {
            toast.error('This user is already a club superadmin.');
            return;
        }
        setSuperadminSaving(true);
        try {
            await persohubAdminApi.addClubSuperadmin(Number(selectedSuperadminUserId));
            setSelectedSuperadminUserId('');
            setSuperadminSearch('');
            toast.success('Club superadmin access granted.');
            await loadData();
        } catch (error) {
            toast.error(persohubAdminApi.parseApiError(error, 'Failed to grant club superadmin'));
        } finally {
            setSuperadminSaving(false);
        }
    };

    const addEventAdmin = async (e) => {
        e.preventDefault();
        if (!selectedEventAdminUserId) {
            toast.error('Select a user to add as event admin.');
            return;
        }
        if (isSelectedAlreadyEventAdmin) {
            toast.error('This user is already an event admin.');
            return;
        }
        setEventAdminSaving(true);
        try {
            await persohubAdminApi.addEventAdmin({ user_id: Number(selectedEventAdminUserId) });
            setSelectedEventAdminUserId('');
            setEventAdminSearch('');
            toast.success('Event admin added.');
            await loadData();
        } catch (error) {
            toast.error(persohubAdminApi.parseApiError(error, 'Failed to add event admin'));
        } finally {
            setEventAdminSaving(false);
        }
    };

    const removeEventAdmin = async (userId) => {
        setRemovingEventAdminUserId(Number(userId));
        try {
            await persohubAdminApi.removeEventAdmin(Number(userId));
            toast.success('Event admin removed.');
            await loadData();
        } catch (error) {
            toast.error(persohubAdminApi.parseApiError(error, 'Failed to remove event admin'));
        } finally {
            setRemovingEventAdminUserId(null);
        }
    };

    const revokeSuperadmin = async (userId) => {
        setSuperadminSaving(true);
        try {
            await persohubAdminApi.revokeClubSuperadmin(Number(userId));
            toast.success('Club superadmin revoked.');
            await loadData();
        } catch (error) {
            toast.error(persohubAdminApi.parseApiError(error, 'Failed to revoke club superadmin'));
        } finally {
            setSuperadminSaving(false);
        }
    };

    return (
        <PersohubAdminLayout
            title="Persohub Event Policies"
            subtitle="Owner-only controls for delegated event access and club superadmins."
            activeTab="policies"
        >
            <section className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <p className="text-xs uppercase tracking-[0.4em] text-slate-400">Admins</p>
                        <h2 className="text-2xl font-heading font-black">Add Club Superadmin</h2>
                    </div>
                </div>

                <form onSubmit={grantSuperadmin} className="mt-6 grid gap-4 md:grid-cols-2">
                    <div className="md:col-span-2">
                        <Label htmlFor="superadmin-search">Search Users</Label>
                        <Input
                            id="superadmin-search"
                            value={superadminSearch}
                            onChange={(e) => setSuperadminSearch(e.target.value)}
                            placeholder="Search by name or regno"
                        />
                        {superadminSearch.trim().length > 0 && filteredUserOptions.length > 0 ? (
                            <div className="mt-2 max-h-56 overflow-auto rounded-xl border border-black/10 bg-white shadow-sm">
                                {filteredUserOptions.slice(0, 12).map((item) => (
                                    <button
                                        key={item.id}
                                        type="button"
                                        className="flex w-full items-center justify-between gap-3 px-4 py-2 text-left text-sm hover:bg-[#fff7dc]"
                                        onClick={() => {
                                            setSelectedSuperadminUserId(String(item.id));
                                            setSuperadminSearch(`${item.name || 'Unnamed'} · ${item.regno || 'N/A'}`);
                                        }}
                                    >
                                        <span className="font-medium">{item.name || 'Unnamed'}</span>
                                        <span className="text-xs text-slate-500">{item.regno || 'N/A'}</span>
                                    </button>
                                ))}
                            </div>
                        ) : null}
                    </div>

                    <div className="md:col-span-2">
                        <Label>Selected User</Label>
                        <div className="rounded-md border border-black/10 bg-[#fffdf7] px-4 py-3 text-sm">
                            {selectedSuperadminCandidate ? (
                                <span>
                                    <span className="font-medium">{selectedSuperadminCandidate.name || 'Unnamed'}</span>
                                    {' · '}
                                    {selectedSuperadminCandidate.regno || 'N/A'}
                                </span>
                            ) : (
                                <span className="text-slate-500">No user selected.</span>
                            )}
                        </div>
                        {isSelectedAlreadySuperadmin ? (
                            <p className="mt-2 text-sm text-amber-700">This user already has club superadmin access.</p>
                        ) : null}
                    </div>

                    <div className="md:col-span-2 flex justify-end">
                        <Button
                            type="submit"
                            className="bg-[#f6c347] text-black hover:bg-[#ffd16b]"
                            disabled={superadminSaving || isSelectedAlreadySuperadmin || !selectedSuperadminUserId}
                        >
                            {superadminSaving ? 'Saving...' : 'Grant Superadmin Access'}
                        </Button>
                    </div>
                </form>

                <div className="mt-6 space-y-3">
                    {clubSuperadmins.length ? clubSuperadmins.map((item) => (
                        <div key={item.id} className="rounded-2xl border border-black/10 bg-[#fffdf7] p-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <h3 className="text-lg font-heading font-bold">
                                        {item.name || 'User'} <span className="text-sm text-slate-500">({item.regno || item.user_id})</span>
                                    </h3>
                                    <p className="text-xs text-slate-500">Club superadmin</p>
                                </div>
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="border-black/10"
                                    disabled={superadminSaving}
                                    onClick={() => revokeSuperadmin(item.user_id)}
                                >
                                    Revoke
                                </Button>
                            </div>
                        </div>
                    )) : (
                        <div className="rounded-2xl border border-black/10 bg-[#fffdf7] p-4 text-sm text-slate-500">
                            No club superadmins yet.
                        </div>
                    )}
                </div>
            </section>

            <section className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-xs uppercase tracking-[0.4em] text-slate-400">Admins</p>
                        <h2 className="text-2xl font-heading font-black">Manage Event Policies</h2>
                    </div>
                    <Button
                        type="button"
                        className="bg-[#f6c347] text-black hover:bg-[#ffd16b]"
                        onClick={saveAllPolicies}
                        disabled={loading || saving || !hasPolicyChanges}
                    >
                        {saving ? 'Saving...' : (hasPolicyChanges ? 'Save changes' : 'No changes')}
                    </Button>
                </div>

                <form onSubmit={addEventAdmin} className="mt-6 grid gap-4 md:grid-cols-2">
                    <div className="md:col-span-2">
                        <Label htmlFor="event-admin-search">Add Event Admin</Label>
                        <Input
                            id="event-admin-search"
                            value={eventAdminSearch}
                            onChange={(e) => setEventAdminSearch(e.target.value)}
                            placeholder="Search by name or regno"
                        />
                        {eventAdminSearch.trim().length > 0 && filteredEventAdminOptions.length > 0 ? (
                            <div className="mt-2 max-h-56 overflow-auto rounded-xl border border-black/10 bg-white shadow-sm">
                                {filteredEventAdminOptions.slice(0, 12).map((item) => (
                                    <button
                                        key={item.id}
                                        type="button"
                                        className="flex w-full items-center justify-between gap-3 px-4 py-2 text-left text-sm hover:bg-[#fff7dc]"
                                        onClick={() => {
                                            setSelectedEventAdminUserId(String(item.id));
                                            setEventAdminSearch(`${item.name || 'Unnamed'} · ${item.regno || 'N/A'}`);
                                        }}
                                    >
                                        <span className="font-medium">{item.name || 'Unnamed'}</span>
                                        <span className="text-xs text-slate-500">{item.regno || 'N/A'}</span>
                                    </button>
                                ))}
                            </div>
                        ) : null}
                    </div>

                    <div className="md:col-span-2">
                        <Label>Selected User</Label>
                        <div className="rounded-md border border-black/10 bg-[#fffdf7] px-4 py-3 text-sm">
                            {selectedEventAdminCandidate ? (
                                <span>
                                    <span className="font-medium">{selectedEventAdminCandidate.name || 'Unnamed'}</span>
                                    {' · '}
                                    {selectedEventAdminCandidate.regno || 'N/A'}
                                </span>
                            ) : (
                                <span className="text-slate-500">No user selected.</span>
                            )}
                        </div>
                        {isSelectedAlreadyEventAdmin ? (
                            <p className="mt-2 text-sm text-amber-700">This user already has event admin access.</p>
                        ) : null}
                    </div>

                    <div className="md:col-span-2 flex justify-end">
                        <Button
                            type="submit"
                            className="bg-[#f6c347] text-black hover:bg-[#ffd16b]"
                            disabled={eventAdminSaving || isSelectedAlreadyEventAdmin || !selectedEventAdminUserId}
                        >
                            {eventAdminSaving ? 'Saving...' : 'Add Event Admin'}
                        </Button>
                    </div>
                </form>

                <div className="mt-6 space-y-4">
                    {loading ? (
                        <div className="rounded-2xl border border-black/10 bg-[#fffdf7] p-4 text-sm text-slate-500">
                            Loading policy data...
                        </div>
                    ) : editableAdmins.length ? editableAdmins.map((admin) => (
                        <div key={admin.user_id} className="rounded-2xl border border-black/10 bg-[#fffdf7] p-4">
                            <div className="flex flex-wrap items-center justify-between gap-4">
                                <div>
                                    <h3 className="text-lg font-heading font-bold">
                                        {admin.name || 'Admin'} <span className="text-sm text-slate-500">({admin.regno || admin.user_id})</span>
                                    </h3>
                                    <p className="text-xs text-slate-500">Delegated event access policy</p>
                                </div>
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="border-black/10 text-red-600 hover:bg-red-50 hover:text-red-700"
                                    disabled={Boolean(removingEventAdminUserId) || saving}
                                    onClick={() => removeEventAdmin(admin.user_id)}
                                >
                                    {Number(removingEventAdminUserId) === Number(admin.user_id) ? 'Removing...' : 'Remove'}
                                </Button>
                            </div>

                            {events.length > 0 ? (
                                <div className="mt-3 rounded-xl border border-black/10 bg-white p-3">
                                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Managed Event Access</p>
                                    <div className="mt-2 grid gap-2 md:grid-cols-2">
                                        {events.map((eventItem) => (
                                            <label key={`${admin.user_id}-${eventItem.slug}`} className="flex items-center justify-between gap-2 rounded-md border border-black/10 px-3 py-2 text-sm">
                                                <span className="truncate">{eventItem.title} <span className="text-slate-500">({eventItem.slug})</span></span>
                                                <input
                                                    type="checkbox"
                                                    checked={Boolean(policyEdits[admin.user_id]?.events?.[eventItem.slug])}
                                                    onChange={(e) => updateEventPolicyEdit(admin.user_id, eventItem.slug, e.target.checked)}
                                                />
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <p className="mt-3 text-sm text-slate-500">No club events found.</p>
                            )}
                        </div>
                    )) : (
                        <div className="rounded-2xl border border-black/10 bg-[#fffdf7] p-4 text-sm text-slate-500">
                            No editable delegated admins found in this club.
                        </div>
                    )}
                </div>
            </section>
        </PersohubAdminLayout>
    );
}
