import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Eye, EyeOff, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/context/AuthContext';
import PdaHeader from '@/components/layout/PdaHeader';
import PdaFooter from '@/components/layout/PdaFooter';
import PdaLogo from '@/assets/pda-logo.png';

const HERO_IMAGE = 'https://images.unsplash.com/photo-1758270704524-596810e891b5?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzMzl8MHwxfHNlYXJjaHwxfHxjb2xsZWdlJTIwc3R1ZGVudHMlMjBkaXZlcnNlJTIwY2FtcHVzfGVufDB8fHx8MTc3MDAxNzA5M3ww&ixlib=rb-4.1.0&q=85';
const inputClass = 'h-12 border-2 border-black bg-white text-sm shadow-neo focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2';

export default function PdaLogin() {
    const navigate = useNavigate();
    const { login, user, loading: authLoading } = useAuth();
    const [formData, setFormData] = useState({ regno: '', password: '' });
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [forceReset, setForceReset] = useState(false);

    const handleChange = (e) => {
        setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

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

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const data = await login(formData.regno, formData.password);
            if (data?.password_reset_required && data?.reset_token) {
                setForceReset(true);
                toast.info('Please reset your password to continue.');
                navigate(`/reset-password?token=${data.reset_token}`);
                return;
            }
            toast.success('Login successful');
            navigate('/profile');
        } catch (error) {
            console.error('PDA login failed:', error);
            toast.error(getErrorMessage(error, 'Login failed. Please check your credentials.'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!authLoading && user && !forceReset) {
            navigate('/profile', { replace: true });
        }
    }, [authLoading, user, navigate, forceReset]);

    if (authLoading) {
        return null;
    }

    return (
        <div className="min-h-screen bg-[#fffdf5] text-black flex flex-col">
            <PdaHeader />
            <main className="relative isolate flex-1 overflow-hidden">
                <div className="pointer-events-none absolute inset-0 z-0">
                    <div className="absolute -left-10 top-20 h-28 w-28 rotate-12 border-4 border-black bg-[#FDE047]" />
                    <div className="absolute right-8 top-10 h-16 w-16 border-4 border-black bg-[#8B5CF6]" />
                    <div className="absolute bottom-16 right-[14%] h-12 w-12 rotate-45 border-4 border-black bg-[#C4B5FD]" />
                </div>

                <div className="relative z-10 mx-auto grid w-full max-w-7xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:py-14">
                    <section className="relative hidden overflow-hidden rounded-md border-4 border-black bg-[#11131a] shadow-[8px_8px_0px_0px_#000000] lg:flex">
                        <img src={HERO_IMAGE} alt="PDA members at campus" className="absolute inset-0 h-full w-full object-cover opacity-35" />
                        <div className="relative z-10 flex w-full flex-col justify-between p-8 text-white">
                            <div className="inline-flex w-fit items-center gap-2 rounded-md border-2 border-black bg-[#FDE047] px-3 py-1 font-mono text-xs font-bold uppercase tracking-[0.14em] text-black">
                                <Sparkles className="h-3 w-3" />
                                Member Portal
                            </div>
                            <div>
                                <img src={PdaLogo} alt="PDA logo" className="mb-6 h-16 w-16 border-2 border-black bg-white object-contain p-1" />
                                <h1 className="font-heading text-5xl font-black uppercase tracking-tight">
                                    Build Presence.
                                </h1>
                                <h1 className="font-heading text-5xl font-black uppercase tracking-tight text-[#FDE047]">
                                    Own The Stage.
                                </h1>
                                <p className="mt-5 max-w-lg text-base font-medium text-white/90">
                                    Log in to manage your profile, event participation, achievements, and recruitment updates in one place.
                                </p>
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                                <div className="border-2 border-black bg-white px-3 py-2 text-black shadow-neo">
                                    <p className="font-heading text-2xl font-black">150+</p>
                                    <p className="text-[10px] font-bold uppercase tracking-[0.14em]">Members</p>
                                </div>
                                <div className="border-2 border-black bg-[#C4B5FD] px-3 py-2 text-black shadow-neo">
                                    <p className="font-heading text-2xl font-black">40+</p>
                                    <p className="text-[10px] font-bold uppercase tracking-[0.14em]">Years</p>
                                </div>
                                <div className="border-2 border-black bg-[#FDE047] px-3 py-2 text-black shadow-neo">
                                    <p className="font-heading text-2xl font-black">20+</p>
                                    <p className="text-[10px] font-bold uppercase tracking-[0.14em]">Sessions</p>
                                </div>
                            </div>
                        </div>
                    </section>

                    <section className="rounded-md border-4 border-black bg-white p-6 shadow-[8px_8px_0px_0px_#000000] sm:p-8">
                        <Link
                            to="/"
                            data-testid="pda-login-back-home-link"
                            className="inline-flex items-center gap-2 rounded-md border-2 border-black bg-[#FDE047] px-3 py-2 text-xs font-bold uppercase tracking-[0.14em] text-black shadow-neo transition-[transform,box-shadow] duration-150 hover:-translate-x-[1px] hover:-translate-y-[1px] hover:shadow-[6px_6px_0px_0px_#000000]"
                        >
                            <ArrowLeft className="h-4 w-4" />
                            Back To Home
                        </Link>

                        <p className="mt-6 font-mono text-xs font-bold uppercase tracking-[0.2em] text-[#8B5CF6]">PDA Login</p>
                        <h2 className="mt-2 font-heading text-4xl font-black uppercase tracking-tight">
                            Welcome Back
                        </h2>
                        <p className="mt-2 text-sm font-medium text-slate-700">Use your register number or profile name and password to continue.</p>

                        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
                            <div className="space-y-2">
                                <Label htmlFor="regno" className="text-xs font-bold uppercase tracking-[0.12em]">Register Number or Profile Name</Label>
                                <Input
                                    id="regno"
                                    name="regno"
                                    type="text"
                                    placeholder="eg: 921323104001 or john_doe"
                                    value={formData.regno}
                                    onChange={handleChange}
                                    required
                                    data-testid="pda-login-regno-input"
                                    className={inputClass}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="password" className="text-xs font-bold uppercase tracking-[0.12em]">Password</Label>
                                <div className="relative">
                                    <Input
                                        id="password"
                                        name="password"
                                        type={showPassword ? 'text' : 'password'}
                                        placeholder="Enter your password"
                                        value={formData.password}
                                        onChange={handleChange}
                                        required
                                        data-testid="pda-login-password-input"
                                        className={`${inputClass} pr-12`}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        data-testid="pda-login-password-toggle"
                                        className="absolute right-3 top-1/2 inline-flex -translate-y-1/2 items-center justify-center rounded-md border-2 border-black bg-white p-1 text-black shadow-[2px_2px_0px_0px_#000000] transition-[transform,box-shadow] duration-150 hover:-translate-x-[1px] hover:-translate-y-[calc(50%+1px)] hover:shadow-[4px_4px_0px_0px_#000000]"
                                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                                    >
                                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </button>
                                </div>
                                <div className="text-right">
                                    <Link
                                        to="/forgot-password"
                                        data-testid="pda-login-forgot-password-link"
                                        className="text-xs font-bold uppercase tracking-[0.1em] text-[#8B5CF6] transition-[color] duration-150 hover:text-black"
                                    >
                                        Forgot Password?
                                    </Link>
                                </div>
                            </div>

                            <Button
                                type="submit"
                                disabled={loading}
                                data-testid="pda-login-submit-button"
                                className="h-12 w-full rounded-md border-2 border-black bg-[#8B5CF6] text-sm font-bold uppercase tracking-[0.14em] text-white shadow-neo transition-[background-color,transform,box-shadow] duration-150 hover:bg-[#7C3AED] hover:-translate-x-[1px] hover:-translate-y-[1px] hover:shadow-[6px_6px_0px_0px_#000000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
                            >
                                {loading ? 'Logging In...' : 'Login'}
                            </Button>
                        </form>

                        <div className="mt-7 border-t-2 border-dashed border-black pt-5 text-center">
                            <p className="text-sm font-medium text-slate-700">
                                New to PDA?{' '}
                                <Link
                                    to="/signup"
                                    data-testid="pda-login-signup-link"
                                    className="font-bold uppercase tracking-[0.08em] text-[#8B5CF6] transition-[color] duration-150 hover:text-black"
                                >
                                    Create Account
                                </Link>
                            </p>
                        </div>
                    </section>
                </div>
            </main>
            <PdaFooter />
        </div>
    );
}
