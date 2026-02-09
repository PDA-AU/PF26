import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Award, Download, ExternalLink, Share2 } from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import PdaHeader from '@/components/layout/PdaHeader';
import PdaFooter from '@/components/layout/PdaFooter';
import { compressImageToWebp } from '@/utils/imageCompression';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

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

const RECRUITMENT_TEAMS = [
    'Content Creation',
    'Event Management',
    'Design',
    'Website Design',
    'Public Relations',
    'Podcast',
    'Library'
];

const formatDateTime = (value) => {
    if (!value) return '-';
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return '-';
    return dt.toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
};

const sanitizeForFilename = (value) => String(value || 'certificate').replace(/[^a-zA-Z0-9-_]+/g, '_');

const wrapCanvasText = (ctx, text, x, y, maxWidth, lineHeight) => {
    const words = String(text || '').split(/\s+/);
    let line = '';
    let cursorY = y;

    words.forEach((word, idx) => {
        const testLine = line ? `${line} ${word}` : word;
        const width = ctx.measureText(testLine).width;
        if (width > maxWidth && idx > 0) {
            ctx.fillText(line, x, cursorY);
            line = word;
            cursorY += lineHeight;
        } else {
            line = testLine;
        }
    });

    if (line) {
        ctx.fillText(line, x, cursorY);
        cursorY += lineHeight;
    }

    return cursorY;
};

const downloadCertificateArtwork = ({ participantName, eventTitle, certificateText, generatedAt }) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1800;
    canvas.height = 1280;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        throw new Error('Canvas is not supported in this browser');
    }

    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, '#fff7dc');
    gradient.addColorStop(1, '#f4e5b5');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = '#11131a';
    ctx.lineWidth = 18;
    ctx.strokeRect(36, 36, canvas.width - 72, canvas.height - 72);

    ctx.strokeStyle = '#b8890b';
    ctx.lineWidth = 4;
    ctx.strokeRect(80, 80, canvas.width - 160, canvas.height - 160);

    ctx.fillStyle = '#11131a';
    ctx.textAlign = 'center';

    ctx.font = '800 46px Georgia, serif';
    ctx.fillText('PERSONALITY DEVELOPMENT ASSOCIATION', canvas.width / 2, 190);

    ctx.font = '700 26px Georgia, serif';
    ctx.fillText('Certificate of Active Participation', canvas.width / 2, 250);

    ctx.font = '500 24px Georgia, serif';
    ctx.fillText('This is proudly presented to', canvas.width / 2, 360);

    ctx.font = '800 66px Georgia, serif';
    ctx.fillStyle = '#7a5a00';
    ctx.fillText(participantName || 'PDA Participant', canvas.width / 2, 455);

    ctx.fillStyle = '#11131a';
    ctx.font = '500 30px Georgia, serif';
    const finalText = certificateText || `For actively participating in ${eventTitle || 'the event'}.`;
    wrapCanvasText(ctx, finalText, 280, 560, canvas.width - 560, 48);

    ctx.font = '700 34px Georgia, serif';
    ctx.fillText(eventTitle || 'PDA Event', canvas.width / 2, 760);

    ctx.font = '500 20px Georgia, serif';
    ctx.fillText(`Generated on ${formatDateTime(generatedAt || new Date().toISOString())}`, canvas.width / 2, 920);
    ctx.fillText('PDA MIT - Discover Thyself', canvas.width / 2, 970);

    const anchor = document.createElement('a');
    anchor.href = canvas.toDataURL('image/png');
    anchor.download = `${sanitizeForFilename(eventTitle)}_certificate.png`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
};

