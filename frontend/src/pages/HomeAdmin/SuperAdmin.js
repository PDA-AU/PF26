import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/context/AuthContext';
import AdminLayout from '@/pages/HomeAdmin/AdminLayout';
import { API } from '@/pages/HomeAdmin/adminApi';
import { toast } from 'sonner';

const emptyAdmin = {
    user_id: ''
};

export default function SuperAdmin() {
    const { user, getAuthHeader } = useAuth();
    const [admins, setAdmins] = useState([]);
    const [policyEdits, setPolicyEdits] = useState({});
    const [originalPolicies, setOriginalPolicies] = useState({});
    const [policySaving, setPolicySaving] = useState(false);
    const [adminForm, setAdminForm] = useState(emptyAdmin);
    const [teamMembers, setTeamMembers] = useState([]);
    const [teamSearch, setTeamSearch] = useState('');
    const [saving, setSaving] = useState(false);
    const [snapshotLoading, setSnapshotLoading] = useState(false);
    const [snapshotUrl, setSnapshotUrl] = useState('');
    const [recruitmentOpen, setRecruitmentOpen] = useState(true);
    const [recruitmentLoading, setRecruitmentLoading] = useState(false);

    const fetchData = useCallback(async () => {
        try {
            const adminsRes = await axios.get(`${API}/pda-admin/superadmin/admins`, { headers: getAuthHeader() });
            setAdmins(adminsRes.data || []);
            const edits = {};
            const originals = {};
            (adminsRes.data || []).forEach((admin) => {
                const policy = admin.policy || {};
                edits[admin.id] = policy;
                originals[admin.id] = policy;
            });
            setPolicyEdits(edits);
            setOriginalPolicies(originals);
            const teamRes = await axios.get(`${API}/pda-admin/team`, { headers: getAuthHeader() });
            setTeamMembers(teamRes.data || []);
            const recruitmentRes = await axios.get(`${API}/pda-admin/superadmin/recruitment-status`, { headers: getAuthHeader() });
            if (typeof recruitmentRes.data?.recruitment_open === 'boolean') {
                setRecruitmentOpen(recruitmentRes.data.recruitment_open);
            }
        } catch (error) {
            console.error('Failed to load superadmin data:', error);
        }
    }, [getAuthHeader]);

    useEffect(() => {
        if (user?.is_superadmin) {
            fetchData();
        }
    }, [user, fetchData]);

    const submitAdmin = async (e) => {
        e.preventDefault();
        if (!adminForm.user_id) {
            toast.error('Select a team member to grant admin access.');
            return;
        }
        setSaving(true);
        try {
            await axios.post(`${API}/pda-admin/superadmin/admins`, {
                user_id: Number(adminForm.user_id)
            }, { headers: getAuthHeader() });
            setAdminForm(emptyAdmin);
            setTeamSearch('');
            fetchData();
            toast.success('Admin access granted.');
        } catch (error) {
            console.error('Failed to create admin:', error);
            toast.error('Failed to grant admin access.');
        } finally {
            setSaving(false);
        }
    };

    const updatePolicy = async (adminId, policy) => {
        try {
            await axios.put(`${API}/pda-admin/superadmin/admins/${adminId}/policy`, { policy }, { headers: getAuthHeader() });
            fetchData();
        } catch (error) {
            console.error('Failed to update policy:', error);
        }
    };

    const deleteAdmin = async (adminId) => {
        try {
            await axios.delete(`${API}/pda-admin/superadmin/admins/${adminId}`, { headers: getAuthHeader() });
            fetchData();
        } catch (error) {
            console.error('Failed to delete admin:', error);
        }
    };

    const takeSnapshot = async () => {
        setSnapshotLoading(true);
        try {
            const response = await axios.post(`${API}/pda-admin/superadmin/db-snapshot`, {}, { headers: getAuthHeader() });
            setSnapshotUrl(response.data?.url || '');
        } catch (error) {
            console.error('Failed to take snapshot:', error);
        } finally {
            setSnapshotLoading(false);
        }
    };

    const toggleRecruitment = async () => {
        setRecruitmentLoading(true);
        try {
            const response = await axios.post(`${API}/pda-admin/superadmin/recruitment-toggle`, {}, { headers: getAuthHeader() });
            if (typeof response.data?.recruitment_open === 'boolean') {
                setRecruitmentOpen(response.data.recruitment_open);
            }
        } catch (error) {
            console.error('Failed to toggle recruitment:', error);
        } finally {
            setRecruitmentLoading(false);
        }
    };

    const updatePolicyEdit = (adminId, key, value) => {
        setPolicyEdits((prev) => ({
            ...prev,
            [adminId]: {
                ...(prev[adminId] || {}),
                [key]: value
            }
        }));
    };

    const arePoliciesEqual = (a = {}, b = {}) => {
        const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
        for (const key of keys) {
            if (Boolean(a[key]) !== Boolean(b[key])) return false;
        }
        return true;
    };

    const hasPolicyChanges = admins
        .filter((admin) => admin.regno !== "0000000000")
        .some((admin) => !arePoliciesEqual(policyEdits[admin.id], originalPolicies[admin.id]));

    const saveAllPolicies = async () => {
        setPolicySaving(true);
        try {
            const updates = admins
                .filter((admin) => admin.regno !== "0000000000")
                .filter((admin) => !arePoliciesEqual(policyEdits[admin.id], originalPolicies[admin.id]))
                .map((admin) => axios.put(
                    `${API}/pda-admin/superadmin/admins/${admin.id}/policy`,
                    { policy: policyEdits[admin.id] || {} },
                    { headers: getAuthHeader() }
                ));

            if (updates.length) {
                await Promise.all(updates);
            }
            fetchData();
            toast.success(updates.length ? 'Policy changes saved.' : 'No policy changes to save.');
        } catch (error) {
            console.error('Failed to save policy changes:', error);
            toast.error('Failed to save policy changes.');
        } finally {
            setPolicySaving(false);
        }
    };


    if (!user?.is_superadmin) {
        return (
            <AdminLayout title="Superadmin" subtitle="Access restricted to the superadmin account.">
                <div className="rounded-3xl border border-black/10 bg-white p-8 text-center text-sm text-slate-600">
                    You do not have permission to view this page.
                </div>
            </AdminLayout>
        );
    }

    const filteredTeamMembers = teamMembers.filter((member) => {
        if (!member?.user_id) return false;
        const haystack = `${member?.name || ''} ${member?.regno || ''} ${member?.email || ''}`.toLowerCase();
        return haystack.includes(teamSearch.trim().toLowerCase());
    });
    const selectedMember = teamMembers.find((member) => String(member.user_id) === String(adminForm.user_id));
    const isSelectedAlreadyAdmin = Boolean(selectedMember && admins.some((admin) => String(admin.id) === String(selectedMember.user_id)));

    return (
        <AdminLayout title="Superadmin" subtitle="Manage admin users, recruitments, and audit actions.">
            <section className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <p className="text-xs uppercase tracking-[0.4em] text-slate-400">Admins</p>
                        <h2 className="text-2xl font-heading font-black">Add Admin</h2>
                    </div>
                </div>

                <form onSubmit={submitAdmin} className="mt-6 grid gap-4 md:grid-cols-2">
                    <div className="md:col-span-2">
                        <Label htmlFor="admin-search">Search Team Members</Label>
                        <Input
                            id="admin-search"
                            name="admin-search"
                            value={teamSearch}
                            onChange={(e) => setTeamSearch(e.target.value)}
                            placeholder="Search by name, regno, or email"
                        />
                        {teamSearch.trim().length > 0 && filteredTeamMembers.length > 0 && (
                            <div className="mt-2 max-h-56 overflow-auto rounded-xl border border-black/10 bg-white shadow-sm">
                                {filteredTeamMembers.slice(0, 12).map((member) => (
                                    <button
                                        key={member.user_id}
                                        type="button"
                                        className="flex w-full items-center justify-between gap-3 px-4 py-2 text-left text-sm hover:bg-[#fff7dc]"
                                        onClick={() => {
                                            setAdminForm({ user_id: String(member.user_id) });
                                            setTeamSearch(`${member.name || 'Unnamed'} · ${member.regno || 'N/A'}`);
                                        }}
                                    >
                                        <span className="font-medium">{member.name || 'Unnamed'}</span>
                                        <span className="text-xs text-slate-500">{member.regno || 'N/A'} · {member.team || 'Team'} · {member.designation || 'Role'}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="md:col-span-2">
                        <Label>Selected Member</Label>
                        <div className="rounded-md border border-black/10 bg-[#fffdf7] px-4 py-3 text-sm">
                            {selectedMember ? (
                                <span>
                                    <span className="font-medium">{selectedMember.name || 'Unnamed'}</span>
                                    {' · '}
                                    {selectedMember.regno || 'N/A'}
                                    {' · '}
                                    {selectedMember.team || 'Team'}
                                    {' · '}
                                    {selectedMember.designation || 'Role'}
                                </span>
                            ) : (
                                <span className="text-slate-500">No member selected.</span>
                            )}
                        </div>
                        {selectedMember && isSelectedAlreadyAdmin && (
                            <p className="mt-2 text-sm text-amber-700">
                                This member already has admin access.
                            </p>
                        )}
                    </div>
                    <div className="md:col-span-2 flex justify-end">
                        <Button
                            type="submit"
                            className="bg-[#f6c347] text-black hover:bg-[#ffd16b]"
                            disabled={saving || isSelectedAlreadyAdmin}
                        >
                            {saving ? 'Saving...' : 'Grant Admin Access'}
                        </Button>
                    </div>
                </form>
            </section>

            <section className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <p className="text-xs uppercase tracking-[0.4em] text-slate-400">Database</p>
                        <h2 className="text-2xl font-heading font-black">Snapshots</h2>
                    </div>
                </div>
                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
                    <Button
                        type="button"
                        onClick={takeSnapshot}
                        className="bg-[#f6c347] text-black hover:bg-[#ffd16b]"
                        disabled={snapshotLoading}
                    >
                        {snapshotLoading ? 'Working...' : 'Take Snapshot'}
                    </Button>
                </div>
                {snapshotUrl ? (
                    <p className="mt-4 text-sm text-slate-600 break-all">
                        Uploaded to: <span className="font-semibold">{snapshotUrl}</span>
                    </p>
                ) : null}
            </section>

            <section className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <p className="text-xs uppercase tracking-[0.4em] text-slate-400">Recruitment</p>
                        <h2 className="text-2xl font-heading font-black">Pause or Resume</h2>
                    </div>
                    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs uppercase tracking-[0.2em] ${
                        recruitmentOpen ? 'border-[#c99612] bg-[#fff3c4] text-[#7a5a00]' : 'border-black/10 bg-[#11131a] text-[#f6c347]'
                    }`}>
                        {recruitmentOpen ? 'Open' : 'Paused'}
                    </span>
                </div>
                <div className="mt-6">
                    <Button
                        type="button"
                        onClick={toggleRecruitment}
                        className="bg-[#f6c347] text-black hover:bg-[#ffd16b]"
                        disabled={recruitmentLoading}
                    >
                        {recruitmentLoading ? 'Updating...' : (recruitmentOpen ? 'Pause Recruitment' : 'Resume Recruitment')}
                    </Button>
                </div>
            </section>

            <section className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-xs uppercase tracking-[0.4em] text-slate-400">Admins</p>
                        <h2 className="text-2xl font-heading font-black">Manage Policies</h2>
                    </div>
                    <Button
                        type="button"
                        className="bg-[#f6c347] text-black hover:bg-[#ffd16b]"
                        onClick={saveAllPolicies}
                        disabled={policySaving || !hasPolicyChanges}
                    >
                        {policySaving ? 'Saving...' : (hasPolicyChanges ? 'Save changes' : 'No changes')}
                    </Button>
                </div>
                <div className="mt-6 space-y-4">
                    {admins.filter((admin) => admin.regno !== "0000000000").length ? admins.filter((admin) => admin.regno !== "0000000000").map((admin) => (
                        <div key={admin.id} className="rounded-2xl border border-black/10 bg-[#fffdf7] p-4">
                            <div className="flex flex-wrap items-center justify-between gap-4">
                                <div>
                                    <h3 className="text-lg font-heading font-bold">{admin.name || 'Admin'} <span className="text-sm text-slate-500">({admin.regno})</span></h3>
                                    <p className="text-xs text-slate-500">Admin access policy</p>
                                </div>
                                <div className="flex w-full flex-wrap items-center justify-start gap-4 md:w-auto md:justify-end">
                                    <label className="flex items-center gap-2 text-sm">
                                        <input
                                            type="checkbox"
                                            checked={policyEdits[admin.id]?.home || false}
                                            onChange={(e) => updatePolicyEdit(admin.id, "home", e.target.checked)}
                                        />
                                        Home
                                    </label>
                                    <label className="flex items-center gap-2 text-sm">
                                        <input
                                            type="checkbox"
                                            checked={policyEdits[admin.id]?.pf || false}
                                            onChange={(e) => updatePolicyEdit(admin.id, "pf", e.target.checked)}
                                        />
                                        Persofest
                                    </label>
                                    <label className="flex items-center gap-2 text-sm">
                                        <input
                                            type="checkbox"
                                            checked={policyEdits[admin.id]?.superAdmin || false}
                                            onChange={(e) => updatePolicyEdit(admin.id, "superAdmin", e.target.checked)}
                                        />
                                        SuperAdmin
                                    </label>
                                    <Button variant="outline" className="border-black/10" onClick={() => deleteAdmin(admin.id)}>
                                        Remove
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )) : (
                        <div className="rounded-2xl border border-black/10 bg-[#fffdf7] p-4 text-sm text-slate-500">
                            No admin users yet.
                        </div>
                    )}
                </div>
            </section>

        </AdminLayout>
    );
}
