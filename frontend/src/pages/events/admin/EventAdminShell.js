import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import {
    Sparkles,
    LogOut,
    LayoutDashboard,
    Camera,
    Calendar,
    Users,
    Trophy,
    ListChecks,
    Award,
} from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const EventAdminContext = createContext(null);

export function useEventAdminShell() {
    const context = useContext(EventAdminContext);
    if (!context) {
        throw new Error('useEventAdminShell must be used within EventAdminShell');
    }
    return context;
}

export default function EventAdminShell({
    activeTab,
    children,
}) {
    const { eventSlug } = useParams();
    const navigate = useNavigate();
    const { user, logout, getAuthHeader, canAccessEvent } = useAuth();
    const [eventInfo, setEventInfo] = useState(null);
    const [loading, setLoading] = useState(true);

    const isSuperAdmin = Boolean(user?.is_superadmin);

    const refreshEventInfo = useCallback(async () => {
        if (!eventSlug) return;
        const response = await axios.get(`${API}/pda/events/${eventSlug}`, { headers: getAuthHeader() });
        setEventInfo(response.data);
    }, [eventSlug, getAuthHeader]);

    useEffect(() => {
        let mounted = true;
        const load = async () => {
            setLoading(true);
            try {
                const response = await axios.get(`${API}/pda/events/${eventSlug}`, { headers: getAuthHeader() });
                if (!mounted) return;
                setEventInfo(response.data);
            } catch (error) {
                if (mounted) {
                    setEventInfo(null);
                    toast.error(error?.response?.data?.detail || 'Failed to load event');
                }
            } finally {
                if (mounted) {
                    setLoading(false);
                }
            }
        };
        load();
        return () => {
            mounted = false;
        };
    }, [eventSlug, getAuthHeader]);

    const participantTabLabel = useMemo(() => {
        if (eventInfo?.participant_mode === 'team') return 'Teams';
        return 'Participants';
    }, [eventInfo?.participant_mode]);

    const navItems = [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, to: `/admin/events/${eventSlug}/dashboard` },
        { id: 'attendance', label: 'Attendance', icon: Camera, to: `/admin/events/${eventSlug}/attendance` },
        { id: 'rounds', label: 'Rounds', icon: Calendar, to: `/admin/events/${eventSlug}/rounds` },
        { id: 'participants', label: participantTabLabel, icon: Users, to: `/admin/events/${eventSlug}/participants` },
        { id: 'leaderboard', label: 'Leaderboard', icon: Trophy, to: `/admin/events/${eventSlug}/leaderboard` },
        { id: 'badges', label: 'Badges', icon: Award, to: `/admin/events/${eventSlug}/badges` },
        { id: 'logs', label: 'Logs', icon: ListChecks, to: `/admin/events/${eventSlug}/logs` },
    ];

    const navActiveTab = activeTab === 'scoring' ? 'rounds' : activeTab;

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
                                Back to Events
                            </Button>
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <EventAdminContext.Provider value={{ eventInfo, eventSlug, refreshEventInfo }}>
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
                            <span className="bg-accent text-black px-2 py-1 border-2 border-black text-xs font-bold uppercase">ADMIN</span>
                        </div>
                        <div className="flex items-center gap-4">
                            <span className="hidden md:block font-medium text-sm lg:text-base">{user?.name}</span>
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
                </div>
            </header>

            <nav className="bg-white border-b-2 border-black">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex gap-1 sm:gap-1 overflow-x-auto">
                        {navItems.map((tab) => {
                            const Icon = tab.icon;
                            const isActive = navActiveTab === tab.id;
                            return (
                                <Link
                                    key={tab.id}
                                    to={tab.to}
                                    aria-label={tab.label}
                                    className={`flex-1 sm:flex-none flex items-center justify-center px-2 sm:px-4 py-3 font-bold text-xs sm:text-sm transition-colors ${isActive ? 'border-b-4 border-primary bg-secondary' : 'hover:bg-muted'}`}
                                >
                                    <Icon className="w-5 h-5 sm:w-4 sm:h-4 sm:mr-2" />
                                    <span className="hidden sm:inline">{tab.label}</span>
                                </Link>
                            );
                        })}
                    </div>
                </div>
            </nav>

                <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                    {children}
                </main>
            </div>
        </EventAdminContext.Provider>
    );
}
