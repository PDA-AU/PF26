import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/context/AuthContext';
import PdaHeader from '@/components/layout/PdaHeader';

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

export default function PdaSignup() {
    const navigate = useNavigate();
    const { register } = useAuth();
    const [formData, setFormData] = useState({
        name: '',
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
        setLoading(true);
        try {
            const result = await register({
                name: formData.name.trim(),
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
        <div className="min-h-screen bg-[#f7f5f0] flex flex-col">
            <PdaHeader />
            <div className="mx-auto w-full max-w-4xl px-5 py-10 flex-1">
                <Link to="/" className="inline-flex items-center gap-2 text-slate-600 hover:text-black mb-6">
                    <ArrowLeft className="w-5 h-5" /> Back to Home
                </Link>

                <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
                    <div>
                        <p className="text-xs uppercase tracking-[0.4em] text-slate-400">PDA Signup</p>
                        <h1 className="text-3xl font-heading font-black">General User Registration</h1>
                    </div>

                    <form onSubmit={handleSubmit} className="mt-8 grid gap-4 md:grid-cols-2">
                        <div>
                            <Label htmlFor="name">Name *</Label>
                            <Input id="name" name="name" value={formData.name} onChange={handleChange} required />
                        </div>
                        <div>
                            <Label htmlFor="regno">Register Number *</Label>
                            <Input id="regno" name="regno" value={formData.regno} onChange={handleChange} required />
                        </div>
                        <div>
                            <Label htmlFor="email">Email *</Label>
                            <Input id="email" name="email" type="email" value={formData.email} onChange={handleChange} required />
                        </div>
                        <div>
                            <Label htmlFor="dob">Date of Birth *</Label>
                            <Input id="dob" name="dob" type="date" value={formData.dob} onChange={handleChange} required />
                        </div>
                        <div>
                            <Label htmlFor="gender">Gender *</Label>
                            <Select value={formData.gender} onValueChange={(value) => setFormData((prev) => ({ ...prev, gender: value }))}>
                                <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Select gender" />
                                </SelectTrigger>
                                <SelectContent>
                                    {GENDERS.map((gender) => (
                                        <SelectItem key={gender.value} value={gender.value}>{gender.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label htmlFor="phno">Phone *</Label>
                            <Input id="phno" name="phno" value={formData.phno} onChange={handleChange} required />
                        </div>
                        <div>
                            <Label htmlFor="dept">Department *</Label>
                            <Select value={formData.dept} onValueChange={(value) => setFormData((prev) => ({ ...prev, dept: value }))}>
                                <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Select department" />
                                </SelectTrigger>
                                <SelectContent>
                                    {DEPARTMENTS.map((dept) => (
                                        <SelectItem key={dept.value} value={dept.value}>{dept.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label htmlFor="password">Password *</Label>
                            <Input id="password" name="password" type="password" value={formData.password} onChange={handleChange} required minLength={6} />
                        </div>
                        <div>
                            <Label htmlFor="confirmPassword">Confirm Password *</Label>
                            <Input
                                id="confirmPassword"
                                name="confirmPassword"
                                type="password"
                                value={formData.confirmPassword}
                                onChange={handleChange}
                                required
                                minLength={6}
                            />
                        </div>

                        <div className="md:col-span-2 flex flex-col gap-4">
                            <div className="flex justify-end">
                                <Button type="submit" disabled={loading} className="bg-[#f6c347] text-black hover:bg-[#ffd16b]">
                                    {loading ? 'Creating account...' : 'Create Account'}
                                </Button>
                            </div>
                            <p className="text-sm text-slate-600 text-right">
                                Already have an account?{' '}
                                <Link to="/login" className="font-semibold text-[#b8890b] hover:underline">
                                    Login
                                </Link>
                            </p>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
