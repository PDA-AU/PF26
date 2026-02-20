import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import {
    Trophy,
    Medal,
    Search,
    Download,
    RefreshCw,
    ChevronLeft,
    ChevronRight,
    ChevronDown,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useAuth } from '@/context/AuthContext';

import EventAdminShell, { useEventAdminShell } from './EventAdminShell';
import EntityDetailsModal from './EntityDetailsModal';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const DEFAULT_PAGE_SIZE = 10;
const MIN_PAGE_SIZE = 1;
const MAX_PAGE_SIZE = 500;
const OFFICIAL_LEFT_LOGO_URL = 'https://pda-uploads.s3.ap-south-1.amazonaws.com/pda/letterhead/left-logo/mit-logo-20260220125851.png';
const LEADERBOARD_SORT_OPTIONS = [
    { value: 'rank', label: 'Rank (Default)' },
    { value: 'score_desc', label: 'Score: High to Low' },
    { value: 'score_asc', label: 'Score: Low to High' },
    { value: 'name_asc', label: 'Name: A to Z' },
    { value: 'name_desc', label: 'Name: Z to A' },
    { value: 'rounds_desc', label: 'Rounds: High to Low' },
    { value: 'rounds_asc', label: 'Rounds: Low to High' },
];

const DEPARTMENTS = [
    { value: 'Artificial Intelligence and Data Science', label: 'AI & DS' },
    { value: 'Aerospace Engineering', label: 'Aerospace' },
    { value: 'Automobile Engineering', label: 'Automobile' },
    { value: 'Computer Technology', label: 'CT' },
    { value: 'Electronics and Communication Engineering', label: 'ECE' },
    { value: 'Electronics and Instrumentation Engineering', label: 'EIE' },
    { value: 'Production Technology', label: 'Production' },
    { value: 'Robotics and Automation', label: 'Robotics' },
    { value: 'Rubber and Plastics Technology', label: 'RPT' },
    { value: 'Information Technology', label: 'IT' },
];

const normalizeRoundState = (value) => String(value || '').trim().toLowerCase();
const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
const normalizeApiErrorText = (value) => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) {
        return value
            .map((item) => normalizeApiErrorText(item))
            .filter(Boolean)
            .join('; ');
    }
    if (typeof value === 'object') {
        const loc = Array.isArray(value.loc) ? value.loc.filter(Boolean).join('.') : '';
        const msg = typeof value.msg === 'string' ? value.msg : '';
        const message = typeof value.message === 'string' ? value.message : '';
        if (msg && loc) return `${loc}: ${msg}`;
        if (msg) return msg;
        if (message) return message;
        try {
            return JSON.stringify(value);
        } catch {
            return '';
        }
    }
    return '';
};

