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

const TEAMS = [
    'Content Creation',
    'Event Management',
    'Design',
    'Website Design',
    'Public Relations',
    'Podcast',
    'Library'
];

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

    return (
        <div className="min-h-screen bg-[#f7f5f0] flex flex-col">
            <PdaHeader />
            <main className="mx-auto w-full max-w-4xl px-5 py-10 flex-1">
                <Link to="/" className="inline-flex items-center gap-2 text-slate-600 hover:text-black mb-6">
                    <ArrowLeft className="w-5 h-5" /> Back to Home
                </Link>

                <section className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
                    <div>
                        <p className="text-xs uppercase tracking-[0.4em] text-slate-400">PDA Recruitment</p>
                        <h1 className="text-3xl font-heading font-black">Join the PDA Team</h1>
                    </div>

                    <div className="mt-4 rounded-2xl border border-black/10 bg-[#fffdf0] p-4">
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Status</p>
                        {statusLoading ? (
                            <p className="mt-2 text-sm text-slate-600">Checking recruitment status...</p>
                        ) : recruitmentOpen ? (
                            <p className="mt-2 text-sm font-semibold text-emerald-700">Recruitment is open</p>
                        ) : (
                            <p className="mt-2 text-sm font-semibold text-amber-700">Recruitment is currently paused</p>
                        )}
                    </div>

                    <div className="mt-6">
                        {authLoading ? (
                            <p className="text-sm text-slate-600">Checking account status...</p>
                        ) : !user ? (
                            <div className="rounded-2xl border border-black/10 bg-white p-4">
                                <p className="text-sm text-slate-700">Login to apply for PDA recruitment.</p>
                                {recruitmentOpen ? (
                                    <div className="mt-4 flex flex-wrap gap-3">
                                        <Link to="/signup">
                                            <Button className="bg-[#f6c347] text-black hover:bg-[#ffd16b]">Register</Button>
                                        </Link>
                                        <Link to="/login">
                                            <Button variant="outline" className="border-black/20">Login</Button>
                                        </Link>
                                    </div>
                                ) : (
                                    <p className="mt-3 text-sm text-slate-500">Registration is unavailable while recruitment is paused.</p>
                                )}
                            </div>
                        ) : user.is_member ? (
                            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                                <p className="text-sm font-semibold text-emerald-700">You are already a PDA member.</p>
                            </div>
                        ) : user.is_applied ? (
                            <div className="rounded-2xl border border-black/10 bg-[#fffdf0] p-4">
                                <p className="text-sm font-semibold text-slate-800">Application already submitted.</p>
                                <p className="mt-1 text-sm text-slate-600">Preferred Team: {user.preferred_team || 'Not specified'}</p>
                            </div>
                        ) : recruitmentOpen ? (
                            <div className="grid gap-4 rounded-2xl border border-black/10 bg-white p-4">
                                <div>
                                    <Label htmlFor="recruit-preferred-team">Preferred Team</Label>
                                    <Select value={preferredTeam} onValueChange={setPreferredTeam}>
                                        <SelectTrigger id="recruit-preferred-team" className="mt-2 w-full">
                                            <SelectValue placeholder="Select preferred team" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {TEAMS.map((team) => (
                                                <SelectItem key={team} value={team}>{team}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="flex justify-end">
                                    <Button
                                        type="button"
                                        onClick={openConfirm}
                                        disabled={!preferredTeam || submitting}
                                        className="bg-[#f6c347] text-black hover:bg-[#ffd16b]"
                                    >
                                        Continue
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <div className="rounded-2xl border border-black/10 bg-white p-4">
                                <p className="text-sm text-slate-700">Recruitment is currently paused. Please check back later.</p>
                            </div>
                        )}
                    </div>
                </section>
            </main>

            <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <DialogContent className="w-[calc(100vw-1rem)] max-w-md border border-black/10 bg-white p-5 sm:p-6">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-heading font-black">Confirm Recruitment Application</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                        <p className="text-sm text-slate-700">
                            Preferred Team: <span className="font-semibold">{preferredTeam || '-'}</span>
                        </p>
                        <p className="text-sm text-slate-700">
                            Type <span className="font-semibold">CONFIRM</span> to submit your application.
                        </p>
                        <Input
                            value={confirmText}
                            onChange={(e) => setConfirmText(e.target.value)}
                            placeholder="Type CONFIRM"
                        />
                    </div>
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            className="border-black/20"
                            onClick={() => setConfirmOpen(false)}
                            disabled={submitting}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            onClick={submitRecruitment}
                            disabled={submitting || confirmText.trim().toUpperCase() !== 'CONFIRM'}
                            className="bg-[#f6c347] text-black hover:bg-[#ffd16b]"
                        >
                            {submitting ? 'Submitting...' : 'Submit Application'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
