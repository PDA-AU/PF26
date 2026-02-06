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

export default function TeamAdmin() {
    const { isSuperAdmin, getAuthHeader } = useAuth();
    const [teamMembers, setTeamMembers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [teamFilter, setTeamFilter] = useState('All');
    const [designationFilter, setDesignationFilter] = useState('All');
    const [page, setPage] = useState(1);
    const [selectedMember, setSelectedMember] = useState(null);
    const [editForm, setEditForm] = useState({ team: '', designation: '' });
    const [photoFile, setPhotoFile] = useState(null);
    const [saving, setSaving] = useState(false);

    const fetchData = useCallback(async () => {
        try {
            const res = await axios.get(`${API}/pda-admin/team`, { headers: getAuthHeader() });
            setTeamMembers(res.data || []);
        } catch (error) {
            console.error('Failed to load team members:', error);
        } finally {
            setLoading(false);
        }
    }, [getAuthHeader]);

    useEffect(() => {
        if (isSuperAdmin) {
            fetchData();
        }
    }, [isSuperAdmin, fetchData]);

    const filtered = useMemo(() => {
        const filteredByTeam = teamMembers.filter((member) => {
            const teamMatch = teamFilter === 'All' || member.team === teamFilter;
            const desigMatch = designationFilter === 'All' || member.designation === designationFilter;
            return teamMatch && desigMatch;
        });
        if (!search) return filteredByTeam;
        const s = search.toLowerCase();
        return filteredByTeam.filter(m =>
            [m.name, m.regno, m.team, m.designation, m.email, m.phno, m.dept]
                .filter(Boolean)
                .join(' ')
                .toLowerCase()
                .includes(s)
        );
    }, [teamMembers, search, teamFilter, designationFilter]);

    useEffect(() => {
        setPage(1);
    }, [search, teamFilter, designationFilter]);

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    const openMember = (member) => {
        setSelectedMember(member);
        setEditForm({
            team: member.team || '',
            designation: member.designation || ''
        });
        setPhotoFile(null);
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
                photo_url: photoUrl
            };
            await axios.put(`${API}/pda-admin/team/${selectedMember.id}`, payload, { headers: getAuthHeader() });
            setSelectedMember(null);
            fetchData();
        } catch (error) {
            console.error('Failed to update team member:', error);
        } finally {
            setSaving(false);
        }
    };

    const handleExport = async (format) => {
        try {
            const response = await axios.get(`${API}/pda-admin/team/export?format=${format}` , {
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

    if (!isSuperAdmin) {
        return (
            <AdminLayout title="Team Management" subtitle="Superadmin access required.">
                <div className="rounded-3xl border border-black/10 bg-white p-8 text-center text-sm text-slate-600">
                    You do not have permission to view this page.
                </div>
            </AdminLayout>
        );
    }

    return (
        <AdminLayout title="Team Management" subtitle="Manage PDA team members and roles.">
            <section className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <p className="text-xs uppercase tracking-[0.4em] text-slate-400">Team</p>
                        <h2 className="text-2xl font-heading font-black">Members</h2>
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
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}>Prev</Button>
                        <span className="text-sm text-slate-500">Page {page} of {totalPages}</span>
                        <Button variant="outline" onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages}>Next</Button>
                    </div>
                </div>

                <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                    {loading ? (
                        <div className="col-span-full text-center text-sm text-slate-500">Loading...</div>
                    ) : paged.length ? (
                        paged.map(member => (
                            <button
                                key={member.id}
                                type="button"
                                onClick={() => openMember(member)}
                                className="group flex h-full flex-col overflow-hidden rounded-3xl border border-black/10 bg-white text-left shadow-sm transition hover:-translate-y-1 hover:border-black/30 hover:shadow-md"
                            >
                                <div className="relative h-44 w-full overflow-hidden bg-[#f7f4ea]">
                                    <img
                                        src={member.photo_url || pdaLogo}
                                        alt={member.name}
                                        className="h-full w-full object-cover transition group-hover:scale-[1.02]"
                                    />
                                </div>
                                <div className="flex flex-1 flex-col gap-3 p-5">
                                    <div>
                                        <p className="text-lg font-heading font-bold text-[#0f1115]">{member.name}</p>
                                        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{member.regno}</p>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#8b6a00]">
                                        <span className="rounded-full border border-[#f6c347]/40 bg-[#fff8e6] px-3 py-1">
                                            {member.team || 'Unassigned'}
                                        </span>
                                        <span className="rounded-full border border-black/10 bg-slate-50 px-3 py-1 text-slate-600">
                                            {member.designation || 'Member'}
                                        </span>
                                    </div>
                                    <div className="space-y-1 text-sm text-slate-600">
                                        {member.dept ? (
                                            <p>{member.dept}</p>
                                        ) : null}
                                        {member.email ? (
                                            <p>{member.email}</p>
                                        ) : null}
                                        {member.phno ? (
                                            <p>{member.phno}</p>
                                        ) : null}
                                        {member.dob ? (
                                            <p>DOB: {member.dob}</p>
                                        ) : null}
                                    </div>
                                    <span className="mt-auto text-xs text-slate-400">Tap to edit</span>
                                </div>
                            </button>
                        ))
                    ) : (
                        <div className="col-span-full text-center text-sm text-slate-500">No members found.</div>
                    )}
                </div>
            </section>

            <Dialog open={!!selectedMember} onOpenChange={() => setSelectedMember(null)}>
                <DialogContent className="max-w-2xl bg-white">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-heading font-black">Edit Member</DialogTitle>
                    </DialogHeader>
                    {selectedMember && (
                        <div className="grid gap-4 md:grid-cols-[160px_1fr]">
                            <div>
                                <img
                                    src={selectedMember.photo_url || pdaLogo}
                                    alt={selectedMember.name}
                                    className="h-40 w-40 rounded-2xl object-cover"
                                />
                                <div className="mt-3 space-y-1 text-xs text-slate-500">
                                    <p><span className="font-semibold text-slate-600">Reg No:</span> {selectedMember.regno}</p>
                                    {selectedMember.email ? (
                                        <p><span className="font-semibold text-slate-600">Email:</span> {selectedMember.email}</p>
                                    ) : null}
                                    {selectedMember.phno ? (
                                        <p><span className="font-semibold text-slate-600">Phone:</span> {selectedMember.phno}</p>
                                    ) : null}
                                    {selectedMember.dept ? (
                                        <p><span className="font-semibold text-slate-600">Dept:</span> {selectedMember.dept}</p>
                                    ) : null}
                                    {selectedMember.dob ? (
                                        <p><span className="font-semibold text-slate-600">DOB:</span> {selectedMember.dob}</p>
                                    ) : null}
                                    {selectedMember.team ? (
                                        <p><span className="font-semibold text-slate-600">Team:</span> {selectedMember.team}</p>
                                    ) : null}
                                    {selectedMember.designation ? (
                                        <p><span className="font-semibold text-slate-600">Designation:</span> {selectedMember.designation}</p>
                                    ) : null}
                                </div>
                            </div>
                            <div className="space-y-3">
                                <div>
                                    <Label>Name</Label>
                                    <Input value={selectedMember.name} readOnly className="bg-slate-50" />
                                </div>
                                <div>
                                    <Label>Register Number</Label>
                                    <Input value={selectedMember.regno} readOnly className="bg-slate-50" />
                                </div>
                                <div>
                                    <Label>Team</Label>
                                    <Select value={editForm.team} onValueChange={(value) => setEditForm(prev => ({ ...prev, team: value }))}>
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
                                    <Select value={editForm.designation} onValueChange={(value) => setEditForm(prev => ({ ...prev, designation: value }))}>
                                        <SelectTrigger><SelectValue placeholder="Select designation" /></SelectTrigger>
                                        <SelectContent>
                                            {(editForm.team === 'Executive' ? EXEC_DESIG : TEAM_DESIG).map(desig => (
                                                <SelectItem key={desig} value={desig}>{desig}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div>
                                    <Label>Upload New Photo</Label>
                                    <Input type="file" accept="image/*" onChange={(e) => setPhotoFile(e.target.files?.[0] || null)} />
                                </div>
                                <Button onClick={updateMember} disabled={saving} className="bg-[#f6c347] text-black hover:bg-[#ffd16b]">
                                    {saving ? 'Saving...' : 'Save Changes'}
                                </Button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </AdminLayout>
    );
}