const buildOfficialPrintHtml = ({
    eventName,
    roundNumber,
    headers,
    pages,
    isTeamMode,
    leftLogo,
    rightLogo,
    watermarkLogo,
}) => {
    const totalPages = pages.length || 1;
    const headerHtml = headers
        .map((header) => `<th class="${escapeHtml(header.className)}">${escapeHtml(header.label)}</th>`)
        .join('');
    const pagesHtml = pages.map((rows, pageIndex) => {
        const rowsHtml = rows
            .map((row) => (
                `<tr>${
                    row.map((cell, cellIndex) => {
                        const isCodeCell = isTeamMode && cellIndex === 1 && String(cell || '').trim().length > 0;
                        const className = isCodeCell ? 'team-code' : '';
                        return `<td class="${className}">${escapeHtml(cell)}</td>`;
                    }).join('')
                }</tr>`
            ))
            .join('');
        return `
            <section class="print-page">
                <div class="page-watermark">${watermarkLogo ? `<img src="${escapeHtml(watermarkLogo)}" alt="Watermark" />` : ''}</div>
                <div class="page-content">
                    <table class="header-table">
                        <tr>
                            <td class="logo-cell logo-left">${leftLogo ? `<img class="logo" src="${escapeHtml(leftLogo)}" alt="Left Logo" />` : ''}</td>
                            <td class="center-content">
                                <div class="university-name">ANNA UNIVERSITY</div>
                                <div class="institute-name">MADRAS INSTITUTE OF TECHNOLOGY</div>
                                <div class="pda-name">PERSONALITY DEVELOPMENT ASSOCIATION</div>
                                <div class="address">CHROMEPET, CHENNAI - 600 044</div>
                                <div class="contact-info">
                                    <span class="contact-label">EMAIL:</span><span class="contact-link">pda@mitindia.edu</span>
                                    <span class="contact-gap"></span>
                                    <span class="contact-label">WEBSITE:</span><span class="contact-link">www.pdamitindia.edu</span>
                                </div>
                                <div class="event-title">${escapeHtml(String(eventName || '').toUpperCase())}</div>
                                <div class="round-title">ROUND ${escapeHtml(roundNumber)} SHORTLISTED</div>
                            </td>
                            <td class="logo-cell logo-right">${rightLogo ? `<img class="logo" src="${escapeHtml(rightLogo)}" alt="Right Logo" />` : ''}</td>
                        </tr>
                    </table>

                    <table class="leaderboard-table">
                        <thead><tr>${headerHtml}</tr></thead>
                        <tbody>${rowsHtml}</tbody>
                    </table>

                    <div class="footer-text">The leaderboard was autogenerated using PERSOHUB version 1.0</div>
                </div>
                <div class="page-number">Page ${pageIndex + 1} of ${totalPages}</div>
            </section>
        `;
    }).join('');

    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>${escapeHtml(eventName)} - Round ${escapeHtml(roundNumber)} Shortlisted</title>
    <style>
        @page { size: A4; margin: 0; }
        * { box-sizing: border-box; }
        body {
            margin: 0;
            padding: 0;
            font-family: "Times New Roman", Times, serif;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            background: #ffffff;
        }
        .print-page {
            position: relative;
            width: 210mm;
            min-height: 297mm;
            padding: 15mm 15mm 25mm 15mm;
            overflow: hidden;
            page-break-after: always;
            background: #ffffff;
        }
        .print-page:last-child { page-break-after: auto; }
        .page-content { position: relative; z-index: 2; }
        .page-watermark {
            position: absolute;
            top: 50%;
            left: 50%;
            width: 112mm;
            height: 112mm;
            transform: translate(-50%, -50%);
            z-index: 1;
            pointer-events: none;
            opacity: 0.12;
        }
        .page-watermark img {
            width: 100%;
            height: 100%;
            object-fit: contain;
            filter: grayscale(1) brightness(0.2) contrast(1.6);
        }
        .header-table {
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
            margin-bottom: 20px;
        }
        .logo-cell { width: 100px; vertical-align: top; }
        .logo-left { padding-right: 15px; }
        .logo-right { padding-left: 15px; }
        .logo { width: 100px; height: 100px; object-fit: contain; }
        .center-content { text-align: center; vertical-align: top; line-height: 1.15; }
        .university-name, .institute-name, .pda-name, .address {
            font-size: 13pt;
            font-weight: bold;
            text-transform: uppercase;
            margin: 0;
            letter-spacing: 0.3px;
        }
        .contact-info {
            font-size: 11pt;
            font-weight: bold;
            margin-bottom: 8px;
        }
        .contact-label { text-transform: uppercase; }
        .contact-link { font-weight: normal; color: #0000ff; }
        .contact-gap { display: inline-block; width: 20px; }
        .event-title {
            font-size: 15pt;
            font-weight: bold;
            text-transform: uppercase;
            margin: 10px 0 5px 0;
            letter-spacing: 0.5px;
        }
        .round-title {
            font-size: 13pt;
            font-weight: bold;
            text-transform: uppercase;
            margin: 0 0 5px 0;
            letter-spacing: 0.5px;
        }
        .leaderboard-table {
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
        }
        .leaderboard-table th, .leaderboard-table td {
            border: 1px solid #000;
            text-align: center;
            font-size: 13px;
            background: transparent;
            font-family: "Times New Roman", Times, serif;
        }
        .leaderboard-table th {
            padding: 8px;
            font-weight: bold;
            text-transform: uppercase;
        }
        .leaderboard-table td {
            padding: 6px 8px;
            font-weight: normal;
            word-wrap: break-word;
        }
        .si-no-column { width: ${isTeamMode ? '15%' : '12%'}; }
        .team-code-column, .register-no-column { width: ${isTeamMode ? '25%' : '20%'}; }
        .team-name-column { width: 60%; }
        .name-column { width: 38%; }
        .department-column { width: 30%; }
        .team-code { font-weight: bold !important; }
        .footer-text {
            margin-top: 20px;
            text-align: center;
            font-size: 10pt;
            font-style: italic;
            color: #666;
            opacity: 0.7;
        }
        .page-number {
            position: absolute;
            left: 0;
            right: 0;
            bottom: 8mm;
            text-align: center;
            font-size: 10pt;
            z-index: 2;
        }
    </style>
</head>
<body>
${pagesHtml}
<script>
(() => {
  const waitForAllImages = () => {
    const images = Array.from(document.images || []);
    if (images.length === 0) return Promise.resolve();
    return Promise.all(images.map((img) => {
      if (img.complete && img.naturalWidth > 0) return Promise.resolve();
      return new Promise((resolve) => {
        const done = () => resolve();
        img.addEventListener('load', done, { once: true });
        img.addEventListener('error', done, { once: true });
      });
    }));
  };
  const runPrint = async () => {
    await waitForAllImages();
    setTimeout(() => {
      window.focus();
      window.print();
    }, 250);
  };
  if (document.readyState === 'complete') runPrint();
  else window.addEventListener('load', runPrint);
  window.onafterprint = () => window.close();
})();
</script>
</body>
</html>`;
};

function LeaderboardContent() {
    const { getAuthHeader } = useAuth();
    const { eventInfo, eventSlug } = useEventAdminShell();

    const [rows, setRows] = useState([]);
    const [podium, setPodium] = useState([]);
    const [rounds, setRounds] = useState([]);
    const [loading, setLoading] = useState(true);
    const [totalRows, setTotalRows] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
    const [pageSizeInput, setPageSizeInput] = useState(String(DEFAULT_PAGE_SIZE));
    const [sortOption, setSortOption] = useState('rank');
    const [selectedEntry, setSelectedEntry] = useState(null);
    const [roundStats, setRoundStats] = useState([]);
    const [roundStatsLoading, setRoundStatsLoading] = useState(false);
    const [roundStatsError, setRoundStatsError] = useState('');
    const [entrySummary, setEntrySummary] = useState(null);
    const [teamMembers, setTeamMembers] = useState([]);
    const [shortlistDialogOpen, setShortlistDialogOpen] = useState(false);
    const [shortlisting, setShortlisting] = useState(false);
    const [exportingFormat, setExportingFormat] = useState('');
    const [eliminationConfig, setEliminationConfig] = useState({ type: 'top_k', value: 10 });
    const [eliminateAbsent, setEliminateAbsent] = useState(true);
    const [filters, setFilters] = useState({
        department: '',
        gender: '',
        batch: '',
        status: '',
        search: '',
        roundIds: [],
    });

    const isTeamMode = eventInfo?.participant_mode === 'team';

    const getErrorMessage = (error, fallback) => (
        normalizeApiErrorText(error?.response?.data?.detail)
        || normalizeApiErrorText(error?.response?.data?.message)
        || normalizeApiErrorText(error?.message)
        || fallback
    );

    const fetchRows = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (filters.search) params.append('search', filters.search);
            if (filters.status) params.append('status', filters.status);
            if (!isTeamMode) {
                if (filters.department) params.append('department', filters.department);
                if (filters.gender) params.append('gender', filters.gender);
                if (filters.batch) params.append('batch', filters.batch);
            }
            (filters.roundIds || []).forEach((roundId) => {
                params.append('round_ids', String(roundId));
            });
            params.append('page', String(currentPage));
            params.append('page_size', String(pageSize));

            const response = await axios.get(`${API}/pda-admin/events/${eventSlug}/leaderboard?${params.toString()}`, {
                headers: getAuthHeader(),
            });
            const data = Array.isArray(response.data) ? response.data : [];
            setRows(data);
            setTotalRows(Number(response.headers['x-total-count'] || data.length || 0));
            if (currentPage === 1) {
                const activeRows = data.filter((row) => String(row?.status || '').toLowerCase() === 'active');
                setPodium(activeRows.slice(0, 3));
            }
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to load leaderboard'));
            setRows([]);
            setTotalRows(0);
            if (currentPage === 1) {
                setPodium([]);
            }
        } finally {
            setLoading(false);
        }
    }, [currentPage, eventSlug, filters.batch, filters.department, filters.gender, filters.roundIds, filters.search, filters.status, getAuthHeader, isTeamMode, pageSize]);

    const fetchRounds = useCallback(async () => {
        try {
            const response = await axios.get(`${API}/pda-admin/events/${eventSlug}/rounds`, {
                headers: getAuthHeader(),
            });
            setRounds(response.data || []);
        } catch (error) {
            setRounds([]);
        }
    }, [eventSlug, getAuthHeader]);

    useEffect(() => {
        fetchRows();
    }, [fetchRows]);

    useEffect(() => {
        fetchRounds();
    }, [fetchRounds]);

    useEffect(() => {
        setCurrentPage(1);
    }, [filters.batch, filters.department, filters.gender, filters.roundIds, filters.search, filters.status]);

    const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));

    useEffect(() => {
        if (currentPage > totalPages) {
            setCurrentPage(totalPages);
        }
    }, [currentPage, totalPages]);

    const frozenNotCompletedRounds = useMemo(
        () => rounds.filter((round) => round.is_frozen && round.state !== 'Completed' && round.state !== 'Reveal'),
        [rounds]
    );
    const eligibleFilterRounds = useMemo(
        () => rounds.filter((round) => Boolean(round?.is_frozen) || normalizeRoundState(round?.state) === 'completed'),
        [rounds]
    );
    const selectedRoundIdSet = useMemo(
        () => new Set((filters.roundIds || []).map((value) => Number(value))),
        [filters.roundIds]
    );
    const roundFilterLabel = useMemo(() => {
        const count = (filters.roundIds || []).length;
        if (count === 0) return 'All rounds';
        if (count === 1) return '1 round selected';
        return `${count} rounds selected`;
    }, [filters.roundIds]);

    useEffect(() => {
        const allowedRoundIds = new Set(eligibleFilterRounds.map((round) => Number(round.id)));
        setFilters((prev) => {
            const existing = (prev.roundIds || []).map((value) => Number(value));
            const next = existing.filter((roundId) => allowedRoundIds.has(roundId));
            if (next.length === existing.length) return prev;
            return { ...prev, roundIds: next };
        });
    }, [eligibleFilterRounds]);

    const targetShortlistRound = useMemo(
        () => frozenNotCompletedRounds.reduce((latest, round) => {
            if (!latest || round.id > latest.id) return round;
            return latest;
        }, null),
        [frozenNotCompletedRounds]
    );

    const batchOptions = useMemo(() => {
        const values = new Set();
        rows.forEach((row) => {
            if (row.batch) values.add(String(row.batch));
        });
        return Array.from(values).sort();
    }, [rows]);

    const applyPageSize = useCallback((rawValue) => {
        const parsed = Number(rawValue);
        if (!Number.isFinite(parsed)) {
            setPageSizeInput(String(pageSize));
            return;
        }
        const nextSize = Math.min(MAX_PAGE_SIZE, Math.max(MIN_PAGE_SIZE, Math.round(parsed)));
        setPageSizeInput(String(nextSize));
        if (nextSize !== pageSize) {
            setPageSize(nextSize);
            setCurrentPage(1);
        }
    }, [pageSize]);

    const sortedRows = useMemo(() => {
        const items = [...rows];
        const byNameAsc = (a, b) => String(a?.name || '').localeCompare(String(b?.name || ''), undefined, { sensitivity: 'base' });
        const numberValue = (value) => {
            const parsed = Number(value);
            return Number.isFinite(parsed) ? parsed : 0;
        };
        const rankValue = (entry) => (entry?.rank === null || entry?.rank === undefined ? Number.POSITIVE_INFINITY : numberValue(entry.rank));

        switch (sortOption) {
        case 'score_desc':
            items.sort((a, b) => numberValue(b?.cumulative_score) - numberValue(a?.cumulative_score) || byNameAsc(a, b));
            break;
        case 'score_asc':
            items.sort((a, b) => numberValue(a?.cumulative_score) - numberValue(b?.cumulative_score) || byNameAsc(a, b));
            break;
        case 'name_asc':
            items.sort((a, b) => byNameAsc(a, b));
            break;
        case 'name_desc':
            items.sort((a, b) => byNameAsc(b, a));
            break;
        case 'rounds_desc':
            items.sort((a, b) => numberValue(b?.rounds_participated) - numberValue(a?.rounds_participated) || byNameAsc(a, b));
            break;
        case 'rounds_asc':
            items.sort((a, b) => numberValue(a?.rounds_participated) - numberValue(b?.rounds_participated) || byNameAsc(a, b));
            break;
        case 'rank':
        default:
            items.sort((a, b) => rankValue(a) - rankValue(b) || byNameAsc(a, b));
            break;
        }

        return items;
    }, [rows, sortOption]);

    const handleShortlist = async () => {
        if (!targetShortlistRound) return;
        setShortlisting(true);
        try {
            await axios.put(`${API}/pda-admin/events/${eventSlug}/rounds/${targetShortlistRound.id}`, {
                elimination_type: eliminationConfig.type,
                elimination_value: eliminationConfig.value,
                eliminate_absent: eliminateAbsent,
            }, { headers: getAuthHeader() });
            toast.success('Shortlist completed');
            setShortlistDialogOpen(false);
            fetchRows();
            fetchRounds();
        } catch (error) {
            toast.error(getErrorMessage(error, 'Shortlist failed'));
        } finally {
            setShortlisting(false);
        }
    };

    const handleExport = async (format) => {
        if (exportingFormat) return;
        setExportingFormat(format);

        try {
            const params = new URLSearchParams();
            params.append('format', format);
            if (filters.search) params.append('search', filters.search);
            if (filters.status) params.append('status', filters.status);
            if (!isTeamMode) {
                if (filters.department) params.append('department', filters.department);
                if (filters.gender) params.append('gender', filters.gender);
                if (filters.batch) params.append('batch', filters.batch);
            }
            (filters.roundIds || []).forEach((roundId) => {
                params.append('round_ids', String(roundId));
            });

            const response = await axios.get(`${API}/pda-admin/events/${eventSlug}/export/leaderboard?${params.toString()}`, {
                headers: getAuthHeader(),
                responseType: 'blob',
            });

            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `leaderboard.${format}`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);

            toast.success('Leaderboard exported');
        } catch (error) {
            toast.error(getErrorMessage(error, 'Export failed'));
        } finally {
            setExportingFormat('');
        }
    };

    const handleRefresh = () => {
        fetchRounds();
        fetchRows();
        toast.success('Leaderboard refreshed');
    };

    const toggleRoundSelection = useCallback((roundId, checked) => {
        const targetId = Number(roundId);
        setFilters((prev) => {
            const nextSet = new Set((prev.roundIds || []).map((value) => Number(value)));
            if (checked) nextSet.add(targetId);
            else nextSet.delete(targetId);
            return { ...prev, roundIds: Array.from(nextSet) };
        });
    }, []);

    const openEntityModal = async (entry) => {
        const entityId = entry.entity_id || entry.participant_id;
        setSelectedEntry(entry);
        setRoundStats([]);
        setRoundStatsError('');
        setRoundStatsLoading(true);
        setEntrySummary(null);
        setTeamMembers([]);
        try {
            const [roundRes, summaryRes] = await Promise.all([
                axios.get(`${API}/pda-admin/events/${eventSlug}/participants/${entityId}/rounds`, {
                    headers: getAuthHeader(),
                }),
                axios.get(`${API}/pda-admin/events/${eventSlug}/participants/${entityId}/summary`, {
                    headers: getAuthHeader(),
                }),
            ]);
            setRoundStats(roundRes.data || []);
            setEntrySummary(summaryRes.data || null);
            if (isTeamMode) {
                const teamRes = await axios.get(`${API}/pda-admin/events/${eventSlug}/teams/${entityId}`, {
                    headers: getAuthHeader(),
                });
                setTeamMembers(teamRes.data?.members || []);
            }
        } catch (error) {
            setRoundStatsError('Failed to load round stats');
        } finally {
            setRoundStatsLoading(false);
        }
    };

    const getRankBadge = (rank) => {
        if (rank === null || rank === undefined) return 'bg-gray-200 text-gray-700';
        if (rank === 1) return 'bg-yellow-400 text-black';
        if (rank === 2) return 'bg-gray-300 text-black';
        if (rank === 3) return 'bg-orange-400 text-black';
        return 'bg-primary text-white';
    };

    const departmentLabel = selectedEntry
        ? (DEPARTMENTS.find((d) => d.value === selectedEntry.department)?.label || selectedEntry.department)
        : '';

    return (
        <>
            {targetShortlistRound ? (
                <div className="neo-card mb-6 bg-orange-50 border-orange-500">
                    <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
                        <div>
                            <h2 className="font-heading font-bold text-xl">Shortlist participants</h2>
                            <p className="text-gray-700 text-sm">
                                Frozen round {targetShortlistRound.round_no} is ready for shortlisting. This uses cumulative
                                scores from completed + frozen rounds.
                            </p>
                        </div>
                        <Dialog open={shortlistDialogOpen} onOpenChange={setShortlistDialogOpen}>
                            <DialogTrigger asChild>
                                <Button className="bg-orange-500 text-white border-2 border-black shadow-neo">Shortlist</Button>
                            </DialogTrigger>
                            <DialogContent className="border-4 border-black">
                                <DialogHeader>
                                    <DialogTitle className="font-heading font-bold text-xl">Shortlist {isTeamMode ? 'Teams' : 'Participants'}</DialogTitle>
                                </DialogHeader>
                                <div className="space-y-4">
                                    <p className="text-gray-600">
                                        This will eliminate {isTeamMode ? 'teams' : 'participants'} based on cumulative scores.
                                        Round {targetShortlistRound.round_no} will be marked as completed.
                                    </p>
                                    <div className="space-y-2">
                                        <div className="font-bold">Elimination Rule</div>
                                        <Select value={eliminationConfig.type} onValueChange={(value) => setEliminationConfig((prev) => ({ ...prev, type: value }))}>
                                            <SelectTrigger className="neo-input"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="top_k">Keep Top K</SelectItem>
                                                <SelectItem value="min_score">Minimum Score</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <div className="font-bold">{eliminationConfig.type === 'top_k' ? 'Keep top:' : 'Min score:'}</div>
                                        <Input
                                            type="number"
                                            value={eliminationConfig.value}
                                            onChange={(e) => setEliminationConfig((prev) => ({ ...prev, value: parseFloat(e.target.value) || 0 }))}
                                            className="neo-input"
                                        />
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Checkbox
                                            checked={eliminateAbsent}
                                            onCheckedChange={(checked) => setEliminateAbsent(checked === true)}
                                            className="border-2 border-black data-[state=checked]:bg-primary"
                                        />
                                        <span className="text-sm font-medium">Eliminate absent entries</span>
                                    </div>
                                    <div className="flex gap-2">
                                        <Button onClick={() => setShortlistDialogOpen(false)} variant="outline" className="flex-1 border-2 border-black">Cancel</Button>
                                        <Button onClick={handleShortlist} disabled={shortlisting} className="flex-1 bg-orange-500 text-white border-2 border-black">
                                            {shortlisting ? 'Shortlisting...' : 'Confirm'}
                                        </Button>
                                    </div>
                                </div>
                            </DialogContent>
                        </Dialog>
                    </div>
                </div>
            ) : null}

            <div className="neo-card mb-6">
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6">
                    <div>
                        <h1 className="font-heading font-bold text-3xl flex items-center gap-2">
                            <Trophy className="w-8 h-8 text-yellow-500" /> Leaderboard
                        </h1>
                        <p className="text-gray-600">Cumulative scores from completed + frozen rounds</p>
                    </div>
                    <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
                        <Button onClick={handleRefresh} variant="outline" className="w-full border-2 border-black shadow-neo sm:w-auto">
                            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
                        </Button>
                        <Button
                            onClick={() => handleExport('csv')}
                            disabled={Boolean(exportingFormat)}
                            variant="outline"
                            className="w-full border-2 border-black shadow-neo sm:w-auto"
                        >
                            <Download className="w-4 h-4 mr-2" /> CSV
                        </Button>
                        <Button
                            onClick={() => handleExport('xlsx')}
                            disabled={Boolean(exportingFormat)}
                            variant="outline"
                            className="w-full border-2 border-black shadow-neo sm:w-auto"
                        >
                            <Download className="w-4 h-4 mr-2" /> Excel
                        </Button>
                        <Button
                            onClick={() => handleExport('pdf')}
                            disabled={Boolean(exportingFormat)}
                            variant="outline"
                            className="w-full border-2 border-black shadow-neo sm:w-auto"
                        >
                            {exportingFormat === 'pdf' ? (
                                <>
                                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Preparing PDF...
                                </>
                            ) : (
                                <>
                                    <Download className="w-4 h-4 mr-2" /> Official PDF
                                </>
                            )}
                        </Button>
                    </div>
                </div>

                <div className={`grid gap-3 ${isTeamMode ? 'grid-cols-1 md:grid-cols-3' : 'grid-cols-1 md:grid-cols-3 lg:grid-cols-6'}`}>
                    <div className={`relative ${isTeamMode ? 'md:col-span-2' : 'md:col-span-3 lg:col-span-2'}`}>
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <Input
                            placeholder={`Search ${isTeamMode ? 'team' : 'participant'}...`}
                            value={filters.search}
                            onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
                            className="neo-input pl-10"
                        />
                    </div>

                    {!isTeamMode ? (
                        <Select value={filters.department || 'all'} onValueChange={(value) => setFilters((prev) => ({ ...prev, department: value === 'all' ? '' : value }))}>
                            <SelectTrigger className="neo-input"><SelectValue placeholder="Department" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Departments</SelectItem>
                                {DEPARTMENTS.map((d) => (
                                    <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    ) : null}

                    {!isTeamMode ? (
                        <Select value={filters.batch || 'all'} onValueChange={(value) => setFilters((prev) => ({ ...prev, batch: value === 'all' ? '' : value }))}>
                            <SelectTrigger className="neo-input"><SelectValue placeholder="Batch" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Batches</SelectItem>
                                {batchOptions.map((batch) => (
                                    <SelectItem key={batch} value={batch}>{batch}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    ) : null}

                    {!isTeamMode ? (
                        <Select value={filters.gender || 'all'} onValueChange={(value) => setFilters((prev) => ({ ...prev, gender: value === 'all' ? '' : value }))}>
                            <SelectTrigger className="neo-input"><SelectValue placeholder="Gender" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Genders</SelectItem>
                                <SelectItem value="Male">Male</SelectItem>
                                <SelectItem value="Female">Female</SelectItem>
                            </SelectContent>
                        </Select>
                    ) : null}

                    <Select value={filters.status || 'all'} onValueChange={(value) => setFilters((prev) => ({ ...prev, status: value === 'all' ? '' : value }))}>
                        <SelectTrigger className="neo-input"><SelectValue placeholder="Status" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Statuses</SelectItem>
                            <SelectItem value="Active">Active</SelectItem>
                            <SelectItem value="Eliminated">Eliminated</SelectItem>
                        </SelectContent>
                    </Select>

                    <Select value={sortOption} onValueChange={setSortOption}>
                        <SelectTrigger className="neo-input"><SelectValue placeholder="Sort" /></SelectTrigger>
                        <SelectContent>
                            {LEADERBOARD_SORT_OPTIONS.map((option) => (
                                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <Popover>
                        <PopoverTrigger asChild>
                            <Button type="button" variant="outline" className="neo-input justify-between font-normal">
                                <span className="truncate">{roundFilterLabel}</span>
                                <ChevronDown className="h-4 w-4" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-80 border-2 border-black p-3" align="end">
                            <div className="mb-2 flex items-center justify-between">
                                <p className="text-sm font-bold">Eligible Rounds</p>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    className="h-7 px-2 text-xs"
                                    onClick={() => setFilters((prev) => ({ ...prev, roundIds: [] }))}
                                >
                                    All rounds
                                </Button>
                            </div>
                            {eligibleFilterRounds.length === 0 ? (
                                <p className="text-xs text-gray-600">No completed/frozen rounds yet.</p>
                            ) : (
                                <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                                    {eligibleFilterRounds.map((round) => (
                                        <label key={round.id} className="flex cursor-pointer items-start gap-2 rounded-md border border-black/10 bg-[#fffdf7] px-2 py-2">
                                            <Checkbox
                                                checked={selectedRoundIdSet.has(Number(round.id))}
                                                onCheckedChange={(checked) => toggleRoundSelection(round.id, checked === true)}
                                                className="mt-0.5 border-2 border-black data-[state=checked]:bg-primary"
                                            />
                                            <span className="text-sm">
                                                <span className="font-semibold">
                                                    {String(round.round_no || '').toLowerCase().startsWith('pf')
                                                        ? String(round.round_no)
                                                        : `PF${String(round.round_no || '').padStart(2, '0')}`}
                                                </span>
                                                <span className="mx-1 text-gray-400">-</span>
                                                <span>{round.name}</span>
                                            </span>
                                        </label>
                                    ))}
                                </div>
                            )}
                        </PopoverContent>
                    </Popover>
                </div>
            </div>

            {podium.length >= 3 ? (
                <div className="grid md:grid-cols-3 gap-6 mb-8">
                    <div className="neo-card bg-gray-100 order-2 md:order-1 transform md:translate-y-4">
                        <div className="text-center">
                            <div className="w-16 h-16 mx-auto bg-gray-300 border-4 border-black flex items-center justify-center mb-4">
                                <Medal className="w-8 h-8" />
                            </div>
                            <div className="font-bold text-2xl text-gray-600">#2</div>
                            <h3 className="font-heading font-bold text-xl">{podium[1]?.name}</h3>
                            <p className="text-sm text-gray-600">{podium[1]?.regno_or_code || podium[1]?.register_number}</p>
                            {!isTeamMode ? (
                                <p className="text-sm text-gray-500 mt-1">
                                    {DEPARTMENTS.find((d) => d.value === podium[1]?.department)?.label || podium[1]?.department || '—'}
                                </p>
                            ) : null}
                            <div className="mt-4 bg-gray-300 border-2 border-black px-4 py-2 inline-block">
                                <span className="font-bold text-2xl">{Number(podium[1]?.cumulative_score || 0).toFixed(2)}</span>
                                <span className="text-sm ml-1">pts</span>
                            </div>
                        </div>
                    </div>

                    <div className="neo-card bg-yellow-100 border-yellow-500 order-1 md:order-2">
                        <div className="text-center">
                            <div className="w-20 h-20 mx-auto bg-yellow-400 border-4 border-black flex items-center justify-center mb-4 shadow-neo">
                                <Trophy className="w-10 h-10" />
                            </div>
                            <div className="font-bold text-3xl text-yellow-600">#1</div>
                            <h3 className="font-heading font-bold text-2xl">{podium[0]?.name}</h3>
                            <p className="text-sm text-gray-600">{podium[0]?.regno_or_code || podium[0]?.register_number}</p>
                            {!isTeamMode ? (
                                <p className="text-sm text-gray-500 mt-1">
                                    {DEPARTMENTS.find((d) => d.value === podium[0]?.department)?.label || podium[0]?.department || '—'}
                                </p>
                            ) : null}
                            <div className="mt-4 bg-yellow-400 border-2 border-black px-6 py-3 inline-block shadow-neo">
                                <span className="font-bold text-3xl">{Number(podium[0]?.cumulative_score || 0).toFixed(2)}</span>
                                <span className="text-sm ml-1">pts</span>
                            </div>
                        </div>
                    </div>

                    <div className="neo-card bg-orange-100 order-3 transform md:translate-y-8">
                        <div className="text-center">
                            <div className="w-14 h-14 mx-auto bg-orange-400 border-4 border-black flex items-center justify-center mb-4">
                                <Medal className="w-7 h-7" />
                            </div>
                            <div className="font-bold text-xl text-orange-600">#3</div>
                            <h3 className="font-heading font-bold text-lg">{podium[2]?.name}</h3>
                            <p className="text-sm text-gray-600">{podium[2]?.regno_or_code || podium[2]?.register_number}</p>
                            {!isTeamMode ? (
                                <p className="text-sm text-gray-500 mt-1">
                                    {DEPARTMENTS.find((d) => d.value === podium[2]?.department)?.label || podium[2]?.department || '—'}
                                </p>
                            ) : null}
                            <div className="mt-4 bg-orange-400 border-2 border-black px-4 py-2 inline-block">
                                <span className="font-bold text-xl">{Number(podium[2]?.cumulative_score || 0).toFixed(2)}</span>
                                <span className="text-sm ml-1">pts</span>
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}

            {loading ? (
                <div className="neo-card text-center py-12">
                    <div className="loading-spinner mx-auto"></div>
                    <p className="mt-4">Loading leaderboard...</p>
                </div>
            ) : rows.length === 0 ? (
                <div className="neo-card text-center py-12">
                    <Trophy className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                    <h3 className="font-heading font-bold text-xl mb-2">No Leaderboard Data</h3>
                    <p className="text-gray-600">Freeze rounds to see the leaderboard.</p>
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="neo-table">
                        <thead>
                            <tr>
                                <th>Rank</th>
                                <th>{isTeamMode ? 'Team Code' : 'Register No'}</th>
                                <th>{isTeamMode ? 'Team Name' : 'Name'}</th>
                                {!isTeamMode ? <th>Department</th> : null}
                                {!isTeamMode ? <th>Batch</th> : null}
                                <th>Rounds</th>
                                <th>Score</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedRows.map((entry) => (
                                <tr
                                    key={`${entry.entity_type}-${entry.entity_id}`}
                                    className="cursor-pointer hover:bg-secondary"
                                    onClick={() => openEntityModal(entry)}
                                >
                                    <td>
                                        <span className={`w-8 h-8 inline-flex items-center justify-center border-2 border-black font-bold ${getRankBadge(entry.rank)}`}>
                                            {entry.rank ?? '—'}
                                        </span>
                                    </td>
                                    <td className="font-mono font-bold">{entry.regno_or_code || entry.register_number}</td>
                                    <td className="font-medium">{entry.name}</td>
                                    {!isTeamMode ? (
                                        <td className="text-sm">{DEPARTMENTS.find((d) => d.value === entry.department)?.label || entry.department}</td>
                                    ) : null}
                                    {!isTeamMode ? <td className="text-sm">{entry.batch}</td> : null}
                                    <td>
                                        <span className="bg-secondary px-2 py-1 border border-black font-bold">{entry.rounds_participated ?? '—'}</span>
                                    </td>
                                    <td>
                                        <span className="bg-primary text-white px-3 py-1 border-2 border-black font-bold">
                                            {Number(entry.cumulative_score || 0).toFixed(2)}
                                        </span>
                                    </td>
                                    <td>
                                        <span className={`tag border-2 ${entry.status === 'Active' ? 'bg-green-100 text-green-800 border-green-500' : 'bg-red-100 text-red-800 border-red-500'}`}>
                                            {entry.status}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {!loading && totalRows > 0 ? (
                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-gray-600">
                        Showing {(currentPage - 1) * pageSize + 1}-{Math.min((currentPage - 1) * pageSize + rows.length, totalRows)} of {totalRows}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-600">Rows / page</span>
                            <Input
                                type="number"
                                min={MIN_PAGE_SIZE}
                                max={MAX_PAGE_SIZE}
                                value={pageSizeInput}
                                onChange={(e) => setPageSizeInput(e.target.value)}
                                onBlur={() => applyPageSize(pageSizeInput)}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter') {
                                        event.preventDefault();
                                        applyPageSize(pageSizeInput);
                                    }
                                }}
                                className="neo-input h-9 w-24"
                            />
                        </div>
                        <Button type="button" variant="outline" size="icon" onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))} disabled={currentPage === 1} className="border-2 border-black shadow-neo disabled:opacity-50">
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <span className="min-w-20 text-center text-sm font-bold">Page {currentPage} / {totalPages}</span>
                        <Button type="button" variant="outline" size="icon" onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))} disabled={currentPage === totalPages} className="border-2 border-black shadow-neo disabled:opacity-50">
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            ) : null}

            <EntityDetailsModal
                open={Boolean(selectedEntry)}
                onOpenChange={() => setSelectedEntry(null)}
                entity={selectedEntry}
                roundStats={roundStats}
                roundStatsLoading={roundStatsLoading}
                roundStatsError={roundStatsError}
                overallPoints={entrySummary?.overall_points}
                overallRank={entrySummary?.overall_rank}
                entityMode={isTeamMode ? 'team' : 'individual'}
                teamMembers={teamMembers}
                departmentLabel={departmentLabel}
            />
        </>
    );
}

export default function EventAdminLeaderboardPage() {
    return (
        <EventAdminShell activeTab="leaderboard">
            <LeaderboardContent />
        </EventAdminShell>
    );
}
