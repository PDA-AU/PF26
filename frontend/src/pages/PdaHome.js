import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Calendar, Instagram, Linkedin, Mail, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import axios from 'axios';
import pdaLogo from '@/assets/pda-logo.png';
import pdaGroupPhoto from '@/assets/pda-group-photo.png';
import founderPhoto from '@/assets/founder.png';
const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const highlightStats = [
    { label: 'Active members', value: '150+' },
    { label: 'Years', value: '40+' },
    { label: 'Annual Sessions', value: '20+' },
    { label: 'PDA Library Books', value: '8000+' }
];

const values = [
    {
        title: 'Confidence',
        description: 'Build a voice that is clear, credible, and composed in any room.'
    },
    {
        title: 'Communication',
        description: 'Practice storytelling, persuasion, and everyday presence.'
    },
    {
        title: 'Community',
        description: 'Grow with a network that celebrates progress and accountability.'
    }
];

const sortByDateAsc = (items) => {
    return [...items].sort((a, b) => {
        const aDate = a.start_date ? new Date(a.start_date).getTime() : Number.MAX_SAFE_INTEGER;
        const bDate = b.start_date ? new Date(b.start_date).getTime() : Number.MAX_SAFE_INTEGER;
        return aDate - bDate;
    });
};

const formatDate = (value) => {
    if (!value) return '';
    const date = value instanceof Date ? value : new Date(value);
    return date.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    });
};

const formatDateRange = (event) => {
    if (!event?.start_date) return '';
    const start = new Date(event.start_date);
    const end = event.end_date ? new Date(event.end_date) : null;
    if (end && start.toDateString() !== end.toDateString()) {
        return `${formatDate(start)} - ${formatDate(end)}`;
    }
    return formatDate(start);
};

