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
    ArrowLeft,
} from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import EventAdminShell, { useEventAdminShell } from './EventAdminShell';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

function DashboardContent() {
    const { getAuthHeader } = useAuth();
    const { eventInfo, eventSlug, refreshEventInfo } = useEventAdminShell();
    const [stats, setStats] = useState(null);
    const [topMales, setTopMales] = useState([]);
    const [topFemales, setTopFemales] = useState([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);

    const getErrorMessage = (error, fallback) => (
        error?.response?.data?.detail || error?.response?.data?.message || fallback
    );

    const fetchDashboardStats = useCallback(async () => {
        setLoading(true);
        try {
            const response = await axios.get(`${API}/pda-admin/events/${eventSlug}/dashboard`, {
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
            const response = await axios.get(`${API}/pda-admin/events/${eventSlug}/leaderboard?${params.toString()}`, {
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

    const handleExport = async (type, format) => {
        const endpoint = type === 'participants'
            ? 'participants'
            : (type === 'leaderboard' ? 'leaderboard' : null);
        if (!endpoint) {
            toast.error('Unsupported export type');
            return;
        }
        try {
            const response = await axios.get(`${API}/pda-admin/events/${eventSlug}/export/${endpoint}?format=${format}`, {
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
    const totalParticipants = Number(stats?.registrations || 0);

    const chartRows = useMemo(() => {
        if (eventInfo?.participant_mode !== 'individual') return null;
        return {
            gender: stats?.gender_distribution || {},
            batch: stats?.batch_distribution || {},
            department: stats?.department_distribution || {},
        };
    }, [eventInfo?.participant_mode, stats?.gender_distribution, stats?.batch_distribution, stats?.department_distribution]);

    const toggleEventStatus = async () => {
        setActionLoading(true);
        try {
            const nextStatus = isOpen ? 'closed' : 'open';
            await axios.put(`${API}/pda-admin/events/${eventSlug}/status`, {
                status: nextStatus,
            }, { headers: getAuthHeader() });
            await Promise.all([refreshEventInfo(), fetchDashboardStats()]);
            toast.success(`Event ${nextStatus === 'open' ? 'opened' : 'closed'}`);
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to update event status'));
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
                <Link to="/admin/events">
                    <Button variant="outline" className="border-2 border-black shadow-neo">
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Back to Events
                    </Button>
                </Link>
            </div>

            <div className={`neo-card mb-8 ${isOpen ? 'bg-green-50 border-green-500' : 'bg-red-50 border-red-500'}`}>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div className="flex items-center gap-4">
                        {isOpen ? (
                            <PlayCircle className="w-9 h-9 sm:w-10 sm:h-10 text-green-500" />
                        ) : (
                            <PauseCircle className="w-9 h-9 sm:w-10 sm:h-10 text-red-500" />
                        )}
                        <div>
                            <h2 className="font-heading font-bold text-lg sm:text-xl">Event: {isOpen ? 'OPEN' : 'CLOSED'}</h2>
                            <p className="text-gray-600 text-sm sm:text-base">
                                {isOpen ? 'Registrations and actions are enabled' : 'Event is paused'}
                            </p>
                        </div>
                    </div>
                    <Button
                        onClick={toggleEventStatus}
                        disabled={actionLoading}
                        className={`${isOpen ? 'bg-red-500' : 'bg-green-500'} text-white border-2 border-black shadow-neo hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none text-sm sm:text-base`}
                    >
                        {isOpen ? (
                            <><PauseCircle className="w-4 h-4 sm:w-5 sm:h-5 mr-2" /> Close Event</>
                        ) : (
                            <><PlayCircle className="w-4 h-4 sm:w-5 sm:h-5 mr-2" /> Open Event</>
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
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {Object.entries(chartRows?.department || {}).map(([dept, count]) => (
                            <div key={dept} className="flex items-center justify-between p-3 bg-muted border-2 border-black">
                                <span className="font-medium text-xs sm:text-sm truncate max-w-[180px]">{dept}</span>
                                <span className="bg-primary text-white px-2 py-1 font-bold text-xs sm:text-sm border-2 border-black ml-2">{count}</span>
                            </div>
                        ))}
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
                        <div className="flex gap-3 overflow-x-auto pb-2">
                            {topMales.length === 0 ? (
                                <div className="text-sm text-gray-500">No data</div>
                            ) : (
                                topMales.map((entry, idx) => (
                                    <div key={entry.entity_id || entry.participant_id} className="min-w-[180px] bg-muted border-2 border-black px-3 py-3">
                                        <div className="text-xs text-gray-500 font-bold">#{idx + 1}</div>
                                        <div className="font-bold text-sm truncate">{entry.name}</div>
                                        <div className="text-xs text-gray-600">{entry.regno_or_code || entry.register_number}</div>
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
                        <div className="flex gap-3 overflow-x-auto pb-2">
                            {topFemales.length === 0 ? (
                                <div className="text-sm text-gray-500">No data</div>
                            ) : (
                                topFemales.map((entry, idx) => (
                                    <div key={entry.entity_id || entry.participant_id} className="min-w-[180px] bg-muted border-2 border-black px-3 py-3">
                                        <div className="text-xs text-gray-500 font-bold">#{idx + 1}</div>
                                        <div className="font-bold text-sm truncate">{entry.name}</div>
                                        <div className="text-xs text-gray-600">{entry.regno_or_code || entry.register_number}</div>
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
