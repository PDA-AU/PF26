import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/context/AuthContext';
import AdminLayout from '@/pages/HomeAdmin/AdminLayout';
import { API } from '@/pages/HomeAdmin/adminApi';

export default function LogsAdmin() {
    const { user, getAuthHeader } = useAuth();
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [logType, setLogType] = useState('any');
    const [logLimit, setLogLimit] = useState('50');
    const [logOffset, setLogOffset] = useState(0);

    const fetchLogs = useCallback(async () => {
        setLoading(true);
        try {
            const limit = Number(logLimit) || 50;
            const res = await axios.get(`${API}/pda-admin/superadmin/logs`, {
                headers: getAuthHeader(),
                params: {
                    limit,
                    offset: logOffset,
                    log_type: logType === 'any' ? undefined : logType,
                },
            });
            setLogs(res.data || []);
        } catch (error) {
            console.error('Failed to load logs:', error);
        } finally {
            setLoading(false);
        }
    }, [getAuthHeader, logLimit, logOffset, logType]);

    useEffect(() => {
        if (user?.is_superadmin) {
            fetchLogs();
        }
    }, [user, fetchLogs]);

    const pageSize = Number(logLimit) || 50;

    const filteredLogs = useMemo(() => {
        if (!search) return logs;
        const needle = search.toLowerCase();
        return logs.filter((log) => {
            const haystack = [
                log.admin_name,
                log.admin_register_number,
                log.action,
                log.path,
                log.method,
                log?.meta?.target_regno,
                log?.meta?.status_code,
            ]
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
                    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                        <Select
                            value={logType}
                            onValueChange={(value) => {
                                setLogType(value);
                                setLogOffset(0);
                            }}
                        >
                            <SelectTrigger className="w-[170px]">
                                <SelectValue placeholder="Log type" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="any">Any</SelectItem>
                                <SelectItem value="action">Action</SelectItem>
                                <SelectItem value="request">Request</SelectItem>
                            </SelectContent>
                        </Select>
                        <Select
                            value={logLimit}
                            onValueChange={(value) => {
                                setLogLimit(value);
                                setLogOffset(0);
                            }}
                        >
                            <SelectTrigger className="w-[130px]">
                                <SelectValue placeholder="Limit" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="25">25</SelectItem>
                                <SelectItem value="50">50</SelectItem>
                                <SelectItem value="100">100</SelectItem>
                                <SelectItem value="200">200</SelectItem>
                            </SelectContent>
                        </Select>
                        <Input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search logs..."
                            className="md:max-w-sm"
                        />
                    </div>
                </div>

                <div className="mt-6 overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                        <thead className="text-xs uppercase tracking-[0.2em] text-slate-500">
                            <tr>
                                <th className="px-3 py-2">Admin</th>
                                <th className="px-3 py-2">Target Regno</th>
                                <th className="px-3 py-2">Action</th>
                                <th className="px-3 py-2">Method</th>
                                <th className="px-3 py-2">Status</th>
                                <th className="px-3 py-2">Duration</th>
                                <th className="px-3 py-2">Path</th>
                                <th className="px-3 py-2">Time</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-black/5">
                            {loading ? (
                                <tr>
                                    <td colSpan={8} className="px-3 py-6 text-center text-slate-500">
                                        Loading...
                                    </td>
                                </tr>
                            ) : filteredLogs.length ? filteredLogs.map((log) => (
                                <tr key={log.id}>
                                    <td className="px-3 py-2">
                                        <p className="font-semibold text-slate-700">{log.admin_name}</p>
                                        <p className="text-xs text-slate-500">{log.admin_register_number}</p>
                                    </td>
                                    <td className="px-3 py-2 text-slate-700">{log?.meta?.target_regno || '—'}</td>
                                    <td className="px-3 py-2 text-slate-700">{log.action}</td>
                                    <td className="px-3 py-2 text-slate-500">{log.method || '—'}</td>
                                    <td className="px-3 py-2 text-slate-500">{log?.meta?.status_code ?? '—'}</td>
                                    <td className="px-3 py-2 text-slate-500">
                                        {log?.meta?.duration_ms ? `${log.meta.duration_ms} ms` : '—'}
                                    </td>
                                    <td className="px-3 py-2 text-slate-500">{log.path}</td>
                                    <td className="px-3 py-2 text-slate-500">
                                        {new Date(log.created_at).toLocaleString('en-IN')}
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={8} className="px-3 py-6 text-center text-slate-500">
                                        No logs yet.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
                <div className="mt-4 flex items-center justify-between">
                    <Button
                        variant="outline"
                        className="border-black/20"
                        disabled={logOffset === 0}
                        onClick={() => setLogOffset((prev) => Math.max(0, prev - pageSize))}
                    >
                        Previous
                    </Button>
                    <p className="text-xs text-slate-500">Offset {logOffset}</p>
                    <Button
                        variant="outline"
                        className="border-black/20"
                        disabled={logs.length < pageSize}
                        onClick={() => setLogOffset((prev) => prev + pageSize)}
                    >
                        Next
                    </Button>
                </div>
            </section>
        </AdminLayout>
    );
}
