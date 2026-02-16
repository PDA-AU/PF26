import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/context/AuthContext';
import AdminLayout from '@/pages/HomeAdmin/AdminLayout';
import { API } from '@/pages/HomeAdmin/adminApi';

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

const DESIGNATIONS = [
    'Member',
    'Volunteer',
    'JS',
    'Head',
    'General Secretary',
    'Treasurer',
    'Vice Chairperson',
    'Chairperson'
];

const EXECUTIVE_DESIGNATIONS = [
    'Chairperson',
    'Vice Chairperson',
    'General Secretary',
    'Treasurer'
];

const TEAM_FILTERS = [
    'All',
    'Executive',
    'Content Creation',
    'Event Management',
    'Design',
    'Website Design',
    'Public Relations',
    'Podcast',
    'Library',
    'Unassigned'
];

const RESUME_FILTERS = [
    'All',
    'Uploaded',
    'Missing'
];

export default function RecruitmentsAdmin() {
    const { user, getAuthHeader } = useAuth();
    const [recruitments, setRecruitments] = useState([]);
    const [selectedRecruitments, setSelectedRecruitments] = useState([]);
    const [assignments, setAssignments] = useState({});
    const [exporting, setExporting] = useState(false);
    const [recruitSearch, setRecruitSearch] = useState('');
    const [recruitTeamFilter, setRecruitTeamFilter] = useState('All');
    const [resumeFilter, setResumeFilter] = useState('All');
    const [page, setPage] = useState(1);
    const [approveDialogOpen, setApproveDialogOpen] = useState(false);
    const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
    const [approveConfirmText, setApproveConfirmText] = useState('');
    const [rejectConfirmText, setRejectConfirmText] = useState('');
    const [bulkActionLoading, setBulkActionLoading] = useState(false);

    const fetchRecruitments = useCallback(async () => {
        try {
            const res = await axios.get(`${API}/pda-admin/recruitments`, { headers: getAuthHeader() });
            setRecruitments(res.data || []);
            const initial = {};
            (res.data || []).forEach((recruit) => {
                initial[recruit.id] = {
                    team: recruit.preferred_team_1 || recruit.preferred_team || '',
                    designation: 'Member'
                };
            });
            setAssignments(initial);
        } catch (error) {
            console.error('Failed to load recruitments:', error);
        }
    }, [getAuthHeader]);

    useEffect(() => {
        if (user?.is_superadmin) {
            fetchRecruitments();
        }
    }, [user, fetchRecruitments]);

    const toggleRecruitment = (id) => {
        setSelectedRecruitments(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]);
    };

    const updateAssignment = (id, field, value) => {
        setAssignments((prev) => ({
            ...prev,
            [id]: {
                ...prev[id],
                [field]: value
            }
        }));
    };

    const getDesignationOptions = (team) => (
        team === 'Executive' ? EXECUTIVE_DESIGNATIONS : DESIGNATIONS
    );

    const approveRecruitments = async () => {
        if (selectedRecruitments.length === 0) return;
        setBulkActionLoading(true);
        try {
            const payload = selectedRecruitments.map((id) => ({
                id,
                team: assignments[id]?.team || null,
                designation: assignments[id]?.designation || null
            }));
            await axios.post(`${API}/pda-admin/recruitments/approve`, payload, { headers: getAuthHeader() });
            setSelectedRecruitments([]);
            setApproveDialogOpen(false);
            setApproveConfirmText('');
            fetchRecruitments();
        } catch (error) {
            console.error('Failed to approve recruitments:', error);
        } finally {
            setBulkActionLoading(false);
        }
    };

    const rejectRecruitments = async () => {
        if (selectedRecruitments.length === 0) return;
        setBulkActionLoading(true);
        try {
            const payload = selectedRecruitments.map((id) => ({ id }));
            await axios.post(`${API}/pda-admin/recruitments/reject`, payload, { headers: getAuthHeader() });
            setSelectedRecruitments([]);
            setRejectDialogOpen(false);
            setRejectConfirmText('');
            fetchRecruitments();
        } catch (error) {
            console.error('Failed to reject recruitments:', error);
        } finally {
            setBulkActionLoading(false);
        }
    };

    const openApproveDialog = () => {
        if (selectedRecruitments.length === 0) return;
        setApproveConfirmText('');
        setApproveDialogOpen(true);
    };

    const openRejectDialog = () => {
        if (selectedRecruitments.length === 0) return;
        setRejectConfirmText('');
        setRejectDialogOpen(true);
    };

    const exportRecruitments = async () => {
        setExporting(true);
        try {
            const response = await axios.get(`${API}/pda-admin/recruitments/export`, {
                headers: getAuthHeader(),
                responseType: 'blob'
            });
            const url = window.URL.createObjectURL(response.data);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'recruitments.xlsx';
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Failed to export recruitments:', error);
        } finally {
            setExporting(false);
        }
    };

    useEffect(() => {
        setPage(1);
    }, [recruitSearch, recruitTeamFilter, resumeFilter]);

    const filteredRecruitments = recruitments.filter((recruit) => {
        const preferredTeam = recruit?.preferred_team_1 || recruit?.preferred_team;
        const teamMatch = recruitTeamFilter === 'All'
            || (recruitTeamFilter === 'Unassigned' && !preferredTeam)
            || preferredTeam === recruitTeamFilter;
        const resumeMatch = resumeFilter === 'All'
            || (resumeFilter === 'Uploaded' && Boolean(recruit?.resume_url))
            || (resumeFilter === 'Missing' && !recruit?.resume_url);
        const haystack = `${recruit?.name || ''} ${recruit?.profile_name || ''} ${recruit?.regno || ''} ${recruit?.email || ''}`.toLowerCase();
        return teamMatch && resumeMatch && haystack.includes(recruitSearch.trim().toLowerCase());
    });
    const totalPages = Math.max(1, Math.ceil(filteredRecruitments.length / 10));
    const pagedRecruitments = filteredRecruitments.slice((page - 1) * 10, page * 10);
    const allVisibleSelected = pagedRecruitments.length > 0 && pagedRecruitments.every((recruit) => selectedRecruitments.includes(recruit.id));

    useEffect(() => {
        if (page > totalPages) {
            setPage(totalPages);
        }
    }, [page, totalPages]);

    if (!user?.is_superadmin) {
        return (
            <AdminLayout title="Recruitments" subtitle="Access restricted to the superadmin account.">
                <div className="rounded-3xl border border-black/10 bg-white p-8 text-center text-sm text-slate-600">
                    You do not have permission to view this page.
                </div>
            </AdminLayout>
        );
    }

    return (
        <AdminLayout title="Recruitments" subtitle="Review and approve PDA recruitment applications.">
            <section className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <p className="text-xs uppercase tracking-[0.4em] text-slate-400">Recruitments</p>
                        <h2 className="text-2xl font-heading font-black">Pending Applications</h2>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {filteredRecruitments.length > 10 ? (
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                                    className="rounded-full border border-[#c99612] bg-[#f6c347] p-2 text-[#11131a] transition hover:bg-[#ffd16b] disabled:cursor-not-allowed disabled:opacity-50"
                                    aria-label="Previous recruitment page"
                                    disabled={page === 1}
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                                    className="rounded-full border border-[#c99612] bg-[#f6c347] p-2 text-[#11131a] transition hover:bg-[#ffd16b] disabled:cursor-not-allowed disabled:opacity-50"
                                    aria-label="Next recruitment page"
                                    disabled={page === totalPages}
                                >
                                    <ChevronRight className="h-4 w-4" />
                                </button>
                            </div>
                        ) : null}
                        <Button onClick={exportRecruitments} variant="outline" className="border-black/10 text-sm" disabled={exporting}>
                            {exporting ? 'Exporting...' : 'Export Excel'}
                        </Button>
                        <Button onClick={openApproveDialog} className="bg-[#f6c347] text-black hover:bg-[#ffd16b]" disabled={selectedRecruitments.length === 0}>
                            Approve Selected
                        </Button>
                        <Button onClick={openRejectDialog} variant="outline" className="border-black/20 text-sm" disabled={selectedRecruitments.length === 0}>
                            Reject Selected
                        </Button>
                    </div>
                </div>
                <div className="mt-6 grid gap-4 md:grid-cols-4">
                    <div className="md:col-span-2">
                        <Label htmlFor="recruit-search">Search Applications</Label>
                        <Input
                            id="recruit-search"
                            value={recruitSearch}
                            onChange={(e) => setRecruitSearch(e.target.value)}
                            placeholder="Search by name, regno, or email"
                        />
                    </div>
                    <div>
                        <Label htmlFor="recruit-team-filter">Preferred Team</Label>
                        <select
                            id="recruit-team-filter"
                            value={recruitTeamFilter}
                            onChange={(e) => setRecruitTeamFilter(e.target.value)}
                            className="w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm"
                        >
                            {TEAM_FILTERS.map((team) => (
                                <option key={team} value={team}>{team}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <Label htmlFor="recruit-resume-filter">Resume</Label>
                        <select
                            id="recruit-resume-filter"
                            value={resumeFilter}
                            onChange={(e) => setResumeFilter(e.target.value)}
                            className="w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm"
                        >
                            {RESUME_FILTERS.map((filter) => (
                                <option key={filter} value={filter}>{filter}</option>
                            ))}
                        </select>
                    </div>
                </div>
                <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
                    <label className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            checked={allVisibleSelected}
                            onChange={(e) => {
                                if (e.target.checked) {
                                    setSelectedRecruitments((prev) => {
                                        const merged = new Set(prev);
                                        pagedRecruitments.forEach((recruit) => merged.add(recruit.id));
                                        return Array.from(merged);
                                    });
                                } else {
                                    setSelectedRecruitments((prev) => prev.filter((id) => !pagedRecruitments.some((recruit) => recruit.id === id)));
                                }
                            }}
                        />
                        Select all visible
                    </label>
                    <span>{filteredRecruitments.length} applications</span>
                </div>
                <div className="mt-6 space-y-3">
                    {pagedRecruitments.map((recruit) => (
                        <label key={recruit.id} className="flex flex-col gap-4 rounded-2xl border border-black/10 p-4 md:flex-row">
                            <div className="flex items-start gap-4">
                                <input
                                    type="checkbox"
                                    checked={selectedRecruitments.includes(recruit.id)}
                                    onChange={() => toggleRecruitment(recruit.id)}
                                    className="mt-1"
                                />
                                <div>
                                    <p className="font-semibold">{recruit.name} ({recruit.regno})</p>
                                    <p className="text-xs text-slate-500">
                                        Profile: @{recruit.profile_name || 'n/a'}
                                    </p>
                                    <p className="text-xs text-slate-500">
                                        {recruit.email} · {recruit.phno || 'No phone'} · DOB: {recruit.dob || 'N/A'}
                                    </p>
                                    <p className="text-xs text-slate-500">
                                        Preferred 1: {recruit.preferred_team_1 || recruit.preferred_team || 'N/A'} · Preferred 2: {recruit.preferred_team_2 || 'N/A'} · Preferred 3: {recruit.preferred_team_3 || 'N/A'}
                                    </p>
                                    <p className="text-xs text-slate-500">
                                        Dept: {recruit.dept || 'N/A'}
                                    </p>
                                    <div className="mt-2">
                                        {recruit.resume_url ? (
                                            <a
                                                href={recruit.resume_url}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="inline-flex items-center rounded-md border border-black/20 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                                            >
                                                View Resume
                                            </a>
                                        ) : (
                                            <span className="text-xs text-slate-500">Resume: N/A</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <div className="grid gap-3 md:ml-auto md:min-w-[260px]">
                                <div>
                                    <Label className="text-xs text-slate-500">Assign Team</Label>
                                    <Select
                                        value={assignments[recruit.id]?.team || ''}
                                        onValueChange={(value) => {
                                            updateAssignment(recruit.id, 'team', value);
                                            const options = getDesignationOptions(value);
                                            if (assignments[recruit.id]?.designation && !options.includes(assignments[recruit.id]?.designation)) {
                                                updateAssignment(recruit.id, 'designation', options[0] || 'Member');
                                            }
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
                                    <Label className="text-xs text-slate-500">Designation</Label>
                                    <Select
                                        value={assignments[recruit.id]?.designation || 'Member'}
                                        onValueChange={(value) => updateAssignment(recruit.id, 'designation', value)}
                                    >
                                        <SelectTrigger className="w-full">
                                            <SelectValue placeholder="Select designation" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {getDesignationOptions(assignments[recruit.id]?.team).map((designation) => (
                                                <SelectItem key={designation} value={designation}>{designation}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </label>
                    ))}
                    {filteredRecruitments.length === 0 && (
                        <div className="text-sm text-slate-500">No pending applications.</div>
                    )}
                </div>
            </section>

            <Dialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Confirm Approve</DialogTitle>
                        <DialogDescription>
                            This will approve {selectedRecruitments.length} selected application(s). Type <span className="font-semibold">APPROVE</span> to continue.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2">
                        <Label htmlFor="approve-confirm-input">Type APPROVE</Label>
                        <Input
                            id="approve-confirm-input"
                            value={approveConfirmText}
                            onChange={(e) => setApproveConfirmText(e.target.value)}
                            placeholder="APPROVE"
                            autoComplete="off"
                        />
                    </div>
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                                setApproveDialogOpen(false);
                                setApproveConfirmText('');
                            }}
                            disabled={bulkActionLoading}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            onClick={approveRecruitments}
                            disabled={bulkActionLoading || approveConfirmText.trim().toUpperCase() !== 'APPROVE'}
                            className="bg-[#f6c347] text-black hover:bg-[#ffd16b]"
                        >
                            {bulkActionLoading ? 'Approving...' : 'Confirm Approve'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Confirm Reject</DialogTitle>
                        <DialogDescription>
                            This will reject {selectedRecruitments.length} selected application(s). Type <span className="font-semibold">REJECT</span> to continue.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2">
                        <Label htmlFor="reject-confirm-input">Type REJECT</Label>
                        <Input
                            id="reject-confirm-input"
                            value={rejectConfirmText}
                            onChange={(e) => setRejectConfirmText(e.target.value)}
                            placeholder="REJECT"
                            autoComplete="off"
                        />
                    </div>
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                                setRejectDialogOpen(false);
                                setRejectConfirmText('');
                            }}
                            disabled={bulkActionLoading}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            onClick={rejectRecruitments}
                            disabled={bulkActionLoading || rejectConfirmText.trim().toUpperCase() !== 'REJECT'}
                            variant="destructive"
                        >
                            {bulkActionLoading ? 'Rejecting...' : 'Confirm Reject'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </AdminLayout>
    );
}
