import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/context/AuthContext';
import { usePersohubAdminAuth } from '@/context/PersohubAdminAuthContext';
import { persohubAdminApi } from '@/pages/persohub/admin/api';
import PdaLogo from '@/assets/pda-logo.png';

export default function PersohubAdminLayout({ children, title = 'Persohub Admin', subtitle = '', activeTab = 'profile' }) {
    const navigate = useNavigate();
    const location = useLocation();
    const { user, loading: userLoading, login: pdaLogin, logout: pdaLogout } = useAuth();
    const {
        community,
        loading,
        mode,
        setMode,
        switchableCommunities,
        activeCommunityId,
        setActiveCommunityId,
        canUseCommunityMode,
        reloadSession,
    } = usePersohubAdminAuth();

    const [loginLoading, setLoginLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [loginForm, setLoginForm] = useState({ identifier: '', password: '' });
    const [selectedClubId, setSelectedClubId] = useState('');
    const clubOptions = useMemo(() => {
        const map = new Map();
        for (const item of switchableCommunities || []) {
            const clubId = Number(item.club_id || 0);
            if (!Number.isFinite(clubId) || clubId <= 0 || map.has(clubId)) continue;
            map.set(clubId, {
                club_id: clubId,
                club_name: item.club_name || `Club ${clubId}`,
                community_id: Number(item.id),
                profile_id: item.profile_id,
            });
        }
        return Array.from(map.values());
    }, [switchableCommunities]);

    useEffect(() => {
        if (!clubOptions.length) {
            setSelectedClubId('');
            return;
        }
        if (selectedClubId) return;
        if (activeCommunityId && switchableCommunities.length) {
            const activeRow = switchableCommunities.find((item) => Number(item.id) === Number(activeCommunityId));
            if (activeRow?.club_id) {
                setSelectedClubId(String(activeRow.club_id));
                return;
            }
        }
        setSelectedClubId(String(clubOptions[0].club_id));
    }, [activeCommunityId, clubOptions, selectedClubId, switchableCommunities]);

    const selectedClub = useMemo(
        () => clubOptions.find((item) => String(item.club_id) === String(selectedClubId)) || null,
        [clubOptions, selectedClubId],
    );

    const handleLoginChange = (event) => {
        const { name, value } = event.target;
        setLoginForm((prev) => ({ ...prev, [name]: value }));
    };

    const handleLoginSubmit = async (event) => {
        event.preventDefault();
        setLoginLoading(true);
        try {
            await pdaLogin(loginForm.identifier.trim(), loginForm.password);
            await reloadSession();
            toast.success('Login successful');
        } catch (error) {
            toast.error(persohubAdminApi.parseApiError(error, 'Persohub admin login failed'));
        } finally {
            setLoginLoading(false);
        }
    };

    const handleCommunitySelectionSubmit = async (event) => {
        event.preventDefault();
        if (!selectedClubId || !selectedClub) {
            toast.error('Select a club');
            return;
        }
        setLoginLoading(true);
        try {
            setActiveCommunityId(Number(selectedClub.community_id));
            setMode('community');
            toast.success('Club selected');
            navigate('/persohub/admin/profile', { replace: true });
        } finally {
            setLoginLoading(false);
        }
    };

    if (userLoading || loading) {
        return (
            <div className="min-h-screen bg-[#f7f5f0] flex items-center justify-center">
                <div className="rounded-3xl border border-black/10 bg-white p-8 text-center shadow-lg">
                    <p className="text-lg font-heading font-black">Checking club admin access...</p>
                </div>
            </div>
        );
    }

    if (!user || mode !== 'community' || !community) {
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
                            Sign in with your user account, then choose a club to manage Persohub.
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
                            Persohub Admin Login
                        </h2>
                        <p className="text-gray-600 mb-8">
                            Step 1: login with your user credentials
                        </p>

                        {!user ? (
                            <form onSubmit={handleLoginSubmit} className="space-y-6">
                                <div className="space-y-2">
                                    <Label htmlFor="identifier" className="font-bold">Identifier</Label>
                                    <Input
                                        id="identifier"
                                        name="identifier"
                                        type="text"
                                        placeholder="Reg no"
                                        value={loginForm.identifier}
                                        onChange={handleLoginChange}
                                        required
                                        className="neo-input"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="password" className="font-bold">Password</Label>
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

                                <Button type="submit" disabled={loginLoading} className="w-full bg-primary text-white border-2 border-black shadow-neo hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all py-6 text-lg font-bold">
                                    {loginLoading ? 'Logging in...' : 'Continue'}
                                </Button>

                                <p className="text-xs text-slate-600">
                                    <Link to="/forgot-password" className="underline hover:text-[#c99612]">Forgot password?</Link>
                                </p>
                                <p className="text-xs text-slate-600">
                                    No account? <a href="https://pdamit.in/signup" target="_blank" rel="noreferrer" className="underline hover:text-[#c99612]">Register now</a>
                                </p>
                            </form>
                        ) : null}

                        {user ? (
                            <form onSubmit={handleCommunitySelectionSubmit} className="mt-8 space-y-4 border-t border-black/10 pt-6">
                                <p className="text-gray-700 font-semibold">Step 2: select your club</p>
                                {!canUseCommunityMode ? (
                                    <div className="space-y-3">
                                        <p className="text-sm text-amber-700">No club admin access found for this account.</p>
                                        <div className="flex gap-2">
                                            <Button type="button" variant="outline" onClick={pdaLogout} disabled={loginLoading}>
                                                Logout
                                            </Button>
                                            <Button
                                                type="button"
                                                className="bg-[#11131a] text-white"
                                                disabled={loginLoading}
                                                onClick={() => {
                                                    setLoginForm({ identifier: '', password: '' });
                                                    pdaLogout();
                                                }}
                                            >
                                                Login with access
                                            </Button>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <div className="space-y-2">
                                            <Label htmlFor="club-select">Club</Label>
                                            <Select value={selectedClubId} onValueChange={setSelectedClubId}>
                                                <SelectTrigger id="club-select" className="neo-input">
                                                    <SelectValue placeholder="Select a club" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {clubOptions.map((option) => (
                                                        <SelectItem key={option.club_id} value={String(option.club_id)}>
                                                            {option.club_name}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="flex gap-2">
                                            <Button type="submit" disabled={loginLoading || !selectedClubId} className="flex-1">
                                                {loginLoading ? 'Entering...' : 'Enter'}
                                            </Button>
                                            <Button type="button" variant="outline" onClick={pdaLogout} disabled={loginLoading}>
                                                Logout
                                            </Button>
                                        </div>
                                    </>
                                )}
                            </form>
                        ) : null}
                    </div>
                </div>
            </div>
        );
    }

    const isOwner = Boolean(community?.is_club_owner);
    const isClubSuperadmin = Boolean(community?.is_club_superadmin);
    const canAccessClubAdminPanel = isOwner || isClubSuperadmin;
    const canAccessEvents = Boolean(community?.can_access_events);
    const navItems = [
        ...(canAccessClubAdminPanel ? [{ id: 'profile', label: 'Profile', path: '/persohub/admin/profile' }] : []),
        ...(canAccessClubAdminPanel ? [{ id: 'communities', label: 'Communities', path: '/persohub/admin/communities' }] : []),
        ...(canAccessClubAdminPanel ? [{ id: 'payments', label: 'Payments', path: '/persohub/admin/payments' }] : []),
        ...(canAccessEvents ? [{ id: 'events', label: 'Events', path: '/persohub/admin/events' }] : []),
        ...(isOwner ? [{ id: 'policies', label: 'Policies', path: '/persohub/admin/policies' }] : []),
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
                        <div className="min-w-0">
                            <p className="text-xs uppercase tracking-[0.4em] text-slate-400">Persohub Club Admin</p>
                            <h1 className="text-3xl font-heading font-black">{title}</h1>
                            {subtitle ? <p className="mt-2 text-sm text-slate-600">{subtitle}</p> : null}
                        </div>
                        <div className="flex min-w-0 flex-wrap items-center gap-2 sm:justify-end">
                            <span className="max-w-full break-all text-xs rounded-full border border-black/10 bg-slate-50 px-3 py-1 text-slate-700">
                                @{community.club_profile_id || community.profile_id}
                            </span>
                            <Button variant="outline" onClick={pdaLogout} className="shrink-0 border-black/10 text-sm">Logout</Button>
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
