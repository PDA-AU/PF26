import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import jsQR from 'jsqr';
import { toast } from 'sonner';
import { ArrowLeft, Calendar, Camera, Download, LayoutDashboard, ListChecks, LogOut, Sparkles, Trophy, Upload, Users } from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

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

const statusPillClass = (value) => (
    String(value || '').toLowerCase() === 'active'
        ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
        : 'border-rose-300 bg-rose-50 text-rose-700'
);

export default function AdminEventManage() {
    const { eventSlug, roundId } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const { user, logout, getAuthHeader, canAccessEvent } = useAuth();

    const activeTab = useMemo(() => {
        const path = location.pathname;
        if (path.includes('/attendance')) return 'attendance';
        if (path.includes('/participants')) return 'participants';
        if (path.includes('/leaderboard')) return 'leaderboard';
        if (path.includes('/logs')) return 'logs';
        if (path.includes('/rounds/') && path.endsWith('/scoring')) return 'scoring';
        if (path.includes('/rounds')) return 'rounds';
        return 'dashboard';
    }, [location.pathname]);

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
    const [shortlistForm, setShortlistForm] = useState({
        round_id: '',
        elimination_type: 'top_k',
        elimination_value: '',
        eliminate_absent: false
    });
    const [logs, setLogs] = useState([]);
    const [logLimit, setLogLimit] = useState('50');
    const [logOffset, setLogOffset] = useState(0);
    const [logFilters, setLogFilters] = useState({
        action: '',
        method: '',
        path_contains: ''
    });
    const importInputRef = useRef(null);
    const cameraRef = useRef(null);
    const streamRef = useRef(null);
    const detectorTimerRef = useRef(null);
    const detectorRef = useRef(null);
    const canvasRef = useRef(null);
    const canvasCtxRef = useRef(null);
    const detectingRef = useRef(false);
    const qrImageInputRef = useRef(null);
    const isSuperAdmin = Boolean(user?.is_superadmin);

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

    const fetchLogs = useCallback(async () => {
        const limit = Number(logLimit) || 50;
        const response = await axios.get(`${API}/pda-admin/events/${eventSlug}/logs`, {
            headers: getAuthHeader(),
            params: {
                limit,
                offset: logOffset,
                action: logFilters.action || undefined,
                method: logFilters.method || undefined,
                path_contains: logFilters.path_contains || undefined
            }
        });
        setLogs(response.data || []);
    }, [eventSlug, getAuthHeader, logFilters.action, logFilters.method, logFilters.path_contains, logLimit, logOffset]);

    const tabPath = useCallback((tabId) => {
        if (tabId === 'scoring') {
            if (selectedRoundId) {
                return `/admin/events/${eventSlug}/rounds/${selectedRoundId}/scoring`;
            }
            return `/admin/events/${eventSlug}/rounds`;
        }
        return `/admin/events/${eventSlug}/${tabId}`;
    }, [eventSlug, selectedRoundId]);

    const handleTabSelect = useCallback((tabId) => {
        navigate(tabPath(tabId));
    }, [navigate, tabPath]);

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

    useEffect(() => {
        if (roundId) {
            const parsed = Number(roundId);
            if (!Number.isNaN(parsed) && parsed > 0) {
                setSelectedRoundId(parsed);
            }
        }
    }, [roundId]);

    useEffect(() => {
        if (!shortlistForm.round_id && rounds.length > 0) {
            setShortlistForm((prev) => ({ ...prev, round_id: String(rounds[0].id) }));
        }
    }, [rounds, shortlistForm.round_id]);

    useEffect(() => {
        if (activeTab === 'logs') {
            fetchLogs().catch(() => {
                toast.error('Failed to load logs');
            });
        }
    }, [activeTab, fetchLogs]);

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
        detectorRef.current = null;
        detectingRef.current = false;
        if (cameraRef.current) {
            cameraRef.current.srcObject = null;
        }
        setIsScanning(false);
    };

    const decodeWithJsQr = () => {
        const video = cameraRef.current;
        if (!video || video.readyState < 2) return null;

        const width = video.videoWidth;
        const height = video.videoHeight;
        if (!width || !height) return null;

        if (!canvasRef.current) {
            canvasRef.current = document.createElement('canvas');
        }
        const canvas = canvasRef.current;
        canvas.width = width;
        canvas.height = height;

        if (!canvasCtxRef.current) {
            canvasCtxRef.current = canvas.getContext('2d', { willReadFrequently: true });
        }
        const ctx = canvasCtxRef.current;
        if (!ctx) return null;

        ctx.drawImage(video, 0, 0, width, height);
        const imageData = ctx.getImageData(0, 0, width, height);
        const decoded = jsQR(imageData.data, width, height, { inversionAttempts: 'dontInvert' });
        return decoded?.data || null;
    };

    const detectQrToken = async () => {
        if (detectorRef.current && cameraRef.current) {
            const codes = await detectorRef.current.detect(cameraRef.current);
            if (codes?.length && codes[0]?.rawValue) {
                return codes[0].rawValue;
            }
        }
        return decodeWithJsQr();
    };

    const decodeFromImageFile = async (file) => {
        if (!file) return null;
        const dataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
        const image = await new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = String(dataUrl || '');
        });

        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return null;
        ctx.drawImage(image, 0, 0);
        const imageData = ctx.getImageData(0, 0, image.width, image.height);
        const decoded = jsQR(imageData.data, image.width, image.height, { inversionAttempts: 'dontInvert' });
        return decoded?.data || null;
    };

    const startScanner = async () => {
        if (!navigator?.mediaDevices?.getUserMedia) {
            toast.error('Camera scanning unavailable. Use Upload QR Image or manual token.');
            return;
        }
        try {
            let stream;
            try {
                stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } });
            } catch (cameraError) {
                stream = await navigator.mediaDevices.getUserMedia({ video: true });
            }
            streamRef.current = stream;
            detectorRef.current = null;
            if (window.BarcodeDetector) {
                try {
                    detectorRef.current = new window.BarcodeDetector({ formats: ['qr_code'] });
                } catch (detectorError) {
                    detectorRef.current = null;
                }
            }
            if (cameraRef.current) {
                cameraRef.current.setAttribute('playsinline', 'true');
                cameraRef.current.srcObject = stream;
                await cameraRef.current.play();
            }
            detectorTimerRef.current = setInterval(async () => {
                if (!cameraRef.current || detectingRef.current) return;
                detectingRef.current = true;
                try {
                    const token = await detectQrToken();
                    if (token) {
                        stopScanner();
                        markFromToken(token);
                    }
                } catch (error) {
                    // no-op
                } finally {
                    detectingRef.current = false;
                }
            }, 500);
            setIsScanning(true);
        } catch (error) {
            toast.error(window.isSecureContext ? 'Unable to access camera' : 'Camera scanning requires HTTPS');
        }
    };

    const handleQrImageUpload = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        try {
            const token = await decodeFromImageFile(file);
            if (!token) {
                toast.error('Unable to detect QR in image');
                return;
            }
            markFromToken(token);
        } catch (error) {
            toast.error('Failed to read QR image');
        }
    };

    const toggleEventStatus = async () => {
        if (!eventInfo?.status) return;
        const nextStatus = String(eventInfo.status).toLowerCase() === 'open' ? 'closed' : 'open';
        try {
            const response = await axios.put(
                `${API}/pda-admin/events/${eventSlug}/status`,
                { status: nextStatus },
                { headers: getAuthHeader() }
            );
            setEventInfo(response.data);
            toast.success(`Event ${nextStatus === 'open' ? 'opened' : 'closed'}`);
            fetchEventInfo();
        } catch (error) {
            toast.error(getApiErrorMessage(error, 'Failed to update event status'));
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

    const applyShortlisting = async () => {
        const roundId = Number(shortlistForm.round_id);
        const eliminationValue = Number(shortlistForm.elimination_value);
        if (!roundId || Number.isNaN(roundId)) {
            toast.error('Select a round for shortlisting');
            return;
        }
        if (Number.isNaN(eliminationValue)) {
            toast.error('Enter a valid elimination value');
            return;
        }
        try {
            await axios.put(`${API}/pda-admin/events/${eventSlug}/rounds/${roundId}`, {
                elimination_type: shortlistForm.elimination_type,
                elimination_value: eliminationValue,
                eliminate_absent: Boolean(shortlistForm.eliminate_absent)
            }, { headers: getAuthHeader() });
            toast.success('Shortlisting applied');
            await Promise.all([fetchRounds(), fetchLeaderboard(), fetchParticipants()]);
            if (selectedRoundId) {
                fetchRoundRows(selectedRoundId);
            }
            if (activeTab === 'logs') {
                fetchLogs();
            }
        } catch (error) {
            toast.error(getApiErrorMessage(error, 'Failed to apply shortlisting'));
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

    const navActiveTab = activeTab === 'scoring' ? 'rounds' : activeTab;
    const navItems = [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'attendance', label: 'Attendance', icon: Camera },
        { id: 'rounds', label: 'Rounds', icon: Calendar },
        { id: 'participants', label: eventInfo?.participant_mode === 'team' ? 'Teams' : 'Participants', icon: Users },
        { id: 'leaderboard', label: 'Leaderboard', icon: Trophy },
        { id: 'logs', label: 'Logs', icon: ListChecks },
    ];

    if (loading) {
        return (
            <div className="min-h-screen bg-muted flex items-center justify-center">
                <div className="neo-card animate-pulse">
                    <p className="font-heading text-xl">Loading event admin...</p>
                </div>
            </div>
        );
    }

    if (!eventInfo || (!isSuperAdmin && !canAccessEvent(eventSlug))) {
        return (
            <div className="min-h-screen bg-muted">
                <div className="max-w-7xl mx-auto px-4 py-10">
                    <div className="neo-card">
                        <p className="font-heading text-xl">Event not found or permission denied.</p>
                        <Link to="/admin/events" className="inline-block mt-4">
                            <Button variant="outline" className="border-2 border-black">
                                <ArrowLeft className="mr-2 h-4 w-4" />
                                Back to Events
                            </Button>
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-muted">
            <header className="bg-primary text-white border-b-4 border-black sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center h-16">
                        <div className="flex items-center gap-4">
                            <Link to="/admin/events" className="flex items-center gap-2">
                                <div className="w-10 h-10 bg-white border-2 border-black shadow-neo flex items-center justify-center">
                                    <Sparkles className="w-6 h-6 text-primary" />
                                </div>
                                <div className="hidden md:block">
                                    <div className="font-heading font-black text-lg tracking-tight leading-none">{eventInfo.title}</div>
                                    <div className="text-xs opacity-90">{eventInfo.event_code}</div>
                                </div>
                            </Link>
                            <span className="bg-accent text-black px-2 py-1 border-2 border-black text-xs font-bold uppercase">{eventInfo.status}</span>
                        </div>
                        <Button
                            variant="outline"
                            onClick={() => {
                                logout();
                                navigate('/');
                            }}
                            className="bg-white text-black border-2 border-black shadow-neo hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all"
                        >
                            <LogOut className="w-5 h-5" />
                        </Button>
                    </div>
                </div>
            </header>

            <nav className="bg-white border-b-2 border-black">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex gap-1 sm:gap-1 overflow-x-auto">
                        {navItems.map((tab) => {
                            const Icon = tab.icon;
                            return (
                                <button
                                    key={tab.id}
                                    type="button"
                                    aria-label={tab.label}
                                    onClick={() => handleTabSelect(tab.id)}
                                    className={`flex-1 sm:flex-none flex items-center justify-center px-2 sm:px-4 py-3 font-bold text-xs sm:text-sm transition-colors ${navActiveTab === tab.id ? 'border-b-4 border-primary bg-secondary' : 'hover:bg-muted'}`}
                                >
                                    <Icon className="w-5 h-5 sm:w-4 sm:h-4 sm:mr-2" />
                                    <span className="hidden sm:inline">{tab.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </nav>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="mb-6 flex items-center justify-between gap-3">
                    <Link to="/admin/events">
                        <Button variant="outline" className="border-2 border-black shadow-neo hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all">
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            Back to Events
                        </Button>
                    </Link>
                    <p className="text-xs text-gray-600 uppercase tracking-[0.2em]">{eventInfo.slug}</p>
                </div>

            {activeTab === 'dashboard' ? (
                <section className="space-y-4">
                    <div className={`neo-card ${String(eventInfo.status || '').toLowerCase() === 'open' ? 'bg-green-50 border-green-500' : 'bg-red-50 border-red-500'}`}>
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                            <div>
                                <h2 className="font-heading font-bold text-xl">Event Status: {eventInfo.status}</h2>
                                <p className="text-gray-600 text-sm">Toggle open/closed state for registrations and participant actions.</p>
                            </div>
                            <Button
                                onClick={toggleEventStatus}
                                className={`${String(eventInfo.status || '').toLowerCase() === 'open' ? 'bg-red-500' : 'bg-green-500'} text-white border-2 border-black shadow-neo hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none`}
                            >
                                {String(eventInfo.status || '').toLowerCase() === 'open' ? 'Close Event' : 'Open Event'}
                            </Button>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                        <div className="stat-card"><div className="stat-value text-primary">{dashboard?.registrations || 0}</div><div className="stat-label">Registrations</div></div>
                        <div className="stat-card"><div className="stat-value text-primary">{dashboard?.rounds || 0}</div><div className="stat-label">Rounds</div></div>
                        <div className="stat-card"><div className="stat-value text-green-500">{dashboard?.active_count || 0}</div><div className="stat-label">Active</div></div>
                        <div className="stat-card"><div className="stat-value text-red-500">{dashboard?.eliminated_count || 0}</div><div className="stat-label">Eliminated</div></div>
                        <div className="stat-card"><div className="stat-value text-primary">{dashboard?.rounds_completed || 0}</div><div className="stat-label">Rounds Completed</div></div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="neo-card"><p className="text-xs text-slate-500">Attendance</p><p className="text-2xl font-black">{dashboard?.attendance_present || 0}</p></div>
                        <div className="neo-card"><p className="text-xs text-slate-500">Score Rows</p><p className="text-2xl font-black">{dashboard?.score_rows || 0}</p></div>
                        <div className="neo-card"><p className="text-xs text-slate-500">Badges</p><p className="text-2xl font-black">{dashboard?.badges || 0}</p></div>
                    </div>
                    <div className="neo-card">
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
                                    <th className="py-2">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {participants.map((row) => (
                                    <tr key={`${row.entity_type}-${row.entity_id}`} className="border-b border-black/5 text-sm">
                                        <td className="py-2">{row.entity_type}</td>
                                        <td className="py-2">{row.name}</td>
                                        <td className="py-2">{row.regno_or_code}</td>
                                        <td className="py-2">{row.members_count || 1}</td>
                                        <td className="py-2">
                                            <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${statusPillClass(row.status)}`}>
                                                {row.status || 'Active'}
                                            </span>
                                        </td>
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
                        <Button variant="outline" className="border-black/20" onClick={() => qrImageInputRef.current?.click()}>
                            Upload QR Image
                        </Button>
                        {isScanning ? <Button variant="outline" className="border-red-400 text-red-600" onClick={stopScanner}>Stop</Button> : null}
                    </div>
                    <input
                        ref={qrImageInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleQrImageUpload}
                    />
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

            {activeTab === 'rounds' || activeTab === 'scoring' ? (
                <section className="mt-6 grid gap-4 lg:grid-cols-[320px_1fr]">
                    <div className="rounded-2xl border border-black/10 bg-white p-4">
                        {activeTab === 'rounds' ? (
                            <>
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
                            </>
                        ) : (
                            <div className="rounded-xl border border-black/10 bg-[#fffdf7] p-3 text-sm text-slate-600">
                                <p className="font-semibold text-slate-800">Scoring View</p>
                                <p>Select a round to score, freeze, unfreeze, or import marks.</p>
                            </div>
                        )}
                        <div className="mt-4 space-y-2">
                            {rounds.map((round) => (
                                <button
                                    key={round.id}
                                    type="button"
                                    onClick={() => {
                                        setSelectedRoundId(round.id);
                                        if (activeTab === 'scoring') {
                                            navigate(`/admin/events/${eventSlug}/rounds/${round.id}/scoring`);
                                        }
                                    }}
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
                                        {activeTab === 'rounds' ? (
                                            <Button
                                                variant="outline"
                                                className="border-black/20"
                                                onClick={() => navigate(`/admin/events/${eventSlug}/rounds/${selectedRound.id}/scoring`)}
                                            >
                                                Open Scoring Page
                                            </Button>
                                        ) : null}
                                        {activeTab === 'scoring' ? (
                                            <Button
                                                variant="outline"
                                                className="border-black/20"
                                                onClick={() => navigate(`/admin/events/${eventSlug}/rounds`)}
                                            >
                                                Back to Rounds
                                            </Button>
                                        ) : null}
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
                                                <th className="py-2">Status</th>
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
                                                            <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${statusPillClass(row.status)}`}>
                                                                {row.status || 'Active'}
                                                            </span>
                                                        </td>
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
                <section className="mt-6 space-y-4">
                    <div className="rounded-2xl border border-black/10 bg-white p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <h3 className="text-lg font-heading font-black">Leaderboard</h3>
                            <div className="flex gap-2">
                                <Button variant="outline" className="border-black/20" onClick={() => exportData('participants')}>Export Participants</Button>
                                <Button variant="outline" className="border-black/20" onClick={() => exportData('leaderboard')}>Export Leaderboard</Button>
                            </div>
                        </div>
                        <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-5">
                            <div>
                                <Label>Round</Label>
                                <Select value={shortlistForm.round_id || 'none'} onValueChange={(value) => setShortlistForm((prev) => ({ ...prev, round_id: value === 'none' ? '' : value }))}>
                                    <SelectTrigger><SelectValue placeholder="Select round" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">Select round</SelectItem>
                                        {rounds.map((round) => (
                                            <SelectItem key={round.id} value={String(round.id)}>
                                                Round {round.round_no}: {round.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label>Elimination Type</Label>
                                <Select value={shortlistForm.elimination_type} onValueChange={(value) => setShortlistForm((prev) => ({ ...prev, elimination_type: value }))}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="top_k">Top K</SelectItem>
                                        <SelectItem value="min_score">Min Score</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label>Value</Label>
                                <Input
                                    type="number"
                                    value={shortlistForm.elimination_value}
                                    onChange={(e) => setShortlistForm((prev) => ({ ...prev, elimination_value: e.target.value }))}
                                    placeholder={shortlistForm.elimination_type === 'top_k' ? 'Top K' : 'Minimum score'}
                                />
                            </div>
                            <div className="flex items-center gap-2 pt-6">
                                <Checkbox
                                    checked={Boolean(shortlistForm.eliminate_absent)}
                                    onCheckedChange={(checked) => setShortlistForm((prev) => ({ ...prev, eliminate_absent: checked === true }))}
                                />
                                <Label>Eliminate absent</Label>
                            </div>
                            <div className="flex items-end">
                                <Button className="w-full bg-[#11131a] text-white hover:bg-[#1f2330]" onClick={applyShortlisting}>Apply Shortlisting</Button>
                            </div>
                        </div>
                        <p className="mt-2 text-xs text-slate-500">Shortlisting applies when the selected round is frozen.</p>
                    </div>
                    <div className="rounded-2xl border border-black/10 bg-white p-4">
                        <div className="overflow-x-auto">
                            <table className="w-full border-collapse">
                                <thead>
                                    <tr className="border-b border-black/10 text-left text-xs uppercase tracking-[0.2em] text-slate-500">
                                        <th className="py-2">Rank</th>
                                        <th className="py-2">Type</th>
                                        <th className="py-2">Name</th>
                                        <th className="py-2">Code</th>
                                        <th className="py-2">Status</th>
                                        <th className="py-2">Attendance</th>
                                        <th className="py-2">Score</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {leaderboard.map((row) => (
                                        <tr key={`${row.entity_type}-${row.entity_id}`} className="border-b border-black/5 text-sm">
                                            <td className="py-2">{row.rank ?? '-'}</td>
                                            <td className="py-2">{row.entity_type}</td>
                                            <td className="py-2">{row.name}</td>
                                            <td className="py-2">{row.regno_or_code}</td>
                                            <td className="py-2">
                                                <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${statusPillClass(row.status)}`}>
                                                    {row.status || 'Active'}
                                                </span>
                                            </td>
                                            <td className="py-2">{row.attendance_count}</td>
                                            <td className="py-2">{Number(row.cumulative_score || 0).toFixed(2)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </section>
            ) : null}

            {activeTab === 'logs' ? (
                <section className="mt-6 rounded-2xl border border-black/10 bg-white p-4">
                    <div className="flex flex-wrap items-end gap-3">
                        <div>
                            <Label>Action</Label>
                            <Input value={logFilters.action} onChange={(e) => setLogFilters((prev) => ({ ...prev, action: e.target.value }))} placeholder="Filter action" />
                        </div>
                        <div>
                            <Label>Method</Label>
                            <Select value={logFilters.method || 'any'} onValueChange={(value) => setLogFilters((prev) => ({ ...prev, method: value === 'any' ? '' : value }))}>
                                <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="any">Any</SelectItem>
                                    <SelectItem value="GET">GET</SelectItem>
                                    <SelectItem value="POST">POST</SelectItem>
                                    <SelectItem value="PUT">PUT</SelectItem>
                                    <SelectItem value="DELETE">DELETE</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="min-w-[220px]">
                            <Label>Path Contains</Label>
                            <Input value={logFilters.path_contains} onChange={(e) => setLogFilters((prev) => ({ ...prev, path_contains: e.target.value }))} placeholder="/rounds/" />
                        </div>
                        <div>
                            <Label>Limit</Label>
                            <Select value={logLimit} onValueChange={(value) => setLogLimit(value)}>
                                <SelectTrigger className="w-[110px]"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="25">25</SelectItem>
                                    <SelectItem value="50">50</SelectItem>
                                    <SelectItem value="100">100</SelectItem>
                                    <SelectItem value="200">200</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <Button variant="outline" className="border-black/20" onClick={() => { setLogOffset(0); fetchLogs(); }}>Apply</Button>
                        <Button variant="outline" className="border-black/20" onClick={() => {
                            setLogFilters({ action: '', method: '', path_contains: '' });
                            setLogOffset(0);
                        }}>Reset</Button>
                    </div>
                    <div className="mt-4 overflow-x-auto">
                        <table className="w-full border-collapse">
                            <thead>
                                <tr className="border-b border-black/10 text-left text-xs uppercase tracking-[0.2em] text-slate-500">
                                    <th className="py-2">Time</th>
                                    <th className="py-2">Admin</th>
                                    <th className="py-2">Action</th>
                                    <th className="py-2">Method</th>
                                    <th className="py-2">Path</th>
                                    <th className="py-2">Meta</th>
                                </tr>
                            </thead>
                            <tbody>
                                {logs.map((log) => (
                                    <tr key={log.id} className="border-b border-black/5 text-sm align-top">
                                        <td className="py-2 whitespace-nowrap">{new Date(log.created_at).toLocaleString()}</td>
                                        <td className="py-2">
                                            <div>{log.admin_name}</div>
                                            <div className="text-xs text-slate-500">{log.admin_register_number}</div>
                                        </td>
                                        <td className="py-2">{log.action}</td>
                                        <td className="py-2">{log.method || '-'}</td>
                                        <td className="py-2">{log.path || '-'}</td>
                                        <td className="py-2 text-xs text-slate-600">{log.meta ? JSON.stringify(log.meta) : '-'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {logs.length === 0 ? <p className="mt-3 text-sm text-slate-500">No logs found.</p> : null}
                    </div>
                    <div className="mt-4 flex items-center justify-between">
                        <Button variant="outline" className="border-black/20" disabled={logOffset === 0} onClick={() => setLogOffset((prev) => Math.max(0, prev - (Number(logLimit) || 50)))}>
                            Previous
                        </Button>
                        <p className="text-xs text-slate-500">Offset {logOffset}</p>
                        <Button variant="outline" className="border-black/20" disabled={logs.length < (Number(logLimit) || 50)} onClick={() => setLogOffset((prev) => prev + (Number(logLimit) || 50))}>
                            Next
                        </Button>
                    </div>
                </section>
            ) : null}
            </main>
        </div>
    );
}
