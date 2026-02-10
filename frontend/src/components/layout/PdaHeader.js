import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LogOut, Menu, Sparkles, User, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import pdaLogo from '@/assets/pda-logo.png';
import { useAuth } from '@/context/AuthContext';

const navItems = [
    { to: '/', label: 'Home' }
];

const baseNavClass = 'inline-flex items-center rounded-md border-2 border-black px-3 py-2 text-xs font-bold uppercase tracking-[0.14em] shadow-neo transition-[background-color,color,transform,box-shadow] duration-150 hover:-translate-x-[1px] hover:-translate-y-[1px] hover:shadow-[6px_6px_0px_0px_#000000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none';

export default function PdaHeader() {
    const { user, logout } = useAuth();
    const location = useLocation();
    const [menuOpen, setMenuOpen] = useState(false);

    const userInitials = user?.name
        ? user.name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()
        : 'PD';

    const isActive = (path) => location.pathname === path;

    return (
        <header className="border-b-4 border-black bg-[#fffdf5]">
            <div className="h-2 w-full border-b-4 border-black bg-[#8B5CF6]" />
            <div className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between gap-4">
                    <Link
                        to="/"
                        data-testid="pda-header-logo-link"
                        className="inline-flex items-center gap-3 rounded-md border-2 border-black bg-white px-3 py-2 shadow-neo transition-[transform,box-shadow] duration-150 hover:-translate-x-[1px] hover:-translate-y-[1px] hover:shadow-[6px_6px_0px_0px_#000000]"
                    >
                        <img src={pdaLogo} alt="PDA logo" className="h-10 w-10 border-2 border-black bg-white object-contain p-1" />
                        <div className="leading-tight">
                            <p className="font-heading text-sm font-black uppercase tracking-[0.2em] text-black sm:text-base">
                                PERSOHUB
                            </p>
                            <p className="font-heading text-sm font-black uppercase tracking-[0.2em] text-[#8B5CF6] sm:text-base">
                               PDA
                            </p>
                        </div>
                    </Link>

                    <nav className="hidden items-center gap-2 md:flex">
                        {navItems.map((item) => (
                            <Link
                                key={item.to}
                                to={item.to}
                                data-testid={`pda-header-nav-${item.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                                className={`${baseNavClass} ${isActive(item.to) ? 'bg-[#FDE047] text-black' : 'bg-white text-black'}`}
                            >
                                {item.label}
                            </Link>
                        ))}

                        {user ? (
                            <>
                                <Link
                                    to="/profile"
                                    data-testid="pda-header-profile-link"
                                    className={`${baseNavClass} ${isActive('/profile') ? 'bg-[#C4B5FD]' : 'bg-white'}`}
                                >
                                    <User className="h-4 w-4" />
                                    Profile
                                </Link>
                                <button
                                    type="button"
                                    onClick={logout}
                                    data-testid="pda-header-logout-button"
                                    className="inline-flex h-10 w-10 items-center justify-center rounded-md border-2 border-black bg-white shadow-neo transition-[background-color,color,transform,box-shadow] duration-150 hover:bg-[#FF4D4D] hover:text-white hover:-translate-x-[1px] hover:-translate-y-[1px] hover:shadow-[6px_6px_0px_0px_#000000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
                                    aria-label="Logout"
                                >
                                    <LogOut className="h-4 w-4" />
                                </button>
                                <div className="inline-flex h-10 w-10 items-center justify-center rounded-md border-2 border-black bg-[#FDE047] font-mono text-xs font-bold shadow-neo">
                                    {user.image_url ? (
                                        <img src={user.image_url} alt={user.name || 'PDA user'} className="h-full w-full object-cover" />
                                    ) : (
                                        userInitials
                                    )}
                                </div>
                            </>
                        ) : (
                            <>
                                <Link to="/signup" data-testid="pda-header-signup-link" className={`${baseNavClass} bg-[#C4B5FD]`}>
                                    Join PDA
                                </Link>
                                <Link to="/login" data-testid="pda-header-login-link">
                                    <Button className="h-auto rounded-md border-2 border-black bg-[#8B5CF6] px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-white shadow-neo transition-[background-color,transform,box-shadow] duration-150 hover:bg-[#7C3AED] hover:-translate-x-[1px] hover:-translate-y-[1px] hover:shadow-[6px_6px_0px_0px_#000000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none">
                                        Login
                                    </Button>
                                </Link>
                            </>
                        )}
                    </nav>

                    <button
                        type="button"
                        onClick={() => setMenuOpen((prev) => !prev)}
                        data-testid="pda-header-mobile-toggle"
                        className="inline-flex h-10 w-10 items-center justify-center rounded-md border-2 border-black bg-white shadow-neo transition-[transform,box-shadow] duration-150 hover:-translate-x-[1px] hover:-translate-y-[1px] hover:shadow-[6px_6px_0px_0px_#000000] md:hidden"
                        aria-label={menuOpen ? 'Close menu' : 'Open menu'}
                    >
                        {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                    </button>
                </div>

                {menuOpen ? (
                    <div className="mt-4 rounded-md border-4 border-black bg-white p-4 shadow-[8px_8px_0px_0px_#000000] md:hidden">
                        <div className="mb-4 inline-flex items-center gap-2 rounded-md border-2 border-black bg-[#FDE047] px-3 py-1 font-mono text-xs font-bold uppercase tracking-[0.14em]">
                            <Sparkles className="h-3 w-3" />
                            Quick Menu
                        </div>
                        <div className="grid gap-2">
                            {navItems.map((item) => (
                                <Link
                                    key={item.to}
                                    to={item.to}
                                    data-testid={`pda-header-mobile-nav-${item.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                                    onClick={() => setMenuOpen(false)}
                                    className={`${baseNavClass} w-full justify-center ${isActive(item.to) ? 'bg-[#FDE047]' : 'bg-white'}`}
                                >
                                    {item.label}
                                </Link>
                            ))}
                            {!user ? (
                                <>
                                    <Link
                                        to="/signup"
                                        data-testid="pda-header-mobile-signup-link"
                                        onClick={() => setMenuOpen(false)}
                                        className={`${baseNavClass} w-full justify-center bg-[#C4B5FD]`}
                                    >
                                        Join PDA
                                    </Link>
                                    <Link
                                        to="/login"
                                        data-testid="pda-header-mobile-login-link"
                                        onClick={() => setMenuOpen(false)}
                                        className={`${baseNavClass} w-full justify-center bg-[#8B5CF6] text-white`}
                                    >
                                        Login
                                    </Link>
                                </>
                            ) : (
                                <>
                                    <Link
                                        to="/profile"
                                        data-testid="pda-header-mobile-profile-link"
                                        onClick={() => setMenuOpen(false)}
                                        className={`${baseNavClass} w-full justify-center bg-white`}
                                    >
                                        Profile
                                    </Link>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            logout();
                                            setMenuOpen(false);
                                        }}
                                        data-testid="pda-header-mobile-logout-button"
                                        className={`${baseNavClass} w-full justify-center bg-[#FF4D4D] text-white`}
                                    >
                                        Logout
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                ) : null}
            </div>
        </header>
    );
}
