import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import AdminLayout from '@/pages/HomeAdmin/AdminLayout';
import pdaLogo from '@/assets/pda-logo.png';
import { API, uploadTeamImage } from '@/pages/HomeAdmin/adminApi';
import { compressImageToWebp } from '@/utils/imageCompression';
import { toast } from 'sonner';

const PAGE_SIZE_OPTIONS = [10, 50, 100];
const MAX_PAGE_SIZE = 100;

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

const DEPARTMENTS = [
    { value: "Artificial Intelligence and Data Science", label: "AI & Data Science" },
    { value: "Aerospace Engineering", label: "Aerospace Engineering" },
    { value: "Automobile Engineering", label: "Automobile Engineering" },
    { value: "Computer Technology", label: "Computer Technology" },
    { value: "Electronics and Communication Engineering", label: "ECE" },
    { value: "Electronics and Instrumentation Engineering", label: "EIE" },
    { value: "Production Technology", label: "Production Technology" },
    { value: "Robotics and Automation", label: "Robotics & Automation" },
    { value: "Rubber and Plastics Technology", label: "Rubber & Plastics" },
    { value: "Information Technology", label: "Information Technology" }
];

const GENDERS = [
    { value: 'Male', label: 'Male' },
    { value: 'Female', label: 'Female' }
];

const EXEC_DESIG = ['Chairperson', 'Vice Chairperson', 'Treasurer', 'General Secretary'];
const TEAM_DESIG = ['Head', 'JS', 'Member', 'Volunteer'];
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

const normalizeDepartmentValue = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const mapped = DEPARTMENT_ENUM_KEY_TO_VALUE[raw.toUpperCase()];
    return mapped || raw;
};

const emptyAddForm = {
    name: '',
    profile_name: '',
    regno: '',
    email: '',
    dob: '',
    gender: '',
    phno: '',
    dept: '',
    password: '',
    confirmPassword: '',
    team: '',
    designation: 'Member',
    instagram_url: '',
    linkedin_url: '',
    github_url: '',
};

