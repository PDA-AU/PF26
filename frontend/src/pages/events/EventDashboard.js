import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { Calendar, QrCode, Users } from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import PdaHeader from '@/components/layout/PdaHeader';
import PdaFooter from '@/components/layout/PdaFooter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function EventDashboard() {
    const { eventSlug } = useParams();
    const { user, getAuthHeader } = useAuth();

    const [eventInfo, setEventInfo] = useState(null);
    const [dashboard, setDashboard] = useState(null);
    const [loading, setLoading] = useState(true);
    const [registrationDialogOpen, setRegistrationDialogOpen] = useState(false);
    const [teamCreateDialogOpen, setTeamCreateDialogOpen] = useState(false);
    const [teamJoinDialogOpen, setTeamJoinDialogOpen] = useState(false);
    const [teamName, setTeamName] = useState('');
    const [teamCode, setTeamCode] = useState('');
    const [inviteRegno, setInviteRegno] = useState('');
    const [qrDialogOpen, setQrDialogOpen] = useState(false);
    const [qrToken, setQrToken] = useState('');

    const isTeamEvent = useMemo(() => eventInfo?.participant_mode === 'team', [eventInfo?.participant_mode]);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [eventRes, dashboardRes] = await Promise.all([
                axios.get(`${API}/pda/events/${eventSlug}`, { headers: getAuthHeader() }),
                axios.get(`${API}/pda/events/${eventSlug}/dashboard`, { headers: getAuthHeader() })
            ]);
            setEventInfo(eventRes.data);
            setDashboard(dashboardRes.data);
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Failed to load event');
            setEventInfo(null);
            setDashboard(null);
        } finally {
            setLoading(false);
        }
    }, [eventSlug, getAuthHeader]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const registerIndividual = async () => {
        try {
            await axios.post(`${API}/pda/events/${eventSlug}/register`, {}, { headers: getAuthHeader() });
            toast.success('Registered successfully');
            setRegistrationDialogOpen(false);
            fetchData();
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Registration failed');
        }
    };

    const createTeam = async (e) => {
        e.preventDefault();
        try {
            await axios.post(`${API}/pda/events/${eventSlug}/teams/create`, { team_name: teamName }, { headers: getAuthHeader() });
            toast.success('Team created');
            setTeamName('');
            setTeamCreateDialogOpen(false);
            fetchData();
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Failed to create team');
        }
    };

    const joinTeam = async (e) => {
        e.preventDefault();
        try {
            await axios.post(`${API}/pda/events/${eventSlug}/teams/join`, { team_code: teamCode }, { headers: getAuthHeader() });
            toast.success('Joined team');
            setTeamCode('');
            setTeamJoinDialogOpen(false);
            fetchData();
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Failed to join team');
        }
    };

    const inviteMember = async (e) => {
        e.preventDefault();
        try {
            await axios.post(`${API}/pda/events/${eventSlug}/team/invite`, { regno: inviteRegno }, { headers: getAuthHeader() });
            toast.success('Member invited/added');
            setInviteRegno('');
            fetchData();
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Invite failed');
        }
    };

    const loadQr = async () => {
        try {
            const response = await axios.get(`${API}/pda/events/${eventSlug}/qr`, { headers: getAuthHeader() });
            setQrToken(response.data?.qr_token || '');
            setQrDialogOpen(true);
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Failed to generate QR token');
        }
    };

    if (!user) {
        return <Navigate to="/login" replace />;
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-[#f3efe6]">
                <PdaHeader />
                <main className="mx-auto max-w-4xl p-6">Loading...</main>
                <PdaFooter />
            </div>
        );
    }

    if (!eventInfo || eventInfo.status !== 'open') {
        return (
            <div className="min-h-screen bg-[#f3efe6]">
                <PdaHeader />
                <main className="mx-auto max-w-4xl p-6">
                    <div className="rounded-2xl border border-black/10 bg-white p-6">
                        <h1 className="text-2xl font-heading font-black">Event Unavailable</h1>
                        <p className="mt-2 text-sm text-slate-600">This event is closed or you do not have access.</p>
                        <Link to="/" className="mt-4 inline-block">
                            <Button className="bg-[#f6c347] text-black hover:bg-[#ffd16b]">Back to Home</Button>
                        </Link>
                    </div>
                </main>
                <PdaFooter />
            </div>
        );
    }

    const isRegistered = Boolean(dashboard?.is_registered);
    const isLeader = Boolean(dashboard?.team_members?.find((member) => member.role === 'leader' && member.user_id === user.id));

    return (
        <div className="min-h-screen bg-[#f3efe6] flex flex-col">
            <PdaHeader />
            <main className="flex-1 mx-auto w-full max-w-6xl p-5">
                <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">{eventInfo.event_code}</p>
                            <h1 className="text-3xl font-heading font-black">{eventInfo.title}</h1>
                            <p className="mt-2 text-sm text-slate-600">{eventInfo.description || 'No description provided.'}</p>
                        </div>
                        <span className="rounded-full border border-[#c99612] bg-[#fff3c4] px-3 py-1 text-xs uppercase tracking-[0.2em] text-[#7a5a00]">Open</span>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2 text-xs">
                        <span className="rounded-md border border-black/10 bg-white px-2 py-1">{eventInfo.event_type}</span>
                        <span className="rounded-md border border-black/10 bg-white px-2 py-1">{eventInfo.format}</span>
                        <span className="rounded-md border border-black/10 bg-white px-2 py-1">{eventInfo.template_option}</span>
                        <span className="rounded-md border border-black/10 bg-white px-2 py-1">{eventInfo.participant_mode}</span>
                        <span className="rounded-md border border-black/10 bg-white px-2 py-1">{eventInfo.round_mode} · {eventInfo.round_count} rounds</span>
                    </div>
                </div>

                <section className="mt-6 grid gap-4 lg:grid-cols-3">
                    <div className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm lg:col-span-2">
                        <h2 className="text-2xl font-heading font-black">Your Event Status</h2>
                        {isRegistered ? (
                            <div className="mt-3 space-y-3">
                                <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-700">
                                    Registered as {dashboard.entity_type === 'team' ? 'Team' : 'Individual'}.
                                </div>
                                {dashboard.entity_type === 'team' ? (
                                    <div className="rounded-xl border border-black/10 bg-[#fffdf7] p-4">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <div>
                                                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Team Code</p>
                                                <p className="font-mono text-xl font-bold">{dashboard.team_code}</p>
                                            </div>
                                            <p className="text-sm text-slate-600">{dashboard.team_name}</p>
                                        </div>
                                        <div className="mt-3">
                                            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Members</p>
                                            <div className="mt-2 space-y-2">
                                                {(dashboard.team_members || []).map((member) => (
                                                    <div key={`${member.user_id}-${member.role}`} className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm">
                                                        {member.name} ({member.regno}) · {member.role}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                        {isLeader ? (
                                            <form className="mt-4 flex gap-2" onSubmit={inviteMember}>
                                                <Input value={inviteRegno} onChange={(e) => setInviteRegno(e.target.value)} placeholder="Invite member by regno" required />
                                                <Button type="submit">Invite</Button>
                                            </form>
                                        ) : null}
                                    </div>
                                ) : null}
                            </div>
                        ) : (
                            <div className="mt-4 space-y-3">
                                <p className="text-sm text-slate-600">You are not registered for this event yet.</p>
                                {!isTeamEvent ? (
                                    <Button className="bg-[#f6c347] text-black hover:bg-[#ffd16b]" onClick={() => setRegistrationDialogOpen(true)}>
                                        Register for Event
                                    </Button>
                                ) : (
                                    <div className="flex flex-wrap gap-2">
                                        <Button className="bg-[#f6c347] text-black hover:bg-[#ffd16b]" onClick={() => setTeamCreateDialogOpen(true)}>
                                            <Users className="mr-2 h-4 w-4" />
                                            Create Team
                                        </Button>
                                        <Button variant="outline" className="border-black/20" onClick={() => setTeamJoinDialogOpen(true)}>
                                            Join Team
                                        </Button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm">
                        <h3 className="text-xl font-heading font-black">Quick Actions</h3>
                        <div className="mt-3 space-y-2">
                            <Button className="w-full bg-[#11131a] text-white hover:bg-[#1f2330]" onClick={loadQr} disabled={!isRegistered}>
                                <QrCode className="mr-2 h-4 w-4" />
                                View QR Token
                            </Button>
                            <Link to="/" className="block">
                                <Button variant="outline" className="w-full border-black/20">
                                    <Calendar className="mr-2 h-4 w-4" />
                                    Back to Home
                                </Button>
                            </Link>
                        </div>
                    </div>
                </section>
            </main>

            <Dialog open={registrationDialogOpen} onOpenChange={setRegistrationDialogOpen}>
                <DialogContent className="border-4 border-black">
                    <DialogHeader>
                        <DialogTitle className="font-heading font-black text-2xl">Confirm Registration</DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-slate-600">Register for {eventInfo.title} as an individual participant?</p>
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" className="border-black/20" onClick={() => setRegistrationDialogOpen(false)}>Cancel</Button>
                        <Button onClick={registerIndividual} className="bg-[#f6c347] text-black hover:bg-[#ffd16b]">Confirm</Button>
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={teamCreateDialogOpen} onOpenChange={setTeamCreateDialogOpen}>
                <DialogContent className="border-4 border-black">
                    <DialogHeader>
                        <DialogTitle className="font-heading font-black text-2xl">Create Team</DialogTitle>
                    </DialogHeader>
                    <form className="space-y-4" onSubmit={createTeam}>
                        <div>
                            <Label>Team Name</Label>
                            <Input value={teamName} onChange={(e) => setTeamName(e.target.value)} required />
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button type="button" variant="outline" className="border-black/20" onClick={() => setTeamCreateDialogOpen(false)}>Cancel</Button>
                            <Button type="submit" className="bg-[#f6c347] text-black hover:bg-[#ffd16b]">Create</Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>

            <Dialog open={teamJoinDialogOpen} onOpenChange={setTeamJoinDialogOpen}>
                <DialogContent className="border-4 border-black">
                    <DialogHeader>
                        <DialogTitle className="font-heading font-black text-2xl">Join Team</DialogTitle>
                    </DialogHeader>
                    <form className="space-y-4" onSubmit={joinTeam}>
                        <div>
                            <Label>Team Code</Label>
                            <Input value={teamCode} onChange={(e) => setTeamCode(e.target.value.toUpperCase())} required maxLength={5} />
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button type="button" variant="outline" className="border-black/20" onClick={() => setTeamJoinDialogOpen(false)}>Cancel</Button>
                            <Button type="submit" className="bg-[#f6c347] text-black hover:bg-[#ffd16b]">Join</Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>

            <Dialog open={qrDialogOpen} onOpenChange={setQrDialogOpen}>
                <DialogContent className="border-4 border-black">
                    <DialogHeader>
                        <DialogTitle className="font-heading font-black text-2xl">Attendance QR Token</DialogTitle>
                    </DialogHeader>
                    <div className="rounded-lg border border-black/10 bg-[#fffdf7] p-3">
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Token</p>
                        <p className="mt-2 break-all font-mono text-xs">{qrToken || 'No token'}</p>
                    </div>
                </DialogContent>
            </Dialog>

            <PdaFooter />
        </div>
    );
}
