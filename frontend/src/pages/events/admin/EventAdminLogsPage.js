import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/context/AuthContext';

import EventAdminShell, { useEventAdminShell } from './EventAdminShell';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

function LogsContent() {
    const { getAuthHeader } = useAuth();
    const { eventSlug, pushLocalUndo } = useEventAdminShell();
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [logLimit, setLogLimit] = useState('50');
    const [logOffset, setLogOffset] = useState(0);
    const [filters, setFilters] = useState({
        action: '',
        method: '',
        path_contains: '',
    });

    const getErrorMessage = (error, fallback) => (
        error?.response?.data?.detail || error?.response?.data?.message || fallback
    );

    const fetchLogs = useCallback(async () => {
        setLoading(true);
        try {
            const limit = Number(logLimit) || 50;
            const response = await axios.get(`${API}/pda-admin/events/${eventSlug}/logs`, {
                headers: getAuthHeader(),
                params: {
                    limit,
                    offset: logOffset,
                    action: filters.action || undefined,
                    method: filters.method || undefined,
                    path_contains: filters.path_contains || undefined,
                },
            });
            setRows(response.data || []);
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to load logs'));
            setRows([]);
        } finally {
            setLoading(false);
        }
    }, [eventSlug, filters.action, filters.method, filters.path_contains, getAuthHeader, logLimit, logOffset]);

    useEffect(() => {
        fetchLogs();
    }, [fetchLogs]);

    return (
        <>
            <div className="neo-card mb-6">
                <div className="flex flex-wrap items-end gap-3">
                    <div>
                        <Label>Action</Label>
                        <Input
                            value={filters.action}
                            onChange={(e) => {
                                const previous = { ...filters };
                                const nextValue = e.target.value;
                                setFilters((prev) => ({ ...prev, action: nextValue }));
                                pushLocalUndo({
                                    label: 'Undo logs action filter',
                                    undoFn: () => setFilters(previous),
                                });
                            }}
                            placeholder="Filter action"
                        />
                    </div>
                    <div>
                        <Label>Method</Label>
                        <Select
                            value={filters.method || 'any'}
                            onValueChange={(value) => {
                                const previous = { ...filters };
                                const nextValue = value === 'any' ? '' : value;
                                setFilters((prev) => ({ ...prev, method: nextValue }));
                                pushLocalUndo({
                                    label: 'Undo logs method filter',
                                    undoFn: () => setFilters(previous),
                                });
                            }}
                        >
                            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="any">Any</SelectItem>
                                <SelectItem value="GET">GET</SelectItem>
                                <SelectItem value="POST">POST</SelectItem>
                                <SelectItem value="PUT">PUT</SelectItem>
                                <SelectItem value="DELETE">DELETE</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="min-w-[220px]">
                        <Label>Path Contains</Label>
                        <Input
                            value={filters.path_contains}
                            onChange={(e) => {
                                const previous = { ...filters };
                                const nextValue = e.target.value;
                                setFilters((prev) => ({ ...prev, path_contains: nextValue }));
                                pushLocalUndo({
                                    label: 'Undo logs path filter',
                                    undoFn: () => setFilters(previous),
                                });
                            }}
                            placeholder="/rounds/"
                        />
                    </div>
                    <div>
                        <Label>Limit</Label>
                        <Select
                            value={logLimit}
                            onValueChange={(value) => {
                                const previous = logLimit;
                                setLogLimit(value);
                                pushLocalUndo({
                                    label: 'Undo logs limit change',
                                    undoFn: () => setLogLimit(previous),
                                });
                            }}
                        >
                            <SelectTrigger className="w-[110px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="25">25</SelectItem>
                                <SelectItem value="50">50</SelectItem>
                                <SelectItem value="100">100</SelectItem>
                                <SelectItem value="200">200</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <Button variant="outline" className="border-black/20" onClick={() => { setLogOffset(0); fetchLogs(); }}>Apply</Button>
                    <Button
                        variant="outline"
                        className="border-black/20"
                        onClick={() => {
                            const previousFilters = { ...filters };
                            const previousOffset = logOffset;
                            setFilters({ action: '', method: '', path_contains: '' });
                            setLogOffset(0);
                            pushLocalUndo({
                                label: 'Undo logs filter reset',
                                undoFn: () => {
                                    setFilters(previousFilters);
                                    setLogOffset(previousOffset);
                                },
                            });
                        }}
                    >
                        Reset
                    </Button>
                </div>
            </div>

            {loading ? (
                <div className="neo-card text-center py-12">
                    <p className="text-gray-600">Loading logs...</p>
                </div>
            ) : (
                <>
                    <div className="overflow-x-auto">
                        <table className="neo-table">
                            <thead>
                                <tr>
                                    <th>Time</th>
                                    <th>Admin</th>
                                    <th>Action</th>
                                    <th>Method</th>
                                    <th>Path</th>
                                    <th>Meta</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((row) => (
                                    <tr key={row.id}>
                                        <td className="text-sm whitespace-nowrap">{new Date(row.created_at).toLocaleString()}</td>
                                        <td className="text-sm">
                                            <div>{row.admin_name}</div>
                                            <div className="text-xs text-slate-500">{row.admin_register_number}</div>
                                        </td>
                                        <td className="font-medium">{row.action}</td>
                                        <td className="text-sm">{row.method || '—'}</td>
                                        <td className="text-sm">{row.path || '—'}</td>
                                        <td className="text-xs font-mono max-w-[320px] break-words">{row.meta ? JSON.stringify(row.meta) : '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {rows.length === 0 ? (
                        <div className="neo-card mt-4 text-center py-8 text-gray-600">No logs found.</div>
                    ) : null}
                    <div className="mt-4 flex items-center justify-between">
                        <Button
                            variant="outline"
                            className="border-black/20"
                            disabled={logOffset === 0}
                            onClick={() => setLogOffset((prev) => Math.max(0, prev - (Number(logLimit) || 50)))}
                        >
                            Previous
                        </Button>
                        <p className="text-xs text-slate-500">Offset {logOffset}</p>
                        <Button
                            variant="outline"
                            className="border-black/20"
                            disabled={rows.length < (Number(logLimit) || 50)}
                            onClick={() => setLogOffset((prev) => prev + (Number(logLimit) || 50))}
                        >
                            Next
                        </Button>
                    </div>
                </>
            )}
        </>
    );
}

export default function EventAdminLogsPage() {
    return (
        <EventAdminShell activeTab="logs">
            <LogsContent />
        </EventAdminShell>
    );
}
