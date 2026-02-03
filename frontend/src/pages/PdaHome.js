import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Calendar, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import pdaData from '@/data/pda-content.json';
import pdaLogo from '@/assets/pda-logo.png';

const highlightStats = [
    { label: 'Active Members', value: '350+' },
    { label: 'Workshops Hosted', value: '45' },
    { label: 'Student Reach', value: '2,000+' },
    { label: 'Annual Flagship Events', value: '8' }
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
        const aDate = a.date ? new Date(a.date).getTime() : 0;
        const bDate = b.date ? new Date(b.date).getTime() : 0;
        return aDate - bDate;
    });
};

const formatDate = (dateString) => {
    if (!dateString) return 'TBA';
    return new Date(dateString).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    });
};

export default function PdaHome() {
    const revealObserverRef = useRef(null);

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
    }, []);

    const programs = pdaData?.programs || [];
    const events = sortByDateAsc(pdaData?.events || []);

    return (
        <div className="min-h-screen bg-[#f7f5f0] text-[#0f1115]">
            <header className="sticky top-0 z-50 border-b border-black/10 bg-[#f7f5f0]/90 backdrop-blur">
                <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-4">
                    <Link to="/" className="flex items-center gap-3">
                        <img src={pdaLogo} alt="Personality Development Association" className="h-11 w-11 rounded-full border border-black/10 object-cover" />
                        <div>
                            <p className="text-sm uppercase tracking-[0.3em] text-slate-500">Personality Development</p>
                            <p className="text-lg font-heading font-black">Association</p>
                        </div>
                    </Link>
                    <div className="flex items-center gap-3">
                        <Link to="/persofest" className="hidden text-sm font-semibold text-slate-600 transition hover:text-[#0f1115] md:block">
                            Persofest’26
                        </Link>
                        <Button className="bg-[#f6c347] text-black shadow-none hover:bg-[#ffd16b]">Join PDA</Button>
                    </div>
                </div>
            </header>

            <main>
                <section className="relative overflow-hidden">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,209,107,0.18),_transparent_60%)]" />
                    <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-10 px-5 py-16 md:flex-row md:items-center md:py-24">
                        <div className="max-w-xl" data-reveal>
                            <p className="mb-3 text-xs uppercase tracking-[0.5em] text-[#f6c347]">Personality Development Association</p>
                            <h1 className="text-4xl font-heading font-black leading-tight md:text-6xl">
                                Grow confidence, communication, and character with PDA.
                            </h1>
                            <p className="mt-5 text-base text-slate-600 md:text-lg">
                                A student-led community designed to elevate soft skills, leadership, and real-world readiness through curated programs and energetic workshops.
                            </p>
                            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                                <Button className="bg-[#f6c347] text-black shadow-none hover:bg-[#ffd16b]">
                                    Become a Member
                                </Button>
                                <Link to="/persofest" className="inline-flex items-center gap-2 rounded-md border border-black/10 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-black/20 hover:text-[#0f1115]">
                                    Explore Persofest’26
                                    <ArrowRight className="h-4 w-4" />
                                </Link>
                            </div>
                        </div>
                        <div className="relative" data-reveal>
                            <div className="absolute -top-6 left-6 h-24 w-24 rounded-full bg-[#f6c347]/25 blur-2xl" />
                            <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-2xl backdrop-blur">
                                <img src={pdaLogo} alt="PDA logo" className="h-48 w-48 rounded-2xl object-cover" />
                                <div className="mt-6 space-y-3 text-sm text-slate-600">
                                    <div className="flex items-center gap-2">
                                        <Sparkles className="h-4 w-4 text-[#f6c347]" />
                                        Mentorship circles, weekly skill labs, and peer accountability.
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Sparkles className="h-4 w-4 text-[#f6c347]" />
                                        Signature events that spotlight student voices.
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <section className="mx-auto w-full max-w-6xl px-5 py-14" data-reveal>
                    <div className="grid gap-6 md:grid-cols-4">
                        {highlightStats.map((stat) => (
                            <div key={stat.label} className="rounded-2xl border border-black/10 bg-white p-5 text-center">
                                <p className="text-2xl font-heading font-black text-[#f6c347]">{stat.value}</p>
                                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">{stat.label}</p>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="mx-auto w-full max-w-6xl px-5 py-14">
                    <div className="grid gap-10 md:grid-cols-[1.1fr_1fr]">
                        <div data-reveal>
                            <h2 className="text-3xl font-heading font-black">What PDA delivers</h2>
                            <p className="mt-4 text-slate-600">
                                PDA bridges classroom learning with real-world confidence. We curate spaces where students practice communication, sharpen leadership, and grow together.
                            </p>
                            <div className="mt-8 space-y-5">
                                {values.map((value) => (
                                    <div key={value.title} className="rounded-xl border border-black/10 bg-white p-4">
                                        <h3 className="font-heading text-lg font-bold">{value.title}</h3>
                                        <p className="mt-2 text-sm text-slate-600">{value.description}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="rounded-3xl border border-black/10 bg-gradient-to-br from-[#fff8e8] via-[#fff4d8] to-[#f7f0da] p-8" data-reveal>
                            <p className="text-xs uppercase tracking-[0.4em] text-slate-500">Our Focus</p>
                            <h3 className="mt-3 text-2xl font-heading font-black">Skill-first growth paths</h3>
                            <p className="mt-4 text-slate-600">
                                Each program combines expert sessions, peer practice, and measurable progress so every member leaves with confidence they can demonstrate.
                            </p>
                            <ul className="mt-6 space-y-3 text-sm text-slate-600">
                                <li>Speaking practice with supportive coaching.</li>
                                <li>Leadership labs led by alumni and mentors.</li>
                                <li>Career readiness sprints and mock sessions.</li>
                            </ul>
                        </div>
                    </div>
                </section>

                <section className="mx-auto w-full max-w-6xl px-5 py-14">
                    <div className="flex items-center justify-between gap-4" data-reveal>
                        <div>
                            <p className="text-xs uppercase tracking-[0.4em] text-[#f6c347]">Programs</p>
                            <h2 className="text-3xl font-heading font-black">Programs & Activities</h2>
                        </div>
                        <Link to="/persofest" className="text-sm font-semibold text-slate-500 transition hover:text-[#0f1115]">
                            See Persofest’26
                        </Link>
                    </div>
                    <div className="mt-8 grid gap-6 md:grid-cols-3" data-reveal>
                        {programs.length > 0 ? (
                            programs.map((program) => (
                                <div key={program.title} className="rounded-2xl border border-black/10 bg-white p-5 transition hover:-translate-y-1 hover:border-black/20">
                                    {program.poster_url ? (
                                        <img
                                            src={program.poster_url}
                                            alt={program.title}
                                            loading="lazy"
                                            className="mb-4 h-40 w-full rounded-xl object-cover"
                                        />
                                    ) : null}
                                    <span className="inline-flex rounded-full border border-[#f6c347]/40 px-3 py-1 text-xs uppercase tracking-[0.2em] text-[#f6c347]">
                                        {program.tag || 'Program'}
                                    </span>
                                    <h3 className="mt-4 text-xl font-heading font-bold">{program.title}</h3>
                                    <p className="mt-2 text-sm text-slate-600">{program.description}</p>
                                </div>
                            ))
                        ) : (
                            <div className="col-span-full rounded-2xl border border-black/10 bg-white p-6 text-center text-sm text-slate-500">
                                Program updates are coming soon.
                            </div>
                        )}
                    </div>
                </section>

                <section className="mx-auto w-full max-w-6xl px-5 py-14">
                    <div className="flex items-center justify-between gap-4" data-reveal>
                        <div>
                            <p className="text-xs uppercase tracking-[0.4em] text-[#f6c347]">Events</p>
                            <h2 className="text-3xl font-heading font-black">Events & Workshops</h2>
                        </div>
                        <Button variant="outline" className="border-black/10 text-[#0f1115] hover:bg-white">
                            View Calendar
                        </Button>
                    </div>
                    <div className="mt-8 grid gap-6 md:grid-cols-3" data-reveal>
                        {events.length > 0 ? (
                            events.map((event) => (
                                <div key={`${event.title}-${event.date}`} className="rounded-2xl border border-black/10 bg-white p-5">
                                    {event.poster_url ? (
                                        <img
                                            src={event.poster_url}
                                            alt={event.title}
                                            loading="lazy"
                                            className="mb-4 h-40 w-full rounded-xl object-cover"
                                        />
                                    ) : null}
                                    <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-slate-500">
                                        <Calendar className="h-4 w-4 text-[#f6c347]" />
                                        {formatDate(event.date)} · {event.format}
                                    </div>
                                    <h3 className="mt-4 text-xl font-heading font-bold">{event.title}</h3>
                                    <p className="mt-2 text-sm text-slate-600">{event.description}</p>
                                </div>
                            ))
                        ) : (
                            <div className="col-span-full rounded-2xl border border-black/10 bg-white p-6 text-center text-sm text-slate-500">
                                Upcoming events will be announced soon.
                            </div>
                        )}
                    </div>
                </section>

                <section className="mx-auto w-full max-w-6xl px-5 py-14" data-reveal>
                    <div className="rounded-3xl border border-black/10 bg-gradient-to-r from-[#f6c347]/15 via-[#f6c347]/5 to-transparent p-8 md:p-12">
                        <h2 className="text-3xl font-heading font-black text-[#0f1115]">Ready to explore Persofest’26?</h2>
                        <p className="mt-3 max-w-2xl text-slate-600">
                            Discover our flagship personality development festival, its rounds, and the opportunities waiting for you.
                        </p>
                        <Link to="/persofest" className="mt-6 inline-flex items-center gap-2 rounded-md bg-[#f6c347] px-4 py-2 text-sm font-semibold text-black hover:bg-[#ffd16b]">
                            Go to Persofest’26
                            <ArrowRight className="h-4 w-4" />
                        </Link>
                    </div>
                </section>
            </main>

            <footer className="border-t border-black/10 bg-white py-8">
                <div className="mx-auto flex w-full max-w-6xl flex-col items-start gap-4 px-5 text-sm text-slate-500 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-center gap-3">
                        <img src={pdaLogo} alt="PDA" className="h-8 w-8 rounded-full border border-black/10 object-cover" />
                        <span>Personality Development Association</span>
                    </div>
                    <div className="flex flex-wrap gap-4">
                        <Link to="/persofest" className="hover:text-[#0f1115]">Persofest’26</Link>
                        <a href="#" className="hover:text-[#0f1115]">Join the community</a>
                        <a href="#" className="hover:text-[#0f1115]">Contact</a>
                    </div>
                </div>
            </footer>
        </div>
    );
}
