import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { ArrowLeft, Camera, Download, Upload } from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import AdminLayout from '@/pages/HomeAdmin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const tabs = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'attendance', label: 'Attendance' },
    { id: 'rounds', label: 'Rounds' },
    { id: 'participants', label: 'Participants' },
    { id: 'leaderboard', label: 'Leaderboard' }
];

const normalizeErrorMessage = (detail, fallback) => {
    if (!detail) return fallback;

    if (typeof detail === 'string') {
        return detail;
    }

    if (Array.isArray(detail)) {
        const messages = detail
            .map((item) => {
                if (typeof item === 'string') return item;
                if (!item || typeof item !== 'object') return null;

                const location = Array.isArray(item.loc)
                    ? item.loc.filter((part) => part !== 'body').join('.')
                    : '';
                if (typeof item.msg === 'string' && location) {
                    return `${location}: ${item.msg}`;
                }
                if (typeof item.msg === 'string') {
                    return item.msg;
                }
                return null;
            })
            .filter(Boolean);

        if (messages.length > 0) {
            return messages.join('; ');
        }
    }

    if (typeof detail === 'object' && typeof detail.msg === 'string') {
        return detail.msg;
    }

    return fallback;
};

const getApiErrorMessage = (error, fallback) => (
    normalizeErrorMessage(error?.response?.data?.detail ?? error?.response?.data?.message, fallback)
);

