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

const TROPHY_IMAGE = 'https://images.unsplash.com/photo-1578269174936-2709b6aeb913?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1NTZ8MHwxfHNlYXJjaHwyfHxnb2xkJTIwdHJvcGh5JTIwbWluaW1hbGlzdHxlbnwwfHx8fDE3NzAwMTcxMDB8MA&ixlib=rb-4.1.0&q=85';
const panelClass = 'rounded-md border-4 border-black bg-white p-6 shadow-[8px_8px_0px_0px_#000000]';
const tileClass = 'rounded-md border-2 border-black bg-[#fffdf0] p-4 shadow-neo';
const inputClass = 'h-12 border-2 border-black bg-white text-sm shadow-neo focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2';
const selectTriggerClass = 'h-12 border-2 border-black bg-white text-sm shadow-neo focus:ring-2 focus:ring-black focus:ring-offset-2';
const selectContentClass = 'border-2 border-black bg-white shadow-[4px_4px_0px_0px_#000000]';
const primaryButtonClass = 'rounded-md border-2 border-black bg-[#8B5CF6] text-xs font-bold uppercase tracking-[0.14em] text-white shadow-neo transition-[background-color,transform,box-shadow] duration-150 hover:bg-[#7C3AED] hover:-translate-x-[1px] hover:-translate-y-[1px] hover:shadow-[6px_6px_0px_0px_#000000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none';
const accentButtonClass = 'rounded-md border-2 border-black bg-[#FDE047] text-xs font-bold uppercase tracking-[0.14em] text-black shadow-neo transition-[transform,box-shadow,background-color] duration-150 hover:bg-[#f9d729] hover:-translate-x-[1px] hover:-translate-y-[1px] hover:shadow-[6px_6px_0px_0px_#000000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none';
const neutralButtonClass = 'rounded-md border-2 border-black bg-white text-xs font-bold uppercase tracking-[0.14em] text-black shadow-neo transition-[transform,box-shadow,background-color] duration-150 hover:bg-[#C4B5FD] hover:-translate-x-[1px] hover:-translate-y-[1px] hover:shadow-[6px_6px_0px_0px_#000000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none';

