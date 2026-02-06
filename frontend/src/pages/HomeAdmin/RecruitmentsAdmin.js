import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/context/AuthContext';
import AdminLayout from '@/pages/HomeAdmin/AdminLayout';
import { API, uploadTeamImage } from '@/pages/HomeAdmin/adminApi';
import { compressImageToWebp } from '@/utils/imageCompression';

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

const emptyMemberForm = {
    name: '',
    regno: '',
    email: '',
    phno: '',
    dept: '',
    team: '',
    designation: 'Member',
    photo_url: ''
};

export default function RecruitmentsAdmin() {
    const { user, getAuthHeader } = useAuth();
    const [recruitments, setRecruitments] = useState([]);
    const [selectedRecruitments, setSelectedRecruitments] = useState([]);
    const [assignments, setAssignments] = useState({});
    const [memberForm, setMemberForm] = useState(emptyMemberForm);
    const [memberPhoto, setMemberPhoto] = useState(null);
    const [savingMember, setSavingMember] = useState(false);

    const fetchRecruitments = useCallback(async () => {
        try {
            const res = await axios.get(`${API}/pda-admin/recruitments`, { headers: getAuthHeader() });
            setRecruitments(res.data || []);
            const initial = {};
            (res.data || []).forEach((recruit) => {
                initial[recruit.id] = {
                    team: recruit.preferred_team || '',
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
        try {
            const payload = selectedRecruitments.map((id) => ({
                id,
                team: assignments[id]?.team || null,
                designation: assignments[id]?.designation || null
            }));
            await axios.post(`${API}/pda-admin/recruitments/approve`, payload, { headers: getAuthHeader() });
            setSelectedRecruitments([]);
            fetchRecruitments();
        } catch (error) {
            console.error('Failed to approve recruitments:', error);
        }
    };

    const handleMemberChange = (e) => {
        const { name, value } = e.target;
        setMemberForm((prev) => ({ ...prev, [name]: value }));
    };

    const submitMember = async (e) => {
        e.preventDefault();
        setSavingMember(true);
        try {
            let photoUrl = memberForm.photo_url.trim() || null;
            if (memberPhoto) {
                const processed = await compressImageToWebp(memberPhoto);
                photoUrl = await uploadTeamImage(processed, getAuthHeader);
            }
            const payload = {
                name: memberForm.name.trim(),
                regno: memberForm.regno.trim(),
                email: memberForm.email.trim() || null,
                phno: memberForm.phno.trim() || null,
                dept: memberForm.dept.trim() || null,
                team: memberForm.team || null,
                designation: memberForm.designation || 'Member',
                photo_url: photoUrl
            };
            await axios.post(`${API}/pda-admin/team`, payload, { headers: getAuthHeader() });
            setMemberForm(emptyMemberForm);
            setMemberPhoto(null);
            fetchRecruitments();
        } catch (error) {
            console.error('Failed to add team member:', error);
        } finally {
            setSavingMember(false);
        }
    };

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
            <section className="mb-6 rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-xs uppercase tracking-[0.4em] text-slate-400">Team</p>
                        <h2 className="text-2xl font-heading font-black">Add Team Member</h2>
                    </div>
                </div>
                <form onSubmit={submitMember} className="mt-6 grid gap-4 md:grid-cols-2">
                    <div>
                        <Label>Name</Label>
                        <Input name="name" value={memberForm.name} onChange={handleMemberChange} required />
                    </div>
                    <div>
                        <Label>Register Number</Label>
                        <Input name="regno" value={memberForm.regno} onChange={handleMemberChange} required />
                    </div>
                    <div>
                        <Label>Email</Label>
                        <Input name="email" type="email" value={memberForm.email} onChange={handleMemberChange} />
                    </div>
                    <div>
                        <Label>Phone</Label>
                        <Input name="phno" value={memberForm.phno} onChange={handleMemberChange} />
                    </div>
                    <div>
                        <Label>Department</Label>
                        <Input name="dept" value={memberForm.dept} onChange={handleMemberChange} />
                    </div>
                    <div>
                        <Label>Team</Label>
                        <Select
                            value={memberForm.team}
                            onValueChange={(value) => {
                                setMemberForm((prev) => {
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
                        <Label>Designation</Label>
                        <Select
                            value={memberForm.designation}
                            onValueChange={(value) => setMemberForm((prev) => ({ ...prev, designation: value }))}
                        >
                            <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select designation" />
                            </SelectTrigger>
                            <SelectContent>
                                {getDesignationOptions(memberForm.team).map((designation) => (
                                    <SelectItem key={designation} value={designation}>{designation}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div>
                        <Label>Photo URL (optional)</Label>
                        <Input name="photo_url" value={memberForm.photo_url} onChange={handleMemberChange} placeholder="https://..." />
                    </div>
                    <div>
                        <Label>Or Upload Photo</Label>
                        <Input type="file" accept="image/*" onChange={(e) => setMemberPhoto(e.target.files?.[0] || null)} />
                    </div>
                    <div className="md:col-span-2 flex flex-col gap-3 sm:flex-row sm:justify-end">
                        <Button type="submit" className="bg-[#11131a] text-white hover:bg-[#1f2330]" disabled={savingMember}>
                            {savingMember ? 'Saving...' : 'Add Member'}
                        </Button>
                    </div>
                </form>
            </section>
            <section className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <p className="text-xs uppercase tracking-[0.4em] text-slate-400">Recruitments</p>
                        <h2 className="text-2xl font-heading font-black">Pending Applications</h2>
                    </div>
                    <Button onClick={approveRecruitments} className="bg-[#f6c347] text-black hover:bg-[#ffd16b]">
                        Approve Selected
                    </Button>
                </div>
                <div className="mt-6 space-y-3">
                    {recruitments.map((recruit) => (
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
                                        {recruit.email} · {recruit.phno || 'No phone'} · DOB: {recruit.dob || 'N/A'}
                                    </p>
                                    <p className="text-xs text-slate-500">
                                        Preferred: {recruit.preferred_team || 'N/A'} · Dept: {recruit.dept || 'N/A'}
                                    </p>
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
                    {recruitments.length === 0 && (
                        <div className="text-sm text-slate-500">No pending applications.</div>
                    )}
                </div>
            </section>
        </AdminLayout>
    );
}
