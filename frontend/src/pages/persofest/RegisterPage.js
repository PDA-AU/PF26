import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import axios from 'axios';
import { toast } from 'sonner';
import { Eye, EyeOff, Sparkles, ArrowLeft, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

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

const YEARS = [
    { value: "First Year", label: "First Year" },
    { value: "Second Year", label: "Second Year" },
    { value: "Third Year", label: "Third Year" }
];

const GENDERS = [
    { value: "Male", label: "Male" },
    { value: "Female", label: "Female" }
];

export default function RegisterPage() {
    const navigate = useNavigate();
    const { register } = useAuth();
    const [registrationOpen, setRegistrationOpen] = useState(true);
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        register_number: '',
        email: '',
        phone: '',
        password: '',
        confirmPassword: '',
        gender: '',
        department: '',
        year_of_study: '',
        referral_code: ''
    });

    useEffect(() => {
        checkRegistrationStatus();
    }, []);

    const checkRegistrationStatus = async () => {
        try {
            const response = await axios.get(`${API}/registration-status`);
            setRegistrationOpen(response.data.registration_open);
        } catch (error) {
            console.error('Failed to check registration status:', error);
        }
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSelectChange = (name, value) => {
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const validateForm = () => {
        if (formData.register_number.length !== 10 || !/^\d+$/.test(formData.register_number)) {
            toast.error('Register number must be exactly 10 digits');
            return false;
        }
        if (formData.phone.length !== 10 || !/^\d+$/.test(formData.phone)) {
            toast.error('Phone number must be exactly 10 digits');
            return false;
        }
        if (formData.password.length < 6) {
            toast.error('Password must be at least 6 characters');
            return false;
        }
        if (formData.password !== formData.confirmPassword) {
            toast.error('Passwords do not match');
            return false;
        }
        return true;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!validateForm()) return;
        
        setLoading(true);
        try {
            const userData = {
                name: formData.name,
                register_number: formData.register_number,
                email: formData.email,
                phone: formData.phone,
                password: formData.password,
                gender: formData.gender,
                department: formData.department,
                year_of_study: formData.year_of_study,
                referral_code: formData.referral_code || null
            };

            await register(userData);
            toast.success('Registration successful! Welcome to Persofest\'26!');
            navigate('/dashboard');
        } catch (error) {
            console.error('Registration failed:', error);
            toast.error(error.response?.data?.detail || 'Registration failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    if (!registrationOpen) {
        return (
            <div className="min-h-screen bg-white flex items-center justify-center p-8">
                <div className="neo-card max-w-md text-center">
                    <div className="w-20 h-20 mx-auto bg-destructive border-4 border-black flex items-center justify-center mb-6">
                        <X className="w-10 h-10 text-white" />
                    </div>
                    <h2 className="font-heading font-bold text-2xl mb-4">Registrations Closed</h2>
                    <p className="text-gray-600 mb-6">
                        Sorry, registrations are currently closed. Please check back later or contact the organizers.
                    </p>
                    <Link to="/persofest">
                        <Button className="bg-primary text-white border-2 border-black shadow-neo hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all">
                            <ArrowLeft className="mr-2 w-5 h-5" /> Back to Home
                        </Button>
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-white">
            {/* Header */}
            <div className="bg-primary border-b-4 border-black py-4">
                <div className="max-w-4xl mx-auto px-4 flex items-center justify-between">
                    <Link to="/persofest" className="flex items-center gap-2 text-white">
                        <ArrowLeft className="w-5 h-5" />
                        <span className="font-medium">Back</span>
                    </Link>
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-white border-2 border-black flex items-center justify-center">
                            <Sparkles className="w-5 h-5 text-primary" />
                        </div>
                        <span className="font-heading font-bold text-white">PERSOFEST'26</span>
                    </div>
                </div>
            </div>

            <div className="max-w-2xl mx-auto px-4 py-12">
                <div className="text-center mb-8">
                    <h1 className="font-heading font-bold text-3xl md:text-4xl tracking-tight mb-2">
                        Join Persofest'26
                    </h1>
                    <p className="text-gray-600">
                        Fill in your details to register for the competition
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="neo-card space-y-6">
                    {/* Personal Details */}
                    <div className="space-y-4">
                        <h3 className="font-heading font-bold text-lg border-b-2 border-black pb-2">
                            Personal Details
                        </h3>
                        
                        <div className="grid md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="name" className="font-bold">Full Name *</Label>
                                <Input
                                    id="name"
                                    name="name"
                                    type="text"
                                    placeholder="Enter your full name"
                                    value={formData.name}
                                    onChange={handleChange}
                                    required
                                    className="neo-input"
                                    data-testid="register-name"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="register_number" className="font-bold">Register Number *</Label>
                                <Input
                                    id="register_number"
                                    name="register_number"
                                    type="text"
                                    placeholder="10-digit register number"
                                    value={formData.register_number}
                                    onChange={handleChange}
                                    required
                                    maxLength={10}
                                    className="neo-input"
                                    data-testid="register-number"
                                />
                            </div>
                        </div>

                        <div className="grid md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="email" className="font-bold">Email *</Label>
                                <Input
                                    id="email"
                                    name="email"
                                    type="email"
                                    placeholder="your.email@example.com"
                                    value={formData.email}
                                    onChange={handleChange}
                                    required
                                    className="neo-input"
                                    data-testid="register-email"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="phone" className="font-bold">Phone Number *</Label>
                                <Input
                                    id="phone"
                                    name="phone"
                                    type="tel"
                                    placeholder="10-digit phone number"
                                    value={formData.phone}
                                    onChange={handleChange}
                                    required
                                    maxLength={10}
                                    className="neo-input"
                                    data-testid="register-phone"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="gender" className="font-bold">Gender *</Label>
                            <Select onValueChange={(value) => handleSelectChange('gender', value)} required>
                                <SelectTrigger className="neo-input" data-testid="register-gender">
                                    <SelectValue placeholder="Select gender" />
                                </SelectTrigger>
                                <SelectContent>
                                    {GENDERS.map(g => (
                                        <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* Academic Details */}
                    <div className="space-y-4">
                        <h3 className="font-heading font-bold text-lg border-b-2 border-black pb-2">
                            Academic Details
                        </h3>

                        <div className="grid md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="department" className="font-bold">Department *</Label>
                                <Select onValueChange={(value) => handleSelectChange('department', value)} required>
                                    <SelectTrigger className="neo-input" data-testid="register-department">
                                        <SelectValue placeholder="Select department" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {DEPARTMENTS.map(d => (
                                            <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="year_of_study" className="font-bold">Year of Study *</Label>
                                <Select onValueChange={(value) => handleSelectChange('year_of_study', value)} required>
                                    <SelectTrigger className="neo-input" data-testid="register-year">
                                        <SelectValue placeholder="Select year" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {YEARS.map(y => (
                                            <SelectItem key={y.value} value={y.value}>{y.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </div>

                    {/* Password */}
                    <div className="space-y-4">
                        <h3 className="font-heading font-bold text-lg border-b-2 border-black pb-2">
                            Security
                        </h3>

                        <div className="grid md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="password" className="font-bold">Password *</Label>
                                <div className="relative">
                                    <Input
                                        id="password"
                                        name="password"
                                        type={showPassword ? 'text' : 'password'}
                                        placeholder="Min 6 characters"
                                        value={formData.password}
                                        onChange={handleChange}
                                        required
                                        minLength={6}
                                        className="neo-input pr-12"
                                        data-testid="register-password"
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

                            <div className="space-y-2">
                                <Label htmlFor="confirmPassword" className="font-bold">Confirm Password *</Label>
                                <Input
                                    id="confirmPassword"
                                    name="confirmPassword"
                                    type={showPassword ? 'text' : 'password'}
                                    placeholder="Re-enter password"
                                    value={formData.confirmPassword}
                                    onChange={handleChange}
                                    required
                                    className="neo-input"
                                    data-testid="register-confirm-password"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Referral */}
                    <div className="space-y-4">
                        <h3 className="font-heading font-bold text-lg border-b-2 border-black pb-2">
                            Referral (Optional)
                        </h3>

                        <div className="space-y-2">
                            <Label htmlFor="referral_code" className="font-bold">Referral Code</Label>
                            <Input
                                id="referral_code"
                                name="referral_code"
                                type="text"
                                placeholder="Enter referral code if you have one"
                                value={formData.referral_code}
                                onChange={handleChange}
                                maxLength={5}
                                className="neo-input"
                                data-testid="register-referral"
                            />
                            <p className="text-sm text-gray-500">Got a referral code from a friend? Enter it here!</p>
                        </div>
                    </div>

                    <Button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-primary text-white border-2 border-black shadow-neo hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all py-6 text-lg font-bold"
                        data-testid="register-submit-btn"
                    >
                        {loading ? (
                            <span className="flex items-center gap-2">
                                <div className="loading-spinner w-5 h-5"></div>
                                Registering...
                            </span>
                        ) : (
                            <>
                                <Check className="mr-2 w-5 h-5" /> Complete Registration
                            </>
                        )}
                    </Button>
                </form>

                <p className="text-center mt-6 text-gray-600">
                    Already have an account?{' '}
                    <Link to="/login" className="font-bold text-primary hover:underline" data-testid="goto-login-link">
                        Login here
                    </Link>
                </p>
            </div>
        </div>
    );
}
