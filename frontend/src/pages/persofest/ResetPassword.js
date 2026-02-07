import React, { useState } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import PersofestHeader from '@/components/layout/PersofestHeader';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function ResetPassword() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const token = searchParams.get('token');
    const [formData, setFormData] = useState({ new_password: '', confirm_password: '' });
    const [loading, setLoading] = useState(false);

    const handleChange = (e) => {
        setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!token) {
            toast.error('Missing reset token');
            return;
        }
        if (formData.new_password !== formData.confirm_password) {
            toast.error('Passwords do not match');
            return;
        }
        setLoading(true);
        try {
            await axios.post(`${API}/participant-auth/password/reset`, {
                token,
                new_password: formData.new_password,
                confirm_password: formData.confirm_password
            });
            toast.success('Password reset successfully');
            navigate('/persofest/login');
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Failed to reset password');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-white flex flex-col">
            <PersofestHeader />
            <div className="flex-1 flex items-center justify-center p-8">
                <div className="w-full max-w-md border-2 border-black shadow-neo rounded-3xl p-8 bg-white">
                    <h2 className="font-heading font-bold text-2xl mb-2">Reset Password</h2>
                    <p className="text-gray-600 mb-6">Set a new password for your account.</p>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <Label htmlFor="new_password">New Password</Label>
                            <Input id="new_password" name="new_password" type="password" value={formData.new_password} onChange={handleChange} className="neo-input" required />
                        </div>
                        <div>
                            <Label htmlFor="confirm_password">Confirm Password</Label>
                            <Input id="confirm_password" name="confirm_password" type="password" value={formData.confirm_password} onChange={handleChange} className="neo-input" required />
                        </div>
                        <Button type="submit" disabled={loading} className="w-full bg-primary text-white border-2 border-black shadow-neo">
                            {loading ? 'Resetting...' : 'Reset Password'}
                        </Button>
                    </form>
                    <p className="text-center mt-6">
                        <Link to="/persofest/login" className="font-semibold text-primary hover:underline">Back to login</Link>
                    </p>
                </div>
            </div>
        </div>
    );
}
