import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import jsQR from 'jsqr';
import { toast } from 'sonner';
import { Camera, ChevronLeft, ChevronRight, Save, Search } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/context/AuthContext';

import EventAdminShell, { useEventAdminShell } from './EventAdminShell';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const ATTENDANCE_PAGE_SIZE_KEY = 'event_admin_attendance_page_size';
const ATTENDANCE_PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

const loadPageSize = (storageKey, fallback, allowedValues) => {
    if (typeof window === 'undefined') return fallback;
    const raw = window.localStorage.getItem(storageKey);
    const parsed = Number.parseInt(raw || '', 10);
    return allowedValues.includes(parsed) ? parsed : fallback;
};

const decodeBase64Url = (value) => {
    const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    return atob(padded);
};

const decodeAttendanceTokenPayload = (rawToken) => {
    const token = String(rawToken || '').trim();
    if (!token) return null;
    if (token.includes('.')) {
        const parts = token.split('.');
        if (parts.length >= 2) {
            try {
                return JSON.parse(decodeBase64Url(parts[1]));
            } catch {
                return null;
            }
        }
    }
    try {
        return JSON.parse(token);
    } catch {
        return null;
    }
};

const normalizeEntityType = (value) => {
    const text = String(value || '').trim().toLowerCase();
    if (text.includes('user')) return 'user';
    if (text.includes('team')) return 'team';
    return text;
};
const formatMarkedAtIst = (value) => {
    if (!value) return '—';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '—';
    return parsed.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
    });
};

const normalizeRoundState = (value) => String(value || '').trim().toLowerCase();
const EDITABLE_ROUND_STATES = new Set(['active']);
const READ_ONLY_ROUND_STATES = new Set(['completed', 'reveal']);
const VISIBLE_ROUND_STATES = new Set([...EDITABLE_ROUND_STATES, ...READ_ONLY_ROUND_STATES]);

