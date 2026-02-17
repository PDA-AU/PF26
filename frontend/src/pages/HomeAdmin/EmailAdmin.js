import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import AdminLayout from '@/pages/HomeAdmin/AdminLayout';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const PAGE_SIZE = 12;

const DEPARTMENTS = [
    { value: 'Artificial Intelligence and Data Science', label: 'AI & Data Science' },
    { value: 'Aerospace Engineering', label: 'Aerospace Engineering' },
    { value: 'Automobile Engineering', label: 'Automobile Engineering' },
    { value: 'Computer Technology', label: 'Computer Technology' },
    { value: 'Electronics and Communication Engineering', label: 'ECE' },
    { value: 'Electronics and Instrumentation Engineering', label: 'EIE' },
    { value: 'Production Technology', label: 'Production Technology' },
    { value: 'Robotics and Automation', label: 'Robotics & Automation' },
    { value: 'Rubber and Plastics Technology', label: 'Rubber & Plastics' },
    { value: 'Information Technology', label: 'Information Technology' }
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

const recipientModes = [
    { value: 'team', label: 'PDA Team' },
    { value: 'all_users', label: 'All Users' },
    { value: 'batch', label: 'Batch' },
    { value: 'department', label: 'Department' },
    { value: 'selected', label: 'Selected Users' },
];

const normalizeBatch = (regno) => {
    const value = String(regno || '').trim();
    if (value.length >= 4 && /^\d{4}/.test(value)) {
        return value.slice(0, 4);
    }
    return '';
};

const getRowKey = (row) => {
    if (row && row.user_id) return String(row.user_id);
    if (row && row.id) return String(row.id);
    return '';
};

export default function EmailAdmin() {
    const { getAuthHeader } = useAuth();
    const [mode, setMode] = useState('selected');
    const [users, setUsers] = useState([]);
    const [teamRows, setTeamRows] = useState([]);
    const [loadingUsers, setLoadingUsers] = useState(true);
    const [loadingTeams, setLoadingTeams] = useState(true);
    const [search, setSearch] = useState('');
    const [department, setDepartment] = useState('all');
    const [batch, setBatch] = useState('all');
    const [sortBy, setSortBy] = useState('name');
    const [sortDir, setSortDir] = useState('asc');
    const [page, setPage] = useState(1);
    const [selectedMap, setSelectedMap] = useState({});
    const [subject, setSubject] = useState('');
    const [htmlBody, setHtmlBody] = useState('');
    const [sending, setSending] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [lastSendInfo, setLastSendInfo] = useState(null);

    const loadUsers = useCallback(async () => {
        setLoadingUsers(true);
        try {
            const res = await axios.get(`${API}/pda-admin/users`, { headers: getAuthHeader() });
            const rows = (res.data || []).filter((row) => String(row?.regno || '') !== '0000000000');
            setUsers(rows);
        } catch (error) {
            toast.error(error?.response?.data?.detail || 'Failed to load users');
        } finally {
            setLoadingUsers(false);
        }
    }, [getAuthHeader]);

    const loadTeam = useCallback(async () => {
        setLoadingTeams(true);
        try {
            const res = await axios.get(`${API}/pda-admin/team`, { headers: getAuthHeader() });
            setTeamRows(res.data || []);
        } catch (error) {
            toast.error(error?.response?.data?.detail || 'Failed to load team members');
        } finally {
            setLoadingTeams(false);
        }
    }, [getAuthHeader]);

    useEffect(() => {
        loadUsers();
        loadTeam();
    }, [loadUsers, loadTeam]);

    useEffect(() => {
        setPage(1);
    }, [mode, search, department, batch, sortBy, sortDir]);

    useEffect(() => {
        setSelectedMap({});
    }, [mode]);

    const batchOptions = useMemo(() => {
        const values = new Set();
        users.forEach((user) => {
            const val = normalizeBatch(user.regno);
            if (val) values.add(val);
        });
        return Array.from(values).sort();
    }, [users]);

    const filteredUsers = useMemo(() => {
        let rows = [...users];
        if (department !== 'all') {
            rows = rows.filter((row) => String(row.dept || '') === department);
        }
        if (batch !== 'all') {
            rows = rows.filter((row) => normalizeBatch(row.regno) === batch);
        }
        if (search) {
            const needle = search.toLowerCase();
            rows = rows.filter((row) => {
                const haystack = [
                    row.name,
                    row.profile_name,
                    row.regno,
                    row.email,
                    row.phno,
                    row.dept
                ]
                    .filter(Boolean)
                    .join(' ')
                    .toLowerCase();
                return haystack.includes(needle);
            });
        }
        const dir = sortDir === 'asc' ? 1 : -1;
        rows.sort((a, b) => {
            if (sortBy === 'regno') return (a.regno || '').localeCompare(b.regno || '') * dir;
            if (sortBy === 'email') return (a.email || '').localeCompare(b.email || '') * dir;
            if (sortBy === 'batch') return normalizeBatch(a.regno).localeCompare(normalizeBatch(b.regno)) * dir;
            return (a.name || '').localeCompare(b.name || '') * dir;
        });
        return rows;
    }, [users, department, batch, search, sortBy, sortDir]);

    const filteredTeam = useMemo(() => {
        let rows = [...teamRows];
        if (search) {
            const needle = search.toLowerCase();
            rows = rows.filter((row) => {
                const haystack = [
                    row.name,
                    row.profile_name,
                    row.regno,
                    row.email,
                    row.team,
                    row.designation,
                    row.dept
                ]
                    .filter(Boolean)
                    .join(' ')
                    .toLowerCase();
                return haystack.includes(needle);
            });
        }
        const dir = sortDir === 'asc' ? 1 : -1;
        rows.sort((a, b) => {
            if (sortBy === 'regno') return (a.regno || '').localeCompare(b.regno || '') * dir;
            if (sortBy === 'email') return (a.email || '').localeCompare(b.email || '') * dir;
            if (sortBy === 'team') return (a.team || '').localeCompare(b.team || '') * dir;
            return (a.name || '').localeCompare(b.name || '') * dir;
        });
        return rows;
    }, [teamRows, search, sortBy, sortDir]);

    const rows = mode === 'team' ? filteredTeam : filteredUsers;
    const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    const paged = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    const allSelected = rows.length > 0 && rows.every((row) => selectedMap[getRowKey(row)]);
    const selectedCount = useMemo(() => (
        Object.keys(selectedMap).filter((id) => selectedMap[id]).length
    ), [selectedMap]);

    const toggleSelect = (id) => {
        setSelectedMap((prev) => ({ ...prev, [id]: !prev[id] }));
    };

    const toggleSelectAll = () => {
        if (allSelected) {
            const next = { ...selectedMap };
            rows.forEach((row) => {
                const key = getRowKey(row);
                if (key) delete next[key];
            });
            setSelectedMap(next);
            return;
        }
        const next = { ...selectedMap };
        rows.forEach((row) => {
            const key = getRowKey(row);
            if (key) next[key] = true;
        });
        setSelectedMap(next);
    };

    const getRecipientCountPreview = () => {
        if (selectedCount > 0) return selectedCount;
        if (mode === 'selected') return selectedCount;
        if (mode === 'team') return filteredTeam.length;
        if (mode === 'batch') {
            if (batch === 'all') return 0;
            return users.filter((user) => normalizeBatch(user.regno) === batch).length;
        }
        if (mode === 'department') {
            if (department === 'all') return 0;
            return users.filter((user) => String(user.dept || '') === department).length;
        }
        return filteredUsers.length;
    };

    const requestSend = () => {
        if (!subject.trim() || !htmlBody.trim()) {
            toast.error('Subject and HTML body are required.');
            return;
        }
        if (mode === 'batch' && batch === 'all') {
            toast.error('Select a batch.');
            return;
        }
        if (mode === 'department' && department === 'all') {
            toast.error('Select a department.');
            return;
        }
        if (selectedCount === 0 && mode === 'selected') {
            toast.error('Select at least one user.');
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
        if (mode === 'batch' && batch === 'all') {
            toast.error('Select a batch.');
            return;
        }
        if (mode === 'department' && department === 'all') {
            toast.error('Select a department.');
            return;
        }
        const selectedIds = Object.keys(selectedMap).filter((id) => selectedMap[id]).map((id) => Number(id)).filter((id) => Number.isFinite(id));
        const effectiveMode = selectedIds.length > 0 ? 'selected' : mode;
        if (effectiveMode === 'selected' && selectedIds.length === 0) {
            toast.error('Select at least one user.');
            return;
        }
        setSending(true);
        try {
            const payload = {
                subject: subject.trim(),
                html: htmlBody,
                recipient_mode: effectiveMode,
            };
            if (effectiveMode === 'batch') payload.batch = batch;
            if (effectiveMode === 'department') payload.department = department;
            if (effectiveMode === 'selected') {
                payload.user_ids = selectedIds;
            }
            const res = await axios.post(`${API}/pda-admin/email/bulk`, payload, { headers: getAuthHeader() });
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
            toast.error(error?.response?.data?.detail || 'Failed to send emails');
        } finally {
            setSending(false);
        }
    };

    const showUserFilters = mode !== 'team';
    const showDepartment = mode === 'department';
    const showBatch = mode === 'batch';

    return (
        <AdminLayout title="Email" subtitle="Bulk email PDA team or users.">
            <div className="neo-card space-y-6">
                <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                        <Label>Recipient Mode</Label>
                        <Select value={mode} onValueChange={setMode}>
                            <SelectTrigger className="neo-input">
                                <SelectValue placeholder="Select recipient mode" />
                            </SelectTrigger>
                            <SelectContent>
                                {recipientModes.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                        {option.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-slate-500">Selection checkboxes are only used in “Selected Users” mode.</p>
                    </div>

                    {showUserFilters ? (
                        <div className="space-y-2">
                            <Label>Search</Label>
                            <Input
                                placeholder="Search name, regno, email..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="neo-input"
                            />
                        </div>
                    ) : (
                        <div className="space-y-2">
                            <Label>Search</Label>
                            <Input
                                placeholder="Search name, regno, team..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="neo-input"
                            />
                        </div>
                    )}

                    <div className="space-y-2">
                        <Label>Sort</Label>
                        <div className="flex gap-2">
                            <Select value={sortBy} onValueChange={setSortBy}>
                                <SelectTrigger className="neo-input">
                                    <SelectValue placeholder="Sort by" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="name">Name</SelectItem>
                                    <SelectItem value="regno">Register No</SelectItem>
                                    <SelectItem value="email">Email</SelectItem>
                                    {mode !== 'team' ? <SelectItem value="batch">Batch</SelectItem> : null}
                                    {mode === 'team' ? <SelectItem value="team">Team</SelectItem> : null}
                                </SelectContent>
                            </Select>
                            <Select value={sortDir} onValueChange={setSortDir}>
                                <SelectTrigger className="neo-input">
                                    <SelectValue placeholder="Direction" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="asc">Ascending</SelectItem>
                                    <SelectItem value="desc">Descending</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </div>

                {showUserFilters ? (
                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                            <Label>Department</Label>
                            <Select value={department} onValueChange={setDepartment}>
                                <SelectTrigger className="neo-input">
                                    <SelectValue placeholder="All Departments" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Departments</SelectItem>
                                    {DEPARTMENTS.map((dept) => (
                                        <SelectItem key={dept.value} value={dept.value}>{dept.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {showDepartment ? <p className="text-xs text-slate-500">Used for “Department” mode.</p> : null}
                        </div>
                        <div className="space-y-2">
                            <Label>Batch</Label>
                            <Select value={batch} onValueChange={setBatch}>
                                <SelectTrigger className="neo-input">
                                    <SelectValue placeholder="All Batches" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Batches</SelectItem>
                                    {batchOptions.map((item) => (
                                        <SelectItem key={item} value={item}>{item}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {showBatch ? <p className="text-xs text-slate-500">Used for “Batch” mode.</p> : null}
                        </div>
                    </div>
                ) : null}
            </div>

            <div className="neo-card space-y-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="font-heading font-bold text-2xl">Recipients</h2>
                        <p className="text-sm text-slate-600">
                            {mode === 'team' ? `${filteredTeam.length} team members` : `${filteredUsers.length} users`} found
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Checkbox checked={allSelected} onCheckedChange={toggleSelectAll} />
                        <span className="text-sm font-medium">Select all filtered</span>
                        {selectedCount > 0 ? (
                            <span className="text-xs text-slate-500 ml-2">Selected: {selectedCount}</span>
                        ) : null}
                    </div>
                </div>

                {(loadingUsers && mode !== 'team') || (loadingTeams && mode === 'team') ? (
                    <div className="text-sm text-slate-500">Loading recipients...</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="neo-table">
                            <thead>
                                <tr>
                                    <th></th>
                                    <th>Name</th>
                                    <th>Reg No</th>
                                    <th>Email</th>
                                    {mode !== 'team' ? <th>Dept</th> : <th>Team</th>}
                                    {mode !== 'team' ? <th>Batch</th> : <th>Designation</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {paged.map((row) => {
                                    const rowKey = getRowKey(row);
                                    return (
                                    <tr key={rowKey || row.id}>
                                        <td>
                                            <Checkbox checked={Boolean(selectedMap[rowKey])} onCheckedChange={() => toggleSelect(rowKey)} />
                                        </td>
                                        <td className="font-medium">{row.name || '-'}</td>
                                        <td className="font-mono">{row.regno || '-'}</td>
                                        <td className="text-sm">{row.email || '-'}</td>
                                        {mode !== 'team' ? (
                                            <td className="text-sm">{row.dept || '-'}</td>
                                        ) : (
                                            <td className="text-sm">{row.team || '-'}</td>
                                        )}
                                        {mode !== 'team' ? (
                                            <td className="text-sm">{normalizeBatch(row.regno) || '-'}</td>
                                        ) : (
                                            <td className="text-sm">{row.designation || '-'}</td>
                                        )}
                                    </tr>
                                );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                {rows.length > PAGE_SIZE ? (
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
                    <Input value={subject} onChange={(e) => setSubject(e.target.value)} className="neo-input" placeholder="Subject line" />
                </div>
                <div className="space-y-2">
                    <Label>HTML Body</Label>
                    <Textarea
                        value={htmlBody}
                        onChange={(e) => setHtmlBody(e.target.value)}
                        className="neo-input min-h-[220px]"
                        placeholder="<p>Hello <name>, ...</p>"
                    />
                </div>
                <div className="rounded-2xl border border-black/10 bg-white p-4 text-sm text-slate-700">
                    <div className="font-semibold mb-2">Available tags</div>
                    <p className="text-xs text-slate-500 mb-3">
                        Tags are case-insensitive; missing values become empty. Supports both <code>&lt;name&gt;</code> and <code>{'{{ name }}'}</code> styles. Event/leaderboard tags will be empty in HomeAdmin.
                    </p>
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
                                    await handleSend();
                                }}
                            >
                                Confirm
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </AdminLayout>
    );
}
