import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Mail, Search } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/context/AuthContext';

import EventAdminShell, { useEventAdminShell } from './EventAdminShell';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const PAGE_SIZE = 12;

const DEPARTMENTS = [
    { value: 'Artificial Intelligence and Data Science', label: 'AI & DS' },
    { value: 'Aerospace Engineering', label: 'Aerospace' },
    { value: 'Automobile Engineering', label: 'Automobile' },
    { value: 'Computer Technology', label: 'CT' },
    { value: 'Electronics and Communication Engineering', label: 'ECE' },
    { value: 'Electronics and Instrumentation Engineering', label: 'EIE' },
    { value: 'Production Technology', label: 'Production' },
    { value: 'Robotics and Automation', label: 'Robotics' },
    { value: 'Rubber and Plastics Technology', label: 'RPT' },
    { value: 'Information Technology', label: 'IT' },
];

const GENDERS = ['Male', 'Female'];
const STATUSES = ['Active', 'Eliminated'];

const MODE_OPTIONS = [
    { value: 'registered', label: 'Registered' },
    { value: 'active', label: 'Active' },
    { value: 'eliminated', label: 'Eliminated' },
    { value: 'unregistered', label: 'Unregistered' },
    { value: 'top_k', label: 'Top K' },
    { value: 'selected', label: 'Selected' },
];

const TAG_GROUPS = [
    {
        title: 'Core user/team',
        tags: [
            '<name>', '<profile_name>', '<regno>', '<email>', '<dept>', '<gender>', '<phno>', '<dob>',
            '<team>', '<designation>',
            '<instagram_url>', '<linkedin_url>', '<github_url>',
            '<resume_url>', '<photo_url>',
            '<is_member>', '<is_applied>', '<email_verified>',
            '<preferred_team>', '<preferred_team_1>', '<preferred_team_2>', '<preferred_team_3>',
            '<created_at>', '<updated_at>'
        ]
    },
    {
        title: 'Event / participant',
        tags: [
            '<status>', '<batch>', '<regno_or_code>',
            '<referral_code>', '<referred_by>', '<referral_count>',
            '<entity_id>', '<participant_id>', '<entity_type>',
            '<team_name>', '<team_code>', '<members_count>',
            '<leader_name>', '<leader_regno>', '<leader_email>', '<leader_profile_name>', '<leader_dept>', '<leader_phno>', '<leader_gender>', '<leader_batch>',
            '<event_title>', '<event_code>'
        ]
    },
    {
        title: 'Leaderboard',
        tags: ['<rank>', '<cumulative_score>', '<attendance_count>', '<rounds_participated>']
    }
];

