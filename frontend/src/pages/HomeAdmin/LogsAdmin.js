import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/context/AuthContext';
import AdminLayout from '@/pages/HomeAdmin/AdminLayout';
import { API } from '@/pages/HomeAdmin/adminApi';

export default function LogsAdmin() {
    const { user, getAuthHeader } = useAuth();
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    const fetchLogs = useCallback(async () => {
        try {
            const res = await axios.get(`${API}/pda-admin/superadmin/logs`, { headers: getAuthHeader() });
            setLogs(res.data || []);
        } catch (error) {
            console.error('Failed to load logs:', error);
        } finally {
            setLoading(false);
        }
    }, [getAuthHeader]);

    useEffect(() => {
        if (user?.is_superadmin) {
            fetchLogs();
        }
    }, [user, fetchLogs]);

    const filteredLogs = useMemo(() => {
        if (!search) return logs;
        const needle = search.toLowerCase();
        return logs.filter((log) => {
            const haystack = [log.admin_name, log.admin_register_number, log.action, log.path]
                .filter(Boolean)
                .join(' ')
                .toLowerCase();
            return haystack.includes(needle);
        });
    }, [logs, search]);

    if (!user?.is_superadmin) {
        return (
            <AdminLayout title="Logs" subtitle="Access restricted to the superadmin account.">
                <div className="rounded-3xl border border-black/10 bg-white p-8 text-center text-sm text-slate-600">
                    You do not have permission to view this page.
                </div>
            </AdminLayout>
        );
    }

    return (
        <AdminLayout title="Logs" subtitle="Audit trail for HomeAdmin actions.">
            <section className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <p className="text-xs uppercase tracking-[0.4em] text-slate-400">Logs</p>
                        <h2 className="text-2xl font-heading font-black">HomeAdmin Activity</h2>
                    </div>
                    <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
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
                            {loading ? (
                                <tr>
                                    <td colSpan={4} className="px-3 py-6 text-center text-slate-500">
                                        Loading...
                                    </td>
                                </tr>
                            ) : filteredLogs.length ? filteredLogs.map((log) => (
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
