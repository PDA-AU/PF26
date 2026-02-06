import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/context/AuthContext';
import AdminLayout from '@/pages/HomeAdmin/AdminLayout';
import { API } from '@/pages/HomeAdmin/adminApi';

const emptyAdmin = {
    regno: '',
    password: ''
};

export default function SuperAdmin() {
    const { user, getAuthHeader } = useAuth();
    const [admins, setAdmins] = useState([]);
    const [adminForm, setAdminForm] = useState(emptyAdmin);
    const [saving, setSaving] = useState(false);
    const [snapshotLoading, setSnapshotLoading] = useState(false);
    const [snapshotUrl, setSnapshotUrl] = useState('');
    const [recruitmentOpen, setRecruitmentOpen] = useState(true);
    const [recruitmentLoading, setRecruitmentLoading] = useState(false);

    const fetchData = useCallback(async () => {
        try {
            const adminsRes = await axios.get(`${API}/pda-admin/superadmin/admins`, { headers: getAuthHeader() });
            setAdmins(adminsRes.data || []);
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

    const handleAdminChange = (e) => {
        const { name, value } = e.target;
        setAdminForm(prev => ({ ...prev, [name]: value }));
    };

    const submitAdmin = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            await axios.post(`${API}/pda-admin/superadmin/admins`, {
                regno: adminForm.regno.trim(),
                password: adminForm.password.trim()
            }, { headers: getAuthHeader() });
            setAdminForm(emptyAdmin);
            fetchData();
        } catch (error) {
            console.error('Failed to create admin:', error);
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


    if (!user?.is_superadmin) {
        return (
            <AdminLayout title="Superadmin" subtitle="Access restricted to the superadmin account.">
                <div className="rounded-3xl border border-black/10 bg-white p-8 text-center text-sm text-slate-600">
                    You do not have permission to view this page.
                </div>
            </AdminLayout>
        );
    }

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
                    <div>
                        <Label htmlFor="admin-regno">Register Number</Label>
                        <Input
                            id="admin-regno"
                            name="regno"
                            value={adminForm.regno}
                            onChange={handleAdminChange}
                            placeholder="0000000000"
                            required
                        />
                    </div>
                    <div>
                        <Label htmlFor="admin-password">Password</Label>
                        <Input
                            id="admin-password"
                            name="password"
                            type="password"
                            value={adminForm.password}
                            onChange={handleAdminChange}
                            placeholder="Set a password"
                            required
                        />
                    </div>
                    <div className="md:col-span-2 flex justify-end">
                        <Button type="submit" className="bg-[#f6c347] text-black hover:bg-[#ffd16b]" disabled={saving}>
                            {saving ? 'Saving...' : 'Create Admin'}
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
                </div>
                <div className="mt-6 space-y-4">
                    {admins.length ? admins.map((admin) => (
                        <div key={admin.id} className="rounded-2xl border border-black/10 bg-[#fffdf7] p-4">
                            <div className="flex flex-wrap items-center justify-between gap-4">
                                <div>
                                    <h3 className="text-lg font-heading font-bold">{admin.regno}</h3>
                                    <p className="text-xs text-slate-500">Admin access policy</p>
                                </div>
                                <div className="flex items-center gap-3">
                                    <label className="flex items-center gap-2 text-sm">
                                        <input
                                            type="checkbox"
                                            checked={admin.policy?.home || false}
                                        onChange={(e) => updatePolicy(admin.id, { ...admin.policy, home: e.target.checked })}
                                        />
                                        Home
                                    </label>
                                    <label className="flex items-center gap-2 text-sm">
                                        <input
                                            type="checkbox"
                                            checked={admin.policy?.pf || false}
                                            onChange={(e) => updatePolicy(admin.id, { ...admin.policy, pf: e.target.checked })}
                                        />
                                        Persofest
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
