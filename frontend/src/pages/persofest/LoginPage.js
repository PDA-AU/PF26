import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import { Eye, EyeOff, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import PdaLogo from '@/assets/pda-logo.png';
import PersofestHeader from '@/components/layout/PersofestHeader';

export default function LoginPage() {
    const navigate = useNavigate();
    const { login } = useAuth();
    const [formData, setFormData] = useState({
        register_number: '',
        password: ''
    });
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);

    const handleChange = (e) => {
        setFormData(prev => ({
            ...prev,
            [e.target.name]: e.target.value
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            await login(formData.register_number, formData.password);
            toast.success('Login successful!');
            navigate('/persofest/dashboard');
        } catch (error) {
            console.error('Login failed:', error);
            toast.error(error.response?.data?.detail || 'Login failed. Please check your credentials.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-white flex flex-col">
            <PersofestHeader logoClassName="w-12 h-12" />
            <div className="flex-1 flex">
            {/* Decorative Side Panel */}
            <div className="hidden lg:flex lg:w-1/2 bg-primary relative overflow-hidden">
                <div className="relative z-10 flex flex-col justify-center items-center w-full p-12 text-white">
                    <img src={PdaLogo} alt="PDA logo" className="w-20 h-20 object-contain mb-8" />
                    <h1 className="font-heading font-black text-5xl tracking-tighter mb-4 text-center">
                        PERSOFEST'26
                    </h1>
                    <p className="text-xl text-center max-w-md opacity-90">
                        Welcome back! Login to access your dashboard and track your competition progress.
                    </p>
                </div>
            </div>

            {/* Login Form */}
                <div className="flex-1 flex items-center justify-center p-8">
                    <div className="w-full max-w-md">
                    <Link to="/persofest" className="inline-flex items-center gap-2 text-gray-600 hover:text-black mb-8 transition-colors">
                        <ArrowLeft className="w-5 h-5" />
                        <span className="font-medium">Back to Home</span>
                    </Link>

                    <div className="lg:hidden flex items-center gap-2 mb-8">
                        <div className="w-12 h-12 bg-primary border-2 border-black shadow-neo flex items-center justify-center">
                            <img src={PdaLogo} alt="PDA logo" className="w-8 h-8 object-contain" />
                        </div>
                        <span className="font-heading font-black text-xl">PERSOFEST'26</span>
                    </div>

                    <h2 className="font-heading font-bold text-3xl md:text-4xl tracking-tight mb-2">
                        Welcome Back
                    </h2>
                    <p className="text-gray-600 mb-8">
                        Enter your credentials to access your account
                    </p>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="space-y-2">
                            <Label htmlFor="register_number" className="font-bold">
                                Register Number
                            </Label>
                            <Input
                                id="register_number"
                                name="register_number"
                                type="text"
                                placeholder="Enter your 10-digit register number"
                                value={formData.register_number}
                                onChange={handleChange}
                                required
                                maxLength={10}
                                className="neo-input"
                                data-testid="login-register-number"
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
                                    minLength={6}
                                    className="neo-input pr-12"
                                    data-testid="login-password"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-black"
                                    data-testid="toggle-password-visibility"
                                >
                                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                </button>
                            </div>
                            <div className="text-right">
                                <Link to="/persofest/forgot-password" className="text-sm font-semibold text-primary hover:underline">
                                    Forgot password?
                                </Link>
                            </div>
                        </div>

                        <Button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-primary text-white border-2 border-black shadow-neo hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all py-6 text-lg font-bold"
                            data-testid="login-submit-btn"
                        >
                            {loading ? (
                                <span className="flex items-center gap-2">
                                    <div className="loading-spinner w-5 h-5"></div>
                                    Logging in...
                                </span>
                            ) : (
                                'Login'
                            )}
                        </Button>
                    </form>

                    <p className="text-center mt-8 text-gray-600">
                        Don't have an account?{' '}
                        <Link to="/persofest/register" className="font-bold text-primary hover:underline" data-testid="goto-register-link">
                            Register here
                        </Link>
                    </p>

                    
                </div>
            </div>
            </div>
        </div>
    );
}