export default function TeamAdmin() {
    const { isSuperAdmin, canAccessHome, getAuthHeader } = useAuth();
    const [teamMembers, setTeamMembers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [teamFilter, setTeamFilter] = useState('All');
    const [designationFilter, setDesignationFilter] = useState('All');
    const [collegeFilter, setCollegeFilter] = useState('MIT');
    const [sortBy, setSortBy] = useState('name');
    const [sortDir, setSortDir] = useState('asc');
    const [batchFilter, setBatchFilter] = useState('All');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [selectedMember, setSelectedMember] = useState(null);
    const [editForm, setEditForm] = useState({ team: '', designation: '', instagram_url: '', linkedin_url: '', github_url: '' });
    const [photoFile, setPhotoFile] = useState(null);
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);
    const [hoveredDept, setHoveredDept] = useState(null);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [confirmText, setConfirmText] = useState('');
    const [confirmAction, setConfirmAction] = useState(null);
    const [addOpen, setAddOpen] = useState(false);
    const [addForm, setAddForm] = useState(emptyAddForm);
    const [addPhotoFile, setAddPhotoFile] = useState(null);
    const [adding, setAdding] = useState(false);
    const maxDobDate = useMemo(() => new Date().toISOString().slice(0, 10), []);

    const fetchData = useCallback(async () => {
        try {
            const res = await axios.get(`${API}/pda-admin/team?college_scope=mit`, { headers: getAuthHeader() });
            const rows = (res.data || [])
                .filter((row) => String(row?.regno || '') !== '0000000000')
                .map((row) => ({
                    ...row,
                    dept: normalizeDepartmentValue(row?.dept)
                }));
            setTeamMembers(rows);
        } catch (error) {
            console.error('Failed to load team members:', error);
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
        const filteredByTeam = teamMembers.filter((member) => {
            const teamMatch = teamFilter === 'All' || member.team === teamFilter;
            const desigMatch = designationFilter === 'All' || member.designation === designationFilter;
            const isMit = String(member?.college || '').trim().toLowerCase() === 'mit';
            const collegeMatch = collegeFilter === 'MIT' ? isMit : !isMit;
            return teamMatch && desigMatch && collegeMatch;
        });
        if (!search) return filteredByTeam;
        const s = search.toLowerCase();
        return filteredByTeam.filter(m =>
            [m.name, m.profile_name, m.regno, m.team, m.designation, m.email, m.phno, m.dept, m.college]
                .filter(Boolean)
                .join(' ')
                .toLowerCase()
                .includes(s)
        );
    }, [teamMembers, search, teamFilter, designationFilter, collegeFilter]);

    const sorted = useMemo(() => {
        const rows = [...filtered];
        const dir = sortDir === 'asc' ? 1 : -1;
        const getBatch = (m) => (m.regno ? String(m.regno).slice(0, 4) : '');
        rows.sort((a, b) => {
            let va = '';
            let vb = '';
            if (sortBy === 'team') {
                va = a.team || '';
                vb = b.team || '';
            } else if (sortBy === 'designation') {
                va = a.designation || '';
                vb = b.designation || '';
            } else if (sortBy === 'batch') {
                va = getBatch(a);
                vb = getBatch(b);
            } else {
                va = a.name || '';
                vb = b.name || '';
            }
            return va.localeCompare(vb) * dir;
        });
        return rows;
    }, [filtered, sortBy, sortDir]);

    useEffect(() => {
        setPage(1);
    }, [search, teamFilter, designationFilter, collegeFilter, sortBy, sortDir, pageSize]);

    const boundedPageSize = Math.min(pageSize, MAX_PAGE_SIZE);
    const totalPages = Math.max(1, Math.ceil(sorted.length / boundedPageSize));
    const currentPage = Math.min(page, totalPages);
    const paged = sorted.slice((currentPage - 1) * boundedPageSize, currentPage * boundedPageSize);

    const openMember = (member) => {
        setSelectedMember(member);
        setEditForm({
            team: member.team || '',
            designation: member.designation || '',
            instagram_url: member.instagram_url || '',
            linkedin_url: member.linkedin_url || '',
            github_url: member.github_url || ''
        });
        setPhotoFile(null);
        setIsEditing(false);
    };

    const getDesignationOptions = (team) => (
        team === 'Executive' ? EXEC_DESIG : TEAM_DESIG
    );

    const resetAddForm = () => {
        setAddForm(emptyAddForm);
        setAddPhotoFile(null);
    };

    const submitNewMember = async (e) => {
        e.preventDefault();
        if (adding) return;
        const missingRequired = [
            'name',
            'profile_name',
            'regno',
            'email',
            'dob',
            'gender',
            'phno',
            'dept',
            'password',
            'confirmPassword',
        ].some((key) => !String(addForm[key] || '').trim());
        if (missingRequired) {
            toast.error('Please complete all required fields.');
            return;
        }
        if (!addForm.team || !addForm.designation) {
            toast.error('Select a team and designation.');
            return;
        }
        if (addForm.password !== addForm.confirmPassword) {
            toast.error('Passwords do not match.');
            return;
        }
        const normalizedProfileName = String(addForm.profile_name || '').trim().toLowerCase();
        if (normalizedProfileName && !/^[a-z0-9_]{3,40}$/.test(normalizedProfileName)) {
            toast.error('Profile name must be 3-40 chars: lowercase letters, numbers, underscore.');
            return;
        }
        setAdding(true);
        try {
            let photoUrl = null;
            if (addPhotoFile) {
                const processed = await compressImageToWebp(addPhotoFile);
                photoUrl = await uploadTeamImage(processed, getAuthHeader);
            }
            const payload = {
                name: addForm.name.trim(),
                profile_name: normalizedProfileName,
                regno: addForm.regno.trim(),
                email: addForm.email.trim(),
                dob: addForm.dob,
                gender: addForm.gender,
                phno: addForm.phno.trim(),
                dept: addForm.dept,
                password: addForm.password,
                team: addForm.team,
                designation: addForm.designation,
                instagram_url: addForm.instagram_url.trim() || null,
                linkedin_url: addForm.linkedin_url.trim() || null,
                github_url: addForm.github_url.trim() || null,
                photo_url: photoUrl,
            };
            await axios.post(`${API}/pda-admin/team`, payload, { headers: getAuthHeader() });
            toast.success('Team member added.');
            setAddOpen(false);
            resetAddForm();
            fetchData();
        } catch (error) {
            console.error('Failed to add team member:', error);
            toast.error(error.response?.data?.detail || 'Failed to add team member.');
        } finally {
            setAdding(false);
        }
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
                team: editForm.team,
                designation: editForm.designation,
                instagram_url: editForm.instagram_url || null,
                linkedin_url: editForm.linkedin_url || null,
                github_url: editForm.github_url || null,
                photo_url: photoUrl
            };
            await axios.put(`${API}/pda-admin/team/${selectedMember.id}`, payload, { headers: getAuthHeader() });
            setSelectedMember(null);
            fetchData();
        } catch (error) {
            console.error('Failed to update team member:', error);
        } finally {
            setSaving(false);
            setIsEditing(false);
        }
    };

    const removeFromPda = async () => {
        if (!selectedMember) return;
        setDeleting(true);
        try {
            await axios.delete(`${API}/pda-admin/team/${selectedMember.id}`, { headers: getAuthHeader() });
            if (selectedMember.user_id) {
                await axios.put(
                    `${API}/pda-admin/users/${selectedMember.user_id}`,
                    { is_member: false, clear_team: true },
                    { headers: getAuthHeader() }
                );
            }
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
        if (!selectedMember?.user_id) return;
        setDeleting(true);
        try {
            await axios.delete(`${API}/pda-admin/users/${selectedMember.user_id}?force=true`, { headers: getAuthHeader() });
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
            const response = await axios.get(`${API}/pda-admin/team/export?format=${format}&college_scope=mit` , {
                headers: getAuthHeader(),
                responseType: 'blob'
            });
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `team.${format}`);
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (error) {
            console.error('Failed to export team:', error);
        }
    };

    if (!canAccessHome) {
        return (
            <AdminLayout title="Team Management" subtitle="Admin access required.">
                <div className="rounded-3xl border border-black/10 bg-white p-8 text-center text-sm text-slate-600">
                    You do not have permission to view this page.
                </div>
            </AdminLayout>
        );
    }

    const statsMembers = teamMembers;
    const totalMembers = statsMembers.length;
    const teamCounts = TEAMS.reduce((acc, team) => {
        acc[team] = statsMembers.filter((m) => m.team === team).length;
        return acc;
    }, { Unassigned: statsMembers.filter((m) => !m.team).length });
    const maxTeamCount = Math.max(1, ...Object.values(teamCounts));

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
        <AdminLayout title="Team Management" subtitle="Manage PDA team members and roles.">
            <section className="mb-6 rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <p className="text-xs uppercase tracking-[0.4em] text-slate-400">Overview</p>
                        <h2 className="text-2xl font-heading font-black">PDA Team Stats</h2>
                    </div>
                    <div className="text-sm text-slate-600">Total members: <span className="font-semibold text-[#11131a]">{totalMembers}</span></div>
                </div>

                <div className="mt-6 grid gap-6 lg:grid-cols-3">
                    <div className="rounded-2xl border border-black/10 bg-[#fffdf7] p-4">
                        <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Members Per Team</p>
                        <div className="mt-4 space-y-2">
                            {Object.entries(teamCounts).map(([team, count]) => (
                                <button
                                    key={team}
                                    type="button"
                                    className="flex w-full items-center gap-3 text-left"
                                    onClick={() => setTeamFilter(team === 'Unassigned' ? 'All' : team)}
                                    title="Click to filter list by team"
                                >
                                    <span className="w-28 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 sm:w-32">{team}</span>
                                    <div className="h-2 flex-1 rounded-full bg-[#f1f2f4]">
                                        <div className="h-2 rounded-full bg-[#f6c347]" style={{ width: `${(count / maxTeamCount) * 100}%` }} />
                                    </div>
                                    <span className="w-6 text-right text-xs text-slate-600">{count}</span>
                                </button>
                            ))}
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
                                        <div className="col-span-2 text-sm text-slate-500">No members found.</div>
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
                        <p className="text-xs uppercase tracking-[0.4em] text-slate-400">Team</p>
                        <h2 className="text-2xl font-heading font-black">Members</h2>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {isSuperAdmin ? (
                            <Button className="bg-[#f6c347] text-black hover:bg-[#ffd16b]" onClick={() => setAddOpen(true)}>
                                Add Member
                            </Button>
                        ) : null}
                        <Button variant="outline" className="border-black/10" onClick={() => handleExport('csv')}>Export CSV</Button>
                        <Button variant="outline" className="border-black/10" onClick={() => handleExport('xlsx')}>Export XLSX</Button>
                    </div>
                </div>

                <div className="mt-6 space-y-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                        <Input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search members..."
                            className="sm:max-w-sm"
                        />
                        <Select value={teamFilter} onValueChange={setTeamFilter}>
                            <SelectTrigger className="sm:w-56">
                                <SelectValue placeholder="Filter by team" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="All">All Teams</SelectItem>
                                {TEAMS.map(team => (
                                    <SelectItem key={team} value={team}>{team}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select value={designationFilter} onValueChange={setDesignationFilter}>
                            <SelectTrigger className="sm:w-56">
                                <SelectValue placeholder="Filter by designation" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="All">All Designations</SelectItem>
                                {[...EXEC_DESIG, ...TEAM_DESIG].map(desig => (
                                    <SelectItem key={desig} value={desig}>{desig}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select value={collegeFilter} onValueChange={setCollegeFilter}>
                            <SelectTrigger className="sm:w-56">
                                <SelectValue placeholder="Filter by college" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="MIT">MIT</SelectItem>
                                <SelectItem value="NON_MIT">NON MIT</SelectItem>
                            </SelectContent>
                        </Select>
                        <Select value={sortBy} onValueChange={setSortBy}>
                            <SelectTrigger className="sm:w-44">
                                <SelectValue placeholder="Sort by" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="name">Sort: Name</SelectItem>
                                <SelectItem value="team">Sort: Team</SelectItem>
                                <SelectItem value="designation">Sort: Designation</SelectItem>
                                <SelectItem value="batch">Sort: Batch</SelectItem>
                            </SelectContent>
                        </Select>
                        <Button variant="outline" className="border-black/10" onClick={() => setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'))}>
                            {sortDir === 'asc' ? 'Asc' : 'Desc'}
                        </Button>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-2">
                            <Label className="text-xs uppercase tracking-[0.2em] text-slate-400">Rows</Label>
                            <Select value={String(pageSize)} onValueChange={(value) => setPageSize(Number(value))}>
                                <SelectTrigger className="h-9 w-20">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {PAGE_SIZE_OPTIONS.map((option) => (
                                        <SelectItem key={option} value={String(option)}>
                                            {option}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <button
                            type="button"
                            onClick={() => setPage(Math.max(1, currentPage - 1))}
                            className="rounded-full border border-[#c99612] bg-[#f6c347] p-2 text-[#11131a] transition hover:bg-[#ffd16b] disabled:cursor-not-allowed disabled:opacity-50"
                            aria-label="Previous page"
                            disabled={currentPage === 1}
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </button>
                        <span className="text-sm text-slate-500">Page {currentPage} of {totalPages}</span>
                        <button
                            type="button"
                            onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
                            className="rounded-full border border-[#c99612] bg-[#f6c347] p-2 text-[#11131a] transition hover:bg-[#ffd16b] disabled:cursor-not-allowed disabled:opacity-50"
                            aria-label="Next page"
                            disabled={currentPage === totalPages}
                        >
                            <ChevronRight className="h-4 w-4" />
                        </button>
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
                            <div className="hidden sm:grid grid-cols-[1.5fr_1.2fr_1fr_1fr_1fr] bg-[#fff7dc] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-600">
                                <span>Name</span>
                                <span>Profile Name</span>
                                <span>Reg No</span>
                                <span>Team</span>
                                <span>Designation</span>
                            </div>
                            <div className="divide-y divide-black/5">
                                {paged.map(member => (
                                    <button
                                        key={member.id}
                                        type="button"
                                        onClick={() => openMember(member)}
                                        className="w-full px-4 py-3 text-left text-sm hover:bg-[#fffaf0] sm:grid sm:grid-cols-[1.5fr_1.2fr_1fr_1fr_1fr] sm:items-center"
                                    >
                                        <div className="flex flex-col gap-1 sm:block">
                                            <span className="font-medium text-[#11131a]">{member.name || 'Unnamed'}</span>
                                            <span className="text-xs text-slate-500 sm:hidden">@{member.profile_name || 'n/a'} · {member.regno || 'N/A'}</span>
                                        </div>
                                        <span className="hidden text-slate-600 sm:inline">@{member.profile_name || 'n/a'}</span>
                                        <span className="hidden text-slate-600 sm:inline">{member.regno || 'N/A'}</span>
                                        <span className="text-slate-600">{member.team || 'Unassigned'}</span>
                                        <span className="text-slate-600">{member.designation || 'Member'}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="text-center text-sm text-slate-500">No members found.</div>
                    )}
                </div>
            </section>

            <Dialog open={addOpen} onOpenChange={(open) => {
                setAddOpen(open);
                if (!open) resetAddForm();
            }}>
                <DialogContent className="w-[calc(100vw-1rem)] max-w-4xl max-h-[calc(100vh-2rem)] overflow-x-hidden overflow-y-auto bg-white">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-heading font-black">Add Team Member</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={submitNewMember} className="grid gap-4 md:grid-cols-2">
                        <div>
                            <Label>Name *</Label>
                            <Input name="name" value={addForm.name} onChange={(e) => setAddForm((prev) => ({ ...prev, name: e.target.value }))} required />
                        </div>
                        <div>
                            <Label>Register Number *</Label>
                            <Input name="regno" value={addForm.regno} onChange={(e) => setAddForm((prev) => ({ ...prev, regno: e.target.value }))} required />
                        </div>
                        <div>
                            <Label>Profile Name *</Label>
                            <Input
                                name="profile_name"
                                value={addForm.profile_name}
                                onChange={(e) => setAddForm((prev) => ({ ...prev, profile_name: e.target.value }))}
                                placeholder="eg: john_doe"
                                required
                            />
                            <p className="mt-1 text-[11px] text-slate-500">3-40 chars: lowercase letters, numbers, underscore.</p>
                        </div>
                        <div>
                            <Label>Email *</Label>
                            <Input name="email" type="email" value={addForm.email} onChange={(e) => setAddForm((prev) => ({ ...prev, email: e.target.value }))} required />
                        </div>
                        <div>
                            <Label>Date Of Birth *</Label>
                            <Input
                                name="dob"
                                type="date"
                                value={addForm.dob}
                                onChange={(e) => setAddForm((prev) => ({ ...prev, dob: e.target.value }))}
                                max={maxDobDate}
                                required
                                className="[color-scheme:light]"
                            />
                        </div>
                        <div>
                            <Label>Gender *</Label>
                            <Select value={addForm.gender} onValueChange={(value) => setAddForm((prev) => ({ ...prev, gender: value }))}>
                                <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Select gender" />
                                </SelectTrigger>
                                <SelectContent>
                                    {GENDERS.map((gender) => (
                                        <SelectItem key={gender.value} value={gender.value}>{gender.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label>Phone *</Label>
                            <Input name="phno" value={addForm.phno} onChange={(e) => setAddForm((prev) => ({ ...prev, phno: e.target.value }))} required />
                        </div>
                        <div>
                            <Label>Department *</Label>
                            <Select value={addForm.dept} onValueChange={(value) => setAddForm((prev) => ({ ...prev, dept: value }))}>
                                <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Select department" />
                                </SelectTrigger>
                                <SelectContent>
                                    {DEPARTMENTS.map((dept) => (
                                        <SelectItem key={dept.value} value={dept.value}>{dept.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label>Password *</Label>
                            <Input name="password" type="password" value={addForm.password} onChange={(e) => setAddForm((prev) => ({ ...prev, password: e.target.value }))} required />
                        </div>
                        <div>
                            <Label>Confirm Password *</Label>
                            <Input name="confirmPassword" type="password" value={addForm.confirmPassword} onChange={(e) => setAddForm((prev) => ({ ...prev, confirmPassword: e.target.value }))} required />
                        </div>
                        <div>
                            <Label>Team *</Label>
                            <Select
                                value={addForm.team}
                                onValueChange={(value) => {
                                    setAddForm((prev) => {
                                        const options = getDesignationOptions(value);
                                        const nextDesignation = options.includes(prev.designation) ? prev.designation : (options[0] || 'Member');
                                        return { ...prev, team: value, designation: nextDesignation };
                                    });
                                }}
                            >
                                <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Select team" />
                                </SelectTrigger>
                                <SelectContent>
                                    {TEAMS.map((team) => (
                                        <SelectItem key={team} value={team}>{team}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label>Designation *</Label>
                            <Select
                                value={addForm.designation}
                                onValueChange={(value) => setAddForm((prev) => ({ ...prev, designation: value }))}
                            >
                                <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Select designation" />
                                </SelectTrigger>
                                <SelectContent>
                                    {getDesignationOptions(addForm.team).map((designation) => (
                                        <SelectItem key={designation} value={designation}>{designation}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label>Instagram</Label>
                            <Input
                                value={addForm.instagram_url}
                                onChange={(e) => setAddForm((prev) => ({ ...prev, instagram_url: e.target.value }))}
                                placeholder="https://instagram.com/username"
                            />
                        </div>
                        <div>
                            <Label>LinkedIn</Label>
                            <Input
                                value={addForm.linkedin_url}
                                onChange={(e) => setAddForm((prev) => ({ ...prev, linkedin_url: e.target.value }))}
                                placeholder="https://linkedin.com/in/username"
                            />
                        </div>
                        <div className="md:col-span-2">
                            <Label>GitHub</Label>
                            <Input
                                value={addForm.github_url}
                                onChange={(e) => setAddForm((prev) => ({ ...prev, github_url: e.target.value }))}
                                placeholder="https://github.com/username"
                            />
                        </div>
                        <div className="md:col-span-2">
                            <Label>Upload Photo</Label>
                            <Input type="file" accept="image/*" onChange={(e) => setAddPhotoFile(e.target.files?.[0] || null)} />
                        </div>
                        <div className="md:col-span-2 flex justify-end gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                className="border-black/10"
                                onClick={() => {
                                    setAddOpen(false);
                                    resetAddForm();
                                }}
                            >
                                Cancel
                            </Button>
                            <Button type="submit" className="bg-[#f6c347] text-black hover:bg-[#ffd16b]" disabled={adding}>
                                {adding ? 'Saving...' : 'Add Member'}
                            </Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>

            <Dialog open={!!selectedMember} onOpenChange={() => {
                setSelectedMember(null);
                setConfirmOpen(false);
            }}>
                <DialogContent className="w-[calc(100vw-1rem)] max-w-3xl max-h-[calc(100vh-2rem)] overflow-x-hidden overflow-y-auto bg-white">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-heading font-black">Member Details</DialogTitle>
                    </DialogHeader>
                    {selectedMember && (
                        <div className="space-y-6">
                            <div className="flex justify-center">
                                <img
                                    src={selectedMember.photo_url || pdaLogo}
                                    alt={selectedMember.name}
                                    className="h-56 w-56 rounded-3xl object-cover"
                                />
                            </div>
                            <div className="grid gap-6 md:grid-cols-2">
                                <div className="min-w-0 space-y-2 break-words text-xs text-slate-500">
                                    <p><span className="font-semibold text-slate-600">Reg No:</span> {selectedMember.regno || 'N/A'}</p>
                                    <p><span className="font-semibold text-slate-600">Profile Name:</span> @{selectedMember.profile_name || 'n/a'}</p>
                                    <p><span className="font-semibold text-slate-600">Email:</span> {selectedMember.email || 'N/A'}</p>
                                    <p><span className="font-semibold text-slate-600">Phone:</span> {selectedMember.phno || 'N/A'}</p>
                                    <p><span className="font-semibold text-slate-600">Dept:</span> {selectedMember.dept || 'N/A'}</p>
                                    <p><span className="font-semibold text-slate-600">College:</span> {selectedMember.college || 'MIT'}</p>
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
                                    <p><span className="font-semibold text-slate-600">Instagram:</span> {selectedMember.instagram_url || 'N/A'}</p>
                                </div>
                                <div className="min-w-0 space-y-2 break-words text-xs text-slate-500">
                                    <p><span className="font-semibold text-slate-600">DOB:</span> {selectedMember.dob || 'N/A'}</p>
                                    <p><span className="font-semibold text-slate-600">Team:</span> {selectedMember.team || 'Unassigned'}</p>
                                    <p><span className="font-semibold text-slate-600">Designation:</span> {selectedMember.designation || 'Member'}</p>
                                    <p><span className="font-semibold text-slate-600">LinkedIn:</span> {selectedMember.linkedin_url || 'N/A'}</p>
                                    <p><span className="font-semibold text-slate-600">GitHub:</span> {selectedMember.github_url || 'N/A'}</p>
                                </div>
                            </div>
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Member</p>
                                        <h3 className="text-lg font-heading font-black">{selectedMember.name || 'Unnamed'}</h3>
                                    </div>
                                    {isSuperAdmin ? (
                                        <Button variant="outline" className="border-black/10" onClick={() => setIsEditing((prev) => !prev)}>
                                            {isEditing ? 'Cancel' : 'Edit'}
                                        </Button>
                                    ) : null}
                                </div>

                                <div className="grid gap-3 sm:grid-cols-2">
                                    <div>
                                        <Label>Team</Label>
                                        <Select value={editForm.team} onValueChange={(value) => setEditForm(prev => ({ ...prev, team: value }))} disabled={!isEditing || !isSuperAdmin}>
                                            <SelectTrigger><SelectValue placeholder="Select team" /></SelectTrigger>
                                            <SelectContent>
                                                {TEAMS.map(team => (
                                                    <SelectItem key={team} value={team}>{team}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div>
                                        <Label>Designation</Label>
                                        <Select value={editForm.designation} onValueChange={(value) => setEditForm(prev => ({ ...prev, designation: value }))} disabled={!isEditing || !isSuperAdmin}>
                                            <SelectTrigger><SelectValue placeholder="Select designation" /></SelectTrigger>
                                            <SelectContent>
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
                                                disabled={deleting}
                                                className="border-red-200 text-red-600 hover:bg-red-50"
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
                                                disabled={deleting || !selectedMember?.user_id}
                                                className="border-red-400 text-red-700 hover:bg-red-100"
                                            >
                                                {deleting ? 'Deleting...' : 'Delete User'}
                                            </Button>
                                        </div>
                                        <Button onClick={updateMember} disabled={!isEditing || saving} className="bg-[#f6c347] text-black hover:bg-[#ffd16b]">
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
                <DialogContent className="w-[calc(100vw-1rem)] max-w-md max-h-[calc(100vh-2rem)] overflow-x-hidden overflow-y-auto bg-white">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-heading font-black">Confirm Delete</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        {confirmAction === 'remove' ? (
                            <p className="text-sm text-slate-600">
                                Type <span className="font-semibold">REMOVE</span> to remove{' '}
                                <span className="font-semibold">{selectedMember?.name || 'this member'}</span> from the PDA team.
                            </p>
                        ) : (
                            <p className="text-sm text-slate-600">
                                Type <span className="font-semibold">DELETE ALL</span> to permanently delete{' '}
                                <span className="font-semibold">{selectedMember?.name || 'this member'}</span>.
                            </p>
                        )}
                        <Input
                            value={confirmText}
                            onChange={(e) => setConfirmText(e.target.value)}
                            placeholder={confirmAction === 'remove' ? 'Type REMOVE' : 'Type DELETE ALL'}
                            className="w-full"
                        />
                        <div className="flex justify-end gap-2">
                            <Button
                                variant="outline"
                                onClick={() => setConfirmOpen(false)}
                                className="border-black/10"
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
                                className="bg-red-600 text-white hover:bg-red-700"
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
