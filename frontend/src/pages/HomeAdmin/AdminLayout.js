import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, EyeOff, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/context/AuthContext';
import PdaLogo from '@/assets/pda-logo.png';

export default function AdminLayout({ title, subtitle, children, allowEventAdmin = false }) {
    const { login, logout, canAccessHome, canAccessEvents, loading: authLoading, user, isSuperAdmin } = useAuth();
    const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
    const [loginForm, setLoginForm] = useState({ register_number: '', password: '' });
    const [showPassword, setShowPassword] = useState(false);
    const [loginLoading, setLoginLoading] = useState(false);

    const getErrorMessage = (error, fallback) => {
        const detail = error?.response?.data?.detail;
        if (Array.isArray(detail)) {
            return detail.map((item) => item?.msg || item?.detail || JSON.stringify(item)).join(', ');
        }
        if (detail && typeof detail === 'object') {
            return detail.msg || detail.detail || JSON.stringify(detail);
        }
        return detail || fallback;
    };

    const handleLoginChange = (e) => {
        setLoginForm(prev => ({
            ...prev,
            [e.target.name]: e.target.value
        }));
    };

    const handleLoginSubmit = async (e) => {
        e.preventDefault();
        setLoginLoading(true);
        try {
            const userData = await login(loginForm.register_number, loginForm.password);
            if (!userData.is_admin && !userData.is_superadmin) {
                toast.error('Admin access required.');
                logout();
                return;
            }
            toast.success('Admin login successful!');
        } catch (error) {
            console.error('Login failed:', error);
            toast.error(getErrorMessage(error, 'Login failed. Please check your credentials.'));
        } finally {
            setLoginLoading(false);
        }
    };

    const baseNavItems = canAccessHome
        ? [
            { label: 'Items', path: '/admin/items' },
            { label: 'Team', path: '/admin/team' },
            { label: 'Gallery', path: '/admin/gallery' }
        ]
        : [];
    if (canAccessEvents) {
        baseNavItems.push({ label: 'Events', path: '/admin/events' });
    }

    const navItems = isSuperAdmin
        ? [...baseNavItems, { label: 'Recruitments', path: '/admin/recruitments' }, { label: 'Logs', path: '/admin/logs' }, { label: 'Superadmin', path: '/admin/superadmin' }]
        : baseNavItems;

    const navClass = (path) => (
        `rounded-full border px-4 py-2 text-xs uppercase tracking-[0.25em] transition ${
            pathname === path
                ? 'border-[#c99612] bg-[#11131a] text-[#f6c347]'
                : 'border-black/10 bg-white text-slate-600 hover:border-black/30'
        }`
    );

    if (authLoading) {
        return (
            <div className="min-h-screen bg-[#f7f5f0] flex items-center justify-center">
                <div className="rounded-3xl border border-black/10 bg-white p-8 text-center shadow-lg">
                    <p className="text-lg font-heading font-black">Checking admin access...</p>
                </div>
            </div>
        );
    }

    const allowPanel = canAccessHome || (allowEventAdmin && canAccessEvents);
    if (!allowPanel) {
        return (
            <div className="min-h-screen bg-white flex">
                <div className="hidden lg:flex lg:w-1/2 bg-primary relative overflow-hidden">
                    <div className="relative z-10 flex flex-col justify-center items-center w-full p-12 text-white">
                        <div className="w-20 h-20 bg-white border-4 border-black shadow-neo-lg flex items-center justify-center mb-8">
                            <img src={PdaLogo} alt="PDA logo" className="w-12 h-12 object-contain" />
                        </div>
                        <h1 className="font-heading font-black text-5xl tracking-tighter mb-4 text-center">
                            PDA ADMIN
                        </h1>
                        <p className="text-xl text-center max-w-md opacity-90">
                            Sign in with admin credentials to manage PDA content.
                        </p>
                    </div>
                </div>

                <div className="flex-1 flex items-center justify-center p-8">
                    <div className="w-full max-w-md">
                        <Link to="/" className="inline-flex items-center gap-2 text-gray-600 hover:text-black mb-8 transition-colors">
                            <ArrowLeft className="w-5 h-5" />
                            <span className="font-medium">Back to Home</span>
                        </Link>

                        <div className="lg:hidden flex items-center gap-2 mb-8">
                            <div className="w-10 h-10 bg-primary border-2 border-black shadow-neo flex items-center justify-center">
                                <img src={PdaLogo} alt="PDA logo" className="w-6 h-6 object-contain" />
                            </div>
                            <span className="font-heading font-black text-xl">PDA ADMIN</span>
                        </div>

                        <h2 className="font-heading font-bold text-3xl md:text-4xl tracking-tight mb-2">
                            PDA Admin Login
                        </h2>
                        <p className="text-gray-600 mb-8">
                            Use your PDA admin credentials
                        </p>

                        <form onSubmit={handleLoginSubmit} className="space-y-6">
                            <div className="space-y-2">
                                <Label htmlFor="register_number" className="font-bold">
                                    Register Number
                                </Label>
                                <Input
                                    id="register_number"
                                    name="register_number"
                                    type="text"
                                    placeholder="Enter your 10-digit register number"
                                    value={loginForm.register_number}
                                    onChange={handleLoginChange}
                                    required
                                    maxLength={10}
                                    className="neo-input"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="password" className="font-bold">
                                    Password
                                </Label>
                                <div className="relative">
                                    <Input
                                        id="password"
                                        name="password"
                                        type={showPassword ? 'text' : 'password'}
                                        placeholder="Enter your password"
                                        value={loginForm.password}
                                        onChange={handleLoginChange}
                                        required
                                        minLength={6}
                                        className="neo-input pr-12"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-black"
                                    >
                                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                    </button>
                                </div>
                            </div>

                            <Button
                                type="submit"
                                disabled={loginLoading}
                                className="w-full bg-primary text-white border-2 border-black shadow-neo hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all py-6 text-lg font-bold"
                            >
                                {loginLoading ? (
                                    <span className="flex items-center gap-2">
                                        <div className="loading-spinner w-5 h-5"></div>
                                        Logging in...
                                    </span>
                                ) : (
                                    'Login'
                                )}
                            </Button>
                        </form>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#f7f5f0] text-[#0f1115]">
            <header className="border-b border-black/10 bg-white">
                <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-5 py-6">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <p className="text-xs uppercase tracking-[0.4em] text-slate-400">PDA Home Admin</p>
                            <h1 className="text-3xl font-heading font-black">{title}</h1>
                            {subtitle ? (
                                <p className="mt-2 text-sm text-slate-600">{subtitle}</p>
                            ) : null}
                        </div>
                        <Button variant="outline" onClick={logout} className="border-black/10 text-sm">
                            Logout
                        </Button>
                    </div>
                    <nav className="flex flex-wrap gap-2">
                        {navItems.map((item) => (
                            <Link key={item.path} to={item.path} className={navClass(item.path)}>
                                {item.label}
                            </Link>
                        ))}
                    </nav>
                </div>
            </header>

            <main className="mx-auto w-full max-w-6xl space-y-10 px-5 py-10">
                {children}
            </main>
        </div>
    );
}
