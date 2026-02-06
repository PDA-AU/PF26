import React, { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import axios from 'axios';
import { toast } from 'sonner';
import PdaHeader from '@/components/layout/PdaHeader';
import { compressImageToWebp } from '@/utils/imageCompression';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

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

export default function PdaProfile() {
    const { user, getAuthHeader, updateUser } = useAuth();
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        dob: '',
        gender: '',
        phno: '',
        dept: ''
    });
    const [passwordData, setPasswordData] = useState({
        oldPassword: '',
        newPassword: '',
        confirmPassword: ''
    });
    const [saving, setSaving] = useState(false);
    const [changingPassword, setChangingPassword] = useState(false);
    const [imageFile, setImageFile] = useState(null);
    const [isEditing, setIsEditing] = useState(false);

    const getErrorMessage = (error, fallback) => {
        const detail = error?.response?.data?.detail;
        if (Array.isArray(detail)) {
            return detail.map((item) => item?.msg || item?.detail || JSON.stringify(item)).join(', ');
        }
        if (detail && typeof detail === 'object') {
            return detail.msg || detail.detail || JSON.stringify(detail);
        }
        return detail || fallback;
    };

    useEffect(() => {
        if (user) {
            setFormData({
                name: user.name || '',
                email: user.email || '',
                dob: user.dob || '',
                gender: user.gender || '',
                phno: user.phno || '',
                dept: user.dept || ''
            });
        }
    }, [user]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handlePasswordChange = (e) => {
        const { name, value } = e.target;
        setPasswordData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            const response = await axios.put(`${API}/me`, formData, { headers: getAuthHeader() });
            let updatedUser = response.data;
            if (imageFile) {
                const processed = await compressImageToWebp(imageFile);
                const presignRes = await axios.post(`${API}/me/profile-picture/presign`, {
                    filename: processed.name,
                    content_type: processed.type
                }, { headers: getAuthHeader() });
                const { upload_url, public_url, content_type } = presignRes.data || {};
                await axios.put(upload_url, processed, { headers: { 'Content-Type': content_type || processed.type } });
                const confirmRes = await axios.post(`${API}/me/profile-picture/confirm`, { image_url: public_url }, { headers: getAuthHeader() });
                updatedUser = confirmRes.data;
            }
            updateUser(updatedUser);
            toast.success('Profile updated');
            setIsEditing(false);
            setImageFile(null);
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to update profile'));
        } finally {
            setSaving(false);
        }
    };

    const handleChangePassword = async (e) => {
        e.preventDefault();
        if (!passwordData.oldPassword || !passwordData.newPassword || !passwordData.confirmPassword) {
            toast.error('Please fill in all password fields');
            return;
        }
        if (passwordData.newPassword !== passwordData.confirmPassword) {
            toast.error('New password and confirm password do not match');
            return;
        }
        setChangingPassword(true);
        try {
            await axios.post(`${API}/me/change-password`, {
                old_password: passwordData.oldPassword,
                new_password: passwordData.newPassword,
                confirm_password: passwordData.confirmPassword
            }, { headers: getAuthHeader() });
            toast.success('Password updated');
            setPasswordData({ oldPassword: '', newPassword: '', confirmPassword: '' });
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to change password'));
        } finally {
            setChangingPassword(false);
        }
    };

    if (!user) return null;

    return (
        <div className="min-h-screen bg-[#f7f5f0] flex flex-col">
            <PdaHeader />
            <div className="mx-auto w-full max-w-4xl px-5 py-10 flex-1">
                <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <h1 className="text-3xl font-heading font-black">My PDA Profile</h1>
                            <p className="mt-2 text-sm text-slate-600">View and update your profile details.</p>
                        </div>
                        <div className="flex items-center gap-3">
                            {user.image_url ? (
                                <img
                                    src={user.image_url}
                                    alt={user.name}
                                    className="h-24 w-24 rounded-3xl border border-black/10 object-cover"
                                />
                            ) : (
                                <div className="flex h-24 w-24 items-center justify-center rounded-3xl border border-black/10 bg-slate-50 text-lg font-semibold text-slate-600">
                                    {user.name ? user.name.split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase() : 'PD'}
                                </div>
                            )}
                            <div className="text-sm text-slate-600">
                                <p className="font-semibold text-slate-800">{user.name || 'PDA Member'}</p>
                                <p>{user.regno}</p>
                            </div>
                        </div>
                    </div>

                    <form onSubmit={handleSubmit} className="mt-6 grid gap-4 md:grid-cols-2">
                        <div>
                            <Label>Register Number</Label>
                            <Input value={user.regno || ''} readOnly className="bg-slate-50" />
                        </div>
                        <div>
                            <Label>Name</Label>
                            <Input name="name" value={formData.name} onChange={handleChange} disabled={!isEditing} />
                        </div>
                        <div>
                            <Label>Email</Label>
                            <Input name="email" value={formData.email} onChange={handleChange} disabled={!isEditing} />
                        </div>
                        <div>
                            <Label>Date of Birth</Label>
                            <Input name="dob" type="date" value={formData.dob} onChange={handleChange} disabled={!isEditing} />
                        </div>
                        <div>
                            <Label>Gender</Label>
                            <Select value={formData.gender} onValueChange={(value) => setFormData(prev => ({ ...prev, gender: value }))} disabled={!isEditing}>
                                <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Select gender" />
                                </SelectTrigger>
                                <SelectContent>
                                    {GENDERS.map(gender => (
                                        <SelectItem key={gender.value} value={gender.value}>{gender.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label>Phone</Label>
                            <Input name="phno" value={formData.phno} onChange={handleChange} disabled={!isEditing} />
                        </div>
                        <div>
                            <Label>Department</Label>
                            <Select value={formData.dept} onValueChange={(value) => setFormData(prev => ({ ...prev, dept: value }))} disabled={!isEditing}>
                                <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Select department" />
                                </SelectTrigger>
                                <SelectContent>
                                    {DEPARTMENTS.map(dept => (
                                        <SelectItem key={dept.value} value={dept.value}>{dept.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label>Membership Status</Label>
                            <Input value={user.is_member ? 'Member' : 'Applicant'} readOnly className="bg-slate-50" />
                        </div>
                        <div>
                            <Label>Team</Label>
                            <Input value={user.team || 'Not assigned'} readOnly className="bg-slate-50" />
                        </div>
                        <div>
                            <Label>Designation</Label>
                            <Input value={user.designation || 'Not assigned'} readOnly className="bg-slate-50" />
                        </div>
                        <div className="md:col-span-2">
                            <Label>Change Profile Picture</Label>
                            <Input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setImageFile(e.target.files?.[0] || null)} disabled={!isEditing} />
                            <p className="mt-2 text-xs text-slate-500">Upload a new image to replace the current one.</p>
                        </div>
                        <div className="md:col-span-2 flex justify-end gap-3">
                            {isEditing ? (
                                <>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => {
                                            setIsEditing(false);
                                            setImageFile(null);
                                            if (user) {
                                                setFormData({
                                                    name: user.name || '',
                                                    email: user.email || '',
                                                    dob: user.dob || '',
                                                    phno: user.phno || '',
                                                    dept: user.dept || ''
                                                });
                                            }
                                        }}
                                        disabled={saving}
                                    >
                                        Cancel
                                    </Button>
                                    <Button type="submit" disabled={saving} className="bg-[#f6c347] text-black hover:bg-[#ffd16b]">
                                        {saving ? 'Saving...' : 'Save Changes'}
                                    </Button>
                                </>
                            ) : (
                                <Button type="button" onClick={() => setIsEditing(true)} className="bg-[#11131a] text-white hover:bg-[#1f2330]">
                                    Edit Profile
                                </Button>
                            )}
                        </div>
                    </form>

                    {!user.is_member && user.preferred_team ? (
                        <div className="mt-6 rounded-2xl border border-black/10 bg-white p-4 text-sm text-slate-600">
                            Preferred Team: <span className="font-semibold">{user.preferred_team}</span>
                        </div>
                    ) : null}

                    {isEditing ? (
                        <form onSubmit={handleChangePassword} className="mt-6 rounded-2xl border border-black/10 bg-white p-4">
                            <h2 className="text-lg font-semibold text-slate-900">Change Password</h2>
                            <p className="mt-1 text-xs text-slate-500">Use your old password to set a new one.</p>
                            <div className="mt-4 grid gap-4 md:grid-cols-3">
                                <div>
                                    <Label>Old Password</Label>
                                    <Input
                                        name="oldPassword"
                                        type="password"
                                        value={passwordData.oldPassword}
                                        onChange={handlePasswordChange}
                                    />
                                </div>
                                <div>
                                    <Label>New Password</Label>
                                    <Input
                                        name="newPassword"
                                        type="password"
                                        value={passwordData.newPassword}
                                        onChange={handlePasswordChange}
                                    />
                                </div>
                                <div>
                                    <Label>Confirm Password</Label>
                                    <Input
                                        name="confirmPassword"
                                        type="password"
                                        value={passwordData.confirmPassword}
                                        onChange={handlePasswordChange}
                                    />
                                </div>
                            </div>
                            <div className="mt-4 flex justify-end">
                                <Button type="submit" disabled={changingPassword} className="bg-[#11131a] text-white hover:bg-[#1f2330]">
                                    {changingPassword ? 'Updating...' : 'Update Password'}
                                </Button>
                            </div>
                        </form>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
