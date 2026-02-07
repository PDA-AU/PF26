import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function ForgotPassword() {
    const [formData, setFormData] = useState({ register_number: '', email: '' });
    const [loading, setLoading] = useState(false);

    const handleChange = (e) => {
        setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await axios.post(`${API}/participant-auth/password/forgot`, {
                register_number: formData.register_number || null,
                email: formData.email || null
            });
            toast.success('If the account exists, a reset link has been sent.');
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Failed to send reset link');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-white flex items-center justify-center p-8">
            <div className="w-full max-w-md border-2 border-black shadow-neo rounded-3xl p-8 bg-white">
                <h2 className="font-heading font-bold text-2xl mb-2">Forgot Password</h2>
                <p className="text-gray-600 mb-6">Enter your register number and email.</p>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <Label htmlFor="register_number">Register Number</Label>
                        <Input id="register_number" name="register_number" value={formData.register_number} onChange={handleChange} className="neo-input" required />
                    </div>
                    <div>
                        <Label htmlFor="email">Email</Label>
                        <Input id="email" name="email" type="email" value={formData.email} onChange={handleChange} className="neo-input" required />
                    </div>
                    <Button type="submit" disabled={loading} className="w-full bg-primary text-white border-2 border-black shadow-neo">
                        {loading ? 'Sending...' : 'Send Reset Link'}
                    </Button>
                </form>
                <p className="text-center mt-6">
                    <Link to="/persofest/login" className="font-semibold text-primary hover:underline">Back to login</Link>
                </p>
            </div>
        </div>
    );
}
