import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import axios from 'axios';
import QRCode from 'qrcode';
import { toast } from 'sonner';
import {
    Calendar,
    CheckCircle2,
    Clock3,
    Copy,
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const resolveImageUrl = (url) => {
    if (!url) return undefined;
    if (String(url).startsWith('http')) return url;
    return `${process.env.REACT_APP_BACKEND_URL}${String(url).startsWith('/') ? '' : '/'}${url}`;
};

const statusIcon = (value) => {
    const normalized = String(value || '').toLowerCase();
    if (normalized === 'active') return <CheckCircle2 className="h-5 w-5 text-green-600" />;
    if (normalized === 'eliminated' || normalized === 'absent') return <XCircle className="h-5 w-5 text-red-600" />;
    return <Clock3 className="h-5 w-5 text-slate-500" />;
};

const renderInlineDescription = (text, keyPrefix) => {
    const tokens = String(text || '').split(/(\*[^*]+\*)/g);
    return tokens.filter(Boolean).map((token, index) => {
        if (token.startsWith('*') && token.endsWith('*') && token.length > 2) {
            return (
                <strong key={`${keyPrefix}-b-${index}`} className="font-extrabold text-black">
                    {token.slice(1, -1)}
                </strong>
            );
        }
        return <React.Fragment key={`${keyPrefix}-t-${index}`}>{token}</React.Fragment>;
    });
};

const splitSentences = (value) => {
    const normalized = String(value || '').trim();
    if (!normalized) return [];
    const chunks = [];
    let segmentStart = 0;

    const isAlphaNum = (char) => /[A-Za-z0-9]/.test(char);
    const isWhitespace = (char) => /\s/.test(char);

    for (let index = 0; index < normalized.length; index += 1) {
        const char = normalized[index];
        if (!/[.!?]/.test(char)) continue;

        let cursor = index + 1;
        let sawWhitespace = false;
        while (cursor < normalized.length) {
            const lookAheadChar = normalized[cursor];
            if (isWhitespace(lookAheadChar)) {
                sawWhitespace = true;
                cursor += 1;
                continue;
            }
            if (isAlphaNum(lookAheadChar) && sawWhitespace) {
                const part = normalized.slice(segmentStart, cursor).trim();
                if (part) chunks.push(part);
                segmentStart = cursor;
            }
            break;
        }
    }

    const tail = normalized.slice(segmentStart).trim();
    if (tail) chunks.push(tail);
    return chunks;
};

const parseDescriptionBlocks = (description) => {
    const source = String(description || '').replace(/\r/g, '');
    const rawLines = source.split('\n');
    const blocks = [];
    let listBuffer = [];

    const flushList = () => {
        if (!listBuffer.length) return;
        blocks.push({ type: 'list', items: [...listBuffer] });
        listBuffer = [];
    };

    rawLines.forEach((rawLine) => {
        const line = rawLine.trim();
        if (!line) {
            flushList();
            return;
        }
        if (line.startsWith('-')) {
            const cleaned = line.replace(/^-+\s*/, '').trim();
            if (cleaned) listBuffer.push(cleaned);
            return;
        }
        flushList();
        splitSentences(line).forEach((sentence) => {
            blocks.push({ type: 'text', text: sentence });
        });
    });

    flushList();
    return blocks;
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
    const { eventSlug } = useParams();
    const { user, getAuthHeader } = useAuth();

    const [eventInfo, setEventInfo] = useState(null);
    const [dashboard, setDashboard] = useState(null);
    const [eventProfile, setEventProfile] = useState(null);
    const [roundStatuses, setRoundStatuses] = useState([]);
    const [loading, setLoading] = useState(true);

    const [registrationDialogOpen, setRegistrationDialogOpen] = useState(false);
    const [registerConfirmText, setRegisterConfirmText] = useState('');
    const [registering, setRegistering] = useState(false);

    const [teamName, setTeamName] = useState('');
    const [teamCode, setTeamCode] = useState('');
    const [inviteRegno, setInviteRegno] = useState('');
    const [creatingTeam, setCreatingTeam] = useState(false);
    const [joiningTeam, setJoiningTeam] = useState(false);
    const [inviting, setInviting] = useState(false);

    const [qrDialogOpen, setQrDialogOpen] = useState(false);
    const [qrImageUrl, setQrImageUrl] = useState('');
    const [qrLoading, setQrLoading] = useState(false);

    const [copiedReferral, setCopiedReferral] = useState(false);

    const isLoggedIn = Boolean(user);
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

    const descriptionBlocks = useMemo(() => parseDescriptionBlocks(eventInfo?.description || ''), [eventInfo?.description]);
    const eventDateLabel = useMemo(
        () => getEventDateLabel(eventInfo?.start_date, eventInfo?.end_date),
        [eventInfo?.start_date, eventInfo?.end_date]
    );

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const eventRes = await axios.get(`${API}/pda/events/${eventSlug}`);
            const nextEvent = eventRes.data;
            setEventInfo(nextEvent);

            if (!isLoggedIn) {
                setDashboard(null);
                setEventProfile(null);
                setRoundStatuses([]);
                return;
            }

            let nextDashboard = null;
            try {
                const dashboardRes = await axios.get(`${API}/pda/events/${eventSlug}/dashboard`, { headers: getAuthHeader() });
                nextDashboard = dashboardRes.data;
                setDashboard(nextDashboard);
            } catch (dashboardError) {
                setDashboard(null);
                setEventProfile(null);
                setRoundStatuses([]);
                const statusCode = dashboardError?.response?.status;
                if (statusCode !== 401 && statusCode !== 404) {
                    toast.error(dashboardError?.response?.data?.detail || 'Failed to load your event dashboard');
                }
                return;
            }

            if (nextDashboard?.is_registered) {
                const [profileRes, roundsRes] = await Promise.allSettled([
                    nextEvent?.participant_mode === 'individual'
                        ? axios.get(`${API}/pda/events/${eventSlug}/me`, { headers: getAuthHeader() })
                        : Promise.resolve({ data: null }),
                    axios.get(`${API}/pda/events/${eventSlug}/my-rounds`, { headers: getAuthHeader() })
                ]);
                if (profileRes.status === 'fulfilled') {
                    setEventProfile(profileRes.value.data || null);
                } else {
                    setEventProfile(null);
                }
                if (roundsRes.status === 'fulfilled') {
                    setRoundStatuses(roundsRes.value.data || []);
                } else {
                    setRoundStatuses([]);
                }
            } else {
                setEventProfile(null);
                setRoundStatuses([]);
            }
        } catch (error) {
            setEventInfo(null);
            setDashboard(null);
            setEventProfile(null);
            setRoundStatuses([]);
            toast.error(error?.response?.data?.detail || 'Failed to load event');
        } finally {
            setLoading(false);
        }
    }, [eventSlug, getAuthHeader, isLoggedIn]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const closeRegistrationDialog = (force = false) => {
        if (!force && (registering || creatingTeam || joiningTeam)) return;
        setRegistrationDialogOpen(false);
        setRegisterConfirmText('');
        setTeamName('');
        setTeamCode('');
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

    if (loading) {
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

    return (
        <div className="min-h-screen bg-[#fffdf5] flex flex-col">
            <PdaHeader />
            <main className="mx-auto w-full max-w-7xl flex-1 min-h-screen px-4 py-8 sm:px-6 lg:px-8">
                <section className="overflow-hidden rounded-md border-4 border-black bg-white shadow-[8px_8px_0px_0px_#000000]">
                    <div className="grid gap-0 lg:grid-cols-[1.25fr_0.75fr]">
                        <div className="p-6 sm:p-8">
                            <p className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-[#8B5CF6]">{eventInfo.event_code}</p>
                            <h1 className="mt-2 font-heading text-4xl font-black uppercase tracking-tight sm:text-5xl">{eventInfo.title}</h1>
                            <div className="mt-3 max-w-2xl space-y-2 text-sm font-medium text-slate-700 sm:text-base">
                                {descriptionBlocks.length > 0 ? (
                                    descriptionBlocks.map((block, index) => {
                                        if (block.type === 'list') {
                                            return (
                                                <ul key={`desc-list-${index}`} className="list-disc space-y-1 pl-5">
                                                    {block.items.map((item, itemIndex) => (
                                                        <li key={`desc-list-${index}-${itemIndex}`}>
                                                            {renderInlineDescription(item, `desc-list-${index}-${itemIndex}`)}
                                                        </li>
                                                    ))}
                                                </ul>
                                            );
                                        }
                                        return (
                                            <p key={`desc-text-${index}`}>
                                                {renderInlineDescription(block.text, `desc-text-${index}`)}
                                            </p>
                                        );
                                    })
                                ) : (
                                    <p>No description provided for this event yet.</p>
                                )}
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
                        </div>
                        <div className="border-t-4 border-black bg-[#11131a] lg:self-start lg:border-l-4 lg:border-t-0">
                            <div className="relative aspect-[4/5] w-full">
                                {eventInfo.poster_url ? (
                                    <img
                                        src={resolveImageUrl(eventInfo.poster_url)}
                                        alt={`${eventInfo.title} poster`}
                                        className="h-full w-full object-cover opacity-70"
                                    />
                                ) : (
                                    <div className="flex h-full items-center justify-center bg-[#1b1f2a] p-6 text-center">
                                        <p className="font-heading text-2xl font-black uppercase tracking-tight text-white">{eventInfo.title}</p>
                                    </div>
                                )}
                                <div className="absolute right-4 top-4 rounded-md border-2 border-black bg-white px-3 py-1 font-mono text-xs font-bold uppercase tracking-[0.14em] shadow-neo">
                                    {eventInfo.status}
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {!isLoggedIn ? (
                    <section className="mt-7 rounded-md border-4 border-black bg-white p-6 shadow-[8px_8px_0px_0px_#000000]">
                        <div className="flex flex-wrap items-center justify-between gap-4">
                            <div>
                                <p className="font-mono text-xs font-bold uppercase tracking-[0.16em] text-[#8B5CF6]">Public Event Page</p>
                                <h2 className="mt-1 font-heading text-3xl font-black uppercase tracking-tight">Login required to register</h2>
                                <p className="mt-2 text-sm font-medium text-slate-700">
                                    Sign in to register, view your status, QR attendance pass, and round-wise progression.
                                </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <Link to="/login" state={{ redirectTo: `/event/${eventSlug}` }}>
                                    <Button
                                        data-testid="event-public-login-register-button"
                                        className="border-2 border-black bg-[#8B5CF6] text-white shadow-neo"
                                    >
                                        <LogIn className="mr-2 h-4 w-4" />
                                        Login to Register
                                    </Button>
                                </Link>
                                <Link to="/signup">
                                    <Button data-testid="event-public-signup-button" variant="outline" className="border-2 border-black shadow-neo">
                                        Create Account
                                    </Button>
                                </Link>
                            </div>
                        </div>
                    </section>
                ) : null}

                {isLoggedIn && !isRegistered ? (
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

                {isLoggedIn && isRegistered ? (
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
                                                    <AvatarImage src={resolveImageUrl(user?.image_url)} alt={user?.name || 'Participant'} />
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
            </main>

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
