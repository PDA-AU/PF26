import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Eye, EyeOff, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/context/AuthContext';
import PdaHeader from '@/components/layout/PdaHeader';
import PdaFooter from '@/components/layout/PdaFooter';

const DEPARTMENTS = [
    { value: "Artificial Intelligence and Data Science", label: "AI & Data Science" },
    { value: "Aerospace Engineering", label: "Aerospace Engineering" },
    { value: "Automobile Engineering", label: "Automobile Engineering" },
    { value: "Computer Technology", label: "Computer Technology" },
    { value: "Electronics and Communication Engineering", label: "ECE" },
    { value: "Electronics and Instrumentation Engineering", label: "EIE" },
    { value: "Production Technology", label: "Production Technology" },
    { value: "Robotics and Automation", label: "Robotics & Automation" },
    { value: "Rubber and Plastics Technology", label: "Rubber & Plastics" },
    { value: "Information Technology", label: "Information Technology" }
];

const GENDERS = [
    { value: 'Male', label: 'Male' },
    { value: 'Female', label: 'Female' }
];

const SHOWCASE_IMAGE = 'https://images.unsplash.com/photo-1575426254893-06d2712a655d?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjY2NjV8MHwxfHNlYXJjaHwxfHxtaWNyb3Bob25lJTIwc3RhZ2UlMjBzcG90bGlnaHR8ZW58MHx8fHwxNzcwMDE3MDk2fDA&ixlib=rb-4.1.0&q=85';
const inputClass = 'h-12 border-2 border-black bg-white text-sm shadow-neo focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2';
const selectTriggerClass = 'h-12 border-2 border-black bg-white text-sm shadow-neo focus:ring-2 focus:ring-black focus:ring-offset-2';
const selectContentClass = 'border-2 border-black bg-white shadow-[4px_4px_0px_0px_#000000]';

