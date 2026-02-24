import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';

import AdminLayout from '@/pages/HomeAdmin/AdminLayout';
import { useAuth } from '@/context/AuthContext';
import { ccAdminApi, uploadCcBadgeRevealVideo, uploadCcLogo } from '@/pages/HomeAdmin/ccAdminApi';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const USERS_PAGE_SIZE = 20;
const ASSIGNMENTS_PAGE_SIZE = 20;

const EMPTY_BADGE = {
    badge_name: '',
    image_url: '',
    reveal_video_url: '',
};

const parseApiError = (error, fallback) => {
    const detail = error?.response?.data?.detail;
    if (Array.isArray(detail)) {
        const messages = [];
        for (const item of detail) {
            messages.push(item?.msg || item?.detail || JSON.stringify(item));
        }
        return messages.join(', ');
    }
    if (detail && typeof detail === 'object') {
        return detail.message || detail.msg || detail.detail || JSON.stringify(detail);
    }
    return detail || fallback;
};

const normalizeBatch = (regno) => {
    const value = String(regno || '').trim();
    if (value.length >= 4 && /^\d{4}/.test(value)) return value.slice(0, 4);
    return '';
};

export default function BadgesAdmin() {
    const { getAuthHeader } = useAuth();
    const headers = useMemo(() => getAuthHeader(), [getAuthHeader]);

    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [assignmentSubmitting, setAssignmentSubmitting] = useState(false);
    const [badgeImageFile, setBadgeImageFile] = useState(null);
    const [badgeRevealVideoFile, setBadgeRevealVideoFile] = useState(null);
    const [assignConfirmOpen, setAssignConfirmOpen] = useState(false);
    const [assignPreview, setAssignPreview] = useState(null);

    const [badges, setBadges] = useState([]);
    const [badgeModalOpen, setBadgeModalOpen] = useState(false);
    const [badgeEditing, setBadgeEditing] = useState(null);
    const [badgeForm, setBadgeForm] = useState(EMPTY_BADGE);

    const [userFilters, setUserFilters] = useState({
        q: '',
        college: 'all',
        membership: 'all',
        batch: 'all',
        team: 'all',
    });
    const [userOptions, setUserOptions] = useState([]);
    const [usersPage, setUsersPage] = useState(1);
    const [usersTotalCount, setUsersTotalCount] = useState(0);
    const [usersLoading, setUsersLoading] = useState(false);
    const [selectedUserIds, setSelectedUserIds] = useState([]);
    const [teamOptions, setTeamOptions] = useState([]);

    const [assignmentBadgeId, setAssignmentBadgeId] = useState('');
    const [assignmentMetaText, setAssignmentMetaText] = useState('');

    const [assignments, setAssignments] = useState([]);
    const [assignmentScope, setAssignmentScope] = useState('non_event');
    const [assignmentsPage, setAssignmentsPage] = useState(1);
    const [assignmentsTotalCount, setAssignmentsTotalCount] = useState(0);
    const [assignmentsLoading, setAssignmentsLoading] = useState(false);

    const batchOptions = useMemo(() => {
        const values = new Set();
        for (const row of userOptions) {
            const value = normalizeBatch(row.regno);
            if (value) values.add(value);
        }
        return Array.from(values).sort();
    }, [userOptions]);

    const selectedUserIdSet = useMemo(() => new Set(selectedUserIds), [selectedUserIds]);

    const loadBadges = useCallback(async () => {
        const response = await ccAdminApi.listBadges(headers);
        setBadges(response?.data || []);
    }, [headers]);

    const loadTeamOptions = useCallback(async () => {
        try {
            const response = await axios.get(`${API}/pda-admin/team`, { headers });
            const teamSet = new Set();
            const rows = response?.data || [];
            for (const row of rows) {
                const teamValue = String(row.team || '').trim();
                if (teamValue) teamSet.add(teamValue);
            }
            const teams = Array.from(teamSet).sort();
            setTeamOptions(teams);
        } catch (error) {
            toast.error(parseApiError(error, 'Failed to load team options'));
        }
    }, [headers]);

    const loadUserOptions = useCallback(async () => {
        setUsersLoading(true);
        try {
            const params = {
                q: userFilters.q || undefined,
                college: userFilters.college,
                membership: userFilters.membership,
                batch: userFilters.batch,
                team: userFilters.team,
                page: usersPage,
                page_size: USERS_PAGE_SIZE,
            };
            const response = await ccAdminApi.listBadgeUserOptions(headers, params);
            setUserOptions(response?.data || []);
            setUsersTotalCount(Number(response?.headers?.['x-total-count'] || 0));
        } catch (error) {
            toast.error(parseApiError(error, 'Failed to load user options'));
        } finally {
            setUsersLoading(false);
        }
    }, [headers, userFilters, usersPage]);

    const loadAssignments = useCallback(async () => {
        setAssignmentsLoading(true);
        try {
            const response = await ccAdminApi.listBadgeAssignments(headers, {
                scope: assignmentScope,
                page: assignmentsPage,
                page_size: ASSIGNMENTS_PAGE_SIZE,
            });
            setAssignments(response?.data || []);
            setAssignmentsTotalCount(Number(response?.headers?.['x-total-count'] || 0));
        } catch (error) {
            toast.error(parseApiError(error, 'Failed to load badge assignments'));
        } finally {
            setAssignmentsLoading(false);
        }
    }, [headers, assignmentScope, assignmentsPage]);

    const loadInitial = useCallback(async () => {
        setLoading(true);
        try {
            await Promise.all([loadBadges(), loadTeamOptions()]);
        } catch (error) {
            toast.error(parseApiError(error, 'Failed to load badges admin data'));
        } finally {
            setLoading(false);
        }
    }, [loadBadges, loadTeamOptions]);

    useEffect(() => {
        loadInitial();
    }, [loadInitial]);

    useEffect(() => {
        loadUserOptions();
    }, [loadUserOptions]);

    useEffect(() => {
        loadAssignments();
    }, [loadAssignments]);

    useEffect(() => {
        setUsersPage(1);
    }, [userFilters]);

    const openBadgeModal = (badge = null) => {
        setBadgeEditing(badge);
        setBadgeImageFile(null);
        setBadgeRevealVideoFile(null);
        setBadgeForm(badge ? {
            badge_name: badge.badge_name || '',
            image_url: badge.image_url || '',
            reveal_video_url: badge.reveal_video_url || '',
        } : EMPTY_BADGE);
        setBadgeModalOpen(true);
    };

    const submitBadge = async (event) => {
        event.preventDefault();
        if (submitting) return;
        setSubmitting(true);
        try {
            let uploadedImageUrl = badgeForm.image_url.trim() || null;
            if (badgeImageFile) {
                uploadedImageUrl = await uploadCcLogo(badgeImageFile, getAuthHeader);
            }
            let uploadedRevealVideoUrl = badgeForm.reveal_video_url.trim() || null;
            if (badgeRevealVideoFile) {
                uploadedRevealVideoUrl = await uploadCcBadgeRevealVideo(badgeRevealVideoFile, getAuthHeader);
            }
            const payload = {
                badge_name: badgeForm.badge_name.trim(),
                image_url: uploadedImageUrl,
                reveal_video_url: uploadedRevealVideoUrl,
            };
            if (badgeEditing) {
                await ccAdminApi.updateBadge(badgeEditing.id, payload, headers);
                toast.success('Badge updated');
            } else {
                await ccAdminApi.createBadge(payload, headers);
                toast.success('Badge created');
            }
            setBadgeModalOpen(false);
            await loadBadges();
        } catch (error) {
            toast.error(parseApiError(error, 'Failed to save badge'));
        } finally {
            setSubmitting(false);
        }
    };

    const selectPageUsers = () => {
        setSelectedUserIds((prev) => {
            const next = new Set(prev);
            for (const row of userOptions) {
                next.add(Number(row.id));
            }
            return Array.from(next);
        });
    };

    const clearPageUsers = () => {
        setSelectedUserIds((prev) => {
            const pageIds = new Set();
            for (const row of userOptions) {
                pageIds.add(Number(row.id));
            }
            const next = [];
            for (const id of prev) {
                if (!pageIds.has(id)) next.push(id);
            }
            return next;
        });
    };

    const selectFilteredUsers = async () => {
        try {
            setUsersLoading(true);
            let page = 1;
            const ids = new Set();
            while (true) {
                const response = await ccAdminApi.listBadgeUserOptions(headers, {
                    q: userFilters.q || undefined,
                    college: userFilters.college,
                    membership: userFilters.membership,
                    batch: userFilters.batch,
                    team: userFilters.team,
                    page,
                    page_size: 200,
                });
                const rows = response?.data || [];
                for (const row of rows) {
                    ids.add(String(row.id));
                }
                const total = Number(response?.headers?.['x-total-count'] || 0);
                const fetched = page * 200;
                if (!rows.length || fetched >= total) break;
                page += 1;
            }
            setSelectedUserIds((prev) => {
                const next = new Set(prev);
                for (const id of ids) {
                    next.add(Number(id));
                }
                return Array.from(next);
            });
            toast.success(`Selected ${ids.size} users from current filters`);
        } catch (error) {
            toast.error(parseApiError(error, 'Failed to select filtered users'));
        } finally {
            setUsersLoading(false);
        }
    };

    const assignBadge = async () => {
        if (!assignmentBadgeId) {
            toast.error('Select a badge first');
            return;
        }
        if (!selectedUserIds.length) {
            toast.error('Select at least one user');
            return;
        }

        let parsedMeta = {};
        if (assignmentMetaText.trim()) {
            try {
                parsedMeta = JSON.parse(assignmentMetaText);
            } catch {
                toast.error('Meta must be valid JSON');
                return;
            }
        }

        const chosenBadge = badges.find((row) => Number(row.id) === Number(assignmentBadgeId));
        const selectedPreviewRows = [];
        for (const row of userOptions) {
            const isSelected = selectedUserIdSet.has(Number(row.id));
            if (!isSelected) continue;
            selectedPreviewRows.push(`${row.name} (${row.regno})`);
            if (selectedPreviewRows.length >= 8) break;
        }

        setAssignPreview({
            badgeName: chosenBadge?.badge_name || `Badge #${assignmentBadgeId}`,
            selectedCount: selectedUserIds.length,
            selectedRows: selectedPreviewRows,
            metaText: assignmentMetaText.trim() || '',
            payload: {
                badge_id: Number(assignmentBadgeId),
                user_ids: selectedUserIds,
                meta: parsedMeta,
            },
        });
        setAssignConfirmOpen(true);
    };

    const confirmAssignBadge = async () => {
        if (!assignPreview?.payload) return;

        setAssignmentSubmitting(true);
        try {
            await ccAdminApi.createBulkBadgeAssignments(assignPreview.payload, headers);
            toast.success(`Badge assigned to ${assignPreview.selectedCount} user(s)`);
            setAssignConfirmOpen(false);
            setAssignPreview(null);
            setSelectedUserIds([]);
            setAssignmentMetaText('');
            await loadAssignments();
        } catch (error) {
            toast.error(parseApiError(error, 'Failed to assign badge'));
        } finally {
            setAssignmentSubmitting(false);
        }
    };

    const toggleUser = (userId) => {
        const numericId = Number(userId);
        setSelectedUserIds((prev) => {
            if (prev.includes(numericId)) {
                const next = [];
                for (const id of prev) {
                    if (id !== numericId) next.push(id);
                }
                return next;
            }
            return [...prev, numericId];
        });
    };

    const usersTotalPages = Math.max(1, Math.ceil(usersTotalCount / USERS_PAGE_SIZE));
    const assignmentsTotalPages = Math.max(1, Math.ceil(assignmentsTotalCount / ASSIGNMENTS_PAGE_SIZE));

    const badgeOptionItems = [];
    for (const badge of badges) {
        badgeOptionItems.push(
            <SelectItem key={badge.id} value={String(badge.id)}>{badge.badge_name}</SelectItem>,
        );
    }

    const batchOptionItems = [];
    for (const batch of batchOptions) {
        batchOptionItems.push(
            <SelectItem key={batch} value={batch}>{batch}</SelectItem>,
        );
    }

    const teamOptionItems = [];
    for (const team of teamOptions) {
        teamOptionItems.push(
            <SelectItem key={team} value={team.toLowerCase()}>{team}</SelectItem>,
        );
    }

    const badgeRows = [];
    for (const badge of badges) {
        badgeRows.push(
            <tr key={badge.id} className="border-t border-black/10">
                <td className="px-3 py-2 font-medium">{badge.badge_name}</td>
                <td className="px-3 py-2 text-right space-x-2">
                    <Button variant="outline" size="sm" onClick={() => openBadgeModal(badge)}>Edit</Button>
                    <Button
                        variant="destructive"
                        size="sm"
                        onClick={async () => {
                            try {
                                await ccAdminApi.deleteBadge(badge.id, headers);
                                toast.success('Badge deleted');
                                await loadBadges();
                                await loadAssignments();
                            } catch (error) {
                                toast.error(parseApiError(error, 'Failed to delete badge'));
                            }
                        }}
                    >
                        Delete
                    </Button>
                </td>
            </tr>,
        );
    }

    const userRows = [];
    for (const row of userOptions) {
        userRows.push(
            <tr key={row.id} className="border-t border-black/10">
                <td className="px-3 py-2">
                    <input type="checkbox" checked={selectedUserIdSet.has(Number(row.id))} onChange={() => toggleUser(row.id)} />
                </td>
                <td className="px-3 py-2">{row.name}</td>
                <td className="px-3 py-2">{row.regno}</td>
                <td className="px-3 py-2">{row.profile_name || '—'}</td>
                <td className="px-3 py-2">{row.college || '—'}</td>
                <td className="px-3 py-2">{row.is_member ? 'Yes' : 'No'}</td>
                <td className="px-3 py-2">{row.team || '—'}</td>
                <td className="px-3 py-2">{row.batch || '—'}</td>
            </tr>,
        );
    }

    const assignmentRows = [];
    for (const assignment of assignments) {
        assignmentRows.push(
            <tr key={assignment.id} className="border-t border-black/10">
                <td className="px-3 py-2">
                    <div className="font-medium">{assignment.badge_name}</div>
                    <div className="text-xs text-slate-500">#{assignment.id}</div>
                </td>
                <td className="px-3 py-2 text-xs">
                    {assignment.user_id ? (assignment.user_name ? `${assignment.user_name} (${assignment.user_regno || '—'})` : `user:${assignment.user_id}`) : null}
                    {assignment.pda_team_id ? `pda_team:${assignment.pda_team_id}` : null}
                    {assignment.persohub_team_id ? `persohub_team:${assignment.persohub_team_id}` : null}
                </td>
                <td className="px-3 py-2 text-xs">
                    {assignment.pda_event_id ? `pda:${assignment.pda_event_id}` : null}
                    {assignment.persohub_event_id ? `persohub:${assignment.persohub_event_id}` : null}
                    {!assignment.pda_event_id && !assignment.persohub_event_id ? 'none' : null}
                </td>
                <td className="px-3 py-2 text-xs text-slate-600">{assignment.meta ? JSON.stringify(assignment.meta) : '—'}</td>
                <td className="px-3 py-2 text-right">
                    <Button
                        variant="destructive"
                        size="sm"
                        onClick={async () => {
                            try {
                                await ccAdminApi.deleteBadgeAssignment(assignment.id, headers);
                                toast.success('Assignment deleted');
                                await loadAssignments();
                            } catch (error) {
                                toast.error(parseApiError(error, 'Failed to delete assignment'));
                            }
                        }}
                    >
                        Delete
                    </Button>
                </td>
            </tr>,
        );
    }

    const sampleUserItems = [];
    const previewRows = assignPreview?.selectedRows || [];
    for (const row of previewRows) {
        sampleUserItems.push(<li key={row}>{row}</li>);
    }

    return (
        <AdminLayout title="Badges" subtitle="Manage badge catalog and assign non-event badges to users.">
            <section className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-lg font-semibold">Badge Catalog</h2>
                    <Button onClick={() => openBadgeModal()}>Add Badge</Button>
                </div>

                <div className="rounded-2xl border border-black/10 bg-white overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50">
                            <tr>
                                <th className="px-3 py-2 text-left">Badge</th>
                                <th className="px-3 py-2 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {badgeRows}
                            {!badges.length ? (
                                <tr>
                                    <td className="px-3 py-6 text-center text-slate-500" colSpan={2}>No badges found</td>
                                </tr>
                            ) : null}
                        </tbody>
                    </table>
                </div>
            </section>

            <section className="space-y-4">
                <h2 className="text-lg font-semibold">Assign Badge (User Only)</h2>
                <div className="rounded-2xl border border-black/10 bg-white p-4 space-y-4">
                    <div className="grid gap-3 md:grid-cols-4">
                        <div className="grid gap-2">
                            <Label>Badge</Label>
                            <Select value={assignmentBadgeId || 'none'} onValueChange={(value) => setAssignmentBadgeId(value === 'none' ? '' : value)}>
                                <SelectTrigger><SelectValue placeholder="Select badge" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">Select badge</SelectItem>
                                    {badgeOptionItems}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid gap-2">
                            <Label>College</Label>
                            <Select value={userFilters.college} onValueChange={(value) => setUserFilters((prev) => ({ ...prev, college: value }))}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All</SelectItem>
                                    <SelectItem value="mit">MIT</SelectItem>
                                    <SelectItem value="non_mit">Non-MIT</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid gap-2">
                            <Label>PDA Membership</Label>
                            <Select value={userFilters.membership} onValueChange={(value) => setUserFilters((prev) => ({ ...prev, membership: value }))}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All</SelectItem>
                                    <SelectItem value="member">Member</SelectItem>
                                    <SelectItem value="non_member">Non-member</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid gap-2">
                            <Label>Batch</Label>
                            <Select value={userFilters.batch} onValueChange={(value) => setUserFilters((prev) => ({ ...prev, batch: value }))}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All</SelectItem>
                                    {batchOptionItems}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-3">
                        <div className="grid gap-2 md:col-span-2">
                            <Label>Search (name, regno, profile)</Label>
                            <Input
                                value={userFilters.q}
                                onChange={(event) => setUserFilters((prev) => ({ ...prev, q: event.target.value }))}
                                placeholder="Search users"
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label>Team</Label>
                            <Select value={userFilters.team} onValueChange={(value) => setUserFilters((prev) => ({ ...prev, team: value }))}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All</SelectItem>
                                    <SelectItem value="unassigned">Unassigned</SelectItem>
                                    {teamOptionItems}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={selectPageUsers}>Select Page</Button>
                        <Button type="button" variant="outline" size="sm" onClick={clearPageUsers}>Clear Page</Button>
                        <Button type="button" variant="outline" size="sm" onClick={selectFilteredUsers} disabled={usersLoading}>Select Filtered</Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => setSelectedUserIds([])}>Clear All</Button>
                        <span className="text-sm text-slate-600">Selected: {selectedUserIds.length}</span>
                    </div>

                    <div className="rounded-xl border border-black/10 overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50">
                                <tr>
                                    <th className="px-3 py-2 text-left">Select</th>
                                    <th className="px-3 py-2 text-left">Name</th>
                                    <th className="px-3 py-2 text-left">Reg No</th>
                                    <th className="px-3 py-2 text-left">Profile</th>
                                    <th className="px-3 py-2 text-left">College</th>
                                    <th className="px-3 py-2 text-left">Member</th>
                                    <th className="px-3 py-2 text-left">Team</th>
                                    <th className="px-3 py-2 text-left">Batch</th>
                                </tr>
                            </thead>
                            <tbody>
                                {userRows}
                                {!userOptions.length && !usersLoading ? (
                                    <tr>
                                        <td className="px-3 py-6 text-center text-slate-500" colSpan={8}>No users found</td>
                                    </tr>
                                ) : null}
                            </tbody>
                        </table>
                    </div>

                    <div className="flex items-center justify-end gap-2">
                        <Button type="button" variant="outline" size="sm" disabled={usersPage <= 1} onClick={() => setUsersPage((prev) => Math.max(1, prev - 1))}>Prev Users</Button>
                        <span className="text-xs text-slate-500">Page {usersPage} / {usersTotalPages}</span>
                        <Button type="button" variant="outline" size="sm" disabled={usersPage >= usersTotalPages} onClick={() => setUsersPage((prev) => prev + 1)}>Next Users</Button>
                    </div>

                    <div className="grid gap-2">
                        <Label>Meta JSON (optional)</Label>
                        <Textarea rows={3} value={assignmentMetaText} onChange={(event) => setAssignmentMetaText(event.target.value)} placeholder='{"place":"Winner","score":95}' />
                    </div>

                    <div className="flex justify-end">
                        <Button type="button" onClick={assignBadge} disabled={assignmentSubmitting || loading}>
                            {assignmentSubmitting ? 'Assigning...' : 'Assign Badge'}
                        </Button>
                    </div>
                </div>
            </section>

            <section className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                    <h2 className="text-lg font-semibold">Assignments</h2>
                    <div className="w-[220px]">
                        <Select value={assignmentScope} onValueChange={(value) => { setAssignmentScope(value); setAssignmentsPage(1); }}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="non_event">Non-event</SelectItem>
                                <SelectItem value="event">Event-scoped</SelectItem>
                                <SelectItem value="all">All</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <div className="rounded-2xl border border-black/10 bg-white overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50">
                            <tr>
                                <th className="px-3 py-2 text-left">Assignment</th>
                                <th className="px-3 py-2 text-left">Target</th>
                                <th className="px-3 py-2 text-left">Event</th>
                                <th className="px-3 py-2 text-left">Meta</th>
                                <th className="px-3 py-2 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {assignmentRows}
                            {!assignments.length && !assignmentsLoading ? (
                                <tr>
                                    <td className="px-3 py-6 text-center text-slate-500" colSpan={5}>No assignments found</td>
                                </tr>
                            ) : null}
                        </tbody>
                    </table>
                </div>

                <div className="flex items-center justify-end gap-2">
                    <Button type="button" variant="outline" size="sm" disabled={assignmentsPage <= 1} onClick={() => setAssignmentsPage((prev) => Math.max(1, prev - 1))}>Prev Assignments</Button>
                    <span className="text-xs text-slate-500">Page {assignmentsPage} / {assignmentsTotalPages}</span>
                    <Button type="button" variant="outline" size="sm" disabled={assignmentsPage >= assignmentsTotalPages} onClick={() => setAssignmentsPage((prev) => prev + 1)}>Next Assignments</Button>
                </div>
            </section>

            <Dialog open={badgeModalOpen} onOpenChange={setBadgeModalOpen}>
                <DialogContent className="sm:max-w-xl">
                    <DialogHeader>
                        <DialogTitle>{badgeEditing ? 'Edit Badge' : 'Create Badge'}</DialogTitle>
                    </DialogHeader>
                    <form className="space-y-4" onSubmit={submitBadge}>
                        <div className="grid gap-2">
                            <Label>Badge Name</Label>
                            <Input value={badgeForm.badge_name} onChange={(event) => setBadgeForm((prev) => ({ ...prev, badge_name: event.target.value }))} required />
                        </div>
                        <div className="grid gap-2">
                            <Label>Badge Image Upload</Label>
                            <Input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setBadgeImageFile(event.target.files?.[0] || null)} />
                            <p className="text-xs text-slate-500">Uses S3 presigned upload. {badgeForm.image_url ? 'Current image is kept if no new file is selected.' : ''}</p>
                            {badgeForm.image_url ? (
                                <a href={badgeForm.image_url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 underline break-all">
                                    {badgeForm.image_url}
                                </a>
                            ) : null}
                        </div>
                        <div className="grid gap-2">
                            <Label>Badge Reveal Video Upload (optional)</Label>
                            <Input type="file" accept="video/mp4,video/webm,video/quicktime" onChange={(event) => setBadgeRevealVideoFile(event.target.files?.[0] || null)} />
                            <p className="text-xs text-slate-500">If empty, frontend falls back to default reveal animation.</p>
                            {badgeForm.reveal_video_url ? (
                                <a href={badgeForm.reveal_video_url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 underline break-all">
                                    {badgeForm.reveal_video_url}
                                </a>
                            ) : null}
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button type="button" variant="outline" onClick={() => setBadgeModalOpen(false)}>Cancel</Button>
                            <Button type="submit" disabled={submitting}>{submitting ? 'Saving...' : 'Save'}</Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>

            <Dialog open={assignConfirmOpen} onOpenChange={setAssignConfirmOpen}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Confirm Badge Assignment</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-2 text-sm">
                        <p><span className="font-semibold">Badge:</span> {assignPreview?.badgeName || '—'}</p>
                        <p><span className="font-semibold">Users selected:</span> {assignPreview?.selectedCount || 0}</p>
                        {assignPreview?.selectedRows?.length ? (
                            <div>
                                <p className="font-semibold">Sample users:</p>
                                <ul className="list-disc pl-5 text-xs text-slate-600">
                                    {sampleUserItems}
                                </ul>
                            </div>
                        ) : null}
                        <p><span className="font-semibold">Meta:</span> {assignPreview?.metaText || 'none'}</p>
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" onClick={() => setAssignConfirmOpen(false)}>Cancel</Button>
                        <Button type="button" onClick={confirmAssignBadge} disabled={assignmentSubmitting}>
                            {assignmentSubmitting ? 'Assigning...' : 'Confirm Assign'}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {loading ? <p className="text-sm text-slate-500">Loading badges...</p> : null}
        </AdminLayout>
    );
}