function AttendanceContent() {
    const { getAuthHeader } = useAuth();
    const { eventSlug } = useEventAdminShell();
    const [rows, setRows] = useState([]);
    const [rounds, setRounds] = useState([]);
    const [attendanceRoundId, setAttendanceRoundId] = useState('');
    const [search, setSearch] = useState('');
    const [scanToken, setScanToken] = useState('');
    const [loading, setLoading] = useState(true);
    const [isScanning, setIsScanning] = useState(false);
    const [savingChanges, setSavingChanges] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(() => loadPageSize(ATTENDANCE_PAGE_SIZE_KEY, 20, ATTENDANCE_PAGE_SIZE_OPTIONS));
    const [presenceDraft, setPresenceDraft] = useState({});
    const [unsavedDialogOpen, setUnsavedDialogOpen] = useState(false);
    const [pendingNavAction, setPendingNavAction] = useState(null);
    const [highlightedRowKey, setHighlightedRowKey] = useState('');
    const cameraRef = useRef(null);
    const streamRef = useRef(null);
    const detectorTimerRef = useRef(null);
    const detectorRef = useRef(null);
    const canvasRef = useRef(null);
    const canvasCtxRef = useRef(null);
    const detectingRef = useRef(false);
    const qrImageInputRef = useRef(null);
    const highlightTimerRef = useRef(null);

    const getErrorMessage = (error, fallback) => (
        error?.response?.data?.detail || error?.response?.data?.message || fallback
    );
    const attendanceRounds = useMemo(
        () => rounds.filter((round) => VISIBLE_ROUND_STATES.has(normalizeRoundState(round.state))),
        [rounds]
    );
    const selectedRound = useMemo(
        () => attendanceRounds.find((round) => String(round.id) === String(attendanceRoundId)) || null,
        [attendanceRoundId, attendanceRounds]
    );
    const isSelectedRoundEditable = EDITABLE_ROUND_STATES.has(normalizeRoundState(selectedRound?.state));
    const isSelectedRoundReadOnly = READ_ONLY_ROUND_STATES.has(normalizeRoundState(selectedRound?.state));
    const hasManageableRoundSelection = attendanceRounds.length > 0;

    const fetchRounds = useCallback(async () => {
        try {
            const response = await axios.get(`${API}/pda-admin/events/${eventSlug}/rounds`, { headers: getAuthHeader() });
            const roundRows = response.data || [];
            setRounds(roundRows);
            const attendanceRoundRows = roundRows.filter((round) => VISIBLE_ROUND_STATES.has(normalizeRoundState(round.state)));
            const activeRoundRows = attendanceRoundRows.filter((round) => EDITABLE_ROUND_STATES.has(normalizeRoundState(round.state)));
            const readOnlyRoundRows = attendanceRoundRows.filter((round) => READ_ONLY_ROUND_STATES.has(normalizeRoundState(round.state)));
            if (attendanceRoundRows.length === 0) {
                setAttendanceRoundId('');
                setRows([]);
                return;
            }
            const currentVisibleRound = attendanceRoundRows.find((round) => String(round.id) === String(attendanceRoundId));
            if (!currentVisibleRound) {
                if (activeRoundRows.length > 0) {
                    setAttendanceRoundId(String(activeRoundRows[0].id));
                    return;
                }
                const latestReadOnlyRound = [...readOnlyRoundRows].sort((a, b) => Number(b.round_no || 0) - Number(a.round_no || 0))[0];
                setAttendanceRoundId(latestReadOnlyRound ? String(latestReadOnlyRound.id) : '');
            }
        } catch (error) {
            setRounds([]);
            setAttendanceRoundId('');
            setRows([]);
        }
    }, [attendanceRoundId, eventSlug, getAuthHeader]);

    const fetchAttendance = useCallback(async () => {
        if (!attendanceRoundId) {
            setRows([]);
            setPresenceDraft({});
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const response = await axios.get(`${API}/pda-admin/events/${eventSlug}/attendance`, {
                headers: getAuthHeader(),
                params: { round_id: Number(attendanceRoundId) },
            });
            setRows(response.data || []);
            setPresenceDraft({});
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to load attendance'));
            setRows([]);
            setPresenceDraft({});
        } finally {
            setLoading(false);
        }
    }, [attendanceRoundId, eventSlug, getAuthHeader]);

    useEffect(() => {
        fetchRounds();
    }, [fetchRounds]);

    useEffect(() => {
        fetchAttendance();
    }, [fetchAttendance]);

    function markFromToken(rawToken) {
        if (!isSelectedRoundEditable) return;
        const token = String(rawToken || '').trim();
        if (!token) return;
        const decoded = decodeAttendanceTokenPayload(token);
        if (!decoded) {
            toast.error('Invalid QR token');
            return;
        }
        if (decoded.event_slug && String(decoded.event_slug) !== String(eventSlug)) {
            toast.error('QR token is for a different event');
            return;
        }
        const entityType = normalizeEntityType(decoded.entity_type);
        const entityId = Number(decoded.entity_id);
        if (!['user', 'team'].includes(entityType) || Number.isNaN(entityId)) {
            toast.error('Invalid QR token');
            return;
        }
        const row = rows.find((item) => (
            normalizeEntityType(item.entity_type) === entityType
            && Number(item.entity_id) === entityId
        ));
        if (!row) {
            toast.error('Scanned entity is not available in current attendance list');
            return;
        }
        const rowKey = `${row.entity_type}-${row.entity_id}`;
        const originalPresent = Boolean(rowPresenceMap[rowKey]);
        setPresenceDraft((prev) => {
            const next = { ...prev };
            if (originalPresent) {
                delete next[rowKey];
            } else {
                next[rowKey] = true;
            }
            return next;
        });

        const goToPageByIndex = (index) => {
            if (index >= 0) {
                setCurrentPage(Math.floor(index / pageSize) + 1);
                return true;
            }
            return false;
        };

        const indexInDisplayed = displayedRows.findIndex((item) => `${item.entity_type}-${item.entity_id}` === rowKey);
        if (!goToPageByIndex(indexInDisplayed)) {
            const indexInAllRows = rows.findIndex((item) => `${item.entity_type}-${item.entity_id}` === rowKey);
            if (search.trim()) {
                setSearch('');
            }
            goToPageByIndex(indexInAllRows);
        }

        setHighlightedRowKey(rowKey);
        if (highlightTimerRef.current) {
            clearTimeout(highlightTimerRef.current);
        }
        highlightTimerRef.current = setTimeout(() => {
            setHighlightedRowKey('');
            highlightTimerRef.current = null;
        }, 5000);

        setScanToken('');
        toast.success('Attendance marked locally. Click Save to update DB.');
    }

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

    useEffect(() => () => {
        stopScanner();
        if (highlightTimerRef.current) {
            clearTimeout(highlightTimerRef.current);
            highlightTimerRef.current = null;
        }
    }, []);

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

    const displayedRows = useMemo(() => {
        const needle = search.trim().toLowerCase();
        if (!needle) return rows;
        return rows.filter((row) => {
            const haystack = [
                String(row.name || ''),
                String(row.regno_or_code || ''),
                String(row.email || ''),
                String(row.department || ''),
                String(row.entity_type || ''),
            ].join(' ').toLowerCase();
            return haystack.includes(needle);
        });
    }, [rows, search]);
    const rowPresenceMap = useMemo(() => (
        rows.reduce((acc, row) => {
            acc[`${row.entity_type}-${row.entity_id}`] = Boolean(row.is_present);
            return acc;
        }, {})
    ), [rows]);

    const totalRows = displayedRows.length;
    const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
    const pageStart = totalRows ? ((currentPage - 1) * pageSize + 1) : 0;
    const pageEnd = Math.min((currentPage - 1) * pageSize + pageSize, totalRows);
    const pagedRows = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return displayedRows.slice(start, start + pageSize);
    }, [currentPage, displayedRows, pageSize]);

    useEffect(() => {
        setCurrentPage(1);
    }, [attendanceRoundId, pageSize, search]);

    useEffect(() => {
        if (currentPage > totalPages) {
            setCurrentPage(totalPages);
        }
    }, [currentPage, totalPages]);

    const getPresentValue = useCallback((row) => {
        const key = `${row.entity_type}-${row.entity_id}`;
        if (Object.prototype.hasOwnProperty.call(presenceDraft, key)) {
            return Boolean(presenceDraft[key]);
        }
        return Boolean(row.is_present);
    }, [presenceDraft]);

    const handlePresenceChange = useCallback((row, checked) => {
        if (!isSelectedRoundEditable) return;
        const key = `${row.entity_type}-${row.entity_id}`;
        const nextValue = checked === true;
        const originalValue = Boolean(rowPresenceMap[key]);
        setPresenceDraft((prev) => {
            const next = { ...prev };
            if (nextValue === originalValue) {
                delete next[key];
            } else {
                next[key] = nextValue;
            }
            return next;
        });
    }, [isSelectedRoundEditable, rowPresenceMap]);

    const areAllPageRowsChecked = pagedRows.length > 0 && pagedRows.every((row) => getPresentValue(row));
    const hasSomePageRowsChecked = pagedRows.some((row) => getPresentValue(row));

    const handleToggleAllCurrentPage = useCallback((checked) => {
        if (!isSelectedRoundEditable) return;
        const nextValue = checked === true;
        setPresenceDraft((prev) => {
            const next = { ...prev };
            pagedRows.forEach((row) => {
                const key = `${row.entity_type}-${row.entity_id}`;
                const originalValue = Boolean(rowPresenceMap[key]);
                if (nextValue === originalValue) {
                    delete next[key];
                } else {
                    next[key] = nextValue;
                }
            });
            return next;
        });
    }, [isSelectedRoundEditable, pagedRows, rowPresenceMap]);

    const dirtyCount = Object.keys(presenceDraft).length;

    const performNavigation = useCallback((action) => {
        if (!action) return;
        if (action.type === 'round') {
            setPresenceDraft({});
            setAttendanceRoundId(action.value);
            return;
        }
        if (action.type === 'page') {
            setCurrentPage(action.value);
            return;
        }
        if (action.type === 'page_size') {
            setPageSize(action.value);
            setCurrentPage(1);
            if (typeof window !== 'undefined') {
                window.localStorage.setItem(ATTENDANCE_PAGE_SIZE_KEY, String(action.value));
            }
        }
    }, []);

    const requestNavigation = useCallback((action) => {
        if (!dirtyCount) {
            performNavigation(action);
            return;
        }
        setPendingNavAction(action);
        setUnsavedDialogOpen(true);
    }, [dirtyCount, performNavigation]);

    const handleRoundChange = useCallback((value) => {
        const nextRoundId = value;
        if (nextRoundId === attendanceRoundId) return;
        requestNavigation({ type: 'round', value: nextRoundId });
    }, [attendanceRoundId, requestNavigation]);

    const saveAttendanceChanges = useCallback(async () => {
        if (!isSelectedRoundEditable) return;
        if (!dirtyCount) return;
        setSavingChanges(true);
        try {
            const dirtyRows = rows.filter((row) => Object.prototype.hasOwnProperty.call(presenceDraft, `${row.entity_type}-${row.entity_id}`));
            const results = await Promise.allSettled(
                dirtyRows.map((row) => {
                    const key = `${row.entity_type}-${row.entity_id}`;
                    return axios.post(`${API}/pda-admin/events/${eventSlug}/attendance/mark`, {
                        entity_type: row.entity_type,
                        user_id: row.entity_type === 'user' ? row.entity_id : null,
                        team_id: row.entity_type === 'team' ? row.entity_id : null,
                        round_id: Number(attendanceRoundId),
                        is_present: Boolean(presenceDraft[key]),
                    }, { headers: getAuthHeader() });
                })
            );
            const failed = results.filter((result) => result.status === 'rejected').length;
            const success = results.length - failed;
            if (success > 0) {
                toast.success(`Updated attendance for ${success} entr${success === 1 ? 'y' : 'ies'}`);
            }
            if (failed > 0) {
                toast.error(`Failed to update ${failed} entr${failed === 1 ? 'y' : 'ies'}`);
            }
            await fetchAttendance();
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to save attendance changes'));
        } finally {
            setSavingChanges(false);
        }
    }, [attendanceRoundId, dirtyCount, eventSlug, fetchAttendance, getAuthHeader, isSelectedRoundEditable, presenceDraft, rows]);

    useEffect(() => {
        if (isScanning && !isSelectedRoundEditable) {
            stopScanner();
        }
    }, [isScanning, isSelectedRoundEditable]);

    const handlePageSizeChange = (value) => {
        const nextSize = Number.parseInt(value, 10);
        if (!ATTENDANCE_PAGE_SIZE_OPTIONS.includes(nextSize)) return;
        if (nextSize === pageSize) return;
        requestNavigation({ type: 'page_size', value: nextSize });
    };

    const goToPrevPage = () => {
        if (currentPage === 1) return;
        requestNavigation({ type: 'page', value: Math.max(1, currentPage - 1) });
    };

    const goToNextPage = () => {
        if (currentPage === totalPages) return;
        requestNavigation({ type: 'page', value: Math.min(totalPages, currentPage + 1) });
    };

    return (
        <>
            <div className="neo-card mb-6">
                <div className="flex flex-wrap items-end gap-3">
                    <div>
                        <Label>Round</Label>
                        <Select value={attendanceRoundId} onValueChange={handleRoundChange} disabled={!hasManageableRoundSelection}>
                            <SelectTrigger className="w-[260px] neo-input"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {attendanceRounds.map((round) => (
                                    <SelectItem key={round.id} value={String(round.id)}>Round {round.round_no}: {round.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <Button onClick={fetchAttendance} disabled={!attendanceRoundId}>Refresh</Button>
                    <Button variant="outline" className="border-black/20" onClick={startScanner} disabled={!attendanceRoundId || !isSelectedRoundEditable}>
                        <Camera className="mr-2 h-4 w-4" /> Scan QR
                    </Button>
                    <Button variant="outline" className="border-black/20" onClick={() => qrImageInputRef.current?.click()} disabled={!attendanceRoundId || !isSelectedRoundEditable}>
                        Upload QR Image
                    </Button>
                    <Button
                        onClick={saveAttendanceChanges}
                        disabled={!attendanceRoundId || !isSelectedRoundEditable || !dirtyCount || savingChanges}
                        className="bg-primary text-white border-2 border-black shadow-neo"
                    >
                        <Save className="mr-2 h-4 w-4" />
                        {savingChanges ? 'Saving...' : `Save${dirtyCount ? ` (${dirtyCount})` : ''}`}
                    </Button>
                    {isScanning ? (
                        <Button variant="outline" className="border-red-400 text-red-600" onClick={stopScanner}>Stop</Button>
                    ) : null}
                </div>
                <div className="mt-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                        <Input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search by name, code, email, department..."
                            className="neo-input pl-10"
                        />
                    </div>
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
                    <Input value={scanToken} onChange={(e) => setScanToken(e.target.value)} placeholder="Manual token input" disabled={!attendanceRoundId || !isSelectedRoundEditable} />
                    <Button onClick={() => markFromToken(scanToken)} disabled={!attendanceRoundId || !isSelectedRoundEditable}>Mark Locally</Button>
                </div>
                {isSelectedRoundReadOnly ? (
                    <p className="mt-3 text-sm font-medium text-amber-700">
                        Round is completed/reveal. Attendance is view-only.
                    </p>
                ) : null}
            </div>

            {loading ? (
                <div className="neo-card text-center py-12">
                    <div className="loading-spinner mx-auto"></div>
                    <p className="mt-4">Loading attendance...</p>
                </div>
            ) : !attendanceRoundId ? (
                <div className="neo-card text-center py-12">
                    <p className="mt-1 text-slate-600">No active/completed/reveal rounds available for attendance.</p>
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="neo-table">
                        <thead>
                            <tr>
                                <th>Type</th>
                                <th>Name</th>
                                <th>Code</th>
                                <th>Marked At (IST)</th>
                                <th>
                                    <div className="flex items-center gap-2">
                                        <span>Present</span>
                                        <Checkbox
                                            checked={areAllPageRowsChecked ? true : (hasSomePageRowsChecked ? 'indeterminate' : false)}
                                            onCheckedChange={handleToggleAllCurrentPage}
                                            disabled={!isSelectedRoundEditable}
                                        />
                                    </div>
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {pagedRows.map((row) => (
                                (() => {
                                    const rowKey = `${row.entity_type}-${row.entity_id}`;
                                    const isHighlighted = highlightedRowKey === rowKey;
                                    const tdClassName = isHighlighted ? '!bg-amber-200 transition-colors' : '';
                                    return (
                                        <tr key={rowKey}>
                                            <td className={tdClassName}>{row.entity_type}</td>
                                            <td className={tdClassName}>{row.name}</td>
                                            <td className={tdClassName}>{row.regno_or_code}</td>
                                            <td className={tdClassName}>{formatMarkedAtIst(row.marked_at)}</td>
                                            <td className={tdClassName}>
                                        <Checkbox
                                            checked={getPresentValue(row)}
                                            onCheckedChange={(checked) => handlePresenceChange(row, checked)}
                                            disabled={!isSelectedRoundEditable}
                                        />
                                            </td>
                                        </tr>
                                    );
                                })()
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {!loading && totalRows > 0 ? (
                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-gray-600">
                        Showing {pageStart}-{pageEnd} of {totalRows}
                    </p>
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Rows per page</span>
                        <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
                            <SelectTrigger className="w-[90px] neo-input">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {ATTENDANCE_PAGE_SIZE_OPTIONS.map((option) => (
                                    <SelectItem key={option} value={String(option)}>{option}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={goToPrevPage}
                            disabled={currentPage === 1}
                            className="border-2 border-black shadow-neo disabled:opacity-50"
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <span className="min-w-24 text-center text-sm font-bold">Page {currentPage} / {totalPages}</span>
                        <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={goToNextPage}
                            disabled={currentPage === totalPages}
                            className="border-2 border-black shadow-neo disabled:opacity-50"
                        >
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            ) : null}

            <Dialog
                open={unsavedDialogOpen}
                onOpenChange={(open) => {
                    setUnsavedDialogOpen(open);
                    if (!open) setPendingNavAction(null);
                }}
            >
                <DialogContent className="border-4 border-black bg-white">
                    <DialogHeader>
                        <DialogTitle className="font-heading text-xl font-black">Unsaved Changes</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <p className="text-sm text-slate-700">You have unsaved attendance changes. Continue without saving?</p>
                        <div className="flex justify-end gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                className="border-2 border-black shadow-neo"
                                onClick={() => {
                                    setUnsavedDialogOpen(false);
                                    setPendingNavAction(null);
                                }}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="button"
                                className="border-2 border-black bg-[#FDE047] text-black shadow-neo"
                                onClick={() => {
                                    performNavigation(pendingNavAction);
                                    setUnsavedDialogOpen(false);
                                    setPendingNavAction(null);
                                }}
                            >
                                Continue
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}

export default function EventAdminAttendancePage() {
    return (
        <EventAdminShell activeTab="attendance">
            <AttendanceContent />
        </EventAdminShell>
    );
}
