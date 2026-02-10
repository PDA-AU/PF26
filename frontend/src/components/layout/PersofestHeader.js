import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Menu, X, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';

export default function PersofestHeader({ logoClassName }) {
    const { user, logout } = useAuth();
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const logoSizeClass = logoClassName || 'w-10 h-10';
    const isPfAdmin = !!(user?.is_superadmin || user?.policy?.pf);

    return (
        <nav className="sticky top-0 z-50 bg-white border-b-2 border-black">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between items-center h-16">
                    <Link to="/persofest" className="flex items-center gap-2">
                        <div className={`${logoSizeClass} bg-primary border-2 border-black shadow-neo flex items-center justify-center`}>
                            <Sparkles className="w-6 h-6 text-white" />
                        </div>
                        <span className="font-heading font-black text-xl tracking-tight">PERSOFEST'26</span>
                    </Link>

                    <div className="hidden md:flex items-center gap-4">
                        <Link to="/" className="font-bold hover:text-primary transition-colors">Home</Link>
                        <a href="#about" className="font-bold hover:text-primary transition-colors">About</a>
                        <a href="#rounds" className="font-bold hover:text-primary transition-colors">Rounds</a>
                        <a href="#referrers" className="font-bold hover:text-primary transition-colors">Top Referrers</a>
                        {user ? (
                            <div className="flex items-center gap-2">
                                <Link to={isPfAdmin ? '/persofest/admin' : '/persofest/dashboard'}>
                                    <Button data-testid="nav-dashboard-btn" className="bg-primary text-white border-2 border-black shadow-neo hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all">
                                        Dashboard
                                    </Button>
                                </Link>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={logout}
                                    className="border-2 border-black shadow-neo hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all"
                                >
                                    Logout
                                </Button>
                            </div>
                        ) : (
                            <div className="flex gap-2">
                                <Link to="/persofest/login">
                                    <Button data-testid="nav-login-btn" variant="outline" className="border-2 border-black shadow-neo hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all">
                                        Login
                                    </Button>
                                </Link>
                            </div>
                        )}
                    </div>

                    <button
                        className="md:hidden p-2 border-2 border-black bg-white shadow-neo"
                        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                        aria-label="Toggle menu"
                        data-testid="mobile-menu-btn"
                    >
                        {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
                    </button>
                </div>

                {mobileMenuOpen && (
                    <div className="md:hidden py-4 border-t-2 border-black">
                        <div className="flex flex-col gap-4">
                            <Link to="/" className="font-bold py-2" onClick={() => setMobileMenuOpen(false)}>Home</Link>
                            <a href="#about" className="font-bold py-2" onClick={() => setMobileMenuOpen(false)}>About</a>
                            <a href="#rounds" className="font-bold py-2" onClick={() => setMobileMenuOpen(false)}>Rounds</a>
                            <a href="#referrers" className="font-bold py-2" onClick={() => setMobileMenuOpen(false)}>Top Referrers</a>
                            {user ? (
                                <div className="flex flex-col gap-2">
                                    <Link to={isPfAdmin ? '/persofest/admin' : '/persofest/dashboard'} onClick={() => setMobileMenuOpen(false)}>
                                        <Button className="w-full bg-primary text-white border-2 border-black shadow-neo">Dashboard</Button>
                                    </Link>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => {
                                            setMobileMenuOpen(false);
                                            logout();
                                        }}
                                        className="w-full border-2 border-black shadow-neo"
                                    >
                                        Logout
                                    </Button>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-2">
                                    <Link to="/persofest/login" onClick={() => setMobileMenuOpen(false)}>
                                        <Button variant="outline" className="w-full border-2 border-black shadow-neo">Login</Button>
                                    </Link>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </nav>
    );
}
