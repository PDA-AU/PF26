import React, { useEffect, useState, useCallback } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '@/context/AuthContext';
import { LogOut, Sparkles, LayoutDashboard, Calendar, Users, Trophy, ListChecks } from 'lucide-react';
import { Button } from '@/components/ui/button';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const formatDate = (value) => {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString();
};

const formatMeta = (meta) => {
    if (!meta) return '—';
    try {
        return JSON.stringify(meta);
    } catch (error) {
        return '—';
    }
};

export default function AdminLogs() {
    const navigate = useNavigate();
    const { user, logout, getAuthHeader } = useAuth();
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [offset, setOffset] = useState(0);
    const [limit] = useState(50);

    const isSuperAdmin = user?.register_number === '0000000000';

    const fetchLogs = useCallback(async () => {
        setLoading(true);
        try {
            const response = await axios.get(`${API}/admin/logs?limit=${limit}&offset=${offset}`, {
                headers: getAuthHeader()
            });
            setLogs(response.data || []);
        } catch (error) {
            setLogs([]);
        } finally {
            setLoading(false);
        }
    }, [getAuthHeader, limit, offset]);

    useEffect(() => {
        fetchLogs();
    }, [fetchLogs]);

    const handleLogout = () => {
        logout();
        navigate('/');
    };

    if (user && !isSuperAdmin) {
        return <Navigate to="/admin" replace />;
    }

    return (
        <div className="min-h-screen bg-muted">
            <header className="bg-primary text-white border-b-4 border-black sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center h-16">
                        <div className="flex items-center gap-4">
                            <Link to="/" className="flex items-center gap-2">
                                <div className="w-10 h-10 bg-white border-2 border-black shadow-neo flex items-center justify-center">
                                    <Sparkles className="w-6 h-6 text-primary" />
                                </div>
                                <span className="font-heading font-black text-xl hidden md:block">PERSOFEST'26</span>
                            </Link>
                            <span className="bg-accent text-black px-2 py-1 border-2 border-black text-xs font-bold">ADMIN</span>
                        </div>
                        <Button variant="outline" onClick={handleLogout} className="bg-white text-black border-2 border-black shadow-neo">
                            <LogOut className="w-5 h-5" />
                        </Button>
                    </div>
                </div>
            </header>

            <nav className="bg-white border-b-2 border-black">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex gap-1 sm:gap-1">
                        <Link to="/admin" aria-label="Dashboard" className="flex-1 sm:flex-none flex items-center justify-center px-2 sm:px-4 py-3 font-bold text-xs sm:text-sm hover:bg-muted transition-colors">
                            <LayoutDashboard className="w-5 h-5 sm:w-4 sm:h-4 sm:mr-2" />
                            <span className="hidden sm:inline">Dashboard</span>
                        </Link>
                        <Link to="/admin/rounds" aria-label="Rounds" className="flex-1 sm:flex-none flex items-center justify-center px-2 sm:px-4 py-3 font-bold text-xs sm:text-sm hover:bg-muted transition-colors">
                            <Calendar className="w-5 h-5 sm:w-4 sm:h-4 sm:mr-2" />
                            <span className="hidden sm:inline">Rounds</span>
                        </Link>
                        <Link to="/admin/participants" aria-label="Participants" className="flex-1 sm:flex-none flex items-center justify-center px-2 sm:px-4 py-3 font-bold text-xs sm:text-sm hover:bg-muted transition-colors">
                            <Users className="w-5 h-5 sm:w-4 sm:h-4 sm:mr-2" />
                            <span className="hidden sm:inline">Participants</span>
                        </Link>
                        <Link to="/admin/leaderboard" aria-label="Leaderboard" className="flex-1 sm:flex-none flex items-center justify-center px-2 sm:px-4 py-3 font-bold text-xs sm:text-sm hover:bg-muted transition-colors">
                            <Trophy className="w-5 h-5 sm:w-4 sm:h-4 sm:mr-2" />
                            <span className="hidden sm:inline">Leaderboard</span>
                        </Link>
                        {isSuperAdmin && (
                            <Link to="/admin/logs" aria-label="Logs" className="flex-1 sm:flex-none flex items-center justify-center px-2 sm:px-4 py-3 font-bold text-xs sm:text-sm border-b-4 border-primary bg-secondary">
                                <ListChecks className="w-5 h-5 sm:w-4 sm:h-4 sm:mr-2" />
                                <span className="hidden sm:inline">Logs</span>
                            </Link>
                        )}
                    </div>
                </div>
            </nav>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="neo-card mb-6">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div>
                            <h1 className="font-heading font-bold text-3xl">Admin Logs</h1>
                            <p className="text-gray-600">Audit trail for persofest admin actions.</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                onClick={() => setOffset((prev) => Math.max(prev - limit, 0))}
                                className="border-2 border-black"
                                disabled={offset === 0 || loading}
                            >
                                Prev
                            </Button>
                            <Button
                                variant="outline"
                                onClick={() => setOffset((prev) => prev + limit)}
                                className="border-2 border-black"
                                disabled={loading || logs.length < limit}
                            >
                                Next
                            </Button>
                        </div>
                    </div>
                </div>

                {loading ? (
                    <div className="neo-card text-center py-12">
                        <p className="text-gray-600">Loading logs...</p>
                    </div>
                ) : logs.length === 0 ? (
                    <div className="neo-card text-center py-12">
                        <p className="text-gray-600">No logs yet.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="neo-table">
                            <thead>
                                <tr>
                                    <th>Time</th>
                                    <th>Admin</th>
                                    <th>Action</th>
                                    <th>Method</th>
                                    <th>Path</th>
                                    <th>Meta</th>
                                </tr>
                            </thead>
                            <tbody>
                                {logs.map((log) => (
                                    <tr key={log.id}>
                                        <td className="text-sm">{formatDate(log.created_at)}</td>
                                        <td className="text-sm">
                                            {log.admin_name} ({log.admin_register_number})
                                        </td>
                                        <td className="font-medium">{log.action}</td>
                                        <td className="text-sm">{log.method || '—'}</td>
                                        <td className="text-sm">{log.path || '—'}</td>
                                        <td className="text-xs font-mono max-w-[320px] break-words">{formatMeta(log.meta)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </main>
        </div>
    );
}
