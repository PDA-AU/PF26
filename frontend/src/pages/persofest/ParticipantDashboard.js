import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { Calendar, CheckCircle, Clock, Copy, Edit2, Save, Trophy, Upload, User, X, XCircle } from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { compressImageToWebp } from '@/utils/imageCompression';
import PersofestHeader from '@/components/layout/PersofestHeader';
import PersofestFooter from '@/components/layout/PersofestFooter';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const PERSOFEST_SLUG = 'persofest-2026';

export default function ParticipantDashboard() {
    const navigate = useNavigate();
    const { user, logout, updateUser, getAuthHeader } = useAuth();
    const [eventProfile, setEventProfile] = useState(null);
    const [roundStatuses, setRoundStatuses] = useState([]);
    const [editing, setEditing] = useState(false);
    const [copied, setCopied] = useState(false);
    const [loading, setLoading] = useState(false);
    const [sendingVerification, setSendingVerification] = useState(false);
    const [editData, setEditData] = useState({
        name: '',
        phno: '',
        email: '',
    });

    const refreshEventProfile = useCallback(async () => {
        const response = await axios.get(`${API}/pda/events/${PERSOFEST_SLUG}/me`, { headers: getAuthHeader() });
        setEventProfile(response.data);
    }, [getAuthHeader]);

    const refreshRoundStatuses = useCallback(async () => {
        const response = await axios.get(`${API}/pda/events/${PERSOFEST_SLUG}/my-rounds`, { headers: getAuthHeader() });
        setRoundStatuses(response.data || []);
    }, [getAuthHeader]);

    useEffect(() => {
        if (!user) return;
        setEditData({
            name: user.name || '',
            phno: user.phno || '',
            email: user.email || '',
        });
        refreshEventProfile().catch(() => {
            toast.error('Please register for Persofest to view the dashboard.');
            navigate(`/event/${PERSOFEST_SLUG}`);
        });
        refreshRoundStatuses().catch(() => undefined);
    }, [user, navigate, refreshEventProfile, refreshRoundStatuses]);

    const status = useMemo(() => String(eventProfile?.status || 'Active'), [eventProfile]);

    const handleCopyReferral = () => {
        if (!eventProfile?.referral_code) return;
        navigator.clipboard.writeText(eventProfile.referral_code);
        setCopied(true);
        toast.success('Referral code copied');
        setTimeout(() => setCopied(false), 1800);
    };

    const handleSaveProfile = async () => {
        setLoading(true);
        try {
            const response = await axios.put(`${API}/me`, {
                name: editData.name,
                phno: editData.phno,
                email: editData.email,
            }, { headers: getAuthHeader() });
            updateUser(response.data);
            setEditing(false);
            toast.success('Profile updated');
        } catch (error) {
            toast.error(error?.response?.data?.detail || 'Failed to update profile');
        } finally {
            setLoading(false);
        }
    };

    const handleProfilePicture = async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        try {
            const processed = await compressImageToWebp(file);
            const presignRes = await axios.post(`${API}/me/profile-picture/presign`, {
                filename: processed.name,
                content_type: processed.type,
            }, { headers: getAuthHeader() });
            const { upload_url, public_url, content_type } = presignRes.data || {};
            await axios.put(upload_url, processed, { headers: { 'Content-Type': content_type || processed.type } });
            const confirmRes = await axios.post(`${API}/me/profile-picture/confirm`, { image_url: public_url }, { headers: getAuthHeader() });
            updateUser(confirmRes.data);
            await refreshEventProfile();
            toast.success('Profile picture updated');
        } catch (error) {
            toast.error(error?.response?.data?.detail || 'Failed to upload profile picture');
        }
    };

    const handleResendVerification = async () => {
        setSendingVerification(true);
        try {
            await axios.post(`${API}/auth/email/send-verification`, {}, { headers: getAuthHeader() });
            toast.success('Verification email sent');
        } catch (error) {
            toast.error(error?.response?.data?.detail || 'Failed to send verification email');
        } finally {
            setSendingVerification(false);
        }
    };

    const handleLogout = () => {
        logout();
        navigate('/');
    };

    const getProfileImageUrl = () => {
        if (!user?.image_url) return undefined;
        if (String(user.image_url).startsWith('http')) return user.image_url;
        return `${process.env.REACT_APP_BACKEND_URL}${user.image_url}`;
    };

    const getStatusIcon = (value) => {
        if (value === 'Active') return <CheckCircle className="w-5 h-5 text-green-500" />;
        if (value === 'Eliminated' || value === 'Absent') return <XCircle className="w-5 h-5 text-red-500" />;
        return <Clock className="w-5 h-5 text-gray-400" />;
    };

    if (!user) return null;

    return (
        <div className="min-h-screen bg-muted flex flex-col">
            <PersofestHeader />
            <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
                {!user.email_verified ? (
                    <div className="neo-card mb-6 bg-yellow-50 border-yellow-500">
                        <div className="flex items-center justify-between gap-4">
                            <div>
                                <h2 className="font-heading font-bold text-lg">Email not verified</h2>
                                <p className="text-gray-600 text-sm">Please verify your email to continue.</p>
                            </div>
                            <Button onClick={handleResendVerification} disabled={sendingVerification} className="border-2 border-black shadow-neo bg-primary text-white">
                                {sendingVerification ? 'Sending...' : 'Resend'}
                            </Button>
                        </div>
                    </div>
                ) : null}

                <div className={`neo-card mb-8 ${status === 'Eliminated' ? 'bg-red-50 border-red-500' : 'bg-green-50 border-green-500'}`}>
                    <div className="flex items-center gap-4">
                        {status === 'Eliminated' ? <XCircle className="w-10 h-10 text-red-500" /> : <CheckCircle className="w-10 h-10 text-green-500" />}
                        <div>
                            <h2 className="font-heading font-bold text-xl">Status: {status}</h2>
                            <p className="text-gray-600">{status === 'Eliminated' ? 'You have been eliminated from the event.' : 'You are active in the competition.'}</p>
                        </div>
                    </div>
                </div>

                <div className="grid lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-1">
                        <div className="neo-card">
                            <div className="text-center mb-6">
                                <div className="relative inline-block">
                                    <Avatar className="w-24 h-24 border-4 border-black">
                                        <AvatarImage src={getProfileImageUrl()} />
                                        <AvatarFallback className="bg-primary text-white text-2xl font-bold">
                                            {(user.name || 'U').charAt(0).toUpperCase()}
                                        </AvatarFallback>
                                    </Avatar>
                                    <label className="absolute bottom-0 right-0 w-8 h-8 bg-accent border-2 border-black cursor-pointer flex items-center justify-center">
                                        <Upload className="w-4 h-4" />
                                        <input type="file" className="hidden" onChange={handleProfilePicture} />
                                    </label>
                                </div>
                                <h2 className="font-heading font-bold text-xl mt-4">{user.name}</h2>
                                <p className="text-gray-600">{eventProfile?.department || user.dept || '-'}</p>
                            </div>

                            <div className="bg-secondary border-2 border-black p-4 mb-6">
                                <Label className="font-bold text-sm uppercase tracking-wider">Referral Code</Label>
                                <div className="flex items-center gap-2 mt-2">
                                    <div className="flex-1 bg-white border-2 border-black px-4 py-2 font-mono text-xl font-bold tracking-widest text-center">
                                        {eventProfile?.referral_code || '-----'}
                                    </div>
                                    <Button onClick={handleCopyReferral} className="bg-primary text-white border-2 border-black shadow-neo px-3">
                                        {copied ? <CheckCircle className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                                    </Button>
                                </div>
                                <p className="text-sm mt-2 text-gray-700"><Trophy className="w-4 h-4 inline mr-1" /><strong>{eventProfile?.referral_count || 0}</strong> referrals</p>
                            </div>

                            {editing ? (
                                <div className="space-y-4">
                                    <div>
                                        <Label className="font-bold">Name</Label>
                                        <Input value={editData.name} onChange={(e) => setEditData((prev) => ({ ...prev, name: e.target.value }))} className="neo-input mt-1" />
                                    </div>
                                    <div>
                                        <Label className="font-bold">Email</Label>
                                        <Input type="email" value={editData.email} onChange={(e) => setEditData((prev) => ({ ...prev, email: e.target.value }))} className="neo-input mt-1" />
                                    </div>
                                    <div>
                                        <Label className="font-bold">Phone</Label>
                                        <Input value={editData.phno} onChange={(e) => setEditData((prev) => ({ ...prev, phno: e.target.value }))} className="neo-input mt-1" />
                                    </div>
                                    <div className="flex gap-2">
                                        <Button onClick={handleSaveProfile} disabled={loading} className="flex-1 bg-primary text-white border-2 border-black shadow-neo">
                                            <Save className="w-4 h-4 mr-2" /> Save
                                        </Button>
                                        <Button variant="outline" onClick={() => setEditing(false)} className="border-2 border-black shadow-neo">
                                            <X className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <div className="flex justify-between"><span className="text-gray-600">Register No:</span><span className="font-bold">{user.regno}</span></div>
                                    <div className="flex justify-between"><span className="text-gray-600">Email:</span><span className="font-bold truncate max-w-[150px]">{user.email}</span></div>
                                    <div className="flex justify-between"><span className="text-gray-600">Phone:</span><span className="font-bold">{user.phno || '-'}</span></div>
                                    <div className="flex justify-between"><span className="text-gray-600">Gender:</span><span className="font-bold">{eventProfile?.gender || user.gender || '-'}</span></div>
                                    <div className="flex justify-between"><span className="text-gray-600">Batch:</span><span className="font-bold">{eventProfile?.batch || '-'}</span></div>
                                    <Button onClick={() => setEditing(true)} variant="outline" className="w-full mt-4 border-2 border-black shadow-neo">
                                        <Edit2 className="w-4 h-4 mr-2" /> Edit Profile
                                    </Button>
                                </div>
                            )}

                            <Button onClick={handleLogout} variant="outline" className="w-full mt-4 border-2 border-black shadow-neo">
                                <User className="w-4 h-4 mr-2" /> Logout
                            </Button>
                        </div>
                    </div>

                    <div className="lg:col-span-2">
                        <div className="neo-card">
                            <h2 className="font-heading font-bold text-2xl mb-6 flex items-center gap-2">
                                <Calendar className="w-6 h-6" />
                                Your Round Status
                            </h2>
                            {roundStatuses.length > 0 ? (
                                <div className="space-y-4">
                                    {roundStatuses.map((round) => (
                                        <div key={`${round.round_no}-${round.round_name}`} className="flex items-center justify-between p-4 bg-muted border-2 border-black">
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 bg-primary text-white border-2 border-black flex items-center justify-center font-bold">
                                                    {String(round.round_no || '').slice(-2)}
                                                </div>
                                                <div>
                                                    <h3 className="font-bold">{round.round_name}</h3>
                                                    <p className="text-sm text-gray-600">{round.round_no}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                {getStatusIcon(round.status)}
                                                <span className="tag border-2">{round.status}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-12">
                                    <Clock className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                                    <h3 className="font-heading font-bold text-xl mb-2">No Rounds Yet</h3>
                                    <p className="text-gray-600">Competition rounds have not started yet.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </main>
            <PersofestFooter />
        </div>
    );
}