export default function PdaSignup() {
    const navigate = useNavigate();
    const { register } = useAuth();
    const [formData, setFormData] = useState({
        name: '',
        profile_name: '',
        regno: '',
        email: '',
        dob: '',
        gender: '',
        phno: '',
        dept: '',
        password: '',
        confirmPassword: ''
    });
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

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

    const handleChange = (e) => {
        setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const missingRequiredField = Object.entries(formData).some(([key, value]) => {
            if (key === 'dob' || key === 'gender' || key === 'dept') {
                return !value;
            }
            return !String(value).trim();
        });
        if (missingRequiredField) {
            toast.error('Please complete all required fields');
            return;
        }
        if (formData.password !== formData.confirmPassword) {
            toast.error('Passwords do not match');
            return;
        }
        const normalizedProfileName = String(formData.profile_name || '').trim().toLowerCase();
        if (normalizedProfileName && !/^[a-z0-9_]{3,40}$/.test(normalizedProfileName)) {
            toast.error('Profile name must be 3-40 chars: lowercase letters, numbers, underscore');
            return;
        }
        setLoading(true);
        try {
            const result = await register({
                name: formData.name.trim(),
                profile_name: normalizedProfileName || undefined,
                regno: formData.regno.trim(),
                email: formData.email.trim(),
                dob: formData.dob,
                gender: formData.gender,
                phno: formData.phno.trim(),
                dept: formData.dept,
                password: formData.password
            });
            if (result?.status === 'verification_required') {
                toast.success('Check your email to verify your account, then log in.');
                navigate('/login');
                return;
            }
            toast.success('Registration successful!');
            navigate('/profile');
        } catch (error) {
            console.error('Signup failed:', error);
            toast.error(getErrorMessage(error, 'Failed to register'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#fffdf5] text-black flex flex-col">
            <PdaHeader />
            <main className="relative isolate flex-1 overflow-hidden">
                <div className="pointer-events-none absolute inset-0 z-0">
                    <div className="absolute left-[6%] top-10 h-16 w-16 rotate-12 border-4 border-black bg-[#8B5CF6]" />
                    <div className="absolute bottom-20 right-8 h-24 w-24 border-4 border-black bg-[#FDE047]" />
                </div>

                <div className="relative z-10 mx-auto grid w-full max-w-7xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1.02fr_0.98fr] lg:px-8 lg:py-14">
                    <section className="order-2 rounded-md border-4 border-black bg-white p-6 shadow-[8px_8px_0px_0px_#000000] sm:p-8 lg:order-1">
                        <Link
                            to="/"
                            data-testid="pda-signup-back-home-link"
                            className="inline-flex items-center gap-2 rounded-md border-2 border-black bg-[#FDE047] px-3 py-2 text-xs font-bold uppercase tracking-[0.14em] text-black shadow-neo transition-[transform,box-shadow] duration-150 hover:-translate-x-[1px] hover:-translate-y-[1px] hover:shadow-[6px_6px_0px_0px_#000000]"
                        >
                            <ArrowLeft className="h-4 w-4" />
                            Back To Home
                        </Link>

                        <p className="mt-6 font-mono text-xs font-bold uppercase tracking-[0.2em] text-[#8B5CF6]">PDA Signup</p>
                        <h1 className="mt-2 font-heading text-4xl font-black uppercase tracking-tight">General User Registration</h1>
                        <p className="mt-2 max-w-2xl text-sm font-medium text-slate-700">
                            Create your account to join PDA programs, events, and community initiatives.
                        </p>

                        <form onSubmit={handleSubmit} className="mt-8 grid gap-4 md:grid-cols-2">
                            <div>
                                <Label htmlFor="name" className="text-xs font-bold uppercase tracking-[0.12em]">Name *</Label>
                                <Input
                                    id="name"
                                    name="name"
                                    value={formData.name}
                                    onChange={handleChange}
                                    required
                                    data-testid="pda-signup-name-input"
                                    className={inputClass}
                                />
                            </div>
                            <div>
                                <Label htmlFor="regno" className="text-xs font-bold uppercase tracking-[0.12em]">Register Number *</Label>
                                <Input
                                    id="regno"
                                    name="regno"
                                    value={formData.regno}
                                    onChange={handleChange}
                                    required
                                    data-testid="pda-signup-regno-input"
                                    className={inputClass}
                                />
                            </div>
                            <div>
                                <Label htmlFor="profile_name" className="text-xs font-bold uppercase tracking-[0.12em]">Profile Name *</Label>
                                <Input
                                    id="profile_name"
                                    name="profile_name"
                                    value={formData.profile_name}
                                    onChange={handleChange}
                                    placeholder="eg: john_doe"
                                    required
                                    data-testid="pda-signup-profile-name-input"
                                    className={inputClass}
                                />
                                <p className="mt-1 text-[11px] font-medium text-slate-600">3-40 chars: lowercase letters, numbers, underscore.</p>
                            </div>
                            <div>
                                <Label htmlFor="email" className="text-xs font-bold uppercase tracking-[0.12em]">Email *</Label>
                                <Input
                                    id="email"
                                    name="email"
                                    type="email"
                                    value={formData.email}
                                    onChange={handleChange}
                                    required
                                    data-testid="pda-signup-email-input"
                                    className={inputClass}
                                />
                            </div>
                            <div>
                                <Label htmlFor="dob" className="text-xs font-bold uppercase tracking-[0.12em]">Date Of Birth *</Label>
                                <Input
                                    id="dob"
                                    name="dob"
                                    type="date"
                                    value={formData.dob}
                                    onChange={handleChange}
                                    required
                                    data-testid="pda-signup-dob-input"
                                    className={inputClass}
                                />
                            </div>
                            <div>
                                <Label htmlFor="gender" className="text-xs font-bold uppercase tracking-[0.12em]">Gender *</Label>
                                <Select value={formData.gender} onValueChange={(value) => setFormData((prev) => ({ ...prev, gender: value }))}>
                                    <SelectTrigger id="gender" data-testid="pda-signup-gender-select" className={selectTriggerClass}>
                                        <SelectValue placeholder="Select gender" />
                                    </SelectTrigger>
                                    <SelectContent className={selectContentClass}>
                                        {GENDERS.map((gender) => (
                                            <SelectItem data-testid={`pda-signup-gender-${gender.value.toLowerCase()}`} key={gender.value} value={gender.value}>
                                                {gender.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label htmlFor="phno" className="text-xs font-bold uppercase tracking-[0.12em]">Phone *</Label>
                                <Input
                                    id="phno"
                                    name="phno"
                                    value={formData.phno}
                                    onChange={handleChange}
                                    required
                                    data-testid="pda-signup-phone-input"
                                    className={inputClass}
                                />
                            </div>
                            <div>
                                <Label htmlFor="dept" className="text-xs font-bold uppercase tracking-[0.12em]">Department *</Label>
                                <Select value={formData.dept} onValueChange={(value) => setFormData((prev) => ({ ...prev, dept: value }))}>
                                    <SelectTrigger id="dept" data-testid="pda-signup-dept-select" className={selectTriggerClass}>
                                        <SelectValue placeholder="Select department" />
                                    </SelectTrigger>
                                    <SelectContent className={selectContentClass}>
                                        {DEPARTMENTS.map((dept) => (
                                            <SelectItem data-testid={`pda-signup-dept-${dept.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`} key={dept.value} value={dept.value}>
                                                {dept.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="relative">
                                <Label htmlFor="password" className="text-xs font-bold uppercase tracking-[0.12em]">Password *</Label>
                                <Input
                                    id="password"
                                    name="password"
                                    type={showPassword ? 'text' : 'password'}
                                    value={formData.password}
                                    onChange={handleChange}
                                    required
                                    minLength={6}
                                    data-testid="pda-signup-password-input"
                                    className={`${inputClass} pr-12`}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword((prev) => !prev)}
                                    data-testid="pda-signup-password-toggle"
                                    className="absolute right-3 top-[34px] inline-flex h-6 w-6 items-center justify-center rounded-md border-2 border-black bg-white shadow-[2px_2px_0px_0px_#000000] transition-[transform,box-shadow] duration-150 hover:-translate-x-[1px] hover:-translate-y-[1px] hover:shadow-[4px_4px_0px_0px_#000000]"
                                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                                >
                                    {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                </button>
                            </div>
                            <div className="relative">
                                <Label htmlFor="confirmPassword" className="text-xs font-bold uppercase tracking-[0.12em]">Confirm Password *</Label>
                                <Input
                                    id="confirmPassword"
                                    name="confirmPassword"
                                    type={showConfirmPassword ? 'text' : 'password'}
                                    value={formData.confirmPassword}
                                    onChange={handleChange}
                                    required
                                    minLength={6}
                                    data-testid="pda-signup-confirm-password-input"
                                    className={`${inputClass} pr-12`}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                                    data-testid="pda-signup-confirm-password-toggle"
                                    className="absolute right-3 top-[34px] inline-flex h-6 w-6 items-center justify-center rounded-md border-2 border-black bg-white shadow-[2px_2px_0px_0px_#000000] transition-[transform,box-shadow] duration-150 hover:-translate-x-[1px] hover:-translate-y-[1px] hover:shadow-[4px_4px_0px_0px_#000000]"
                                    aria-label={showConfirmPassword ? 'Hide password confirmation' : 'Show password confirmation'}
                                >
                                    {showConfirmPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                </button>
                            </div>

                            <div className="md:col-span-2 mt-2 border-t-2 border-dashed border-black pt-5">
                                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                                    <p className="text-sm font-medium text-slate-700">
                                        Already have an account?{' '}
                                        <Link
                                            to="/login"
                                            data-testid="pda-signup-login-link"
                                            className="font-bold uppercase tracking-[0.08em] text-[#8B5CF6] transition-[color] duration-150 hover:text-black"
                                        >
                                            Login
                                        </Link>
                                    </p>
                                    <Button
                                        type="submit"
                                        disabled={loading}
                                        data-testid="pda-signup-submit-button"
                                        className="h-12 rounded-md border-2 border-black bg-[#8B5CF6] px-6 text-sm font-bold uppercase tracking-[0.14em] text-white shadow-neo transition-[background-color,transform,box-shadow] duration-150 hover:bg-[#7C3AED] hover:-translate-x-[1px] hover:-translate-y-[1px] hover:shadow-[6px_6px_0px_0px_#000000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
                                    >
                                        {loading ? 'Creating Account...' : 'Create Account'}
                                    </Button>
                                </div>
                            </div>
                        </form>
                    </section>

                    <section className="order-1 overflow-hidden rounded-md border-4 border-black bg-[#11131a] shadow-[8px_8px_0px_0px_#000000] lg:order-2">
                        <div className="relative h-full min-h-[320px]">
                            <img src={SHOWCASE_IMAGE} alt="PDA event stage" className="absolute inset-0 h-full w-full object-cover opacity-35" />
                            <div className="relative z-10 flex h-full flex-col justify-between p-7 text-white">
                                <div className="inline-flex w-fit items-center gap-2 rounded-md border-2 border-black bg-[#FDE047] px-3 py-1 font-mono text-xs font-bold uppercase tracking-[0.14em] text-black">
                                    <Sparkles className="h-3 w-3" />
                                    New Member
                                </div>
                                <div>
                                    <h2 className="font-heading text-4xl font-black uppercase tracking-tight">
                                        Join. Learn.
                                    </h2>
                                    <h2 className="font-heading text-4xl font-black uppercase tracking-tight text-[#C4B5FD]">
                                        Lead.
                                    </h2>
                                    <p className="mt-4 max-w-md text-sm font-medium text-white/90">
                                        PDA brings students together for communication, leadership, and event execution through structured opportunities.
                                    </p>
                                </div>
                                <div className="grid grid-cols-3 gap-3">
                                    <div className="border-2 border-black bg-white px-3 py-2 text-black shadow-neo">
                                        <p className="font-heading text-2xl font-black">7</p>
                                        <p className="text-[10px] font-bold uppercase tracking-[0.12em]">Teams</p>
                                    </div>
                                    <div className="border-2 border-black bg-[#FDE047] px-3 py-2 text-black shadow-neo">
                                        <p className="font-heading text-2xl font-black">20+</p>
                                        <p className="text-[10px] font-bold uppercase tracking-[0.12em]">Events</p>
                                    </div>
                                    <div className="border-2 border-black bg-[#C4B5FD] px-3 py-2 text-black shadow-neo">
                                        <p className="font-heading text-2xl font-black">8000+</p>
                                        <p className="text-[10px] font-bold uppercase tracking-[0.12em]">Books</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>
                </div>
            </main>
            <PdaFooter />
        </div>
    );
}
