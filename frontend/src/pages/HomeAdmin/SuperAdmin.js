import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/context/AuthContext';
import AdminLayout from '@/pages/HomeAdmin/AdminLayout';
import { API } from '@/pages/HomeAdmin/adminApi';

const emptyAdmin = {
    register_number: '',
    name: '',
    email: '',
    password: '',
    phone: ''
};

export default function SuperAdmin() {
    const { user, getAuthHeader } = useAuth();
    const [admins, setAdmins] = useState([]);
    const [logs, setLogs] = useState([]);
    const [adminForm, setAdminForm] = useState(emptyAdmin);
    const [saving, setSaving] = useState(false);
    const [logSearch, setLogSearch] = useState('');

    const fetchData = useCallback(async () => {
        try {
            const [adminsRes, logsRes] = await Promise.all([
                axios.get(`${API}/pda-admin/superadmin/admins`, { headers: getAuthHeader() }),
                axios.get(`${API}/pda-admin/superadmin/logs`, { headers: getAuthHeader() })
            ]);
            setAdmins(adminsRes.data || []);
            setLogs(logsRes.data || []);
        } catch (error) {
            console.error('Failed to load superadmin data:', error);
        }
    }, [getAuthHeader]);

    useEffect(() => {
        if (user?.register_number === '0000000000') {
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
                register_number: adminForm.register_number.trim(),
                name: adminForm.name.trim(),
                email: adminForm.email.trim(),
                password: adminForm.password.trim(),
                phone: adminForm.phone.trim() || null
            }, { headers: getAuthHeader() });
            setAdminForm(emptyAdmin);
            fetchData();
        } catch (error) {
            console.error('Failed to create admin:', error);
        } finally {
            setSaving(false);
        }
    };

    const filteredLogs = logs.filter((log) => {
        const haystack = [log.admin_name, log.admin_register_number, log.action, log.path]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
        return haystack.includes(logSearch.toLowerCase());
    });

    if (user?.register_number !== '0000000000') {
        return (
            <AdminLayout title="Superadmin" subtitle="Access restricted to the superadmin account.">
                <div className="rounded-3xl border border-black/10 bg-white p-8 text-center text-sm text-slate-600">
                    You do not have permission to view this page.
                </div>
            </AdminLayout>
        );
    }

    return (
        <AdminLayout title="Superadmin" subtitle="Manage admin users and audit HomeAdmin actions.">
            <section className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <p className="text-xs uppercase tracking-[0.4em] text-slate-400">Admins</p>
                        <h2 className="text-2xl font-heading font-black">Add Admin</h2>
                    </div>
                </div>

                <form onSubmit={submitAdmin} className="mt-6 grid gap-4 md:grid-cols-2">
                    <div>
                        <Label htmlFor="admin-register">Register Number</Label>
                        <Input
                            id="admin-register"
                            name="register_number"
                            value={adminForm.register_number}
                            onChange={handleAdminChange}
                            placeholder="0000000000"
                            required
                        />
                    </div>
                    <div>
                        <Label htmlFor="admin-name">Name</Label>
                        <Input
                            id="admin-name"
                            name="name"
                            value={adminForm.name}
                            onChange={handleAdminChange}
                            placeholder="Admin name"
                            required
                        />
                    </div>
                    <div>
                        <Label htmlFor="admin-email">Email</Label>
                        <Input
                            id="admin-email"
                            name="email"
                            value={adminForm.email}
                            onChange={handleAdminChange}
                            placeholder="admin@mitindia.edu"
                            required
                        />
                    </div>
                    <div>
                        <Label htmlFor="admin-phone">Phone</Label>
                        <Input
                            id="admin-phone"
                            name="phone"
                            value={adminForm.phone}
                            onChange={handleAdminChange}
                            placeholder="Optional"
                        />
                    </div>
                    <div className="md:col-span-2">
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

                <div className="mt-8 grid gap-4 md:grid-cols-2">
                    {admins.length ? admins.map((admin) => (
                        <div key={admin.id} className="rounded-2xl border border-black/10 bg-[#fffdf7] p-4">
                            <h3 className="text-lg font-heading font-bold">{admin.name}</h3>
                            <p className="text-xs text-slate-500">{admin.register_number}</p>
                            <p className="text-xs text-slate-500">{admin.email}</p>
                        </div>
                    )) : (
                        <div className="rounded-2xl border border-black/10 bg-[#fffdf7] p-4 text-sm text-slate-500">
                            No admin users yet.
                        </div>
                    )}
                </div>
            </section>

            <section className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <p className="text-xs uppercase tracking-[0.4em] text-slate-400">Logs</p>
                        <h2 className="text-2xl font-heading font-black">HomeAdmin Activity</h2>
                    </div>
                    <Input
                        value={logSearch}
                        onChange={(e) => setLogSearch(e.target.value)}
                        placeholder="Search logs..."
                        className="md:max-w-sm"
                    />
                </div>

                <div className="mt-6 overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                        <thead className="text-xs uppercase tracking-[0.2em] text-slate-500">
                            <tr>
                                <th className="px-3 py-2">Admin</th>
                                <th className="px-3 py-2">Action</th>
                                <th className="px-3 py-2">Path</th>
                                <th className="px-3 py-2">Time</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-black/5">
                            {filteredLogs.length ? filteredLogs.map((log) => (
                                <tr key={log.id}>
                                    <td className="px-3 py-2">
                                        <p className="font-semibold text-slate-700">{log.admin_name}</p>
                                        <p className="text-xs text-slate-500">{log.admin_register_number}</p>
                                    </td>
                                    <td className="px-3 py-2 text-slate-700">{log.action}</td>
                                    <td className="px-3 py-2 text-slate-500">{log.path}</td>
                                    <td className="px-3 py-2 text-slate-500">
                                        {new Date(log.created_at).toLocaleString('en-IN')}
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={4} className="px-3 py-6 text-center text-slate-500">
                                        No logs yet.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>
        </AdminLayout>
    );
}
