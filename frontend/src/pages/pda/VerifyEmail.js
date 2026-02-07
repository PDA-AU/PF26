import React, { useEffect, useState } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import PdaHeader from '@/components/layout/PdaHeader';
import { useAuth } from '@/context/AuthContext';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function VerifyEmail() {
    const navigate = useNavigate();
    const { user, loading: authLoading } = useAuth();
    const [searchParams] = useSearchParams();
    const [status, setStatus] = useState('verifying');
    const token = searchParams.get('token');

    useEffect(() => {
        const verify = async () => {
            if (!token) {
                setStatus('missing');
                return;
            }
            try {
                await axios.post(`${API}/auth/email/verify`, { token });
                if (user) {
                    navigate('/profile', { replace: true });
                    return;
                }
                setStatus('success');
            } catch (error) {
                if (user?.email_verified) {
                    setStatus('already');
                    return;
                }
                setStatus('error');
            }
        };
        verify();
    }, [token, authLoading, user, navigate]);

    return (
        <div className="min-h-screen bg-white flex flex-col">
            <PdaHeader />
            <div className="flex-1 flex items-center justify-center p-8">
                <div className="w-full max-w-md border-2 border-black shadow-neo rounded-3xl p-8 bg-white">
                    {status === 'verifying' && <p className="text-lg font-semibold">Verifying your email...</p>}
                    {status === 'missing' && <p className="text-lg font-semibold">Missing verification token.</p>}
                    {status === 'success' && <p className="text-lg font-semibold">Email verified successfully!</p>}
                    {status === 'already' && <p className="text-lg font-semibold">Email already verified.</p>}
                    {status === 'error' && <p className="text-lg font-semibold">Invalid or expired verification link.</p>}
                    <div className="mt-6">
                        <Button asChild className="w-full bg-[#f6c347] text-black border-2 border-black shadow-neo">
                            <Link to={user ? "/profile" : "/login"}>{user ? "Go to Profile" : "Go to Login"}</Link>
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
