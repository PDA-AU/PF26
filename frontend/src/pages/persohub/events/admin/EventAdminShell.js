import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import {
    Sparkles,
    LogOut,
    Undo2,
    AlertTriangle,
    LayoutDashboard,
    Camera,
    Calendar,
    Users,
    Trophy,
    ListChecks,
    Award,
    Mail,
} from 'lucide-react';

import { usePersohubAdminAuth } from '@/context/PersohubAdminAuthContext';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { clearUndoEntry, getUndoEntry, setUndoEntry, subscribeUndoEntry } from './undo/eventAdminUndoStore';
import { executeUndoCommand } from './undo/undoExecutors';

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
    const location = useLocation();
    const navigate = useNavigate();
    const { community, loading: authLoading, logout, getAuthHeader } = usePersohubAdminAuth();
    const [eventInfo, setEventInfo] = useState(null);
    const [loading, setLoading] = useState(true);
    const [undoEntry, setUndoEntryState] = useState(() => getUndoEntry(eventSlug));
    const [undoLoading, setUndoLoading] = useState(false);
    const [undoConfirmOpen, setUndoConfirmOpen] = useState(false);
    const [nonUndoableOpen, setNonUndoableOpen] = useState(false);
    const [nonUndoableTitle, setNonUndoableTitle] = useState('Action Not Undoable');
    const [nonUndoableMessage, setNonUndoableMessage] = useState('This action cannot be undone from header Undo.');
    const nonUndoableProceedRef = useRef(null);
    const previousPathRef = useRef(location.pathname);

    const refreshEventInfo = useCallback(async () => {
        if (!eventSlug) return;
        const response = await axios.get(`${API}/persohub/admin/persohub-events/${eventSlug}`, { headers: getAuthHeader() });
        setEventInfo(response.data);
    }, [eventSlug, getAuthHeader]);

    useEffect(() => {
        let mounted = true;
        const load = async () => {
            setLoading(true);
            try {
                const response = await axios.get(`${API}/persohub/admin/persohub-events/${eventSlug}`, { headers: getAuthHeader() });
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

    useEffect(() => {
        const unsubscribe = subscribeUndoEntry(eventSlug, setUndoEntryState);
        return unsubscribe;
    }, [eventSlug]);

    useEffect(() => {
        const prevPath = previousPathRef.current;
        if (prevPath !== location.pathname) {
            clearUndoEntry(eventSlug);
        }
        previousPathRef.current = location.pathname;
    }, [eventSlug, location.pathname, undoEntry]);

    const participantTabLabel = useMemo(() => {
        if (eventInfo?.participant_mode === 'team') return 'Teams';
        return 'Participants';
    }, [eventInfo?.participant_mode]);

    const navItems = [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, to: `/persohub/admin/persohub-events/${eventSlug}/dashboard` },
        { id: 'attendance', label: 'Attendance', icon: Camera, to: `/persohub/admin/persohub-events/${eventSlug}/attendance` },
        { id: 'rounds', label: 'Rounds', icon: Calendar, to: `/persohub/admin/persohub-events/${eventSlug}/rounds` },
        { id: 'participants', label: participantTabLabel, icon: Users, to: `/persohub/admin/persohub-events/${eventSlug}/participants` },
        { id: 'leaderboard', label: 'Leaderboard', icon: Trophy, to: `/persohub/admin/persohub-events/${eventSlug}/leaderboard` },
        { id: 'email', label: 'Email', icon: Mail, to: `/persohub/admin/persohub-events/${eventSlug}/email` },
        { id: 'badges', label: 'Badges', icon: Award, to: `/persohub/admin/persohub-events/${eventSlug}/badges` },
        { id: 'logs', label: 'Logs', icon: ListChecks, to: `/persohub/admin/persohub-events/${eventSlug}/logs` },
    ];

    const navActiveTab = activeTab === 'scoring' ? 'rounds' : activeTab;
    const canUndo = Boolean(undoEntry);

    const pushLocalUndo = useCallback(({ label, routeKey, undoFn }) => {
        if (!eventSlug || typeof undoFn !== 'function') return;
        setUndoEntry(eventSlug, {
            source: 'local',
            label: String(label || 'Undo'),
            routeKey: String(routeKey || location.pathname),
            undoFn,
            createdAt: Date.now(),
        });
    }, [eventSlug, location.pathname]);

    const pushSavedUndo = useCallback(({ label, command }) => {
        if (!eventSlug || !command || typeof command !== 'object') return;
        setUndoEntry(eventSlug, {
            source: 'saved',
            label: String(label || 'Undo'),
            command,
            routeKey: String(location.pathname),
            createdAt: Date.now(),
        });
    }, [eventSlug, location.pathname]);

    const clearUndo = useCallback(() => {
        clearUndoEntry(eventSlug);
    }, [eventSlug]);

    const executeSavedUndo = useCallback(async () => {
        const latestEntry = getUndoEntry(eventSlug);
        if (!latestEntry || latestEntry.source !== 'saved' || !latestEntry.command) {
            setUndoConfirmOpen(false);
            return;
        }
        setUndoLoading(true);
        try {
            await executeUndoCommand({
                eventSlug,
                command: latestEntry.command,
                getAuthHeader,
            });
            clearUndoEntry(eventSlug);
            setUndoConfirmOpen(false);
            toast.success('Undo applied');
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('event-admin-undo-applied', {
                    detail: {
                        eventSlug,
                        source: 'saved',
                        type: String(latestEntry.command?.type || ''),
                    },
                }));
            }
        } catch (error) {
            toast.error(error?.response?.data?.detail || error?.response?.data?.message || error?.message || 'Undo failed');
        } finally {
            setUndoLoading(false);
        }
    }, [eventSlug, getAuthHeader]);

    const executeUndo = useCallback(async () => {
        const latestEntry = getUndoEntry(eventSlug);
        if (!latestEntry) return;
        if (latestEntry.source === 'saved') {
            setUndoConfirmOpen(true);
            return;
        }
        if (latestEntry.source === 'local' && typeof latestEntry.undoFn === 'function') {
            setUndoLoading(true);
            try {
                await Promise.resolve(latestEntry.undoFn());
                clearUndoEntry(eventSlug);
                toast.success('Undo applied');
            } catch (error) {
                toast.error(error?.message || 'Undo failed');
            } finally {
                setUndoLoading(false);
            }
        }
    }, [eventSlug]);

    const warnNonUndoable = useCallback(({ title, message, proceed }) => {
        nonUndoableProceedRef.current = typeof proceed === 'function' ? proceed : null;
        setNonUndoableTitle(String(title || 'Action Not Undoable'));
        setNonUndoableMessage(String(message || 'This action cannot be undone from header Undo.'));
        setNonUndoableOpen(true);
    }, []);

    if (loading || authLoading) {
        return (
            <div className="min-h-screen bg-muted flex items-center justify-center">
                <div className="neo-card animate-pulse">
                    <p className="font-heading text-xl">Loading event admin...</p>
                </div>
            </div>
        );
    }

    if (!community || !eventInfo) {
        return (
            <div className="min-h-screen bg-muted">
                <div className="max-w-7xl mx-auto px-4 py-10">
                    <div className="neo-card">
                        <p className="font-heading text-xl">Event not found or permission denied.</p>
                        <Link to="/persohub/admin/persohub-events" className="inline-block mt-4">
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
        <EventAdminContext.Provider
            value={{
                eventInfo,
                eventSlug,
                refreshEventInfo,
                pushLocalUndo,
                pushSavedUndo,
                canUndo,
                undoLabel: undoEntry?.label || '',
                undoSourceType: undoEntry?.source || null,
                executeUndo,
                clearUndo,
                warnNonUndoable,
            }}
        >
            <div className="min-h-screen bg-muted">
            <header className="bg-primary text-white border-b-4 border-black sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center h-16">
                        <div className="flex items-center gap-4">
                            <Link to="/persohub/admin/persohub-events" className="flex items-center gap-2">
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
                            <span className="hidden md:block font-medium text-sm lg:text-base">{community?.name}</span>
                            <Button
                                type="button"
                                variant="outline"
                                disabled={!canUndo || undoLoading}
                                onClick={executeUndo}
                                className="bg-white text-black border-2 border-black shadow-neo hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all disabled:opacity-60"
                                title={undoEntry?.label || 'Undo'}
                            >
                                <Undo2 className="w-4 h-4 mr-2" />
                                <span className="hidden sm:inline">{undoLoading ? 'Undoing...' : 'Undo'}</span>
                            </Button>
                            <Button
                                variant="outline"
                                onClick={() => {
                                    logout();
                                    navigate('/persohub/admin');
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
            <Dialog open={undoConfirmOpen} onOpenChange={setUndoConfirmOpen}>
                <DialogContent className="border-4 border-black bg-white max-w-md w-[calc(100vw-2rem)] sm:w-full max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="font-heading text-xl font-black">Confirm Undo</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <p className="text-sm text-slate-700">
                            Undo last saved action{undoEntry?.label ? `: ${undoEntry.label}` : ''}?
                        </p>
                        <div className="flex justify-end gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                className="border-2 border-black shadow-neo"
                                onClick={() => setUndoConfirmOpen(false)}
                                disabled={undoLoading}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="button"
                                className="border-2 border-black bg-[#FDE047] text-black shadow-neo"
                                onClick={executeSavedUndo}
                                disabled={undoLoading}
                            >
                                {undoLoading ? 'Undoing...' : 'Confirm'}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
            <Dialog open={nonUndoableOpen} onOpenChange={setNonUndoableOpen}>
                <DialogContent className="border-4 border-black bg-white max-w-md w-[calc(100vw-2rem)] sm:w-full max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="font-heading text-xl font-black flex items-center gap-2">
                            <AlertTriangle className="w-5 h-5 text-orange-500" /> {nonUndoableTitle}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <p className="text-sm text-slate-700">{nonUndoableMessage}</p>
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">
                            This action cannot be undone from header Undo.
                        </p>
                        <div className="flex justify-end gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                className="border-2 border-black shadow-neo"
                                onClick={() => {
                                    nonUndoableProceedRef.current = null;
                                    setNonUndoableOpen(false);
                                }}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="button"
                                className="border-2 border-black bg-[#FDE047] text-black shadow-neo"
                                onClick={() => {
                                    const proceed = nonUndoableProceedRef.current;
                                    nonUndoableProceedRef.current = null;
                                    setNonUndoableOpen(false);
                                    if (typeof proceed === 'function') {
                                        proceed();
                                    }
                                }}
                            >
                                Continue
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </EventAdminContext.Provider>
    );
}
