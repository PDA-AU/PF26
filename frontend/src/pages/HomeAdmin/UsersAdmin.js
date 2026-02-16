import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/context/AuthContext';
import AdminLayout from '@/pages/HomeAdmin/AdminLayout';
import pdaLogo from '@/assets/pda-logo.png';
import { API, uploadTeamImage } from '@/pages/HomeAdmin/adminApi';
import { compressImageToWebp } from '@/utils/imageCompression';
import { toast } from 'sonner';

const PAGE_SIZE = 12;

const TEAMS = [
    'Executive',
    'Content Creation',
    'Event Management',
    'Design',
    'Website Design',
    'Public Relations',
    'Podcast',
    'Library'
];

const EXEC_DESIG = ['Chairperson', 'Vice Chairperson', 'Treasurer', 'General Secretary'];
const TEAM_DESIG = ['Head', 'JS', 'Member', 'Volunteer'];
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
const GENDERS = [
    { value: 'Male', label: 'Male' },
    { value: 'Female', label: 'Female' }
];
const DEPARTMENT_ENUM_KEY_TO_VALUE = {
    AI_DS: 'Artificial Intelligence and Data Science',
    AERO: 'Aerospace Engineering',
    AUTO: 'Automobile Engineering',
    CT: 'Computer Technology',
    ECE: 'Electronics and Communication Engineering',
    EIE: 'Electronics and Instrumentation Engineering',
    PROD: 'Production Technology',
    RAE: 'Robotics and Automation',
    RPT: 'Rubber and Plastics Technology',
    IT: 'Information Technology'
};
const DEPT_SHORT = {
    'Computer Technology': 'CT',
    'Information Technology': 'IT',
    'Rubber And Plastics Technology': 'RPT',
    'Rubber and Plastics Technology': 'RPT',
    'Artificial Intelligence And Data Science': 'AI&DS',
    'Artificial Intelligence and Data Science': 'AI&DS',
    'Artificial Intelligence & Data Science': 'AI&DS',
    'Electronics And Communication Engineering': 'ECE',
    'Electronics and Communication Engineering': 'ECE',
    'Electronics Engineering': 'ECE',
    'Electronics And Instrumentation Engineering': 'EIE',
    'Electronics and Instrumentation Engineering': 'EIE',
    'Instrumentation Engineering': 'EIE',
    'Automobile Engineering': 'AUTO',
    'Aerospace Engineering': 'AERO',
    'Aerospace': 'AERO',
    'Aeronautical Engineering': 'AERO',
    'Production Technology': 'PROD',
    'Robotics And Automation': 'RAE',
    'Robotics and Automation': 'RAE'
};

const normalizeGenderValue = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (GENDERS.some((item) => item.value === raw)) return raw;
    const upper = raw.toUpperCase();
    if (upper === 'MALE' || upper.endsWith('.MALE')) return 'Male';
    if (upper === 'FEMALE' || upper.endsWith('.FEMALE')) return 'Female';
    return '';
};

const normalizeDepartmentValue = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (DEPARTMENTS.some((item) => item.value === raw)) return raw;
    const mapped = DEPARTMENT_ENUM_KEY_TO_VALUE[raw.toUpperCase()];
    return mapped || raw;
};

