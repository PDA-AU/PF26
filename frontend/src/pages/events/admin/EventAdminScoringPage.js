import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import {
    Save,
    Lock,
    LockOpen,
    ArrowLeft,
    Search,
    AlertTriangle,
    Upload,
    Download,
    FileSpreadsheet,
    Users,
    Edit2,
    Plus,
    X,
    Shuffle,
    Mail,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';

import { useAuth } from '@/context/AuthContext';
import EventAdminShell, { useEventAdminShell } from './EventAdminShell';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const SCORING_PAGE_SIZE_KEY = 'event_admin_scoring_page_size';
const SCORING_PAGE_SIZE_OPTIONS = [10, 20, 50];
const IST_OFFSET_MINUTES = 5.5 * 60;
const PANEL_DISTRIBUTION_OPTIONS = [
    { value: 'team_count', label: 'Team Count' },
    { value: 'member_count_weighted', label: 'Member Count Weighted' },
];

const loadPageSize = (storageKey, fallback, allowedValues) => {
    if (typeof window === 'undefined') return fallback;
    const raw = window.localStorage.getItem(storageKey);
    const parsed = Number.parseInt(raw || '', 10);
    return allowedValues.includes(parsed) ? parsed : fallback;
};

const createCriterionDraft = (name = '', maxMarks = 0) => ({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    max_marks: maxMarks,
});

const createPanelDraft = (panelNo = 1) => ({
    _draftId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    id: null,
    panel_no: panelNo,
    panel_name: '',
    panel_link: '',
    panel_date_ist: '',
    panel_time_ist: '',
    instructions: '',
    member_admin_user_ids: [],
});

const toIstDateTimeParts = (isoValue) => {
    if (!isoValue) return { date: '', time: '' };
    const parsed = new Date(isoValue);
    if (Number.isNaN(parsed.getTime())) return { date: '', time: '' };
    const istDate = new Date(parsed.getTime() + (IST_OFFSET_MINUTES * 60 * 1000));
    const year = istDate.getUTCFullYear();
    const month = String(istDate.getUTCMonth() + 1).padStart(2, '0');
    const day = String(istDate.getUTCDate()).padStart(2, '0');
    const hour = String(istDate.getUTCHours()).padStart(2, '0');
    const minute = String(istDate.getUTCMinutes()).padStart(2, '0');
    return {
        date: `${year}-${month}-${day}`,
        time: `${hour}:${minute}`,
    };
};

const fromIstDateTimeParts = (datePart, timePart) => {
    const d = String(datePart || '').trim();
    const t = String(timePart || '').trim();
    if (!d && !t) return null;
    if (!d || !t) return null;
    if (!datePart || !timePart) return null;
    const [year, month, day] = d.split('-').map((part) => Number.parseInt(part, 10));
    const [hour, minute] = t.split(':').map((part) => Number.parseInt(part, 10));
    const hasInvalidPart = [year, month, day, hour, minute].some((part) => Number.isNaN(part));
    if (hasInvalidPart) return null;
    const utcMillis = Date.UTC(year, month - 1, day, hour, minute) - (IST_OFFSET_MINUTES * 60 * 1000);
    return new Date(utcMillis).toISOString();
};

const normalizeIsoOrNull = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return null;
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString();
};

const normalizePanelMemberIds = (values) => (
    Array.from(new Set((Array.isArray(values) ? values : []).map((value) => Number(value))))
        .filter(Number.isFinite)
        .sort((a, b) => a - b)
);

const normalizePanelDefinition = (panel, fallbackPanelNo = 1) => {
    const parsedPanelNo = Number.parseInt(String(panel?.panel_no || ''), 10);
    return {
        id: panel?.id == null ? null : Number(panel.id),
        panel_no: Number.isFinite(parsedPanelNo) && parsedPanelNo > 0 ? parsedPanelNo : fallbackPanelNo,
        panel_name: String(panel?.panel_name || '').trim() || null,
        panel_link: String(panel?.panel_link || '').trim() || null,
        panel_time: normalizeIsoOrNull(panel?.panel_time),
        instructions: String(panel?.instructions || '').trim() || null,
        member_admin_user_ids: normalizePanelMemberIds(panel?.member_admin_user_ids),
    };
};

const buildPanelDefinitionPayloadFromDrafts = (panelDrafts) => {
    const errors = [];
    const normalized = (Array.isArray(panelDrafts) ? panelDrafts : []).map((panel, index) => {
        const panelNo = Number.parseInt(String(panel?.panel_no || ''), 10);
        const safePanelNo = Number.isFinite(panelNo) && panelNo > 0 ? panelNo : (index + 1);
        const datePart = String(panel?.panel_date_ist || '').trim();
        const timePart = String(panel?.panel_time_ist || '').trim();
        const hasDate = Boolean(datePart);
        const hasTime = Boolean(timePart);
        if (hasDate !== hasTime) {
            errors.push(`Panel ${safePanelNo}: select both date and time in IST`);
        }
        const panelTimeIso = fromIstDateTimeParts(datePart, timePart);
        if (hasDate && hasTime && !panelTimeIso) {
            errors.push(`Panel ${safePanelNo}: invalid date/time`);
        }
        return {
            id: panel?.id || undefined,
            panel_no: safePanelNo,
            panel_name: String(panel?.panel_name || '').trim() || null,
            panel_link: String(panel?.panel_link || '').trim() || null,
            panel_time: panelTimeIso,
            instructions: String(panel?.instructions || '').trim() || null,
            member_admin_user_ids: normalizePanelMemberIds(panel?.member_admin_user_ids),
        };
    });
    const panelNos = normalized.map((panel) => panel.panel_no);
    if (new Set(panelNos).size !== panelNos.length) {
        errors.push('Panel numbers must be unique');
    }
    return { normalized, errors };
};

const scoreSnapshotForRow = (row, criteriaList) => {
    const normalizedCriteria = Array.isArray(criteriaList) && criteriaList.length
        ? criteriaList
        : [{ name: 'Score', max_marks: 100 }];
    const criteriaValues = normalizedCriteria.map((criterion) => {
        const parsed = Number.parseFloat(row?.criteria_scores?.[criterion.name]);
        return Number.isFinite(parsed) ? parsed : 0;
    });
    return JSON.stringify({
        is_present: Boolean(row?.is_present),
        criteria_values: criteriaValues,
    });
};

const parseScoreSnapshot = (snapshot, criteriaList) => {
    try {
        const parsed = JSON.parse(String(snapshot || '{}'));
        const criteria = Array.isArray(criteriaList) && criteriaList.length ? criteriaList : [{ name: 'Score', max_marks: 100 }];
        const values = Array.isArray(parsed.criteria_values) ? parsed.criteria_values : [];
        const criteriaScores = criteria.reduce((acc, criterion, index) => {
            const value = Number(values[index] ?? 0);
            acc[criterion.name] = Number.isFinite(value) ? value : 0;
            return acc;
        }, {});
        return {
            is_present: parsed.is_present === true,
            criteria_scores: criteriaScores,
        };
    } catch {
        return {
            is_present: true,
            criteria_scores: {},
        };
    }
};

const normalizeErrorMessage = (value, fallback) => {
    if (value == null) return fallback;
    if (typeof value === 'string') return value || fallback;
    if (Array.isArray(value)) {
        const parts = value
            .map((item) => normalizeErrorMessage(item, ''))
            .map((item) => String(item || '').trim())
            .filter(Boolean);
        return parts.length ? parts.join(', ') : fallback;
    }
    if (typeof value === 'object') {
        if (typeof value.msg === 'string' && value.msg.trim()) return value.msg.trim();
        if (typeof value.detail === 'string' && value.detail.trim()) return value.detail.trim();
        try {
            return JSON.stringify(value);
        } catch {
            return fallback;
        }
    }
    return String(value);
};

const entityKey = (entityType, entityId) => `${String(entityType || '').trim().toLowerCase()}:${Number(entityId)}`;

