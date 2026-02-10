import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Camera } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useAuth } from '@/context/AuthContext';

import EventAdminShell, { useEventAdminShell } from './EventAdminShell';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

function AttendanceContent() {
    const { getAuthHeader } = useAuth();
    const { eventSlug } = useEventAdminShell();
    const [rows, setRows] = useState([]);
    const [rounds, setRounds] = useState([]);
    const [attendanceRoundId, setAttendanceRoundId] = useState('');
    const [scanToken, setScanToken] = useState('');
    const [loading, setLoading] = useState(true);
    const [isScanning, setIsScanning] = useState(false);
    const cameraRef = useRef(null);
    const streamRef = useRef(null);
    const detectorTimerRef = useRef(null);

    const getErrorMessage = (error, fallback) => (
        error?.response?.data?.detail || error?.response?.data?.message || fallback
    );

    const fetchRounds = useCallback(async () => {
        try {
            const response = await axios.get(`${API}/pda-admin/events/${eventSlug}/rounds`, { headers: getAuthHeader() });
            setRounds(response.data || []);
        } catch (error) {
            setRounds([]);
        }
    }, [eventSlug, getAuthHeader]);

    const fetchAttendance = useCallback(async () => {
        setLoading(true);
        try {
            const response = await axios.get(`${API}/pda-admin/events/${eventSlug}/attendance`, {
                headers: getAuthHeader(),
                params: { round_id: attendanceRoundId ? Number(attendanceRoundId) : undefined },
            });
            setRows(response.data || []);
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to load attendance'));
            setRows([]);
        } finally {
            setLoading(false);
        }
    }, [attendanceRoundId, eventSlug, getAuthHeader]);

    useEffect(() => {
        fetchRounds();
        fetchAttendance();
    }, [fetchAttendance, fetchRounds]);

    const markAttendance = async (row, isPresent) => {
        try {
            await axios.post(`${API}/pda-admin/events/${eventSlug}/attendance/mark`, {
                entity_type: row.entity_type,
                user_id: row.entity_type === 'user' ? row.entity_id : null,
                team_id: row.entity_type === 'team' ? row.entity_id : null,
                round_id: attendanceRoundId ? Number(attendanceRoundId) : null,
                is_present: Boolean(isPresent),
            }, { headers: getAuthHeader() });
            fetchAttendance();
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to update attendance'));
        }
    };

    const markFromToken = async (rawToken) => {
        const token = String(rawToken || '').trim();
        if (!token) return;
        try {
            await axios.post(`${API}/pda-admin/events/${eventSlug}/attendance/scan`, {
                token,
                round_id: attendanceRoundId ? Number(attendanceRoundId) : null,
            }, { headers: getAuthHeader() });
            toast.success('Attendance marked');
            setScanToken('');
            fetchAttendance();
        } catch (error) {
            toast.error(getErrorMessage(error, 'Invalid token'));
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

    useEffect(() => () => {
        stopScanner();
    }, []);

    return (
        <>
            <div className="neo-card mb-6">
                <div className="flex flex-wrap items-end gap-3">
                    <div>
                        <Label>Round (optional)</Label>
                        <Select value={attendanceRoundId || 'none'} onValueChange={(value) => setAttendanceRoundId(value === 'none' ? '' : value)}>
                            <SelectTrigger className="w-[260px] neo-input"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">Event-level attendance</SelectItem>
                                {rounds.map((round) => (
                                    <SelectItem key={round.id} value={String(round.id)}>Round {round.round_no}: {round.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <Button onClick={fetchAttendance}>Refresh</Button>
                    <Button variant="outline" className="border-black/20" onClick={startScanner}>
                        <Camera className="mr-2 h-4 w-4" /> Scan QR
                    </Button>
                    {isScanning ? (
                        <Button variant="outline" className="border-red-400 text-red-600" onClick={stopScanner}>Stop</Button>
                    ) : null}
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
            </div>

            {loading ? (
                <div className="neo-card text-center py-12">
                    <div className="loading-spinner mx-auto"></div>
                    <p className="mt-4">Loading attendance...</p>
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="neo-table">
                        <thead>
                            <tr>
                                <th>Type</th>
                                <th>Name</th>
                                <th>Code</th>
                                <th>Present</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row) => (
                                <tr key={`${row.entity_type}-${row.entity_id}`}>
                                    <td>{row.entity_type}</td>
                                    <td>{row.name}</td>
                                    <td>{row.regno_or_code}</td>
                                    <td>
                                        <Checkbox checked={Boolean(row.is_present)} onCheckedChange={(checked) => markAttendance(row, checked === true)} />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
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