export default function UsersAdmin() {
    const { isSuperAdmin, canAccessHome, getAuthHeader } = useAuth();
    const [usersRows, setUsersRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [memberFilter, setMemberFilter] = useState('All');
    const [appliedFilter, setAppliedFilter] = useState('All');
    const [verifiedFilter, setVerifiedFilter] = useState('All');
    const [sortBy, setSortBy] = useState('name');
    const [sortDir, setSortDir] = useState('asc');
    const [batchFilter, setBatchFilter] = useState('All');
    const [page, setPage] = useState(1);
    const [selectedMember, setSelectedMember] = useState(null);
    const [editForm, setEditForm] = useState({
        name: '',
        profile_name: '',
        email: '',
        phno: '',
        dept: '',
        gender: '',
        is_member: false,
        team: '',
        designation: '',
        instagram_url: '',
        linkedin_url: '',
        github_url: ''
    });
    const [photoFile, setPhotoFile] = useState(null);
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);
    const [hoveredDept, setHoveredDept] = useState(null);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [confirmText, setConfirmText] = useState('');
    const [confirmAction, setConfirmAction] = useState(null);

    const fetchData = useCallback(async () => {
        try {
            const res = await axios.get(`${API}/pda-admin/users`, { headers: getAuthHeader() });
            const rows = (res.data || [])
                .filter((row) => String(row?.regno || '') !== '0000000000')
                .map((row) => ({
                    ...row,
                    dept: normalizeDepartmentValue(row?.dept),
                    gender: normalizeGenderValue(row?.gender)
                }));
            setUsersRows(rows);
        } catch (error) {
            console.error('Failed to load users:', error);
        } finally {
            setLoading(false);
        }
    }, [getAuthHeader]);

    useEffect(() => {
        if (canAccessHome) {
            fetchData();
        }
    }, [canAccessHome, fetchData]);

    const filtered = useMemo(() => {
        const filteredRows = usersRows.filter((member) => {
            const memberMatch = memberFilter === 'All' || (memberFilter === 'Members' ? member.is_member : !member.is_member);
            const appliedMatch = appliedFilter === 'All' || (appliedFilter === 'Applied' ? member.is_applied : !member.is_applied);
            const verifiedMatch = verifiedFilter === 'All' || (verifiedFilter === 'Verified' ? member.email_verified : !member.email_verified);
            return memberMatch && appliedMatch && verifiedMatch;
        });
        if (!search) return filteredRows;
        const s = search.toLowerCase();
        return filteredRows.filter(m =>
            [m.name, m.profile_name, m.regno, m.preferred_team, m.team, m.email, m.phno, m.dept]
                .filter(Boolean)
                .join(' ')
                .toLowerCase()
                .includes(s)
        );
    }, [usersRows, search, memberFilter, appliedFilter, verifiedFilter]);

    const sorted = useMemo(() => {
        const rows = [...filtered];
        const dir = sortDir === 'asc' ? 1 : -1;
        const getBatch = (m) => (m.regno ? String(m.regno).slice(0, 4) : '');
        rows.sort((a, b) => {
            if (sortBy === 'batch') {
                return getBatch(a).localeCompare(getBatch(b)) * dir;
            }
            if (sortBy === 'is_member') {
                return (Number(Boolean(a.is_member)) - Number(Boolean(b.is_member))) * dir;
            }
            if (sortBy === 'is_applied') {
                return (Number(Boolean(a.is_applied)) - Number(Boolean(b.is_applied))) * dir;
            }
            if (sortBy === 'email_verified') {
                return (Number(Boolean(a.email_verified)) - Number(Boolean(b.email_verified))) * dir;
            }
            if (sortBy === 'created_at') {
                const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
                const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
                return (ta - tb) * dir;
            }
            return (a.name || '').localeCompare(b.name || '') * dir;
        });
        return rows;
    }, [filtered, sortBy, sortDir]);

    useEffect(() => {
        setPage(1);
    }, [search, memberFilter, appliedFilter, verifiedFilter, sortBy, sortDir]);

    const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
    const paged = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    const openMember = (member) => {
        setSelectedMember(member);
        setEditForm({
            name: member.name || '',
            profile_name: member.profile_name || '',
            email: member.email || '',
            phno: member.phno || '',
            dept: normalizeDepartmentValue(member.dept),
            gender: normalizeGenderValue(member.gender),
            is_member: Boolean(member.is_member),
            team: member.team || '',
            designation: member.designation || '',
            instagram_url: member.instagram_url || '',
            linkedin_url: member.linkedin_url || '',
            github_url: member.github_url || ''
        });
        setPhotoFile(null);
        setIsEditing(false);
    };

    const updateMember = async () => {
        if (!selectedMember) return;
        setSaving(true);
        try {
            let photoUrl = selectedMember.photo_url || '';
            if (photoFile) {
                const processed = await compressImageToWebp(photoFile);
                photoUrl = await uploadTeamImage(processed, getAuthHeader);
            }
            const payload = {
                name: editForm.name || null,
                profile_name: editForm.profile_name || null,
                email: editForm.email || null,
                phno: editForm.phno || null,
                dept: editForm.dept || null,
                gender: editForm.gender || null,
                is_member: Boolean(editForm.is_member),
                team: editForm.team || null,
                designation: editForm.designation || null,
                instagram_url: editForm.instagram_url || null,
                linkedin_url: editForm.linkedin_url || null,
                github_url: editForm.github_url || null,
                photo_url: photoUrl
            };
            await axios.put(`${API}/pda-admin/users/${selectedMember.id}`, payload, { headers: getAuthHeader() });
            setSelectedMember(null);
            fetchData();
        } catch (error) {
            console.error('Failed to update user:', error);
            toast.error(error.response?.data?.detail || 'Failed to update user.');
        } finally {
            setSaving(false);
            setIsEditing(false);
        }
    };

    const removeFromPda = async () => {
        if (!selectedMember?.team_member_id) return;
        setDeleting(true);
        try {
            await axios.delete(`${API}/pda-admin/team/${selectedMember.team_member_id}`, { headers: getAuthHeader() });
            await axios.put(
                `${API}/pda-admin/users/${selectedMember.id}`,
                { is_member: false, clear_team: true },
                { headers: getAuthHeader() }
            );
            toast.success('Removed from PDA team.');
            setSelectedMember(null);
            fetchData();
        } catch (error) {
            console.error('Failed to delete team member:', error);
            toast.error(error.response?.data?.detail || 'Failed to remove member.');
        } finally {
            setDeleting(false);
        }
    };

    const deleteUser = async () => {
        if (!selectedMember?.id) return;
        setDeleting(true);
        try {
            await axios.delete(`${API}/pda-admin/users/${selectedMember.id}?force=true`, { headers: getAuthHeader() });
            toast.success('User deleted successfully.');
            setSelectedMember(null);
            fetchData();
        } catch (error) {
            console.error('Failed to delete user:', error);
            toast.error(error.response?.data?.detail || 'Failed to delete user.');
        } finally {
            setDeleting(false);
        }
    };

    useEffect(() => {
        if (paged.length === 0) {
            setActiveIndex(-1);
            return;
        }
        setActiveIndex((prev) => (prev < 0 || prev >= paged.length ? 0 : prev));
    }, [paged]);

    const handleExport = async (format) => {
        try {
            const response = await axios.get(`${API}/pda-admin/users/export?format=${format}` , {
                headers: getAuthHeader(),
                responseType: 'blob'
            });
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `users.${format}`);
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (error) {
            console.error('Failed to export users:', error);
        }
    };

    if (!canAccessHome) {
        return (
            <AdminLayout title="Users Management" subtitle="Admin access required.">
                <div className="rounded-3xl border border-black/10 bg-white p-8 text-center text-sm text-slate-600">
                    You do not have permission to view this page.
                </div>
            </AdminLayout>
        );
    }

    const statsMembers = usersRows;
    const totalUsers = usersRows.length;
    const totalMembers = usersRows.filter((m) => Boolean(m.is_member)).length;
    const totalApplied = usersRows.filter((m) => Boolean(m.is_applied)).length;
    const totalVerified = usersRows.filter((m) => Boolean(m.email_verified)).length;
    const totalUnverified = totalUsers - totalVerified;
    const totalNotApplied = totalUsers - totalApplied;

    const normalizeDept = (dept) => {
        if (!dept) return 'Unknown';
        const trimmed = String(dept).trim();
        if (DEPT_SHORT[trimmed]) return DEPT_SHORT[trimmed];
        const key = trimmed.toLowerCase();
        if (key.includes('artificial intelligence')) return 'AI&DS';
        if (key.includes('computer technology')) return 'CT';
        if (key.includes('information technology')) return 'IT';
        if (key.includes('rubber')) return 'RPT';
        if (key.includes('electronics') && key.includes('communication')) return 'ECE';
        if (key.includes('electronics') && key.includes('instrumentation')) return 'EIE';
        if (key.includes('instrumentation')) return 'EIE';
        if (key.includes('aero')) return 'AERO';
        if (key.includes('automobile')) return 'AUTO';
        if (key.includes('production')) return 'PROD';
        if (key.includes('robotics')) return 'RAE';
        return trimmed;
    };

    const deptCountsRaw = statsMembers.reduce((acc, member) => {
        const dept = normalizeDept(member.dept);
        acc[dept] = (acc[dept] || 0) + 1;
        return acc;
    }, {});
    const deptEntries = Object.entries(deptCountsRaw).sort((a, b) => b[1] - a[1]);
    const deptData = deptEntries;
    const deptTotal = deptData.reduce((sum, [, count]) => sum + count, 0) || 1;
    const deptColors = ['#f6c347', '#11131a', '#c99612', '#5b6b8a', '#9aa3b2', '#e7d8a3', '#3b82f6'];
    const deptSegments = deptData.reduce((acc, [label, count], idx) => {
        const start = acc.offset;
        const end = start + (count / deptTotal) * 360;
        acc.segments.push({ label, count, color: deptColors[idx % deptColors.length], start, end });
        acc.offset = end;
        return acc;
    }, { offset: 0, segments: [] }).segments;

    const batchCounts = statsMembers.reduce((acc, member) => {
        const batch = member.regno ? String(member.regno).slice(0, 4) : 'Unknown';
        acc[batch] = (acc[batch] || 0) + 1;
        return acc;
    }, {});
    const batchEntries = Object.entries(batchCounts).sort((a, b) => b[1] - a[1]);
    const selectedBatchMembers = batchFilter === 'All'
        ? statsMembers
        : statsMembers.filter((m) => (m.regno ? String(m.regno).slice(0, 4) : 'Unknown') === batchFilter);
    const batchDeptCounts = selectedBatchMembers.reduce((acc, member) => {
        const dept = normalizeDept(member.dept);
        acc[dept] = (acc[dept] || 0) + 1;
        return acc;
    }, {});
    const batchDeptEntries = Object.entries(batchDeptCounts).sort((a, b) => b[1] - a[1]);

    return (
        <AdminLayout title="Users Management" subtitle="Manage PDA users, team roles, and social profiles.">
            <section className="mb-6 rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <p className="text-xs uppercase tracking-[0.4em] text-slate-400">Overview</p>
                        <h2 className="text-2xl font-heading font-black">PDA Users Stats</h2>
                    </div>
                    <div className="text-sm text-slate-600">
                        Total users: <span className="font-semibold text-[#11131a]">{totalUsers}</span> · Members:{' '}
                        <span className="font-semibold text-[#11131a]">{totalMembers}</span> · Applied:{' '}
                        <span className="font-semibold text-[#11131a]">{totalApplied}</span>
                    </div>
                </div>

                <div className="mt-6 grid gap-6 lg:grid-cols-3">
                    <div className="rounded-2xl border border-black/10 bg-[#fffdf7] p-4">
                        <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Status Overview</p>
                        <div className="mt-4 space-y-2">
                            <div className="flex items-center justify-between rounded-lg border border-black/10 bg-white px-3 py-2 text-sm">
                                <span className="font-semibold text-slate-700">Members</span>
                                <span className="text-slate-600">{totalMembers}</span>
                            </div>
                            <div className="flex items-center justify-between rounded-lg border border-black/10 bg-white px-3 py-2 text-sm">
                                <span className="font-semibold text-slate-700">Recruitment Applied</span>
                                <span className="text-slate-600">{totalApplied}</span>
                            </div>
                            <div className="flex items-center justify-between rounded-lg border border-black/10 bg-white px-3 py-2 text-sm">
                                <span className="font-semibold text-slate-700">Not Applied</span>
                                <span className="text-slate-600">{totalNotApplied}</span>
                            </div>
                            <div className="flex items-center justify-between rounded-lg border border-black/10 bg-white px-3 py-2 text-sm">
                                <span className="font-semibold text-slate-700">Email Verified</span>
                                <span className="text-slate-600">{totalVerified}</span>
                            </div>
                            <div className="flex items-center justify-between rounded-lg border border-black/10 bg-white px-3 py-2 text-sm">
                                <span className="font-semibold text-slate-700">Email Unverified</span>
                                <span className="text-slate-600">{totalUnverified}</span>
                            </div>
                        </div>
                    </div>

                    <div className="rounded-2xl border border-black/10 bg-[#fffdf7] p-4">
                        <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Department Distribution</p>
                        <div className="mt-4 flex flex-col items-center gap-4">
                            <div className="relative mx-auto h-36 w-36 flex-shrink-0 sm:mx-0 sm:h-40 sm:w-40">
                                <svg viewBox="0 0 160 160" className="h-36 w-36 sm:h-40 sm:w-40">
                                    <circle cx="80" cy="80" r="78" fill="#f1f2f4" stroke="#e5e7eb" strokeWidth="2" />
                                    {deptSegments.map((seg) => {
                                        const r = 78;
                                        const startRad = (Math.PI / 180) * (seg.start - 90);
                                        const endRad = (Math.PI / 180) * (seg.end - 90);
                                        const x1 = 80 + r * Math.cos(startRad);
                                        const y1 = 80 + r * Math.sin(startRad);
                                        const x2 = 80 + r * Math.cos(endRad);
                                        const y2 = 80 + r * Math.sin(endRad);
                                        const largeArc = seg.end - seg.start > 180 ? 1 : 0;
                                        const path = `M 80 80 L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
                                        return (
                                            <path
                                                key={seg.label}
                                                d={path}
                                                fill={seg.color}
                                                onMouseEnter={() => setHoveredDept(seg)}
                                                onMouseLeave={() => setHoveredDept(null)}
                                            />
                                        );
                                    })}
                                </svg>
                                {hoveredDept && (
                                    <div className="absolute -top-10 left-1/2 w-56 -translate-x-1/2 rounded-xl border border-black/10 bg-white px-3 py-2 text-center text-xs text-slate-700 shadow-sm">
                                        {hoveredDept.label} ({hoveredDept.count})
                                    </div>
                                )}
                            </div>
                            <div className="grid w-full max-w-md grid-cols-1 gap-2 text-xs text-slate-600 sm:grid-cols-2">
                                {deptData.map(([label, count], idx) => (
                                    <button
                                        key={label}
                                        type="button"
                                        className="flex items-center gap-2 rounded-md border border-black/5 bg-white px-2 py-1.5 text-left"
                                        onClick={() => setSearch(label)}
                                        title="Click to filter list by department"
                                    >
                                        <span className="h-2 w-2 rounded-full" style={{ background: deptColors[idx % deptColors.length] }} />
                                        <span className="font-semibold">{label}</span>
                                        <span className="text-slate-400">({count})</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="rounded-2xl border border-black/10 bg-[#fffdf7] p-4">
                        <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Batch Distribution</p>
                        <div className="mt-4 space-y-4">
                            <div className="sm:max-w-xs">
                                <Label>Batch</Label>
                                <select
                                    value={batchFilter}
                                    onChange={(e) => setBatchFilter(e.target.value)}
                                    className="mt-2 w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm"
                                >
                                    <option value="All">All Batches</option>
                                    {batchEntries.map(([batch]) => (
                                        <option key={batch} value={batch}>{batch}</option>
                                    ))}
                                </select>
                                <p className="mt-3 text-sm text-slate-600">
                                    Total in batch: <span className="font-semibold">{selectedBatchMembers.length}</span>
                                </p>
                            </div>
                            <div>
                                <Label>Dept wise members</Label>
                                <div className="mt-2 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                                    {batchDeptEntries.length ? batchDeptEntries.map(([dept, count]) => (
                                        <div key={dept} className="flex items-center justify-between rounded-md border border-black/5 bg-white px-2 py-1.5">
                                            <span className="font-semibold text-slate-700">{dept}</span>
                                            <span className="text-slate-500">{count}</span>
                                        </div>
                                    )) : (
                                        <div className="col-span-2 text-sm text-slate-500">No users found.</div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <section className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <p className="text-xs uppercase tracking-[0.4em] text-slate-400">Users</p>
                        <h2 className="text-2xl font-heading font-black">Directory</h2>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button variant="outline" className="border-black/10" onClick={() => handleExport('csv')}>Export CSV</Button>
                        <Button variant="outline" className="border-black/10" onClick={() => handleExport('xlsx')}>Export XLSX</Button>
                    </div>
                </div>

                <div className="mt-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                        <Input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search users..."
                            className="sm:max-w-sm"
                        />
                        <Select value={memberFilter} onValueChange={setMemberFilter}>
                            <SelectTrigger className="sm:w-44">
                                <SelectValue placeholder="Member status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="All">All Users</SelectItem>
                                <SelectItem value="Members">Members</SelectItem>
                                <SelectItem value="NonMembers">Non Members</SelectItem>
                            </SelectContent>
                        </Select>
                        <Select value={appliedFilter} onValueChange={setAppliedFilter}>
                            <SelectTrigger className="sm:w-44">
                                <SelectValue placeholder="Application status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="All">All Applications</SelectItem>
                                <SelectItem value="Applied">Applied</SelectItem>
                                <SelectItem value="NotApplied">Not Applied</SelectItem>
                            </SelectContent>
                        </Select>
                        <Select value={verifiedFilter} onValueChange={setVerifiedFilter}>
                            <SelectTrigger className="sm:w-44">
                                <SelectValue placeholder="Email status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="All">All Emails</SelectItem>
                                <SelectItem value="Verified">Verified</SelectItem>
                                <SelectItem value="Unverified">Unverified</SelectItem>
                            </SelectContent>
                        </Select>
                        <Select value={sortBy} onValueChange={setSortBy}>
                            <SelectTrigger className="sm:w-44">
                                <SelectValue placeholder="Sort by" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="name">Sort: Name</SelectItem>
                                <SelectItem value="batch">Sort: Batch</SelectItem>
                                <SelectItem value="is_member">Sort: Is Member</SelectItem>
                                <SelectItem value="is_applied">Sort: Is Applied</SelectItem>
                                <SelectItem value="email_verified">Sort: Email Verified</SelectItem>
                                <SelectItem value="created_at">Sort: Created At</SelectItem>
                            </SelectContent>
                        </Select>
                        <Button variant="outline" className="border-black/10" onClick={() => setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'))}>
                            {sortDir === 'asc' ? 'Asc' : 'Desc'}
                        </Button>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}>Prev</Button>
                        <span className="text-sm text-slate-500">Page {page} of {totalPages}</span>
                        <Button variant="outline" onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages}>Next</Button>
                    </div>
                </div>

                <div className="mt-6">
                    {loading ? (
                        <div className="text-center text-sm text-slate-500">Loading...</div>
                    ) : paged.length ? (
                        <div
                            className="overflow-hidden rounded-2xl border border-black/10"
                            tabIndex={0}
                            onKeyDown={(e) => {
                                if (!paged.length) return;
                                if (e.key === 'ArrowDown') {
                                    e.preventDefault();
                                    setActiveIndex((prev) => Math.min(paged.length - 1, prev + 1));
                                }
                                if (e.key === 'ArrowUp') {
                                    e.preventDefault();
                                    setActiveIndex((prev) => Math.max(0, prev - 1));
                                }
                                if (e.key === 'Enter' && activeIndex >= 0) {
                                    e.preventDefault();
                                    openMember(paged[activeIndex]);
                                }
                            }}
                        >
                            <div className="hidden sm:grid grid-cols-[1.4fr_1.2fr_1fr_1fr_1fr] bg-[#fff7dc] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-600">
                                <span>Name</span>
                                <span>Profile Name</span>
                                <span>Reg No</span>
                                <span>Member</span>
                                <span>Applied</span>
                            </div>
                            <div className="divide-y divide-black/5">
                                {paged.map(member => (
                                    <button
                                        key={member.id}
                                        type="button"
                                        onClick={() => openMember(member)}
                                        className="w-full px-4 py-3 text-left text-sm hover:bg-[#fffaf0] sm:grid sm:grid-cols-[1.4fr_1.2fr_1fr_1fr_1fr] sm:items-center"
                                    >
                                        <div className="flex flex-col gap-1 sm:block">
                                            <span className="font-medium text-[#11131a]">{member.name || 'Unnamed'}</span>
                                            <span className="text-xs text-slate-500 sm:hidden">@{member.profile_name || 'n/a'} · {member.regno || 'N/A'}</span>
                                        </div>
                                        <span className="hidden text-slate-600 sm:inline">@{member.profile_name || 'n/a'}</span>
                                        <span className="hidden text-slate-600 sm:inline">{member.regno || 'N/A'}</span>
                                        <span className="text-slate-600">{member.is_member ? 'Yes' : 'No'}</span>
                                        <span className="text-slate-600">{member.is_applied ? 'Yes' : 'No'}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="text-center text-sm text-slate-500">No users found.</div>
                    )}
                </div>
            </section>

            <Dialog open={!!selectedMember} onOpenChange={() => {
                setSelectedMember(null);
                setConfirmOpen(false);
            }}>
                <DialogContent className="w-[calc(100vw-1rem)] max-w-3xl max-h-[90vh] overflow-y-auto bg-white p-4 sm:p-6">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-heading font-black">User Details</DialogTitle>
                    </DialogHeader>
                    {selectedMember && (
                        <div className="space-y-6">
                            <div className="flex justify-center">
                                <img
                                    src={selectedMember.photo_url || pdaLogo}
                                    alt={selectedMember.name}
                                    className="h-36 w-36 rounded-3xl object-cover sm:h-48 sm:w-48 md:h-56 md:w-56"
                                />
                            </div>
                            <div className="grid gap-6 md:grid-cols-2">
                                <div className="space-y-2 text-xs text-slate-500">
                                    <p><span className="font-semibold text-slate-600">Reg No:</span> {selectedMember.regno || 'N/A'}</p>
                                    <p><span className="font-semibold text-slate-600">Profile Name:</span> @{selectedMember.profile_name || 'n/a'}</p>
                                    <p><span className="font-semibold text-slate-600">Email:</span> {selectedMember.email || 'N/A'}</p>
                                    <p><span className="font-semibold text-slate-600">Phone:</span> {selectedMember.phno || 'N/A'}</p>
                                    <p><span className="font-semibold text-slate-600">Dept:</span> {selectedMember.dept || 'N/A'}</p>
                                    <p><span className="font-semibold text-slate-600">Gender:</span> {selectedMember.gender || 'N/A'}</p>
                                    <p><span className="font-semibold text-slate-600">Is Member:</span> {selectedMember.is_member ? 'Yes' : 'No'}</p>
                                    <p><span className="font-semibold text-slate-600">Is Applied:</span> {selectedMember.is_applied ? 'Yes' : 'No'}</p>
                                    <p><span className="font-semibold text-slate-600">Instagram:</span> {selectedMember.instagram_url || 'N/A'}</p>
                                </div>
                                <div className="space-y-2 text-xs text-slate-500">
                                    <p><span className="font-semibold text-slate-600">DOB:</span> {selectedMember.dob || 'N/A'}</p>
                                    <p><span className="font-semibold text-slate-600">Email Verified:</span> {selectedMember.email_verified ? 'Yes' : 'No'}</p>
                                    <p><span className="font-semibold text-slate-600">Preferred Team:</span> {selectedMember.preferred_team || 'N/A'}</p>
                                    <p>
                                        <span className="font-semibold text-slate-600">Resume:</span>{' '}
                                        {selectedMember.resume_url ? (
                                            <a
                                                href={selectedMember.resume_url}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="text-slate-700 underline hover:text-slate-900"
                                            >
                                                View Resume
                                            </a>
                                        ) : 'N/A'}
                                    </p>
                                    <p><span className="font-semibold text-slate-600">Team:</span> {selectedMember.team || 'Unassigned'}</p>
                                    <p><span className="font-semibold text-slate-600">Designation:</span> {selectedMember.designation || 'Member'}</p>
                                    <p><span className="font-semibold text-slate-600">LinkedIn:</span> {selectedMember.linkedin_url || 'N/A'}</p>
                                    <p><span className="font-semibold text-slate-600">GitHub:</span> {selectedMember.github_url || 'N/A'}</p>
                                </div>
                            </div>
                            <div className="space-y-4">
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                    <div>
                                        <p className="text-xs uppercase tracking-[0.3em] text-slate-400">User</p>
                                        <h3 className="text-lg font-heading font-black">{selectedMember.name || 'Unnamed'}</h3>
                                    </div>
                                    {isSuperAdmin ? (
                                        <Button variant="outline" className="w-full border-black/10 sm:w-auto" onClick={() => setIsEditing((prev) => !prev)}>
                                            {isEditing ? 'Cancel' : 'Edit'}
                                        </Button>
                                    ) : null}
                                </div>

                                <div className="grid gap-3 sm:grid-cols-2">
                                    <div>
                                        <Label>Name</Label>
                                        <Input value={editForm.name} onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))} disabled={!isEditing || !isSuperAdmin} />
                                    </div>
                                    <div>
                                        <Label>Profile Name</Label>
                                        <Input value={editForm.profile_name} onChange={(e) => setEditForm((prev) => ({ ...prev, profile_name: e.target.value }))} disabled={!isEditing || !isSuperAdmin} />
                                    </div>
                                    <div>
                                        <Label>Email</Label>
                                        <Input value={editForm.email} onChange={(e) => setEditForm((prev) => ({ ...prev, email: e.target.value }))} disabled={!isEditing || !isSuperAdmin} />
                                    </div>
                                    <div>
                                        <Label>Phone</Label>
                                        <Input value={editForm.phno} onChange={(e) => setEditForm((prev) => ({ ...prev, phno: e.target.value }))} disabled={!isEditing || !isSuperAdmin} />
                                    </div>
                                    <div>
                                        <Label>Department</Label>
                                        <Select
                                            value={editForm.dept || '__none__'}
                                            onValueChange={(value) => setEditForm((prev) => ({ ...prev, dept: value === '__none__' ? '' : value }))}
                                            disabled={!isEditing || !isSuperAdmin}
                                        >
                                            <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="__none__">Unassigned</SelectItem>
                                                {DEPARTMENTS.map((dept) => (
                                                    <SelectItem key={dept.value} value={dept.value}>{dept.label}</SelectItem>
                                                ))}
                                                {editForm.dept && !DEPARTMENTS.some((dept) => dept.value === editForm.dept) ? (
                                                    <SelectItem value={editForm.dept}>{editForm.dept}</SelectItem>
                                                ) : null}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div>
                                        <Label>Gender</Label>
                                        <Select
                                            value={editForm.gender || '__none__'}
                                            onValueChange={(value) => setEditForm((prev) => ({ ...prev, gender: value === '__none__' ? '' : value }))}
                                            disabled={!isEditing || !isSuperAdmin}
                                        >
                                            <SelectTrigger><SelectValue placeholder="Select gender" /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="__none__">Unspecified</SelectItem>
                                                {GENDERS.map((gender) => (
                                                    <SelectItem key={gender.value} value={gender.value}>{gender.label}</SelectItem>
                                                ))}
                                                {editForm.gender && !GENDERS.some((gender) => gender.value === editForm.gender) ? (
                                                    <SelectItem value={editForm.gender}>{editForm.gender}</SelectItem>
                                                ) : null}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div>
                                        <Label>Member Status</Label>
                                        <Select value={editForm.is_member ? 'YES' : 'NO'} onValueChange={(value) => setEditForm((prev) => ({ ...prev, is_member: value === 'YES' }))} disabled={!isEditing || !isSuperAdmin}>
                                            <SelectTrigger><SelectValue placeholder="Member status" /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="YES">Member</SelectItem>
                                                <SelectItem value="NO">Non Member</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div>
                                        <Label>Team</Label>
                                        <Select value={editForm.team || '__none__'} onValueChange={(value) => setEditForm(prev => ({ ...prev, team: value === '__none__' ? '' : value }))} disabled={!isEditing || !isSuperAdmin}>
                                            <SelectTrigger><SelectValue placeholder="Select team" /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="__none__">Unassigned</SelectItem>
                                                {TEAMS.map(team => (
                                                    <SelectItem key={team} value={team}>{team}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div>
                                        <Label>Designation</Label>
                                        <Select value={editForm.designation || '__none__'} onValueChange={(value) => setEditForm(prev => ({ ...prev, designation: value === '__none__' ? '' : value }))} disabled={!isEditing || !isSuperAdmin}>
                                            <SelectTrigger><SelectValue placeholder="Select designation" /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="__none__">None</SelectItem>
                                                {(editForm.team === 'Executive' ? EXEC_DESIG : TEAM_DESIG).map(desig => (
                                                    <SelectItem key={desig} value={desig}>{desig}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div>
                                        <Label>Instagram</Label>
                                        <Input
                                            value={editForm.instagram_url}
                                            onChange={(e) => setEditForm((prev) => ({ ...prev, instagram_url: e.target.value }))}
                                            placeholder="https://instagram.com/username"
                                            disabled={!isEditing || !isSuperAdmin}
                                        />
                                    </div>
                                    <div>
                                        <Label>LinkedIn</Label>
                                        <Input
                                            value={editForm.linkedin_url}
                                            onChange={(e) => setEditForm((prev) => ({ ...prev, linkedin_url: e.target.value }))}
                                            placeholder="https://linkedin.com/in/username"
                                            disabled={!isEditing || !isSuperAdmin}
                                        />
                                    </div>
                                    <div className="sm:col-span-2">
                                        <Label>GitHub</Label>
                                        <Input
                                            value={editForm.github_url}
                                            onChange={(e) => setEditForm((prev) => ({ ...prev, github_url: e.target.value }))}
                                            placeholder="https://github.com/username"
                                            disabled={!isEditing || !isSuperAdmin}
                                        />
                                    </div>
                                    <div className="sm:col-span-2">
                                        <Label>Update Photo</Label>
                                        <Input type="file" accept="image/*" onChange={(e) => setPhotoFile(e.target.files?.[0] || null)} disabled={!isEditing || !isSuperAdmin} />
                                    </div>
                                </div>

                                {isSuperAdmin ? (
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                            <Button
                                                variant="outline"
                                                onClick={() => {
                                                    setConfirmText('');
                                                    setConfirmAction('remove');
                                                    setConfirmOpen(true);
                                                }}
                                                disabled={deleting || !selectedMember?.team_member_id}
                                                className="w-full border-red-200 text-red-600 hover:bg-red-50 sm:w-auto"
                                            >
                                                {deleting ? 'Deleting...' : 'Remove From PDA'}
                                            </Button>
                                            <Button
                                                variant="outline"
                                                onClick={() => {
                                                    setConfirmText('');
                                                    setConfirmAction('delete_user');
                                                    setConfirmOpen(true);
                                                }}
                                                disabled={deleting || !selectedMember?.id}
                                                className="w-full border-red-400 text-red-700 hover:bg-red-100 sm:w-auto"
                                            >
                                                {deleting ? 'Deleting...' : 'Delete User'}
                                            </Button>
                                        </div>
                                        <Button onClick={updateMember} disabled={!isEditing || saving} className="w-full bg-[#f6c347] text-black hover:bg-[#ffd16b] sm:w-auto">
                                            {saving ? 'Saving...' : 'Save Changes'}
                                        </Button>
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <DialogContent className="w-[calc(100vw-1rem)] max-w-md max-h-[85vh] overflow-y-auto bg-white p-4 sm:p-6">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-heading font-black">Confirm Delete</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        {confirmAction === 'remove' ? (
                            <p className="text-sm text-slate-600">
                                Type <span className="font-semibold">REMOVE</span> to remove{' '}
                                <span className="font-semibold">{selectedMember?.name || 'this user'}</span> from the PDA team.
                            </p>
                        ) : (
                            <p className="text-sm text-slate-600">
                                Type <span className="font-semibold">DELETE ALL</span> to permanently delete{' '}
                                <span className="font-semibold">{selectedMember?.name || 'this user'}</span>.
                            </p>
                        )}
                        <Input
                            value={confirmText}
                            onChange={(e) => setConfirmText(e.target.value)}
                            placeholder={confirmAction === 'remove' ? 'Type REMOVE' : 'Type DELETE ALL'}
                            className="w-full"
                        />
                        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                            <Button
                                variant="outline"
                                onClick={() => setConfirmOpen(false)}
                                className="w-full border-black/10 sm:w-auto"
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={async () => {
                                    if (confirmAction === 'remove' && confirmText.trim().toUpperCase() !== 'REMOVE') return;
                                    if (confirmAction === 'delete_user' && confirmText.trim().toUpperCase() !== 'DELETE ALL') return;
                                    setConfirmOpen(false);
                                    if (confirmAction === 'remove') {
                                        await removeFromPda();
                                    } else {
                                        await deleteUser();
                                    }
                                }}
                                disabled={
                                    (confirmAction === 'remove' && confirmText.trim().toUpperCase() !== 'REMOVE')
                                    || (confirmAction === 'delete_user' && confirmText.trim().toUpperCase() !== 'DELETE ALL')
                                    || deleting
                                }
                                className="w-full bg-red-600 text-white hover:bg-red-700 sm:w-auto"
                            >
                                {deleting ? 'Deleting...' : 'Confirm Delete'}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </AdminLayout>
    );
}
