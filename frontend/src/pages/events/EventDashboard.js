import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import QRCode from 'qrcode';
import { toast } from 'sonner';
import {
    Calendar,
    CheckCircle2,
    Clock3,
    Copy,
    Eye,
    EyeOff,
    ExternalLink,
    LogIn,
    QrCode,
    UserPlus,
    Users,
    XCircle
} from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import PdaHeader from '@/components/layout/PdaHeader';
import PdaFooter from '@/components/layout/PdaFooter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import ParsedDescription from '@/components/common/ParsedDescription';
import PosterCarousel from '@/components/common/PosterCarousel';
import { filterPosterAssetsByRatio, parsePosterAssets, resolvePosterUrl } from '@/utils/posterAssets';

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

const authInputClass = 'h-11 border-2 border-black bg-white text-sm shadow-neo focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2';
const authSelectTriggerClass = 'h-11 border-2 border-black bg-white text-sm shadow-neo focus:ring-2 focus:ring-black focus:ring-offset-2';
const authSelectContentClass = 'border-2 border-black bg-white shadow-[4px_4px_0px_0px_#000000]';

const statusIcon = (value) => {
    const normalized = String(value || '').toLowerCase();
    if (normalized === 'active') return <CheckCircle2 className="h-5 w-5 text-green-600" />;
    if (normalized === 'eliminated' || normalized === 'absent') return <XCircle className="h-5 w-5 text-red-600" />;
    return <Clock3 className="h-5 w-5 text-slate-500" />;
};

