import React, { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import PersofestHeader from '@/components/layout/PersofestHeader';
import PersofestFooter from '@/components/layout/PersofestFooter';

export default function RegisterPage() {
    const navigate = useNavigate();

    useEffect(() => {
        const timer = setTimeout(() => navigate('/signup', { replace: true }), 400);
        return () => clearTimeout(timer);
    }, [navigate]);

    return (
        <div className="min-h-screen bg-white flex flex-col">
            <PersofestHeader logoClassName="w-12 h-12" />
            <div className="flex-1 flex items-center justify-center p-8">
                <div className="w-full max-w-xl neo-card text-center">
                    <h1 className="font-heading font-bold text-3xl mb-3">Use Unified Signup</h1>
                    <p className="text-gray-700 mb-6">
                        Persofest registration now uses the common PDA account flow.
                        You are being redirected to signup.
                    </p>
                    <Link to="/signup">
                        <Button className="bg-primary text-white border-2 border-black shadow-neo hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all">
                            Continue to Signup <ArrowRight className="w-4 h-4 ml-2" />
                        </Button>
                    </Link>
                </div>
            </div>
            <PersofestFooter />
        </div>
    );
}
