import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useAuth } from '@/context/AuthContext';
import PdaHeader from '@/components/layout/PdaHeader';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const PDA_RECRUITMENT_TEAMS = [
    {
        value: 'Website Design',
        label: 'PDA Web Team',
        description: 'Embrace your creativity and expertise! Join our team of web designers, skilled coders, and content curators to deliver seamless and captivating online experiences that leave a lasting impact.'
    },
    {
        value: 'Public Relations',
        label: 'Public Relations',
        description: "Want to be a marketing genius? Join our team as the ultimate bridge, linking diverse departments seamlessly for a successful outreach. You'll help us reach out to our audience and play a vital role in taking PDA to new heights!"
    },
    {
        value: 'Content Creation',
        label: 'Content',
        description: 'Unleash your creativity as a Content Wizard! Join our team to conjure captivating and share-worthy content for magazines and social media, leaving a trail of mesmerized followers behind!'
    },
    {
        value: 'Design',
        label: 'Design',
        description: 'Love making eye-catching designs? Ready to be the creative genius behind captivating PDA videos and posters? Join us now to flaunt your talent and dazzle audiences with your incredible creations!'
    },
    {
        value: 'Event Management',
        label: 'Event Management',
        description: 'Are you a better manager? Want to be a better one? Join us and help us organize successful events! Coordinate with various teams and handle all tasks with ease and make every occasion a grand success!'
    },
    {
        value: 'Podcast',
        label: 'Podcast',
        description: 'Are you a skilled storyteller? Can you make boring lectures into exciting presentations and engaging content for coding, aptitude and other sessions? Want to learn how to deliver effective seminars and learning experiences? Then be a part of our knowledge-sharing journey!'
    },
    {
        value: 'Library',
        label: 'PDA Library Management',
        description: 'Can you turn every setback into success? Are you a skilled organizer and manager? Take charge of the library management, ensure smooth and efficient operations. Join our team and be the librarian extraordinaire!'
    }
];

const getRecruitmentTeamMeta = (teamValue) => {
    if (!teamValue) return null;
    return PDA_RECRUITMENT_TEAMS.find((team) => team.value === teamValue) || null;
};