function ScoringContent() {
    const navigate = useNavigate();
    const { roundId } = useParams();
    const { getAuthHeader } = useAuth();
    const {
        eventSlug,
        eventInfo,
        pushLocalUndo,
        pushSavedUndo,
        warnNonUndoable,
    } = useEventAdminShell();

    const [round, setRound] = useState(null);
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [importing, setImporting] = useState(false);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [presenceFilter, setPresenceFilter] = useState('all');
    const [submissionFilter, setSubmissionFilter] = useState('all');
    const [sortBy, setSortBy] = useState('register_asc');
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(() => loadPageSize(SCORING_PAGE_SIZE_KEY, 10, SCORING_PAGE_SIZE_OPTIONS));
    const [freezeDialogOpen, setFreezeDialogOpen] = useState(false);
    const [criteriaDialogOpen, setCriteriaDialogOpen] = useState(false);
    const [criteriaDraft, setCriteriaDraft] = useState([]);
    const [savingCriteria, setSavingCriteria] = useState(false);
    const [importPreviewOpen, setImportPreviewOpen] = useState(false);
    const [importPreview, setImportPreview] = useState(null);
    const [pendingImportFile, setPendingImportFile] = useState(null);
    const [confirmingImport, setConfirmingImport] = useState(false);
    const [exportingRound, setExportingRound] = useState(false);
    const [exportingPanelWise, setExportingPanelWise] = useState(false);
    const [panelConfig, setPanelConfig] = useState({
        panel_mode_enabled: false,
        panel_team_distribution_mode: 'team_count',
        panel_structure_locked: false,
        current_admin_is_superadmin: false,
        my_panel_ids: [],
        available_admins: [],
        panels: [],
    });
    const [panelDrafts, setPanelDrafts] = useState([]);
    const [panelFilter, setPanelFilter] = useState('all');
    const [panelModeSaving, setPanelModeSaving] = useState(false);
    const [panelSaving, setPanelSaving] = useState(false);
    const [panelAutoAssigning, setPanelAutoAssigning] = useState(false);
    const [panelAssignmentSaving, setPanelAssignmentSaving] = useState(false);
    const [panelAssignmentOriginal, setPanelAssignmentOriginal] = useState({});
    const [panelAssignmentDraft, setPanelAssignmentDraft] = useState({});
    const [panelCountDraft, setPanelCountDraft] = useState('1');
    const [panelAutoAssignOnlyUnassigned, setPanelAutoAssignOnlyUnassigned] = useState(false);
    const [panelEmailSubject, setPanelEmailSubject] = useState('');
    const [panelEmailHtml, setPanelEmailHtml] = useState('');
    const [panelEmailTarget, setPanelEmailTarget] = useState('all');
    const [panelEmailSending, setPanelEmailSending] = useState(false);
    const [activeContentTab, setActiveContentTab] = useState('scoring');
    const [scoreDraftOriginalByEntity, setScoreDraftOriginalByEntity] = useState({});
    const [scoreDirtyByEntity, setScoreDirtyByEntity] = useState({});
    const [unsavedDialogOpen, setUnsavedDialogOpen] = useState(false);
    const [unsavedDialogMessage, setUnsavedDialogMessage] = useState('You have unsaved changes. Continue without saving?');
    const [panelModeDisableConfirmOpen, setPanelModeDisableConfirmOpen] = useState(false);
    const fileInputRef = useRef(null);
    const pendingDiscardActionRef = useRef(null);

    const getErrorMessage = (error, fallback) => normalizeErrorMessage(
        error?.response?.data?.detail ?? error?.response?.data?.message,
        fallback
    );

    const entityMode = eventInfo?.participant_mode === 'team' ? 'team' : 'user';

    const normalizeRow = useCallback((row) => {
        const entityId = row.entity_id ?? row.participant_id ?? row.id;
        return {
            ...row,
            _entityType: row.entity_type || entityMode,
            _entityId: entityId,
            _name: row.participant_name || row.name,
            _code: row.participant_register_number || row.regno_or_code || row.register_number,
            _status: row.participant_status || row.status,
            panel_id: row.panel_id == null ? null : Number(row.panel_id),
            panel_no: row.panel_no == null ? null : Number(row.panel_no),
            panel_name: String(row.panel_name || '').trim() || null,
            is_score_editable_by_current_admin: row.is_score_editable_by_current_admin !== false,
        };
    }, [entityMode]);

    const applyPanelResponse = useCallback((panelResponse, roundData) => {
        const safe = panelResponse && typeof panelResponse === 'object' ? panelResponse : {};
        const safePanels = Array.isArray(safe.panels) ? safe.panels : [];
        const safeMyPanelIds = Array.isArray(safe.my_panel_ids) ? safe.my_panel_ids.map((value) => Number(value)).filter(Number.isFinite) : [];
        const safeConfig = {
            panel_mode_enabled: safe.panel_mode_enabled === true || roundData?.panel_mode_enabled === true,
            panel_team_distribution_mode: safe.panel_team_distribution_mode || roundData?.panel_team_distribution_mode || 'team_count',
            panel_structure_locked: safe.panel_structure_locked === true || roundData?.panel_structure_locked === true,
            current_admin_is_superadmin: safe.current_admin_is_superadmin === true,
            my_panel_ids: safeMyPanelIds,
            available_admins: Array.isArray(safe.available_admins) ? safe.available_admins : [],
            panels: safePanels,
        };
        setPanelConfig(safeConfig);
        setPanelDrafts(safePanels.map((panel, idx) => ({
            ...(() => {
                const parts = toIstDateTimeParts(panel.panel_time);
                return {
                    panel_date_ist: parts.date,
                    panel_time_ist: parts.time,
                };
            })(),
            _draftId: `existing-${panel.id || idx}`,
            id: panel.id || null,
            panel_no: Number(panel.panel_no || idx + 1),
            panel_name: String(panel.panel_name || panel.name || '').trim(),
            panel_link: panel.panel_link || '',
            instructions: panel.instructions || '',
            member_admin_user_ids: Array.isArray(panel.members)
                ? panel.members.map((member) => Number(member.admin_user_id)).filter(Number.isFinite)
                : [],
        })));
        setPanelCountDraft(String(Math.max(1, safePanels.length || 1)));
        setPanelFilter((prev) => {
            const hasMyPanels = !safeConfig.current_admin_is_superadmin && safeMyPanelIds.length > 0;
            const validPanelIds = new Set(safePanels.map((panel) => Number(panel.id)));
            if (!safeConfig.panel_mode_enabled) return 'all';
            if (safeConfig.current_admin_is_superadmin && prev === 'my') return 'all';
            if (prev === 'all' || prev === 'my' || prev === 'unassigned') {
                if (prev === 'all') return hasMyPanels ? 'my' : 'all';
                if (prev === 'my') return hasMyPanels ? 'my' : 'all';
                return prev;
            }
            const parsed = Number(prev);
            if (Number.isFinite(parsed) && validPanelIds.has(parsed)) return prev;
            return hasMyPanels ? 'my' : 'all';
        });
        setPanelEmailTarget((prev) => {
            if (safeConfig.current_admin_is_superadmin) return 'all';
            if (prev === 'my' && safeMyPanelIds.length === 0) return 'all';
            return prev === 'my' ? 'my' : 'all';
        });
    }, []);

    const fetchRoundData = useCallback(async () => {
        setLoading(true);
        try {
            const [roundRes, rowsRes] = await Promise.all([
                axios.get(`${API}/pda-admin/events/${eventSlug}/rounds`, { headers: getAuthHeader() }),
                axios.get(`${API}/pda-admin/events/${eventSlug}/rounds/${roundId}/participants`, {
                    headers: getAuthHeader(),
                }),
            ]);

            const currentRound = (roundRes.data || []).find((item) => Number(item.id) === Number(roundId));
            setRound(currentRound || null);
            const normalizedRows = (rowsRes.data || []).map(normalizeRow);
            setRows(normalizedRows);
            const criteriaForSnapshot = (Array.isArray(currentRound?.evaluation_criteria) && currentRound.evaluation_criteria.length)
                ? currentRound.evaluation_criteria
                : [{ name: 'Score', max_marks: 100 }];
            const initialScoreSnapshot = normalizedRows.reduce((acc, row) => {
                acc[entityKey(row._entityType, row._entityId)] = scoreSnapshotForRow(row, criteriaForSnapshot);
                return acc;
            }, {});
            setScoreDraftOriginalByEntity(initialScoreSnapshot);
            setScoreDirtyByEntity({});
            const assignmentMap = normalizedRows.reduce((acc, row) => {
                acc[entityKey(row._entityType, row._entityId)] = row.panel_id == null ? null : Number(row.panel_id);
                return acc;
            }, {});
            setPanelAssignmentOriginal(assignmentMap);
            setPanelAssignmentDraft(assignmentMap);
            if (currentRound) {
                try {
                    const panelRes = await axios.get(`${API}/pda-admin/events/${eventSlug}/rounds/${roundId}/panels`, {
                        headers: getAuthHeader(),
                    });
                    applyPanelResponse(panelRes.data, currentRound);
                } catch {
                    setPanelConfig({
                        panel_mode_enabled: currentRound?.panel_mode_enabled === true,
                        panel_team_distribution_mode: currentRound?.panel_team_distribution_mode || 'team_count',
                        panel_structure_locked: currentRound?.panel_structure_locked === true,
                        current_admin_is_superadmin: false,
                        my_panel_ids: [],
                        available_admins: [],
                        panels: [],
                    });
                    setPanelDrafts([]);
                    setPanelCountDraft('1');
                }
            } else {
                setPanelConfig({
                    panel_mode_enabled: false,
                    panel_team_distribution_mode: 'team_count',
                    panel_structure_locked: false,
                    current_admin_is_superadmin: false,
                    my_panel_ids: [],
                    available_admins: [],
                    panels: [],
                });
                setPanelDrafts([]);
                setPanelCountDraft('1');
            }
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to load scoring data'));
            setRound(null);
            setRows([]);
            setPanelConfig({
                panel_mode_enabled: false,
                panel_team_distribution_mode: 'team_count',
                panel_structure_locked: false,
                current_admin_is_superadmin: false,
                my_panel_ids: [],
                available_admins: [],
                panels: [],
            });
            setPanelDrafts([]);
            setPanelCountDraft('1');
            setPanelAssignmentOriginal({});
            setPanelAssignmentDraft({});
            setScoreDraftOriginalByEntity({});
            setScoreDirtyByEntity({});
        } finally {
            setLoading(false);
        }
    }, [applyPanelResponse, eventSlug, getAuthHeader, normalizeRow, roundId]);

    useEffect(() => {
        fetchRoundData();
    }, [fetchRoundData]);

    useEffect(() => {
        const onUndoApplied = (event) => {
            if (event?.detail?.eventSlug !== eventSlug) return;
            fetchRoundData();
        };
        window.addEventListener('event-admin-undo-applied', onUndoApplied);
        return () => window.removeEventListener('event-admin-undo-applied', onUndoApplied);
    }, [eventSlug, fetchRoundData]);

    const criteria = useMemo(() => round?.evaluation_criteria || [{ name: 'Score', max_marks: 100 }], [round?.evaluation_criteria]);
    const isRoundActive = String(round?.state || '').trim().toLowerCase() === 'active';
    const isSubmissionRound = Boolean(round?.requires_submission);
    const panelModeEnabled = Boolean(panelConfig.panel_mode_enabled || round?.panel_mode_enabled);
    const panelDistributionMode = panelConfig.panel_team_distribution_mode || round?.panel_team_distribution_mode || 'team_count';
    const isPanelStructureLocked = Boolean(panelConfig.panel_structure_locked || round?.panel_structure_locked);
    const isTeamMode = entityMode === 'team';
    const panelRows = useMemo(() => (Array.isArray(panelConfig.panels) ? panelConfig.panels : []), [panelConfig.panels]);
    const panelById = useMemo(
        () => Object.fromEntries(panelRows.map((panel) => [Number(panel.id), panel])),
        [panelRows]
    );
    const myPanelIdSet = useMemo(
        () => new Set((Array.isArray(panelConfig.my_panel_ids) ? panelConfig.my_panel_ids : []).map((value) => Number(value))),
        [panelConfig.my_panel_ids]
    );
    const shouldShowMyPanelOptions = panelModeEnabled && !panelConfig.current_admin_is_superadmin && myPanelIdSet.size > 0;
    const isScoringTab = activeContentTab === 'scoring';
    const isPanelsTab = activeContentTab === 'panels';
    const dirtyScoreCount = useMemo(
        () => Object.keys(scoreDirtyByEntity || {}).length,
        [scoreDirtyByEntity]
    );
    const criteriaDraftMaxTotal = useMemo(
        () => criteriaDraft.reduce((sum, criterion) => {
            const parsed = Number.parseFloat(criterion.max_marks);
            return sum + (Number.isNaN(parsed) ? 0 : parsed);
        }, 0),
        [criteriaDraft]
    );

    const getTotalScore = useCallback((row) => (
        criteria.reduce((sum, criterion) => {
            const parsed = Number.parseFloat(row.criteria_scores?.[criterion.name]);
            return sum + (Number.isNaN(parsed) ? 0 : parsed);
        }, 0)
    ), [criteria]);

    const roundRankMap = useMemo(() => {
        if (!round?.is_frozen) return {};
        const scored = rows
            .filter((row) => row.is_present)
            .slice()
            .sort((a, b) => Number(b.normalized_score || 0) - Number(a.normalized_score || 0));
        const map = {};
        scored.forEach((row, index) => {
            map[row._entityId] = index + 1;
        });
        return map;
    }, [round?.is_frozen, rows]);

    const displayedRows = useMemo(() => {
        const needle = search.trim().toLowerCase();
        const filtered = rows.filter((row) => {
            if (needle) {
                const haystack = [
                    String(row._name || ''),
                    String(row._code || ''),
                    String(row.email || ''),
                    String(row.department || ''),
                ].join(' ').toLowerCase();
                if (!haystack.includes(needle)) return false;
            }
            if (statusFilter !== 'all') {
                if (statusFilter === 'active' && row._status !== 'Active') return false;
                if (statusFilter === 'eliminated' && row._status !== 'Eliminated') return false;
            }
            if (presenceFilter !== 'all') {
                if (presenceFilter === 'present' && !row.is_present) return false;
                if (presenceFilter === 'absent' && row.is_present) return false;
            }
            if (isSubmissionRound && submissionFilter !== 'all') {
                const hasSubmission = Boolean(row.submission_file_url || row.submission_link_url);
                if (submissionFilter === 'found' && !hasSubmission) return false;
                if (submissionFilter === 'missing' && hasSubmission) return false;
            }
            if (panelModeEnabled) {
                if (panelFilter === 'my' && !panelConfig.current_admin_is_superadmin) {
                    if (row.panel_id == null || !myPanelIdSet.has(Number(row.panel_id))) return false;
                } else if (panelFilter === 'unassigned') {
                    if (row.panel_id != null) return false;
                } else if (panelFilter !== 'all') {
                    const selectedPanelId = Number(panelFilter);
                    if (Number.isFinite(selectedPanelId) && Number(row.panel_id) !== selectedPanelId) return false;
                }
            }
            return true;
        });

        return filtered.sort((a, b) => {
            const regA = String(a._code || '');
            const regB = String(b._code || '');
            const nameA = String(a._name || '');
            const nameB = String(b._name || '');
            const scoreA = panelModeEnabled ? Number(a.normalized_score || 0) : getTotalScore(a);
            const scoreB = panelModeEnabled ? Number(b.normalized_score || 0) : getTotalScore(b);
            const rankA = Number(roundRankMap[a._entityId] || Number.MAX_SAFE_INTEGER);
            const rankB = Number(roundRankMap[b._entityId] || Number.MAX_SAFE_INTEGER);

            switch (sortBy) {
                case 'register_desc':
                    return regB.localeCompare(regA, undefined, { numeric: true, sensitivity: 'base' });
                case 'name_asc':
                    return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
                case 'name_desc':
                    return nameB.localeCompare(nameA, undefined, { sensitivity: 'base' });
                case 'score_desc':
                    return scoreB - scoreA;
                case 'score_asc':
                    return scoreA - scoreB;
                case 'rank_asc':
                    return rankA - rankB;
                case 'register_asc':
                default:
                    return regA.localeCompare(regB, undefined, { numeric: true, sensitivity: 'base' });
            }
        });
    }, [getTotalScore, isSubmissionRound, myPanelIdSet, panelConfig.current_admin_is_superadmin, panelFilter, panelModeEnabled, presenceFilter, roundRankMap, rows, search, sortBy, statusFilter, submissionFilter]);

    const totalRows = displayedRows.length;
    const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
    const pageStart = totalRows ? ((currentPage - 1) * pageSize + 1) : 0;
    const pageEnd = Math.min((currentPage - 1) * pageSize + pageSize, totalRows);
    const pagedRows = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return displayedRows.slice(start, start + pageSize);
    }, [currentPage, displayedRows, pageSize]);

    useEffect(() => {
        setCurrentPage(1);
    }, [search, statusFilter, presenceFilter, submissionFilter, panelFilter, sortBy, pageSize]);

    useEffect(() => {
        if (!isSubmissionRound && submissionFilter !== 'all') {
            setSubmissionFilter('all');
        }
    }, [isSubmissionRound, submissionFilter]);

    useEffect(() => {
        if (currentPage > totalPages) {
            setCurrentPage(totalPages);
        }
    }, [currentPage, totalPages]);

    const dirtyPanelAssignmentCount = useMemo(() => {
        const keys = new Set([
            ...Object.keys(panelAssignmentOriginal || {}),
            ...Object.keys(panelAssignmentDraft || {}),
        ]);
        let count = 0;
        for (const key of keys) {
            const original = panelAssignmentOriginal?.[key] == null ? null : Number(panelAssignmentOriginal[key]);
            const draft = panelAssignmentDraft?.[key] == null ? null : Number(panelAssignmentDraft[key]);
            if (original !== draft) count += 1;
        }
        return count;
    }, [panelAssignmentDraft, panelAssignmentOriginal]);
    const panelDefinitionBaseline = useMemo(
        () => panelRows.map((panel, idx) => normalizePanelDefinition({
            id: panel.id || null,
            panel_no: panel.panel_no,
            panel_name: panel.panel_name || panel.name || '',
            panel_link: panel.panel_link || '',
            panel_time: panel.panel_time || null,
            instructions: panel.instructions || '',
            member_admin_user_ids: Array.isArray(panel.members)
                ? panel.members.map((member) => Number(member.admin_user_id))
                : [],
        }, idx + 1)),
        [panelRows]
    );
    const panelDefinitionDraftBuild = useMemo(
        () => buildPanelDefinitionPayloadFromDrafts(panelDrafts),
        [panelDrafts]
    );
    const panelDefinitionDraftComparable = useMemo(
        () => panelDefinitionDraftBuild.normalized.map((panel, idx) => normalizePanelDefinition({
            ...panel,
            id: panel.id || null,
        }, idx + 1)),
        [panelDefinitionDraftBuild.normalized]
    );
    const hasPanelDefinitionChanges = useMemo(
        () => JSON.stringify(panelDefinitionDraftComparable) !== JSON.stringify(panelDefinitionBaseline),
        [panelDefinitionBaseline, panelDefinitionDraftComparable]
    );
    const dirtyPanelDefinitionCount = hasPanelDefinitionChanges ? 1 : 0;
    const hasPanelAssignmentChanges = dirtyPanelAssignmentCount > 0;
    const hasUnsavedChanges = dirtyScoreCount > 0 || dirtyPanelAssignmentCount > 0 || dirtyPanelDefinitionCount > 0;
    const totalDirtyCount = dirtyScoreCount + dirtyPanelAssignmentCount + dirtyPanelDefinitionCount;
    const unsavedSummaryText = useMemo(() => {
        const parts = [];
        if (dirtyScoreCount > 0) parts.push(`${dirtyScoreCount} score entr${dirtyScoreCount === 1 ? 'y' : 'ies'}`);
        if (dirtyPanelDefinitionCount > 0) parts.push('panel definitions');
        if (dirtyPanelAssignmentCount > 0) parts.push(`${dirtyPanelAssignmentCount} panel assignment${dirtyPanelAssignmentCount === 1 ? '' : 's'}`);
        return parts.join(' and ');
    }, [dirtyPanelAssignmentCount, dirtyPanelDefinitionCount, dirtyScoreCount]);

    const handlePageSizeChange = (value) => {
        const nextSize = Number.parseInt(value, 10);
        if (!SCORING_PAGE_SIZE_OPTIONS.includes(nextSize)) return;
        setPageSize(nextSize);
        setCurrentPage(1);
        if (typeof window !== 'undefined') {
            window.localStorage.setItem(SCORING_PAGE_SIZE_KEY, String(nextSize));
        }
    };

    const canEditScoreRow = useCallback((row) => {
        if (!row) return false;
        if (round?.is_frozen) return false;
        return true;
    }, [round?.is_frozen]);

    const markScoreRowDirtyState = useCallback((entityType, entityId, nextRow) => {
        const key = entityKey(entityType, entityId);
        const nextSnapshot = scoreSnapshotForRow(nextRow, criteria);
        const originalSnapshot = scoreDraftOriginalByEntity?.[key] ?? null;
        setScoreDirtyByEntity((prev) => {
            const next = { ...(prev || {}) };
            if (nextSnapshot === originalSnapshot) {
                delete next[key];
            } else {
                next[key] = true;
            }
            return next;
        });
    }, [criteria, scoreDraftOriginalByEntity]);

    const updateRowScoreDraft = useCallback((entityType, entityId, updater) => {
        const previousRows = rows;
        const previousDirtyMap = scoreDirtyByEntity;
        let nextRow = null;
        setRows((prev) => prev.map((row) => {
            if (row._entityId !== entityId || row._entityType !== entityType) return row;
            const updated = updater(row);
            nextRow = updated;
            return updated;
        }));
        if (nextRow) {
            markScoreRowDirtyState(entityType, entityId, nextRow);
            pushLocalUndo({
                label: 'Undo score draft edit',
                undoFn: () => {
                    setRows(previousRows);
                    setScoreDirtyByEntity(previousDirtyMap);
                },
            });
        }
    }, [markScoreRowDirtyState, pushLocalUndo, rows, scoreDirtyByEntity]);

    const handlePresenceChange = useCallback((entityType, entityId, isPresent) => {
        const present = isPresent === true;
        updateRowScoreDraft(entityType, entityId, (row) => {
            if (!canEditScoreRow(row)) return row;
            if (!present) {
                const zeroed = Object.fromEntries(criteria.map((criterion) => [criterion.name, 0]));
                return { ...row, is_present: false, criteria_scores: zeroed };
            }
            return { ...row, is_present: true };
        });
    }, [canEditScoreRow, criteria, updateRowScoreDraft]);

    const handleScoreChange = useCallback((entityType, entityId, criteriaName, value) => {
        if (!/^$|^\d*\.?\d*$/.test(value)) return;
        updateRowScoreDraft(entityType, entityId, (row) => {
            if (!canEditScoreRow(row)) return row;
            return {
                ...row,
                criteria_scores: { ...row.criteria_scores, [criteriaName]: value },
            };
        });
    }, [canEditScoreRow, updateRowScoreDraft]);

    const handleScoreBlur = useCallback((entityType, entityId, criteriaName) => {
        const maxMarks = Number(criteria.find((criterion) => criterion.name === criteriaName)?.max_marks ?? 100);
        updateRowScoreDraft(entityType, entityId, (row) => {
            if (!canEditScoreRow(row)) return row;
            const parsed = Number.parseFloat(row.criteria_scores?.[criteriaName]);
            const clamped = Number.isNaN(parsed) ? 0 : Math.min(Math.max(parsed, 0), maxMarks);
            return {
                ...row,
                criteria_scores: { ...row.criteria_scores, [criteriaName]: clamped },
            };
        });
    }, [canEditScoreRow, criteria, updateRowScoreDraft]);

    useEffect(() => {
        if (!hasUnsavedChanges) return undefined;
        const handleBeforeUnload = (event) => {
            event.preventDefault();
            event.returnValue = '';
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [hasUnsavedChanges]);

    const runWithUnsavedGuard = useCallback((action, message = 'You have unsaved changes. Continue without saving?') => {
        if (!hasUnsavedChanges) {
            action();
            return;
        }
        pendingDiscardActionRef.current = action;
        setUnsavedDialogMessage(message);
        setUnsavedDialogOpen(true);
    }, [hasUnsavedChanges]);

    const closeUnsavedDialog = useCallback(() => {
        pendingDiscardActionRef.current = null;
        setUnsavedDialogOpen(false);
    }, []);

    const confirmDiscardAndContinue = useCallback(() => {
        const action = pendingDiscardActionRef.current;
        pendingDiscardActionRef.current = null;
        setUnsavedDialogOpen(false);
        if (typeof action === 'function') {
            action();
        }
    }, []);

    const updateRoundPanelMode = async (enabled) => {
        const previousValue = Boolean(panelModeEnabled);
        setPanelModeSaving(true);
        try {
            await axios.put(`${API}/pda-admin/events/${eventSlug}/rounds/${roundId}`, {
                panel_mode_enabled: Boolean(enabled),
            }, { headers: getAuthHeader() });
            pushSavedUndo({
                label: 'Undo panel mode change',
                command: {
                    type: 'round_patch_restore',
                    round_id: Number(roundId),
                    payload: {
                        panel_mode_enabled: previousValue,
                    },
                },
            });
            toast.success(`Panel mode ${enabled ? 'enabled' : 'disabled'}`);
            await fetchRoundData();
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to update panel mode'));
        } finally {
            setPanelModeSaving(false);
        }
    };

    const updateRoundPanelDistributionMode = async (nextMode) => {
        const previousValue = String(panelDistributionMode || 'team_count');
        setPanelModeSaving(true);
        try {
            await axios.put(`${API}/pda-admin/events/${eventSlug}/rounds/${roundId}`, {
                panel_team_distribution_mode: nextMode,
            }, { headers: getAuthHeader() });
            pushSavedUndo({
                label: 'Undo panel distribution mode change',
                command: {
                    type: 'round_patch_restore',
                    round_id: Number(roundId),
                    payload: {
                        panel_team_distribution_mode: previousValue,
                    },
                },
            });
            toast.success('Team distribution mode updated');
            await fetchRoundData();
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to update team distribution mode'));
        } finally {
            setPanelModeSaving(false);
        }
    };

    const updateRoundPanelStructureLock = async (locked) => {
        const previousValue = Boolean(isPanelStructureLocked);
        setPanelModeSaving(true);
        try {
            await axios.put(`${API}/pda-admin/events/${eventSlug}/rounds/${roundId}`, {
                panel_structure_locked: Boolean(locked),
            }, { headers: getAuthHeader() });
            pushSavedUndo({
                label: 'Undo panel lock change',
                command: {
                    type: 'round_patch_restore',
                    round_id: Number(roundId),
                    payload: {
                        panel_structure_locked: previousValue,
                    },
                },
            });
            toast.success(`Panels ${locked ? 'locked' : 'unlocked'}`);
            await fetchRoundData();
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to update panel lock'));
        } finally {
            setPanelModeSaving(false);
        }
    };

    const requestPanelModeChange = (enabled) => {
        if (enabled) {
            runWithUnsavedGuard(
                () => { updateRoundPanelMode(true); },
                'Changing panel mode will refresh round data. Continue without saving pending changes?'
            );
            return;
        }
        runWithUnsavedGuard(
            () => { setPanelModeDisableConfirmOpen(true); },
            'Changing panel mode will refresh round data. Continue without saving pending changes?'
        );
    };

    const addPanelDraft = () => {
        const previous = panelDrafts;
        const maxNo = panelDrafts.length ? Math.max(...panelDrafts.map((panel) => Number(panel.panel_no || 0))) : 0;
        setPanelDrafts((prev) => [...prev, createPanelDraft(Math.max(1, maxNo + 1))]);
        pushLocalUndo({
            label: 'Undo add panel draft',
            undoFn: () => setPanelDrafts(previous),
        });
    };

    const removePanelDraft = (draftId) => {
        const previous = panelDrafts;
        setPanelDrafts((prev) => prev.filter((panel) => panel._draftId !== draftId));
        pushLocalUndo({
            label: 'Undo remove panel draft',
            undoFn: () => setPanelDrafts(previous),
        });
    };

    const updatePanelDraftField = (draftId, field, value) => {
        const previous = panelDrafts;
        setPanelDrafts((prev) => prev.map((panel) => {
            if (panel._draftId !== draftId) return panel;
            return { ...panel, [field]: value };
        }));
        pushLocalUndo({
            label: 'Undo panel draft edit',
            undoFn: () => setPanelDrafts(previous),
        });
    };

    const togglePanelMember = (draftId, adminUserId, checked) => {
        const previous = panelDrafts;
        setPanelDrafts((prev) => prev.map((panel) => {
            if (panel._draftId !== draftId) return panel;
            const current = new Set((panel.member_admin_user_ids || []).map((value) => Number(value)));
            if (checked === true) {
                current.add(Number(adminUserId));
            } else {
                current.delete(Number(adminUserId));
            }
            return {
                ...panel,
                member_admin_user_ids: Array.from(current.values()).sort((a, b) => a - b),
            };
        }));
        pushLocalUndo({
            label: 'Undo panel member edit',
            undoFn: () => setPanelDrafts(previous),
        });
    };

    const generatePanelDraftsFromCount = () => {
        const parsedCount = Number.parseInt(panelCountDraft, 10);
        if (!Number.isFinite(parsedCount) || parsedCount <= 0 || parsedCount > 100) {
            toast.error('Panel count must be between 1 and 100');
            return;
        }
        const previous = panelDrafts;
        setPanelDrafts(Array.from({ length: parsedCount }, (_, idx) => createPanelDraft(idx + 1)));
        pushLocalUndo({
            label: 'Undo generate panels',
            undoFn: () => setPanelDrafts(previous),
        });
    };

    const savePanelDefinitions = async (options = {}) => {
        const {
            suppressNoChangesToast = false,
            suppressSuccessToast = false,
        } = options;
        if (!hasPanelDefinitionChanges) {
            if (!suppressNoChangesToast) {
                toast.error('No panel definition changes to save');
            }
            return { saved: false, count: 0 };
        }
        const previousPanelDefinitions = panelDefinitionBaseline.map((panel) => ({
            ...panel,
            id: panel.id || undefined,
        }));
        if (panelDefinitionDraftBuild.errors.length) {
            toast.error(panelDefinitionDraftBuild.errors[0]);
            return { saved: false, count: 0 };
        }
        const normalized = panelDefinitionDraftBuild.normalized;
        setPanelSaving(true);
        try {
            const response = await axios.put(`${API}/pda-admin/events/${eventSlug}/rounds/${roundId}/panels`, {
                panels: normalized,
            }, { headers: getAuthHeader() });
            applyPanelResponse(response.data, round);
            pushSavedUndo({
                label: 'Undo panel definition save',
                command: {
                    type: 'panel_definitions_restore',
                    round_id: Number(roundId),
                    panels: previousPanelDefinitions,
                },
            });
            if (!suppressSuccessToast) {
                toast.success('Panel definitions saved');
            }
            return { saved: true, count: normalized.length };
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to save panel definitions'));
            return { saved: false, count: 0 };
        } finally {
            setPanelSaving(false);
        }
    };

    const autoAssignPanels = async () => {
        setPanelAutoAssigning(true);
        try {
            const response = await axios.post(`${API}/pda-admin/events/${eventSlug}/rounds/${roundId}/panels/auto-assign`, {
                include_unassigned_only: Boolean(panelAutoAssignOnlyUnassigned),
            }, { headers: getAuthHeader() });
            const assignedCount = Number(response.data?.assigned_count || 0);
            toast.success(`Auto-assigned ${assignedCount} entr${assignedCount === 1 ? 'y' : 'ies'}`);
            await fetchRoundData();
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to auto-assign panels'));
        } finally {
            setPanelAutoAssigning(false);
        }
    };

    const handlePanelAssignmentChange = (row, nextPanelIdRaw) => {
        const previousDraft = { ...(panelAssignmentDraft || {}) };
        const previousRows = rows;
        const nextPanelId = nextPanelIdRaw === 'unassigned' ? null : Number(nextPanelIdRaw);
        const key = entityKey(row._entityType, row._entityId);
        const selectedPanel = nextPanelId == null ? null : panelById[nextPanelId];
        setPanelAssignmentDraft((prev) => ({ ...prev, [key]: nextPanelId }));
        setRows((prev) => prev.map((item) => {
            if (item._entityType !== row._entityType || item._entityId !== row._entityId) return item;
            return {
                ...item,
                panel_id: nextPanelId,
                panel_no: selectedPanel?.panel_no == null ? null : Number(selectedPanel.panel_no),
                panel_name: selectedPanel?.panel_name || selectedPanel?.name || null,
            };
        }));
        pushLocalUndo({
            label: 'Undo panel assignment draft edit',
            undoFn: () => {
                setPanelAssignmentDraft(previousDraft);
                setRows(previousRows);
            },
        });
    };

    const savePanelAssignments = async (options = {}) => {
        const {
            suppressNoChangesToast = false,
            suppressSuccessToast = false,
            skipRefresh = true,
        } = options;
        const changed = rows.reduce((acc, row) => {
            const key = entityKey(row._entityType, row._entityId);
            const original = panelAssignmentOriginal?.[key] == null ? null : Number(panelAssignmentOriginal[key]);
            const draft = panelAssignmentDraft?.[key] == null ? null : Number(panelAssignmentDraft[key]);
            if (original === draft) return acc;
            acc.push({
                entity_type: row._entityType,
                entity_id: Number(row._entityId),
                panel_id: draft,
            });
            return acc;
        }, []);
        if (!changed.length) {
            if (!suppressNoChangesToast) {
                toast.error('No panel assignment changes to save');
            }
            return { saved: false, count: 0 };
        }
        setPanelAssignmentSaving(true);
        try {
            await axios.put(`${API}/pda-admin/events/${eventSlug}/rounds/${roundId}/panels/assignments`, {
                assignments: changed,
            }, { headers: getAuthHeader() });
            const restoreAssignments = changed.map((item) => {
                const key = entityKey(item.entity_type, item.entity_id);
                const originalPanelId = panelAssignmentOriginal?.[key] == null ? null : Number(panelAssignmentOriginal[key]);
                return {
                    entity_type: item.entity_type,
                    entity_id: item.entity_id,
                    panel_id: originalPanelId,
                };
            });
            pushSavedUndo({
                label: 'Undo panel assignment save',
                command: {
                    type: 'panel_assignments_restore',
                    round_id: Number(roundId),
                    assignments: restoreAssignments,
                },
            });
            if (!suppressSuccessToast) {
                toast.success('Panel assignments updated');
            }
            if (skipRefresh) {
                setPanelAssignmentOriginal((prev) => {
                    const next = { ...(prev || {}) };
                    changed.forEach((item) => {
                        const key = entityKey(item.entity_type, item.entity_id);
                        next[key] = item.panel_id == null ? null : Number(item.panel_id);
                    });
                    return next;
                });
            } else {
                await fetchRoundData();
            }
            return { saved: true, count: changed.length };
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to save panel assignments'));
            return { saved: false, count: 0 };
        } finally {
            setPanelAssignmentSaving(false);
        }
    };

    const sendPanelEmails = async () => {
        if (!panelEmailSubject.trim() || !panelEmailHtml.trim()) {
            toast.error('Panel email subject and HTML are required');
            return;
        }
        setPanelEmailSending(true);
        try {
            const payload = {
                subject: panelEmailSubject.trim(),
                html: panelEmailHtml,
            };
            if (panelEmailTarget === 'my') {
                payload.panel_ids = Array.from(myPanelIdSet.values());
            }
            const response = await axios.post(`${API}/pda-admin/events/${eventSlug}/rounds/${roundId}/panels/email`, payload, {
                headers: getAuthHeader(),
            });
            const queued = Number(response.data?.queued || 0);
            toast.success(`Queued panel emails for ${queued} recipient${queued === 1 ? '' : 's'}`);
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to queue panel emails'));
        } finally {
            setPanelEmailSending(false);
        }
    };

    const saveScores = async (options = {}) => {
        const {
            suppressNoChangesToast = false,
            suppressSuccessToast = false,
        } = options;
        setSaving(true);
        try {
            const maxByCriteria = Object.fromEntries(criteria.map((criterion) => [criterion.name, Number(criterion.max_marks || 0)]));
            const dirtySet = new Set(Object.keys(scoreDirtyByEntity || {}));
            const sourceRows = rows.filter((row) => dirtySet.has(entityKey(row._entityType, row._entityId)));
            if (!sourceRows.length) {
                if (!suppressNoChangesToast) {
                    toast.error('No unsaved score changes');
                }
                return { saved: false, count: 0 };
            }
            const payload = sourceRows.map((row) => ({
                entity_type: row._entityType,
                user_id: row._entityType === 'user' ? row._entityId : null,
                team_id: row._entityType === 'team' ? row._entityId : null,
                criteria_scores: Object.keys(maxByCriteria).reduce((acc, criteriaName) => {
                    const max = maxByCriteria[criteriaName];
                    const parsed = Number.parseFloat(row.criteria_scores?.[criteriaName]);
                    const safe = Number.isNaN(parsed) ? 0 : Math.min(Math.max(parsed, 0), max);
                    acc[criteriaName] = safe;
                    return acc;
                }, {}),
                is_present: Boolean(row.is_present),
            }));
            const restoreEntries = sourceRows.map((row) => {
                const key = entityKey(row._entityType, row._entityId);
                const originalSnapshot = scoreDraftOriginalByEntity?.[key];
                const parsedOriginal = parseScoreSnapshot(originalSnapshot, criteria);
                return {
                    entity_type: row._entityType,
                    entity_id: Number(row._entityId),
                    is_present: Boolean(parsedOriginal.is_present),
                    criteria_scores: parsedOriginal.criteria_scores,
                };
            });

            await axios.post(`${API}/pda-admin/events/${eventSlug}/rounds/${roundId}/scores`, payload, {
                headers: getAuthHeader(),
            });
            pushSavedUndo({
                label: 'Undo score save',
                command: {
                    type: 'scores_restore',
                    round_id: Number(roundId),
                    entries: restoreEntries,
                },
            });
            if (!suppressSuccessToast) {
                toast.success('Scores saved successfully');
            }
            setScoreDraftOriginalByEntity((prev) => {
                const next = { ...(prev || {}) };
                sourceRows.forEach((row) => {
                    next[entityKey(row._entityType, row._entityId)] = scoreSnapshotForRow(row, criteria);
                });
                return next;
            });
            setScoreDirtyByEntity((prev) => {
                const next = { ...(prev || {}) };
                sourceRows.forEach((row) => {
                    delete next[entityKey(row._entityType, row._entityId)];
                });
                return next;
            });
            return { saved: true, count: sourceRows.length };
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to save scores'));
            return { saved: false, count: 0 };
        } finally {
            setSaving(false);
        }
    };

    const saveAllChanges = async () => {
        if (!hasUnsavedChanges) {
            toast.error('No unsaved changes');
            return;
        }
        const panelDefinitionResult = hasPanelDefinitionChanges
            ? await savePanelDefinitions({ suppressNoChangesToast: true, suppressSuccessToast: true })
            : { saved: false, count: 0 };
        if (hasPanelDefinitionChanges && !panelDefinitionResult.saved) {
            return;
        }
        const scoreResult = dirtyScoreCount > 0
            ? await saveScores({ suppressNoChangesToast: true, suppressSuccessToast: true })
            : { saved: false, count: 0 };
        const panelResult = hasPanelAssignmentChanges
            ? await savePanelAssignments({ suppressNoChangesToast: true, suppressSuccessToast: true, skipRefresh: true })
            : { saved: false, count: 0 };

        if (panelDefinitionResult.saved || scoreResult.saved || panelResult.saved) {
            const parts = [];
            if (panelDefinitionResult.saved) parts.push('panel definitions');
            if (scoreResult.saved) parts.push(`${scoreResult.count} score entr${scoreResult.count === 1 ? 'y' : 'ies'}`);
            if (panelResult.saved) parts.push(`${panelResult.count} panel assignment${panelResult.count === 1 ? '' : 's'}`);
            toast.success(`Saved ${parts.join(' and ')}`);
            return;
        }
        toast.error('No unsaved changes');
    };

    const downloadTemplate = async () => {
        try {
            const response = await axios.get(`${API}/pda-admin/events/${eventSlug}/rounds/${roundId}/score-template`, {
                headers: getAuthHeader(),
                responseType: 'blob',
            });
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `${round?.round_no || 'round'}_score_template.xlsx`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
            toast.success('Template downloaded');
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to download template'));
        }
    };

    const handleFileUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setImporting(true);
        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await axios.post(`${API}/pda-admin/events/${eventSlug}/rounds/${roundId}/import-scores`, formData, {
                headers: { ...getAuthHeader(), 'Content-Type': 'multipart/form-data' },
                params: { preview: true },
            });
            setImportPreview(response.data || null);
            setPendingImportFile(file);
            setImportPreviewOpen(true);
            toast.success('Import preview ready');
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to validate import file'));
        } finally {
            setImporting(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const closeImportPreview = () => {
        if (confirmingImport) return;
        setImportPreviewOpen(false);
        setImportPreview(null);
        setPendingImportFile(null);
    };

    const confirmImportUpdate = async () => {
        if (!pendingImportFile) return;
        setConfirmingImport(true);
        const formData = new FormData();
        formData.append('file', pendingImportFile);
        try {
            const response = await axios.post(`${API}/pda-admin/events/${eventSlug}/rounds/${roundId}/import-scores`, formData, {
                headers: { ...getAuthHeader(), 'Content-Type': 'multipart/form-data' },
            });
            const imported = Number(response.data?.imported || 0);
            const totalRows = Number(response.data?.total_rows || 0);
            const skipped = Math.max(totalRows - imported, 0);
            toast.success(`Imported ${imported} row${imported === 1 ? '' : 's'}`);
            if (skipped > 0) {
                toast.error(`Skipped ${skipped} row${skipped === 1 ? '' : 's'} due to validation issues`);
            }
            if (Array.isArray(response.data?.errors) && response.data.errors.length > 0) {
                response.data.errors.slice(0, 5).forEach((msg) => toast.error(msg));
            }
            setImportPreviewOpen(false);
            setImportPreview(null);
            setPendingImportFile(null);
            fetchRoundData();
        } catch (error) {
            toast.error(getErrorMessage(error, 'Import failed'));
        } finally {
            setConfirmingImport(false);
        }
    };

    const exportRoundEvaluation = async () => {
        if (exportingRound || exportingPanelWise) return;
        setExportingRound(true);
        try {
            const response = await axios.get(`${API}/pda-admin/events/${eventSlug}/export/round/${roundId}?format=xlsx`, {
                headers: getAuthHeader(),
                responseType: 'blob',
            });
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `${round?.round_no || 'round'}_evaluation.xlsx`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
            toast.success('Round evaluation exported');
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to export round evaluation'));
        } finally {
            setExportingRound(false);
        }
    };

    const exportRoundEvaluationPanelWise = async () => {
        if (exportingRound || exportingPanelWise) return;
        setExportingPanelWise(true);
        try {
            const response = await axios.get(`${API}/pda-admin/events/${eventSlug}/export/round/${roundId}/panel-wise?format=xlsx`, {
                headers: getAuthHeader(),
                responseType: 'blob',
            });
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `${round?.round_no || 'round'}_evaluation_panel_wise.xlsx`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
            toast.success('Panel-wise evaluation exported');
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to export panel-wise evaluation'));
        } finally {
            setExportingPanelWise(false);
        }
    };

    const freezeRound = async () => {
        try {
            await axios.post(`${API}/pda-admin/events/${eventSlug}/rounds/${roundId}/freeze`, {}, { headers: getAuthHeader() });
            pushSavedUndo({
                label: 'Undo freeze round',
                command: {
                    type: 'round_freeze_restore',
                    round_id: Number(roundId),
                    is_frozen: false,
                },
            });
            toast.success('Round frozen');
            setFreezeDialogOpen(false);
            fetchRoundData();
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to freeze round'));
        }
    };

    const unfreezeRound = async () => {
        try {
            await axios.post(`${API}/pda-admin/events/${eventSlug}/rounds/${roundId}/unfreeze`, {}, { headers: getAuthHeader() });
            pushSavedUndo({
                label: 'Undo unfreeze round',
                command: {
                    type: 'round_freeze_restore',
                    round_id: Number(roundId),
                    is_frozen: true,
                },
            });
            toast.success('Round unfrozen');
            fetchRoundData();
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to unfreeze round'));
        }
    };

    const openCriteriaEditor = () => {
        const base = (round?.evaluation_criteria && round.evaluation_criteria.length > 0)
            ? round.evaluation_criteria
            : [{ name: 'Score', max_marks: 100 }];
        setCriteriaDraft(base.map((criterion) => createCriterionDraft(criterion.name || '', criterion.max_marks || 0)));
        setCriteriaDialogOpen(true);
    };

    const closeCriteriaEditor = () => {
        if (savingCriteria) return;
        setCriteriaDialogOpen(false);
        setCriteriaDraft([]);
    };

    const saveCriteria = async () => {
        if (savingCriteria) return;
        const normalized = criteriaDraft.map((criterion) => ({
            name: String(criterion.name || '').trim(),
            max_marks: Number.parseFloat(criterion.max_marks),
        }));

        if (!normalized.length) {
            toast.error('Add at least one evaluation criterion');
            return;
        }

        if (normalized.some((criterion) => !criterion.name)) {
            toast.error('Criterion name is required');
            return;
        }

        const names = normalized.map((criterion) => criterion.name.toLowerCase());
        if (new Set(names).size !== names.length) {
            toast.error('Criterion names must be unique');
            return;
        }

        if (normalized.some((criterion) => Number.isNaN(criterion.max_marks) || !Number.isFinite(criterion.max_marks) || criterion.max_marks <= 0)) {
            toast.error('Max marks must be a number greater than 0');
            return;
        }

        setSavingCriteria(true);
        try {
            await axios.put(`${API}/pda-admin/events/${eventSlug}/rounds/${roundId}`, {
                evaluation_criteria: normalized,
            }, { headers: getAuthHeader() });
            toast.success('Evaluation criteria updated');
            setCriteriaDialogOpen(false);
            setCriteriaDraft([]);
            fetchRoundData();
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to update criteria'));
        } finally {
            setSavingCriteria(false);
        }
    };

    const previewData = importPreview && typeof importPreview === 'object' ? importPreview : {};
    const previewIdentifiedRows = Array.isArray(previewData.identified_rows) ? previewData.identified_rows : [];
    const previewMismatchedRows = Array.isArray(previewData.mismatched_rows) ? previewData.mismatched_rows : [];
    const previewUnidentifiedRows = Array.isArray(previewData.unidentified_rows) ? previewData.unidentified_rows : [];
    const previewOtherRequiredRows = Array.isArray(previewData.other_required_rows) ? previewData.other_required_rows : [];
    const previewIdentifiedCount = Number(previewData.identified_count || 0);
    const previewMismatchedCount = Number(previewData.mismatched_count || 0);
    const previewUnidentifiedCount = Number(previewData.unidentified_count || 0);
    const previewOtherRequiredCount = Number(previewData.other_required_count || 0);
    const previewReadyCount = Number(previewData.ready_to_import || 0);

    if (loading) {
        return (
            <div className="neo-card text-center py-12">
                <div className="loading-spinner mx-auto"></div>
                <p className="mt-4">Loading...</p>
            </div>
        );
    }

    if (!round) {
        return (
            <div className="neo-card text-center py-12">
                <AlertTriangle className="w-16 h-16 mx-auto mb-4 text-red-500" />
                <h2 className="font-heading font-bold text-xl mb-4">Round Not Found</h2>
                <Button className="bg-primary text-white border-2 border-black shadow-neo" onClick={() => navigate(`/admin/events/${eventSlug}/rounds`)}>
                    <ArrowLeft className="w-4 h-4 mr-2" /> Back
                </Button>
            </div>
        );
    }

    return (
        <>
            <div className="neo-card mb-6">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div className="flex items-center gap-4">
                        <Link
                            to={`/admin/events/${eventSlug}/rounds`}
                            onClick={(event) => {
                                event.preventDefault();
                                runWithUnsavedGuard(
                                    () => navigate(`/admin/events/${eventSlug}/rounds`),
                                    'You have unsaved score, panel definition, or panel assignment changes. Leave this page without saving?'
                                );
                            }}
                        >
                            <Button variant="outline" className="border-2 border-black">
                                <ArrowLeft className="w-4 h-4" />
                            </Button>
                        </Link>
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="bg-primary text-white px-2 py-1 border-2 border-black font-bold text-sm">Round {round.round_no}</span>
                                {round.is_frozen ? (
                                    <span className="bg-orange-100 text-orange-800 px-2 py-1 border-2 border-orange-500 font-bold text-sm flex items-center gap-1">
                                        <Lock className="w-4 h-4" /> Frozen
                                    </span>
                                ) : null}
                            </div>
                            <h1 className="font-heading font-bold text-2xl mt-2">{round.name}</h1>
                            {!isRoundActive ? (
                                <p className="mt-2 text-xs font-semibold text-slate-600">
                                    Attendance can be edited only when round is Active.
                                </p>
                            ) : null}
                            <div className="mt-3 flex items-center gap-3">
                                <Label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">Enable Panel Mode</Label>
                                <Switch
                                    checked={panelModeEnabled}
                                    onCheckedChange={requestPanelModeChange}
                                    disabled={panelModeSaving || round.is_frozen}
                                />
                                <span className="text-xs text-slate-500">
                                    {panelModeEnabled ? 'Scoring permissions are panel-aware.' : 'Classic scoring mode'}
                                </span>
                            </div>
                        </div>
                    </div>

                    {!round.is_frozen ? (
                        <div className="flex flex-wrap gap-2">
                            <Button onClick={openCriteriaEditor} variant="outline" className="border-2 border-black shadow-neo">
                                <Edit2 className="w-4 h-4 mr-2" /> Edit Criteria
                            </Button>
                            <Button onClick={downloadTemplate} variant="outline" className="border-2 border-black shadow-neo">
                                <Download className="w-4 h-4 mr-2" /> Template
                            </Button>
                            <input type="file" ref={fileInputRef} accept=".xlsx" onChange={handleFileUpload} className="hidden" />
                            <Button onClick={() => fileInputRef.current?.click()} disabled={importing || confirmingImport} variant="outline" className="border-2 border-black shadow-neo bg-green-50">
                                <Upload className="w-4 h-4 mr-2" /> {importing ? 'Validating...' : 'Import Excel'}
                            </Button>
                            <Button onClick={saveAllChanges} disabled={saving || panelSaving || panelAssignmentSaving || !totalDirtyCount} className="bg-primary text-white border-2 border-black shadow-neo">
                                <Save className="w-4 h-4 mr-2" /> {(saving || panelSaving || panelAssignmentSaving) ? 'Saving...' : `Save${totalDirtyCount ? ` (${totalDirtyCount})` : ''}`}
                            </Button>
                            {panelModeEnabled ? (
                                <>
                                    <Button onClick={exportRoundEvaluation} disabled={exportingRound || exportingPanelWise} variant="outline" className="border-2 border-black shadow-neo">
                                        <Download className="w-4 h-4 mr-2" /> {exportingRound ? 'Exporting...' : 'Export Excel'}
                                    </Button>
                                    <Button onClick={exportRoundEvaluationPanelWise} disabled={exportingRound || exportingPanelWise} variant="outline" className="border-2 border-black shadow-neo">
                                        <Download className="w-4 h-4 mr-2" /> {exportingPanelWise ? 'Exporting...' : 'Export Panel-wise'}
                                    </Button>
                                </>
                            ) : null}
                            <Dialog open={freezeDialogOpen} onOpenChange={setFreezeDialogOpen}>
                                <DialogTrigger asChild>
                                    <Button className="bg-orange-500 text-white border-2 border-black shadow-neo">
                                        <Lock className="w-4 h-4 mr-2" /> Freeze
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="border-4 border-black w-[calc(100vw-2rem)] sm:w-full max-h-[85vh] overflow-y-auto">
                                    <DialogHeader>
                                        <DialogTitle className="font-heading font-bold text-xl flex items-center gap-2">
                                            <AlertTriangle className="w-6 h-6 text-orange-500" /> Freeze Round
                                        </DialogTitle>
                                    </DialogHeader>
                                    <div className="space-y-4">
                                        <p className="text-gray-600">
                                            This action freezes scores for this round. Shortlisting is handled from the leaderboard.
                                        </p>
                                        <div className="flex gap-2">
                                            <Button onClick={() => setFreezeDialogOpen(false)} variant="outline" className="flex-1 border-2 border-black">Cancel</Button>
                                            <Button onClick={freezeRound} className="flex-1 bg-orange-500 text-white border-2 border-black">
                                                <Lock className="w-4 h-4 mr-2" /> Confirm
                                            </Button>
                                        </div>
                                    </div>
                                </DialogContent>
                            </Dialog>
                        </div>
                    ) : (
                        <div className="flex flex-wrap gap-2">
                            <Button onClick={exportRoundEvaluation} disabled={exportingRound || exportingPanelWise} variant="outline" className="border-2 border-black shadow-neo">
                                <Download className="w-4 h-4 mr-2" /> {exportingRound ? 'Exporting...' : 'Export Excel'}
                            </Button>
                            {panelModeEnabled ? (
                                <Button onClick={exportRoundEvaluationPanelWise} disabled={exportingRound || exportingPanelWise} variant="outline" className="border-2 border-black shadow-neo">
                                    <Download className="w-4 h-4 mr-2" /> {exportingPanelWise ? 'Exporting...' : 'Export Panel-wise'}
                                </Button>
                            ) : null}
                            <Button onClick={unfreezeRound} className="bg-orange-500 text-white border-2 border-black shadow-neo">
                                <Lock className="w-4 h-4 mr-2" /> Unfreeze
                            </Button>
                        </div>
                    )}
                </div>
            </div>

            <Dialog
                open={criteriaDialogOpen}
                onOpenChange={(open) => {
                    if (!open) {
                        closeCriteriaEditor();
                    } else {
                        setCriteriaDialogOpen(true);
                    }
                }}
            >
                <DialogContent className="border-4 border-black max-w-3xl w-[calc(100vw-2rem)] sm:w-full max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="font-heading font-bold text-xl">Edit Evaluation Criteria</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <p className="text-sm text-gray-600">
                            Update the scoring criteria and maximum marks for this round. Unsaved score edits in the table may be reset after refresh.
                        </p>
                        <div className="space-y-2">
                            {criteriaDraft.map((criterion) => (
                                <div key={criterion.id} className="grid grid-cols-1 sm:grid-cols-[1fr_130px_auto] gap-2 items-end">
                                    <div className="space-y-1">
                                        <Label className="text-xs uppercase tracking-wide text-gray-500">Criterion</Label>
                                        <Input
                                            value={criterion.name}
                                            onChange={(e) => setCriteriaDraft((prev) => prev.map((item) => (
                                                item.id === criterion.id ? { ...item, name: e.target.value } : item
                                            )))}
                                            placeholder="Criteria name"
                                            className="neo-input"
                                            disabled={savingCriteria}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-xs uppercase tracking-wide text-gray-500">Max Marks</Label>
                                        <Input
                                            type="number"
                                            value={criterion.max_marks}
                                            onChange={(e) => setCriteriaDraft((prev) => prev.map((item) => (
                                                item.id === criterion.id ? { ...item, max_marks: e.target.value } : item
                                            )))}
                                            min={0}
                                            step="0.01"
                                            placeholder="100"
                                            className="neo-input"
                                            disabled={savingCriteria}
                                        />
                                    </div>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="border-2 border-black"
                                        onClick={() => setCriteriaDraft((prev) => (prev.length > 1 ? prev.filter((item) => item.id !== criterion.id) : prev))}
                                        disabled={savingCriteria || criteriaDraft.length === 1}
                                    >
                                        <X className="w-4 h-4" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                className="border-2 border-black"
                                onClick={() => setCriteriaDraft((prev) => [...prev, createCriterionDraft('', 0)])}
                                disabled={savingCriteria}
                            >
                                <Plus className="w-4 h-4 mr-2" /> Add Criterion
                            </Button>
                            <p className="text-sm font-semibold text-gray-700">Total Max: {criteriaDraftMaxTotal}</p>
                        </div>
                        <div className="flex gap-2">
                            <Button
                                onClick={closeCriteriaEditor}
                                variant="outline"
                                className="flex-1 border-2 border-black"
                                disabled={savingCriteria}
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={saveCriteria}
                                className="flex-1 bg-primary text-white border-2 border-black"
                                disabled={savingCriteria}
                            >
                                {savingCriteria ? 'Updating...' : 'Update Criteria'}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {!round.is_frozen ? (
                <div className="neo-card mb-6 bg-blue-50 border-blue-500">
                    <div className="flex items-start gap-4">
                        <FileSpreadsheet className="w-8 h-8 text-blue-600 flex-shrink-0" />
                        <div>
                            <h3 className="font-heading font-bold text-lg">Bulk Score Import</h3>
                            <p className="text-gray-600 text-sm">1. Download template → 2. Fill code + scores → 3. Upload Excel → 4. Review & Confirm</p>
                        </div>
                    </div>
                </div>
            ) : null}

            <Dialog
                open={importPreviewOpen}
                onOpenChange={(open) => {
                    if (!open) {
                        closeImportPreview();
                    } else {
                        setImportPreviewOpen(true);
                    }
                }}
            >
                <DialogContent className="border-4 border-black max-w-4xl w-[calc(100vw-2rem)] sm:w-full max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="font-heading font-bold text-xl">Import Preview</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                            <div className="rounded border-2 border-black bg-white p-3">
                                <p className="text-xs uppercase tracking-wide text-gray-500">Rows Identified</p>
                                <p className="text-xl font-bold">{previewIdentifiedCount}</p>
                            </div>
                            <div className="rounded border-2 border-black bg-white p-3">
                                <p className="text-xs uppercase tracking-wide text-gray-500">Mismatched</p>
                                <p className="text-xl font-bold">{previewMismatchedCount}</p>
                            </div>
                            <div className="rounded border-2 border-black bg-white p-3">
                                <p className="text-xs uppercase tracking-wide text-gray-500">Unidentified</p>
                                <p className="text-xl font-bold">{previewUnidentifiedCount}</p>
                            </div>
                            <div className="rounded border-2 border-black bg-white p-3">
                                <p className="text-xs uppercase tracking-wide text-gray-500">Required/Invalid</p>
                                <p className="text-xl font-bold">{previewOtherRequiredCount}</p>
                            </div>
                            <div className="rounded border-2 border-black bg-white p-3">
                                <p className="text-xs uppercase tracking-wide text-gray-500">Ready</p>
                                <p className="text-xl font-bold">{previewReadyCount}</p>
                            </div>
                        </div>

                        {previewIdentifiedRows.length > 0 ? (
                            <div className="rounded border-2 border-black bg-white p-3">
                                <p className="font-semibold mb-2">Identified Rows</p>
                                <div className="max-h-32 overflow-y-auto text-sm space-y-1">
                                    {previewIdentifiedRows.map((item, index) => (
                                        <p key={`identified-${index}`}>
                                            Row {item.row}: {item.identifier} {item.name ? `(${item.name})` : ''}
                                        </p>
                                    ))}
                                </div>
                            </div>
                        ) : null}

                        {previewMismatchedRows.length > 0 ? (
                            <div className="rounded border-2 border-amber-400 bg-amber-50 p-3">
                                <p className="font-semibold mb-2">Mismatched Rows</p>
                                <div className="max-h-32 overflow-y-auto text-sm space-y-1">
                                    {previewMismatchedRows.map((item, index) => (
                                        <p key={`mismatch-${index}`}>
                                            Row {item.row}: {item.identifier} - Provided "{item.provided_name || '—'}", Expected "{item.expected_name || '—'}"
                                        </p>
                                    ))}
                                </div>
                            </div>
                        ) : null}

                        {previewUnidentifiedRows.length > 0 ? (
                            <div className="rounded border-2 border-red-500 bg-red-50 p-3">
                                <p className="font-semibold mb-2">Unidentified Rows</p>
                                <div className="max-h-32 overflow-y-auto text-sm space-y-1">
                                    {previewUnidentifiedRows.map((item, index) => (
                                        <p key={`unidentified-${index}`}>
                                            Row {item.row}: {item.identifier || '—'} - {item.reason}
                                        </p>
                                    ))}
                                </div>
                            </div>
                        ) : null}

                        {previewOtherRequiredRows.length > 0 ? (
                            <div className="rounded border-2 border-red-500 bg-red-50 p-3">
                                <p className="font-semibold mb-2">Required/Invalid Rows</p>
                                <div className="max-h-32 overflow-y-auto text-sm space-y-1">
                                    {previewOtherRequiredRows.map((item, index) => (
                                        <p key={`required-${index}`}>
                                            Row {item.row}: {item.identifier || '—'} - {item.reason}
                                        </p>
                                    ))}
                                </div>
                            </div>
                        ) : null}

                        <div className="flex gap-2">
                            <Button onClick={closeImportPreview} variant="outline" className="flex-1 border-2 border-black" disabled={confirmingImport}>
                                Cancel
                            </Button>
                            <Button
                                onClick={() => warnNonUndoable({
                                    title: 'Import Is Not Undoable',
                                    message: 'This score import updates many rows and cannot be undone from header Undo. Continue?',
                                    proceed: confirmImportUpdate,
                                })}
                                className="flex-1 bg-primary text-white border-2 border-black"
                                disabled={confirmingImport || !pendingImportFile || previewReadyCount <= 0}
                            >
                                {confirmingImport ? 'Updating...' : `Confirm Update (${previewReadyCount})`}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog
                open={unsavedDialogOpen}
                onOpenChange={(open) => {
                    if (!open) {
                        closeUnsavedDialog();
                    } else {
                        setUnsavedDialogOpen(true);
                    }
                }}
            >
                <DialogContent className="border-4 border-black max-w-md w-[calc(100vw-2rem)] sm:w-full max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="font-heading font-bold text-xl flex items-center gap-2">
                            <AlertTriangle className="w-5 h-5 text-orange-500" /> Unsaved Changes
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <p className="text-sm text-slate-700">
                            {unsavedDialogMessage}
                        </p>
                        {unsavedSummaryText ? (
                            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">
                                Pending: {unsavedSummaryText}
                            </p>
                        ) : null}
                        <div className="flex gap-2">
                            <Button type="button" variant="outline" className="flex-1 border-2 border-black" onClick={closeUnsavedDialog}>
                                Stay
                            </Button>
                            <Button type="button" className="flex-1 bg-orange-500 text-white border-2 border-black" onClick={confirmDiscardAndContinue}>
                                Continue
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={panelModeDisableConfirmOpen} onOpenChange={setPanelModeDisableConfirmOpen}>
                <DialogContent className="border-4 border-black max-w-md w-[calc(100vw-2rem)] sm:w-full max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="font-heading font-bold text-xl flex items-center gap-2">
                            <AlertTriangle className="w-5 h-5 text-orange-500" /> Disable Panel Mode
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <p className="text-sm text-slate-700">
                            Turning off panel mode removes panel-based scoring restrictions for this round. Continue?
                        </p>
                        <div className="flex gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                className="flex-1 border-2 border-black"
                                onClick={() => setPanelModeDisableConfirmOpen(false)}
                                disabled={panelModeSaving}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="button"
                                className="flex-1 bg-orange-500 text-white border-2 border-black"
                                onClick={async () => {
                                    setPanelModeDisableConfirmOpen(false);
                                    await updateRoundPanelMode(false);
                                }}
                                disabled={panelModeSaving}
                            >
                                {panelModeSaving ? 'Updating...' : 'Disable'}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            <div className="neo-card mb-6">
                <div className="flex flex-wrap items-center gap-2">
                    <Button
                        type="button"
                        onClick={() => {
                            if (isScoringTab) return;
                            runWithUnsavedGuard(
                                () => { setActiveContentTab('scoring'); },
                                'You have unsaved score, panel definition, or panel assignment changes. Switch tabs without saving?'
                            );
                        }}
                        className={isScoringTab ? 'bg-primary text-white border-2 border-black shadow-neo' : 'border-2 border-black bg-white'}
                        variant={isScoringTab ? 'default' : 'outline'}
                    >
                        Scoring
                    </Button>
                    <Button
                        type="button"
                        onClick={() => {
                            if (isPanelsTab) return;
                            runWithUnsavedGuard(
                                () => { setActiveContentTab('panels'); },
                                'You have unsaved score, panel definition, or panel assignment changes. Switch tabs without saving?'
                            );
                        }}
                        className={isPanelsTab ? 'bg-primary text-white border-2 border-black shadow-neo' : 'border-2 border-black bg-white'}
                        variant={isPanelsTab ? 'default' : 'outline'}
                    >
                        Panels
                    </Button>
                </div>
            </div>

            {isPanelsTab ? (
                panelModeEnabled ? (
                    <div className="neo-card mb-6 bg-amber-50 border-amber-500">
                        <div className="space-y-4">
                            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                <div>
                                    <h3 className="font-heading font-bold text-lg">Panel-Wise Evaluation</h3>
                                    <p className="text-sm text-slate-600">Configure panels, run fair auto-assignment, and manage manual panel mapping.</p>
                                </div>
                                {isTeamMode ? (
                                    <div className="flex items-center gap-2">
                                        <Label className="text-xs uppercase tracking-[0.12em] text-slate-600">Team Distribution</Label>
                                        <Select
                                            value={panelDistributionMode}
                                            onValueChange={(nextMode) => runWithUnsavedGuard(
                                                () => { updateRoundPanelDistributionMode(nextMode); },
                                                'Changing team distribution mode will refresh round data. Continue without saving pending changes?'
                                            )}
                                            disabled={panelModeSaving || round?.is_frozen}
                                        >
                                            <SelectTrigger className="neo-input w-[220px]">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {PANEL_DISTRIBUTION_OPTIONS.map((option) => (
                                                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                ) : null}
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                                <Input
                                    type="number"
                                    min={1}
                                    max={100}
                                    value={panelCountDraft}
                                    onChange={(e) => setPanelCountDraft(e.target.value)}
                                    className="neo-input w-[110px]"
                                    placeholder="Panels"
                                    disabled={panelSaving || panelModeSaving || round?.is_frozen || isPanelStructureLocked}
                                />
                                <Button
                                    type="button"
                                    onClick={generatePanelDraftsFromCount}
                                    variant="outline"
                                    className="border-2 border-black"
                                    disabled={panelSaving || panelModeSaving || round?.is_frozen || isPanelStructureLocked}
                                >
                                    Generate Panels
                                </Button>
                                <Button
                                    type="button"
                                    onClick={addPanelDraft}
                                    variant="outline"
                                    className="border-2 border-black"
                                    disabled={panelSaving || panelModeSaving || round?.is_frozen || isPanelStructureLocked}
                                >
                                    <Plus className="w-4 h-4 mr-2" /> Add Panel
                                </Button>
                                <Button
                                    type="button"
                                    onClick={() => runWithUnsavedGuard(
                                        () => { updateRoundPanelStructureLock(!isPanelStructureLocked); },
                                        'Changing panel lock will refresh round data. Continue without saving pending changes?'
                                    )}
                                    variant="outline"
                                    className="border-2 border-black bg-white"
                                    disabled={panelModeSaving || round?.is_frozen}
                                >
                                    {isPanelStructureLocked ? <LockOpen className="w-4 h-4 mr-2" /> : <Lock className="w-4 h-4 mr-2" />}
                                    {isPanelStructureLocked ? 'Unlock Panels' : 'Lock Panels'}
                                </Button>
                                
                                <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
                                    <Checkbox
                                        checked={panelAutoAssignOnlyUnassigned}
                                        onCheckedChange={(checked) => setPanelAutoAssignOnlyUnassigned(checked === true)}
                                        className="border-2 border-black data-[state=checked]:bg-primary"
                                    />
                                    Auto-assign only unassigned
                                </label>
                                <Button
                                    type="button"
                                    onClick={autoAssignPanels}
                                    variant="outline"
                                    className="border-2 border-black bg-white"
                                    disabled={panelAutoAssigning || round?.is_frozen || panelRows.length === 0}
                                >
                                    <Shuffle className="w-4 h-4 mr-2" /> {panelAutoAssigning ? 'Assigning...' : 'Auto Assign'}
                                </Button>
                                <Button
                                    type="button"
                                    onClick={savePanelAssignments}
                                    variant="outline"
                                    className="border-2 border-black bg-white"
                                    disabled={!hasPanelAssignmentChanges || panelAssignmentSaving || round?.is_frozen}
                                >
                                    <Save className="w-4 h-4 mr-2" /> {panelAssignmentSaving ? 'Saving...' : 'Save Assignment Changes'}
                                </Button>
                            </div>

                            {panelDrafts.length === 0 ? (
                                <p className="text-sm text-slate-600">No panels configured yet.</p>
                            ) : (
                                <div className="space-y-3">
                                    {panelDrafts.map((panel) => (
                                        <div key={panel._draftId} className="rounded border-2 border-black bg-white p-3 space-y-3">
                                            <div className="grid gap-2 md:grid-cols-[100px_1fr_1fr_150px_130px_auto]">
                                                <Input
                                                    type="number"
                                                    min={1}
                                                    value={panel.panel_no}
                                                    readOnly
                                                    className="neo-input bg-slate-100"
                                                    placeholder="No"
                                                    disabled
                                                />
                                                <Input
                                                    value={panel.panel_name}
                                                    onChange={(e) => updatePanelDraftField(panel._draftId, 'panel_name', e.target.value)}
                                                    className="neo-input"
                                                    placeholder="Panel name"
                                                    disabled={panelSaving || round?.is_frozen}
                                                />
                                                <Input
                                                    value={panel.panel_link}
                                                    onChange={(e) => updatePanelDraftField(panel._draftId, 'panel_link', e.target.value)}
                                                    className="neo-input"
                                                    placeholder="Panel link (optional)"
                                                    disabled={panelSaving || round?.is_frozen}
                                                />
                                                <Input
                                                    type="date"
                                                    value={panel.panel_date_ist || ''}
                                                    onChange={(e) => updatePanelDraftField(panel._draftId, 'panel_date_ist', e.target.value)}
                                                    className="neo-input"
                                                    disabled={panelSaving || round?.is_frozen}
                                                />
                                                <Input
                                                    type="time"
                                                    value={panel.panel_time_ist || ''}
                                                    onChange={(e) => updatePanelDraftField(panel._draftId, 'panel_time_ist', e.target.value)}
                                                    className="neo-input"
                                                    disabled={panelSaving || round?.is_frozen}
                                                />
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    className="border-2 border-black"
                                                    onClick={() => removePanelDraft(panel._draftId)}
                                                    disabled={panelSaving || round?.is_frozen || isPanelStructureLocked}
                                                >
                                                    <X className="w-4 h-4" />
                                                </Button>
                                            </div>
                                            <Textarea
                                                value={panel.instructions}
                                                onChange={(e) => updatePanelDraftField(panel._draftId, 'instructions', e.target.value)}
                                                className="neo-input min-h-[72px]"
                                                placeholder="Panel instructions"
                                                disabled={panelSaving || round?.is_frozen}
                                            />
                                            <div>
                                                <p className="text-xs uppercase tracking-[0.12em] text-slate-500 mb-2">Panel Members</p>
                                                <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                                                    {(panelConfig.available_admins || []).map((adminOption) => {
                                                        const adminId = Number(adminOption.admin_user_id);
                                                        const checked = (panel.member_admin_user_ids || []).includes(adminId);
                                                        return (
                                                            <label key={`${panel._draftId}-${adminId}`} className="flex items-center gap-2 text-xs font-medium">
                                                                <Checkbox
                                                                    checked={checked}
                                                                    onCheckedChange={(next) => togglePanelMember(panel._draftId, adminId, next)}
                                                                    className="border-2 border-black data-[state=checked]:bg-primary"
                                                                    disabled={panelSaving || round?.is_frozen}
                                                                />
                                                                <span>{adminOption.name} ({adminOption.regno})</span>
                                                            </label>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className="rounded border-2 border-black bg-white p-3 space-y-2">
                                <p className="text-sm font-semibold">Send Panel Details Email</p>
                                <div className="grid gap-2 md:grid-cols-[1fr_180px_auto]">
                                    <Input
                                        value={panelEmailSubject}
                                        onChange={(e) => setPanelEmailSubject(e.target.value)}
                                        className="neo-input"
                                        placeholder="Email subject"
                                        disabled={panelEmailSending}
                                    />
                                    <Select value={panelEmailTarget} onValueChange={setPanelEmailTarget}>
                                        <SelectTrigger className="neo-input">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All Panels</SelectItem>
                                            {shouldShowMyPanelOptions ? <SelectItem value="my">My Panels</SelectItem> : null}
                                        </SelectContent>
                                    </Select>
                                    <Button
                                        type="button"
                                        onClick={sendPanelEmails}
                                        className="bg-primary text-white border-2 border-black shadow-neo"
                                        disabled={panelEmailSending || (panelEmailTarget === 'my' && myPanelIdSet.size === 0)}
                                    >
                                        <Mail className="w-4 h-4 mr-2" /> {panelEmailSending ? 'Queueing...' : 'Send Panel Email'}
                                    </Button>
                                </div>
                                <Textarea
                                    value={panelEmailHtml}
                                    onChange={(e) => setPanelEmailHtml(e.target.value)}
                                    className="neo-input min-h-[110px]"
                                    placeholder="Use tags like <panel_name>, <panel_link>, <panel_time>, <panel_instructions>, <round_name>, <event_title>."
                                    disabled={panelEmailSending}
                                />
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="neo-card mb-6 bg-amber-50 border-amber-500">
                        <p className="text-sm text-slate-700">
                            Enable panel mode from the round header to configure panels.
                        </p>
                    </div>
                )
            ) : null}
            {isScoringTab ? (
                <>
                    <div className="neo-card mb-6">
                <div className="flex gap-2 mb-4">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <Input
                            placeholder="Search..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="neo-input pl-10"
                        />
                    </div>
                </div>
                <div className={`grid gap-3 ${panelModeEnabled ? 'sm:grid-cols-5' : 'sm:grid-cols-4'}`}>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="neo-input"><SelectValue placeholder="Filter by status" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Status</SelectItem>
                            <SelectItem value="active">Active</SelectItem>
                            <SelectItem value="eliminated">Eliminated</SelectItem>
                        </SelectContent>
                    </Select>
                    <Select value={presenceFilter} onValueChange={setPresenceFilter}>
                        <SelectTrigger className="neo-input"><SelectValue placeholder="Filter by presence" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Presence</SelectItem>
                            <SelectItem value="present">Present</SelectItem>
                            <SelectItem value="absent">Absent</SelectItem>
                        </SelectContent>
                    </Select>
                    <Select value={sortBy} onValueChange={setSortBy}>
                        <SelectTrigger className="neo-input"><SelectValue placeholder="Sort entries" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="register_asc">Code (Asc)</SelectItem>
                            <SelectItem value="register_desc">Code (Desc)</SelectItem>
                            <SelectItem value="name_asc">Name (A-Z)</SelectItem>
                            <SelectItem value="name_desc">Name (Z-A)</SelectItem>
                            <SelectItem value="score_desc">Score (High-Low)</SelectItem>
                            <SelectItem value="score_asc">Score (Low-High)</SelectItem>
                            {round?.is_frozen ? <SelectItem value="rank_asc">Rank (Top-Down)</SelectItem> : null}
                        </SelectContent>
                    </Select>
                    {isSubmissionRound ? (
                        <Select value={submissionFilter} onValueChange={setSubmissionFilter}>
                            <SelectTrigger className="neo-input"><SelectValue placeholder="Filter submissions" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Submissions</SelectItem>
                                <SelectItem value="found">Submission Found</SelectItem>
                                <SelectItem value="missing">Submission Missing</SelectItem>
                            </SelectContent>
                        </Select>
                    ) : null}
                    {panelModeEnabled ? (
                        <Select value={panelFilter} onValueChange={setPanelFilter}>
                            <SelectTrigger className="neo-input"><SelectValue placeholder="Filter by panel" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Panels</SelectItem>
                                {shouldShowMyPanelOptions ? <SelectItem value="my">My Panels</SelectItem> : null}
                                <SelectItem value="unassigned">Unassigned</SelectItem>
                                {panelRows.map((panel) => (
                                    <SelectItem key={`panel-filter-${panel.id}`} value={String(panel.id)}>
                                        {panel.panel_name || panel.name || `Panel ${panel.panel_no}`}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    ) : null}
                </div>
            </div>

            {!loading && totalRows > 0 ? (
                <div className="mb-3 flex items-center justify-between text-sm text-gray-600">
                    <span>Showing {pageStart}-{pageEnd} of {totalRows}</span>
                    <span>Page {currentPage} / {totalPages}</span>
                </div>
            ) : null}

            {displayedRows.length === 0 ? (
                <div className="neo-card text-center py-12">
                    <Users className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                    <h3 className="font-heading font-bold text-xl">No Entries Match Current Filters</h3>
                </div>
            ) : (
                <div className="overflow-x-auto pb-1">
                    <table className="neo-table">
                        <thead>
                            <tr>
                                <th>{entityMode === 'team' ? 'Team Code' : 'Register No'}</th>
                                <th>{entityMode === 'team' ? 'Team Name' : 'Name'}</th>
                                <th>Round Status</th>
                                {panelModeEnabled ? <th>Panel</th> : null}
                                {isSubmissionRound ? <th>Submission</th> : null}
                                <th>Present</th>
                                {criteria.map((criterion, index) => (
                                    <th key={`${criterion.name}-${index}`} className="min-w-[140px] whitespace-nowrap">{criterion.name} (/{criterion.max_marks})</th>
                                ))}
                                <th>Total</th>
                                <th className="min-w-[140px] whitespace-nowrap">Round Score</th>
                                {round?.is_frozen ? <th>Round Rank</th> : null}
                            </tr>
                        </thead>
                        <tbody>
                            {pagedRows.map((row) => {
                                const totalScore = getTotalScore(row);
                                const maxScore = criteria.reduce((sum, criterion) => sum + Number(criterion.max_marks || 0), 0);
                                const nonPanelNormalized = maxScore > 0 ? (totalScore / maxScore * 100).toFixed(2) : '0.00';
                                const roundScore = panelModeEnabled
                                    ? Number(row.normalized_score || 0).toFixed(2)
                                    : nonPanelNormalized;
                                const roundRank = round?.is_frozen ? (roundRankMap[row._entityId] || '—') : null;
                                const rowEditable = canEditScoreRow(row);
                                const roundStatus = !row.is_present
                                    ? 'Absent'
                                    : (row._status === 'Eliminated' ? 'Eliminated' : 'Active');
                                const roundStatusClass = roundStatus === 'Active'
                                    ? 'bg-green-100 text-green-800 border-green-500'
                                    : (roundStatus === 'Eliminated'
                                        ? 'bg-red-100 text-red-800 border-red-500'
                                        : 'bg-orange-100 text-orange-800 border-orange-500');

                                return (
                                    <tr key={`${row._entityType}-${row._entityId}`}>
                                        <td className="font-mono font-bold">{row._code || '—'}</td>
                                        <td className="font-medium">{row._name || '—'}</td>
                                        <td>
                                            <span className={`tag border-2 ${roundStatusClass}`}>{roundStatus}</span>
                                        </td>
                                        {panelModeEnabled ? (
                                            <td className="min-w-[180px]">
                                                <Select
                                                    value={row.panel_id == null ? 'unassigned' : String(row.panel_id)}
                                                    onValueChange={(value) => handlePanelAssignmentChange(row, value)}
                                                    disabled={round?.is_frozen}
                                                >
                                                    <SelectTrigger className="neo-input h-9">
                                                        <SelectValue placeholder="Panel" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="unassigned">Unassigned</SelectItem>
                                                        {panelRows.map((panel) => (
                                                            <SelectItem key={`panel-row-${row._entityType}-${row._entityId}-${panel.id}`} value={String(panel.id)}>
                                                                {panel.panel_name || panel.name || `Panel ${panel.panel_no}`}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                                {rowEditable ? null : (
                                                    <p className="mt-1 text-[11px] text-red-600">Not editable for your panel access</p>
                                                )}
                                            </td>
                                        ) : null}
                                        {isSubmissionRound ? (
                                            <td>
                                                {row.submission_file_url || row.submission_link_url ? (
                                                    <div className="flex items-center gap-2">
                                                        <a
                                                            href={row.submission_file_url || row.submission_link_url}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="text-xs font-bold underline"
                                                        >
                                                            View
                                                        </a>
                                                        {row.submission_is_locked ? (
                                                            <span className="tag border-2 border-slate-500 bg-slate-100 text-slate-700">Locked</span>
                                                        ) : null}
                                                    </div>
                                                ) : (
                                                    <span className="text-xs text-slate-500">Missing</span>
                                                )}
                                            </td>
                                        ) : null}
                                        <td>
                                            <Checkbox
                                                checked={Boolean(row.is_present)}
                                                onCheckedChange={(checked) => handlePresenceChange(row._entityType, row._entityId, checked)}
                                                disabled={!isRoundActive || !rowEditable}
                                                className="border-2 border-black data-[state=checked]:bg-primary"
                                            />
                                        </td>
                                        {criteria.map((criterion, index) => (
                                            <td key={`${criterion.name}-${index}`} className="min-w-[140px]">
                                                <Input
                                                    type="number"
                                                    value={row.criteria_scores?.[criterion.name] ?? ''}
                                                    onChange={(e) => handleScoreChange(row._entityType, row._entityId, criterion.name, e.target.value)}
                                                    onBlur={() => handleScoreBlur(row._entityType, row._entityId, criterion.name)}
                                                    disabled={!row.is_present || !rowEditable}
                                                    className="neo-input h-10 w-full min-w-[110px]"
                                                    min={0}
                                                    max={criterion.max_marks}
                                                />
                                            </td>
                                        ))}
                                        <td className="font-bold">{totalScore}</td>
                                        <td className="min-w-[140px]">
                                            <span className="inline-flex h-10 w-full min-w-[110px] items-center justify-center bg-primary text-white px-2 py-1 border-2 border-black font-bold">
                                                {roundScore}
                                            </span>
                                        </td>
                                        {round?.is_frozen ? <td className="font-bold">{roundRank}</td> : null}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

                    {!loading && totalRows > 0 ? (
                        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <p className="text-sm text-gray-600">
                                Showing {pageStart}-{pageEnd} of {totalRows}
                            </p>
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Rows per page</span>
                                <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
                                    <SelectTrigger className="w-[90px] neo-input">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {SCORING_PAGE_SIZE_OPTIONS.map((option) => (
                                            <SelectItem key={option} value={String(option)}>{option}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                                    disabled={currentPage === 1}
                                    className="border-2 border-black shadow-neo disabled:opacity-50"
                                >
                                    <ArrowLeft className="h-4 w-4" />
                                </Button>
                                <span className="min-w-24 text-center text-sm font-bold">Page {currentPage} / {totalPages}</span>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                                    disabled={currentPage === totalPages}
                                    className="border-2 border-black shadow-neo disabled:opacity-50"
                                >
                                    <ArrowLeft className="h-4 w-4 rotate-180" />
                                </Button>
                            </div>
                        </div>
                    ) : null}
                </>
            ) : null}
        </>
    );
}

export default function EventAdminScoringPage() {
    return (
        <EventAdminShell activeTab="scoring">
            <ScoringContent />
        </EventAdminShell>
    );
}