export default function PdaProfile() {
    const { user, getAuthHeader, updateUser } = useAuth();

    const [formData, setFormData] = useState({
        name: '',
        email: '',
        dob: '',
        gender: '',
        phno: '',
        dept: '',
        instagram_url: '',
        linkedin_url: '',
        github_url: ''
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
    const [sendingVerification, setSendingVerification] = useState(false);
    const [recruitmentOpen, setRecruitmentOpen] = useState(true);
    const [recruitmentLoading, setRecruitmentLoading] = useState(true);
    const [preferredTeam, setPreferredTeam] = useState('');
    const [applyingRecruitment, setApplyingRecruitment] = useState(false);
    const [joinDialogOpen, setJoinDialogOpen] = useState(false);

    const [myEvents, setMyEvents] = useState([]);
    const [achievements, setAchievements] = useState([]);
    const [managedLoading, setManagedLoading] = useState(false);
    const [certificateLoadingSlug, setCertificateLoadingSlug] = useState('');

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

    const resetProfileForm = useCallback(() => {
        if (!user) return;
        setFormData({
            name: user.name || '',
            email: user.email || '',
            dob: user.dob || '',
            gender: user.gender || '',
            phno: user.phno || '',
            dept: user.dept || '',
            instagram_url: user.instagram_url || '',
            linkedin_url: user.linkedin_url || '',
            github_url: user.github_url || ''
        });
        setImageFile(null);
    }, [user]);

    useEffect(() => {
        resetProfileForm();
    }, [resetProfileForm]);

    const fetchManagedData = useCallback(async () => {
        if (!user) return;
        setManagedLoading(true);
        try {
            const [eventsRes, achievementsRes] = await Promise.all([
                axios.get(`${API}/pda/me/events`, { headers: getAuthHeader() }),
                axios.get(`${API}/pda/me/achievements`, { headers: getAuthHeader() })
            ]);
            setMyEvents(eventsRes.data || []);
            setAchievements(achievementsRes.data || []);
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to load events and achievements'));
        } finally {
            setManagedLoading(false);
        }
    }, [getAuthHeader, user]);

    useEffect(() => {
        fetchManagedData();
    }, [fetchManagedData]);

    useEffect(() => {
        let active = true;
        const fetchRecruitmentStatus = async () => {
            setRecruitmentLoading(true);
            try {
                const res = await axios.get(`${API}/pda/recruitment-status`);
                if (active && typeof res.data?.recruitment_open === 'boolean') {
                    setRecruitmentOpen(res.data.recruitment_open);
                }
            } catch (error) {
                if (active) {
                    setRecruitmentOpen(false);
                }
            } finally {
                if (active) {
                    setRecruitmentLoading(false);
                }
            }
        };
        fetchRecruitmentStatus();
        return () => {
            active = false;
        };
    }, []);

    const sortedMyEvents = useMemo(() => {
        return [...myEvents].sort((a, b) => {
            const aDate = a?.event?.created_at ? new Date(a.event.created_at).getTime() : 0;
            const bDate = b?.event?.created_at ? new Date(b.event.created_at).getTime() : 0;
            return bDate - aDate;
        });
    }, [myEvents]);

    const activeEventCount = useMemo(
        () => sortedMyEvents.filter((row) => row?.event?.status === 'open').length,
        [sortedMyEvents]
    );

    const completedEventCount = useMemo(
        () => sortedMyEvents.filter((row) => row?.event?.status === 'closed').length,
        [sortedMyEvents]
    );

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const handlePasswordChange = (e) => {
        const { name, value } = e.target;
        setPasswordData((prev) => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const instagram_url = String(formData.instagram_url || '').trim();
        const linkedin_url = String(formData.linkedin_url || '').trim();
        const github_url = String(formData.github_url || '').trim();
        setSaving(true);
        try {
            const payload = {
                name: formData.name,
                email: formData.email,
                dob: formData.dob,
                gender: formData.gender,
                phno: formData.phno,
                dept: formData.dept,
                instagram_url: instagram_url || null,
                linkedin_url: linkedin_url || null,
                github_url: github_url || null
            };

            const response = await axios.put(`${API}/me`, payload, { headers: getAuthHeader() });
            let updatedUser = response.data;

            if (imageFile) {
                const processed = await compressImageToWebp(imageFile);
                const presignRes = await axios.post(
                    `${API}/me/profile-picture/presign`,
                    {
                        filename: processed.name,
                        content_type: processed.type
                    },
                    { headers: getAuthHeader() }
                );
                const { upload_url, public_url, content_type } = presignRes.data || {};
                await axios.put(upload_url, processed, {
                    headers: { 'Content-Type': content_type || processed.type }
                });
                const confirmRes = await axios.post(
                    `${API}/me/profile-picture/confirm`,
                    { image_url: public_url },
                    { headers: getAuthHeader() }
                );
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
            await axios.post(
                `${API}/me/change-password`,
                {
                    old_password: passwordData.oldPassword,
                    new_password: passwordData.newPassword,
                    confirm_password: passwordData.confirmPassword
                },
                { headers: getAuthHeader() }
            );
            toast.success('Password updated');
            setPasswordData({ oldPassword: '', newPassword: '', confirmPassword: '' });
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to change password'));
        } finally {
            setChangingPassword(false);
        }
    };

    const handleResendVerification = async () => {
        setSendingVerification(true);
        try {
            await axios.post(`${API}/auth/email/send-verification`, {}, { headers: getAuthHeader() });
            toast.success('Verification email sent');
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to send verification email'));
        } finally {
            setSendingVerification(false);
        }
    };

    const handleShareAchievement = async (achievement) => {
        const shareText = `${user?.name || 'I'} secured ${achievement.badge_title} (${achievement.badge_place}) in ${achievement.event_title} on PDA MIT.`;
        try {
            if (navigator.share) {
                await navigator.share({
                    title: 'PDA Achievement',
                    text: shareText,
                    url: `${window.location.origin}/profile`
                });
                return;
            }
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(shareText);
                toast.success('Achievement text copied to clipboard');
                return;
            }
            toast.message(shareText);
        } catch (error) {
            toast.error('Unable to share achievement right now');
        }
    };

    const handleDownloadCertificate = async (eventSlug) => {
        setCertificateLoadingSlug(eventSlug);
        try {
            const response = await axios.get(`${API}/pda/me/certificates/${eventSlug}`, { headers: getAuthHeader() });
            const data = response.data;
            if (!data?.eligible) {
                toast.error('Certificate is available only for closed events with attendance');
                return;
            }
            downloadCertificateArtwork({
                participantName: user?.name,
                eventTitle: data.event_title,
                certificateText: data.certificate_text,
                generatedAt: data.generated_at
            });
            toast.success('Certificate downloaded');
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to generate certificate'));
        } finally {
            setCertificateLoadingSlug('');
        }
    };

    const handleJoinPda = async () => {
        if (!preferredTeam) {
            toast.error('Please select a preferred team');
            return;
        }
        setApplyingRecruitment(true);
        try {
            const response = await axios.post(
                `${API}/pda/recruitment/apply`,
                { preferred_team: preferredTeam },
                { headers: getAuthHeader() }
            );
            const appliedUser = response?.data && typeof response.data === 'object'
                ? { ...response.data, is_applied: true, preferred_team: response.data.preferred_team || preferredTeam }
                : { is_applied: true, preferred_team: preferredTeam };
            updateUser(appliedUser);
            toast.success('Application submitted successfully');
            setJoinDialogOpen(false);
            setPreferredTeam('');
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to submit registration'));
            if (error?.response?.status === 403) {
                setRecruitmentOpen(false);
            }
        } finally {
            setApplyingRecruitment(false);
        }
    };

    if (!user) return null;

    return (
        <div className="min-h-screen bg-[#f3efe6] text-[#11131a] flex flex-col">
            <PdaHeader />
            <main className="flex-1 mx-auto w-full max-w-6xl px-5 py-10 space-y-8">
                {!user.email_verified ? (
                    <section className="rounded-2xl border-2 border-black bg-[#fff4d6] p-4 text-sm text-black">
                        <p className="font-semibold">Your email is not verified.</p>
                        <p className="mt-1 text-xs text-slate-700">Please verify your email. If you used a dummy email, update it first.</p>
                        <div className="mt-3 flex justify-end">
                            <Button type="button" onClick={handleResendVerification} disabled={sendingVerification} className="bg-[#11131a] text-white hover:bg-[#1f2330]">
                                {sendingVerification ? 'Sending...' : 'Resend Verification'}
                            </Button>
                        </div>
                    </section>
                ) : null}

                <section className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                            <p className="text-xs uppercase tracking-[0.35em] text-[#b8890b]">PDA Profile</p>
                            <h1 className="mt-2 text-3xl font-heading font-black">My PDA Dashboard</h1>
                            <p className="mt-2 text-sm text-slate-600">Manage profile, track event participation, and access achievements.</p>
                        </div>
                        <div className="flex items-center gap-3">
                            {user.image_url ? (
                                <img src={user.image_url} alt={user.name} className="h-24 w-24 rounded-3xl border border-black/10 object-cover" />
                            ) : (
                                <div className="flex h-24 w-24 items-center justify-center rounded-3xl border border-black/10 bg-slate-50 text-lg font-semibold text-slate-600">
                                    {user.name ? user.name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase() : 'PD'}
                                </div>
                            )}
                            <div>
                                <p className="font-semibold text-slate-900">{user.name || 'PDA Member'}</p>
                                <p className="text-sm text-slate-600">{user.regno}</p>
                                <p className="text-xs text-slate-500">{user.email}</p>
                            </div>
                        </div>
                    </div>

                    <div className="mt-6 grid gap-3 sm:grid-cols-3">
                        <div className="rounded-2xl border border-black/10 bg-[#fffdf7] p-4">
                            <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Registered Events</p>
                            <p className="mt-1 text-2xl font-heading font-black">{sortedMyEvents.length}</p>
                        </div>
                        <div className="rounded-2xl border border-black/10 bg-[#fffdf7] p-4">
                            <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Open Events</p>
                            <p className="mt-1 text-2xl font-heading font-black">{activeEventCount}</p>
                        </div>
                        <div className="rounded-2xl border border-black/10 bg-[#fffdf7] p-4">
                            <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Achievements</p>
                            <p className="mt-1 text-2xl font-heading font-black">{achievements.length}</p>
                        </div>
                    </div>
                </section>

                <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
                    <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
                        <div className="flex items-center justify-between">
                            <h2 className="text-2xl font-heading font-black">My Events</h2>
                            <span className="text-xs uppercase tracking-[0.2em] text-slate-500">Completed: {completedEventCount}</span>
                        </div>

                        {managedLoading ? (
                            <p className="mt-4 text-sm text-slate-500">Loading events...</p>
                        ) : sortedMyEvents.length === 0 ? (
                            <p className="mt-4 rounded-xl border border-black/10 bg-[#fffdf7] p-4 text-sm text-slate-600">No managed event registrations yet.</p>
                        ) : (
                            <div className="mt-4 space-y-3">
                                {sortedMyEvents.map((row) => (
                                    <div key={`${row.event?.slug}-${row.entity_type}-${row.entity_id}`} className="rounded-2xl border border-black/10 bg-[#fffdf7] p-4">
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div>
                                                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{row.event?.event_code}</p>
                                                <h3 className="text-lg font-heading font-black">{row.event?.title}</h3>
                                                <p className="mt-1 text-sm text-slate-600">{row.event?.participant_mode} · {row.event?.template_option}</p>
                                            </div>
                                            <span className={`rounded-full border px-3 py-1 text-xs uppercase tracking-[0.2em] ${row.event?.status === 'open' ? 'border-[#c99612] bg-[#fff3c4] text-[#7a5a00]' : 'border-black/10 bg-[#11131a] text-[#f6c347]'}`}>
                                                {row.event?.status || 'unknown'}
                                            </span>
                                        </div>

                                        <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-3">
                                            <p>Entity: <span className="font-semibold text-slate-900">{row.entity_type || '-'}</span></p>
                                            <p>Attendance: <span className="font-semibold text-slate-900">{row.attendance_count || 0}</span></p>
                                            <p>Score: <span className="font-semibold text-slate-900">{Number(row.cumulative_score || 0).toFixed(2)}</span></p>
                                        </div>

                                        <div className="mt-4 flex flex-wrap gap-2">
                                            {row.event?.status === 'open' ? (
                                                <a href={`/events/${row.event.slug}`}>
                                                    <Button variant="outline" className="border-black/20">
                                                        Open Dashboard
                                                        <ExternalLink className="ml-2 h-4 w-4" />
                                                    </Button>
                                                </a>
                                            ) : null}
                                            <Button
                                                className="bg-[#f6c347] text-black hover:bg-[#ffd16b]"
                                                onClick={() => handleDownloadCertificate(row.event.slug)}
                                                disabled={certificateLoadingSlug === row.event.slug}
                                            >
                                                <Download className="mr-2 h-4 w-4" />
                                                {certificateLoadingSlug === row.event.slug ? 'Generating...' : 'Download Certificate'}
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
                        <div className="flex items-center justify-between">
                            <h2 className="text-2xl font-heading font-black">Achievements</h2>
                            <Award className="h-5 w-5 text-[#b8890b]" />
                        </div>
                        {managedLoading ? (
                            <p className="mt-4 text-sm text-slate-500">Loading achievements...</p>
                        ) : achievements.length === 0 ? (
                            <p className="mt-4 rounded-xl border border-black/10 bg-[#fffdf7] p-4 text-sm text-slate-600">No badges yet. Win rounds to unlock achievements.</p>
                        ) : (
                            <div className="mt-4 space-y-3">
                                {achievements.map((achievement, index) => (
                                    <div key={`${achievement.event_slug}-${achievement.badge_title}-${index}`} className="rounded-2xl border border-black/10 bg-[#fffdf7] p-4">
                                        <div className="flex items-start gap-3">
                                            {achievement.image_url ? (
                                                <img src={achievement.image_url} alt={achievement.badge_title} className="h-14 w-14 rounded-xl border border-black/10 object-cover" />
                                            ) : (
                                                <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-black/10 bg-[#fff3c4] text-[#7a5a00]">
                                                    <Award className="h-5 w-5" />
                                                </div>
                                            )}
                                            <div className="flex-1">
                                                <p className="font-semibold text-slate-900">{achievement.badge_title}</p>
                                                <p className="text-sm text-slate-600">{achievement.badge_place} · {achievement.event_title}</p>
                                                <p className="text-xs text-slate-500">Score: {achievement.score ?? '-'}</p>
                                            </div>
                                        </div>
                                        <div className="mt-3 flex justify-end">
                                            <Button variant="outline" className="border-black/20" onClick={() => handleShareAchievement(achievement)}>
                                                <Share2 className="mr-2 h-4 w-4" />
                                                Share
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </section>

                <section className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <h2 className="text-2xl font-heading font-black">Profile Settings</h2>
                            <p className="mt-1 text-sm text-slate-600">Update personal details, social links, and password.</p>
                        </div>
                        {!isEditing ? (
                            <Button type="button" onClick={() => setIsEditing(true)} className="bg-[#11131a] text-white hover:bg-[#1f2330]">
                                Edit Profile
                            </Button>
                        ) : null}
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
                            <Select value={formData.gender} onValueChange={(value) => setFormData((prev) => ({ ...prev, gender: value }))} disabled={!isEditing}>
                                <SelectTrigger className="w-full"><SelectValue placeholder="Select gender" /></SelectTrigger>
                                <SelectContent>
                                    {GENDERS.map((gender) => (
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
                            <Select value={formData.dept} onValueChange={(value) => setFormData((prev) => ({ ...prev, dept: value }))} disabled={!isEditing}>
                                <SelectTrigger className="w-full"><SelectValue placeholder="Select department" /></SelectTrigger>
                                <SelectContent>
                                    {DEPARTMENTS.map((dept) => (
                                        <SelectItem key={dept.value} value={dept.value}>{dept.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label>Membership Status</Label>
                            <Input value={user.is_member ? 'Member' : (user.is_applied ? 'Applied' : 'Not Applied')} readOnly className="bg-slate-50" />
                        </div>
                        <div>
                            <Label>Team</Label>
                            <Input value={user.team || 'Not assigned'} readOnly className="bg-slate-50" />
                        </div>
                        <div>
                            <Label>Designation</Label>
                            <Input value={user.designation || 'Not assigned'} readOnly className="bg-slate-50" />
                        </div>
                        <div>
                            <Label>Instagram</Label>
                            <Input name="instagram_url" value={formData.instagram_url} onChange={handleChange} placeholder="https://instagram.com/username" disabled={!isEditing} />
                        </div>
                        <div>
                            <Label>LinkedIn</Label>
                            <Input name="linkedin_url" value={formData.linkedin_url} onChange={handleChange} placeholder="https://linkedin.com/in/username" disabled={!isEditing} />
                        </div>
                        <div>
                            <Label>GitHub</Label>
                            <Input name="github_url" value={formData.github_url} onChange={handleChange} placeholder="https://github.com/username" disabled={!isEditing} />
                        </div>
                        <div className="md:col-span-2">
                            <Label>Change Profile Picture</Label>
                            <Input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setImageFile(e.target.files?.[0] || null)} disabled={!isEditing} />
                            <p className="mt-2 text-xs text-slate-500">Upload a new image to replace the current one.</p>
                        </div>

                        {isEditing ? (
                            <div className="md:col-span-2 flex justify-end gap-3">
                                <Button type="button" variant="outline" onClick={() => {
                                    setIsEditing(false);
                                    resetProfileForm();
                                }} disabled={saving}>
                                    Cancel
                                </Button>
                                <Button type="submit" disabled={saving} className="bg-[#f6c347] text-black hover:bg-[#ffd16b]">
                                    {saving ? 'Saving...' : 'Save Changes'}
                                </Button>
                            </div>
                        ) : null}
                    </form>

                    {isEditing ? (
                        <form onSubmit={handleChangePassword} className="mt-8 rounded-2xl border border-black/10 bg-[#fffdf7] p-4">
                            <h3 className="text-lg font-semibold text-slate-900">Change Password</h3>
                            <p className="mt-1 text-xs text-slate-500">Use your old password to set a new one.</p>
                            <div className="mt-4 grid gap-4 md:grid-cols-3">
                                <div>
                                    <Label>Old Password</Label>
                                    <Input name="oldPassword" type="password" value={passwordData.oldPassword} onChange={handlePasswordChange} />
                                </div>
                                <div>
                                    <Label>New Password</Label>
                                    <Input name="newPassword" type="password" value={passwordData.newPassword} onChange={handlePasswordChange} />
                                </div>
                                <div>
                                    <Label>Confirm Password</Label>
                                    <Input name="confirmPassword" type="password" value={passwordData.confirmPassword} onChange={handlePasswordChange} />
                                </div>
                            </div>
                            <div className="mt-4 flex justify-end">
                                <Button type="submit" disabled={changingPassword} className="bg-[#11131a] text-white hover:bg-[#1f2330]">
                                    {changingPassword ? 'Updating...' : 'Update Password'}
                                </Button>
                            </div>
                        </form>
                    ) : null}
                </section>

                {!user.is_member ? (
                    <section className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
                        <h2 className="text-2xl font-heading font-black">Recruitment</h2>
                        <p className="mt-1 text-sm text-slate-600">Apply to join PDA from here.</p>

                        <div className="mt-5 rounded-2xl border border-black/10 bg-[#fffdf7] p-4">
                            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Recruitment Status</p>
                            {recruitmentLoading ? (
                                <p className="mt-2 text-sm text-slate-600">Checking recruitment availability...</p>
                            ) : recruitmentOpen ? (
                                <div className="mt-3">
                                    {user.is_applied ? (
                                        <>
                                            <p className="text-sm font-semibold text-slate-900">Application submitted. Awaiting admin review.</p>
                                            <p className="mt-1 text-sm text-slate-600">Preferred Team: {user.preferred_team || 'Not specified'}</p>
                                        </>
                                    ) : (
                                        <p className="text-sm text-slate-700">Recruitment is open. Submit your application to join PDA.</p>
                                    )}
                                    <Button
                                        type="button"
                                        onClick={() => setJoinDialogOpen(true)}
                                        disabled={user.is_applied}
                                        className="mt-3 bg-[#f6c347] text-black hover:bg-[#ffd16b] disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        {user.is_applied ? 'Already Applied' : 'Join PDA'}
                                    </Button>
                                </div>
                            ) : (
                                <p className="mt-2 text-sm text-slate-600">Recruitment is currently closed.</p>
                            )}
                        </div>
                    </section>
                ) : null}

                <Dialog open={joinDialogOpen} onOpenChange={setJoinDialogOpen}>
                    <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                            <DialogTitle>Join PDA</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-3 py-2">
                            <Label>Preferred Team</Label>
                            <Select value={preferredTeam} onValueChange={setPreferredTeam}>
                                <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Select preferred team" />
                                </SelectTrigger>
                                <SelectContent>
                                    {RECRUITMENT_TEAMS.map((team) => (
                                        <SelectItem key={team} value={team}>{team}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setJoinDialogOpen(false)} disabled={applyingRecruitment}>
                                Cancel
                            </Button>
                            <Button type="button" onClick={handleJoinPda} disabled={applyingRecruitment || !preferredTeam} className="bg-[#f6c347] text-black hover:bg-[#ffd16b]">
                                {applyingRecruitment ? 'Submitting...' : 'Submit Application'}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </main>
            <PdaFooter />
        </div>
    );
}