export default function AdminEventManage() {
    const { eventSlug } = useParams();
    const { getAuthHeader } = useAuth();

    const [activeTab, setActiveTab] = useState('dashboard');
    const [eventInfo, setEventInfo] = useState(null);
    const [dashboard, setDashboard] = useState(null);
    const [participants, setParticipants] = useState([]);
    const [participantSearch, setParticipantSearch] = useState('');
    const [rounds, setRounds] = useState([]);
    const [attendance, setAttendance] = useState([]);
    const [attendanceRoundId, setAttendanceRoundId] = useState('');
    const [selectedRoundId, setSelectedRoundId] = useState(null);
    const [roundRows, setRoundRows] = useState([]);
    const [leaderboard, setLeaderboard] = useState([]);
    const [badges, setBadges] = useState([]);
    const [loading, setLoading] = useState(true);
    const [scanToken, setScanToken] = useState('');
    const [isScanning, setIsScanning] = useState(false);
    const [newRoundForm, setNewRoundForm] = useState({
        round_no: '',
        name: '',
        description: '',
        mode: 'Offline'
    });
    const [badgeForm, setBadgeForm] = useState({
        title: '',
        place: 'Winner',
        score: '',
        image_url: '',
        user_id: '',
        team_id: ''
    });
    const importInputRef = useRef(null);
    const cameraRef = useRef(null);
    const streamRef = useRef(null);
    const detectorTimerRef = useRef(null);

    const selectedRound = useMemo(() => rounds.find((r) => r.id === selectedRoundId) || null, [rounds, selectedRoundId]);
    const selectedCriteria = useMemo(() => {
        if (!selectedRound?.evaluation_criteria || selectedRound.evaluation_criteria.length === 0) {
            return [{ name: 'Score', max_marks: 100 }];
        }
        return selectedRound.evaluation_criteria;
    }, [selectedRound]);

    const fetchEventInfo = useCallback(async () => {
        const [eventRes, dashboardRes] = await Promise.all([
            axios.get(`${API}/pda/events/${eventSlug}`, { headers: getAuthHeader() }),
            axios.get(`${API}/pda-admin/events/${eventSlug}/dashboard`, { headers: getAuthHeader() })
        ]);
        setEventInfo(eventRes.data);
        setDashboard(dashboardRes.data);
    }, [eventSlug, getAuthHeader]);

    const fetchParticipants = useCallback(async () => {
        const response = await axios.get(`${API}/pda-admin/events/${eventSlug}/participants`, {
            headers: getAuthHeader(),
            params: { search: participantSearch || undefined, page_size: 200 }
        });
        setParticipants(response.data || []);
    }, [eventSlug, getAuthHeader, participantSearch]);

    const fetchRounds = useCallback(async () => {
        const response = await axios.get(`${API}/pda-admin/events/${eventSlug}/rounds`, { headers: getAuthHeader() });
        const rows = response.data || [];
        setRounds(rows);
        if (!selectedRoundId && rows.length > 0) {
            setSelectedRoundId(rows[0].id);
        }
    }, [eventSlug, getAuthHeader, selectedRoundId]);

    const fetchAttendance = useCallback(async () => {
        const response = await axios.get(`${API}/pda-admin/events/${eventSlug}/attendance`, {
            headers: getAuthHeader(),
            params: { round_id: attendanceRoundId ? Number(attendanceRoundId) : undefined }
        });
        setAttendance(response.data || []);
    }, [attendanceRoundId, eventSlug, getAuthHeader]);

    const fetchLeaderboard = useCallback(async () => {
        const response = await axios.get(`${API}/pda-admin/events/${eventSlug}/leaderboard`, {
            headers: getAuthHeader(),
            params: { page_size: 200 }
        });
        setLeaderboard(response.data || []);
    }, [eventSlug, getAuthHeader]);

    const fetchBadges = useCallback(async () => {
        const response = await axios.get(`${API}/pda-admin/events/${eventSlug}/badges`, { headers: getAuthHeader() });
        setBadges(response.data || []);
    }, [eventSlug, getAuthHeader]);

    const fetchRoundRows = useCallback(async (roundId) => {
        if (!roundId) return;
        const response = await axios.get(`${API}/pda-admin/events/${eventSlug}/rounds/${roundId}/participants`, { headers: getAuthHeader() });
        setRoundRows(response.data || []);
    }, [eventSlug, getAuthHeader]);

    const bootstrap = useCallback(async () => {
        setLoading(true);
        try {
            await Promise.all([fetchEventInfo(), fetchRounds(), fetchBadges()]);
            await Promise.all([fetchParticipants(), fetchAttendance(), fetchLeaderboard()]);
        } catch (error) {
            toast.error(getApiErrorMessage(error, 'Failed to load event management data'));
        } finally {
            setLoading(false);
        }
    }, [fetchAttendance, fetchBadges, fetchEventInfo, fetchLeaderboard, fetchParticipants, fetchRounds]);

    useEffect(() => {
        bootstrap();
    }, [bootstrap]);

    useEffect(() => {
        if (selectedRoundId) {
            fetchRoundRows(selectedRoundId);
        }
    }, [fetchRoundRows, selectedRoundId]);

    useEffect(() => () => {
        if (detectorTimerRef.current) clearInterval(detectorTimerRef.current);
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
        }
    }, []);

    const markAttendance = async (row, isPresent) => {
        try {
            await axios.post(`${API}/pda-admin/events/${eventSlug}/attendance/mark`, {
                entity_type: row.entity_type,
                user_id: row.entity_type === 'user' ? row.entity_id : null,
                team_id: row.entity_type === 'team' ? row.entity_id : null,
                round_id: attendanceRoundId ? Number(attendanceRoundId) : null,
                is_present: Boolean(isPresent)
            }, { headers: getAuthHeader() });
            fetchAttendance();
        } catch (error) {
            toast.error(getApiErrorMessage(error, 'Failed to update attendance'));
        }
    };

    const markFromToken = async (rawToken) => {
        const token = String(rawToken || '').trim();
        if (!token) return;
        try {
            await axios.post(`${API}/pda-admin/events/${eventSlug}/attendance/scan`, {
                token,
                round_id: attendanceRoundId ? Number(attendanceRoundId) : null
            }, { headers: getAuthHeader() });
            toast.success('Attendance marked');
            setScanToken('');
            fetchAttendance();
        } catch (error) {
            toast.error(getApiErrorMessage(error, 'Invalid token'));
        }
    };

    const stopScanner = () => {
        if (detectorTimerRef.current) {
            clearInterval(detectorTimerRef.current);
            detectorTimerRef.current = null;
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
        }
        setIsScanning(false);
    };

    const startScanner = async () => {
        if (!window.BarcodeDetector) {
            toast.error('QR scanning not supported in this browser');
            return;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } });
            streamRef.current = stream;
            if (cameraRef.current) {
                cameraRef.current.srcObject = stream;
                await cameraRef.current.play();
            }
            const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
            detectorTimerRef.current = setInterval(async () => {
                if (!cameraRef.current) return;
                try {
                    const codes = await detector.detect(cameraRef.current);
                    if (codes?.length && codes[0]?.rawValue) {
                        stopScanner();
                        markFromToken(codes[0].rawValue);
                    }
                } catch (error) {
                    // no-op
                }
            }, 700);
            setIsScanning(true);
        } catch (error) {
            toast.error('Unable to access camera');
        }
    };

    const createRound = async (e) => {
        e.preventDefault();
        try {
            await axios.post(`${API}/pda-admin/events/${eventSlug}/rounds`, {
                round_no: Number(newRoundForm.round_no),
                name: newRoundForm.name,
                description: newRoundForm.description || null,
                mode: newRoundForm.mode
            }, { headers: getAuthHeader() });
            toast.success('Round created');
            setNewRoundForm({ round_no: '', name: '', description: '', mode: 'Offline' });
            fetchRounds();
        } catch (error) {
            toast.error(getApiErrorMessage(error, 'Failed to create round'));
        }
    };

    const updateRoundState = async (roundId, patch) => {
        try {
            await axios.put(`${API}/pda-admin/events/${eventSlug}/rounds/${roundId}`, patch, { headers: getAuthHeader() });
            fetchRounds();
            if (selectedRoundId) fetchRoundRows(selectedRoundId);
        } catch (error) {
            toast.error(getApiErrorMessage(error, 'Failed to update round'));
        }
    };

    const saveScores = async () => {
        if (!selectedRound) return;
        try {
            const payload = roundRows.map((row) => ({
                entity_type: row.entity_type,
                user_id: row.entity_type === 'user' ? row.entity_id : null,
                team_id: row.entity_type === 'team' ? row.entity_id : null,
                criteria_scores: selectedCriteria.reduce((acc, criterion) => {
                    const parsed = Number(row.criteria_scores?.[criterion.name] || 0);
                    acc[criterion.name] = Number.isNaN(parsed) ? 0 : parsed;
                    return acc;
                }, {}),
                is_present: Boolean(row.is_present)
            }));
            await axios.post(`${API}/pda-admin/events/${eventSlug}/rounds/${selectedRound.id}/scores`, payload, { headers: getAuthHeader() });
            toast.success('Scores saved');
            fetchRoundRows(selectedRound.id);
            fetchLeaderboard();
        } catch (error) {
            toast.error(getApiErrorMessage(error, 'Failed to save scores'));
        }
    };

    const changeScore = (entityId, criterionName, value) => {
        if (!/^$|^\d*\.?\d*$/.test(value)) return;
        setRoundRows((prev) => prev.map((row) => row.entity_id === entityId
            ? { ...row, criteria_scores: { ...(row.criteria_scores || {}), [criterionName]: value } }
            : row));
    };

    const changePresence = (entityId, isPresent) => {
        setRoundRows((prev) => prev.map((row) => {
            if (row.entity_id !== entityId) return row;
            if (!isPresent) {
                const zero = selectedCriteria.reduce((acc, criterion) => ({ ...acc, [criterion.name]: 0 }), {});
                return { ...row, is_present: false, criteria_scores: zero };
            }
            return { ...row, is_present: true };
        }));
    };

    const downloadTemplate = async () => {
        if (!selectedRound) return;
        try {
            const response = await axios.get(`${API}/pda-admin/events/${eventSlug}/rounds/${selectedRound.id}/score-template`, {
                headers: getAuthHeader(),
                responseType: 'blob'
            });
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `${eventInfo?.event_code || 'event'}_round_${selectedRound.round_no}_template.xlsx`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch (error) {
            toast.error('Failed to download template');
        }
    };

    const importScores = async (e) => {
        const file = e.target.files?.[0];
        if (!file || !selectedRound) return;
        const formData = new FormData();
        formData.append('file', file);
        try {
            const response = await axios.post(`${API}/pda-admin/events/${eventSlug}/rounds/${selectedRound.id}/import-scores`, formData, {
                headers: { ...getAuthHeader(), 'Content-Type': 'multipart/form-data' }
            });
            toast.success(`Imported ${response.data.imported || 0} rows`);
            if (response.data.errors?.length) {
                response.data.errors.forEach((msg) => toast.error(normalizeErrorMessage(msg, 'Import row failed')));
            }
            fetchRoundRows(selectedRound.id);
            fetchLeaderboard();
        } catch (error) {
            toast.error(getApiErrorMessage(error, 'Failed to import scores'));
        } finally {
            e.target.value = '';
        }
    };

    const exportData = async (kind, format = 'xlsx') => {
        try {
            const response = await axios.get(`${API}/pda-admin/events/${eventSlug}/export/${kind}`, {
                headers: getAuthHeader(),
                params: { format },
                responseType: 'blob'
            });
            const ext = format === 'xlsx' ? 'xlsx' : 'csv';
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `${eventInfo?.event_code || eventSlug}_${kind}.${ext}`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch (error) {
            toast.error('Export failed');
        }
    };

    const addBadge = async (e) => {
        e.preventDefault();
        try {
            await axios.post(`${API}/pda-admin/events/${eventSlug}/badges`, {
                title: badgeForm.title,
                place: badgeForm.place,
                score: badgeForm.score ? Number(badgeForm.score) : null,
                image_url: badgeForm.image_url || null,
                user_id: badgeForm.user_id ? Number(badgeForm.user_id) : null,
                team_id: badgeForm.team_id ? Number(badgeForm.team_id) : null
            }, { headers: getAuthHeader() });
            setBadgeForm({ title: '', place: 'Winner', score: '', image_url: '', user_id: '', team_id: '' });
            fetchBadges();
            toast.success('Badge added');
        } catch (error) {
            toast.error(getApiErrorMessage(error, 'Failed to add badge'));
        }
    };

    if (loading) {
        return (
            <AdminLayout title="Event Admin" subtitle="Loading..." allowEventAdmin>
                <div className="rounded-2xl border border-black/10 bg-white p-6">Loading event management...</div>
            </AdminLayout>
        );
    }

    if (!eventInfo) {
        return (
            <AdminLayout title="Event Admin" subtitle="Unavailable" allowEventAdmin>
                <div className="rounded-2xl border border-black/10 bg-white p-6">Event not found or permission denied.</div>
            </AdminLayout>
        );
    }

    return (
        <AdminLayout title={eventInfo.title} subtitle={`Manage ${eventInfo.event_code} (${eventInfo.slug})`} allowEventAdmin>
            <div className="flex items-center gap-3">
                <Link to="/admin/events">
                    <Button variant="outline" className="border-black/20">
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back
                    </Button>
                </Link>
                <span className="rounded-full border border-black/10 bg-white px-3 py-1 text-xs uppercase tracking-[0.2em]">{eventInfo.status}</span>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActiveTab(tab.id)}
                        className={`rounded-full border px-4 py-2 text-xs uppercase tracking-[0.25em] transition ${activeTab === tab.id ? 'border-[#c99612] bg-[#11131a] text-[#f6c347]' : 'border-black/10 bg-white text-slate-600 hover:border-black/30'}`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {activeTab === 'dashboard' ? (
                <section className="mt-6 space-y-4">
                    <div className="grid gap-4 md:grid-cols-5">
                        <div className="rounded-2xl border border-black/10 bg-white p-4"><p className="text-xs text-slate-500">Registrations</p><p className="text-2xl font-black">{dashboard?.registrations || 0}</p></div>
                        <div className="rounded-2xl border border-black/10 bg-white p-4"><p className="text-xs text-slate-500">Rounds</p><p className="text-2xl font-black">{dashboard?.rounds || 0}</p></div>
                        <div className="rounded-2xl border border-black/10 bg-white p-4"><p className="text-xs text-slate-500">Attendance</p><p className="text-2xl font-black">{dashboard?.attendance_present || 0}</p></div>
                        <div className="rounded-2xl border border-black/10 bg-white p-4"><p className="text-xs text-slate-500">Scores</p><p className="text-2xl font-black">{dashboard?.score_rows || 0}</p></div>
                        <div className="rounded-2xl border border-black/10 bg-white p-4"><p className="text-xs text-slate-500">Badges</p><p className="text-2xl font-black">{dashboard?.badges || 0}</p></div>
                    </div>
                    <div className="rounded-2xl border border-black/10 bg-white p-4">
                        <h3 className="text-lg font-heading font-black">Badges</h3>
                        <form className="mt-3 grid gap-3 md:grid-cols-3" onSubmit={addBadge}>
                            <div className="md:col-span-2">
                                <Label>Title</Label>
                                <Input value={badgeForm.title} onChange={(e) => setBadgeForm((prev) => ({ ...prev, title: e.target.value }))} required />
                            </div>
                            <div>
                                <Label>Place</Label>
                                <Select value={badgeForm.place} onValueChange={(value) => setBadgeForm((prev) => ({ ...prev, place: value }))}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Winner">Winner</SelectItem>
                                        <SelectItem value="Runner">Runner</SelectItem>
                                        <SelectItem value="SpecialMention">Special Mention</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label>Score</Label>
                                <Input type="number" value={badgeForm.score} onChange={(e) => setBadgeForm((prev) => ({ ...prev, score: e.target.value }))} />
                            </div>
                            <div>
                                <Label>User ID</Label>
                                <Input type="number" value={badgeForm.user_id} onChange={(e) => setBadgeForm((prev) => ({ ...prev, user_id: e.target.value }))} />
                            </div>
                            <div>
                                <Label>Team ID</Label>
                                <Input type="number" value={badgeForm.team_id} onChange={(e) => setBadgeForm((prev) => ({ ...prev, team_id: e.target.value }))} />
                            </div>
                            <div className="md:col-span-3">
                                <Label>Image URL</Label>
                                <Input value={badgeForm.image_url} onChange={(e) => setBadgeForm((prev) => ({ ...prev, image_url: e.target.value }))} />
                            </div>
                            <div className="md:col-span-3 flex justify-end">
                                <Button type="submit" className="bg-[#11131a] text-white hover:bg-[#1f2330]">Add Badge</Button>
                            </div>
                        </form>
                        <div className="mt-3 space-y-2">
                            {badges.map((badge) => (
                                <div key={badge.id} className="rounded-xl border border-black/10 bg-[#fffdf7] p-3 text-sm">
                                    <strong>{badge.title}</strong> · {badge.place} · {badge.user_id ? `User #${badge.user_id}` : `Team #${badge.team_id || '-'}`}
                                </div>
                            ))}
                            {badges.length === 0 ? <p className="text-sm text-slate-500">No badges yet.</p> : null}
                        </div>
                    </div>
                </section>
            ) : null}

            {activeTab === 'participants' ? (
                <section className="mt-6 rounded-2xl border border-black/10 bg-white p-4">
                    <div className="flex gap-2">
                        <Input value={participantSearch} onChange={(e) => setParticipantSearch(e.target.value)} placeholder="Search by name/code" />
                        <Button onClick={fetchParticipants}>Search</Button>
                    </div>
                    <div className="mt-3 overflow-x-auto">
                        <table className="w-full border-collapse">
                            <thead>
                                <tr className="border-b border-black/10 text-left text-xs uppercase tracking-[0.2em] text-slate-500">
                                    <th className="py-2">Type</th>
                                    <th className="py-2">Name</th>
                                    <th className="py-2">Code</th>
                                    <th className="py-2">Members</th>
                                </tr>
                            </thead>
                            <tbody>
                                {participants.map((row) => (
                                    <tr key={`${row.entity_type}-${row.entity_id}`} className="border-b border-black/5 text-sm">
                                        <td className="py-2">{row.entity_type}</td>
                                        <td className="py-2">{row.name}</td>
                                        <td className="py-2">{row.regno_or_code}</td>
                                        <td className="py-2">{row.members_count || 1}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {participants.length === 0 ? <p className="mt-3 text-sm text-slate-500">No participants found.</p> : null}
                    </div>
                </section>
            ) : null}

            {activeTab === 'attendance' ? (
                <section className="mt-6 rounded-2xl border border-black/10 bg-white p-4">
                    <div className="flex flex-wrap items-end gap-3">
                        <div>
                            <Label>Round (optional)</Label>
                            <Select value={attendanceRoundId || 'none'} onValueChange={(value) => setAttendanceRoundId(value === 'none' ? '' : value)}>
                                <SelectTrigger className="w-[240px]"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">Event-level attendance</SelectItem>
                                    {rounds.map((round) => <SelectItem key={round.id} value={String(round.id)}>Round {round.round_no}: {round.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <Button onClick={fetchAttendance}>Refresh</Button>
                        <Button variant="outline" className="border-black/20" onClick={startScanner}>
                            <Camera className="mr-2 h-4 w-4" />
                            Scan QR
                        </Button>
                        {isScanning ? <Button variant="outline" className="border-red-400 text-red-600" onClick={stopScanner}>Stop</Button> : null}
                    </div>
                    {isScanning ? (
                        <div className="mt-3 rounded-xl border border-black/10 p-3">
                            <video ref={cameraRef} className="h-64 w-full rounded-lg bg-black object-cover" muted playsInline />
                        </div>
                    ) : null}
                    <div className="mt-3 flex gap-2">
                        <Input value={scanToken} onChange={(e) => setScanToken(e.target.value)} placeholder="Manual token input" />
                        <Button onClick={() => markFromToken(scanToken)}>Mark</Button>
                    </div>
                    <div className="mt-3 overflow-x-auto">
                        <table className="w-full border-collapse">
                            <thead>
                                <tr className="border-b border-black/10 text-left text-xs uppercase tracking-[0.2em] text-slate-500">
                                    <th className="py-2">Type</th>
                                    <th className="py-2">Name</th>
                                    <th className="py-2">Code</th>
                                    <th className="py-2">Present</th>
                                </tr>
                            </thead>
                            <tbody>
                                {attendance.map((row) => (
                                    <tr key={`${row.entity_type}-${row.entity_id}`} className="border-b border-black/5 text-sm">
                                        <td className="py-2">{row.entity_type}</td>
                                        <td className="py-2">{row.name}</td>
                                        <td className="py-2">{row.regno_or_code}</td>
                                        <td className="py-2">
                                            <Checkbox checked={Boolean(row.is_present)} onCheckedChange={(checked) => markAttendance(row, checked === true)} />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            ) : null}

            {activeTab === 'rounds' ? (
                <section className="mt-6 grid gap-4 lg:grid-cols-[320px_1fr]">
                    <div className="rounded-2xl border border-black/10 bg-white p-4">
                        <h3 className="text-lg font-heading font-black">Add Round</h3>
                        <form className="mt-3 space-y-3" onSubmit={createRound}>
                            <div>
                                <Label>Round No</Label>
                                <Input type="number" min={1} value={newRoundForm.round_no} onChange={(e) => setNewRoundForm((prev) => ({ ...prev, round_no: e.target.value }))} required />
                            </div>
                            <div>
                                <Label>Name</Label>
                                <Input value={newRoundForm.name} onChange={(e) => setNewRoundForm((prev) => ({ ...prev, name: e.target.value }))} required />
                            </div>
                            <div>
                                <Label>Description</Label>
                                <Textarea value={newRoundForm.description} onChange={(e) => setNewRoundForm((prev) => ({ ...prev, description: e.target.value }))} />
                            </div>
                            <div>
                                <Label>Mode</Label>
                                <Select value={newRoundForm.mode} onValueChange={(value) => setNewRoundForm((prev) => ({ ...prev, mode: value }))}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Online">Online</SelectItem>
                                        <SelectItem value="Offline">Offline</SelectItem>
                                        <SelectItem value="Hybrid">Hybrid</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <Button type="submit" className="w-full bg-[#11131a] text-white hover:bg-[#1f2330]">Create</Button>
                        </form>
                        <div className="mt-4 space-y-2">
                            {rounds.map((round) => (
                                <button
                                    key={round.id}
                                    type="button"
                                    onClick={() => setSelectedRoundId(round.id)}
                                    className={`w-full rounded-xl border p-3 text-left ${selectedRoundId === round.id ? 'border-[#c99612] bg-[#fff3c4]' : 'border-black/10 bg-[#fffdf7]'}`}
                                >
                                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Round {round.round_no}</p>
                                    <p className="font-semibold">{round.name}</p>
                                    <p className="text-xs text-slate-500">{round.state}{round.is_frozen ? ' · Frozen' : ''}</p>
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="rounded-2xl border border-black/10 bg-white p-4">
                        {selectedRound ? (
                            <>
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <h3 className="text-lg font-heading font-black">Scores - Round {selectedRound.round_no}</h3>
                                    <div className="flex flex-wrap gap-2">
                                        {!selectedRound.is_frozen ? (
                                            <>
                                                <Button variant="outline" className="border-black/20" onClick={downloadTemplate}>
                                                    <Download className="mr-2 h-4 w-4" />
                                                    Template
                                                </Button>
                                                <input ref={importInputRef} type="file" accept=".xlsx" className="hidden" onChange={importScores} />
                                                <Button variant="outline" className="border-black/20" onClick={() => importInputRef.current?.click()}>
                                                    <Upload className="mr-2 h-4 w-4" />
                                                    Import
                                                </Button>
                                                <Button onClick={saveScores}>Save</Button>
                                                <Button variant="outline" className="border-black/20" onClick={() => updateRoundState(selectedRound.id, { state: 'Active' })}>Set Active</Button>
                                                <Button className="bg-[#f6c347] text-black hover:bg-[#ffd16b]" onClick={async () => {
                                                    await axios.post(`${API}/pda-admin/events/${eventSlug}/rounds/${selectedRound.id}/freeze`, {}, { headers: getAuthHeader() });
                                                    fetchRounds();
                                                    fetchRoundRows(selectedRound.id);
                                                }}>Freeze</Button>
                                            </>
                                        ) : (
                                            <Button className="bg-[#f6c347] text-black hover:bg-[#ffd16b]" onClick={async () => {
                                                await axios.post(`${API}/pda-admin/events/${eventSlug}/rounds/${selectedRound.id}/unfreeze`, {}, { headers: getAuthHeader() });
                                                fetchRounds();
                                                fetchRoundRows(selectedRound.id);
                                            }}>Unfreeze</Button>
                                        )}
                                    </div>
                                </div>
                                <div className="mt-3 overflow-x-auto">
                                    <table className="w-full border-collapse">
                                        <thead>
                                            <tr className="border-b border-black/10 text-left text-xs uppercase tracking-[0.2em] text-slate-500">
                                                <th className="py-2">Name</th>
                                                <th className="py-2">Code</th>
                                                <th className="py-2">Present</th>
                                                {selectedCriteria.map((criterion) => <th key={criterion.name} className="py-2">{criterion.name} (/{criterion.max_marks})</th>)}
                                                <th className="py-2">Total</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {roundRows.map((row) => {
                                                const total = selectedCriteria.reduce((sum, criterion) => sum + Number(row.criteria_scores?.[criterion.name] || 0), 0);
                                                return (
                                                    <tr key={`${row.entity_type}-${row.entity_id}`} className="border-b border-black/5 text-sm">
                                                        <td className="py-2">{row.name}</td>
                                                        <td className="py-2">{row.regno_or_code}</td>
                                                        <td className="py-2">
                                                            <Checkbox checked={Boolean(row.is_present)} disabled={selectedRound.is_frozen} onCheckedChange={(checked) => changePresence(row.entity_id, checked === true)} />
                                                        </td>
                                                        {selectedCriteria.map((criterion) => (
                                                            <td key={criterion.name} className="py-2">
                                                                <Input
                                                                    type="number"
                                                                    min={0}
                                                                    max={criterion.max_marks}
                                                                    value={row.criteria_scores?.[criterion.name] ?? 0}
                                                                    disabled={selectedRound.is_frozen || !row.is_present}
                                                                    onChange={(e) => changeScore(row.entity_id, criterion.name, e.target.value)}
                                                                />
                                                            </td>
                                                        ))}
                                                        <td className="py-2 font-semibold">{total}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        ) : (
                            <p className="text-sm text-slate-500">Select a round.</p>
                        )}
                    </div>
                </section>
            ) : null}

            {activeTab === 'leaderboard' ? (
                <section className="mt-6 rounded-2xl border border-black/10 bg-white p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-lg font-heading font-black">Leaderboard</h3>
                        <div className="flex gap-2">
                            <Button variant="outline" className="border-black/20" onClick={() => exportData('participants')}>Export Participants</Button>
                            <Button variant="outline" className="border-black/20" onClick={() => exportData('leaderboard')}>Export Leaderboard</Button>
                        </div>
                    </div>
                    <div className="mt-3 overflow-x-auto">
                        <table className="w-full border-collapse">
                            <thead>
                                <tr className="border-b border-black/10 text-left text-xs uppercase tracking-[0.2em] text-slate-500">
                                    <th className="py-2">Rank</th>
                                    <th className="py-2">Type</th>
                                    <th className="py-2">Name</th>
                                    <th className="py-2">Code</th>
                                    <th className="py-2">Attendance</th>
                                    <th className="py-2">Score</th>
                                </tr>
                            </thead>
                            <tbody>
                                {leaderboard.map((row) => (
                                    <tr key={`${row.entity_type}-${row.entity_id}`} className="border-b border-black/5 text-sm">
                                        <td className="py-2">{row.rank}</td>
                                        <td className="py-2">{row.entity_type}</td>
                                        <td className="py-2">{row.name}</td>
                                        <td className="py-2">{row.regno_or_code}</td>
                                        <td className="py-2">{row.attendance_count}</td>
                                        <td className="py-2">{Number(row.cumulative_score || 0).toFixed(2)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            ) : null}
        </AdminLayout>
    );
}