export default function PdaProfile() {
    const { user, getAuthHeader, updateUser } = useAuth();

    const [formData, setFormData] = useState({
        name: '',
        profile_name: '',
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
            profile_name: user.profile_name || '',
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
        const profile_name = String(formData.profile_name || '').trim().toLowerCase();
        if (profile_name && !/^[a-z0-9_]{3,40}$/.test(profile_name)) {
            toast.error('Profile name must be 3-40 chars: lowercase letters, numbers, underscore');
            return;
        }
        const instagram_url = String(formData.instagram_url || '').trim();
        const linkedin_url = String(formData.linkedin_url || '').trim();
        const github_url = String(formData.github_url || '').trim();
        setSaving(true);
        try {
            const payload = {
                name: formData.name,
                profile_name: profile_name || null,
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
        <div className="min-h-screen bg-[#fffdf5] text-black flex flex-col">
            <PdaHeader />
            <main className="relative isolate flex-1 overflow-hidden">
                <div className="pointer-events-none absolute inset-0 z-0">
                    <div className="absolute -left-10 top-20 h-24 w-24 rotate-12 border-4 border-black bg-[#8B5CF6]" />
                    <div className="absolute right-8 top-14 h-12 w-12 border-4 border-black bg-[#FDE047]" />
                    <div className="absolute bottom-20 right-[8%] h-16 w-16 rotate-45 border-4 border-black bg-[#C4B5FD]" />
                </div>

                <div className="relative z-10 mx-auto w-full max-w-7xl space-y-8 px-4 py-10 sm:px-6 lg:px-8 lg:py-12">
                    {!user.email_verified ? (
                        <section className="rounded-md border-4 border-black bg-[#fff3c4] p-4 shadow-neo">
                            <p className="font-heading text-lg font-black uppercase tracking-tight">Email Verification Pending</p>
                            <p className="mt-1 text-sm font-medium text-slate-700">Please verify your email. If needed, resend verification to your inbox.</p>
                            <div className="mt-4 flex justify-end">
                                <Button
                                    type="button"
                                    onClick={handleResendVerification}
                                    disabled={sendingVerification}
                                    data-testid="pda-profile-resend-verification-button"
                                    className={primaryButtonClass}
                                >
                                    {sendingVerification ? 'Sending...' : 'Resend Verification'}
                                </Button>
                            </div>
                        </section>
                    ) : null}

                    <section className={`${panelClass} overflow-hidden`}>
                        <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
                            <div>
                                <p className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-[#8B5CF6]">PDA Dashboard</p>
                                <h1 className="mt-2 font-heading text-4xl font-black uppercase tracking-tight">My Profile Control Room</h1>
                                <p className="mt-2 max-w-xl text-sm font-medium text-slate-700">
                                    Manage your profile, monitor event participation, and track achievements in a single dashboard.
                                </p>

                                <div className="mt-5 flex flex-wrap items-center gap-4 rounded-md border-2 border-black bg-[#fffdf0] p-4 shadow-neo">
                                    {user.image_url ? (
                                        <img src={user.image_url} alt={user.name} className="h-20 w-20 border-2 border-black object-cover" />
                                    ) : (
                                        <div className="flex h-20 w-20 items-center justify-center border-2 border-black bg-[#FDE047] font-heading text-2xl font-black">
                                            {user.name ? user.name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase() : 'PD'}
                                        </div>
                                    )}
                                    <div className="space-y-1">
                                        <p className="font-heading text-xl font-black uppercase tracking-tight">{user.name || 'PDA Member'}</p>
                                        <p className="font-mono text-xs font-bold uppercase tracking-[0.12em] text-[#8B5CF6]">@{user.profile_name || 'n/a'}</p>
                                        <p className="font-mono text-xs font-bold uppercase tracking-[0.12em] text-slate-600">{user.regno}</p>
                                        <p className="text-sm font-medium text-slate-700">{user.email}</p>
                                    </div>
                                    <div className="ml-auto">
                                        <span className="inline-flex items-center rounded-md border-2 border-black bg-[#C4B5FD] px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] shadow-neo">
                                            {user.is_member ? 'Member' : user.is_applied ? 'Applied' : 'Applicant'}
                                        </span>
                                    </div>
                                </div>

                                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                                    <div className={tileClass}>
                                        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-600">Registered Events</p>
                                        <p className="mt-1 font-heading text-3xl font-black">{sortedMyEvents.length}</p>
                                    </div>
                                    <div className={tileClass}>
                                        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-600">Open Events</p>
                                        <p className="mt-1 font-heading text-3xl font-black">{activeEventCount}</p>
                                    </div>
                                    <div className={tileClass}>
                                        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-600">Achievements</p>
                                        <p className="mt-1 font-heading text-3xl font-black">{achievements.length}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="relative min-h-[300px] overflow-hidden border-4 border-black bg-[#11131a] shadow-[8px_8px_0px_0px_#000000]">
                                <img src={TROPHY_IMAGE} alt="Achievement trophy" className="absolute inset-0 h-full w-full object-cover opacity-45" />
                                <div className="relative z-10 flex h-full flex-col justify-between p-5 text-white">
                                    <p className="inline-flex w-fit rounded-md border-2 border-black bg-[#FDE047] px-3 py-1 font-mono text-xs font-bold uppercase tracking-[0.14em] text-black">
                                        Achievement Zone
                                    </p>
                                    <div>
                                        <h2 className="font-heading text-3xl font-black uppercase tracking-tight">Compete.</h2>
                                        <h2 className="font-heading text-3xl font-black uppercase tracking-tight text-[#FDE047]">Contribute.</h2>
                                        <h2 className="font-heading text-3xl font-black uppercase tracking-tight text-[#C4B5FD]">Celebrate.</h2>
                                        <p className="mt-3 text-sm font-medium text-white/90">
                                            Keep attending open events and closing rounds to unlock badges and certificates.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>

                    <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
                        <div className={panelClass}>
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <h2 className="font-heading text-3xl font-black uppercase tracking-tight">My Events</h2>
                                <span className="rounded-md border-2 border-black bg-[#FDE047] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] shadow-neo">
                                    Completed: {completedEventCount}
                                </span>
                            </div>

                            {managedLoading ? (
                                <p className="mt-4 text-sm font-medium text-slate-600">Loading events...</p>
                            ) : sortedMyEvents.length === 0 ? (
                                <p className="mt-4 rounded-md border-2 border-black bg-[#fffdf0] p-4 text-sm font-medium text-slate-700 shadow-neo">
                                    No managed event registrations yet.
                                </p>
                            ) : (
                                <div className="mt-4 space-y-3">
                                    {sortedMyEvents.map((row) => (
                                        <div key={`${row.event?.slug}-${row.entity_type}-${row.entity_id}`} className="rounded-md border-2 border-black bg-[#fffdf0] p-4 shadow-neo">
                                            <div className="flex flex-wrap items-start justify-between gap-3">
                                                <div>
                                                    <p className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-slate-600">
                                                        {row.event?.event_code || 'Event'}
                                                    </p>
                                                    <h3 className="mt-1 font-heading text-xl font-black uppercase tracking-tight">
                                                        {row.event?.title || 'Untitled Event'}
                                                    </h3>
                                                    <p className="mt-1 text-xs font-medium uppercase tracking-[0.1em] text-slate-700">
                                                        {row.event?.participant_mode} {row.event?.template_option ? `· ${row.event.template_option}` : ''}
                                                    </p>
                                                </div>
                                                <span className={`rounded-md border-2 border-black px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] shadow-neo ${row.event?.status === 'open' ? 'bg-[#4ADE80] text-black' : 'bg-[#11131a] text-[#FDE047]'}`}>
                                                    {row.event?.status || 'unknown'}
                                                </span>
                                            </div>

                                            <div className="mt-3 grid gap-2 sm:grid-cols-3">
                                                <p className="text-xs font-medium uppercase tracking-[0.1em] text-slate-600">
                                                    Entity: <span className="font-bold text-black">{row.entity_type || '-'}</span>
                                                </p>
                                                <p className="text-xs font-medium uppercase tracking-[0.1em] text-slate-600">
                                                    Attendance: <span className="font-bold text-black">{row.attendance_count || 0}</span>
                                                </p>
                                                <p className="text-xs font-medium uppercase tracking-[0.1em] text-slate-600">
                                                    Score: <span className="font-bold text-black">{Number(row.cumulative_score || 0).toFixed(2)}</span>
                                                </p>
                                            </div>

                                            <div className="mt-4 flex flex-wrap gap-2">
                                                {row.event?.status === 'open' ? (
                                                    <a
                                                        href={`/events/${row.event.slug}`}
                                                        data-testid={`pda-profile-open-dashboard-${row.event?.slug || 'event'}`}
                                                    >
                                                        <Button type="button" className={neutralButtonClass}>
                                                            Open Dashboard
                                                            <ExternalLink className="ml-2 h-4 w-4" />
                                                        </Button>
                                                    </a>
                                                ) : null}
                                                <Button
                                                    type="button"
                                                    onClick={() => handleDownloadCertificate(row.event.slug)}
                                                    disabled={certificateLoadingSlug === row.event.slug}
                                                    data-testid={`pda-profile-download-certificate-${row.event?.slug || 'event'}`}
                                                    className={accentButtonClass}
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

                        <div className={panelClass}>
                            <div className="flex items-center justify-between gap-3">
                                <h2 className="font-heading text-3xl font-black uppercase tracking-tight">Achievements</h2>
                                <Award className="h-6 w-6 text-[#8B5CF6]" />
                            </div>
                            {managedLoading ? (
                                <p className="mt-4 text-sm font-medium text-slate-600">Loading achievements...</p>
                            ) : achievements.length === 0 ? (
                                <p className="mt-4 rounded-md border-2 border-black bg-[#fffdf0] p-4 text-sm font-medium text-slate-700 shadow-neo">
                                    No badges yet. Win rounds to unlock achievements.
                                </p>
                            ) : (
                                <div className="mt-4 space-y-3">
                                    {achievements.map((achievement, index) => (
                                        <div key={`${achievement.event_slug}-${achievement.badge_title}-${index}`} className="rounded-md border-2 border-black bg-[#fffdf0] p-4 shadow-neo">
                                            <div className="flex items-start gap-3">
                                                {achievement.image_url ? (
                                                    <img src={achievement.image_url} alt={achievement.badge_title} className="h-14 w-14 border-2 border-black object-cover" />
                                                ) : (
                                                    <div className="flex h-14 w-14 items-center justify-center border-2 border-black bg-[#FDE047]">
                                                        <Award className="h-5 w-5 text-black" />
                                                    </div>
                                                )}
                                                <div className="flex-1">
                                                    <p className="font-heading text-lg font-black uppercase tracking-tight">{achievement.badge_title}</p>
                                                    <p className="text-xs font-medium uppercase tracking-[0.1em] text-slate-700">
                                                        {achievement.badge_place} · {achievement.event_title}
                                                    </p>
                                                    <p className="mt-1 text-xs font-medium text-slate-600">Score: {achievement.score ?? '-'}</p>
                                                </div>
                                            </div>
                                            <div className="mt-3 flex justify-end">
                                                <Button
                                                    type="button"
                                                    onClick={() => handleShareAchievement(achievement)}
                                                    data-testid={`pda-profile-share-achievement-${achievement.event_slug || index}`}
                                                    className={neutralButtonClass}
                                                >
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

                    <section className={panelClass}>
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <h2 className="font-heading text-3xl font-black uppercase tracking-tight">Profile Settings</h2>
                                <p className="mt-1 text-sm font-medium text-slate-700">Update personal details, social links, and password.</p>
                            </div>
                            {!isEditing ? (
                                <Button
                                    type="button"
                                    onClick={() => setIsEditing(true)}
                                    data-testid="pda-profile-edit-button"
                                    className={primaryButtonClass}
                                >
                                    Edit Profile
                                </Button>
                            ) : null}
                        </div>

                        <form onSubmit={handleSubmit} className="mt-6 grid gap-4 md:grid-cols-2">
                            <div>
                                <Label htmlFor="profile-regno" className="text-xs font-bold uppercase tracking-[0.12em]">Register Number</Label>
                                <Input id="profile-regno" value={user.regno || ''} readOnly data-testid="pda-profile-regno-input" className={`${inputClass} bg-[#f3f4f6]`} />
                            </div>
                            <div>
                                <Label htmlFor="profile-name" className="text-xs font-bold uppercase tracking-[0.12em]">Name</Label>
                                <Input id="profile-name" name="name" value={formData.name} onChange={handleChange} disabled={!isEditing} data-testid="pda-profile-name-input" className={`${inputClass} disabled:bg-[#f3f4f6]`} />
                            </div>
                            <div>
                                <Label htmlFor="profile-profile-name" className="text-xs font-bold uppercase tracking-[0.12em]">Profile Name</Label>
                                <Input
                                    id="profile-profile-name"
                                    name="profile_name"
                                    value={formData.profile_name}
                                    onChange={handleChange}
                                    placeholder="eg: john_doe"
                                    disabled={!isEditing}
                                    data-testid="pda-profile-profile-name-input"
                                    className={`${inputClass} disabled:bg-[#f3f4f6]`}
                                />
                                <p className="mt-1 text-[11px] font-medium text-slate-600">3-40 chars: lowercase letters, numbers, underscore.</p>
                            </div>
                            <div>
                                <Label htmlFor="profile-email" className="text-xs font-bold uppercase tracking-[0.12em]">Email</Label>
                                <Input id="profile-email" name="email" value={formData.email} onChange={handleChange} disabled={!isEditing} data-testid="pda-profile-email-input" className={`${inputClass} disabled:bg-[#f3f4f6]`} />
                            </div>
                            <div>
                                <Label htmlFor="profile-dob" className="text-xs font-bold uppercase tracking-[0.12em]">Date Of Birth</Label>
                                <Input id="profile-dob" name="dob" type="date" value={formData.dob} onChange={handleChange} disabled={!isEditing} data-testid="pda-profile-dob-input" className={`${inputClass} disabled:bg-[#f3f4f6]`} />
                            </div>
                            <div>
                                <Label htmlFor="profile-gender" className="text-xs font-bold uppercase tracking-[0.12em]">Gender</Label>
                                <Select value={formData.gender} onValueChange={(value) => setFormData((prev) => ({ ...prev, gender: value }))} disabled={!isEditing}>
                                    <SelectTrigger id="profile-gender" data-testid="pda-profile-gender-select" className={`${selectTriggerClass} disabled:bg-[#f3f4f6]`}>
                                        <SelectValue placeholder="Select gender" />
                                    </SelectTrigger>
                                    <SelectContent className={selectContentClass}>
                                        {GENDERS.map((gender) => (
                                            <SelectItem data-testid={`pda-profile-gender-${gender.value.toLowerCase()}`} key={gender.value} value={gender.value}>
                                                {gender.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label htmlFor="profile-phone" className="text-xs font-bold uppercase tracking-[0.12em]">Phone</Label>
                                <Input id="profile-phone" name="phno" value={formData.phno} onChange={handleChange} disabled={!isEditing} data-testid="pda-profile-phone-input" className={`${inputClass} disabled:bg-[#f3f4f6]`} />
                            </div>
                            <div>
                                <Label htmlFor="profile-dept" className="text-xs font-bold uppercase tracking-[0.12em]">Department</Label>
                                <Select value={formData.dept} onValueChange={(value) => setFormData((prev) => ({ ...prev, dept: value }))} disabled={!isEditing}>
                                    <SelectTrigger id="profile-dept" data-testid="pda-profile-dept-select" className={`${selectTriggerClass} disabled:bg-[#f3f4f6]`}>
                                        <SelectValue placeholder="Select department" />
                                    </SelectTrigger>
                                    <SelectContent className={selectContentClass}>
                                        {DEPARTMENTS.map((dept) => (
                                            <SelectItem data-testid={`pda-profile-dept-${dept.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`} key={dept.value} value={dept.value}>
                                                {dept.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label htmlFor="profile-member-status" className="text-xs font-bold uppercase tracking-[0.12em]">Membership Status</Label>
                                <Input id="profile-member-status" value={user.is_member ? 'Member' : (user.is_applied ? 'Applied' : 'Not Applied')} readOnly data-testid="pda-profile-membership-status-input" className={`${inputClass} bg-[#f3f4f6]`} />
                            </div>
                            <div>
                                <Label htmlFor="profile-team" className="text-xs font-bold uppercase tracking-[0.12em]">Team</Label>
                                <Input id="profile-team" value={user.team || 'Not assigned'} readOnly data-testid="pda-profile-team-input" className={`${inputClass} bg-[#f3f4f6]`} />
                            </div>
                            <div>
                                <Label htmlFor="profile-designation" className="text-xs font-bold uppercase tracking-[0.12em]">Designation</Label>
                                <Input id="profile-designation" value={user.designation || 'Not assigned'} readOnly data-testid="pda-profile-designation-input" className={`${inputClass} bg-[#f3f4f6]`} />
                            </div>
                            <div>
                                <Label htmlFor="profile-instagram" className="text-xs font-bold uppercase tracking-[0.12em]">Instagram</Label>
                                <Input id="profile-instagram" name="instagram_url" value={formData.instagram_url} onChange={handleChange} placeholder="https://instagram.com/username" disabled={!isEditing} data-testid="pda-profile-instagram-input" className={`${inputClass} disabled:bg-[#f3f4f6]`} />
                            </div>
                            <div>
                                <Label htmlFor="profile-linkedin" className="text-xs font-bold uppercase tracking-[0.12em]">LinkedIn</Label>
                                <Input id="profile-linkedin" name="linkedin_url" value={formData.linkedin_url} onChange={handleChange} placeholder="https://linkedin.com/in/username" disabled={!isEditing} data-testid="pda-profile-linkedin-input" className={`${inputClass} disabled:bg-[#f3f4f6]`} />
                            </div>
                            <div>
                                <Label htmlFor="profile-github" className="text-xs font-bold uppercase tracking-[0.12em]">GitHub</Label>
                                <Input id="profile-github" name="github_url" value={formData.github_url} onChange={handleChange} placeholder="https://github.com/username" disabled={!isEditing} data-testid="pda-profile-github-input" className={`${inputClass} disabled:bg-[#f3f4f6]`} />
                            </div>
                            <div className="md:col-span-2">
                                <Label htmlFor="profile-picture" className="text-xs font-bold uppercase tracking-[0.12em]">Change Profile Picture</Label>
                                <Input
                                    id="profile-picture"
                                    type="file"
                                    accept="image/png,image/jpeg,image/webp"
                                    onChange={(e) => setImageFile(e.target.files?.[0] || null)}
                                    disabled={!isEditing}
                                    data-testid="pda-profile-picture-input"
                                    className="border-2 border-black bg-white text-sm shadow-neo file:mr-3 file:rounded-md file:border-2 file:border-black file:bg-[#FDE047] file:px-3 file:py-1 file:text-xs file:font-bold disabled:bg-[#f3f4f6]"
                                />
                                <p className="mt-2 text-xs font-medium text-slate-600">Upload a new image to replace the current one.</p>
                            </div>

                            {isEditing ? (
                                <div className="md:col-span-2 flex justify-end gap-3 border-t-2 border-dashed border-black pt-4">
                                    <Button
                                        type="button"
                                        onClick={() => {
                                            setIsEditing(false);
                                            resetProfileForm();
                                        }}
                                        disabled={saving}
                                        data-testid="pda-profile-cancel-edit-button"
                                        className={neutralButtonClass}
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        type="submit"
                                        disabled={saving}
                                        data-testid="pda-profile-save-button"
                                        className={accentButtonClass}
                                    >
                                        {saving ? 'Saving...' : 'Save Changes'}
                                    </Button>
                                </div>
                            ) : null}
                        </form>

                        {isEditing ? (
                            <form onSubmit={handleChangePassword} className="mt-8 rounded-md border-2 border-black bg-[#fffdf0] p-4 shadow-neo">
                                <h3 className="font-heading text-xl font-black uppercase tracking-tight">Change Password</h3>
                                <p className="mt-1 text-xs font-medium text-slate-600">Use your old password to set a new one.</p>
                                <div className="mt-4 grid gap-4 md:grid-cols-3">
                                    <div>
                                        <Label htmlFor="profile-old-password" className="text-xs font-bold uppercase tracking-[0.12em]">Old Password</Label>
                                        <Input id="profile-old-password" name="oldPassword" type="password" value={passwordData.oldPassword} onChange={handlePasswordChange} data-testid="pda-profile-old-password-input" className={inputClass} />
                                    </div>
                                    <div>
                                        <Label htmlFor="profile-new-password" className="text-xs font-bold uppercase tracking-[0.12em]">New Password</Label>
                                        <Input id="profile-new-password" name="newPassword" type="password" value={passwordData.newPassword} onChange={handlePasswordChange} data-testid="pda-profile-new-password-input" className={inputClass} />
                                    </div>
                                    <div>
                                        <Label htmlFor="profile-confirm-password" className="text-xs font-bold uppercase tracking-[0.12em]">Confirm Password</Label>
                                        <Input id="profile-confirm-password" name="confirmPassword" type="password" value={passwordData.confirmPassword} onChange={handlePasswordChange} data-testid="pda-profile-confirm-password-input" className={inputClass} />
                                    </div>
                                </div>
                                <div className="mt-4 flex justify-end">
                                    <Button
                                        type="submit"
                                        disabled={changingPassword}
                                        data-testid="pda-profile-update-password-button"
                                        className={primaryButtonClass}
                                    >
                                        {changingPassword ? 'Updating...' : 'Update Password'}
                                    </Button>
                                </div>
                            </form>
                        ) : null}
                    </section>

                    {!user.is_member ? (
                        <section className={panelClass}>
                            <h2 className="font-heading text-3xl font-black uppercase tracking-tight">Recruitment</h2>
                            <p className="mt-1 text-sm font-medium text-slate-700">Apply to join PDA from here.</p>

                            <div className="mt-5 rounded-md border-2 border-black bg-[#fffdf0] p-4 shadow-neo">
                                <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-600">Recruitment Status</p>
                                {recruitmentLoading ? (
                                    <p className="mt-2 text-sm font-medium text-slate-700">Checking recruitment availability...</p>
                                ) : recruitmentOpen ? (
                                    <div className="mt-3">
                                        {user.is_applied ? (
                                            <>
                                                <p className="text-sm font-bold text-black">Application submitted. Awaiting admin review.</p>
                                                <p className="mt-1 text-sm font-medium text-slate-700">Preferred Team: {user.preferred_team || 'Not specified'}</p>
                                            </>
                                        ) : (
                                            <p className="text-sm font-medium text-slate-700">Recruitment is open. Submit your application to join PDA.</p>
                                        )}
                                        <Button
                                            type="button"
                                            onClick={() => setJoinDialogOpen(true)}
                                            disabled={user.is_applied}
                                            data-testid="pda-profile-join-button"
                                            className={`mt-3 ${user.is_applied ? `${neutralButtonClass} opacity-60` : accentButtonClass}`}
                                        >
                                            {user.is_applied ? 'Already Applied' : 'Join PDA'}
                                        </Button>
                                    </div>
                                ) : (
                                    <p className="mt-2 text-sm font-medium text-slate-700">Recruitment is currently closed.</p>
                                )}
                            </div>
                        </section>
                    ) : null}

                    <Dialog open={joinDialogOpen} onOpenChange={setJoinDialogOpen}>
                        <DialogContent className="border-4 border-black bg-white shadow-[8px_8px_0px_0px_#000000] sm:max-w-md">
                            <DialogHeader>
                                <DialogTitle className="font-heading text-2xl font-black uppercase tracking-tight">Join PDA</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-3 py-2">
                                <Label htmlFor="join-team" className="text-xs font-bold uppercase tracking-[0.12em]">Preferred Team</Label>
                                <Select value={preferredTeam} onValueChange={setPreferredTeam}>
                                    <SelectTrigger id="join-team" data-testid="pda-profile-join-team-select" className={selectTriggerClass}>
                                        <SelectValue placeholder="Select preferred team" />
                                    </SelectTrigger>
                                    <SelectContent className={selectContentClass}>
                                        {RECRUITMENT_TEAMS.map((team) => (
                                            <SelectItem data-testid={`pda-profile-join-team-${team.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`} key={team} value={team}>
                                                {team}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <DialogFooter>
                                <Button
                                    type="button"
                                    onClick={() => setJoinDialogOpen(false)}
                                    disabled={applyingRecruitment}
                                    data-testid="pda-profile-join-cancel-button"
                                    className={neutralButtonClass}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    type="button"
                                    onClick={handleJoinPda}
                                    disabled={applyingRecruitment || !preferredTeam}
                                    data-testid="pda-profile-join-submit-button"
                                    className={accentButtonClass}
                                >
                                    {applyingRecruitment ? 'Submitting...' : 'Submit Application'}
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </div>
            </main>
            <PdaFooter />
        </div>
    );
}
