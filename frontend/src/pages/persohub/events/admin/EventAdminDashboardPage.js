import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import {
    Users,
    Trophy,
    Download,
    BarChart3,
    TrendingUp,
    Settings,
    PauseCircle,
    PlayCircle,
    Eye,
    EyeOff,
    ArrowLeft,
} from 'lucide-react';

import { usePersohubAdminAuth } from '@/context/PersohubAdminAuthContext';
import { Button } from '@/components/ui/button';
import EventAdminShell, { useEventAdminShell } from './EventAdminShell';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

function DashboardContent() {
    const { getAuthHeader } = usePersohubAdminAuth();
    const {
        eventInfo,
        eventSlug,
        refreshEventInfo,
        pushSavedUndo,
    } = useEventAdminShell();
    const [stats, setStats] = useState(null);
    const [topMales, setTopMales] = useState([]);
    const [topFemales, setTopFemales] = useState([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [hoveredDepartment, setHoveredDepartment] = useState(null);

    const getErrorMessage = (error, fallback) => (
        error?.response?.data?.detail || error?.response?.data?.message || fallback
    );

    const fetchDashboardStats = useCallback(async () => {
        setLoading(true);
        try {
            const response = await axios.get(`${API}/persohub/admin/persohub-events/${eventSlug}/dashboard`, {
                headers: getAuthHeader(),
            });
            setStats(response.data || null);
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to load dashboard stats'));
        } finally {
            setLoading(false);
        }
    }, [eventSlug, getAuthHeader]);

    const fetchTopByGender = useCallback(async (gender, setter) => {
        try {
            const params = new URLSearchParams();
            params.append('page', '1');
            params.append('page_size', '3');
            params.append('gender', gender);
            const response = await axios.get(`${API}/persohub/admin/persohub-events/${eventSlug}/leaderboard?${params.toString()}`, {
                headers: getAuthHeader(),
            });
            setter(response.data || []);
        } catch (error) {
            setter([]);
        }
    }, [eventSlug, getAuthHeader]);

    useEffect(() => {
        fetchDashboardStats();
    }, [fetchDashboardStats]);

    useEffect(() => {
        if (eventInfo?.participant_mode === 'individual') {
            fetchTopByGender('Male', setTopMales);
            fetchTopByGender('Female', setTopFemales);
        } else {
            setTopMales([]);
            setTopFemales([]);
        }
    }, [eventInfo?.participant_mode, fetchTopByGender]);

    useEffect(() => {
        const onUndoApplied = (event) => {
            if (event?.detail?.eventSlug !== eventSlug) return;
            refreshEventInfo();
            fetchDashboardStats();
        };
        window.addEventListener('event-admin-undo-applied', onUndoApplied);
        return () => window.removeEventListener('event-admin-undo-applied', onUndoApplied);
    }, [eventSlug, fetchDashboardStats, refreshEventInfo]);

    const handleExport = async (type, format) => {
        const endpoint = type === 'participants'
            ? 'participants'
            : (type === 'leaderboard' ? 'leaderboard' : null);
        if (!endpoint) {
            toast.error('Unsupported export type');
            return;
        }
        try {
            const response = await axios.get(`${API}/persohub/admin/persohub-events/${eventSlug}/export/${endpoint}?format=${format}`, {
                headers: getAuthHeader(),
                responseType: 'blob',
            });
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `${type}.${format}`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
            toast.success(`${type} exported successfully`);
        } catch (error) {
            toast.error(getErrorMessage(error, 'Export failed'));
        }
    };

    const isOpen = String(eventInfo?.status || '').toLowerCase() === 'open';
    const isRegistrationOpen = Boolean(eventInfo?.registration_open);
    const isVisible = Boolean(eventInfo?.is_visible);
    const totalParticipants = Number(stats?.registrations || 0);

    const chartRows = useMemo(() => {
        if (eventInfo?.participant_mode !== 'individual') return null;
        return {
            gender: stats?.gender_distribution || {},
            batch: stats?.batch_distribution || {},
            department: stats?.department_distribution || {},
        };
    }, [eventInfo?.participant_mode, stats?.gender_distribution, stats?.batch_distribution, stats?.department_distribution]);

    const departmentPieData = useMemo(() => {
        const entries = Object.entries(chartRows?.department || {})
            .map(([name, value]) => ({ name, value: Number(value) || 0 }))
            .filter((item) => item.value > 0)
            .sort((a, b) => b.value - a.value);
        const total = entries.reduce((sum, item) => sum + item.value, 0);
        const palette = ['#7C3AED', '#14B8A6', '#F97316', '#2563EB', '#DC2626', '#4F46E5', '#16A34A', '#0EA5E9'];
        let cumulative = 0;
        const segments = entries.map((item, idx) => {
            const pct = total > 0 ? (item.value / total) : 0;
            const startPct = cumulative;
            cumulative += pct;
            const startAngle = startPct * Math.PI * 2 - Math.PI / 2;
            const endAngle = (startPct + pct) * Math.PI * 2 - Math.PI / 2;
            const x1 = 110 + 84 * Math.cos(startAngle);
            const y1 = 110 + 84 * Math.sin(startAngle);
            const x2 = 110 + 84 * Math.cos(endAngle);
            const y2 = 110 + 84 * Math.sin(endAngle);
            const largeArcFlag = pct > 0.5 ? 1 : 0;
            return {
                ...item,
                pct,
                startPct,
                color: palette[idx % palette.length],
                pathD: `M 110 110 L ${x1} ${y1} A 84 84 0 ${largeArcFlag} 1 ${x2} ${y2} Z`,
                pctText: `${(pct * 100).toFixed(1)}%`,
            };
        });
        return {
            total,
            segments,
        };
    }, [chartRows?.department]);
    const departmentSegments = departmentPieData.segments;
    const hasDepartmentSegments = departmentSegments.length > 0;

    const toggleEventRegistration = async () => {
        setActionLoading(true);
        try {
            const previousRegistrationOpen = Boolean(isRegistrationOpen);
            const nextRegistrationOpen = !isRegistrationOpen;
            await axios.put(`${API}/persohub/admin/persohub-events/${eventSlug}/registration`, {
                registration_open: nextRegistrationOpen,
            }, { headers: getAuthHeader() });
            await Promise.all([refreshEventInfo(), fetchDashboardStats()]);
            pushSavedUndo({
                label: 'Undo registration toggle',
                command: {
                    type: 'event_flags_restore',
                    registration_open: previousRegistrationOpen,
                },
            });
            toast.success(`Registration ${nextRegistrationOpen ? 'opened' : 'closed'}`);
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to update registration state'));
        } finally {
            setActionLoading(false);
        }
    };

    const toggleEventVisibility = async () => {
        setActionLoading(true);
        try {
            const previousVisible = Boolean(isVisible);
            const nextVisible = !isVisible;
            await axios.put(`${API}/persohub/admin/persohub-events/${eventSlug}/visibility`, {
                is_visible: nextVisible,
            }, { headers: getAuthHeader() });
            await Promise.all([refreshEventInfo(), fetchDashboardStats()]);
            pushSavedUndo({
                label: 'Undo visibility toggle',
                command: {
                    type: 'event_flags_restore',
                    is_visible: previousVisible,
                },
            });
            toast.success(`Event ${nextVisible ? 'is now visible' : 'is now hidden'} on public pages`);
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to update event visibility'));
        } finally {
            setActionLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="neo-card animate-pulse">
                <p className="font-heading text-lg">Loading dashboard...</p>
            </div>
        );
    }

    return (
        <>
            <div className="mb-6">
                <Link to="/persohub/admin/persohub-events">
                    <Button variant="outline" className="border-2 border-black shadow-neo">
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Back to Events
                    </Button>
                </Link>
            </div>

            <div className={`neo-card mb-8 ${isRegistrationOpen ? 'bg-green-50 border-green-500' : 'bg-red-50 border-red-500'}`}>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div className="flex items-center gap-4">
                        {isRegistrationOpen ? (
                            <PlayCircle className="w-9 h-9 sm:w-10 sm:h-10 text-green-500" />
                        ) : (
                            <PauseCircle className="w-9 h-9 sm:w-10 sm:h-10 text-red-500" />
                        )}
                        <div>
                            <h2 className="font-heading font-bold text-lg sm:text-xl">Registration: {isRegistrationOpen ? 'OPEN' : 'CLOSED'}</h2>
                            <p className="text-gray-600 text-sm sm:text-base">
                                {isRegistrationOpen ? 'New participants can register now' : 'New registrations are blocked'}
                            </p>
                            <p className="text-gray-500 text-xs sm:text-sm">Event lifecycle status is still {isOpen ? 'OPEN' : 'CLOSED'}.</p>
                        </div>
                    </div>
                    <Button
                        onClick={toggleEventRegistration}
                        disabled={actionLoading}
                        className={`${isRegistrationOpen ? 'bg-red-500' : 'bg-green-500'} text-white border-2 border-black shadow-neo hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none text-sm sm:text-base`}
                    >
                        {isRegistrationOpen ? (
                            <><PauseCircle className="w-4 h-4 sm:w-5 sm:h-5 mr-2" /> Close Registration</>
                        ) : (
                            <><PlayCircle className="w-4 h-4 sm:w-5 sm:h-5 mr-2" /> Open Registration</>
                        )}
                    </Button>
                </div>
            </div>

            <div className={`neo-card mb-8 ${isVisible ? 'bg-blue-50 border-blue-500' : 'bg-slate-100 border-slate-500'}`}>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div className="flex items-center gap-4">
                        {isVisible ? (
                            <Eye className="w-9 h-9 sm:w-10 sm:h-10 text-blue-600" />
                        ) : (
                            <EyeOff className="w-9 h-9 sm:w-10 sm:h-10 text-slate-600" />
                        )}
                        <div>
                            <h2 className="font-heading font-bold text-lg sm:text-xl">Visibility: {isVisible ? 'VISIBLE' : 'HIDDEN'}</h2>
                            <p className="text-gray-600 text-sm sm:text-base">
                                {isVisible ? 'Shown on homepage and /events pages' : 'Hidden from homepage and /events pages'}
                            </p>
                        </div>
                    </div>
                    <Button
                        onClick={toggleEventVisibility}
                        disabled={actionLoading}
                        className={`${isVisible ? 'bg-slate-700' : 'bg-blue-600'} text-white border-2 border-black shadow-neo hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none text-sm sm:text-base`}
                    >
                        {isVisible ? (
                            <><EyeOff className="w-4 h-4 sm:w-5 sm:h-5 mr-2" /> Hide Event</>
                        ) : (
                            <><Eye className="w-4 h-4 sm:w-5 sm:h-5 mr-2" /> Show Event</>
                        )}
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <div className="stat-card">
                    <div className="stat-value text-primary">{totalParticipants}</div>
                    <div className="stat-label">{eventInfo?.participant_mode === 'team' ? 'Total Teams' : 'Total Participants'}</div>
                </div>
                <div className="stat-card">
                    <div className="stat-value text-green-500">{stats?.active_count || 0}</div>
                    <div className="stat-label">Active</div>
                </div>
                <div className="stat-card">
                    <div className="stat-value text-red-500">{stats?.eliminated_count || 0}</div>
                    <div className="stat-label">Eliminated</div>
                </div>
                <div className="stat-card">
                    <div className="stat-value text-primary">{stats?.rounds_completed || 0}</div>
                    <div className="stat-label">Rounds Completed</div>
                </div>
            </div>

            {eventInfo?.participant_mode === 'individual' ? (
                <div className="grid md:grid-cols-3 gap-6 mb-8">
                    <div className="neo-card">
                        <h3 className="font-heading font-bold text-base sm:text-lg mb-4 flex items-center gap-2">
                            <BarChart3 className="w-4 h-4 sm:w-5 sm:h-5" /> Gender Distribution
                        </h3>
                        <div className="space-y-3">
                            {Object.entries(chartRows?.gender || {}).map(([gender, count]) => (
                                <div key={gender}>
                                    <div className="flex justify-between text-xs sm:text-sm mb-1">
                                        <span className="font-medium">{gender}</span>
                                        <span className="font-bold">{count}</span>
                                    </div>
                                    <div className="h-4 bg-gray-200 border-2 border-black">
                                        <div
                                            className="h-full bg-primary"
                                            style={{ width: `${totalParticipants > 0 ? (Number(count) / totalParticipants) * 100 : 0}%` }}
                                        ></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="neo-card">
                        <h3 className="font-heading font-bold text-base sm:text-lg mb-4 flex items-center gap-2">
                            <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5" /> Batch Distribution
                        </h3>
                        <div className="space-y-3">
                            {Object.entries(chartRows?.batch || {}).map(([batch, count]) => (
                                <div key={batch}>
                                    <div className="flex justify-between text-xs sm:text-sm mb-1">
                                        <span className="font-medium">{batch}</span>
                                        <span className="font-bold">{count}</span>
                                    </div>
                                    <div className="h-4 bg-gray-200 border-2 border-black">
                                        <div
                                            className="h-full bg-accent"
                                            style={{ width: `${totalParticipants > 0 ? (Number(count) / totalParticipants) * 100 : 0}%` }}
                                        ></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="neo-card">
                        <h3 className="font-heading font-bold text-base sm:text-lg mb-4 flex items-center gap-2">
                            <Settings className="w-4 h-4 sm:w-5 sm:h-5" /> Quick Actions
                        </h3>
                        <div className="space-y-3">
                            <Button onClick={() => handleExport('participants', 'csv')} variant="outline" className="w-full border-2 border-black shadow-neo justify-start text-xs sm:text-sm">
                                <Download className="w-4 h-4 mr-2" /> Export Participants (CSV)
                            </Button>
                            <Button onClick={() => handleExport('participants', 'xlsx')} variant="outline" className="w-full border-2 border-black shadow-neo justify-start text-xs sm:text-sm">
                                <Download className="w-4 h-4 mr-2" /> Export Participants (Excel)
                            </Button>
                            <Button onClick={() => handleExport('leaderboard', 'csv')} variant="outline" className="w-full border-2 border-black shadow-neo justify-start text-xs sm:text-sm">
                                <Download className="w-4 h-4 mr-2" /> Export Leaderboard (CSV)
                            </Button>
                            <Button onClick={() => handleExport('leaderboard', 'xlsx')} variant="outline" className="w-full border-2 border-black shadow-neo justify-start text-xs sm:text-sm">
                                <Download className="w-4 h-4 mr-2" /> Export Leaderboard (Excel)
                            </Button>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="neo-card mb-8">
                    <h3 className="font-heading font-bold text-base sm:text-lg mb-3">Quick Actions</h3>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        <Button onClick={() => handleExport('participants', 'csv')} variant="outline" className="border-2 border-black shadow-neo justify-start">
                            <Download className="w-4 h-4 mr-2" /> Teams CSV
                        </Button>
                        <Button onClick={() => handleExport('participants', 'xlsx')} variant="outline" className="border-2 border-black shadow-neo justify-start">
                            <Download className="w-4 h-4 mr-2" /> Teams Excel
                        </Button>
                        <Button onClick={() => handleExport('leaderboard', 'csv')} variant="outline" className="border-2 border-black shadow-neo justify-start">
                            <Download className="w-4 h-4 mr-2" /> Leaderboard CSV
                        </Button>
                        <Button onClick={() => handleExport('leaderboard', 'xlsx')} variant="outline" className="border-2 border-black shadow-neo justify-start">
                            <Download className="w-4 h-4 mr-2" /> Leaderboard Excel
                        </Button>
                    </div>
                </div>
            )}

            <div className="neo-card">
                <h3 className="font-heading font-bold text-base sm:text-lg mb-4 flex items-center gap-2">
                    <Users className="w-4 h-4 sm:w-5 sm:h-5" /> Department Distribution
                </h3>
                {eventInfo?.participant_mode === 'individual' ? (
                    <div className="grid gap-6 md:grid-cols-[260px_1fr] items-center">
                        {hasDepartmentSegments ? (
                            <>
                                <div className="mx-auto w-full max-w-[260px]">
                                    <div className="mb-3 min-h-[20px] text-center text-xs font-semibold sm:text-sm break-words">
                                        {hoveredDepartment
                                            ? `${hoveredDepartment.name}: ${hoveredDepartment.value} (${hoveredDepartment.pctText})`
                                            : 'Hover a slice to see details'}
                                    </div>
                                    <svg viewBox="0 0 220 220" className="w-full h-auto">
                                        <circle cx="110" cy="110" r="84" fill="#F3F4F6" stroke="#000" strokeWidth="4" />
                                        {departmentSegments.map((segment) => (
                                            <path
                                                key={segment.name}
                                                d={segment.pathD}
                                                fill={segment.color}
                                                stroke="#000"
                                                strokeWidth="2"
                                                className="cursor-pointer"
                                                onMouseEnter={() => setHoveredDepartment(segment)}
                                                onMouseLeave={() => setHoveredDepartment(null)}
                                            >
                                                <title>{`${segment.name}: ${segment.value} (${segment.pctText})`}</title>
                                            </path>
                                        ))}
                                        <circle cx="110" cy="110" r="42" fill="#fff" stroke="#000" strokeWidth="3" />
                                        <text x="110" y="102" textAnchor="middle" className="fill-black" style={{ fontSize: 13, fontWeight: 800 }}>
                                            Total
                                        </text>
                                        <text x="110" y="122" textAnchor="middle" className="fill-black" style={{ fontSize: 16, fontWeight: 900 }}>
                                            {departmentPieData.total}
                                        </text>
                                    </svg>
                                </div>
                                <div className="grid gap-3 sm:grid-cols-2">
                                    {departmentSegments.map((segment) => (
                                        <div key={segment.name} className="flex items-center justify-between gap-3 p-3 bg-muted border-2 border-black">
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="inline-block h-3 w-3 border border-black shrink-0" style={{ backgroundColor: segment.color }} />
                                                    <span className="font-medium text-xs leading-tight sm:text-sm break-words" title={segment.name}>{segment.name}</span>
                                                </div>
                                                <p className="text-[11px] sm:text-xs text-gray-600 mt-1">
                                                    {segment.pctText}
                                                </p>
                                            </div>
                                            <span className="bg-primary text-white px-2 py-1 font-bold text-xs sm:text-sm border-2 border-black shrink-0">
                                                {segment.value}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </>
                        ) : (
                            <p className="text-sm text-gray-600">No department data available yet.</p>
                        )}
                    </div>
                ) : (
                    <p className="text-sm text-gray-600">Department charts are only available for individual-mode events.</p>
                )}
            </div>

            {eventInfo?.participant_mode === 'individual' ? (
                <div className="grid md:grid-cols-2 gap-6 mt-8">
                    <div className="neo-card">
                        <h3 className="font-heading font-bold text-base sm:text-lg mb-4 flex items-center gap-2">
                            <Trophy className="w-4 h-4 sm:w-5 sm:h-5" /> Top 3 Male
                        </h3>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                            {topMales.length === 0 ? (
                                <div className="text-sm text-gray-500">No data</div>
                            ) : (
                                topMales.map((entry, idx) => (
                                    <div key={entry.entity_id || entry.participant_id} className="min-w-0 bg-muted border-2 border-black px-3 py-3">
                                        <div className="text-xs text-gray-500 font-bold">#{idx + 1}</div>
                                        <div className="font-bold text-sm break-words">{entry.name}</div>
                                        <div className="text-xs text-gray-600 break-all">{entry.regno_or_code || entry.register_number}</div>
                                        <div className="mt-2 inline-block bg-primary text-white px-2 py-1 border-2 border-black text-xs font-bold">
                                            {Number(entry.cumulative_score || 0).toFixed(2)}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                    <div className="neo-card">
                        <h3 className="font-heading font-bold text-base sm:text-lg mb-4 flex items-center gap-2">
                            <Trophy className="w-4 h-4 sm:w-5 sm:h-5" /> Top 3 Female
                        </h3>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                            {topFemales.length === 0 ? (
                                <div className="text-sm text-gray-500">No data</div>
                            ) : (
                                topFemales.map((entry, idx) => (
                                    <div key={entry.entity_id || entry.participant_id} className="min-w-0 bg-muted border-2 border-black px-3 py-3">
                                        <div className="text-xs text-gray-500 font-bold">#{idx + 1}</div>
                                        <div className="font-bold text-sm break-words">{entry.name}</div>
                                        <div className="text-xs text-gray-600 break-all">{entry.regno_or_code || entry.register_number}</div>
                                        <div className="mt-2 inline-block bg-primary text-white px-2 py-1 border-2 border-black text-xs font-bold">
                                            {Number(entry.cumulative_score || 0).toFixed(2)}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            ) : null}

            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mt-8">
                <div className="stat-card">
                    <div className="stat-value text-primary">
                        {stats?.leaderboard_min_score != null ? Number(stats.leaderboard_min_score).toFixed(2) : '—'}
                    </div>
                    <div className="stat-label">Active Min Score</div>
                </div>
                <div className="stat-card">
                    <div className="stat-value text-primary">
                        {stats?.leaderboard_max_score != null ? Number(stats.leaderboard_max_score).toFixed(2) : '—'}
                    </div>
                    <div className="stat-label">Active Max Score</div>
                </div>
                <div className="stat-card">
                    <div className="stat-value text-primary">
                        {stats?.leaderboard_avg_score != null ? Number(stats.leaderboard_avg_score).toFixed(2) : '—'}
                    </div>
                    <div className="stat-label">Active Avg Score</div>
                </div>
            </div>
        </>
    );
}

export default function EventAdminDashboardPage() {
    return (
        <EventAdminShell activeTab="dashboard">
            <DashboardContent />
        </EventAdminShell>
    );
}
