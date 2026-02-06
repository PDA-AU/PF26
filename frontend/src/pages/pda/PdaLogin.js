import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Sparkles, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/context/AuthContext';
import PdaHeader from '@/components/layout/PdaHeader';

export default function PdaLogin() {
    const navigate = useNavigate();
    const { login } = useAuth();
    const [formData, setFormData] = useState({ regno: '', password: '' });
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);

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
            await login(formData.regno, formData.password);
            toast.success('Login successful');
            navigate('/pda/profile');
        } catch (error) {
            console.error('PDA login failed:', error);
            toast.error(getErrorMessage(error, 'Login failed. Please check your credentials.'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-white flex flex-col">
            <PdaHeader />
            <div className="flex-1 flex">
                <div className="hidden lg:flex lg:w-1/2 bg-[#11131a] relative overflow-hidden">
                    <div className="relative z-10 flex flex-col justify-center items-center w-full p-12 text-white">
                        <div className="w-20 h-20 bg-white border-4 border-black shadow-neo-lg flex items-center justify-center mb-8">
                            <Sparkles className="w-10 h-10 text-[#f6c347]" />
                        </div>
                        <h1 className="font-heading font-black text-5xl tracking-tighter mb-4 text-center">
                            PDA MEMBERS
                        </h1>
                        <p className="text-xl text-center max-w-md opacity-90">
                            Login to manage your PDA profile and team details.
                        </p>
                    </div>
                </div>

                <div className="flex-1 flex items-center justify-center p-8">
                    <div className="w-full max-w-md">
                    <Link to="/" className="inline-flex items-center gap-2 text-gray-600 hover:text-black mb-8 transition-colors">
                        <ArrowLeft className="w-5 h-5" />
                        <span className="font-medium">Back to Home</span>
                    </Link>

                    <h2 className="font-heading font-bold text-3xl md:text-4xl tracking-tight mb-2">
                        PDA Login
                    </h2>
                    <p className="text-gray-600 mb-8">Enter your credentials to continue.</p>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="space-y-2">
                            <Label htmlFor="regno" className="font-bold">Register Number</Label>
                            <Input
                                id="regno"
                                name="regno"
                                type="text"
                                placeholder="Enter your register number"
                                value={formData.regno}
                                onChange={handleChange}
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
                                    value={formData.password}
                                    onChange={handleChange}
                                    required
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
                            disabled={loading}
                            className="w-full bg-[#f6c347] text-black border-2 border-black shadow-neo hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all py-6 text-lg font-bold"
                        >
                            {loading ? 'Logging in...' : 'Login'}
                        </Button>
                    </form>

                    <p className="text-center mt-8 text-gray-600">
                        New to PDA?{' '}
                        <Link to="/recruit" className="font-bold text-[#b8890b] hover:underline">Apply here</Link>
                    </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
