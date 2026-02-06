import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useParticipantAuth } from '@/context/ParticipantAuthContext';
import axios from 'axios';
import { toast } from 'sonner';
import { 
    User, Copy, Check, Edit2, Save, X, LogOut, Sparkles, 
    Upload, Calendar, Trophy, CheckCircle, XCircle, Clock
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { compressImageToWebp } from '@/utils/imageCompression';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function ParticipantDashboard() {
    const navigate = useNavigate();
    const { user, logout, updateUser, getAuthHeader } = useParticipantAuth();
    const [roundStatuses, setRoundStatuses] = useState([]);
    const [editing, setEditing] = useState(false);
    const [copied, setCopied] = useState(false);
    const [loading, setLoading] = useState(false);
    const [editData, setEditData] = useState({
        name: user?.name || '',
        phone: user?.phone || '',
        email: user?.email || ''
    });

    const fetchRoundStatuses = useCallback(async () => {
        try {
            const response = await axios.get(`${API}/participant/me/rounds`, {
                headers: getAuthHeader()
            });
            setRoundStatuses(response.data);
        } catch (error) {
            console.error('Failed to fetch round statuses:', error);
        }
    }, [getAuthHeader]);

    useEffect(() => {
        if (user) {
            fetchRoundStatuses();
            setEditData({
                name: user.name,
                phone: user.phone,
                email: user.email
            });
        }
    }, [fetchRoundStatuses, user]);

    const handleCopyReferral = () => {
        navigator.clipboard.writeText(user.referral_code);
        setCopied(true);
        toast.success('Referral code copied!');
        setTimeout(() => setCopied(false), 2000);
    };

    const handleEditChange = (e) => {
        setEditData(prev => ({
            ...prev,
            [e.target.name]: e.target.value
        }));
    };

    const handleSaveProfile = async () => {
        setLoading(true);
        try {
            const response = await axios.put(`${API}/participant/me`, editData, {
                headers: getAuthHeader()
            });
            updateUser(response.data);
            setEditing(false);
            toast.success('Profile updated successfully!');
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Failed to update profile');
        } finally {
            setLoading(false);
        }
    };

    const handleProfilePicture = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (!file.type.includes('png')) {
            toast.error('Only PNG images are allowed');
            return;
        }

        if (file.size > 2 * 1024 * 1024) {
            toast.error('File size must be less than 2MB');
            return;
        }

        try {
            const processed = await compressImageToWebp(file);
            const presignRes = await axios.post(`${API}/participant/me/profile-picture/presign`, {
                filename: processed.name,
                content_type: processed.type
            }, { headers: getAuthHeader() });
            const { upload_url, public_url, content_type } = presignRes.data || {};
            await axios.put(upload_url, processed, { headers: { 'Content-Type': content_type || processed.type } });
            const confirmRes = await axios.post(`${API}/participant/me/profile-picture/confirm`, { profile_picture: public_url }, { headers: getAuthHeader() });
            updateUser(confirmRes.data);
            toast.success('Profile picture updated!');
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Failed to upload picture');
        }
    };

    const handleLogout = () => {
        logout();
        navigate('/');
        toast.success('Logged out successfully');
    };

    const getProfileImageUrl = () => {
        if (!user.profile_picture) return undefined;
        if (user.profile_picture.startsWith('http')) return user.profile_picture;
        return `${process.env.REACT_APP_BACKEND_URL}${user.profile_picture}`;
    };

    const getStatusIcon = (status) => {
        switch (status) {
            case 'Active':
                return <CheckCircle className="w-5 h-5 text-green-500" />;
            case 'Eliminated':
            case 'Absent':
                return <XCircle className="w-5 h-5 text-red-500" />;
            default:
                return <Clock className="w-5 h-5 text-gray-400" />;
        }
    };

    const getStatusBadge = (status) => {
        const styles = {
            'Active': 'bg-green-100 text-green-800 border-green-500',
            'Eliminated': 'bg-red-100 text-red-800 border-red-500',
            'Absent': 'bg-orange-100 text-orange-800 border-orange-500',
            'Pending': 'bg-gray-100 text-gray-800 border-gray-500'
        };
        return styles[status] || styles['Pending'];
    };

    if (!user) return null;

    return (
        <div className="min-h-screen bg-muted">
            {/* Header */}
            <header className="bg-white border-b-4 border-black sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center h-16">
                        <Link to="/" className="flex items-center gap-2">
                            <div className="w-10 h-10 bg-primary border-2 border-black shadow-neo flex items-center justify-center">
                                <Sparkles className="w-6 h-6 text-white" />
                            </div>
                            <span className="font-heading font-black text-xl tracking-tight hidden sm:block">PERSOFEST'26</span>
                        </Link>

                        <div className="flex items-center gap-4">
                            <div className="hidden md:block text-right">
                                <p className="font-bold">{user.name}</p>
                                <p className="text-sm text-gray-500">{user.register_number}</p>
                            </div>
                            <Button
                                variant="outline"
                                onClick={handleLogout}
                                className="border-2 border-black shadow-neo hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all"
                                data-testid="logout-btn"
                            >
                                <LogOut className="w-5 h-5" />
                                <span className="ml-2 hidden sm:inline">Logout</span>
                            </Button>
                        </div>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Status Banner */}
                <div className={`neo-card mb-8 ${user.status === 'Eliminated' ? 'bg-red-50 border-red-500' : 'bg-green-50 border-green-500'}`}>
                    <div className="flex items-center gap-4">
                        {user.status === 'Eliminated' ? (
                            <XCircle className="w-10 h-10 text-red-500" />
                        ) : (
                            <CheckCircle className="w-10 h-10 text-green-500" />
                        )}
                        <div>
                            <h2 className="font-heading font-bold text-xl">
                                Status: {user.status}
                            </h2>
                            <p className="text-gray-600">
                                {user.status === 'Eliminated' 
                                    ? 'Better luck next time! Thanks for participating.' 
                                    : 'You are still in the competition. Keep going!'}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="grid lg:grid-cols-3 gap-8">
                    {/* Profile Card */}
                    <div className="lg:col-span-1">
                        <div className="neo-card">
                            <div className="text-center mb-6">
                                <div className="relative inline-block">
                                    <Avatar className="w-24 h-24 border-4 border-black">
                                        <AvatarImage src={getProfileImageUrl()} />
                                        <AvatarFallback className="bg-primary text-white text-2xl font-bold">
                                            {user.name.charAt(0).toUpperCase()}
                                        </AvatarFallback>
                                    </Avatar>
                                    <label className="absolute bottom-0 right-0 w-8 h-8 bg-accent border-2 border-black cursor-pointer flex items-center justify-center hover:bg-yellow-400 transition-colors">
                                        <Upload className="w-4 h-4" />
                                        <input
                                            type="file"
                                            accept="image/png"
                                            className="hidden"
                                            onChange={handleProfilePicture}
                                            data-testid="profile-picture-input"
                                        />
                                    </label>
                                </div>
                                <h2 className="font-heading font-bold text-xl mt-4">{user.name}</h2>
                                <p className="text-gray-600">{user.department}</p>
                            </div>

                            {/* Referral Code */}
                            <div className="bg-secondary border-2 border-black p-4 mb-6">
                                <Label className="font-bold text-sm uppercase tracking-wider">Your Referral Code</Label>
                                <div className="flex items-center gap-2 mt-2">
                                    <div className="flex-1 bg-white border-2 border-black px-4 py-2 font-mono text-xl font-bold tracking-widest text-center">
                                        {user.referral_code}
                                    </div>
                                    <Button
                                        onClick={handleCopyReferral}
                                        className="bg-primary text-white border-2 border-black shadow-neo hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all px-3"
                                        data-testid="copy-referral-btn"
                                    >
                                        {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                                    </Button>
                                </div>
                                <p className="text-sm mt-2 text-gray-700">
                                    <Trophy className="w-4 h-4 inline mr-1" />
                                    <strong>{user.referral_count}</strong> referrals
                                </p>
                            </div>

                            {/* Profile Details */}
                            {editing ? (
                                <div className="space-y-4">
                                    <div>
                                        <Label className="font-bold">Name</Label>
                                        <Input
                                            name="name"
                                            value={editData.name}
                                            onChange={handleEditChange}
                                            className="neo-input mt-1"
                                        />
                                    </div>
                                    <div>
                                        <Label className="font-bold">Email</Label>
                                        <Input
                                            name="email"
                                            type="email"
                                            value={editData.email}
                                            onChange={handleEditChange}
                                            className="neo-input mt-1"
                                        />
                                    </div>
                                    <div>
                                        <Label className="font-bold">Phone</Label>
                                        <Input
                                            name="phone"
                                            value={editData.phone}
                                            onChange={handleEditChange}
                                            className="neo-input mt-1"
                                        />
                                    </div>
                                    <div className="flex gap-2">
                                        <Button
                                            onClick={handleSaveProfile}
                                            disabled={loading}
                                            className="flex-1 bg-primary text-white border-2 border-black shadow-neo hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none"
                                            data-testid="save-profile-btn"
                                        >
                                            <Save className="w-4 h-4 mr-2" /> Save
                                        </Button>
                                        <Button
                                            onClick={() => setEditing(false)}
                                            variant="outline"
                                            className="border-2 border-black shadow-neo hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none"
                                        >
                                            <X className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <div className="flex justify-between">
                                        <span className="text-gray-600">Register No:</span>
                                        <span className="font-bold">{user.register_number}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-600">Email:</span>
                                        <span className="font-bold truncate max-w-[150px]">{user.email}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-600">Phone:</span>
                                        <span className="font-bold">{user.phone}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-600">Gender:</span>
                                        <span className="font-bold">{user.gender}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-600">Year:</span>
                                        <span className="font-bold">{user.year_of_study}</span>
                                    </div>
                                    <Button
                                        onClick={() => setEditing(true)}
                                        variant="outline"
                                        className="w-full mt-4 border-2 border-black shadow-neo hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none"
                                        data-testid="edit-profile-btn"
                                    >
                                        <Edit2 className="w-4 h-4 mr-2" /> Edit Profile
                                    </Button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Round Status */}
                    <div className="lg:col-span-2">
                        <div className="neo-card">
                            <h2 className="font-heading font-bold text-2xl mb-6 flex items-center gap-2">
                                <Calendar className="w-6 h-6" />
                                Your Round Status
                            </h2>

                            {roundStatuses.length > 0 ? (
                                <div className="space-y-4">
                                    {roundStatuses.map((round, index) => (
                                        <div 
                                            key={index}
                                            className="flex items-center justify-between p-4 bg-muted border-2 border-black hover:bg-secondary transition-colors"
                                            data-testid={`round-status-${round.round_no}`}
                                        >
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 bg-primary text-white border-2 border-black flex items-center justify-center font-bold">
                                                    {round.round_no.slice(-2)}
                                                </div>
                                                <div>
                                                    <h3 className="font-bold">{round.round_name}</h3>
                                                    <p className="text-sm text-gray-600">{round.round_no}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                {getStatusIcon(round.status)}
                                                <span className={`tag border-2 ${getStatusBadge(round.status)}`}>
                                                    {round.status}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-12">
                                    <Clock className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                                    <h3 className="font-heading font-bold text-xl mb-2">No Rounds Yet</h3>
                                    <p className="text-gray-600">
                                        Competition rounds haven't started yet. Check back later!
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