export default function PdaRecruit() {
    const { user, loading: authLoading, getAuthHeader, updateUser } = useAuth();

    const [recruitmentOpen, setRecruitmentOpen] = useState(true);
    const [statusLoading, setStatusLoading] = useState(true);
    const [preferredTeam, setPreferredTeam] = useState('');
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [confirmText, setConfirmText] = useState('');
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        const fetchRecruitmentStatus = async () => {
            setStatusLoading(true);
            try {
                const res = await axios.get(`${API}/pda/recruitment-status`);
                if (typeof res.data?.recruitment_open === 'boolean') {
                    setRecruitmentOpen(res.data.recruitment_open);
                }
            } catch (error) {
                console.error('Failed to load recruitment status:', error);
                setRecruitmentOpen(false);
            } finally {
                setStatusLoading(false);
            }
        };
        fetchRecruitmentStatus();
    }, []);

    useEffect(() => {
        if (user?.preferred_team) {
            setPreferredTeam(user.preferred_team);
        }
    }, [user?.preferred_team]);

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

    const openConfirm = () => {
        if (!preferredTeam) {
            toast.error('Please select a preferred team');
            return;
        }
        setConfirmText('');
        setConfirmOpen(true);
    };

    const submitRecruitment = async () => {
        if (!user) {
            toast.error('Please login to apply for recruitment');
            return;
        }
        if (!recruitmentOpen) {
            toast.error('Recruitment is currently paused');
            return;
        }
        if (!preferredTeam) {
            toast.error('Please select a preferred team');
            return;
        }
        if (confirmText.trim().toUpperCase() !== 'CONFIRM') {
            toast.error('Type CONFIRM to continue');
            return;
        }

        setSubmitting(true);
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
            setConfirmOpen(false);
        } catch (error) {
            console.error('Recruitment apply failed:', error);
            toast.error(getErrorMessage(error, 'Failed to submit application'));
            if (error?.response?.status === 403) {
                setRecruitmentOpen(false);
            }
        } finally {
            setSubmitting(false);
        }
    };

    const selectedTeamMeta = getRecruitmentTeamMeta(preferredTeam);
    const appliedTeamMeta = getRecruitmentTeamMeta(user?.preferred_team);

    return (
        <div className="min-h-screen bg-[#fffdf5] text-black flex flex-col">
            <PdaHeader />
            <main className="relative isolate flex-1 overflow-hidden">
                <div className="pointer-events-none absolute inset-0 z-0">
                    <div className="absolute left-[6%] top-10 h-16 w-16 rotate-12 border-4 border-black bg-[#8B5CF6]" />
                    <div className="absolute bottom-20 right-8 h-20 w-20 border-4 border-black bg-[#FDE047]" />
                </div>
                <div className="relative z-10 mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
                    <Link
                        to="/"
                        className="mb-6 inline-flex items-center gap-2 rounded-md border-2 border-black bg-[#FDE047] px-3 py-2 text-xs font-bold uppercase tracking-[0.14em] text-black shadow-neo transition-[transform,box-shadow] duration-150 hover:-translate-x-[1px] hover:-translate-y-[1px] hover:shadow-[6px_6px_0px_0px_#000000]"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Back To Home
                    </Link>

                    <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
                        <section className="order-2 rounded-md border-4 border-black bg-white p-5 shadow-[8px_8px_0px_0px_#000000] sm:p-7 lg:order-1">
                            <div>
                                <p className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-[#8B5CF6]">PDA Recruitment</p>
                                <h1 className="mt-2 font-heading text-3xl font-black uppercase tracking-tight sm:text-4xl">Join The PDA Team</h1>
                                <p className="mt-2 text-sm font-medium text-slate-700">
                                    Pick your preferred team and apply for recruitment.
                                </p>
                            </div>

                            <div className="mt-5 rounded-md border-2 border-black bg-[#FFF5CC] p-4 shadow-neo">
                                <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-700">Recruitment Status</p>
                                {statusLoading ? (
                                    <p className="mt-2 text-sm font-medium text-slate-700">Checking recruitment status...</p>
                                ) : recruitmentOpen ? (
                                    <p className="mt-2 text-sm font-bold text-emerald-700">Recruitment is open.</p>
                                ) : (
                                    <p className="mt-2 text-sm font-bold text-amber-700">Recruitment is currently paused.</p>
                                )}
                            </div>

                            <div className="mt-6">
                                {authLoading ? (
                                    <p className="text-sm font-medium text-slate-700">Checking account status...</p>
                                ) : !user ? (
                                    <div className="rounded-md border-2 border-black bg-white p-4 shadow-neo">
                                        <p className="text-sm font-medium text-slate-700">Login to apply for PDA recruitment.</p>
                                        {recruitmentOpen ? (
                                            <div className="mt-4 flex flex-wrap gap-3">
                                                <Link to="/signup">
                                                    <Button className="border-2 border-black bg-[#8B5CF6] text-white shadow-neo hover:bg-[#7C3AED]">
                                                        Register
                                                    </Button>
                                                </Link>
                                                <Link to="/login">
                                                    <Button variant="outline" className="border-2 border-black bg-white text-black shadow-neo hover:bg-[#f4f4f4]">
                                                        Login
                                                    </Button>
                                                </Link>
                                            </div>
                                        ) : (
                                            <p className="mt-3 text-sm font-medium text-slate-600">Registration is unavailable while recruitment is paused.</p>
                                        )}
                                    </div>
                                ) : user.is_member ? (
                                    <div className="rounded-md border-2 border-black bg-[#D9F99D] p-4 shadow-neo">
                                        <p className="text-sm font-bold text-black">You are already a PDA member.</p>
                                    </div>
                                ) : user.is_applied ? (
                                    <div className="rounded-md border-2 border-black bg-[#FFF5CC] p-4 shadow-neo">
                                        <p className="text-sm font-bold text-black">Application already submitted.</p>
                                        <p className="mt-1 text-sm text-slate-700">
                                            Preferred Team: {appliedTeamMeta?.label || user.preferred_team || 'Not specified'}
                                        </p>
                                        {appliedTeamMeta?.description ? (
                                            <p className="mt-2 text-xs text-slate-700">{appliedTeamMeta.description}</p>
                                        ) : null}
                                    </div>
                                ) : recruitmentOpen ? (
                                    <div className="grid gap-4 rounded-md border-2 border-black bg-white p-4 shadow-neo">
                                        <div>
                                            <Label htmlFor="recruit-preferred-team" className="text-xs font-bold uppercase tracking-[0.12em]">Preferred Team</Label>
                                            <Select value={preferredTeam} onValueChange={setPreferredTeam}>
                                                <SelectTrigger id="recruit-preferred-team" className="mt-2 h-11 w-full border-2 border-black bg-white text-sm shadow-neo">
                                                    <SelectValue placeholder="Select preferred team" />
                                                </SelectTrigger>
                                                <SelectContent className="border-2 border-black bg-white shadow-neo">
                                                    {PDA_RECRUITMENT_TEAMS.map((team) => (
                                                        <SelectItem key={team.value} value={team.value}>{team.label}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            {selectedTeamMeta?.description ? (
                                                <div className="mt-3 rounded-md border-2 border-black bg-[#F7F0FF] p-3">
                                                    <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#6D28D9]">
                                                        {selectedTeamMeta.label}
                                                    </p>
                                                    <p className="mt-1 text-xs text-slate-700">{selectedTeamMeta.description}</p>
                                                </div>
                                            ) : null}
                                        </div>

                                        <div className="flex justify-end">
                                            <Button
                                                type="button"
                                                onClick={openConfirm}
                                                disabled={!preferredTeam || submitting}
                                                className="border-2 border-black bg-[#FDE047] text-black shadow-neo hover:bg-[#facc15]"
                                            >
                                                Continue
                                            </Button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="rounded-md border-2 border-black bg-white p-4 shadow-neo">
                                        <p className="text-sm font-medium text-slate-700">Recruitment is currently paused. Please check back later.</p>
                                    </div>
                                )}
                            </div>
                        </section>

                        <section className="order-1 rounded-md border-4 border-black bg-[#11131a] p-5 text-white shadow-[8px_8px_0px_0px_#000000] sm:p-7 lg:order-2">
                            <p className="inline-block rounded-md border-2 border-black bg-[#FDE047] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-black">
                                Recruitment Teams
                            </p>
                            <h2 className="mt-4 font-heading text-3xl font-black uppercase tracking-tight">Find Your Team</h2>
                            <p className="mt-2 text-sm text-white/85">
                                Explore each team and choose where you can contribute best.
                            </p>
                            <div className="mt-5 grid gap-3">
                                {PDA_RECRUITMENT_TEAMS.map((team) => (
                                    <article key={team.value} className="rounded-md border-2 border-black bg-white p-3 text-black shadow-neo">
                                        <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#6D28D9]">{team.label}</p>
                                        <p className="mt-1 text-xs text-slate-700">{team.description}</p>
                                    </article>
                                ))}
                            </div>
                        </section>
                    </div>
                </div>
            </main>

            <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <DialogContent className="w-[calc(100vw-1rem)] max-w-md border-4 border-black bg-white p-5 shadow-[8px_8px_0px_0px_#000000] sm:p-6">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-heading font-black">Confirm Recruitment Application</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                        <p className="text-sm text-slate-700">
                            Preferred Team: <span className="font-semibold">{selectedTeamMeta?.label || preferredTeam || '-'}</span>
                        </p>
                        {selectedTeamMeta?.description ? (
                            <p className="rounded-md border-2 border-black bg-[#F7F0FF] p-3 text-xs text-slate-700">
                                {selectedTeamMeta.description}
                            </p>
                        ) : null}
                        <p className="text-sm text-slate-700">
                            Type <span className="font-semibold">CONFIRM</span> to submit your application.
                        </p>
                        <Input
                            value={confirmText}
                            onChange={(e) => setConfirmText(e.target.value)}
                            placeholder="Type CONFIRM"
                            className="border-2 border-black bg-white shadow-neo"
                        />
                    </div>
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            className="border-2 border-black bg-white text-black shadow-neo hover:bg-[#f4f4f4]"
                            onClick={() => setConfirmOpen(false)}
                            disabled={submitting}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            onClick={submitRecruitment}
                            disabled={submitting || confirmText.trim().toUpperCase() !== 'CONFIRM'}
                            className="border-2 border-black bg-[#FDE047] text-black shadow-neo hover:bg-[#facc15]"
                        >
                            {submitting ? 'Submitting...' : 'Submit Application'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
