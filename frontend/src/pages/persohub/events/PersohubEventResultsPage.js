import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import axios from 'axios';
import { ArrowLeft, Clock3, RadioTower, Trophy } from 'lucide-react';

import TrophyScene from './results/TrophyScene';
import './results/results-hero.css';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const fallbackCaption = (published) => (
    published
        ? 'The final standings are ready. Celebrate the people who made the event unforgettable.'
        : 'The scoreboard is being verified. This page will switch to the official reveal when results are published.'
);

export default function PersohubEventResultsPage() {
    const { eventSlug } = useParams();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        let mounted = true;
        setLoading(true);
        setError('');

        axios.get(`${API}/persohub/persohub-events/${encodeURIComponent(eventSlug)}/results`)
            .then((response) => {
                if (!mounted) return;
                setData(response.data || null);
            })
            .catch((err) => {
                if (!mounted) return;
                setData(null);
                setError(err?.response?.status === 404 ? 'Results page not found.' : 'Unable to load results right now.');
            })
            .finally(() => {
                if (mounted) setLoading(false);
            });

        return () => {
            mounted = false;
        };
    }, [eventSlug]);

    const published = Boolean(data?.results_published);
    const title = useMemo(() => {
        const eventTitle = String(data?.title || '').trim();
        if (published && eventTitle) return `${eventTitle} Results`;
        return eventTitle ? `${eventTitle} Reveal` : 'Results Reveal';
    }, [data?.title, published]);
    const caption = String(data?.results_caption || '').trim() || fallbackCaption(published);
    const modelUrl = String(data?.results_model_url || '').trim();

    if (loading) {
        return (
            <main className="results-hero-page">
                <div className="results-shell">
                    <div className="results-page-loader">
                        <div className="results-loader-box">
                            <div className="results-progress-topline">
                                <span>opening results channel</span>
                                <span>sync</span>
                            </div>
                            <div className="results-progress-track">
                                <div className="results-progress-fill" style={{ width: '58%' }} />
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        );
    }

    if (error) {
        return (
            <main className="results-hero-page">
                <div className="results-shell">
                    <div className="results-topbar">
                        <Link to={`/persohub/events/${eventSlug}`} className="results-ghost-link">
                            <ArrowLeft size={15} />
                            <span>Event</span>
                        </Link>
                    </div>
                    <div className="results-error-state">
                        <div className="results-error-box">
                            <div className="results-kicker">
                                <span className="results-kicker-line" />
                                <span>offline</span>
                            </div>
                            <h1 className="results-title">No Results</h1>
                            <p className="results-caption">{error}</p>
                        </div>
                    </div>
                </div>
            </main>
        );
    }

    return (
        <main className="results-hero-page">
            <div className="results-shell">
                <div className="results-topbar">
                    <Link to={`/persohub/events/${eventSlug}`} className="results-ghost-link">
                        <ArrowLeft size={15} />
                        <span>Event</span>
                    </Link>
                    <div className={`results-status-chip ${published ? '' : 'is-muted'}`}>
                        {published ? 'Published' : 'Preparing'}
                    </div>
                </div>

                <section className="results-hero" aria-label="Event results hero">
                    <div className="results-trophy-wrap" aria-hidden="true">
                        <TrophyScene subdued={!published} modelUrl={modelUrl} />
                    </div>

                    <div className="results-copy">
                        <div className="results-kicker">
                            <span className="results-kicker-line" />
                            <span>{published ? 'official results' : 'holding page'}</span>
                        </div>
                        <h1 className="results-title">{title}</h1>
                        <p className="results-caption">{caption}</p>
                        <div className="results-micro-row" aria-label="Results metadata">
                            <span className="results-micro-chip">
                                <Trophy />
                                Trophy focus
                            </span>
                            <span className="results-micro-chip">
                                {published ? <RadioTower /> : <Clock3 />}
                                {published ? 'Live signal' : 'Awaiting publish'}
                            </span>
                        </div>
                    </div>
                </section>
            </div>
        </main>
    );
}
