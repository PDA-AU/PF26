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

const getFilteredTeams = (blockedValues = []) =>
    PDA_RECRUITMENT_TEAMS.filter((team) => !blockedValues.includes(team.value));

const inferRecruitmentDocContentType = (file) => {
    const filename = String(file?.name || '').toLowerCase();
    const rawType = String(file?.type || '').toLowerCase().trim();
    const allowed = new Set([
        'application/pdf',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    ]);

    if (allowed.has(rawType)) return rawType;
    if (filename.endsWith('.pdf')) return 'application/pdf';
    if (filename.endsWith('.pptx')) return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    if (filename.endsWith('.ppt')) return 'application/vnd.ms-powerpoint';
    return rawType || 'application/pdf';
};

export default function PdaRecruit() {
    const { user, loading: authLoading, getAuthHeader, updateUser } = useAuth();

    const [recruitmentOpen, setRecruitmentOpen] = useState(true);
    const [statusLoading, setStatusLoading] = useState(true);
    const [preferredTeam1, setPreferredTeam1] = useState('');
    const [preferredTeam2, setPreferredTeam2] = useState('');
    const [preferredTeam3, setPreferredTeam3] = useState('');
    const [resumeUrl, setResumeUrl] = useState('');
    const [recruitmentDocFile, setRecruitmentDocFile] = useState(null);
    const [selectedDocPreviewUrl, setSelectedDocPreviewUrl] = useState('');
    const [docInputKey, setDocInputKey] = useState(0);
    const [uploadingRecruitmentDoc, setUploadingRecruitmentDoc] = useState(false);
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
        setPreferredTeam1(user?.preferred_team_1 || user?.preferred_team || '');
        setPreferredTeam2(user?.preferred_team_2 || '');
        setPreferredTeam3(user?.preferred_team_3 || '');
        setResumeUrl(user?.resume_url || '');
    }, [user?.preferred_team, user?.preferred_team_1, user?.preferred_team_2, user?.preferred_team_3, user?.resume_url]);

    useEffect(() => {
        if (!recruitmentDocFile) {
            setSelectedDocPreviewUrl('');
            return undefined;
        }
        const previewUrl = URL.createObjectURL(recruitmentDocFile);
        setSelectedDocPreviewUrl(previewUrl);
        return () => URL.revokeObjectURL(previewUrl);
    }, [recruitmentDocFile]);

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

    const uploadRecruitmentDocToS3 = async (file) => {
        if (!file) return;
        const allowedTypes = new Set([
            'application/pdf',
            'application/vnd.ms-powerpoint',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation'
        ]);
        const filename = String(file.name || '').toLowerCase();
        const isValidExtension = filename.endsWith('.pdf') || filename.endsWith('.ppt') || filename.endsWith('.pptx');
        if (!allowedTypes.has(file.type) && !isValidExtension) {
            toast.error('Upload PDF, PPT, or PPTX only');
            return;
        }
        if (file.size > 12 * 1024 * 1024) {
            toast.error('File size exceeds 12MB');
            return;
        }
        if (!user) {
            toast.error('Please login to upload');
            return;
        }
        setUploadingRecruitmentDoc(true);
        try {
            const contentType = inferRecruitmentDocContentType(file);
            const presignRes = await axios.post(
                `${API}/me/recruitment-doc/presign`,
                { filename: file.name, content_type: contentType },
                { headers: getAuthHeader() }
            );
            const { upload_url, public_url, content_type } = presignRes.data || {};
            await axios.put(upload_url, file, {
                headers: { 'Content-Type': content_type || contentType }
            });
            setResumeUrl(public_url);
            return public_url;
        } catch (error) {
            console.error('Recruitment doc upload failed:', error);
            toast.error(getErrorMessage(error, 'Failed to upload file'));
            throw error;
        } finally {
            setUploadingRecruitmentDoc(false);
        }
    };

    const clearSelectedRecruitmentDoc = () => {
        setRecruitmentDocFile(null);
        setDocInputKey((prev) => prev + 1);
    };

    const openConfirm = () => {
        if (!preferredTeam1) {
            toast.error('Please select your first preferred team');
            return;
        }
        if (
            (preferredTeam2 && preferredTeam2 === preferredTeam1) ||
            (preferredTeam3 && (preferredTeam3 === preferredTeam1 || preferredTeam3 === preferredTeam2))
        ) {
            toast.error('Each team preference must be unique');
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
        if (!preferredTeam1) {
            toast.error('Please select your first preferred team');
            return;
        }
        if (
            (preferredTeam2 && preferredTeam2 === preferredTeam1) ||
            (preferredTeam3 && (preferredTeam3 === preferredTeam1 || preferredTeam3 === preferredTeam2))
        ) {
            toast.error('Each team preference must be unique');
            return;
        }
        if (confirmText.trim().toUpperCase() !== 'CONFIRM') {
            toast.error('Type CONFIRM to continue');
            return;
        }

        setSubmitting(true);
        try {
            let effectiveResumeUrl = resumeUrl || null;
            if (recruitmentDocFile) {
                effectiveResumeUrl = await uploadRecruitmentDocToS3(recruitmentDocFile);
            }
            const response = await axios.post(
                `${API}/pda/recruitment/apply`,
                {
                    preferred_team_1: preferredTeam1,
                    preferred_team_2: preferredTeam2 || null,
                    preferred_team_3: preferredTeam3 || null,
                    resume_url: effectiveResumeUrl || null
                },
                { headers: getAuthHeader() }
            );
            const appliedUser = response?.data && typeof response.data === 'object'
                ? { ...response.data, is_applied: true, preferred_team: response.data.preferred_team || preferredTeam1 }
                : { is_applied: true, preferred_team: preferredTeam1, preferred_team_1: preferredTeam1, preferred_team_2: preferredTeam2 || null, preferred_team_3: preferredTeam3 || null, resume_url: effectiveResumeUrl || null };
            updateUser(appliedUser);
            toast.success('Application submitted successfully');
            setConfirmOpen(false);
            clearSelectedRecruitmentDoc();
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

    const selectedTeamMeta = getRecruitmentTeamMeta(preferredTeam1);
    const appliedTeamMeta = getRecruitmentTeamMeta(user?.preferred_team_1 || user?.preferred_team);

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
                                        <p className="mt-1 text-sm text-slate-700">Preferred Team 1: {appliedTeamMeta?.label || user.preferred_team_1 || user.preferred_team || 'Not specified'}</p>
                                        <p className="mt-1 text-sm text-slate-700">Preferred Team 2: {user.preferred_team_2 || 'Not specified'}</p>
                                        <p className="mt-1 text-sm text-slate-700">Preferred Team 3: {user.preferred_team_3 || 'Not specified'}</p>
                                        <p className="mt-1 text-sm text-slate-700">Resume: {user.resume_url ? 'Uploaded' : 'Not provided'}</p>
                                        {user.resume_url ? (
                                            <a href={user.resume_url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-semibold text-[#6D28D9] underline">
                                                Preview uploaded resume
                                            </a>
                                        ) : null}
                                        {appliedTeamMeta?.description ? (
                                            <p className="mt-2 text-xs text-slate-700">{appliedTeamMeta.description}</p>
                                        ) : null}
                                    </div>
                                ) : recruitmentOpen ? (
                                    <div className="grid gap-4 rounded-md border-2 border-black bg-white p-4 shadow-neo">
                                        <div>
                                            <Label htmlFor="recruit-preferred-team-1" className="text-xs font-bold uppercase tracking-[0.12em]">Preferred Team 1</Label>
                                            <Select
                                                value={preferredTeam1}
                                                onValueChange={(value) => {
                                                    setPreferredTeam1(value);
                                                    if (preferredTeam2 === value) setPreferredTeam2('');
                                                    if (preferredTeam3 === value) setPreferredTeam3('');
                                                }}
                                            >
                                                <SelectTrigger id="recruit-preferred-team-1" className="mt-2 h-11 w-full border-2 border-black bg-white text-sm shadow-neo">
                                                    <SelectValue placeholder="Select first preferred team" />
                                                </SelectTrigger>
                                                <SelectContent className="border-2 border-black bg-white shadow-neo">
                                                    {PDA_RECRUITMENT_TEAMS.map((team) => (
                                                        <SelectItem key={team.value} value={team.value}>{team.label}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div>
                                            <Label htmlFor="recruit-preferred-team-2" className="text-xs font-bold uppercase tracking-[0.12em]">Preferred Team 2 (Optional)</Label>
                                            <Select
                                                value={preferredTeam2}
                                                onValueChange={(value) => {
                                                    setPreferredTeam2(value);
                                                    if (preferredTeam3 === value) setPreferredTeam3('');
                                                }}
                                            >
                                                <SelectTrigger id="recruit-preferred-team-2" className="mt-2 h-11 w-full border-2 border-black bg-white text-sm shadow-neo">
                                                    <SelectValue placeholder="Select second preferred team" />
                                                </SelectTrigger>
                                                <SelectContent className="border-2 border-black bg-white shadow-neo">
                                                    {getFilteredTeams([preferredTeam1]).map((team) => (
                                                        <SelectItem key={team.value} value={team.value}>{team.label}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div>
                                            <Label htmlFor="recruit-preferred-team-3" className="text-xs font-bold uppercase tracking-[0.12em]">Preferred Team 3 (Optional)</Label>
                                            <Select value={preferredTeam3} onValueChange={setPreferredTeam3}>
                                                <SelectTrigger id="recruit-preferred-team-3" className="mt-2 h-11 w-full border-2 border-black bg-white text-sm shadow-neo">
                                                    <SelectValue placeholder="Select third preferred team" />
                                                </SelectTrigger>
                                                <SelectContent className="border-2 border-black bg-white shadow-neo">
                                                    {getFilteredTeams([preferredTeam1, preferredTeam2]).map((team) => (
                                                        <SelectItem key={team.value} value={team.value}>{team.label}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div>
                                            <div className="space-y-2">
                                                <Label htmlFor="recruitment-doc-file" className="text-xs font-bold uppercase tracking-[0.12em]">Upload Resume / About Yourself PPT [max 5 slides](Optional)</Label>
                                                <Input
                                                    key={docInputKey}
                                                    id="recruitment-doc-file"
                                                    type="file"
                                                    accept=".pdf,.ppt,.pptx,application/pdf,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation"
                                                    onChange={(e) => setRecruitmentDocFile(e.target.files?.[0] || null)}
                                                    className="h-11 border-2 border-black bg-white text-sm shadow-neo"
                                                />
                                                <p className="text-[11px] text-slate-600">
                                                    File uploads automatically when you confirm submission.
                                                </p>
                                                <p className="text-[11px] text-slate-600">PPT uploads should contain up to 5 slides.</p>
                                                {recruitmentDocFile ? (
                                                    <div className="space-y-1 text-[11px] font-medium text-slate-700">
                                                        <p>Selected: {recruitmentDocFile.name}</p>
                                                        {selectedDocPreviewUrl ? (
                                                            <a href={selectedDocPreviewUrl} target="_blank" rel="noreferrer" className="inline-block text-[#6D28D9] underline">
                                                                Preview selected file
                                                            </a>
                                                        ) : null}
                                                        <button
                                                            type="button"
                                                            onClick={clearSelectedRecruitmentDoc}
                                                            className="block text-left font-semibold text-rose-600 underline"
                                                        >
                                                            Remove selected file
                                                        </button>
                                                    </div>
                                                ) : null}
                                            </div>
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
                                                disabled={!preferredTeam1 || submitting || uploadingRecruitmentDoc}
                                                className="border-2 border-black bg-[#FDE047] text-black shadow-neo hover:bg-[#facc15]"
                                            >
                                                {uploadingRecruitmentDoc ? 'Uploading...' : 'Continue'}
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
                            Preferred Team 1: <span className="font-semibold">{selectedTeamMeta?.label || preferredTeam1 || '-'}</span>
                        </p>
                        <p className="text-sm text-slate-700">
                            Preferred Team 2: <span className="font-semibold">{preferredTeam2 || '-'}</span>
                        </p>
                        <p className="text-sm text-slate-700">
                            Preferred Team 3: <span className="font-semibold">{preferredTeam3 || '-'}</span>
                        </p>
                        <p className="text-sm text-slate-700">
                            Resume File: <span className="font-semibold">{recruitmentDocFile ? recruitmentDocFile.name : (resumeUrl ? 'Uploaded' : 'Not provided')}</span>
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