const formatEventDate = (value) => {
    if (!value) return '';
    const dateValue = String(value).trim().slice(0, 10);
    if (!dateValue) return '';
    const parsed = new Date(`${dateValue}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return dateValue;
    return parsed.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
};

const getEventDateLabel = (startDate, endDate) => {
    const start = formatEventDate(startDate);
    const end = formatEventDate(endDate);
    if (start && end) {
        if (start === end) return `Date: ${start}`;
        return `${start} - ${end}`;
    }
    if (start) return `Starts: ${start}`;
    if (end) return `Ends: ${end}`;
    return 'Date: TBA';
};

export default function EventDashboard() {
    const { eventSlug, profileName } = useParams();
    const location = useLocation();
    const navigate = useNavigate();
    const { user, login, register, getAuthHeader } = useAuth();

    const [eventInfo, setEventInfo] = useState(null);
    const [publishedRounds, setPublishedRounds] = useState([]);
    const [dashboard, setDashboard] = useState(null);
    const [eventProfile, setEventProfile] = useState(null);
    const [roundStatuses, setRoundStatuses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [participantAccessClosed, setParticipantAccessClosed] = useState(false);

    const [registrationDialogOpen, setRegistrationDialogOpen] = useState(false);
    const [registerConfirmText, setRegisterConfirmText] = useState('');
    const [registering, setRegistering] = useState(false);

    const [authDialogOpen, setAuthDialogOpen] = useState(false);
    const [authTab, setAuthTab] = useState('login');
    const [authLoading, setAuthLoading] = useState(false);
    const [signupLoading, setSignupLoading] = useState(false);
    const [showAuthPassword, setShowAuthPassword] = useState(false);
    const [showAuthConfirmPassword, setShowAuthConfirmPassword] = useState(false);
    const [loginForm, setLoginForm] = useState({ regno: '', password: '' });
    const [signupForm, setSignupForm] = useState({
        name: '',
        profile_name: '',
        regno: '',
        email: '',
        dob: '',
        gender: '',
        phno: '',
        dept: '',
        password: '',
        confirmPassword: ''
    });

    const [teamName, setTeamName] = useState('');
    const [teamCode, setTeamCode] = useState('');
    const [inviteRegno, setInviteRegno] = useState('');
    const [creatingTeam, setCreatingTeam] = useState(false);
    const [joiningTeam, setJoiningTeam] = useState(false);
    const [inviting, setInviting] = useState(false);

    const [qrDialogOpen, setQrDialogOpen] = useState(false);
    const [qrImageUrl, setQrImageUrl] = useState('');
    const [qrLoading, setQrLoading] = useState(false);
    const [selectedRound, setSelectedRound] = useState(null);

    const [copiedReferral, setCopiedReferral] = useState(false);

    const isLoggedIn = Boolean(user);
    const routeFamily = useMemo(
        () => (location.pathname.startsWith('/event/') && !location.pathname.startsWith('/events/') ? 'event' : 'events'),
        [location.pathname]
    );
    const infoPath = useMemo(() => `/${routeFamily}/${eventSlug}`, [routeFamily, eventSlug]);

    const normalizedRouteProfile = useMemo(() => String(profileName || '').trim().toLowerCase(), [profileName]);
    const myProfileRaw = useMemo(() => String(user?.profile_name || '').trim(), [user?.profile_name]);
    const normalizedMyProfile = useMemo(() => myProfileRaw.toLowerCase(), [myProfileRaw]);

    const isParticipantRoute = Boolean(profileName);
    const hasUserProfile = Boolean(normalizedMyProfile);
    const isParticipantOwner = isLoggedIn && hasUserProfile && normalizedMyProfile === normalizedRouteProfile;
    const participantPath = useMemo(() => {
        if (!eventSlug || !myProfileRaw) return '';
        return `/${routeFamily}/${eventSlug}/${myProfileRaw}`;
    }, [eventSlug, myProfileRaw, routeFamily]);

    const shouldFetchParticipantData = isParticipantRoute && isParticipantOwner;

    const isTeamEvent = eventInfo?.participant_mode === 'team';
    const isRegistered = Boolean(dashboard?.is_registered);
    const eventIsOpen = eventInfo?.status === 'open';
    const confirmationMatches = Boolean(eventInfo?.title) && registerConfirmText.trim() === eventInfo.title;

    const isLeader = useMemo(() => {
        if (!user?.id) return false;
        const members = dashboard?.team_members || [];
        return members.some((member) => member.user_id === user.id && String(member.role).toLowerCase() === 'leader');
    }, [dashboard?.team_members, user?.id]);

    const effectiveStatus = useMemo(() => {
        if (!isRegistered) return 'Not Registered';
        return eventProfile?.status || 'Active';
    }, [eventProfile?.status, isRegistered]);

    const eventDateLabel = useMemo(
        () => getEventDateLabel(eventInfo?.start_date, eventInfo?.end_date),
        [eventInfo?.start_date, eventInfo?.end_date]
    );
    const showParticipantDashboardTab = Boolean(participantPath) && eventIsOpen;
    const eventPosterAssets = useMemo(
        () => filterPosterAssetsByRatio(parsePosterAssets(eventInfo?.poster_url), ['4:5', '5:4']),
        [eventInfo?.poster_url]
    );
    const whatsappUrl = useMemo(() => {
        const value = String(eventInfo?.whatsapp_url || '').trim();
        return value || '';
    }, [eventInfo?.whatsapp_url]);
    const externalUrlLabel = useMemo(() => {
        const value = String(eventInfo?.external_url_name || '').trim();
        return value || 'Join whatsapp channel';
    }, [eventInfo?.external_url_name]);
    const selectedRoundPosterAssets = useMemo(
        () => parsePosterAssets(selectedRound?.round_poster),
        [selectedRound?.round_poster]
    );
    const selectedRoundDateLabel = useMemo(
        () => formatEventDate(selectedRound?.date),
        [selectedRound?.date]
    );

    const fetchData = useCallback(async (options = {}) => {
        const authHeaderOverride = options.authHeaderOverride;
        const resolvedAuthHeader = authHeaderOverride || getAuthHeader();
        setParticipantAccessClosed(false);
        let nextDashboard = null;
        try {
            const eventRes = await axios.get(`${API}/pda/events/${eventSlug}`);
            const nextEvent = eventRes.data;
            setEventInfo(nextEvent);
            try {
                const roundsRes = await axios.get(`${API}/pda/events/${eventSlug}/rounds`);
                setPublishedRounds(Array.isArray(roundsRes?.data) ? roundsRes.data : []);
            } catch {
                setPublishedRounds([]);
            }

            if (isLoggedIn || authHeaderOverride) {
                try {
                    const dashboardRes = await axios.get(`${API}/pda/events/${eventSlug}/dashboard`, { headers: resolvedAuthHeader });
                    nextDashboard = dashboardRes.data;
                    setDashboard(nextDashboard);
                } catch (dashboardError) {
                    setDashboard(null);
                    const statusCode = dashboardError?.response?.status;
                    const detail = String(dashboardError?.response?.data?.detail || '');
                    if (statusCode === 403 && detail === 'Event is closed') {
                        setParticipantAccessClosed(true);
                    }
                }
            } else {
                setDashboard(null);
            }

            if (!shouldFetchParticipantData) {
                setEventProfile(null);
                setRoundStatuses([]);
                return { eventInfo: nextEvent, dashboard: nextDashboard, is_registered: Boolean(nextDashboard?.is_registered) };
            }

            if (!nextDashboard) {
                setEventProfile(null);
                setRoundStatuses([]);
                return { eventInfo: nextEvent, dashboard: null, is_registered: false };
            }

            if (nextDashboard?.is_registered) {
                const [profileRes, roundsRes] = await Promise.allSettled([
                    nextEvent?.participant_mode === 'individual'
                        ? axios.get(`${API}/pda/events/${eventSlug}/me`, { headers: resolvedAuthHeader })
                        : Promise.resolve({ data: null }),
                    axios.get(`${API}/pda/events/${eventSlug}/my-rounds`, { headers: resolvedAuthHeader })
                ]);

                if (profileRes.status === 'fulfilled') {
                    setEventProfile(profileRes.value.data || null);
                } else {
                    const statusCode = profileRes.reason?.response?.status;
                    const detail = String(profileRes.reason?.response?.data?.detail || '');
                    if (statusCode === 403 && detail === 'Event is closed') {
                        setParticipantAccessClosed(true);
                    }
                    setEventProfile(null);
                }

                if (roundsRes.status === 'fulfilled') {
                    setRoundStatuses(roundsRes.value.data || []);
                } else {
                    const statusCode = roundsRes.reason?.response?.status;
                    const detail = String(roundsRes.reason?.response?.data?.detail || '');
                    if (statusCode === 403 && detail === 'Event is closed') {
                        setParticipantAccessClosed(true);
                    }
                    setRoundStatuses([]);
                }
            } else {
                setEventProfile(null);
                setRoundStatuses([]);
            }
            return { eventInfo: nextEvent, dashboard: nextDashboard, is_registered: Boolean(nextDashboard?.is_registered) };
        } catch (error) {
            setEventInfo(null);
            setPublishedRounds([]);
            setDashboard(null);
            setEventProfile(null);
            setRoundStatuses([]);
            toast.error(error?.response?.data?.detail || 'Failed to load event');
            return { eventInfo: null, dashboard: null, is_registered: false };
        } finally {
            setLoading(false);
        }
    }, [eventSlug, getAuthHeader, isLoggedIn, shouldFetchParticipantData]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    useEffect(() => {
        setLoading(true);
    }, [eventSlug]);

    const closeRegistrationDialog = (force = false) => {
        if (!force && (registering || creatingTeam || joiningTeam)) return;
        setRegistrationDialogOpen(false);
        setRegisterConfirmText('');
        setTeamName('');
        setTeamCode('');
    };

    const openAuthDialog = (tab = 'login') => {
        setAuthTab(tab);
        setAuthDialogOpen(true);
    };

    const closeAuthDialog = () => {
        if (authLoading || signupLoading) return;
        setAuthDialogOpen(false);
    };

    const postAuthOpenRegistration = async (authHeaderOverride) => {
        const result = await fetchData({ authHeaderOverride });
        if (eventIsOpen && !Boolean(result?.is_registered)) {
            setRegistrationDialogOpen(true);
        }
    };

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

    const handleLoginSubmit = async (e) => {
        e.preventDefault();
        if (!loginForm.regno.trim() || !loginForm.password) return;
        setAuthLoading(true);
        try {
            const data = await login(loginForm.regno.trim(), loginForm.password);
            if (data?.password_reset_required && data?.reset_token) {
                toast.info('Please reset your password to continue.');
                setAuthDialogOpen(false);
                navigate(`/reset-password?token=${data.reset_token}`);
                return;
            }
            toast.success('Login successful');
            setAuthDialogOpen(false);
            const authHeaderOverride = data?.access_token ? { Authorization: `Bearer ${data.access_token}` } : null;
            await postAuthOpenRegistration(authHeaderOverride);
        } catch (error) {
            console.error('PDA login failed:', error);
            toast.error(getErrorMessage(error, 'Login failed. Please check your credentials.'));
        } finally {
            setAuthLoading(false);
        }
    };

    const handleSignupSubmit = async (e) => {
        e.preventDefault();
        const missingRequiredField = Object.entries(signupForm).some(([key, value]) => {
            if (key === 'dob' || key === 'gender' || key === 'dept') {
                return !value;
            }
            return !String(value).trim();
        });
        if (missingRequiredField) {
            toast.error('Please complete all required fields');
            return;
        }
        if (signupForm.password !== signupForm.confirmPassword) {
            toast.error('Passwords do not match');
            return;
        }
        const normalizedProfileName = String(signupForm.profile_name || '').trim().toLowerCase();
        if (normalizedProfileName && !/^[a-z0-9_]{3,40}$/.test(normalizedProfileName)) {
            toast.error('Profile name must be 3-40 chars: lowercase letters, numbers, underscore');
            return;
        }
        setSignupLoading(true);
        try {
            const result = await register({
                name: signupForm.name.trim(),
                profile_name: normalizedProfileName || undefined,
                regno: signupForm.regno.trim(),
                email: signupForm.email.trim(),
                dob: signupForm.dob,
                gender: signupForm.gender,
                phno: signupForm.phno.trim(),
                dept: signupForm.dept,
                password: signupForm.password
            });
            if (result?.status === 'verification_required') {
                toast.success('Check your email to verify your account, then log in.');
                setAuthTab('login');
                return;
            }
            toast.success('Registration successful!');
            setAuthDialogOpen(false);
            await postAuthOpenRegistration();
        } catch (error) {
            console.error('Signup failed:', error);
            toast.error(getErrorMessage(error, 'Failed to register'));
        } finally {
            setSignupLoading(false);
        }
    };

    const registerIndividual = async () => {
        if (!confirmationMatches || !eventInfo || !eventIsOpen) return;
        setRegistering(true);
        try {
            await axios.post(`${API}/pda/events/${eventSlug}/register`, {}, { headers: getAuthHeader() });
            toast.success('Registered successfully');
            closeRegistrationDialog(true);
            await fetchData();
        } catch (error) {
            toast.error(error?.response?.data?.detail || 'Registration failed');
        } finally {
            setRegistering(false);
        }
    };

    const createTeam = async (e) => {
        e.preventDefault();
        if (!confirmationMatches || !eventIsOpen) return;
        setCreatingTeam(true);
        try {
            await axios.post(`${API}/pda/events/${eventSlug}/teams/create`, { team_name: teamName }, { headers: getAuthHeader() });
            toast.success('Team created');
            closeRegistrationDialog(true);
            await fetchData();
        } catch (error) {
            toast.error(error?.response?.data?.detail || 'Failed to create team');
        } finally {
            setCreatingTeam(false);
        }
    };

    const joinTeam = async (e) => {
        e.preventDefault();
        if (!confirmationMatches || !eventIsOpen) return;
        setJoiningTeam(true);
        try {
            await axios.post(`${API}/pda/events/${eventSlug}/teams/join`, { team_code: teamCode }, { headers: getAuthHeader() });
            toast.success('Joined team');
            closeRegistrationDialog(true);
            await fetchData();
        } catch (error) {
            toast.error(error?.response?.data?.detail || 'Failed to join team');
        } finally {
            setJoiningTeam(false);
        }
    };

    const inviteMember = async (e) => {
        e.preventDefault();
        if (!inviteRegno.trim()) return;
        setInviting(true);
        try {
            await axios.post(`${API}/pda/events/${eventSlug}/team/invite`, { regno: inviteRegno.trim() }, { headers: getAuthHeader() });
            toast.success('Member invited');
            setInviteRegno('');
            await fetchData();
        } catch (error) {
            toast.error(error?.response?.data?.detail || 'Invite failed');
        } finally {
            setInviting(false);
        }
    };

    const loadQr = async () => {
        if (!isLoggedIn || !isRegistered) return;
        setQrLoading(true);
        try {
            const response = await axios.get(`${API}/pda/events/${eventSlug}/qr`, { headers: getAuthHeader() });
            const token = response.data?.qr_token || '';
            if (!token) {
                throw new Error('Token unavailable');
            }
            const dataUrl = await QRCode.toDataURL(token, {
                width: 360,
                margin: 1,
                color: {
                    dark: '#000000',
                    light: '#FFFFFF'
                }
            });
            setQrImageUrl(dataUrl);
            setQrDialogOpen(true);
        } catch (error) {
            toast.error(error?.response?.data?.detail || 'Failed to generate attendance QR');
        } finally {
            setQrLoading(false);
        }
    };

    const copyReferralCode = () => {
        if (!eventProfile?.referral_code) return;
        navigator.clipboard.writeText(eventProfile.referral_code);
        setCopiedReferral(true);
        toast.success('Referral code copied');
        setTimeout(() => setCopiedReferral(false), 1800);
    };

    if (isParticipantRoute && isLoggedIn && hasUserProfile && !isParticipantOwner) {
        return <Navigate to={infoPath} replace />;
    }

    if (loading && !eventInfo) {
        return (
            <div className="min-h-screen bg-[#fffdf5] flex flex-col">
                <PdaHeader />
                <main className="mx-auto w-full max-w-7xl flex-1 min-h-screen px-4 py-8 sm:px-6 lg:px-8">
                    <div className="neo-card animate-pulse">
                        <p className="font-heading text-xl font-bold">Loading event dashboard...</p>
                    </div>
                </main>
                <PdaFooter />
            </div>
        );
    }

    if (!eventInfo) {
        return (
            <div className="min-h-screen bg-[#fffdf5] flex flex-col">
                <PdaHeader />
                <main className="mx-auto w-full max-w-7xl flex-1 min-h-screen px-4 py-8 sm:px-6 lg:px-8">
                    <div className="rounded-md border-4 border-black bg-white p-6 shadow-[8px_8px_0px_0px_#000000]">
                        <h1 className="font-heading text-3xl font-black uppercase tracking-tight">Event not found</h1>
                        <p className="mt-2 text-sm font-medium text-slate-700">This event does not exist or is unavailable.</p>
                        <Link to="/" className="mt-4 inline-block">
                            <Button className="border-2 border-black bg-[#FDE047] text-black shadow-neo">Back to Home</Button>
                        </Link>
                    </div>
                </main>
                <PdaFooter />
            </div>
        );
    }

    if (isParticipantRoute && !eventIsOpen) {
        return <Navigate to={infoPath} replace />;
    }

    return (
        <div className="min-h-screen bg-[#fffdf5] flex flex-col">
            <PdaHeader />
            <main className="mx-auto w-full max-w-7xl flex-1 min-h-screen px-4 py-8 sm:px-6 lg:px-8">
                <section className="mt-6 rounded-md border-4 border-black bg-white p-2 shadow-[8px_8px_0px_0px_#000000]">
                    <div className="flex flex-wrap gap-2">
                        <Link to={infoPath} className="flex-1 min-w-[180px]">
                            <Button
                                variant="outline"
                                className={`w-full border-2 border-black shadow-neo ${!isParticipantRoute ? 'bg-[#FDE047] text-black' : 'bg-white'}`}
                            >
                                Event Info
                            </Button>
                        </Link>
                        {showParticipantDashboardTab ? (
                            <Link to={participantPath} className="flex-1 min-w-[220px]">
                                <Button
                                    variant="outline"
                                    className={`w-full border-2 border-black shadow-neo ${isParticipantRoute ? 'bg-[#8B5CF6] text-white' : 'bg-white'}`}
                                >
                                    Participant Dashboard
                                </Button>
                            </Link>
                        ) : null}
                    </div>
                </section>

                {!isParticipantRoute ? (
                    <section className="mt-6 overflow-hidden rounded-md border-4 border-black bg-white shadow-[8px_8px_0px_0px_#000000]">
                        <div className="grid gap-0 lg:grid-cols-[1.25fr_0.75fr]">
                            <div className="p-6 sm:p-8">
                                <p className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-[#8B5CF6]">{eventInfo.event_code}</p>
                                <div className="mt-2 flex flex-wrap items-center gap-3">
                                    <h1 className="font-heading text-4xl font-black uppercase tracking-tight sm:text-5xl">{eventInfo.title}</h1>
                                    <span className="rounded-md border-2 border-black bg-white px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] shadow-neo">
                                        {eventInfo.status}
                                    </span>
                                    {eventIsOpen ? (
                                        <Button
                                            data-testid="event-overview-register-button"
                                            onClick={() => (isRegistered ? null : (isLoggedIn ? setRegistrationDialogOpen(true) : openAuthDialog('login')))}
                                            className={`border-2 border-black shadow-neo ${isRegistered ? 'bg-slate-200 text-slate-600 cursor-not-allowed' : 'bg-[#8B5CF6] text-white hover:bg-[#7C3AED]'}`}
                                            disabled={isRegistered}
                                        >
                                            {isRegistered ? 'Registered' : 'Register Now'}
                                        </Button>
                                    ) : null}
                                </div>
                                <div className="mt-3 max-w-2xl space-y-2 text-sm font-medium text-slate-700 sm:text-base">
                                    <ParsedDescription
                                        description={eventInfo?.description || ''}
                                        emptyText="No description provided for this event yet."
                                    />
                                </div>
                                <div className="mt-5 flex flex-wrap gap-2">
                                    <span className="rounded-md border-2 border-black bg-[#FDE047] px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] shadow-neo">
                                        {eventInfo.event_type}
                                    </span>
                                    <span className="rounded-md border-2 border-black bg-[#C4B5FD] px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] shadow-neo">
                                        {eventInfo.format}
                                    </span>
                                    <span className="rounded-md border-2 border-black bg-white px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] shadow-neo">
                                        {eventInfo.participant_mode}
                                    </span>
                                    <span className="rounded-md border-2 border-black bg-white px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] shadow-neo">
                                        {eventInfo.round_count} rounds
                                    </span>
                                </div>
                                <div className="mt-3 inline-flex items-center gap-2 rounded-md border-2 border-black bg-white px-3 py-2 text-xs font-bold uppercase tracking-[0.1em] text-slate-700 shadow-neo">
                                    <Calendar className="h-4 w-4 text-[#8B5CF6]" />
                                    <span>{eventDateLabel}</span>
                                </div>
                                {whatsappUrl ? (
                                    <div className="mt-3">
                                        <a href={whatsappUrl} target="_blank" rel="noreferrer">
                                            <Button
                                                data-testid="event-overview-whatsapp-button"
                                                className="border-2 border-black bg-[#DC2626] text-white shadow-neo hover:bg-[#B91C1C]"
                                            >
                                                <ExternalLink className="mr-2 h-4 w-4" />
                                                {externalUrlLabel}
                                            </Button>
                                        </a>
                                    </div>
                                ) : null}
                            </div>
                            <div className="border-t-4 border-black bg-[#11131a] lg:self-start lg:border-l-4 lg:border-t-0">
                                <div className="relative aspect-[4/5] w-full">
                                    {eventPosterAssets.length ? (
                                        <PosterCarousel
                                            assets={eventPosterAssets}
                                            title={eventInfo.title}
                                            className="h-full w-full"
                                            imageClassName="h-full w-full object-cover"
                                        />
                                    ) : (
                                        <div className="flex h-full items-center justify-center bg-[#1b1f2a] p-6 text-center">
                                            <p className="font-heading text-2xl font-black uppercase tracking-tight text-white">{eventInfo.title}</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </section>
                ) : null}

                {!isParticipantRoute ? (
                    <section className="mt-7 rounded-md border-4 border-black bg-white p-6 shadow-[8px_8px_0px_0px_#000000]">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <p className="font-mono text-xs font-bold uppercase tracking-[0.16em] text-[#8B5CF6]">PDA</p>
                                <h2 className="mt-1 font-heading text-3xl font-black uppercase tracking-tight">EXPLORE EVENT</h2>
                            </div>
                        </div>
                        {publishedRounds.length === 0 ? (
                            <p className="mt-4 rounded-md border-2 border-black bg-[#fffdf0] px-4 py-3 text-sm font-medium text-slate-700 shadow-neo">
                                No published rounds yet.
                            </p>
                        ) : (
                            <div className="mt-5 grid gap-5 lg:grid-cols-2">
                                {publishedRounds.map((round) => {
                                    const roundPosterAssets = parsePosterAssets(round?.round_poster);
                                    const roundDateLabel = formatEventDate(round?.date);
                                    return (
                                        <button
                                            type="button"
                                            key={round.id}
                                            className="flex h-[34rem] w-full flex-col overflow-hidden rounded-md border-4 border-black bg-[#fffdf9] p-5 text-left shadow-[6px_6px_0px_0px_#000000] transition-transform duration-150 hover:-translate-y-[2px]"
                                            onClick={() => setSelectedRound(round)}
                                        >
                                            <h3 className="inline-flex w-fit rounded-md border-2 border-black bg-[#FDE047] px-3 py-1 font-heading text-lg font-black uppercase tracking-tight text-black">
                                                {round.name}
                                            </h3>
                                            {roundPosterAssets.length ? (
                                                <div className="mt-3 overflow-hidden rounded-md border-2 border-black bg-[#11131a]">
                                                    <PosterCarousel
                                                        assets={roundPosterAssets}
                                                        title={round.name || `Round ${round.round_no}`}
                                                        className="h-52 w-full"
                                                        imageClassName="h-52 w-full object-cover"
                                                    />
                                                </div>
                                            ) : null}
                                            <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-700">
                                                <span className="rounded-md border-2 border-black bg-white px-2 py-1 shadow-neo">{round.mode}</span>
                                                {roundDateLabel ? (
                                                    <span className="rounded-md border-2 border-black bg-white px-2 py-1 shadow-neo">{roundDateLabel}</span>
                                                ) : null}
                                            </div>
                                            <div className="mt-3 flex-1 overflow-y-auto rounded-md border-2 border-black bg-white p-3 text-sm text-slate-700">
                                                <ParsedDescription
                                                    description={round?.description || ''}
                                                    emptyText="No description provided."
                                                />
                                            </div>
                                            <p className="mt-3 text-center text-xs font-bold uppercase tracking-[0.12em] text-slate-600">
                                                Click to view full details
                                            </p>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </section>
                ) : null}

                {!isParticipantRoute ? (
                    <>
                        {!isLoggedIn ? (
                            <section className="mt-7 rounded-md border-4 border-black bg-white p-6 shadow-[8px_8px_0px_0px_#000000]">
                                <div className="flex flex-wrap items-center justify-between gap-4">
                                    <div>
                                        <p className="font-mono text-xs font-bold uppercase tracking-[0.16em] text-[#8B5CF6]">Public Event Page</p>
                                        <h2 className="mt-1 font-heading text-3xl font-black uppercase tracking-tight">Login required to register</h2>
                                        <p className="mt-2 text-sm font-medium text-slate-700">
                                            Sign in to register and access your participant dashboard.
                                        </p>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <Button
                                            data-testid="event-public-login-register-button"
                                            className="border-2 border-black bg-[#8B5CF6] text-white shadow-neo"
                                            onClick={() => openAuthDialog('login')}
                                        >
                                            <LogIn className="mr-2 h-4 w-4" />
                                            Login to Register
                                        </Button>
                                        <Button
                                            data-testid="event-public-signup-button"
                                            variant="outline"
                                            className="border-2 border-black shadow-neo"
                                            onClick={() => openAuthDialog('signup')}
                                        >
                                            Create Account
                                        </Button>
                                    </div>
                                </div>
                            </section>
                        ) : null}

                    </>
                ) : null}

                {isParticipantRoute && !isLoggedIn ? (
                    <section className="mt-7 rounded-md border-4 border-black bg-white p-6 shadow-[8px_8px_0px_0px_#000000]">
                        <div className="flex flex-wrap items-center justify-between gap-4">
                            <div>
                                <p className="font-mono text-xs font-bold uppercase tracking-[0.16em] text-[#8B5CF6]">Participant Dashboard</p>
                                <h2 className="mt-1 font-heading text-3xl font-black uppercase tracking-tight">Login required</h2>
                                <p className="mt-2 text-sm font-medium text-slate-700">Sign in to access your personal participant dashboard for this event.</p>
                            </div>
                            <Button className="border-2 border-black bg-[#8B5CF6] text-white shadow-neo" onClick={() => openAuthDialog('login')}>
                                <LogIn className="mr-2 h-4 w-4" />
                                Login
                            </Button>
                        </div>
                    </section>
                ) : null}

                {isParticipantRoute && isLoggedIn && !hasUserProfile ? (
                    <section className="mt-7 rounded-md border-4 border-black bg-white p-6 shadow-[8px_8px_0px_0px_#000000]">
                        <h2 className="font-heading text-3xl font-black uppercase tracking-tight">Profile name missing</h2>
                        <p className="mt-2 text-sm font-medium text-slate-700">Your account does not have a profile name yet. Participant route access is unavailable.</p>
                        <Link to={infoPath} className="mt-4 inline-block">
                            <Button className="border-2 border-black bg-[#FDE047] text-black shadow-neo">Back to Event Info</Button>
                        </Link>
                    </section>
                ) : null}

                {isParticipantRoute && isLoggedIn && isParticipantOwner && participantAccessClosed ? (
                    <section className="mt-7 rounded-md border-4 border-black bg-white p-6 shadow-[8px_8px_0px_0px_#000000]">
                        <h2 className="font-heading text-3xl font-black uppercase tracking-tight">Participant dashboard unavailable</h2>
                        <p className="mt-2 text-sm font-medium text-slate-700">This event is closed, so participant dashboard access is disabled.</p>
                        <Link to={infoPath} className="mt-4 inline-block">
                            <Button className="border-2 border-black bg-[#FDE047] text-black shadow-neo">View Event Info</Button>
                        </Link>
                    </section>
                ) : null}

                {isParticipantRoute && isLoggedIn && isParticipantOwner && !participantAccessClosed ? (
                    <>
                        {!isRegistered ? (
                            <section className="mt-7 rounded-md border-4 border-black bg-white p-6 shadow-[8px_8px_0px_0px_#000000]">
                                <div className="flex flex-wrap items-center justify-between gap-4">
                                    <div>
                                        <p className="font-mono text-xs font-bold uppercase tracking-[0.16em] text-[#8B5CF6]">Registration</p>
                                        <h2 className="mt-1 font-heading text-3xl font-black uppercase tracking-tight">You are not registered yet</h2>
                                        <p className="mt-2 text-sm font-medium text-slate-700">
                                            {isTeamEvent
                                                ? 'This is a team event. Register to create or join a team after confirmation.'
                                                : 'Confirm registration to unlock your participant dashboard and round status.'}
                                        </p>
                                    </div>
                                    <Button
                                        data-testid="event-public-open-register-modal-button"
                                        className="border-2 border-black bg-[#FDE047] text-black shadow-neo"
                                        onClick={() => setRegistrationDialogOpen(true)}
                                        disabled={!eventIsOpen}
                                    >
                                        <UserPlus className="mr-2 h-4 w-4" />
                                        {eventIsOpen ? 'Register for Event' : 'Event Closed'}
                                    </Button>
                                </div>
                            </section>
                        ) : null}

                        {isRegistered ? (
                            <>
                                <section className={`mt-7 rounded-md border-4 border-black p-6 shadow-[8px_8px_0px_0px_#000000] ${String(effectiveStatus).toLowerCase() === 'eliminated' ? 'bg-red-50' : 'bg-green-50'}`}>
                                    <div className="flex items-center gap-3">
                                        {statusIcon(effectiveStatus)}
                                        <div>
                                            <h2 className="font-heading text-2xl font-black uppercase tracking-tight">Status: {effectiveStatus}</h2>
                                            <p className="text-sm font-medium text-slate-700">
                                                {String(effectiveStatus).toLowerCase() === 'eliminated'
                                                    ? 'You are currently eliminated in this event.'
                                                    : 'You are currently active in this event.'}
                                            </p>
                                        </div>
                                    </div>
                                </section>

                                <section className="mt-7 grid gap-6 lg:grid-cols-3">
                                    <div className="space-y-6 lg:col-span-1">
                                        <div className="rounded-md border-4 border-black bg-white p-5 shadow-[8px_8px_0px_0px_#000000]">
                                            {!isTeamEvent ? (
                                                <>
                                                    <div className="text-center">
                                                        <Avatar className="mx-auto h-24 w-24 border-4 border-black">
                                                            <AvatarImage src={resolvePosterUrl(user?.image_url)} alt={user?.name || 'Participant'} />
                                                            <AvatarFallback className="bg-[#8B5CF6] text-white text-xl font-bold">
                                                                {String(user?.name || 'U').charAt(0).toUpperCase()}
                                                            </AvatarFallback>
                                                        </Avatar>
                                                        <h3 className="mt-4 font-heading text-2xl font-black uppercase tracking-tight">{user?.name}</h3>
                                                        <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-600">{eventProfile?.department || user?.dept || '-'}</p>
                                                    </div>

                                                    <div className="mt-5 rounded-md border-2 border-black bg-[#C4B5FD] p-4 shadow-neo">
                                                        <Label className="text-xs font-bold uppercase tracking-[0.12em]">Referral Code</Label>
                                                        <div className="mt-2 flex items-center gap-2">
                                                            <div className="flex-1 rounded-md border-2 border-black bg-white px-3 py-2 text-center font-mono text-base font-bold tracking-[0.18em]">
                                                                {eventProfile?.referral_code || '-----'}
                                                            </div>
                                                            <Button
                                                                data-testid="event-dashboard-copy-referral-button"
                                                                onClick={copyReferralCode}
                                                                className="border-2 border-black bg-[#FDE047] text-black shadow-neo"
                                                                disabled={!eventProfile?.referral_code}
                                                            >
                                                                {copiedReferral ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                                                            </Button>
                                                        </div>
                                                        <p className="mt-2 text-xs font-bold uppercase tracking-[0.1em] text-slate-700">
                                                            Referrals: {eventProfile?.referral_count || 0}
                                                        </p>
                                                    </div>

                                                    <div className="mt-5 space-y-2 text-sm font-medium text-slate-700">
                                                        <div className="flex items-center justify-between rounded-md border-2 border-black bg-white px-3 py-2 shadow-neo">
                                                            <span>Register No</span>
                                                            <span className="font-bold text-black">{user?.regno || '-'}</span>
                                                        </div>
                                                        <div className="flex items-center justify-between rounded-md border-2 border-black bg-white px-3 py-2 shadow-neo">
                                                            <span>Gender</span>
                                                            <span className="font-bold text-black">{eventProfile?.gender || user?.gender || '-'}</span>
                                                        </div>
                                                        <div className="flex items-center justify-between rounded-md border-2 border-black bg-white px-3 py-2 shadow-neo">
                                                            <span>Batch</span>
                                                            <span className="font-bold text-black">{eventProfile?.batch || '-'}</span>
                                                        </div>
                                                    </div>
                                                </>
                                            ) : (
                                                <>
                                                    <p className="font-mono text-xs font-bold uppercase tracking-[0.14em] text-[#8B5CF6]">Team Dashboard</p>
                                                    <h3 className="mt-2 font-heading text-2xl font-black uppercase tracking-tight">{dashboard?.team_name || 'Registered Team'}</h3>
                                                    <div className="mt-4 rounded-md border-2 border-black bg-[#C4B5FD] p-4 shadow-neo">
                                                        <p className="text-xs font-bold uppercase tracking-[0.1em]">Team Code</p>
                                                        <p className="mt-2 font-mono text-2xl font-bold tracking-[0.22em]">{dashboard?.team_code || '-----'}</p>
                                                    </div>
                                                    <div className="mt-4 space-y-2">
                                                        {(dashboard?.team_members || []).map((member) => (
                                                            <div key={`${member.user_id}-${member.role}`} className="rounded-md border-2 border-black bg-white px-3 py-2 text-sm font-medium shadow-neo">
                                                                <span className="font-bold text-black">{member.name}</span> ({member.regno}) · {member.role}
                                                            </div>
                                                        ))}
                                                        {(dashboard?.team_members || []).length === 0 ? (
                                                            <p className="rounded-md border-2 border-black bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-neo">
                                                                Team members unavailable.
                                                            </p>
                                                        ) : null}
                                                    </div>
                                                    {isLeader ? (
                                                        <form className="mt-4 space-y-2" onSubmit={inviteMember}>
                                                            <Label className="text-xs font-bold uppercase tracking-[0.12em]">Invite Member (Reg No)</Label>
                                                            <div className="flex gap-2">
                                                                <Input
                                                                    value={inviteRegno}
                                                                    onChange={(e) => setInviteRegno(e.target.value)}
                                                                    placeholder="Enter reg no"
                                                                    className="neo-input"
                                                                    data-testid="event-dashboard-invite-member-input"
                                                                    required
                                                                />
                                                                <Button
                                                                    type="submit"
                                                                    data-testid="event-dashboard-invite-member-button"
                                                                    className="border-2 border-black bg-[#FDE047] text-black shadow-neo"
                                                                    disabled={inviting}
                                                                >
                                                                    {inviting ? 'Inviting...' : 'Invite'}
                                                                </Button>
                                                            </div>
                                                        </form>
                                                    ) : null}
                                                </>
                                            )}
                                        </div>

                                        <div className="rounded-md border-4 border-black bg-white p-5 shadow-[8px_8px_0px_0px_#000000]">
                                            <h3 className="font-heading text-xl font-black uppercase tracking-tight">Quick Actions</h3>
                                            <div className="mt-4 space-y-2">
                                                <Button
                                                    data-testid="event-dashboard-view-qr-button"
                                                    className="w-full border-2 border-black bg-[#8B5CF6] text-white shadow-neo"
                                                    onClick={loadQr}
                                                    disabled={qrLoading}
                                                >
                                                    <QrCode className="mr-2 h-4 w-4" />
                                                    {qrLoading ? 'Generating QR...' : 'View Attendance QR'}
                                                </Button>
                                                {whatsappUrl ? (
                                                    <a href={whatsappUrl} target="_blank" rel="noreferrer" className="block">
                                                        <Button
                                                            data-testid="event-dashboard-whatsapp-button"
                                                            className="w-full border-2 border-black bg-[#DC2626] text-white shadow-neo hover:bg-[#B91C1C]"
                                                        >
                                                            <ExternalLink className="mr-2 h-4 w-4" />
                                                            {externalUrlLabel}
                                                        </Button>
                                                    </a>
                                                ) : null}
                                                <Link to="/" className="block">
                                                    <Button data-testid="event-dashboard-back-home-button" variant="outline" className="w-full border-2 border-black shadow-neo">
                                                        <Calendar className="mr-2 h-4 w-4" />
                                                        Back to Home
                                                    </Button>
                                                </Link>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="lg:col-span-2">
                                        <div className="rounded-md border-4 border-black bg-white p-5 shadow-[8px_8px_0px_0px_#000000]">
                                            <h3 className="font-heading text-2xl font-black uppercase tracking-tight">Round Status</h3>
                                            {roundStatuses.length > 0 ? (
                                                <div className="mt-4 space-y-3">
                                                    {roundStatuses.map((round) => (
                                                        <div key={`${round.round_no}-${round.round_name}`} className="flex flex-wrap items-center justify-between gap-3 rounded-md border-2 border-black bg-[#fffdf0] p-4 shadow-neo">
                                                            <div className="flex items-center gap-3">
                                                                <div className="inline-flex h-11 w-11 items-center justify-center rounded-md border-2 border-black bg-[#8B5CF6] font-heading text-sm font-black text-white shadow-neo">
                                                                    {String(round.round_no || '').slice(-2)}
                                                                </div>
                                                                <div>
                                                                    <p className="font-heading text-lg font-black uppercase tracking-tight">{round.round_name}</p>
                                                                    <p className="text-xs font-medium uppercase tracking-[0.1em] text-slate-600">{round.round_no}</p>
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-2 rounded-md border-2 border-black bg-white px-3 py-2 shadow-neo">
                                                                {statusIcon(round.status)}
                                                                <span className="text-xs font-bold uppercase tracking-[0.12em] text-black">{round.status}</span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="mt-4 rounded-md border-2 border-black bg-[#fffdf0] p-5 text-sm font-medium text-slate-700 shadow-neo">
                                                    Rounds are not published yet for this event.
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </section>
                            </>
                        ) : null}
                    </>
                ) : null}
            </main>

            <Dialog open={authDialogOpen} onOpenChange={(open) => (open ? setAuthDialogOpen(true) : closeAuthDialog())}>
                <DialogContent className="max-h-[90vh] overflow-y-auto border-4 border-black bg-white p-0">
                    <div className="flex border-b-2 border-black">
                        <button
                            type="button"
                            className={`flex-1 px-4 py-3 text-sm font-bold uppercase tracking-[0.14em] ${authTab === 'login' ? 'bg-[#8B5CF6] text-white' : 'bg-white text-black'}`}
                            onClick={() => setAuthTab('login')}
                        >
                            Login
                        </button>
                        <button
                            type="button"
                            className={`flex-1 px-4 py-3 text-sm font-bold uppercase tracking-[0.14em] ${authTab === 'signup' ? 'bg-[#FDE047] text-black' : 'bg-white text-black'}`}
                            onClick={() => setAuthTab('signup')}
                        >
                            Sign Up
                        </button>
                    </div>
                    <div className="p-5 sm:p-7">
                        {authTab === 'login' ? (
                            <>
                                <DialogHeader>
                                    <DialogTitle className="font-heading text-2xl font-black uppercase tracking-tight">
                                        PDA Login
                                    </DialogTitle>
                                </DialogHeader>
                                <p className="mt-2 text-sm font-medium text-slate-700">Use your register number and password to continue.</p>
                                <form onSubmit={handleLoginSubmit} className="mt-6 space-y-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="auth-regno" className="text-xs font-bold uppercase tracking-[0.12em]">Register Number</Label>
                                        <Input
                                            id="auth-regno"
                                            name="regno"
                                            value={loginForm.regno}
                                            onChange={(e) => setLoginForm((prev) => ({ ...prev, regno: e.target.value }))}
                                            required
                                            className={authInputClass}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="auth-password" className="text-xs font-bold uppercase tracking-[0.12em]">Password</Label>
                                        <div className="relative">
                                            <Input
                                                id="auth-password"
                                                name="password"
                                                type={showAuthPassword ? 'text' : 'password'}
                                                value={loginForm.password}
                                                onChange={(e) => setLoginForm((prev) => ({ ...prev, password: e.target.value }))}
                                                required
                                                className={`${authInputClass} pr-12`}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowAuthPassword((prev) => !prev)}
                                                className="absolute right-3 top-1/2 inline-flex -translate-y-1/2 items-center justify-center rounded-md border-2 border-black bg-white p-1 text-black shadow-[2px_2px_0px_0px_#000000]"
                                                aria-label={showAuthPassword ? 'Hide password' : 'Show password'}
                                            >
                                                {showAuthPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                            </button>
                                        </div>
                                    </div>
                                    <div className="flex justify-end gap-2">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            className="border-2 border-black shadow-neo"
                                            onClick={closeAuthDialog}
                                            disabled={authLoading}
                                        >
                                            Cancel
                                        </Button>
                                        <Button
                                            type="submit"
                                            className="border-2 border-black bg-[#8B5CF6] text-white shadow-neo hover:bg-[#7C3AED]"
                                            disabled={authLoading}
                                        >
                                            {authLoading ? 'Logging In...' : 'Login'}
                                        </Button>
                                    </div>
                                </form>
                            </>
                        ) : (
                            <>
                                <DialogHeader>
                                    <DialogTitle className="font-heading text-2xl font-black uppercase tracking-tight">
                                        PDA Signup
                                    </DialogTitle>
                                </DialogHeader>
                                <p className="mt-2 text-sm font-medium text-slate-700">Create your account to register for this event.</p>
                                <form onSubmit={handleSignupSubmit} className="mt-6 grid gap-4 md:grid-cols-2">
                                    <div>
                                        <Label htmlFor="auth-name" className="text-xs font-bold uppercase tracking-[0.12em]">Name *</Label>
                                        <Input
                                            id="auth-name"
                                            name="name"
                                            value={signupForm.name}
                                            onChange={(e) => setSignupForm((prev) => ({ ...prev, name: e.target.value }))}
                                            required
                                            className={authInputClass}
                                        />
                                    </div>
                                    <div>
                                        <Label htmlFor="auth-regno-signup" className="text-xs font-bold uppercase tracking-[0.12em]">Register Number *</Label>
                                        <Input
                                            id="auth-regno-signup"
                                            name="regno"
                                            value={signupForm.regno}
                                            onChange={(e) => setSignupForm((prev) => ({ ...prev, regno: e.target.value }))}
                                            required
                                            className={authInputClass}
                                        />
                                    </div>
                                    <div>
                                        <Label htmlFor="auth-profile-name" className="text-xs font-bold uppercase tracking-[0.12em]">Profile Name *</Label>
                                        <Input
                                            id="auth-profile-name"
                                            name="profile_name"
                                            value={signupForm.profile_name}
                                            onChange={(e) => setSignupForm((prev) => ({ ...prev, profile_name: e.target.value }))}
                                            placeholder="eg: john_doe"
                                            required
                                            className={authInputClass}
                                        />
                                        <p className="mt-1 text-[11px] font-medium text-slate-600">3-40 chars: lowercase letters, numbers, underscore.</p>
                                    </div>
                                    <div>
                                        <Label htmlFor="auth-email" className="text-xs font-bold uppercase tracking-[0.12em]">Email *</Label>
                                        <Input
                                            id="auth-email"
                                            name="email"
                                            type="email"
                                            value={signupForm.email}
                                            onChange={(e) => setSignupForm((prev) => ({ ...prev, email: e.target.value }))}
                                            required
                                            className={authInputClass}
                                        />
                                    </div>
                                    <div>
                                        <Label htmlFor="auth-dob" className="text-xs font-bold uppercase tracking-[0.12em]">Date Of Birth *</Label>
                                        <Input
                                            id="auth-dob"
                                            name="dob"
                                            type="date"
                                            value={signupForm.dob}
                                            onChange={(e) => setSignupForm((prev) => ({ ...prev, dob: e.target.value }))}
                                            required
                                            className={authInputClass}
                                        />
                                    </div>
                                    <div>
                                        <Label htmlFor="auth-gender" className="text-xs font-bold uppercase tracking-[0.12em]">Gender *</Label>
                                        <Select value={signupForm.gender} onValueChange={(value) => setSignupForm((prev) => ({ ...prev, gender: value }))}>
                                            <SelectTrigger id="auth-gender" className={authSelectTriggerClass}>
                                                <SelectValue placeholder="Select gender" />
                                            </SelectTrigger>
                                            <SelectContent className={authSelectContentClass}>
                                                {GENDERS.map((gender) => (
                                                    <SelectItem key={gender.value} value={gender.value}>{gender.label}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div>
                                        <Label htmlFor="auth-phone" className="text-xs font-bold uppercase tracking-[0.12em]">Phone *</Label>
                                        <Input
                                            id="auth-phone"
                                            name="phno"
                                            value={signupForm.phno}
                                            onChange={(e) => setSignupForm((prev) => ({ ...prev, phno: e.target.value }))}
                                            required
                                            className={authInputClass}
                                        />
                                    </div>
                                    <div>
                                        <Label htmlFor="auth-dept" className="text-xs font-bold uppercase tracking-[0.12em]">Department *</Label>
                                        <Select value={signupForm.dept} onValueChange={(value) => setSignupForm((prev) => ({ ...prev, dept: value }))}>
                                            <SelectTrigger id="auth-dept" className={authSelectTriggerClass}>
                                                <SelectValue placeholder="Select department" />
                                            </SelectTrigger>
                                            <SelectContent className={authSelectContentClass}>
                                                {DEPARTMENTS.map((dept) => (
                                                    <SelectItem key={dept.value} value={dept.value}>{dept.label}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div>
                                        <Label htmlFor="auth-password-signup" className="text-xs font-bold uppercase tracking-[0.12em]">Password *</Label>
                                        <div className="relative">
                                            <Input
                                                id="auth-password-signup"
                                                name="password"
                                                type={showAuthPassword ? 'text' : 'password'}
                                                value={signupForm.password}
                                                onChange={(e) => setSignupForm((prev) => ({ ...prev, password: e.target.value }))}
                                                required
                                                className={`${authInputClass} pr-12`}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowAuthPassword((prev) => !prev)}
                                                className="absolute right-3 top-1/2 inline-flex -translate-y-1/2 items-center justify-center rounded-md border-2 border-black bg-white p-1 text-black shadow-[2px_2px_0px_0px_#000000]"
                                                aria-label={showAuthPassword ? 'Hide password' : 'Show password'}
                                            >
                                                {showAuthPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                            </button>
                                        </div>
                                    </div>
                                    <div>
                                        <Label htmlFor="auth-confirm-password" className="text-xs font-bold uppercase tracking-[0.12em]">Confirm Password *</Label>
                                        <div className="relative">
                                            <Input
                                                id="auth-confirm-password"
                                                name="confirmPassword"
                                                type={showAuthConfirmPassword ? 'text' : 'password'}
                                                value={signupForm.confirmPassword}
                                                onChange={(e) => setSignupForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                                                required
                                                className={`${authInputClass} pr-12`}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowAuthConfirmPassword((prev) => !prev)}
                                                className="absolute right-3 top-1/2 inline-flex -translate-y-1/2 items-center justify-center rounded-md border-2 border-black bg-white p-1 text-black shadow-[2px_2px_0px_0px_#000000]"
                                                aria-label={showAuthConfirmPassword ? 'Hide password' : 'Show password'}
                                            >
                                                {showAuthConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                            </button>
                                        </div>
                                    </div>
                                    <div className="md:col-span-2 flex justify-end gap-2">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            className="border-2 border-black shadow-neo"
                                            onClick={closeAuthDialog}
                                            disabled={signupLoading}
                                        >
                                            Cancel
                                        </Button>
                                        <Button
                                            type="submit"
                                            className="border-2 border-black bg-[#FDE047] text-black shadow-neo"
                                            disabled={signupLoading}
                                        >
                                            {signupLoading ? 'Creating...' : 'Create Account'}
                                        </Button>
                                    </div>
                                </form>
                            </>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={registrationDialogOpen} onOpenChange={(open) => (open ? setRegistrationDialogOpen(true) : closeRegistrationDialog())}>
                <DialogContent className="border-4 border-black bg-white">
                    <DialogHeader>
                        <DialogTitle className="font-heading text-2xl font-black uppercase tracking-tight">
                            Register: {eventInfo.title}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <p className="text-sm font-medium text-slate-700">
                            Type <span className="font-bold">{eventInfo.title}</span> to confirm your registration.
                        </p>
                        <div>
                            <Label htmlFor="event-register-confirm" className="text-xs font-bold uppercase tracking-[0.12em]">Confirmation Text</Label>
                            <Input
                                id="event-register-confirm"
                                value={registerConfirmText}
                                onChange={(e) => setRegisterConfirmText(e.target.value)}
                                className="neo-input mt-2"
                                placeholder={eventInfo.title}
                                data-testid="event-register-confirm-input"
                            />
                        </div>

                        {!isTeamEvent ? (
                            <div className="flex justify-end gap-2">
                                <Button data-testid="event-register-cancel-button" variant="outline" className="border-2 border-black shadow-neo" onClick={closeRegistrationDialog} disabled={registering}>
                                    Cancel
                                </Button>
                                <Button
                                    data-testid="event-register-confirm-button"
                                    className="border-2 border-black bg-[#FDE047] text-black shadow-neo"
                                    onClick={registerIndividual}
                                    disabled={!confirmationMatches || registering || !eventIsOpen}
                                >
                                    {registering ? 'Registering...' : 'Confirm Registration'}
                                </Button>
                            </div>
                        ) : (
                            <>
                                {confirmationMatches ? (
                                    <div className="grid gap-4 md:grid-cols-2">
                                        <form className="rounded-md border-2 border-black bg-[#fffdf0] p-4 shadow-neo" onSubmit={createTeam}>
                                            <h4 className="font-heading text-lg font-black uppercase tracking-tight">Create Team</h4>
                                            <Label htmlFor="event-team-name" className="mt-3 block text-xs font-bold uppercase tracking-[0.1em]">Team Name</Label>
                                            <Input
                                                id="event-team-name"
                                                value={teamName}
                                                onChange={(e) => setTeamName(e.target.value)}
                                                className="neo-input mt-2"
                                                data-testid="event-register-create-team-input"
                                                required
                                            />
                                            <Button
                                                type="submit"
                                                data-testid="event-register-create-team-button"
                                                className="mt-3 w-full border-2 border-black bg-[#8B5CF6] text-white shadow-neo"
                                                disabled={creatingTeam || !eventIsOpen}
                                            >
                                                <Users className="mr-2 h-4 w-4" />
                                                {creatingTeam ? 'Creating...' : 'Create Team'}
                                            </Button>
                                        </form>

                                        <form className="rounded-md border-2 border-black bg-[#fffdf0] p-4 shadow-neo" onSubmit={joinTeam}>
                                            <h4 className="font-heading text-lg font-black uppercase tracking-tight">Join Team</h4>
                                            <Label htmlFor="event-team-code" className="mt-3 block text-xs font-bold uppercase tracking-[0.1em]">Team Code</Label>
                                            <Input
                                                id="event-team-code"
                                                value={teamCode}
                                                onChange={(e) => setTeamCode(e.target.value.toUpperCase())}
                                                maxLength={5}
                                                className="neo-input mt-2"
                                                data-testid="event-register-join-team-input"
                                                required
                                            />
                                            <Button
                                                type="submit"
                                                data-testid="event-register-join-team-button"
                                                className="mt-3 w-full border-2 border-black bg-[#FDE047] text-black shadow-neo"
                                                disabled={joiningTeam || !eventIsOpen}
                                            >
                                                {joiningTeam ? 'Joining...' : 'Join Team'}
                                            </Button>
                                        </form>
                                    </div>
                                ) : (
                                    <p className="rounded-md border-2 border-black bg-[#fffdf0] p-3 text-sm font-medium text-slate-700 shadow-neo">
                                        Enter the exact event title to unlock team registration.
                                    </p>
                                )}
                                <div className="flex justify-end">
                                    <Button data-testid="event-register-team-close-button" variant="outline" className="border-2 border-black shadow-neo" onClick={closeRegistrationDialog} disabled={creatingTeam || joiningTeam}>
                                        Close
                                    </Button>
                                </div>
                            </>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={Boolean(selectedRound)} onOpenChange={(open) => (!open ? setSelectedRound(null) : null)}>
                <DialogContent className="max-h-[94vh] max-w-5xl overflow-y-auto border-4 border-black bg-white p-6 sm:p-7">
                    {selectedRound ? (
                        <>
                            <DialogHeader>
                                <DialogTitle className="font-heading text-2xl font-black uppercase tracking-tight">
                                    Round {selectedRound.round_no}
                                </DialogTitle>
                            </DialogHeader>
                            <div className="space-y-5">
                                <h3 className="inline-flex w-fit rounded-md border-2 border-black bg-[#FDE047] px-3 py-1 font-heading text-xl font-black uppercase tracking-tight text-black">
                                    {selectedRound.name}
                                </h3>
                                <div className={`${selectedRoundPosterAssets.length ? 'grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start' : 'space-y-4'}`}>
                                    {selectedRoundPosterAssets.length ? (
                                        <div className="space-y-3">
                                            <div className="overflow-hidden rounded-md border-2 border-black bg-[#11131a]">
                                                <div className="aspect-[1/1.4142] w-full">
                                                    <PosterCarousel
                                                        assets={selectedRoundPosterAssets}
                                                        title={selectedRound.name || `Round ${selectedRound.round_no}`}
                                                        className="h-full w-full"
                                                        imageClassName="h-full w-full object-cover"
                                                        autoPlay={false}
                                                        showArrows
                                                        showPageMeta
                                                    />
                                                </div>
                                            </div>
                                            <div className="flex flex-wrap gap-2 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-700">
                                                <span className="rounded-md border-2 border-black bg-white px-2 py-1 shadow-neo">{selectedRound.state}</span>
                                                <span className="rounded-md border-2 border-black bg-white px-2 py-1 shadow-neo">{selectedRound.mode}</span>
                                                {selectedRoundDateLabel ? (
                                                    <span className="rounded-md border-2 border-black bg-white px-2 py-1 shadow-neo">
                                                        {selectedRoundDateLabel}
                                                    </span>
                                                ) : null}
                                            </div>
                                        </div>
                                    ) : null}
                                    <div className="space-y-4">
                                        {!selectedRoundPosterAssets.length ? (
                                            <div className="flex flex-wrap gap-2 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-700">
                                                <span className="rounded-md border-2 border-black bg-white px-2 py-1 shadow-neo">{selectedRound.state}</span>
                                                <span className="rounded-md border-2 border-black bg-white px-2 py-1 shadow-neo">{selectedRound.mode}</span>
                                                {selectedRoundDateLabel ? (
                                                    <span className="rounded-md border-2 border-black bg-white px-2 py-1 shadow-neo">
                                                        {selectedRoundDateLabel}
                                                    </span>
                                                ) : null}
                                            </div>
                                        ) : null}
                                        <div className="rounded-md border-2 border-black bg-white p-4 text-base text-slate-700">
                                            <ParsedDescription
                                                description={selectedRound?.description || ''}
                                                emptyText="No description provided."
                                            />
                                        </div>
                                        {String(selectedRound?.external_url || '').trim() ? (
                                            <a href={String(selectedRound?.external_url || '').trim()} target="_blank" rel="noreferrer">
                                                <Button className="w-full border-2 border-black bg-[#DC2626] text-white shadow-neo hover:bg-[#B91C1C]">
                                                    <ExternalLink className="mr-2 h-4 w-4" />
                                                    {String(selectedRound?.external_url_name || '').trim() || 'Explore Round'}
                                                </Button>
                                            </a>
                                        ) : null}
                                    </div>
                                </div>
                            </div>
                        </>
                    ) : null}
                </DialogContent>
            </Dialog>

            <Dialog open={qrDialogOpen} onOpenChange={setQrDialogOpen}>
                <DialogContent className="border-4 border-black bg-white">
                    <DialogHeader>
                        <DialogTitle className="font-heading text-2xl font-black uppercase tracking-tight">Attendance QR</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                        <p className="text-sm font-medium text-slate-700">Show this QR at attendance checkpoints for this event.</p>
                        <div className="flex justify-center rounded-md border-2 border-black bg-[#fffdf0] p-4 shadow-neo">
                            {qrImageUrl ? (
                                <img src={qrImageUrl} alt="Attendance QR" className="h-72 w-72 max-w-full" />
                            ) : (
                                <p className="text-sm font-medium text-slate-600">Unable to render QR.</p>
                            )}
                        </div>
                        <p className="text-[11px] font-medium text-slate-500">Token is embedded in the QR image and hidden from plain view.</p>
                        <div className="flex justify-end">
                            <Button
                                data-testid="event-dashboard-close-qr-button"
                                variant="outline"
                                className="border-2 border-black shadow-neo"
                                onClick={() => {
                                    setQrDialogOpen(false);
                                }}
                            >
                                Close
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            <PdaFooter />
        </div>
    );
}
