import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import PersohubAdminLayout from '@/pages/persohub/admin/PersohubAdminLayout';
import { persohubAdminApi } from '@/pages/persohub/admin/api';

export default function PersohubAdminPoliciesPage() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [events, setEvents] = useState([]);
    const [admins, setAdmins] = useState([]);
    const [selectedUserId, setSelectedUserId] = useState('');
    const [eventPolicyMap, setEventPolicyMap] = useState({});

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const response = await persohubAdminApi.listPersohubEventPolicies();
            const eventRows = response?.events || [];
            const adminRows = response?.admins || [];
            setEvents(eventRows);
            setAdmins(adminRows);

            const editableAdmins = adminRows.filter((item) => !item.is_club_owner);
            if (!editableAdmins.length) {
                setSelectedUserId('');
                setEventPolicyMap({});
            } else {
                const currentUserExists = editableAdmins.some((item) => String(item.user_id) === String(selectedUserId));
                const nextUserId = currentUserExists ? selectedUserId : String(editableAdmins[0].user_id);
                setSelectedUserId(nextUserId);
                const selected = editableAdmins.find((item) => String(item.user_id) === String(nextUserId));
                const eventsPolicy = (selected?.policy?.events && typeof selected.policy.events === 'object') ? selected.policy.events : {};
                setEventPolicyMap({ ...eventsPolicy });
            }
        } catch (error) {
            toast.error(persohubAdminApi.parseApiError(error, 'Failed to load event policies'));
        } finally {
            setLoading(false);
        }
    }, [selectedUserId]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const editableAdmins = useMemo(() => admins.filter((item) => !item.is_club_owner), [admins]);
    const selectedAdmin = useMemo(
        () => editableAdmins.find((item) => String(item.user_id) === String(selectedUserId)) || null,
        [editableAdmins, selectedUserId],
    );

    const onSelectAdmin = (value) => {
        setSelectedUserId(value);
        const selected = editableAdmins.find((item) => String(item.user_id) === String(value));
        const eventsPolicy = (selected?.policy?.events && typeof selected.policy.events === 'object') ? selected.policy.events : {};
        setEventPolicyMap({ ...eventsPolicy });
    };

    const onToggleEvent = (slug, checked) => {
        setEventPolicyMap((prev) => ({ ...prev, [slug]: Boolean(checked) }));
    };

    const savePolicy = async () => {
        if (!selectedUserId) {
            toast.error('Select an admin user');
            return;
        }
        setSaving(true);
        try {
            await persohubAdminApi.updatePersohubEventPolicy(Number(selectedUserId), {
                policy: {
                    events: eventPolicyMap,
                },
            });
            toast.success('Policy updated');
            await loadData();
        } catch (error) {
            toast.error(persohubAdminApi.parseApiError(error, 'Failed to update policy'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <PersohubAdminLayout
            title="Persohub Event Policies"
            subtitle="Owner-only policy controls for delegated community admins."
            activeTab="policies"
        >
            <section className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
                <h2 className="text-2xl font-heading font-black">Delegated Event Access</h2>
                <p className="mt-2 text-sm text-slate-600">
                    Enable event-internal admin access per user. Owners always have full event access.
                </p>

                {loading ? (
                    <p className="mt-4 text-sm text-slate-500">Loading policy data...</p>
                ) : (
                    <div className="mt-4 space-y-4">
                        {editableAdmins.length === 0 ? (
                            <p className="text-sm text-slate-600">No editable delegated admins found in this club.</p>
                        ) : (
                            <>
                                <div className="max-w-md space-y-2">
                                    <Label>Admin User</Label>
                                    <Select value={selectedUserId} onValueChange={onSelectAdmin}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select admin" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {editableAdmins.map((admin) => (
                                                <SelectItem key={admin.user_id} value={String(admin.user_id)}>
                                                    {(admin.name || admin.regno || admin.user_id)} ({admin.regno || admin.user_id})
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                {events.length === 0 ? (
                                    <p className="text-sm text-slate-600">No club events found.</p>
                                ) : (
                                    <div className="rounded-2xl border border-black/10">
                                        <div className="grid grid-cols-[1fr_auto] gap-2 border-b border-black/10 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">
                                            <span>Event</span>
                                            <span>Allowed</span>
                                        </div>
                                        <div className="divide-y divide-black/10">
                                            {events.map((event) => {
                                                const checked = Boolean(eventPolicyMap[event.slug]);
                                                return (
                                                    <label key={event.slug} className="grid cursor-pointer grid-cols-[1fr_auto] items-center gap-3 px-4 py-3">
                                                        <div>
                                                            <p className="font-semibold text-slate-800">{event.title}</p>
                                                            <p className="text-xs text-slate-500">{event.slug} | {event.event_code}</p>
                                                        </div>
                                                        <input
                                                            type="checkbox"
                                                            checked={checked}
                                                            onChange={(e) => onToggleEvent(event.slug, e.target.checked)}
                                                            className="h-4 w-4"
                                                        />
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                <div className="flex justify-end">
                                    <Button className="bg-[#11131a] text-white" disabled={saving || !selectedAdmin} onClick={savePolicy}>
                                        {saving ? 'Saving...' : 'Save Policy'}
                                    </Button>
                                </div>
                            </>
                        )}
                    </div>
                )}
            </section>
        </PersohubAdminLayout>
    );
}
