import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { LogOut, Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import pdaLogo from '@/assets/pda-logo.png';
import { useAuth } from '@/context/AuthContext';

export default function HomeHeader() {
    const { user, logout } = useAuth();
    const [menuOpen, setMenuOpen] = useState(false);
    const userInitials = user?.name
        ? user.name.split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase()
        : 'PD';

    return (
        <header className="border-b border-black/10 bg-[#f3efe6]/90 backdrop-blur md:sticky md:top-0 md:z-50">
            <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-4">
                <Link to="/" className="flex items-center gap-3">
                    <img
                        src={pdaLogo}
                        alt="Personality Development Association"
                        className="h-11 w-11 rounded-full border border-black/10 object-cover"
                    />
                    <div className="leading-none">
                        <p className="text-xs font-heading font-black uppercase tracking-[0.22em] text-[#b8890b] sm:text-sm md:text-base">
                            Personality Development Association
                        </p>
                    </div>
                </Link>
                <nav className="flex items-center gap-3">
                    <Link
                        to="/"
                        className="hidden text-sm font-semibold text-slate-700 transition hover:text-[#0f1115] md:block"
                    >
                        Home
                    </Link>

                    {user ? (
                        <div className="hidden items-center gap-3 md:flex">
                            <Link to="/profile">
                                {user.image_url ? (
                                    <img
                                        src={user.image_url}
                                        alt={user.name || 'PDA user'}
                                        className="h-9 w-9 rounded-full border border-black/10 object-cover"
                                    />
                                ) : (
                                    <div className="flex h-9 w-9 items-center justify-center rounded-full border border-black/10 bg-white text-xs font-bold text-slate-700">
                                        {userInitials}
                                    </div>
                                )}
                            </Link>
                            <button
                                type="button"
                                onClick={logout}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-black/10 bg-white text-slate-600 transition hover:text-[#0f1115]"
                                aria-label="Logout"
                            >
                                <LogOut className="h-4 w-4" />
                            </button>
                        </div>
                    ) : null}
                    {!user && (
                        <Link to="/login">
                            <Button className="bg-[#f6c347] text-black shadow-none hover:bg-[#ffd16b]">
                                Login
                            </Button>
                        </Link>
                    )}
                    <button
                        type="button"
                        onClick={() => setMenuOpen((prev) => !prev)}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-black/10 bg-white text-slate-700 md:hidden"
                        aria-label={menuOpen ? 'Close menu' : 'Open menu'}
                    >
                        {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                    </button>
                </nav>
            </div>
            {menuOpen ? (
                <div className="border-t border-black/10 bg-[#f3efe6] md:hidden">
                    <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-5 py-4">
                        <Link to="/" className="text-sm font-semibold text-slate-700 hover:text-[#0f1115]" onClick={() => setMenuOpen(false)}>
                            Home
                        </Link>
                        <Link to="/recruit" className="text-sm font-semibold text-slate-700 hover:text-[#0f1115]" onClick={() => setMenuOpen(false)}>
                            Become a Member
                        </Link>
                        {!user ? (
                            <Link to="/login" className="text-sm font-semibold text-slate-700 hover:text-[#0f1115]" onClick={() => setMenuOpen(false)}>
                                Login
                            </Link>
                        ) : (
                            <>
                                <Link to="/profile" className="text-sm font-semibold text-slate-700 hover:text-[#0f1115]" onClick={() => setMenuOpen(false)}>
                                    My Profile
                                </Link>
                                <button
                                    type="button"
                                    onClick={() => {
                                        logout();
                                        setMenuOpen(false);
                                    }}
                                    className="text-left text-sm font-semibold text-slate-700 hover:text-[#0f1115]"
                                >
                                    Logout
                                </button>
                            </>
                        )}
                    </div>
                </div>
            ) : null}
        </header>
    );
}
