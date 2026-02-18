import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { usePersohubAdminAuth } from '@/context/PersohubAdminAuthContext';
import { persohubAdminApi } from '@/pages/persohub/admin/api';
import PdaLogo from '@/assets/pda-logo.png';

export default function PersohubAdminLayout({ children, title = 'Persohub Admin', subtitle = '', activeTab = 'profile' }) {
    const navigate = useNavigate();
    const location = useLocation();
    const { community, loading, login, logout } = usePersohubAdminAuth();
    const [loginLoading, setLoginLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [loginForm, setLoginForm] = useState({ profile_id: '', password: '' });

    const handleLoginChange = (event) => {
        const { name, value } = event.target;
        setLoginForm((prev) => ({ ...prev, [name]: value }));
    };

    const handleLoginSubmit = async (event) => {
        event.preventDefault();
        setLoginLoading(true);
        try {
            await login(loginForm.profile_id, loginForm.password);
            toast.success('Community admin login successful');
            navigate('/persohub/admin/profile', { replace: true });
        } catch (error) {
            toast.error(persohubAdminApi.parseApiError(error, 'Community login failed'));
        } finally {
            setLoginLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-[#f7f5f0] flex items-center justify-center">
                <div className="rounded-3xl border border-black/10 bg-white p-8 text-center shadow-lg">
                    <p className="text-lg font-heading font-black">Checking community admin access...</p>
                </div>
            </div>
        );
    }

    if (!community) {
        return (
            <div className="min-h-screen bg-white flex">
                <div className="hidden lg:flex lg:w-1/2 bg-primary relative overflow-hidden">
                    <div className="relative z-10 flex flex-col justify-center items-center w-full p-12 text-white">
                        <div className="w-20 h-20 bg-white border-4 border-black shadow-neo-lg flex items-center justify-center mb-8">
                            <img src={PdaLogo} alt="PDA logo" className="w-12 h-12 object-contain" />
                        </div>
                        <h1 className="font-heading font-black text-5xl tracking-tighter mb-4 text-center">
                            PERSOHUB ADMIN
                        </h1>
                        <p className="text-xl text-center max-w-md opacity-90">
                            Sign in with your community profile credentials to manage Persohub profile details.
                        </p>
                    </div>
                </div>

                <div className="flex-1 flex items-center justify-center p-8">
                    <div className="w-full max-w-md">
                        <Link to="/persohub" className="inline-flex items-center gap-2 text-gray-600 hover:text-black mb-8 transition-colors">
                            <ArrowLeft className="w-5 h-5" />
                            <span className="font-medium">Back to Persohub</span>
                        </Link>

                        <div className="lg:hidden flex items-center gap-2 mb-8">
                            <div className="w-10 h-10 bg-primary border-2 border-black shadow-neo flex items-center justify-center">
                                <img src={PdaLogo} alt="PDA logo" className="w-6 h-6 object-contain" />
                            </div>
                            <span className="font-heading font-black text-xl">PERSOHUB ADMIN</span>
                        </div>

                        <h2 className="font-heading font-bold text-3xl md:text-4xl tracking-tight mb-2">
                            Community Admin Login
                        </h2>
                        <p className="text-gray-600 mb-8">
                            Use your community profile ID and password
                        </p>

                        <form onSubmit={handleLoginSubmit} className="space-y-6">
                            <div className="space-y-2">
                                <Label htmlFor="profile_id" className="font-bold">
                                    Profile ID
                                </Label>
                                <Input
                                    id="profile_id"
                                    name="profile_id"
                                    type="text"
                                    placeholder="Enter your profile id"
                                    value={loginForm.profile_id}
                                    onChange={handleLoginChange}
                                    required
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
                                        onClick={() => setShowPassword((prev) => !prev)}
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
                                {loginLoading ? 'Logging in...' : 'Login'}
                            </Button>
                        </form>
                    </div>
                </div>
            </div>
        );
    }

    const navItems = [
        { id: 'profile', label: 'Profile', path: '/persohub/admin/profile' },
        { id: 'events', label: 'Events', path: '/persohub/admin/events' },
    ];

    const navClass = (path) => (
        `rounded-full border px-4 py-2 text-xs uppercase tracking-[0.25em] transition ${
            location.pathname === path
                ? 'border-[#c99612] bg-[#11131a] text-[#f6c347]'
                : 'border-black/10 bg-white text-slate-600 hover:border-black/30'
        }`
    );

    return (
        <div className="min-h-screen bg-[#f7f5f0] text-[#0f1115]">
            <header className="border-b border-black/10 bg-white">
                <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-5 py-6">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <p className="text-xs uppercase tracking-[0.4em] text-slate-400">Persohub Community Admin</p>
                            <h1 className="text-3xl font-heading font-black">{title}</h1>
                            {subtitle ? <p className="mt-2 text-sm text-slate-600">{subtitle}</p> : null}
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-xs rounded-full border border-black/10 bg-slate-50 px-3 py-1 text-slate-700">
                                @{community.profile_id}
                            </span>
                            <Button variant="outline" onClick={logout} className="border-black/10 text-sm">
                                Logout
                            </Button>
                        </div>
                    </div>

                    <nav className="flex flex-wrap gap-2">
                        {navItems.map((item) => (
                            <Link key={item.path} to={item.path} className={navClass(item.path)} aria-current={activeTab === item.id ? 'page' : undefined}>
                                {item.label}
                            </Link>
                        ))}
                    </nav>
                </div>
            </header>

            <main className="mx-auto w-full max-w-6xl space-y-8 px-5 py-10">
                {children}
            </main>
        </div>
    );
}
