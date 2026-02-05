import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/context/AuthContext';
import AdminLayout from '@/pages/HomeAdmin/AdminLayout';
import { API, uploadTeamImage } from '@/pages/HomeAdmin/adminApi';

const emptyTeamMember = {
    name: '',
    regno: '',
    dept: '',
    email: '',
    phno: '',
    team_designation: '',
    photo_url: '',
    instagram_url: '',
    linkedin_url: ''
};

export default function TeamAdmin() {
    const { isAdmin, getAuthHeader } = useAuth();
    const [teamMembers, setTeamMembers] = useState([]);
    const [teamForm, setTeamForm] = useState(emptyTeamMember);
    const [teamPhotoFile, setTeamPhotoFile] = useState(null);
    const [editingTeamId, setEditingTeamId] = useState(null);
    const [savingTeam, setSavingTeam] = useState(false);
    const [loading, setLoading] = useState(true);

    const fetchData = async () => {
        try {
            const teamRes = await axios.get(`${API}/pda/team`);
            setTeamMembers(teamRes.data || []);
        } catch (error) {
            console.error('Failed to load team members:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isAdmin) {
            fetchData();
        }
    }, [isAdmin]);

    const handleTeamChange = (e) => {
        const { name, value } = e.target;
        setTeamForm(prev => ({ ...prev, [name]: value }));
    };

    const resetTeamForm = () => {
        setTeamForm(emptyTeamMember);
        setEditingTeamId(null);
        setTeamPhotoFile(null);
    };

    const submitTeamMember = async (e) => {
        e.preventDefault();
        setSavingTeam(true);
        let photoUrl = teamForm.photo_url.trim() || null;
        if (teamPhotoFile) {
            photoUrl = await uploadTeamImage(teamPhotoFile, getAuthHeader);
        }
        const payload = {
            name: teamForm.name.trim(),
            regno: teamForm.regno.trim(),
            dept: teamForm.dept.trim() || null,
            email: teamForm.email.trim() || null,
            phno: teamForm.phno.trim() || null,
            team_designation: teamForm.team_designation.trim(),
            photo_url: photoUrl,
            instagram_url: teamForm.instagram_url.trim() || null,
            linkedin_url: teamForm.linkedin_url.trim() || null
        };
        try {
            if (editingTeamId) {
                await axios.put(`${API}/pda-admin/team/${editingTeamId}`, payload, { headers: getAuthHeader() });
            } else {
                await axios.post(`${API}/pda-admin/team`, payload, { headers: getAuthHeader() });
            }
            resetTeamForm();
            fetchData();
        } catch (error) {
            console.error('Failed to save team member:', error);
        } finally {
            setSavingTeam(false);
        }
    };

    const editTeamMember = (member) => {
        setTeamForm({
            name: member.name || '',
            regno: member.regno || '',
            dept: member.dept || '',
            email: member.email || '',
            phno: member.phno || '',
            team_designation: member.team_designation || '',
            photo_url: member.photo_url || '',
            instagram_url: member.instagram_url || '',
            linkedin_url: member.linkedin_url || ''
        });
        setEditingTeamId(member.id);
        setTeamPhotoFile(null);
    };

    const deleteTeamMember = async (memberId) => {
        try {
            await axios.delete(`${API}/pda-admin/team/${memberId}`, { headers: getAuthHeader() });
            fetchData();
        } catch (error) {
            console.error('Failed to delete team member:', error);
        }
    };

    return (
        <AdminLayout title="Team Management" subtitle="Manage PDA team members shown on the home page.">
            <section className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <p className="text-xs uppercase tracking-[0.4em] text-slate-400">Team</p>
                        <h2 className="text-2xl font-heading font-black">Team Management</h2>
                    </div>
                    {editingTeamId ? (
                        <Button variant="outline" onClick={resetTeamForm} className="border-black/10 text-sm">
                            Cancel Edit
                        </Button>
                    ) : null}
                </div>

                <form onSubmit={submitTeamMember} className="mt-6 grid gap-4 md:grid-cols-2">
                    <div>
                        <Label htmlFor="team-name">Name</Label>
                        <Input
                            id="team-name"
                            name="name"
                            value={teamForm.name}
                            onChange={handleTeamChange}
                            placeholder="Full name"
                            required
                        />
                    </div>
                    <div>
                        <Label htmlFor="team-regno">Register Number</Label>
                        <Input
                            id="team-regno"
                            name="regno"
                            value={teamForm.regno}
                            onChange={handleTeamChange}
                            placeholder="2022..."
                            required
                        />
                    </div>
                    <div>
                        <Label htmlFor="team-dept">Department</Label>
                        <Input
                            id="team-dept"
                            name="dept"
                            value={teamForm.dept}
                            onChange={handleTeamChange}
                            placeholder="Instrumentation Engineering"
                        />
                    </div>
                    <div>
                        <Label htmlFor="team-email">Email</Label>
                        <Input
                            id="team-email"
                            name="email"
                            value={teamForm.email}
                            onChange={handleTeamChange}
                            placeholder="name@mitindia.edu"
                        />
                    </div>
                    <div>
                        <Label htmlFor="team-phno">Phone</Label>
                        <Input
                            id="team-phno"
                            name="phno"
                            value={teamForm.phno}
                            onChange={handleTeamChange}
                            placeholder="9xxxxxxxxx"
                        />
                    </div>
                    <div>
                        <Label htmlFor="team-designation">Designation</Label>
                        <Input
                            id="team-designation"
                            name="team_designation"
                            value={teamForm.team_designation}
                            onChange={handleTeamChange}
                            placeholder="Chairperson"
                            required
                        />
                    </div>
                    <div className="md:col-span-2">
                        <Label htmlFor="team-photo-url">Photo URL</Label>
                        <Input
                            id="team-photo-url"
                            name="photo_url"
                            value={teamForm.photo_url}
                            onChange={handleTeamChange}
                            placeholder="https://..."
                        />
                    </div>
                    <div className="md:col-span-2">
                        <Label htmlFor="team-photo-file">Or Upload Photo</Label>
                        <Input
                            id="team-photo-file"
                            name="team_photo_file"
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            onChange={(e) => setTeamPhotoFile(e.target.files?.[0] || null)}
                        />
                    </div>
                    <div>
                        <Label htmlFor="team-instagram">Instagram URL</Label>
                        <Input
                            id="team-instagram"
                            name="instagram_url"
                            value={teamForm.instagram_url}
                            onChange={handleTeamChange}
                            placeholder="https://instagram.com/..."
                        />
                    </div>
                    <div>
                        <Label htmlFor="team-linkedin">LinkedIn URL</Label>
                        <Input
                            id="team-linkedin"
                            name="linkedin_url"
                            value={teamForm.linkedin_url}
                            onChange={handleTeamChange}
                            placeholder="https://linkedin.com/..."
                        />
                    </div>
                    <div className="md:col-span-2 flex justify-end">
                        <Button type="submit" className="bg-[#f6c347] text-black hover:bg-[#ffd16b]" disabled={savingTeam}>
                            {savingTeam ? 'Saving...' : editingTeamId ? 'Update Member' : 'Add Member'}
                        </Button>
                    </div>
                </form>

                <div className="mt-8 grid gap-4 md:grid-cols-2">
                    {teamMembers.length ? teamMembers.map((member) => (
                        <div key={member.id} className="rounded-2xl border border-black/10 bg-[#fffdf7] p-4">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <h3 className="text-lg font-heading font-bold">{member.name}</h3>
                                    <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                                        {member.team_designation}
                                    </p>
                                    <p className="text-xs text-slate-500">{member.regno}</p>
                                </div>
                                <div className="flex gap-2">
                                    <Button variant="outline" onClick={() => editTeamMember(member)} className="border-black/10 text-xs">
                                        Edit
                                    </Button>
                                    <Button variant="outline" onClick={() => deleteTeamMember(member.id)} className="border-black/10 text-xs">
                                        Delete
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )) : (
                        <div className="rounded-2xl border border-black/10 bg-[#fffdf7] p-4 text-sm text-slate-500">
                            No team members yet.
                        </div>
                    )}
                </div>
                {loading ? (
                    <div className="mt-6 rounded-2xl border border-black/10 bg-white p-6 text-center text-sm text-slate-600">
                        Loading team members...
                    </div>
                ) : null}
            </section>
        </AdminLayout>
    );
}