export default function PdaHome() {
    const revealObserverRef = useRef(null);
    const programScrollRef = useRef(null);
    const eventScrollRef = useRef(null);
    const galleryScrollRef = useRef(null);
    const [posterDialogOpen, setPosterDialogOpen] = useState(false);
    const [selectedPoster, setSelectedPoster] = useState(null);
    const [programs, setPrograms] = useState([]);
    const [events, setEvents] = useState([]);
    const [featuredEvents, setFeaturedEvents] = useState([]);
    const [activeFeaturedIndex, setActiveFeaturedIndex] = useState(0);
    const [isFeaturedFading, setIsFeaturedFading] = useState(false);
    const [teamMembers, setTeamMembers] = useState([]);
    const [galleryItems, setGalleryItems] = useState([]);
    const [teamFilter, setTeamFilter] = useState('Leadership');

    useEffect(() => {
        const elements = document.querySelectorAll('[data-reveal]');
        if (!elements.length) return;

        if (revealObserverRef.current) {
            revealObserverRef.current.disconnect();
        }

        revealObserverRef.current = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('reveal-visible');
                        revealObserverRef.current.unobserve(entry.target);
                    }
                });
            },
            { threshold: 0.2 }
        );

        elements.forEach((el) => {
            el.classList.add('reveal');
            revealObserverRef.current.observe(el);
        });

        return () => {
            if (revealObserverRef.current) {
                revealObserverRef.current.disconnect();
            }
        };
    }, [programs, events, featuredEvents]);

    useEffect(() => {
        const fetchPdaContent = async () => {
            try {
                const [programsRes, eventsRes, teamRes, galleryRes] = await Promise.all([
                    axios.get(`${API}/pda/programs`),
                    axios.get(`${API}/pda/events`),
                    axios.get(`${API}/pda/team`),
                    axios.get(`${API}/pda/gallery`)
                ]);
                const programData = programsRes.data || [];
                const eventData = eventsRes.data || [];
                setPrograms(programData);
                setEvents(sortByDateAsc(eventData));
                const featuredList = eventData.filter(event => event.is_featured);
                setFeaturedEvents(featuredList);
                setActiveFeaturedIndex(0);
                setTeamMembers(teamRes.data || []);
                setGalleryItems(galleryRes.data || []);
            } catch (error) {
                console.error('Failed to load PDA content:', error);
            }
        };

        fetchPdaContent();
    }, []);

    useEffect(() => {
        if (featuredEvents.length <= 1) return;
        const intervalId = setInterval(() => {
            setIsFeaturedFading(true);
            setTimeout(() => {
                setActiveFeaturedIndex((prev) => (prev + 1) % featuredEvents.length);
                setIsFeaturedFading(false);
            }, 700);
        }, 8000);
        return () => clearInterval(intervalId);
    }, [featuredEvents]);

    useEffect(() => {
        if (featuredEvents.length <= 1) return;
        const intervalId = setInterval(() => {
            setActiveFeaturedIndex((prev) => (prev + 1) % featuredEvents.length);
        }, 5000);
        return () => clearInterval(intervalId);
    }, [featuredEvents]);

    const heroImageSrc = pdaGroupPhoto || pdaLogo;

    const teamLabels = [
        'All',
        'Leadership',
        'General Secretaries',
        'Content Creation',
        'Event Management',
        'Design Team',
        'Website Design',
        'Public Relation',
        'Podcast',
        'Treasurer',
        'Librarian'
    ];

    const teamGroupMap = {
        Leadership: ['Chairperson', 'Vice Chairperson'],
        'General Secretaries': ['General Secretary'],
        'Content Creation': ['Head of Content Creation'],
        'Event Management': ['Head of Event Management'],
        'Design Team': ['Head of Design'],
        'Website Design': ['Head of Website Design'],
        'Public Relation': ['Head of Public Relation'],
        Podcast: ['Head of Podcast'],
        Treasurer: ['Treasurer'],
        Librarian: ['Chief Librarian']
    };

    const filteredTeamMembers = teamFilter === 'All'
        ? teamMembers
        : teamMembers.filter(member =>
            (teamGroupMap[teamFilter] || []).includes(member.team_designation)
        );

    const openPoster = (poster) => {
        if (!poster?.src) return;
        setSelectedPoster(poster);
        setPosterDialogOpen(true);
    };

    const scrollByOffset = (ref, offset) => {
        if (!ref?.current) return;
        ref.current.scrollBy({ left: offset, behavior: 'smooth' });
    };

    const buildCardMeta = (item) => {
        const dateRange = formatDateRange(item);
        const formatLabel = item?.format ? ` · ${item.format}` : '';
        return dateRange ? `${dateRange}${formatLabel}` : (item?.format || '');
    };

    const renderCard = (item, type) => {
        const meta = buildCardMeta(item);
        return (
            <button
                key={`${type}-${item.id || item.title}`}
                type="button"
                onClick={() =>
                    openPoster({
                        src: item.poster_url,
                        title: item.title,
                        meta
                    })
                }
                className={`flex h-full min-h-[360px] w-full flex-col rounded-2xl border border-black/10 bg-white p-5 text-left transition hover:-translate-y-1 hover:border-black/25 hover:shadow-md ${
                    item.poster_url ? 'cursor-pointer' : 'cursor-default'
                }`}
            >
                {item.poster_url ? (
                    <img
                        src={item.poster_url}
                        alt={item.title}
                        loading="lazy"
                        className="mb-4 h-40 w-full rounded-xl object-cover"
                    />
                ) : null}
                {meta ? (
                    <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-slate-600">
                        <Calendar className="h-4 w-4 text-[#f6c347]" />
                        {meta}
                    </div>
                ) : null}
                <h3 className="mt-4 text-xl font-heading font-bold line-clamp-2">{item.title}</h3>
                <p className="mt-2 text-sm text-slate-700 line-clamp-3">{item.description}</p>
                <span className="mt-auto" />
            </button>
        );
    };

    return (
        <div className="min-h-screen bg-[#f3efe6] text-[#11131a]">
            <header className="sticky top-0 z-50 border-b border-black/10 bg-[#f3efe6]/90 backdrop-blur">
                <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-4">
                    <Link to="/" className="flex items-center gap-3">
                        <img src={pdaLogo} alt="Personality Development Association" className="h-11 w-11 rounded-full border border-black/10 object-cover" />
                        <div className="leading-none">
                            <p className="text-sm font-heading font-black uppercase tracking-[0.22em] text-[#b8890b] sm:text-base md:text-lg">
                                Personality Development Association
                            </p>
                          
                        </div>
                    </Link>
                    
                </div>
            </header>

            <main>
                <section className="relative overflow-hidden">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(246,195,71,0.28),_transparent_55%)]" />
                    <div className="absolute inset-y-0 right-0 hidden w-1/2 bg-gradient-to-l from-white/70 via-white/30 to-transparent lg:block" />
                    <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-10 px-5 py-8 md:flex-row md:items-center md:py-16">
                        <div className="max-w-xl" data-reveal>
                            <div className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-3 py-1 text-[11px] uppercase tracking-[0.4em] text-[#b8890b]">
                                Since 1984
                            </div>
                            <h1 className="mt-4 text-3xl font-heading font-black leading-tight sm:text-4xl md:text-6xl">
                              PDA MIT
                            </h1>
                            <p className="mt-4 text-sm text-slate-700 sm:text-base md:text-lg">
                                The Personality Development Association (PDA) is one of the oldest and most respected student organizations at MIT. Established in 1984, PDA is dedicated to the holistic development of students, focusing on personal growth alongside academic and professional excellence.
                            </p>
                            <div className="mt-4 inline-flex items-center gap-2 rounded-2xl border border-black/10 bg-white px-4 py-2 text-xs uppercase tracking-[0.25em] text-[#0f1115]">
                                Our Motto: "Discover Thyself"
                            </div>
                            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                                <Button className="bg-[#f6c347] text-black shadow-none hover:bg-[#ffd16b]">
                                    Become a Member
                                </Button>
                                <Link to="/persofest" className="inline-flex items-center gap-2 rounded-md border border-black/15 bg-white/70 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:border-black/30 hover:text-[#0f1115]">
                                    Explore Persofest’26
                                    <ArrowRight className="h-4 w-4" />
                                </Link>
                            </div>
                            <div className="mt-6 grid gap-3 sm:grid-cols-3">
                                <div className="rounded-2xl border border-black/10 bg-white/80 p-4 text-center">
                                    <p className="text-lg font-heading font-black text-[#0f1115]">Career</p>
                                    <p className="text-xs uppercase tracking-[0.25em] text-slate-600">Guidance</p>
                                </div>
                                <div className="rounded-2xl border border-black/10 bg-white/80 p-4 text-center">
                                    <p className="text-lg font-heading font-black text-[#0f1115]">Internship</p>
                                    <p className="text-xs uppercase tracking-[0.25em] text-slate-600">Placement Prep</p>
                                </div>
                                <div className="rounded-2xl border border-black/10 bg-white/80 p-4 text-center">
                                    <p className="text-lg font-heading font-black text-[#0f1115]">Softskills</p>
                                    <p className="text-xs uppercase tracking-[0.25em] text-slate-600">Development</p>
                                </div>
                            </div>
                        </div>
                        <div className="relative w-full md:max-w-md" data-reveal>
                            <div className="absolute -top-6 left-6 h-24 w-24 rounded-full bg-[#f6c347]/25 blur-2xl" />
                            <div className="rounded-3xl border border-black/10 bg-white p-5 shadow-2xl backdrop-blur sm:p-6">
                                <img src={heroImageSrc} alt="PDA group" className="h-56 w-full rounded-2xl object-cover sm:h-64" />
                                <div className="mt-5 space-y-3 text-sm text-slate-700">
                                    <div className="flex items-center gap-2">
                                        <Sparkles className="h-4 w-4 text-[#f6c347]" />
                                        The Dedicated Team Continuing the Legacy of PDA
                                    </div>
                                </div>
                                <div className="mt-5 rounded-2xl border border-black/10 bg-[#11131a] px-4 py-3 text-[11px] uppercase tracking-[0.25em] text-[#f6c347]">
                                    Stars Behind Crestora'25, PERSOFEST'26
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {featuredEvents.length > 0 ? (
                    <section className="mx-auto w-full max-w-6xl px-5 pb-8">
                        <div className="grid gap-6 rounded-3xl border border-black/10 bg-gradient-to-r from-[#fff1c7] via-[#fff8e8] to-white p-6 md:grid-cols-[1.2fr_0.8fr] md:min-h-[320px]" data-reveal>
                            <div className={`transition-opacity duration-700 ease-in-out ${isFeaturedFading ? 'opacity-0' : 'opacity-100'}`}>
                                <p className="text-xs uppercase tracking-[0.4em] text-[#8b6a00]">Featured</p>
                                <h2 className="mt-3 text-3xl font-heading font-black text-[#0f1115]">
                                    {featuredEvents[activeFeaturedIndex]?.title}
                                </h2>
                                <p className="mt-4 text-sm text-slate-700 md:text-base">
                                    {featuredEvents[activeFeaturedIndex]?.hero_caption ||
                                        featuredEvents[activeFeaturedIndex]?.description ||
                                        'Event details coming soon.'}
                                </p>
                                <div className="mt-5 flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.2em] text-slate-600">
                                    <span className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-3 py-1 text-[#0f1115]">
                                        <Calendar className="h-4 w-4 text-[#f6c347]" />
                                        {formatDateRange(featuredEvents[activeFeaturedIndex])}
                                    </span>
                                    {featuredEvents[activeFeaturedIndex]?.format ? (
                                        <span className="inline-flex items-center rounded-full border border-black/10 bg-white px-3 py-1 text-[#0f1115]">
                                            {featuredEvents[activeFeaturedIndex]?.format}
                                        </span>
                                    ) : null}
                                </div>
                                {featuredEvents[activeFeaturedIndex]?.hero_url ? (
                                    <a
                                        href={featuredEvents[activeFeaturedIndex]?.hero_url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="mt-6 inline-flex items-center gap-2 rounded-md bg-[#0f1115] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#1f2330]"
                                    >
                                        Explore Event
                                        <ArrowRight className="h-4 w-4" />
                                    </a>
                                ) : null}
                            </div>
                            <div className={`flex items-center justify-center transition-opacity duration-700 ease-in-out ${isFeaturedFading ? 'opacity-0' : 'opacity-100'}`}>
                                {featuredEvents[activeFeaturedIndex]?.poster_url ? (
                                    <button
                                        type="button"
                                        onClick={() =>
                                            openPoster({
                                                src: featuredEvents[activeFeaturedIndex]?.poster_url,
                                                title: featuredEvents[activeFeaturedIndex]?.title,
                                                meta: `${formatDateRange(featuredEvents[activeFeaturedIndex])}${
                                                    featuredEvents[activeFeaturedIndex]?.format ? ` · ${featuredEvents[activeFeaturedIndex]?.format}` : ''
                                                }`
                                            })
                                        }
                                        className="w-full"
                                    >
                                        <img
                                            src={featuredEvents[activeFeaturedIndex]?.poster_url}
                                            alt={featuredEvents[activeFeaturedIndex]?.title}
                                            className="h-56 w-full rounded-2xl border border-black/10 object-cover md:h-[260px]"
                                        />
                                    </button>
                                ) : (
                                    <div className="flex h-56 w-full items-center justify-center rounded-2xl border border-dashed border-black/20 bg-white text-sm text-slate-500 md:h-[260px]">
                                        Poster coming soon
                                    </div>
                                )}
                            </div>
                            {featuredEvents.length > 1 ? (
                                <div className="md:col-span-2 flex items-center justify-center gap-2 pt-2">
                                    {featuredEvents.map((event, index) => (
                                        <button
                                            key={`${event.title}-${index}`}
                                            type="button"
                                            onClick={() => setActiveFeaturedIndex(index)}
                                            className={`h-2.5 w-2.5 rounded-full transition ${
                                                index === activeFeaturedIndex ? 'bg-[#0f1115]' : 'bg-black/20'
                                            }`}
                                            aria-label={`Show featured event ${index + 1}`}
                                        />
                                    ))}
                                </div>
                            ) : null}
                        </div>
                    </section>
                ) : null}

                <section className="mx-auto w-full max-w-6xl px-5 py-10 md:py-14" data-reveal>
                    <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
                        {highlightStats.map((stat) => (
                            <div key={stat.label} className="rounded-2xl border border-black/10 bg-white p-5 text-center shadow-sm">
                                <p className="text-2xl font-heading font-black text-[#b8890b]">{stat.value}</p>
                                <p className="text-xs uppercase tracking-[0.3em] text-slate-600">{stat.label}</p>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="mx-auto w-full max-w-6xl px-5 py-10 md:py-14">
                    <div className="grid gap-10 md:grid-cols-[1.1fr_1fr]">
                        <div data-reveal>
                            <h2 className="text-2xl font-heading font-black sm:text-3xl">What PDA delivers</h2>
                            <p className="mt-4 text-slate-700">
                                PDA bridges classroom learning with real-world confidence. We curate spaces where students practice communication, sharpen leadership, and grow together.
                            </p>
                            <div className="mt-8 space-y-5">
                                {values.map((value) => (
                                    <div key={value.title} className="rounded-xl border border-black/10 bg-white p-4 shadow-sm">
                                        <h3 className="font-heading text-lg font-bold">{value.title}</h3>
                                        <p className="mt-2 text-sm text-slate-700">{value.description}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="rounded-3xl border border-black/10 bg-gradient-to-br from-[#fff8e8] via-[#fff4d8] to-[#f7f0da] p-6 shadow-sm sm:p-8" data-reveal>
                            <p className="text-xs uppercase tracking-[0.4em] text-slate-600">Founder Tribute</p>
                            <div className="mt-4 flex flex-col items-center gap-4 text-center">
                                <img
                                    src={founderPhoto}
                                    alt="Prof. Dr. K. V. Narayanan"
                                    className="h-24 w-24 rounded-2xl border border-black/10 object-cover"
                                />
                                <div>
                                    <h3 className="text-xl font-heading font-black sm:text-2xl">Prof. Dr. K. V. Narayanan</h3>
                                    <p className="text-sm text-slate-600">Founder of the Personality Development Association</p>
                                </div>
                            </div>
                            <p className="mt-4 text-slate-700">
                                Personality Development Association was started in February 1984 by Prof. K. V. Narayanan and Prof. S. Renganathan with five students for enhancing the overall personality of MIT students.
                            </p>
                            <p className="mt-4 text-slate-700">
                                Department of Instrumentation Engineering recognizing the attributions of Prof K V Narayanan has named a conference hall as KVN Seminar Hall.
                            </p>
                            <p className="mt-4 text-sm font-semibold text-slate-700">
                                “True education empowers students to discover knowledge for themselves.”
                            </p>
                        </div>
                    </div>
                </section>

                <section className="mx-auto w-full max-w-6xl px-5 py-10 md:py-14">
                    <div className="flex items-center justify-between gap-4" data-reveal>
                        <div>
                            <h2 className="text-2xl font-heading font-black sm:text-3xl">Programs & Activities</h2>
                        </div>
                    </div>
                    <div className="mt-6 hidden grid auto-rows-fr items-stretch gap-6 md:grid md:grid-cols-3" data-reveal>
                        {programs.length > 0 ? (
                            programs.slice(0, 6).map((program) => renderCard(program, 'program'))
                        ) : (
                            <div className="col-span-full rounded-2xl border border-black/10 bg-white p-6 text-center text-sm text-slate-600">
                                Program updates are coming soon.
                            </div>
                        )}
                    </div>
                    <div className="mt-6 md:hidden">
                        {programs.length > 0 ? (
                            <>
                                <div
                                    ref={programScrollRef}
                                    className="flex gap-4 overflow-x-auto pb-4 no-scrollbar snap-x snap-mandatory"
                                >
                                    {programs.slice(0, 6).map((program) => (
                                        <div key={`program-mobile-${program.id || program.title}`} className="min-w-[260px] snap-start">
                                            {renderCard(program, 'program')}
                                        </div>
                                    ))}
                                </div>
                                <div className="flex items-center justify-center gap-3">
                                    <button
                                        type="button"
                                        onClick={() => scrollByOffset(programScrollRef, -280)}
                                        className="rounded-full border border-[#c99612] bg-[#f6c347] px-3 py-2 text-xs uppercase tracking-[0.2em] text-[#11131a] hover:bg-[#ffd16b]"
                                    >
                                        Prev
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => scrollByOffset(programScrollRef, 280)}
                                        className="rounded-full border border-[#c99612] bg-[#f6c347] px-3 py-2 text-xs uppercase tracking-[0.2em] text-[#11131a] hover:bg-[#ffd16b]"
                                    >
                                        Next
                                    </button>
                                </div>
                            </>
                        ) : (
                            <div className="rounded-2xl border border-black/10 bg-white p-6 text-center text-sm text-slate-600">
                                Program updates are coming soon.
                            </div>
                        )}
                    </div>
                </section>

                <section className="mx-auto w-full max-w-6xl px-5 py-10 md:py-14">
                    <div className="flex items-center justify-between gap-4" data-reveal>
                        <div>
                            <h2 className="text-2xl font-heading font-black sm:text-3xl">Events & Workshops</h2>
                        </div>
                    </div>
                    <div className="mt-6 hidden grid auto-rows-fr items-stretch gap-6 md:grid md:grid-cols-3" data-reveal>
                        {events.length > 0 ? (
                            events.slice(0, 6).map((event) => renderCard(event, 'event'))
                        ) : (
                            <div className="col-span-full rounded-2xl border border-black/10 bg-white p-6 text-center text-sm text-slate-600">
                                Upcoming events will be announced soon.
                            </div>
                        )}
                    </div>
                    <div className="mt-6 md:hidden">
                        {events.length > 0 ? (
                            <>
                                <div
                                    ref={eventScrollRef}
                                    className="flex gap-4 overflow-x-auto pb-4 no-scrollbar snap-x snap-mandatory"
                                >
                                    {events.slice(0, 6).map((event) => (
                                        <div key={`event-mobile-${event.id || event.title}`} className="min-w-[260px] snap-start">
                                            {renderCard(event, 'event')}
                                        </div>
                                    ))}
                                </div>
                                <div className="flex items-center justify-center gap-3">
                                    <button
                                        type="button"
                                        onClick={() => scrollByOffset(eventScrollRef, -280)}
                                        className="rounded-full border border-[#c99612] bg-[#f6c347] px-3 py-2 text-xs uppercase tracking-[0.2em] text-[#11131a] hover:bg-[#ffd16b]"
                                    >
                                        Prev
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => scrollByOffset(eventScrollRef, 280)}
                                        className="rounded-full border border-[#c99612] bg-[#f6c347] px-3 py-2 text-xs uppercase tracking-[0.2em] text-[#11131a] hover:bg-[#ffd16b]"
                                    >
                                        Next
                                    </button>
                                </div>
                            </>
                        ) : (
                            <div className="rounded-2xl border border-black/10 bg-white p-6 text-center text-sm text-slate-600">
                                Upcoming events will be announced soon.
                            </div>
                        )}
                    </div>
                </section>

                <section className="mx-auto w-full max-w-6xl px-5 py-10 md:py-14" data-reveal>
                    <div className="rounded-3xl border border-black/10 bg-gradient-to-r from-[#11131a] via-[#1a1d26] to-[#11131a] p-8 text-white md:p-12">
                        <p className="text-xs uppercase tracking-[0.4em] text-[#f6c347]">Flagship Festival</p>
                        <h2 className="mt-3 text-2xl font-heading font-black text-white sm:text-3xl">Ready to explore Persofest’26?</h2>
                        <p className="mt-3 max-w-2xl text-slate-200">
                            Discover our flagship personality development festival, its rounds, and the opportunities waiting for you.
                        </p>
                        <Link to="/persofest" className="mt-6 inline-flex items-center gap-2 rounded-md bg-[#f6c347] px-4 py-2 text-sm font-semibold text-black hover:bg-[#ffd16b]">
                            Go to Persofest’26
                            <ArrowRight className="h-4 w-4" />
                        </Link>
                    </div>
                </section>

                <section className="mx-auto w-full max-w-6xl px-5 py-10 md:py-14">
                    <div className="flex flex-col gap-4" data-reveal>
                        <div>
                            <p className="text-xs uppercase tracking-[0.4em] text-[#f6c347]">Community</p>
                            <h2 className="text-2xl font-heading font-black sm:text-3xl">Meet Our Team</h2>
                            <p className="mt-3 text-sm text-slate-700 md:text-base">
                                The people carrying PDA forward through mentorship, leadership, and service.
                            </p>
                        </div>
                        <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                            {teamLabels.map((label) => (
                                <button
                                    key={label}
                                    type="button"
                                    onClick={() => setTeamFilter(label)}
                                    className={`whitespace-nowrap rounded-full border px-4 py-2 text-xs uppercase tracking-[0.25em] transition ${
                                        teamFilter === label
                                            ? 'border-[#c99612] bg-[#f6c347] text-[#11131a]'
                                            : 'border-black/10 bg-[#11131a] text-[#f6c347] hover:border-[#c99612]'
                                    }`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 justify-items-center" data-reveal>
                        {filteredTeamMembers.length > 0 ? (
                            filteredTeamMembers.map((member) => (
                                <div key={member.regno} className="flex w-full max-w-sm flex-col rounded-3xl border border-black/10 bg-white p-7 text-center shadow-sm">
                                    <img
                                        src={member.photo_url || pdaLogo}
                                        alt={member.name}
                                        className="mx-auto h-32 w-32 rounded-3xl border border-black/10 object-cover"
                                    />
                                    <p className="mt-4 text-[11px] uppercase tracking-[0.3em] text-slate-500">
                                        {member.team_designation}
                                    </p>
                                    <h3 className="mt-2 text-xl font-heading font-bold">{member.name}</h3>
                                    <p className="text-sm text-slate-600">{member.regno}</p>
                                    <div className="mt-4 flex items-center justify-center gap-4 text-sm text-slate-600">
                                        {member.instagram_url ? (
                                            <a
                                                href={member.instagram_url}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="inline-flex items-center gap-2 text-[#b8890b] hover:text-[#0f1115]"
                                            >
                                                <Instagram className="h-4 w-4 text-[#f6c347]" />
                                                Instagram
                                            </a>
                                        ) : null}
                                        {member.linkedin_url ? (
                                            <a
                                                href={member.linkedin_url}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="inline-flex items-center gap-2 text-[#b8890b] hover:text-[#0f1115]"
                                            >
                                                <Linkedin className="h-4 w-4 text-[#f6c347]" />
                                                LinkedIn
                                            </a>
                                        ) : null}
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="col-span-full rounded-2xl border border-black/10 bg-white p-6 text-center text-sm text-slate-600">
                                Team updates are coming soon.
                            </div>
                        )}
                    </div>
                </section>

                <section className="mx-auto w-full max-w-6xl px-5 py-10 md:py-14">
                    <div data-reveal>
                        <p className="text-xs uppercase tracking-[0.4em] text-[#f6c347]">Gallery</p>
                        <h2 className="mt-2 text-2xl font-heading font-black sm:text-3xl">Gallery Photos</h2>
                        <p className="mt-3 text-sm text-slate-700 md:text-base">
                            Moments from PDA events, workshops, and community highlights.
                        </p>
                    </div>
                    <div className="mt-6 hidden items-stretch gap-4 md:grid md:grid-cols-3 lg:grid-cols-4" data-reveal>
                        {galleryItems.length > 0 ? (
                            galleryItems.map((item) => (
                                <div key={item.id} className="flex h-full min-h-[220px] flex-col rounded-2xl border border-black/10 bg-white p-3 shadow-sm">
                                    <img
                                        src={item.photo_url}
                                        alt={item.caption || 'PDA gallery'}
                                        className="h-44 w-full rounded-xl object-cover"
                                    />
                                    {item.caption ? (
                                        <p className="mt-3 text-sm text-slate-600">{item.caption}</p>
                                    ) : null}
                                </div>
                            ))
                        ) : (
                            <div className="col-span-full rounded-2xl border border-black/10 bg-white p-6 text-center text-sm text-slate-600">
                                Gallery updates are coming soon.
                            </div>
                        )}
                    </div>
                    <div className="mt-6 md:hidden">
                        {galleryItems.length > 0 ? (
                            <>
                                <div
                                    ref={galleryScrollRef}
                                    className="flex gap-4 overflow-x-auto pb-4 no-scrollbar snap-x snap-mandatory"
                                >
                                    {galleryItems.map((item) => (
                                        <div key={`gallery-mobile-${item.id}`} className="min-w-[220px] snap-start">
                                            <div className="flex min-h-[210px] flex-col rounded-2xl border border-black/10 bg-white p-3 shadow-sm">
                                                <img
                                                    src={item.photo_url}
                                                    alt={item.caption || 'PDA gallery'}
                                                    className="h-40 w-full rounded-xl object-cover"
                                                />
                                                {item.caption ? (
                                                    <p className="mt-3 text-sm text-slate-600">{item.caption}</p>
                                                ) : null}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <div className="flex items-center justify-center gap-3">
                                    <button
                                        type="button"
                                        onClick={() => scrollByOffset(galleryScrollRef, -240)}
                                        className="rounded-full border border-[#c99612] bg-[#f6c347] px-3 py-2 text-xs uppercase tracking-[0.2em] text-[#11131a] hover:bg-[#ffd16b]"
                                    >
                                        Prev
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => scrollByOffset(galleryScrollRef, 240)}
                                        className="rounded-full border border-[#c99612] bg-[#f6c347] px-3 py-2 text-xs uppercase tracking-[0.2em] text-[#11131a] hover:bg-[#ffd16b]"
                                    >
                                        Next
                                    </button>
                                </div>
                            </>
                        ) : (
                            <div className="rounded-2xl border border-black/10 bg-white p-6 text-center text-sm text-slate-600">
                                Gallery updates are coming soon.
                            </div>
                        )}
                    </div>
                </section>
            </main>

            <footer className="border-t border-black/10 bg-white py-10">
                <div className="mx-auto grid w-full max-w-6xl gap-6 px-5 text-sm text-slate-600 md:grid-cols-[1.2fr_0.8fr] md:items-center">
                    <div className="flex items-start gap-4">
                        <img src={pdaLogo} alt="PDA" className="h-12 w-12 rounded-2xl border border-black/10 object-cover" />
                        <div>
                            <p className="font-heading text-lg font-black text-[#0f1115]">Personality Development Association</p>
                            <p className="mt-1 text-sm text-slate-600">Contact us</p>
                            <a
                                href="mailto:pda@mitindia.edu"
                                className="mt-2 inline-flex items-center gap-2 text-sm text-slate-700 hover:text-[#0f1115]"
                            >
                                <Mail className="h-4 w-4" />
                                pda@mitindia.edu
                            </a>
                        </div>
                    </div>
                    <div className="flex flex-col gap-3 md:items-end">
                        <div className="flex flex-wrap gap-4">
                            <Link to="/persofest" className="font-semibold text-slate-700 hover:text-[#0f1115]">Persofest’26</Link>
                        </div>
                        <div className="flex flex-wrap gap-4 text-slate-700">
                            <a
                                href="https://www.instagram.com/pda_mit/"
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-2 hover:text-[#0f1115]"
                            >
                                <Instagram className="h-4 w-4" />
                                Instagram
                            </a>
                            <a
                                href="https://www.linkedin.com/company/personality-development-association-mit/"
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-2 hover:text-[#0f1115]"
                            >
                                <Linkedin className="h-4 w-4" />
                                LinkedIn
                            </a>
                        </div>
                    </div>
                </div>
            </footer>

	            <Dialog open={posterDialogOpen} onOpenChange={setPosterDialogOpen}>
	                <DialogContent className="max-w-3xl bg-white p-0">
	                    <DialogHeader className="px-6 pb-4 pt-6">
	                        <DialogTitle className="text-xl font-heading font-black">{selectedPoster?.title}</DialogTitle>
	                        {selectedPoster?.meta ? (
	                            <p className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-500">{selectedPoster.meta}</p>
	                        ) : null}
	                    </DialogHeader>
	                    {selectedPoster?.src ? (
	                        <div className="px-6 pb-6">
	                            <img
	                                src={selectedPoster.src}
	                                alt={selectedPoster.title || 'Poster'}
	                                className="max-h-[70vh] w-full rounded-2xl object-contain"
	                            />
	                        </div>
	                    ) : null}
	                </DialogContent>
	            </Dialog>
	        </div>
	    );
}
