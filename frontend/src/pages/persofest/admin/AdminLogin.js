import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Sparkles, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/context/AuthContext';

export default function AdminLogin() {
    const navigate = useNavigate();
    const { login, logout } = useAuth();
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
            const user = await login(formData.regno, formData.password);
            if (!user?.is_superadmin && !user?.policy?.pf) {
                toast.error('Persofest admin access required.');
                logout();
                return;
            }
            toast.success('Admin login successful');
            navigate('/persofest/admin');
        } catch (error) {
            console.error('Admin login failed:', error);
            toast.error(getErrorMessage(error, 'Login failed. Please check your credentials.'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-white flex">
            <div className="hidden lg:flex lg:w-1/2 bg-primary relative overflow-hidden">
                <div className="relative z-10 flex flex-col justify-center items-center w-full p-12 text-white">
                    <div className="w-20 h-20 bg-white border-4 border-black shadow-neo-lg flex items-center justify-center mb-8">
                        <Sparkles className="w-10 h-10 text-primary" />
                    </div>
                    <h1 className="font-heading font-black text-5xl tracking-tighter mb-4 text-center">
                        PERSOFEST ADMIN
                    </h1>
                    <p className="text-xl text-center max-w-md opacity-90">
                        Login with PDA admin credentials to manage Persofest.
                    </p>
                </div>
            </div>

            <div className="flex-1 flex items-center justify-center p-8">
                <div className="w-full max-w-md">
                    <Link to="/persofest" className="inline-flex items-center gap-2 text-gray-600 hover:text-black mb-8 transition-colors">
                        <ArrowLeft className="w-5 h-5" />
                        <span className="font-medium">Back to Home</span>
                    </Link>

                    <div className="lg:hidden flex items-center gap-2 mb-8">
                        <div className="w-10 h-10 bg-primary border-2 border-black shadow-neo flex items-center justify-center">
                            <Sparkles className="w-6 h-6 text-white" />
                        </div>
                        <span className="font-heading font-black text-xl">PERSOFEST ADMIN</span>
                    </div>

                    <h2 className="font-heading font-bold text-3xl md:text-4xl tracking-tight mb-2">
                        Admin Login
                    </h2>
                    <p className="text-gray-600 mb-8">
                        Use your PDA admin credentials.
                    </p>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="space-y-2">
                            <Label htmlFor="regno" className="font-bold">
                                Register Number
                            </Label>
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
                            <Label htmlFor="password" className="font-bold">
                                Password
                            </Label>
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
                            className="w-full bg-primary text-white border-2 border-black shadow-neo hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all py-6 text-lg font-bold"
                        >
                            {loading ? 'Logging in...' : 'Login'}
                        </Button>
                    </form>
                </div>
            </div>
        </div>
    );
}