function EventAdminEmailContent() {
    const { getAuthHeader } = useAuth();
    const {
        eventInfo,
        eventSlug,
        pushLocalUndo,
        warnNonUndoable,
    } = useEventAdminShell();
    const isTeamMode = eventInfo?.participant_mode === 'team';

    const [registeredRows, setRegisteredRows] = useState([]);
    const [unregisteredRows, setUnregisteredRows] = useState([]);
    const [loadingRegistered, setLoadingRegistered] = useState(true);
    const [loadingUnregistered, setLoadingUnregistered] = useState(false);
    const [filters, setFilters] = useState({
        department: '',
        gender: '',
        batch: '',
        status: '',
        search: '',
    });
    const [mode, setMode] = useState('selected');
    const [topK, setTopK] = useState('10');
    const [sortBy, setSortBy] = useState('name');
    const [sortDir, setSortDir] = useState('asc');
    const [page, setPage] = useState(1);
    const [selectedMap, setSelectedMap] = useState({});
    const [subject, setSubject] = useState('');
    const [htmlBody, setHtmlBody] = useState('');
    const [sending, setSending] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [lastSendInfo, setLastSendInfo] = useState(null);
    const displayTeamMode = isTeamMode && mode !== 'unregistered';

    const getErrorMessage = (error, fallback) => (
        error?.response?.data?.detail || error?.response?.data?.message || fallback
    );

    const fetchAllParticipants = useCallback(async () => {
        setLoadingRegistered(true);
        try {
            const pageSize = 200;
            let pageIndex = 1;
            let allRows = [];
            let total = 0;
            while (true) {
                const params = new URLSearchParams();
                params.append('page', String(pageIndex));
                params.append('page_size', String(pageSize));
                const response = await axios.get(`${API}/pda-admin/events/${eventSlug}/participants?${params.toString()}`, {
                    headers: getAuthHeader(),
                });
                const data = Array.isArray(response.data) ? response.data : [];
                total = Number(response.headers['x-total-count'] || data.length || 0);
                allRows = allRows.concat(data);
                if (allRows.length >= total || data.length === 0) break;
                pageIndex += 1;
            }
            setRegisteredRows(allRows);
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to load participants'));
        } finally {
            setLoadingRegistered(false);
        }
    }, [eventSlug, getAuthHeader]);

    const fetchUnregistered = useCallback(async () => {
        setLoadingUnregistered(true);
        try {
            const pageSize = 200;
            let pageIndex = 1;
            let allRows = [];
            let total = 0;
            while (true) {
                const params = new URLSearchParams();
                params.append('page', String(pageIndex));
                params.append('page_size', String(pageSize));
                const response = await axios.get(`${API}/pda-admin/events/${eventSlug}/unregistered-users?${params.toString()}`, {
                    headers: getAuthHeader(),
                });
                const data = Array.isArray(response.data) ? response.data : [];
                total = Number(response.headers['x-total-count'] || data.length || 0);
                allRows = allRows.concat(data);
                if (allRows.length >= total || data.length === 0) break;
                pageIndex += 1;
            }
            setUnregisteredRows(allRows);
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to load unregistered users'));
        } finally {
            setLoadingUnregistered(false);
        }
    }, [eventSlug, getAuthHeader]);

    useEffect(() => {
        fetchAllParticipants();
    }, [fetchAllParticipants]);

    useEffect(() => {
        if (mode === 'unregistered' && unregisteredRows.length === 0 && !loadingUnregistered) {
            fetchUnregistered();
        }
        if (mode === 'unregistered' && filters.status) {
            setFilters((prev) => ({ ...prev, status: '' }));
        }
    }, [mode, filters.status, unregisteredRows.length, loadingUnregistered, fetchUnregistered]);

    useEffect(() => {
        setPage(1);
    }, [filters.department, filters.gender, filters.batch, filters.status, filters.search, sortBy, sortDir]);

    useEffect(() => {
        setSelectedMap({});
    }, [mode]);

    const rows = mode === 'unregistered' ? unregisteredRows : registeredRows;
    const loading = mode === 'unregistered' ? loadingUnregistered : loadingRegistered;

    const filtered = useMemo(() => {
        let items = [...rows];
        if (!displayTeamMode) {
            if (filters.department) items = items.filter((row) => String(row.department || '') === filters.department);
            if (filters.gender) items = items.filter((row) => String(row.gender || '') === filters.gender);
            if (filters.batch) items = items.filter((row) => String(row.batch || '') === filters.batch);
        }
        if (filters.status && mode !== 'unregistered') {
            const normalized = String(filters.status).toLowerCase();
            items = items.filter((row) => String(row.status || '').toLowerCase() === normalized);
        }
        if (filters.search) {
            const needle = filters.search.toLowerCase();
            items = items.filter((row) => {
                const haystack = [
                    row.name,
                    row.regno_or_code,
                    row.email,
                    row.department,
                    row.gender,
                    row.batch
                ]
                    .filter(Boolean)
                    .join(' ')
                    .toLowerCase();
                return haystack.includes(needle);
            });
        }
        const dir = sortDir === 'asc' ? 1 : -1;
        items.sort((a, b) => {
            if (sortBy === 'regno_or_code') return (a.regno_or_code || '').localeCompare(b.regno_or_code || '') * dir;
            if (sortBy === 'status') return (a.status || '').localeCompare(b.status || '') * dir;
            if (sortBy === 'batch') return String(a.batch || '').localeCompare(String(b.batch || '')) * dir;
            return (a.name || '').localeCompare(b.name || '') * dir;
        });
        return items;
    }, [rows, filters, sortBy, sortDir, displayTeamMode, mode]);

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    const allSelected = filtered.length > 0 && filtered.every((row) => selectedMap[row.entity_id]);
    const selectedCount = useMemo(() => (
        Object.keys(selectedMap).filter((id) => selectedMap[id]).length
    ), [selectedMap]);
    const setFiltersWithUndo = useCallback((updater, label) => {
        const previous = { ...filters };
        const next = typeof updater === 'function' ? updater(previous) : updater;
        setFilters(next);
        pushLocalUndo({
            label: label || 'Undo email filter change',
            undoFn: () => setFilters(previous),
        });
    }, [filters, pushLocalUndo]);

    const toggleSelect = (id) => {
        setSelectedMap((prev) => ({ ...prev, [id]: !prev[id] }));
    };

    const toggleSelectAll = () => {
        if (allSelected) {
            const next = { ...selectedMap };
            filtered.forEach((row) => {
                delete next[row.entity_id];
            });
            setSelectedMap(next);
            return;
        }
        const next = { ...selectedMap };
        filtered.forEach((row) => {
            next[row.entity_id] = true;
        });
        setSelectedMap(next);
    };

    const getRecipientCountPreview = () => {
        const base = filtered;
        if (selectedCount > 0) return selectedCount;
        if (mode === 'selected') return selectedCount;
        if (mode === 'top_k') return Math.min(Number(topK) || 0, base.length);
        if (mode === 'active') return base.filter((row) => String(row.status || '').toLowerCase() === 'active').length;
        if (mode === 'eliminated') return base.filter((row) => String(row.status || '').toLowerCase() === 'eliminated').length;
        return base.length;
    };

    const requestSend = () => {
        if (!subject.trim() || !htmlBody.trim()) {
            toast.error('Subject and HTML body are required.');
            return;
        }
        if (selectedCount === 0 && mode === 'selected') {
            toast.error('Select at least one participant.');
            return;
        }
        if (mode === 'top_k' && (!topK || Number(topK) <= 0)) {
            toast.error('Top K must be a positive number.');
            return;
        }
        const previewCount = getRecipientCountPreview();
        if (previewCount === 0) {
            toast.error('No recipients match the current selection.');
            return;
        }
        setConfirmOpen(true);
    };

    const handleSend = async () => {
        if (!subject.trim() || !htmlBody.trim()) {
            toast.error('Subject and HTML body are required.');
            return;
        }
        const selectedIds = Object.keys(selectedMap).filter((id) => selectedMap[id]).map(Number);
        const effectiveMode = selectedIds.length > 0 ? 'selected' : mode;
        if (effectiveMode === 'selected' && selectedIds.length === 0) {
            toast.error('Select at least one participant.');
            return;
        }
        if (mode === 'top_k' && (!topK || Number(topK) <= 0)) {
            toast.error('Top K must be a positive number.');
            return;
        }
        setSending(true);
        try {
            const payload = {
                subject: subject.trim(),
                html: htmlBody,
                recipient_mode: effectiveMode,
                department: filters.department || undefined,
                gender: filters.gender || undefined,
                batch: filters.batch || undefined,
                status: filters.status || undefined,
                search: filters.search || undefined,
            };
            if (effectiveMode === 'selected') {
                payload.entity_ids = selectedIds;
                if (mode !== 'selected') {
                    payload.selected_source = mode;
                }
            }
            if (effectiveMode === 'top_k') payload.top_k = Number(topK);
            if (effectiveMode === 'unregistered') {
                payload.status = undefined;
            }

            const res = await axios.post(`${API}/pda-admin/events/${eventSlug}/email/bulk`, payload, { headers: getAuthHeader() });
            const info = res.data || {};
            setLastSendInfo({
                ...info,
                mode: effectiveMode,
                at: new Date(),
            });
            if (info.queued !== undefined) {
                toast.success(`Queued ${info.queued} email(s). Skipped ${info.skipped_no_email || 0} with no email.`);
            } else {
                toast.success(`Sent ${info.sent || 0} email(s). Skipped ${info.skipped_no_email || 0} with no email.`);
            }
            setSelectedMap({});
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to send emails'));
        } finally {
            setSending(false);
        }
    };

    const batchOptions = useMemo(() => {
        const values = new Set();
        rows.forEach((row) => {
            if (row.batch) values.add(String(row.batch));
        });
        return Array.from(values).sort();
    }, [rows]);

    return (
        <>
            <div className="neo-card mb-6">
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6">
                    <div>
                        <h1 className="font-heading font-bold text-3xl flex items-center gap-2">
                            <Mail className="w-7 h-7" /> Email
                        </h1>
                        <p className="text-gray-600">Bulk email event participants</p>
                    </div>
                </div>

                <div className={`grid gap-3 ${displayTeamMode ? 'grid-cols-1 md:grid-cols-3' : 'grid-cols-1 md:grid-cols-5'}`}>
                    <div className={`relative ${displayTeamMode ? 'md:col-span-2' : 'md:col-span-2'}`}>
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <Input
                            placeholder={`Search ${displayTeamMode ? 'team' : 'participant'}...`}
                            value={filters.search}
                            onChange={(e) => setFiltersWithUndo(
                                (prev) => ({ ...prev, search: e.target.value }),
                                'Undo email search change'
                            )}
                            className="neo-input pl-10"
                        />
                    </div>

                    {!displayTeamMode ? (
                        <Select
                            value={filters.department || 'all'}
                            onValueChange={(value) => setFiltersWithUndo(
                                (prev) => ({ ...prev, department: value === 'all' ? '' : value }),
                                'Undo email department filter'
                            )}
                        >
                            <SelectTrigger className="neo-input"><SelectValue placeholder="Department" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Departments</SelectItem>
                                {DEPARTMENTS.map((d) => (
                                    <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    ) : null}

                    {!displayTeamMode ? (
                        <Select
                            value={filters.gender || 'all'}
                            onValueChange={(value) => setFiltersWithUndo(
                                (prev) => ({ ...prev, gender: value === 'all' ? '' : value }),
                                'Undo email gender filter'
                            )}
                        >
                            <SelectTrigger className="neo-input"><SelectValue placeholder="Gender" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Genders</SelectItem>
                                {GENDERS.map((gender) => (
                                    <SelectItem key={gender} value={gender}>{gender}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    ) : null}

                    {!displayTeamMode ? (
                        <Select
                            value={filters.batch || 'all'}
                            onValueChange={(value) => setFiltersWithUndo(
                                (prev) => ({ ...prev, batch: value === 'all' ? '' : value }),
                                'Undo email batch filter'
                            )}
                        >
                            <SelectTrigger className="neo-input"><SelectValue placeholder="Batch" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Batches</SelectItem>
                                {batchOptions.map((batch) => (
                                    <SelectItem key={batch} value={batch}>{batch}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    ) : null}

                    {mode !== 'unregistered' ? (
                        <Select
                            value={filters.status || 'all'}
                            onValueChange={(value) => setFiltersWithUndo(
                                (prev) => ({ ...prev, status: value === 'all' ? '' : value }),
                                'Undo email status filter'
                            )}
                        >
                            <SelectTrigger className="neo-input"><SelectValue placeholder="Status" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Statuses</SelectItem>
                                {STATUSES.map((status) => (
                                    <SelectItem key={status} value={status}>{status}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    ) : null}
                </div>
            </div>

            <div className="neo-card mb-6 space-y-4">
                <div className="grid gap-3 md:grid-cols-4">
                    <div className="space-y-2">
                        <Label>Recipient Mode</Label>
                        <Select
                            value={mode}
                            onValueChange={(value) => {
                                const previous = mode;
                                setMode(value);
                                pushLocalUndo({
                                    label: 'Undo email recipient mode change',
                                    undoFn: () => setMode(previous),
                                });
                            }}
                        >
                            <SelectTrigger className="neo-input"><SelectValue placeholder="Select mode" /></SelectTrigger>
                            <SelectContent>
                                {MODE_OPTIONS.map((opt) => (
                                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    {mode === 'top_k' ? (
                        <div className="space-y-2">
                            <Label>Top K</Label>
                            <Input
                                value={topK}
                                onChange={(e) => {
                                    const previous = topK;
                                    const next = e.target.value;
                                    setTopK(next);
                                    pushLocalUndo({
                                        label: 'Undo top-k change',
                                        undoFn: () => setTopK(previous),
                                    });
                                }}
                                className="neo-input"
                                type="number"
                                min="1"
                            />
                        </div>
                    ) : null}
                    <div className="space-y-2">
                        <Label>Sort</Label>
                        <div className="flex gap-2">
                            <Select
                                value={sortBy}
                                onValueChange={(value) => {
                                    const previous = sortBy;
                                    setSortBy(value);
                                    pushLocalUndo({
                                        label: 'Undo email sort field change',
                                        undoFn: () => setSortBy(previous),
                                    });
                                }}
                            >
                                <SelectTrigger className="neo-input"><SelectValue placeholder="Sort by" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="name">Name</SelectItem>
                                    <SelectItem value="regno_or_code">{displayTeamMode ? 'Team Code' : 'Register No'}</SelectItem>
                                    <SelectItem value="status">Status</SelectItem>
                                    {!displayTeamMode ? <SelectItem value="batch">Batch</SelectItem> : null}
                                </SelectContent>
                            </Select>
                            <Select
                                value={sortDir}
                                onValueChange={(value) => {
                                    const previous = sortDir;
                                    setSortDir(value);
                                    pushLocalUndo({
                                        label: 'Undo email sort direction change',
                                        undoFn: () => setSortDir(previous),
                                    });
                                }}
                            >
                                <SelectTrigger className="neo-input"><SelectValue placeholder="Direction" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="asc">Ascending</SelectItem>
                                    <SelectItem value="desc">Descending</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Checkbox checked={allSelected} onCheckedChange={toggleSelectAll} />
                    <span className="text-sm font-medium">Select all filtered</span>
                    {selectedCount > 0 ? (
                        <span className="text-xs text-slate-500 ml-2">Selected: {selectedCount}</span>
                    ) : null}
                    {displayTeamMode ? (
                        <span className="text-xs text-slate-500 ml-3">Team-mode emails go to team lead only.</span>
                    ) : null}
                </div>

                {loading ? (
                    <div className="text-sm text-slate-500">Loading participants...</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="neo-table">
                            <thead>
                                <tr>
                                    <th></th>
                                    <th>{displayTeamMode ? 'Team Code' : 'Register No'}</th>
                                    <th>{displayTeamMode ? 'Team Name' : 'Name'}</th>
                                    <th>{displayTeamMode ? 'Members' : 'Email'}</th>
                                    {!displayTeamMode ? <th>Department</th> : null}
                                    {!displayTeamMode ? <th>Batch</th> : null}
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {paged.map((row) => (
                                    <tr key={`${row.entity_type}-${row.entity_id}`}>
                                        <td>
                                            <Checkbox checked={Boolean(selectedMap[row.entity_id])} onCheckedChange={() => toggleSelect(row.entity_id)} />
                                        </td>
                                        <td className="font-mono font-bold">{row.regno_or_code}</td>
                                        <td className="font-medium">{row.name}</td>
                                        {displayTeamMode ? (
                                            <td>{row.members_count || 0}</td>
                                        ) : (
                                            <td className="text-sm">{row.email}</td>
                                        )}
                                        {!displayTeamMode ? (
                                            <td className="text-sm">{DEPARTMENTS.find((d) => d.value === row.department)?.label || row.department}</td>
                                        ) : null}
                                        {!displayTeamMode ? <td className="text-sm">{row.batch}</td> : null}
                                        <td>
                                            <span className={`tag border-2 ${row.status === 'Active' ? 'bg-green-100 text-green-800 border-green-500' : 'bg-red-100 text-red-800 border-red-500'}`}>
                                                {row.status}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {filtered.length > PAGE_SIZE ? (
                    <div className="flex items-center justify-between">
                        <p className="text-xs text-slate-500">Page {page} / {totalPages}</p>
                        <div className="flex gap-2">
                            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((prev) => Math.max(1, prev - 1))}>
                                Previous
                            </Button>
                            <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}>
                                Next
                            </Button>
                        </div>
                    </div>
                ) : null}
            </div>

            <div className="neo-card space-y-4">
                <h2 className="font-heading font-bold text-2xl">Email Content</h2>
                <div className="space-y-2">
                    <Label>Subject</Label>
                    <Input
                        value={subject}
                        onChange={(e) => {
                            const previous = subject;
                            const next = e.target.value;
                            setSubject(next);
                            pushLocalUndo({
                                label: 'Undo email subject edit',
                                undoFn: () => setSubject(previous),
                            });
                        }}
                        className="neo-input"
                        placeholder="Subject line"
                    />
                </div>
                <div className="space-y-2">
                    <Label>HTML Body</Label>
                    <Textarea
                        value={htmlBody}
                        onChange={(e) => {
                            const previous = htmlBody;
                            const next = e.target.value;
                            setHtmlBody(next);
                            pushLocalUndo({
                                label: 'Undo email body edit',
                                undoFn: () => setHtmlBody(previous),
                            });
                        }}
                        className="neo-input min-h-[220px]"
                        placeholder="<p>Hello <name>, ...</p>"
                    />
                </div>
                <div className="rounded-2xl border border-black/10 bg-white p-4 text-sm text-slate-700">
                    <div className="font-semibold mb-2">Available tags</div>
                    <p className="text-xs text-slate-500 mb-3">
                        Tags are case-insensitive; missing values become empty. Supports both <code>&lt;name&gt;</code> and <code>{'{{ name }}'}</code> styles. Leaderboard tags populate when available.
                    </p>
                    {isTeamMode ? (
                        <p className="text-xs text-slate-500 mb-3">
                            Team-mode emails go to the team lead only. Use <code>&lt;team_*&gt;</code> for team info and <code>&lt;leader_*&gt;</code> for lead info.
                        </p>
                    ) : null}
                    <div className="grid gap-3 md:grid-cols-3">
                        {TAG_GROUPS.map((group) => (
                            <div key={group.title}>
                                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">{group.title}</p>
                                <p className="text-xs text-slate-600 leading-relaxed">{group.tags.join(' ')}</p>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <Button onClick={requestSend} disabled={sending} className="bg-primary text-white border-2 border-black shadow-neo">
                        {sending ? 'Sending...' : 'Send Email'}
                    </Button>
                    {lastSendInfo ? (
                        <div className="text-xs text-slate-500">
                            Last: {lastSendInfo.queued ?? lastSendInfo.sent ?? 0} {lastSendInfo.queued !== undefined ? 'queued' : 'sent'}
                            {lastSendInfo.skipped_no_email ? ` · ${lastSendInfo.skipped_no_email} skipped` : ''}
                        </div>
                    ) : null}
                </div>
            </div>

            <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <DialogContent className="border-4 border-black">
                    <DialogHeader>
                        <DialogTitle className="font-heading font-bold text-xl">Confirm Send</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <p className="text-gray-600">
                            Send email to {getRecipientCountPreview()} recipient(s)?
                        </p>
                        {mode === 'selected' ? (
                            <p className="text-xs text-slate-500">Selected count: {selectedCount}</p>
                        ) : null}
                        <div className="flex gap-2">
                            <Button variant="outline" className="flex-1 border-2 border-black" onClick={() => setConfirmOpen(false)}>
                                Cancel
                            </Button>
                            <Button
                                className="flex-1 bg-primary text-white border-2 border-black"
                                onClick={async () => {
                                    setConfirmOpen(false);
                                    warnNonUndoable({
                                        title: 'Send Email Is Not Undoable',
                                        message: 'Sending bulk email cannot be undone from header Undo. Continue?',
                                        proceed: handleSend,
                                    });
                                }}
                            >
                                Confirm
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}

export default function EventAdminEmailPage() {
    return (
        <EventAdminShell activeTab="email">
            <EventAdminEmailContent />
        </EventAdminShell>
    );
}
