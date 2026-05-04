import React, { useEffect, useId, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import axios from 'axios';
import {
    ArrowLeft,
    ArrowRight,
    ChevronLeft,
    ChevronRight,
    Clock3,
    Lock,
    Medal,
    Play,
    RadioTower,
    ScanLine,
    Sparkles,
    TrendingUp,
    Trophy,
    Waypoints,
    X,
} from 'lucide-react';
import {
    Area,
    AreaChart,
    Bar,
    BarChart,
    Cell,
    CartesianGrid,
    Line,
    LineChart,
    Pie,
    PieChart,
    PolarAngleAxis,
    PolarGrid,
    PolarRadiusAxis,
    Radar,
    RadarChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';

import TrophyScene from './results/TrophyScene';
import './results/results-hero.css';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const PALETTE = {
    gold: '#facc15',
    teal: '#2dd4bf',
    coral: '#fb7185',
    blue: '#38bdf8',
    lime: '#a3e635',
    rose: '#f472b6',
    slate: '#94a3b8',
};

const GRAPH_LABELS = {
    distribution: 'Distribution',
    leaders: 'Top 10',
};

const fallbackCaption = (published) => (
    published
        ? 'The final standings are ready. Celebrate the people who made the event unforgettable.'
        : 'The scoreboard is being verified. This page will switch to the official reveal when results are published.'
);

const chartColor = (paletteKey) => PALETTE[paletteKey] || PALETTE.gold;

const hexToRgb = (hex) => {
    const normalized = String(hex || '').replace('#', '').trim();
    if (normalized.length !== 6) return { r: 250, g: 204, b: 21 };
    const value = Number.parseInt(normalized, 16);
    return {
        r: (value >> 16) & 255,
        g: (value >> 8) & 255,
        b: value & 255,
    };
};

const toChartRows = (chart) => {
    const labels = Array.isArray(chart?.labels) ? chart.labels : [];
    const series = Array.isArray(chart?.series) ? chart.series : [];
    return labels.map((label, index) => {
        const row = { label };
        series.forEach((item) => {
            row[item.key] = Number(item?.data?.[index] || 0);
            row[`${item.key}_color`] = chartColor(item.palette_key);
            row[`${item.key}_label`] = item.label;
        });
        return row;
    });
};

function ResultsTooltip({ active, payload, label }) {
    if (!active || !payload || payload.length === 0) return null;
    return (
        <div className="results-chart-tooltip">
            <div className="results-chart-tooltip-label">{label}</div>
            {payload.map((item) => (
                <div key={item.dataKey} className="results-chart-tooltip-row">
                    <span className="results-chart-tooltip-dot" style={{ backgroundColor: item.color }} />
                    <span>{item.name}</span>
                    <strong>{Number(item.value || 0).toFixed(1).replace(/\.0$/, '')}</strong>
                </div>
            ))}
        </div>
    );
}

function AnimatedMetricValue({ value, active }) {
    const [displayValue, setDisplayValue] = useState(value);

    useEffect(() => {
        if (!active) {
            setDisplayValue(value);
            return undefined;
        }
        const numeric = Number(String(value).replace('%', ''));
        if (!Number.isFinite(numeric)) {
            setDisplayValue(value);
            return undefined;
        }
        setDisplayValue(String(value).includes('%') ? '0%' : '0');
        let frameId = 0;
        const duration = 420;
        const start = performance.now();
        const step = (time) => {
            const progress = Math.min((time - start) / duration, 1);
            const eased = 1 - ((1 - progress) ** 3);
            const nextValue = numeric * eased;
            const formatted = String(value).includes('%')
                ? `${nextValue.toFixed(numeric % 1 === 0 ? 0 : 1)}%`
                : `${nextValue.toFixed(numeric % 1 === 0 ? 0 : 2)}`.replace(/\.00$/, '');
            setDisplayValue(formatted);
            if (progress < 1) frameId = requestAnimationFrame(step);
        };
        frameId = requestAnimationFrame(step);
        return () => cancelAnimationFrame(frameId);
    }, [value, active]);

    return <>{displayValue ?? '--'}</>;
}

function ResultsHeatmap({ chart }) {
    const xLabels = Array.isArray(chart?.x_labels) ? chart.x_labels : [];
    const yLabels = Array.isArray(chart?.y_labels) ? chart.y_labels : [];
    const matrix = Array.isArray(chart?.matrix) ? chart.matrix : [];
    const { r, g, b } = hexToRgb(chartColor(chart?.palette_key));

    if (xLabels.length === 0 || yLabels.length === 0 || matrix.length === 0) {
        return <div className="results-chart-empty">No chart data yet.</div>;
    }

    return (
        <div
            className="results-heatmap"
            role="img"
            aria-label="Round criteria heatmap"
            style={{ '--results-heatmap-columns': xLabels.length }}
        >
            <div className="results-heatmap-corner" />
            {xLabels.map((label) => (
                <div key={label} className="results-heatmap-axis results-heatmap-axis-x">{label}</div>
            ))}
            {yLabels.map((label, rowIndex) => (
                <React.Fragment key={label}>
                    <div className="results-heatmap-axis results-heatmap-axis-y">{label}</div>
                    {xLabels.map((criterion, columnIndex) => {
                        const value = Number(matrix?.[rowIndex]?.[columnIndex] || 0);
                        const alpha = 0.14 + (Math.min(Math.max(value, 0), 100) / 100) * 0.78;
                        return (
                            <div
                                key={`${label}-${criterion}`}
                                className="results-heatmap-cell"
                                style={{ backgroundColor: `rgba(${r}, ${g}, ${b}, ${alpha})` }}
                            >
                                <span>{Math.round(value)}</span>
                            </div>
                        );
                    })}
                </React.Fragment>
            ))}
        </div>
    );
}

function ResultsPyramidChart({ chart, ariaLabel }) {
    const labels = Array.isArray(chart?.labels) ? chart.labels : [];
    const values = Array.isArray(chart?.series?.[0]?.data) ? chart.series[0].data : [];
    const color = chartColor(chart?.series?.[0]?.palette_key);
    const maxValue = Math.max(...values.map((item) => Number(item || 0)), 1);

    if (labels.length === 0 || values.length === 0) {
        return <div className="results-chart-empty">No chart data yet.</div>;
    }

    return (
        <div className="results-pyramid-chart" role="img" aria-label={ariaLabel}>
            {labels.map((label, index) => {
                const value = Number(values[index] || 0);
                const width = `${Math.max((value / maxValue) * 100, 14)}%`;
                return (
                    <div key={label} className="results-pyramid-row">
                        <div className="results-pyramid-label">{label}</div>
                        <div className="results-pyramid-bar-shell">
                            <div className="results-pyramid-bar" style={{ width, backgroundColor: color }}>
                                <span>{value}</span>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

function ResultsPieChart({ chart, ariaLabel }) {
    const labels = Array.isArray(chart?.labels) ? chart.labels : [];
    const values = Array.isArray(chart?.series?.[0]?.data) ? chart.series[0].data : [];
    const paletteCycle = ['gold', 'teal', 'coral', 'blue', 'lime', 'rose', 'slate'];
    const rows = labels.map((label, index) => ({
        name: label,
        value: Number(values[index] || 0),
        color: chartColor(paletteCycle[index % paletteCycle.length]),
    })).filter((item) => item.value > 0);

    if (rows.length === 0) {
        return <div className="results-chart-empty">No chart data yet.</div>;
    }

    return (
        <div className="results-pie-chart-shell" role="img" aria-label={ariaLabel}>
            <div className="results-pie-chart-visual">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Tooltip content={<ResultsTooltip />} />
                        <Pie
                            data={rows}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            outerRadius="82%"
                            innerRadius="48%"
                            paddingAngle={2}
                        >
                            {rows.map((entry) => (
                                <Cell key={entry.name} fill={entry.color} />
                            ))}
                        </Pie>
                    </PieChart>
                </ResponsiveContainer>
            </div>
            <div className="results-pie-chart-legend">
                {rows.map((row) => (
                    <div key={row.name} className="results-pie-chart-legend-row">
                        <span className="results-pie-chart-legend-dot" style={{ backgroundColor: row.color }} />
                        <span className="results-pie-chart-legend-label">{row.name}</span>
                        <strong className="results-pie-chart-legend-value">{row.value}</strong>
                    </div>
                ))}
            </div>
        </div>
    );
}

function ResultsDistributionSwitcher({ charts }) {
    const [mode, setMode] = useState('department');
    const chart = mode === 'batch' ? charts?.batch : charts?.department;
    const ariaLabel = mode === 'batch' ? 'Batch distribution chart' : 'Department distribution chart';

    return (
        <>
            <div className="results-round-switcher results-storyboard-switcher" role="tablist" aria-label="Distribution type">
                <button
                    type="button"
                    className={`results-switch-pill ${mode === 'department' ? 'is-active' : ''}`}
                    onClick={() => setMode('department')}
                >
                    Department
                </button>
                <button
                    type="button"
                    className={`results-switch-pill ${mode === 'batch' ? 'is-active' : ''}`}
                    onClick={() => setMode('batch')}
                >
                    Batch
                </button>
            </div>
            <div className="results-chart-panel">
                <ResultsChart chart={chart} ariaLabel={ariaLabel} />
            </div>
        </>
    );
}

function ResultsChart({ chart, ariaLabel }) {
    const chartId = useId();
    const rows = useMemo(() => toChartRows(chart), [chart]);
    const series = Array.isArray(chart?.series) ? chart.series : [];
    const labels = Array.isArray(chart?.labels) ? chart.labels : [];
    const forceScoreProgressionDomain = String(ariaLabel || '').toLowerCase().includes('round score progression');
    const yMin = forceScoreProgressionDomain
        ? 50
        : Number.isFinite(Number(chart?.meta?.y_min))
            ? Number(chart.meta.y_min)
            : 'auto';
    const yMax = forceScoreProgressionDomain
        ? 100
        : Number.isFinite(Number(chart?.meta?.y_max))
            ? Number(chart.meta.y_max)
            : 'auto';
    const yDomain = [yMin, yMax];

    if (chart?.type === 'heatmap') {
        return (
            <div className="results-chart-frame" aria-label={ariaLabel}>
                <ResultsHeatmap chart={chart} />
            </div>
        );
    }

    if (chart?.type === 'pyramid') {
        return (
            <div className="results-chart-frame" aria-label={ariaLabel}>
                <ResultsPyramidChart chart={chart} ariaLabel={ariaLabel} />
            </div>
        );
    }

    if (chart?.type === 'pie') {
        return (
            <div className="results-chart-frame" aria-label={ariaLabel}>
                <ResultsPieChart chart={chart} ariaLabel={ariaLabel} />
            </div>
        );
    }

    if (rows.length === 0 || series.length === 0 || labels.length === 0) {
        return <div className="results-chart-empty">No chart data yet.</div>;
    }

    const isRankChart = series.some((item) => String(item.key || '').toLowerCase().includes('rank'));

    if (chart?.type === 'radar') {
        const maxValue = Number(chart?.meta?.max_value || 100);
        return (
            <div className="results-chart-frame" aria-label={ariaLabel}>
                <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={rows} outerRadius="68%">
                        <PolarGrid stroke="rgba(255,255,255,0.1)" />
                        <PolarAngleAxis dataKey="label" tick={{ fill: 'rgba(248,250,252,0.72)', fontSize: 11 }} />
                        <PolarRadiusAxis
                            angle={90}
                            domain={[0, maxValue]}
                            tick={{ fill: 'rgba(248,250,252,0.34)', fontSize: 10 }}
                            axisLine={false}
                        />
                        <Tooltip content={<ResultsTooltip />} />
                        {series.map((item, index) => (
                            <Radar
                                key={item.key}
                                name={item.label}
                                dataKey={item.key}
                                stroke={chartColor(item.palette_key)}
                                fill={chartColor(item.palette_key)}
                                fillOpacity={index === 0 ? 0.24 : 0.12}
                                strokeWidth={2.2}
                                animationDuration={320}
                            />
                        ))}
                    </RadarChart>
                </ResponsiveContainer>
            </div>
        );
    }

    if (chart?.type === 'area') {
        const item = series[0];
        const gradientId = `results-area-${chartId.replace(/[:]/g, '')}-${item?.key || 'series'}`;
        const areaType = chart?.meta?.area_type || 'monotone';
        const strokeWidth = Number(chart?.meta?.stroke_width || 2.6);
        return (
            <div className="results-chart-frame" aria-label={ariaLabel}>
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={rows} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                        <defs>
                            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={chartColor(item?.palette_key)} stopOpacity={0.62} />
                                <stop offset="95%" stopColor={chartColor(item?.palette_key)} stopOpacity={0.04} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                        <XAxis dataKey="label" stroke="rgba(248,250,252,0.58)" tickLine={false} axisLine={false} fontSize={11} />
                        <YAxis stroke="rgba(248,250,252,0.4)" tickLine={false} axisLine={false} fontSize={11} domain={yDomain} allowDataOverflow />
                        <Tooltip content={<ResultsTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.12)' }} />
                        <Area
                            type={areaType}
                            dataKey={item?.key}
                            name={item?.label}
                            stroke={chartColor(item?.palette_key)}
                            fill={`url(#${gradientId})`}
                            strokeWidth={strokeWidth}
                            animationDuration={320}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        );
    }

    if (chart?.type === 'bar') {
        return (
            <div className="results-chart-frame" aria-label={ariaLabel}>
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={rows} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                        <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                        <XAxis dataKey="label" stroke="rgba(248,250,252,0.58)" tickLine={false} axisLine={false} fontSize={11} />
                        <YAxis stroke="rgba(248,250,252,0.4)" tickLine={false} axisLine={false} fontSize={11} domain={yDomain} allowDataOverflow />
                        <Tooltip content={<ResultsTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                        {series.map((item) => (
                            <Bar
                                key={item.key}
                                dataKey={item.key}
                                name={item.label}
                                fill={chartColor(item.palette_key)}
                                radius={[8, 8, 2, 2]}
                                animationDuration={320}
                            />
                        ))}
                    </BarChart>
                </ResponsiveContainer>
            </div>
        );
    }

    if (chart?.type === 'line' && series.length === 1) {
        const item = series[0];
        const gradientId = `results-gradient-${chartId.replace(/[:]/g, '')}-${item.key}`;
        return (
            <div className="results-chart-frame" aria-label={ariaLabel}>
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={rows} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                        <defs>
                            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={chartColor(item.palette_key)} stopOpacity={0.55} />
                                <stop offset="95%" stopColor={chartColor(item.palette_key)} stopOpacity={0.02} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                        <XAxis dataKey="label" stroke="rgba(248,250,252,0.58)" tickLine={false} axisLine={false} fontSize={11} />
                        <YAxis stroke="rgba(248,250,252,0.4)" tickLine={false} axisLine={false} fontSize={11} reversed={isRankChart} domain={isRankChart ? undefined : yDomain} allowDataOverflow={!isRankChart} />
                        <Tooltip content={<ResultsTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.12)' }} />
                        <Area
                            type="monotone"
                            dataKey={item.key}
                            name={item.label}
                            stroke={chartColor(item.palette_key)}
                            fill={`url(#${gradientId})`}
                            strokeWidth={2.4}
                            animationDuration={300}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        );
    }

    return (
        <div className="results-chart-frame" aria-label={ariaLabel}>
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={rows} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                    <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                    <XAxis dataKey="label" stroke="rgba(248,250,252,0.58)" tickLine={false} axisLine={false} fontSize={11} />
                    <YAxis stroke="rgba(248,250,252,0.4)" tickLine={false} axisLine={false} fontSize={11} reversed={isRankChart} domain={isRankChart ? undefined : yDomain} allowDataOverflow={!isRankChart} />
                    <Tooltip content={<ResultsTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.12)' }} />
                    {series.map((item) => (
                        <Line
                            key={item.key}
                            type="monotone"
                            dataKey={item.key}
                            name={item.label}
                            stroke={chartColor(item.palette_key)}
                            dot={false}
                            strokeWidth={2.2}
                            animationDuration={300}
                        />
                    ))}
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}

function MetricCard({ card }) {
    const tone = String(card?.tone || 'info').toLowerCase();
    const active = Boolean(card?.active);
    return (
        <article className={`results-metric-card tone-${tone}`}>
            <div className="results-metric-label">{card?.label}</div>
            <div className="results-metric-value"><AnimatedMetricValue value={card?.value ?? '--'} active={active} /></div>
            {card?.subtext ? <div className="results-metric-subtext">{card.subtext}</div> : null}
        </article>
    );
}

function LockedRoundCard({ round, onActivate }) {
    return (
        <article className="results-round-card is-locked" onClick={onActivate}>
            <div className="results-round-card-head">
                <span className="results-round-chip">Locked</span>
                <span className="results-round-lock">
                    <Lock size={14} />
                    Sealed
                </span>
            </div>
            <div className="results-round-number-lock">{String(round.round_no).padStart(2, '0')}</div>
            <h3 className="results-round-name">{round.name}</h3>
            <p className="results-round-copy">This reveal opens only after the official round snapshot is published.</p>
        </article>
    );
}

function DistributionBuckets({ chart, active, total }) {
    const labels = Array.isArray(chart?.labels) ? chart.labels : [];
    const values = Array.isArray(chart?.series?.[0]?.data) ? chart.series[0].data : [];
    const maxValue = Math.max(...values.map((item) => Number(item || 0)), 1);

    if (labels.length === 0 || values.length === 0) {
        return <div className="results-chart-empty">No distribution data yet.</div>;
    }

    return (
        <div className="results-distribution-list">
            {labels.map((label, index) => {
                const count = Number(values[index] || 0);
                const width = `${(count / maxValue) * 100}%`;
                const share = total > 0 ? `${((count / total) * 100).toFixed(1)}% of field` : '0% of field';
                return (
                    <div key={label} className="results-distribution-row">
                        <span className="results-distribution-label">{label}</span>
                        <div className="results-distribution-track">
                            <div
                                className={`results-distribution-fill ${active ? 'is-animating' : ''}`}
                                style={{ width }}
                            />
                        </div>
                        <strong className="results-distribution-value">{count}</strong>
                        <span className="results-distribution-meta">{share}</span>
                    </div>
                );
            })}
        </div>
    );
}

function TopPerformersTable({ rows, active }) {
    if (!Array.isArray(rows) || rows.length === 0) {
        return <div className="results-chart-empty">No ranking data yet.</div>;
    }

    return (
        <div className="results-leaders-table">
            <div className="results-leaders-head">
                <span>Rank</span>
                <span>Name / Roll</span>
                <span>Score</span>
            </div>
            {rows.map((row) => (
                <div key={`${row.entity_id}-${row.rank}`} className="results-leaders-row">
                    <span className="results-leaders-rank">#{row.rank}</span>
                    <span className="results-leaders-identity">
                        <span className="results-leaders-name">
                            {row.name}
                            {row?.wildcard_score_considered ? <span className="results-wildcard-tag is-inline">Wildcard</span> : null}
                        </span>
                        {row.regno_or_code ? <span className="results-leaders-roll">{ row.regno_or_code }</span> : null}
                    </span>
                    <strong className="results-leaders-score">
                        <AnimatedMetricValue value={row.score} active={active} />
                    </strong>
                </div>
            ))}
        </div>
    );
}

function TopRanksStrip({ rows, active }) {
    if (!Array.isArray(rows) || rows.length === 0) return null;
    return (
        <div className="results-top-ranks-grid">
            {rows.map((row) => (
                <article key={`${row.entity_id}-${row.rank}`} className="results-top-rank-card">
                    <div className="results-top-rank-meta">
                        <span className="results-top-rank-badge">#{row.rank}</span>
                        <Medal size={13} />
                    </div>
                    <strong className="results-top-rank-name">
                        {row.name}
                        {row?.wildcard_score_considered ? <span className="results-wildcard-tag is-inline">Wildcard</span> : null}
                    </strong>
                    <span className="results-top-rank-score">
                        <AnimatedMetricValue value={row.score} active={active} />
                    </span>
                </article>
            ))}
        </div>
    );
}

function PublishedRoundCard({ round, isActive, onActivate }) {
    const snapshot = round?.snapshot || {};
    const graphChoices = [
        snapshot?.charts?.distribution ? ['distribution', GRAPH_LABELS.distribution] : null,
        Array.isArray(snapshot?.top_performers) && snapshot.top_performers.length > 0 ? ['leaders', GRAPH_LABELS.leaders] : null,
    ].filter(Boolean);
    const fallbackMode = graphChoices?.[0]?.[0] || 'distribution';
    const initialMode = snapshot?.default_graph === 'criteria' ? fallbackMode : (snapshot?.default_graph || fallbackMode);
    const [graphMode, setGraphMode] = useState(initialMode);
    const participation = snapshot?.participation || {};
    const scoreAnalytics = snapshot?.score_analytics || {};
    const topRanked = Array.isArray(snapshot?.top_ranked) ? snapshot.top_ranked.slice(0, 3) : [];
    const topPerformers = Array.isArray(snapshot?.top_performers) ? snapshot.top_performers.slice(0, 10) : [];
    const charts = snapshot?.charts || {};
    const activeChart = charts?.[graphMode] || charts?.[graphChoices?.[0]?.[0]] || null;
    const focusNonce = `${round.id}-${isActive ? 'active' : 'idle'}`;
    const wildcardActive = [...topRanked, ...topPerformers].some((row) => Boolean(row?.wildcard_score_considered));

    useEffect(() => {
        if (!graphChoices.some(([key]) => key === graphMode)) {
            const nextDefault = snapshot?.default_graph === 'criteria'
                ? (graphChoices?.[0]?.[0] || 'distribution')
                : (snapshot?.default_graph || graphChoices?.[0]?.[0] || 'distribution');
            setGraphMode(nextDefault);
        }
    }, [graphChoices, graphMode, snapshot?.default_graph]);

    const participationCards = [
        { key: 'total', label: 'Total', value: participation?.total ?? '--', tone: 'info', active: isActive },
        { key: 'present', label: 'Present', value: participation?.present ?? '--', tone: 'success', active: isActive },
        { key: 'absent', label: 'Absent', value: participation?.absent ?? '--', tone: 'muted', active: isActive },
        { key: 'eliminated', label: 'Eliminated', value: participation?.eliminated ?? '--', tone: 'warning', active: isActive },
        { key: 'advanced', label: 'Advanced', value: participation?.advanced ?? '--', tone: 'success', active: isActive },
        { key: 'elimination_rate', label: 'Elim Rate', value: `${Number(participation?.elimination_rate || 0).toFixed(1)}%`, tone: 'warning', active: isActive },
    ];
    const analyticsCards = [
        { key: 'average', label: 'Average', value: scoreAnalytics?.average ?? '--', tone: 'warning', active: isActive },
        { key: 'maximum', label: 'Maximum', value: scoreAnalytics?.maximum ?? '--', tone: 'highlight', active: isActive },
        { key: 'minimum', label: 'Minimum', value: scoreAnalytics?.minimum ?? '--', tone: 'info', active: isActive },
    ];

    return (
        <article className={`results-round-card is-published ${isActive ? 'is-current' : ''}`} onClick={onActivate}>
            <div className="results-round-card-head">
                <div className="results-round-heading">
                    <div className="results-round-number">{String(round.round_no).padStart(2, '0')}</div>
                    <div>
                        <div className="results-round-chip-row">
                            <span className="results-round-chip">Round Reveal</span>
                            {wildcardActive ? <span className="results-wildcard-tag">Wildcard</span> : null}
                        </div>
                        <h3 className="results-round-name">{snapshot?.round_name || round.name}</h3>
                    </div>
                </div>
                <span className="results-round-live">{isActive ? 'In Focus' : 'Published'}</span>
            </div>
            <div className="results-round-layout">
                <div className="results-round-main">
                    <section className="results-round-block">
                        <div className="results-round-block-head">
                            <span>Participation</span>
                            <div className="results-round-block-line" />
                        </div>
                        <div className="results-round-metrics participation-grid">
                            {participationCards.map((card) => <MetricCard key={`${card.key}-${focusNonce}`} card={card} />)}
                        </div>
                    </section>
                    <section className="results-round-block">
                        <div className="results-round-block-head">
                            <span>Score Analytics</span>
                            <div className="results-round-block-line" />
                        </div>
                        <div className="results-round-metrics analytics-grid">
                            {analyticsCards.map((card) => <MetricCard key={`${card.key}-${focusNonce}`} card={card} />)}
                        </div>
                    </section>
                    {topRanked.length > 0 ? (
                        <section className="results-round-block">
                            <div className="results-round-block-head">
                                <span>Top Ranks</span>
                                <div className="results-round-block-line" />
                            </div>
                            <TopRanksStrip rows={topRanked} active={isActive} />
                        </section>
                    ) : null}
                    <section className="results-round-block">
                        <div className="results-round-block-head">
                            <span>Scoring Criteria</span>
                            <div className="results-round-block-line" />
                        </div>
                        <div className="results-tag-row">
                            {(snapshot?.criteria_tags || []).map((tag) => <span key={tag} className="results-tag">{tag}</span>)}
                        </div>
                    </section>
                </div>
                <div className="results-round-visuals">
                    <section className="results-round-block">
                        <div className="results-round-block-head">
                            <span>{graphMode === 'leaders' ? 'Top Performers' : 'Score Distribution'}</span>
                            <div className="results-round-block-line" />
                        </div>
                        <div className="results-round-switcher" role="tablist" aria-label={`Round ${round.round_no} graphs`} onClick={(event) => event.stopPropagation()}>
                            {graphChoices.map(([key, label]) => (
                                <button
                                    key={key}
                                    type="button"
                                    className={`results-switch-pill ${graphMode === key ? 'is-active' : ''}`}
                                    onClick={() => setGraphMode(key)}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                        <div className="results-chart-shell" aria-label={`${GRAPH_LABELS[graphMode]} chart`}>
                            {graphMode === 'leaders'
                                ? <TopPerformersTable rows={topPerformers} active={isActive} />
                                : graphMode === 'distribution'
                                ? <DistributionBuckets chart={activeChart} active={isActive} total={Number(participation?.present || 0)} />
                                : <ResultsChart chart={activeChart} ariaLabel={`${GRAPH_LABELS[graphMode]} chart`} />}
                        </div>
                    </section>
                </div>
            </div>
        </article>
    );
}

function RoundNavigator({ rounds }) {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth < 760 : false));
    const [touchStartX, setTouchStartX] = useState(null);

    useEffect(() => {
        if (rounds.length === 0) {
            setSelectedIndex(0);
            return;
        }
        let targetIndex = 0;
        for (let index = 0; index < rounds.length; index += 1) {
            if (rounds[index]?.results_published) targetIndex = index;
        }
        setSelectedIndex(targetIndex);
    }, [rounds]);

    useEffect(() => {
        if (typeof window === 'undefined') return undefined;
        const onResize = () => setIsMobile(window.innerWidth < 760);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    const currentRound = rounds[selectedIndex] || null;
    const goPrev = () => setSelectedIndex((value) => Math.max(0, value - 1));
    const goNext = () => setSelectedIndex((value) => Math.min(rounds.length - 1, value + 1));
    return (
        <div className="results-carousel-shell">
            <div
                className={`results-carousel-stage ${isMobile ? 'is-mobile' : ''}`}
                onTouchStart={(event) => {
                    if (!isMobile) return;
                    setTouchStartX(event.touches?.[0]?.clientX ?? null);
                }}
                onTouchEnd={(event) => {
                    if (!isMobile || touchStartX == null) return;
                    const touchEndX = event.changedTouches?.[0]?.clientX ?? null;
                    if (touchEndX == null) return;
                    const delta = touchEndX - touchStartX;
                    if (Math.abs(delta) < 40) return;
                    if (delta > 0) goPrev();
                    else goNext();
                    setTouchStartX(null);
                }}
            >
                {isMobile ? <div className="results-carousel-hint">Swipe round by round</div> : null}
                {/** centered card */}
                <div className="results-rounds-viewport is-static">
                    <div className="results-rounds-track is-static">
                        {currentRound ? (
                            <div className="results-round-slide is-current is-static">
                                {currentRound?.is_locked
                                    ? <LockedRoundCard round={currentRound} onActivate={() => {}} />
                                    : <PublishedRoundCard round={currentRound} isActive onActivate={() => {}} />}
                            </div>
                        ) : null}
                    </div>
                </div>
            </div>
            <div className="results-carousel-footer">
                <button type="button" className="results-carousel-button is-footer" onClick={goPrev} disabled={selectedIndex <= 0} aria-label="Previous round">
                    <ChevronLeft size={16} />
                </button>
                <div className="results-carousel-dots" aria-label="Round positions">
                    {rounds.map((round, index) => (
                        <button
                            key={round.id}
                            type="button"
                            className={`results-carousel-dot ${index === selectedIndex ? 'is-active' : ''}`}
                            aria-label={`Go to round ${round.round_no}`}
                            onClick={() => setSelectedIndex(index)}
                        />
                    ))}
                </div>
                <button type="button" className="results-carousel-button is-footer" onClick={goNext} disabled={selectedIndex >= rounds.length - 1} aria-label="Next round">
                    <ChevronRight size={16} />
                </button>
            </div>
        </div>
    );
}

function LoaderDeck() {
    return (
        <div className="results-loader-deck">
            <div className="results-loader-card" />
            <div className="results-loader-card" />
            <div className="results-loader-card" />
        </div>
    );
}

function HighlightCard({ item }) {
    const participant = item?.participant || null;
    const imageUrl = participant?.resolved_photo_url || participant?.default_image_url || '';
    const participantName = String(participant?.display_name || '').trim();
    const participantRoll = String(participant?.rollno_or_code || '').trim();
    const paletteKey = String(item?.content?.palette_key || 'blue').trim().toLowerCase();
    return (
        <article className={`results-highlight-card palette-${paletteKey}`}>
            <div className="results-highlight-topline">
                <span className="results-highlight-emoji">{item?.emoji || '✦'}</span>
                {item?.tag ? <span className="results-highlight-label">{item.tag}</span> : null}
            </div>
            <h3 className="results-highlight-title">{item?.title}</h3>
            {item?.quantity ? <div className="results-highlight-stat">{item.quantity}</div> : null}
            {item?.description ? <p>{item.description}</p> : null}
            {participant ? (
                <div className="results-highlight-participant">
                    <div className="results-highlight-avatar">
                        {imageUrl ? <img src={imageUrl} alt={participantName || 'Participant'} /> : <span>{String(participantName || '?').slice(0, 1)}</span>}
                    </div>
                    <div className="results-highlight-participant-copy">
                        <strong>{participantName || 'Participant'}</strong>
                        <span>{participantRoll || '-'}</span>
                    </div>
                </div>
            ) : null}
        </article>
    );
}

function TitleWinnersSection({ nominees, winners, revealed }) {
    const [videoUrl, setVideoUrl] = useState('');
    const [activeWinner, setActiveWinner] = useState(null);
    const [activeWinnerVideo, setActiveWinnerVideo] = useState(false);
    const [activeNominee, setActiveNominee] = useState(null);
    const [activeNomineeVideo, setActiveNomineeVideo] = useState(false);
    const [revealedWinnerKeys, setRevealedWinnerKeys] = useState(() => new Set());
    const [recentlyRevealedWinnerKey, setRecentlyRevealedWinnerKey] = useState('');

    const orderedWinners = useMemo(() => (
        Array.isArray(winners)
            ? winners
            : []
    ), [winners]);

    const winnerRevealKey = useMemo(
        () => orderedWinners.map((row) => `${row?.id || row?.entity_id || ''}:${row?.precedence_rank || ''}`).join('|'),
        [orderedWinners]
    );

    useEffect(() => {
        setRevealedWinnerKeys(new Set());
        setRecentlyRevealedWinnerKey('');
    }, [revealed, winnerRevealKey]);

    const winnerCardKey = (winner) => String(winner?.id || `${winner?.entity_type || 'winner'}:${winner?.entity_id || ''}:${winner?.precedence_rank || ''}`);

    const toggleWinnerReveal = (winner) => {
        const key = winnerCardKey(winner);
        setRevealedWinnerKeys((current) => {
            const next = new Set(current);
            if (next.has(key)) {
                next.delete(key);
                setRecentlyRevealedWinnerKey('');
            } else {
                next.add(key);
                setRecentlyRevealedWinnerKey(key);
            }
            return next;
        });
    };

    const publishedRoundHistory = (item) => (
        Array.isArray(item?.performance?.round_history)
            ? item.performance.round_history.filter((round) => round?.round_no)
            : []
    );

    const latestPublishedRound = (item) => {
        const rows = publishedRoundHistory(item);
        return rows.length > 0 ? rows[rows.length - 1] : null;
    };

    const winnerToneClass = (precedenceRank) => {
        if (precedenceRank === 1) return 'tone-rank-1';
        if (precedenceRank === 2) return 'tone-rank-2';
        if (precedenceRank === 3) return 'tone-rank-3';
        if (precedenceRank === 4) return 'tone-rank-4';
        if (precedenceRank === 5) return 'tone-rank-5';
        return 'tone-rank-default';
    };

    const winnerCertificateTheme = (winner) => {
        const themeKey = String(winner?.theme_key || '').trim().toLowerCase();
        if (themeKey === 'wildcard') {
            return { className: 'certificate-theme-wildcard', label: 'Wildcard' };
        }
        if (themeKey === 'orator') {
            return { className: 'certificate-theme-orator', label: 'Featured Title' };
        }
        if (themeKey === 'performer') {
            return { className: 'certificate-theme-performer', label: 'Featured Title' };
        }
        if (themeKey === 'creative') {
            return { className: 'certificate-theme-creative', label: 'Featured Title' };
        }
        if (themeKey === 'classic') {
            return { className: 'certificate-theme-classic', label: 'Official Title' };
        }
        if (themeKey === 'grand') {
            return { className: 'certificate-theme-grand', label: 'Official Title' };
        }
        if (winner?.is_wildcard) {
            return { className: 'certificate-theme-wildcard', label: 'Wildcard' };
        }
        if ((winner?.precedence_rank || 0) === 1) {
            return { className: 'certificate-theme-grand', label: 'Official Title' };
        }
        return { className: 'certificate-theme-classic', label: 'Official Title' };
    };

    const WinnerRankChart = ({ roundHistory }) => {
        const chartRows = Array.isArray(roundHistory)
            ? roundHistory.filter((item) => item?.round_no).map((item) => ({
                label: `R${item.round_no}`,
                rank: Number(item.cumulative_rank || item.round_rank || 0),
            }))
            : [];
        const hasRanks = chartRows.some((item) => Number.isFinite(item.rank) && item.rank > 0);
        if (!hasRanks) {
            return <div className="results-chart-empty">No roundwise ranking data yet.</div>;
        }
        const maxRank = Math.max(...chartRows.map((item) => Number(item.rank || 0)), 1);
        return (
            <div className="results-winner-rank-chart">
                <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={chartRows} outerRadius="72%">
                        <PolarGrid stroke="rgba(255,255,255,0.12)" />
                        <PolarAngleAxis dataKey="label" tick={{ fill: 'rgba(248,250,252,0.72)', fontSize: 11 }} />
                        <PolarRadiusAxis
                            angle={90}
                            domain={[1, maxRank]}
                            reversed
                            tick={{ fill: 'rgba(248,250,252,0.34)', fontSize: 10 }}
                            axisLine={false}
                        />
                        <Tooltip content={<ResultsTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.12)' }} />
                        <Radar
                            name="Rank"
                            dataKey="rank"
                            stroke="#facc15"
                            fill="#facc15"
                            fillOpacity={0.18}
                            strokeWidth={2.3}
                            animationDuration={320}
                        />
                    </RadarChart>
                </ResponsiveContainer>
            </div>
        );
    };

    const WinnerDetailModal = ({ winner, onClose }) => {
        if (!winner) return null;
        const performance = winner?.performance || {};
        const roundHistory = Array.isArray(performance?.round_history) ? performance.round_history : [];
        const certificateTheme = winnerCertificateTheme(winner);
        const winnerDescription = String(winner?.content?.description || '').trim();
        return (
            <div className="results-winner-modal" onClick={onClose}>
                <div className={`results-winner-modal-card ${winnerToneClass(winner?.precedence_rank)} ${certificateTheme.className}`} onClick={(event) => event.stopPropagation()}>
                    <button type="button" className="results-winner-modal-close" onClick={onClose} aria-label="Close winner details">
                        <X size={16} />
                    </button>
                    <div className="results-winner-modal-grid">
                        <div className="results-winner-media-panel">
                            <div className="results-winner-certificate-topline">
                                <span>{certificateTheme.label}</span>
                                <span>Rank #{winner?.precedence_rank || '-'}</span>
                            </div>
                            <div className="results-winner-modal-title">{winner?.title_name}</div>
                            <div className="results-winner-media-frame">
                                {activeWinnerVideo && winner?.resolved_video_url ? (
                                    <video
                                        src={winner.resolved_video_url}
                                        poster={winner.resolved_photo_url || winner.default_image_url || undefined}
                                        controls
                                        autoPlay
                                        playsInline
                                        className="results-winner-media-video"
                                    />
                                ) : winner?.resolved_photo_url ? (
                                    <img src={winner.resolved_photo_url} alt={winner.display_name} className="results-winner-media-image" />
                                ) : (
                                    <div className="results-winner-media-fallback"><Trophy size={34} /></div>
                                )}
                            </div>
                            {winner?.resolved_video_url ? (
                                <button type="button" className="results-winner-media-play" onClick={() => setActiveWinnerVideo((value) => !value)}>
                                    <Play size={13} />
                                    {activeWinnerVideo ? 'Show Photo' : 'Play Video'}
                                </button>
                            ) : null}
                            <div className="results-winner-media-caption">
                                <strong>
                                    {winner?.display_name}
                                    {winner?.is_wildcard ? <span className="results-wildcard-tag is-inline">Wildcard</span> : null}
                                </strong>
                                <span>{winner?.rollno_or_code || '-'}</span>
                                {winnerDescription ? <p>{winnerDescription}</p> : null}
                            </div>
                        </div>
                        <div className="results-winner-insights-panel">
                            <div className="results-winner-insights-head">
                                <p className="results-section-kicker">Winner Performance</p>
                                <h3>{winner?.title_name}</h3>
                            </div>
                            <div className="results-winner-metric-row">
                                <article className="results-winner-metric-card">
                                    <span>Total Score</span>
                                    <strong>{performance?.total_score ?? '--'}</strong>
                                </article>
                                <article className="results-winner-metric-card">
                                    <span>Overall Rank</span>
                                    <strong>{performance?.overall_rank ? `#${performance.overall_rank}` : '--'}</strong>
                                </article>
                                <article className="results-winner-metric-card">
                                    <span>Rounds</span>
                                    <strong>{roundHistory.length || '--'}</strong>
                                </article>
                            </div>
                            <div className="results-winner-chart-shell">
                                <div className="results-winner-chart-head">
                                    <span>Cumulative Rank</span>
                                    <span>{roundHistory.length} rounds</span>
                                </div>
                                <WinnerRankChart roundHistory={roundHistory} />
                            </div>
                            <div className="results-winner-points-list">
                                {roundHistory.length > 0 ? roundHistory.map((item) => (
                                    <div key={`${winner?.id}-${item.round_id}`} className="results-winner-point-row">
                                        <span>{item.round_name || `Round ${item.round_no}`}</span>
                                <strong>{item.cumulative_rank ? `#${item.cumulative_rank}` : '--'}</strong>
                                <span>{Number(item.cumulative_score || 0).toFixed(2).replace(/\.00$/, '')} pts</span>
                                    </div>
                                )) : (
                                    <div className="results-chart-empty">No performance points yet.</div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    const NomineeDetailModal = ({ nominee, onClose }) => {
        if (!nominee) return null;
        const performance = nominee?.performance || {};
        const roundHistory = publishedRoundHistory(nominee);
        const latestRound = latestPublishedRound(nominee);
        const description = String(nominee?.content?.description || '').trim();
        return (
            <div className="results-winner-modal" onClick={onClose}>
                <div className={`results-winner-modal-card tone-rank-default ${nominee?.is_wildcard ? 'certificate-theme-wildcard' : 'certificate-theme-classic'}`} onClick={(event) => event.stopPropagation()}>
                    <button type="button" className="results-winner-modal-close" onClick={onClose} aria-label="Close nominee details">
                        <X size={16} />
                    </button>
                    <div className="results-winner-modal-grid">
                        <div className="results-winner-media-panel">
                            <div className="results-winner-certificate-topline">
                                <span>{nominee?.is_wildcard ? 'Wildcard Nominee' : 'Nominee'}</span>
                                <span>{latestRound?.round_no ? `Latest R${latestRound.round_no}` : 'Published rounds'}</span>
                            </div>
                            <div className="results-winner-modal-title">{nominee?.display_name}</div>
                            <div className="results-winner-media-frame">
                                {activeNomineeVideo && nominee?.resolved_video_url ? (
                                    <video
                                        src={nominee.resolved_video_url}
                                        poster={nominee.resolved_photo_url || nominee.default_image_url || undefined}
                                        controls
                                        autoPlay
                                        playsInline
                                        className="results-winner-media-video"
                                    />
                                ) : nominee?.resolved_photo_url ? (
                                    <img src={nominee.resolved_photo_url} alt={nominee.display_name} className="results-winner-media-image" />
                                ) : (
                                    <div className="results-winner-media-fallback"><Trophy size={34} /></div>
                                )}
                            </div>
                            {nominee?.resolved_video_url ? (
                                <button type="button" className="results-winner-media-play" onClick={() => setActiveNomineeVideo((value) => !value)}>
                                    <Play size={13} />
                                    {activeNomineeVideo ? 'Show Photo' : 'Play Video'}
                                </button>
                            ) : null}
                            <div className="results-winner-media-caption">
                                <strong>
                                    {nominee?.display_name}
                                    {nominee?.is_wildcard ? <span className="results-wildcard-tag is-inline">Wildcard</span> : null}
                                </strong>
                                <span>{nominee?.rollno_or_code || '-'}</span>
                                {description ? <p>{description}</p> : null}
                            </div>
                        </div>
                        <div className="results-winner-insights-panel">
                            <div className="results-winner-insights-head">
                                <p className="results-section-kicker">Nominee Performance</p>
                                <h3>Published Rounds</h3>
                            </div>
                            <div className="results-winner-metric-row">
                                <article className="results-winner-metric-card">
                                    <span>Cumulative Score</span>
                                    <strong>{latestRound ? Number(latestRound.cumulative_score || 0).toFixed(2).replace(/\.00$/, '') : '--'}</strong>
                                </article>
                                <article className="results-winner-metric-card">
                                    <span>Cumulative Rank</span>
                                    <strong>{latestRound?.cumulative_rank ? `#${latestRound.cumulative_rank}` : '--'}</strong>
                                </article>
                                <article className="results-winner-metric-card">
                                    <span>Rounds</span>
                                    <strong>{roundHistory.length || '--'}</strong>
                                </article>
                            </div>
                            <div className="results-winner-chart-shell">
                                <div className="results-winner-chart-head">
                                    <span>Cumulative Rank</span>
                                    <span>{roundHistory.length} rounds</span>
                                </div>
                                <WinnerRankChart roundHistory={roundHistory} />
                            </div>
                            <div className="results-winner-points-list">
                                {roundHistory.length > 0 ? roundHistory.map((item) => (
                                    <div key={`${nominee?.id}-${item.round_id}`} className="results-winner-point-row">
                                        <span>{item.round_name || `Round ${item.round_no}`}</span>
                                        <strong>{item.cumulative_rank ? `#${item.cumulative_rank}` : '--'}</strong>
                                        <span>{Number(item.cumulative_score || 0).toFixed(2).replace(/\.00$/, '')} pts</span>
                                    </div>
                                )) : (
                                    <div className="results-chart-empty">No published round points yet.</div>
                                )}
                            </div>
                            {performance?.total_score !== null && performance?.total_score !== undefined ? (
                                <div className="results-winner-media-caption">
                                    <span>Final total: {performance.total_score}</span>
                                </div>
                            ) : null}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <section className="results-board-section results-hologram-section">
            <div className="results-section-head">
                <div>
                    <p className="results-section-kicker">Title Spotlight</p>
                    <h2>Title Winners & Nominees</h2>
                </div>
            </div>
            <div className="results-holo-stack">
                <section className="results-holo-block results-holo-block-winners">
                    <div className="results-holo-block-head">
                        <div>
                            <p className="results-section-kicker">Official Reveal</p>
                            <h3>Winners</h3>
                        </div>
                    </div>
                    {!revealed ? (
                        <div className="results-pending-card is-wide">
                            <Lock size={18} />
                            <div>
                                <strong>Winner reveal is locked.</strong>
                                <p>Nominees are live. Winners appear after the admin reveal toggle is enabled.</p>
                            </div>
                        </div>
                    ) : orderedWinners.length === 0 ? (
                        <div className="results-pending-card is-wide">
                            <Clock3 size={18} />
                            <div>
                                <strong>No winners yet.</strong>
                                <p>This section will populate once title winners are configured in admin.</p>
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="results-winner-reveal-bar">
                                <span>{revealedWinnerKeys.size} / {orderedWinners.length} revealed</span>
                            </div>
                            <div className="results-holo-grid results-holo-grid-winners">
                            {orderedWinners.map((row) => {
                                const key = `winner-${row.id || row.entity_id}`;
                                const revealKey = winnerCardKey(row);
                                const isCardRevealed = revealedWinnerKeys.has(revealKey);
                                const isFreshReveal = isCardRevealed && revealKey === recentlyRevealedWinnerKey;
                                return (
                                    <article
                                        className={`results-holo-card results-holo-card-winner results-winner-flip-card ${winnerToneClass(row.precedence_rank)} ${row?.is_wildcard ? 'is-wildcard' : ''} ${isCardRevealed ? 'is-revealed' : 'is-locked'} ${isFreshReveal ? 'is-celebrating' : ''}`}
                                        key={key}
                                    >
                                        <div className="results-winner-flip-inner">
                                            <div className="results-winner-flip-face results-winner-flip-back">
                                                <div className="results-holo-rank-pill">#{row.precedence_rank || '-'}</div>
                                                <div className="results-holo-title">{row.title_name}</div>
                                                <div className="results-holo-photo results-holo-photo-winner">
                                                    {row.resolved_photo_url ? (
                                                        <img src={row.resolved_photo_url} alt={row.display_name} loading="lazy" />
                                                    ) : (
                                                        <div className="results-holo-photo-fallback"><Trophy size={26} /></div>
                                                    )}
                                                </div>
                                                <div className="results-holo-name results-holo-name-winner">
                                                    {row.display_name}
                                                    {row?.is_wildcard ? <span className="results-wildcard-tag is-inline">Wildcard</span> : null}
                                                </div>
                                                <div className="results-holo-roll results-holo-roll-winner">{row.rollno_or_code || '-'}</div>
                                                <div className="results-holo-winner-meta">
                                                    <span>{row?.performance?.total_score ?? '--'} pts</span>
                                                    <span>{row?.performance?.overall_rank ? `Overall #${row.performance.overall_rank}` : 'Winner'}</span>
                                                </div>
                                                <div className="results-winner-card-actions">
                                                    <button
                                                        type="button"
                                                        className="results-holo-play results-holo-play-winner"
                                                        onClick={() => {
                                                            setActiveWinner(row);
                                                            setActiveWinnerVideo(false);
                                                        }}
                                                    >
                                                        <Play size={13} /> Open
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="results-winner-toggle-button is-unreveal"
                                                        onClick={() => toggleWinnerReveal(row)}
                                                    >
                                                        Unreveal
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="results-winner-flip-face results-winner-flip-front">
                                                <div className="results-holo-rank-pill">#{row.precedence_rank || '-'}</div>
                                                <Lock size={24} />
                                                <strong>{row.title_name}</strong>
                                                <button
                                                    type="button"
                                                    className="results-winner-toggle-button"
                                                    onClick={() => toggleWinnerReveal(row)}
                                                >
                                                    <Sparkles size={13} /> Reveal
                                                </button>
                                            </div>
                                        </div>
                                        {isFreshReveal ? <div className="results-winner-confetti" aria-hidden="true" /> : null}
                                    </article>
                                );
                            })}
                            </div>
                        </>
                    )}
                </section>

                <section className="results-holo-block">
                    <div className="results-holo-block-head">
                        <div>
                            <p className="results-section-kicker">Final Lineup</p>
                            <h3>Nominees</h3>
                        </div>
                    </div>
                    {nominees.length === 0 ? (
                        <div className="results-pending-card is-wide">
                            <Clock3 size={18} />
                            <div>
                                <strong>No nominees yet.</strong>
                                <p>This section will populate once finalists are configured in admin.</p>
                            </div>
                        </div>
                    ) : (
                        <div className="results-holo-grid results-holo-grid-nominees">
                            {nominees.map((row) => {
                                const key = `nominee-${row.id || row.entity_id}`;
                                const roundHistory = publishedRoundHistory(row);
                                const latestRound = latestPublishedRound(row);
                                const description = String(row?.content?.description || '').trim();
                                return (
                                    <button
                                        type="button"
                                        className={`results-holo-card results-holo-card-nominee ${row?.is_wildcard ? 'is-wildcard' : ''}`}
                                        key={key}
                                        onClick={() => {
                                            setActiveNominee(row);
                                            setActiveNomineeVideo(false);
                                        }}
                                    >
                                        <div className="results-holo-photo">
                                            {row.resolved_photo_url ? (
                                                <img src={row.resolved_photo_url} alt={row.display_name} loading="lazy" />
                                            ) : (
                                                <div className="results-holo-photo-fallback"><Trophy size={22} /></div>
                                            )}
                                        </div>
                                        <div className="results-holo-name">
                                            {row.display_name}
                                            {row?.is_wildcard ? <span className="results-wildcard-tag is-inline">Wildcard</span> : null}
                                        </div>
                                        <div className="results-holo-roll">{row.rollno_or_code || '-'}</div>
                                        {description ? <p className="results-holo-nominee-description">{description}</p> : null}
                                        <div className="results-holo-nominee-meta">
                                            <span>{latestRound ? `${Number(latestRound.cumulative_score || 0).toFixed(2).replace(/\.00$/, '')} pts` : 'Awaiting rounds'}</span>
                                            <span>{roundHistory.length} rounds visible</span>
                                        </div>
                                        <div className="results-holo-play">
                                            <Play size={13} /> Open
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </section>
            </div>

            {videoUrl ? (
                <div className="results-video-modal" onClick={() => setVideoUrl('')}>
                    <div className="results-video-modal-inner" onClick={(event) => event.stopPropagation()}>
                        <video src={videoUrl} controls autoPlay playsInline />
                    </div>
                </div>
            ) : null}

            {activeWinner ? <WinnerDetailModal winner={activeWinner} onClose={() => setActiveWinner(null)} /> : null}
            {activeNominee ? <NomineeDetailModal nominee={activeNominee} onClose={() => setActiveNominee(null)} /> : null}
        </section>
    );
}

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
    const rounds = Array.isArray(data?.rounds) ? data.rounds : [];
    const nominees = Array.isArray(data?.nominees) ? data.nominees : [];
    const titleWinners = Array.isArray(data?.title_winners) ? data.title_winners : [];
    const resultHighlights = Array.isArray(data?.result_highlights) ? data.result_highlights : [];
    const winnersRevealed = Boolean(data?.results_winners_revealed);
    const publishedRoundsCount = rounds.filter((item) => Boolean(item?.results_published)).length;
    const hasLiveRounds = publishedRoundsCount > 0;
    const finalSnapshot = data?.final_event_snapshot || null;
    const finalStoryboardCharts = [
        {
            key: 'rank_movement',
            title: 'Rank Movement',
            hint: 'Story arcs',
            icon: TrendingUp,
            ariaLabel: 'Rank movement chart',
        },
        {
            key: 'score_progression',
            title: 'Round Score Progression',
            hint: 'Consistency vs comeback',
            icon: TrendingUp,
            ariaLabel: 'Round score progression chart',
        },
        {
            key: 'field_distribution',
            title: 'Field Distribution',
            hint: 'Department / batch',
            icon: Sparkles,
            ariaLabel: 'Field distribution chart',
        },
        {
            key: 'round_elimination_trend',
            title: 'Round-wise Elimination Trend',
            hint: 'Difficulty curve',
            icon: Sparkles,
            ariaLabel: 'Round-wise elimination trend chart',
        },
        {
            key: 'round_distribution_heatmap',
            title: 'Score Distribution by Round',
            hint: 'Competition density',
            icon: ScanLine,
            ariaLabel: 'Score distribution by round chart',
        },
        {
            key: 'round_average_scores',
            title: 'Round Average Score Curve',
            hint: 'Difficulty drift',
            icon: Trophy,
            ariaLabel: 'Round average score chart',
        },
    ];

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
                            <LoaderDeck />
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

    const statusLabel = published ? 'Final Published' : hasLiveRounds ? `${publishedRoundsCount} Rounds Live` : 'Preparing';
    const statusMuted = !published && !hasLiveRounds;

    return (
        <main className="results-hero-page">
            <div className="results-shell">
                <div className="results-topbar">
                    <Link to={`/persohub/events/${eventSlug}`} className="results-ghost-link">
                        <ArrowLeft size={15} />
                        <span>Event</span>
                    </Link>
                    <div className={`results-status-chip ${statusMuted ? 'is-muted' : ''}`}>
                        {statusLabel}
                    </div>
                </div>

                <section className="results-hero" aria-label="Event results hero">
                    <div className="results-trophy-wrap" aria-hidden="true">
                        <TrophyScene subdued={!published && !hasLiveRounds} modelUrl={modelUrl} placeholderOnly={!published && !hasLiveRounds} />
                    </div>

                    <div className="results-copy">
                        <div className="results-kicker">
                            <span className="results-kicker-line" />
                            <span>{published ? 'official results' : hasLiveRounds ? 'roundwise reveal' : 'holding page'}</span>
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
                                {published ? 'Final signal live' : hasLiveRounds ? 'Round cards live' : 'Awaiting publish'}
                            </span>
                            <span className="results-micro-chip">
                                <Waypoints />
                                {publishedRoundsCount} rounds visible
                            </span>
                        </div>
                    </div>
                </section>

                <TitleWinnersSection nominees={nominees} winners={titleWinners} revealed={winnersRevealed} />

                <section className="results-board-section">
                    <div className="results-section-head">
                <div>
                    <p className="results-section-kicker">Timeline</p>
                    <h2>Round Reveal</h2>
                </div>
            </div>
                    <div className="results-timeline-shell">
                        <div className="results-timeline-line" />
                        <div className="results-timeline-glow" />
                        <div className="results-timeline-guides">
                            <span><ScanLine size={14} /> Criteria lenses</span>
                            <span><Sparkles size={14} /> Swipe to reveal</span>
                        </div>
                        <div className="results-rounds-frame">
                            {rounds.length > 0 ? (
                                <RoundNavigator rounds={rounds} />
                            ) : (
                                <div className="results-pending-card">
                                    <Clock3 size={18} />
                                    <div>
                                        <strong>No rounds to show yet.</strong>
                                        <p>The reveal timeline will appear once event rounds are configured.</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </section>

                <section className="results-board-section">
                    <div className="results-section-head">
                <div>
                    <p className="results-section-kicker">Event Insights</p>
                    <h2>{finalSnapshot ? 'Final Storyboard' : 'Final Reveal Pending'}</h2>
                </div>
            </div>

                    {finalSnapshot ? (
                        <>
                            <div className="results-kpi-strip">
                                <MetricCard card={{ label: 'Participated', value: finalSnapshot?.summary?.total_entities ?? '--', tone: 'info' }} />
                                <MetricCard card={{ label: 'Active', value: finalSnapshot?.summary?.active_entities ?? '--', tone: 'success' }} />
                                <MetricCard card={{ label: 'Eliminated', value: finalSnapshot?.summary?.eliminated_entities ?? '--', tone: 'warning' }} />
                                <MetricCard card={{ label: 'Rounds', value: finalSnapshot?.summary?.rounds_published ?? '--', tone: 'highlight' }} />
                                <MetricCard card={{ label: 'Highest', value: finalSnapshot?.summary?.highest_score ?? '--', tone: 'highlight' }} />
                                <MetricCard card={{ label: 'Average', value: finalSnapshot?.summary?.average_score ?? '--', tone: 'info' }} />
                            </div>

                            <div className="results-chart-grid">
                                {finalStoryboardCharts.map((item) => {
                                    const Icon = item.icon;
                                    return (
                                        <article key={item.key} className="results-analytics-card">
                                            <div className="results-analytics-head">
                                                <h3>{item.title}</h3>
                                                <span><Icon size={14} /> {item.hint}</span>
                                            </div>
                                            {item.key === 'field_distribution' ? (
                                                <ResultsDistributionSwitcher charts={{
                                                    department: finalSnapshot?.charts?.department_distribution,
                                                    batch: finalSnapshot?.charts?.batch_distribution,
                                                }} />
                                            ) : (
                                                <div className="results-chart-panel">
                                                    <ResultsChart chart={finalSnapshot?.charts?.[item.key]} ariaLabel={item.ariaLabel} />
                                                </div>
                                            )}
                                        </article>
                                    );
                                })}
                            </div>

                            {resultHighlights.length > 0 ? (
                                <div className="results-insight-highlights">
                                    <div className="results-analytics-head">
                                        <h3>Curated Highlights</h3>
                                        <span><Sparkles size={14} /> Admin spotlight</span>
                                    </div>
                                    <div className="results-highlight-strip">
                                        {resultHighlights.map((item) => <HighlightCard key={item.id} item={item} />)}
                                    </div>
                                </div>
                            ) : null}
                        </>
                    ) : (
                        <div className="results-pending-card is-wide">
                            <Clock3 size={18} />
                            <div>
                                <strong>Final event insights are still locked.</strong>
                            </div>
                        </div>
                    )}
                </section>
            </div>
        </main>
    );
}
