import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import axios from 'axios';
import { Calendar, MapPin, Users, Trophy, Star, ArrowRight, Menu, X, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function PersofestHome() {
    const { user } = useAuth();
    const [rounds, setRounds] = useState([]);
    const [topReferrers, setTopReferrers] = useState([]);
    const [registrationOpen, setRegistrationOpen] = useState(true);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [roundDialogOpen, setRoundDialogOpen] = useState(false);
    const [selectedRound, setSelectedRound] = useState(null);

    useEffect(() => {
        fetchPublicData();
    }, []);

    const fetchPublicData = async () => {
        try {
            const [roundsRes, referrersRes, statusRes] = await Promise.all([
                axios.get(`${API}/rounds/public`),
                axios.get(`${API}/top-referrers`),
                axios.get(`${API}/registration-status`)
            ]);
            setRounds(roundsRes.data);
            setTopReferrers(referrersRes.data);
            setRegistrationOpen(statusRes.data.registration_open);
        } catch (error) {
            console.error('Failed to fetch public data:', error);
        }
    };

    const formatDate = (dateString) => {
        if (!dateString) return 'TBA';
        return new Date(dateString).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        });
    };

    const openRoundDetails = (round) => {
        setSelectedRound(round);
        setRoundDialogOpen(true);
    };

    const getRoundPdfUrl = (round) => {
        if (!round?.description_pdf) return null;
        if (round.description_pdf.startsWith('http')) return round.description_pdf;
        return `${process.env.REACT_APP_BACKEND_URL}/uploads/${round.description_pdf}`;
    };

    return (
        <div className="min-h-screen bg-white overflow-hidden">
            {/* Navigation */}
            <nav className="sticky top-0 z-50 bg-white border-b-2 border-black">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center h-16">
                        <Link to="/persofest" className="flex items-center gap-2">
                            <div className="w-10 h-10 bg-primary border-2 border-black shadow-neo flex items-center justify-center">
                                <Sparkles className="w-6 h-6 text-white" />
                            </div>
                            <span className="font-heading font-black text-xl tracking-tight">PERSOFEST'26</span>
                        </Link>

                        {/* Desktop Nav */}
                        <div className="hidden md:flex items-center gap-4">
                            <a href="#about" className="font-bold hover:text-primary transition-colors">About</a>
                            <a href="#rounds" className="font-bold hover:text-primary transition-colors">Rounds</a>
                            <a href="#referrers" className="font-bold hover:text-primary transition-colors">Top Referrers</a>
                            {user ? (
                                <Link to={user.role === 'admin' ? '/admin' : '/dashboard'}>
                                    <Button data-testid="nav-dashboard-btn" className="bg-primary text-white border-2 border-black shadow-neo hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all">
                                        Dashboard
                                    </Button>
                                </Link>
                            ) : (
                                <div className="flex gap-2">
                                    <Link to="/login">
                                        <Button data-testid="nav-login-btn" variant="outline" className="border-2 border-black shadow-neo hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all">
                                            Login
                                        </Button>
                                    </Link>
                                    <Link to="/register">
                                        <Button data-testid="nav-register-btn" className="bg-primary text-white border-2 border-black shadow-neo hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all">
                                            Register
                                        </Button>
                                    </Link>
                                </div>
                            )}
                        </div>

                        {/* Mobile Menu Button */}
                        <button 
                            className="md:hidden p-2 border-2 border-black bg-white shadow-neo"
                            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                            data-testid="mobile-menu-btn"
                        >
                            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
                        </button>
                    </div>

                    {/* Mobile Menu */}
                    {mobileMenuOpen && (
                        <div className="md:hidden py-4 border-t-2 border-black">
                            <div className="flex flex-col gap-4">
                                <a href="#about" className="font-bold py-2" onClick={() => setMobileMenuOpen(false)}>About</a>
                                <a href="#rounds" className="font-bold py-2" onClick={() => setMobileMenuOpen(false)}>Rounds</a>
                                <a href="#referrers" className="font-bold py-2" onClick={() => setMobileMenuOpen(false)}>Top Referrers</a>
                                {user ? (
                                    <Link to={user.role === 'admin' ? '/admin' : '/dashboard'} onClick={() => setMobileMenuOpen(false)}>
                                        <Button className="w-full bg-primary text-white border-2 border-black shadow-neo">Dashboard</Button>
                                    </Link>
                                ) : (
                                    <div className="flex flex-col gap-2">
                                        <Link to="/login" onClick={() => setMobileMenuOpen(false)}>
                                            <Button variant="outline" className="w-full border-2 border-black shadow-neo">Login</Button>
                                        </Link>
                                        <Link to="/register" onClick={() => setMobileMenuOpen(false)}>
                                            <Button className="w-full bg-primary text-white border-2 border-black shadow-neo">Register</Button>
                                        </Link>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </nav>

            {/* Hero Section */}
            <section className="relative py-16 md:py-24 lg:py-32">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="grid lg:grid-cols-2 gap-12 items-center">
                        <div className="space-y-8">
                            <div className="inline-flex items-center gap-2 bg-accent border-2 border-black px-4 py-2 shadow-neo">
                                <Star className="w-5 h-5" />
                                <span className="font-bold text-sm uppercase tracking-wider">Inter-Department Competition</span>
                            </div>
                            
                            <h1 className="font-heading font-black text-5xl md:text-6xl lg:text-7xl tracking-tighter leading-tight">
                                PERSO<span className="text-primary">FEST</span>'26
                            </h1>
                            
                            <p className="text-lg md:text-xl font-medium text-gray-700 max-w-xl leading-relaxed">
                                Unleash your personality at the biggest inter-department competition at 
                                <span className="font-bold text-black"> Maras Institute of Technology, Chennai</span>. 
                                10 rounds of creativity, aptitude, and communication excellence.
                            </p>

                            <div className="flex flex-wrap gap-4">
                                {!user && (
                                    registrationOpen ? (
                                        <Link to="/register">
                                            <Button 
                                                data-testid="hero-register-btn"
                                                className="bg-primary text-white border-2 border-black shadow-neo-lg hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-neo transition-all text-lg px-8 py-6"
                                            >
                                                Register Now <ArrowRight className="ml-2 w-5 h-5" />
                                            </Button>
                                        </Link>
                                    ) : (
                                        <div className="bg-destructive text-white border-2 border-black shadow-neo px-6 py-3 font-bold">
                                            Registrations Closed
                                        </div>
                                    )
                                )}
                                <a href="#rounds">
                                    <Button 
                                        variant="outline" 
                                        className="border-2 border-black shadow-neo hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all text-lg px-8 py-6"
                                    >
                                        View Rounds
                                    </Button>
                                </a>
                            </div>

                            <div className="flex gap-8 pt-4">
                                <div className="stat-card">
                                    <div className="stat-value text-primary">10</div>
                                    <div className="stat-label">Rounds</div>
                                </div>
                                <div className="stat-card">
                                    <div className="stat-value text-primary">3</div>
                                    <div className="stat-label">Categories</div>
                                </div>
                            </div>
                        </div>

                        <div className="relative hidden lg:block">
                            <div className="relative z-10">
                                <img 
                                    src="https://images.unsplash.com/photo-1758270704524-596810e891b5?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzMzl8MHwxfHNlYXJjaHwxfHxjb2xsZWdlJTIwc3R1ZGVudHMlMjBkaXZlcnNlJTIwY2FtcHVzfGVufDB8fHx8MTc3MDAxNzA5M3ww&ixlib=rb-4.1.0&q=85"
                                    alt="Diverse college students"
                                    className="w-full h-[500px] object-cover border-4 border-black shadow-neo-lg"
                                />
                            </div>
                            <div className="absolute -bottom-6 -left-6 w-full h-full bg-primary border-4 border-black -z-10"></div>
                        </div>
                    </div>
                </div>
            </section>

            {/* About Section */}
            <section id="about" className="py-16 md:py-24 bg-secondary border-y-4 border-black">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="grid md:grid-cols-2 gap-12 items-center">
                        <div className="relative">
                            <img 
                                src="https://images.unsplash.com/photo-1575426254893-06d2712a655d?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjY2NjV8MHwxfHNlYXJjaHwxfHxtaWNyb3Bob25lJTIwc3RhZ2UlMjBzcG90bGlnaHR8ZW58MHx8fHwxNzcwMDE3MDk2fDA&ixlib=rb-4.1.0&q=85"
                                alt="Stage performance"
                                className="w-full h-[400px] object-cover border-4 border-black shadow-neo-lg"
                            />
                        </div>
                        <div className="space-y-6">
                            <h2 className="font-heading font-bold text-4xl md:text-5xl tracking-tight">
                                About The Event
                            </h2>
                            <p className="text-lg leading-relaxed">
                                Persofest is the flagship inter-department personality development competition 
                                organized by the <strong>Personality Development Association – Web Team</strong> at MIT Chennai.
                            </p>
                            <p className="text-lg leading-relaxed">
                                Through 10 challenging rounds spanning <strong>Creative</strong>, <strong>Aptitude</strong>, 
                                and <strong>Communication</strong> categories, participants showcase their talents and 
                                compete for the championship.
                            </p>
                            <div className="flex flex-wrap gap-3 pt-4">
                                <span className="tag tag-primary">Creative</span>
                                <span className="tag tag-accent">Aptitude</span>
                                <span className="tag tag-secondary">Communication</span>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Rounds Section */}
            <section id="rounds" className="py-16 md:py-24">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="text-center mb-12">
                        <h2 className="font-heading font-bold text-4xl md:text-5xl tracking-tight mb-4">
                            Competition Rounds
                        </h2>
                        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
                            {rounds.length > 0 
                                ? `${rounds.length} rounds published so far. More rounds coming soon!`
                                : 'Rounds will be announced soon. Stay tuned!'}
                        </p>
                    </div>

                    {rounds.length > 0 ? (
                        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {rounds.map((round, index) => (
                                <div 
                                    key={round.id} 
                                    className="neo-card hover-lift"
                                    data-testid={`round-card-${round.round_no}`}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => openRoundDetails(round)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault();
                                            openRoundDetails(round);
                                        }
                                    }}
                                >
                                    <div className="flex items-center justify-between mb-4">
                                        <span className="bg-primary text-white px-3 py-1 border-2 border-black font-bold text-sm">
                                            {round.round_no}
                                        </span>
                                        <span className={`tag ${round.mode === 'Online' ? 'tag-accent' : 'tag-secondary'}`}>
                                            {round.mode}
                                        </span>
                                    </div>
                                    <h3 className="font-heading font-bold text-xl mb-2">{round.name}</h3>
                                    <p className="text-gray-600 mb-4 line-clamp-2">{round.description || 'Details coming soon'}</p>
                                    <div className="flex items-center gap-2 text-sm text-gray-500">
                                        <Calendar className="w-4 h-4" />
                                        <span>{formatDate(round.date)}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="neo-card text-center py-12">
                            <Calendar className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                            <h3 className="font-heading font-bold text-xl mb-2">Coming Soon</h3>
                            <p className="text-gray-600">Round details will be announced soon. Check back later!</p>
                        </div>
                    )}
                </div>
                <Dialog open={roundDialogOpen} onOpenChange={setRoundDialogOpen}>
                    <DialogContent className="border-4 border-black">
                        <DialogHeader>
                            <DialogTitle className="font-heading font-bold text-2xl">
                                {selectedRound?.name || 'Round Details'}
                            </DialogTitle>
                        </DialogHeader>
                        {selectedRound && (
                            <div className="space-y-4">
                                <div className="flex items-center gap-2">
                                    <span className="bg-primary text-white px-2 py-1 border-2 border-black font-bold text-sm">
                                        {selectedRound.round_no}
                                    </span>
                                    <span className={`tag ${selectedRound.mode === 'Online' ? 'tag-accent' : 'tag-secondary'}`}>
                                        {selectedRound.mode}
                                    </span>
                                </div>
                                <p className="text-gray-600">{selectedRound.description || 'Details coming soon'}</p>
                                <div className="flex items-center gap-2 text-sm text-gray-500">
                                    <Calendar className="w-4 h-4" />
                                    <span>{formatDate(selectedRound.date)}</span>
                                </div>
                                <div className="pt-2">
                                    {getRoundPdfUrl(selectedRound) ? (
                                        <a href={getRoundPdfUrl(selectedRound)} target="_blank" rel="noreferrer">
                                            <Button className="bg-primary text-white border-2 border-black shadow-neo">
                                                View PDF
                                            </Button>
                                        </a>
                                    ) : (
                                        <Button disabled className="border-2 border-black">
                                            No PDF Available
                                        </Button>
                                    )}
                                </div>
                            </div>
                        )}
                    </DialogContent>
                </Dialog>
            </section>

            {/* Top Referrers Section */}
            <section id="referrers" className="py-16 md:py-24 bg-accent border-y-4 border-black">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="text-center mb-12">
                        <h2 className="font-heading font-bold text-4xl md:text-5xl tracking-tight mb-4">
                            Top Referrers
                        </h2>
                        <p className="text-lg max-w-2xl mx-auto">
                            Spread the word and climb the leaderboard! Share your referral code and help others join.
                        </p>
                    </div>

                    {topReferrers.length > 0 ? (
                        <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
                            {topReferrers.map((referrer, index) => (
                                <div 
                                    key={index}
                                    className={`bg-white border-4 border-black p-6 text-center ${
                                        index === 0 ? 'shadow-neo-lg transform md:-translate-y-4' : 'shadow-neo'
                                    }`}
                                    data-testid={`top-referrer-${index + 1}`}
                                >
                                    <div className={`w-16 h-16 mx-auto mb-4 border-2 border-black flex items-center justify-center ${
                                        index === 0 ? 'bg-accent' : index === 1 ? 'bg-gray-200' : 'bg-orange-200'
                                    }`}>
                                        <Trophy className="w-8 h-8" />
                                    </div>
                                    <div className="font-bold text-2xl mb-1">#{index + 1}</div>
                                    <h3 className="font-heading font-bold text-xl mb-1">{referrer.name}</h3>
                                    <p className="text-sm text-gray-600 mb-2">{referrer.department}</p>
                                    <div className="bg-primary text-white px-4 py-2 border-2 border-black inline-block">
                                        <span className="font-bold">{referrer.referral_count}</span> referrals
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="bg-white border-4 border-black p-8 text-center max-w-md mx-auto shadow-neo">
                            <Users className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                            <h3 className="font-heading font-bold text-xl mb-2">Be The First!</h3>
                            <p className="text-gray-600">Register and share your referral code to appear here!</p>
                        </div>
                    )}
                </div>
            </section>

            {/* CTA Section */}
            <section className="py-16 md:py-24 bg-primary text-white border-y-4 border-black">
                <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
                    <h2 className="font-heading font-black text-4xl md:text-5xl lg:text-6xl tracking-tight mb-6">
                        Ready to Compete?
                    </h2>
                    <p className="text-xl mb-8 opacity-90 max-w-2xl mx-auto">
                        Join hundreds of participants in the ultimate personality development competition. 
                        Show what you're made of!
                    </p>
                    {!user && registrationOpen && (
                        <Link to="/register">
                            <Button 
                                data-testid="cta-register-btn"
                                className="bg-accent text-black border-4 border-black shadow-neo-lg hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-neo transition-all text-xl px-12 py-6 font-bold"
                            >
                                Register Now <ArrowRight className="ml-2 w-6 h-6" />
                            </Button>
                        </Link>
                    )}
                </div>
            </section>

            {/* Footer */}
            <footer className="bg-black text-white py-12 border-t-4 border-primary">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="grid md:grid-cols-3 gap-8">
                        <div>
                            <div className="flex items-center gap-2 mb-4">
                                <div className="w-10 h-10 bg-primary border-2 border-white flex items-center justify-center">
                                    <Sparkles className="w-6 h-6 text-white" />
                                </div>
                                <span className="font-heading font-black text-xl">PERSOFEST'26</span>
                            </div>
                            <p className="text-gray-400">
                                Inter-Department Personality Development Competition
                            </p>
                        </div>
                        <div>
                            <h4 className="font-heading font-bold mb-4">Organized By</h4>
                            <p className="text-gray-400">
                                Personality Development Association<br />
                                Web Team<br />
                                Maras Institute of Technology, Chennai
                            </p>
                        </div>
                        <div>
                            <h4 className="font-heading font-bold mb-4">Quick Links</h4>
                            <div className="space-y-2">
                                <a href="#about" className="block text-gray-400 hover:text-white transition-colors">About</a>
                                <a href="#rounds" className="block text-gray-400 hover:text-white transition-colors">Rounds</a>
                                <Link to="/login" className="block text-gray-400 hover:text-white transition-colors">Login</Link>
                                <Link to="/register" className="block text-gray-400 hover:text-white transition-colors">Register</Link>
                            </div>
                        </div>
                    </div>
                    <div className="border-t border-gray-800 mt-8 pt-8 text-center text-gray-500">
                        <p>© 2026 Persofest. All rights reserved.</p>
                    </div>
                </div>
            </footer>
        </div>
    );
}
