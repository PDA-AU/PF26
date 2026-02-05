import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import axios from 'axios';
import { toast } from 'sonner';
import { 
    Users, Calendar, Trophy, LogOut, Sparkles, LayoutDashboard,
    UserCheck, UserX, PauseCircle, PlayCircle, Download, BarChart3, 
    TrendingUp, Settings
} from 'lucide-react';
import { Button } from '@/components/ui/button';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function AdminDashboard() {
    const navigate = useNavigate();
    const { user, logout, getAuthHeader } = useAuth();
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);

    const fetchDashboardStats = useCallback(async () => {
        try {
            const response = await axios.get(`${API}/admin/dashboard`, {
                headers: getAuthHeader()
            });
            setStats(response.data);
        } catch (error) {
            console.error('Failed to fetch stats:', error);
            toast.error('Failed to load dashboard stats');
        } finally {
            setLoading(false);
        }
    }, [getAuthHeader]);

    useEffect(() => {
        fetchDashboardStats();
    }, [fetchDashboardStats]);

    const toggleRegistration = async () => {
        try {
            const response = await axios.post(`${API}/admin/toggle-registration`, {}, {
                headers: getAuthHeader()
            });
            setStats(prev => ({ ...prev, registration_open: response.data.registration_open }));
            toast.success(`Registration ${response.data.registration_open ? 'opened' : 'closed'}`);
        } catch (error) {
            toast.error('Failed to toggle registration');
        }
    };

    const handleLogout = () => {
        logout();
        navigate('/');
        toast.success('Logged out successfully');
    };

    const handleExport = async (type, format) => {
        try {
            const response = await axios.get(`${API}/admin/export/${type}?format=${format}`, {
                headers: getAuthHeader(),
                responseType: 'blob'
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
            toast.error('Export failed');
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-muted flex items-center justify-center">
                <div className="neo-card animate-pulse">
                    <div className="loading-spinner mx-auto"></div>
                    <p className="mt-4 font-heading text-lg">Loading dashboard...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-muted">
            {/* Header */}
            <header className="bg-primary text-white border-b-4 border-black sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center h-16">
                        <div className="flex items-center gap-4">
                            <Link to="/" className="flex items-center gap-2">
                                <div className="w-10 h-10 bg-white border-2 border-black shadow-neo flex items-center justify-center">
                                    <Sparkles className="w-6 h-6 text-primary" />
                                </div>
                                <span className="font-heading font-black text-lg sm:text-xl tracking-tight hidden md:block">PERSOFEST'26</span>
                            </Link>
                            <span className="bg-accent text-black px-2 py-1 border-2 border-black text-[11px] sm:text-xs font-bold">ADMIN</span>
                        </div>

                        <div className="flex items-center gap-4">
                            <span className="hidden md:block font-medium text-sm lg:text-base">{user?.name}</span>
                            <Button
                                variant="outline"
                                onClick={handleLogout}
                                className="bg-white text-black border-2 border-black shadow-neo hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all p-2 sm:p-3"
                                data-testid="admin-logout-btn"
                            >
                                <LogOut className="w-4 h-4 sm:w-5 sm:h-5" />
                            </Button>
                        </div>
                    </div>
                </div>
            </header>

            {/* Navigation */}
            <nav className="bg-white border-b-2 border-black">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex gap-1 sm:gap-1">
                        <Link to="/admin" aria-label="Dashboard" className="flex-1 sm:flex-none flex items-center justify-center px-2 sm:px-4 py-3 font-bold text-xs sm:text-sm border-b-4 border-primary bg-secondary">
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
                    </div>
                </div>
            </nav>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
                {/* Registration Control */}
                <div className={`neo-card mb-8 ${stats?.registration_open ? 'bg-green-50 border-green-500' : 'bg-red-50 border-red-500'}`}>
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div className="flex items-center gap-4">
                            {stats?.registration_open ? (
                                <PlayCircle className="w-9 h-9 sm:w-10 sm:h-10 text-green-500" />
                            ) : (
                                <PauseCircle className="w-9 h-9 sm:w-10 sm:h-10 text-red-500" />
                            )}
                            <div>
                                <h2 className="font-heading font-bold text-lg sm:text-xl">
                                    Registration: {stats?.registration_open ? 'OPEN' : 'CLOSED'}
                                </h2>
                                <p className="text-gray-600 text-sm sm:text-base">
                                    {stats?.registration_open 
                                        ? 'New participants can register' 
                                        : 'Registration is paused'}
                                </p>
                            </div>
                        </div>
                        <Button
                            onClick={toggleRegistration}
                            className={`${stats?.registration_open ? 'bg-red-500' : 'bg-green-500'} text-white border-2 border-black shadow-neo hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none text-sm sm:text-base`}
                            data-testid="toggle-registration-btn"
                        >
                            {stats?.registration_open ? (
                                <><PauseCircle className="w-4 h-4 sm:w-5 sm:h-5 mr-2" /> Pause Registration</>
                            ) : (
                                <><PlayCircle className="w-4 h-4 sm:w-5 sm:h-5 mr-2" /> Open Registration</>
                            )}
                        </Button>
                    </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                    <div className="stat-card">
                        <div className="stat-value text-primary">{stats?.total_participants || 0}</div>
                        <div className="stat-label">Total Participants</div>
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

                {/* Distribution Charts */}
                <div className="grid md:grid-cols-3 gap-6 mb-8">
                    {/* Gender Distribution */}
                    <div className="neo-card">
                        <h3 className="font-heading font-bold text-base sm:text-lg mb-4 flex items-center gap-2">
                            <BarChart3 className="w-4 h-4 sm:w-5 sm:h-5" /> Gender Distribution
                        </h3>
                        <div className="space-y-3">
                            {stats?.gender_distribution && Object.entries(stats.gender_distribution).map(([gender, count]) => (
                                <div key={gender}>
                                    <div className="flex justify-between text-xs sm:text-sm mb-1">
                                        <span className="font-medium">{gender}</span>
                                        <span className="font-bold">{count}</span>
                                    </div>
                                    <div className="h-4 bg-gray-200 border-2 border-black">
                                        <div 
                                            className="h-full bg-primary"
                                            style={{ width: `${(count / stats.total_participants) * 100}%` }}
                                        ></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Year Distribution */}
                    <div className="neo-card">
                        <h3 className="font-heading font-bold text-base sm:text-lg mb-4 flex items-center gap-2">
                            <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5" /> Year Distribution
                        </h3>
                        <div className="space-y-3">
                            {stats?.year_distribution && Object.entries(stats.year_distribution).map(([year, count]) => (
                                <div key={year}>
                                    <div className="flex justify-between text-xs sm:text-sm mb-1">
                                        <span className="font-medium">{year}</span>
                                        <span className="font-bold">{count}</span>
                                    </div>
                                    <div className="h-4 bg-gray-200 border-2 border-black">
                                        <div 
                                            className="h-full bg-accent"
                                            style={{ width: `${(count / stats.total_participants) * 100}%` }}
                                        ></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Quick Actions */}
                    <div className="neo-card">
                        <h3 className="font-heading font-bold text-base sm:text-lg mb-4 flex items-center gap-2">
                            <Settings className="w-4 h-4 sm:w-5 sm:h-5" /> Quick Actions
                        </h3>
                        <div className="space-y-3">
                            <Button
                                onClick={() => handleExport('participants', 'csv')}
                                variant="outline"
                                className="w-full border-2 border-black shadow-neo hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none justify-start text-xs sm:text-sm"
                                data-testid="export-participants-csv"
                            >
                                <Download className="w-4 h-4 mr-2" /> Export Participants (CSV)
                            </Button>
                            <Button
                                onClick={() => handleExport('participants', 'xlsx')}
                                variant="outline"
                                className="w-full border-2 border-black shadow-neo hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none justify-start text-xs sm:text-sm"
                                data-testid="export-participants-xlsx"
                            >
                                <Download className="w-4 h-4 mr-2" /> Export Participants (Excel)
                            </Button>
                            <Button
                                onClick={() => handleExport('leaderboard', 'csv')}
                                variant="outline"
                                className="w-full border-2 border-black shadow-neo hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none justify-start text-xs sm:text-sm"
                                data-testid="export-leaderboard-csv"
                            >
                                <Download className="w-4 h-4 mr-2" /> Export Leaderboard (CSV)
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Department Distribution */}
                <div className="neo-card">
                    <h3 className="font-heading font-bold text-base sm:text-lg mb-4 flex items-center gap-2">
                        <Users className="w-4 h-4 sm:w-5 sm:h-5" /> Department Distribution
                    </h3>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {stats?.department_distribution && Object.entries(stats.department_distribution).map(([dept, count]) => (
                            <div key={dept} className="flex items-center justify-between p-3 bg-muted border-2 border-black">
                                <span className="font-medium text-xs sm:text-sm truncate max-w-[180px]">{dept}</span>
                                <span className="bg-primary text-white px-2 py-1 font-bold text-xs sm:text-sm border-2 border-black ml-2">{count}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </main>
        </div>
    );
}
