import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import {
    Users,
    Search,
    Filter,
    UserCheck,
    UserX,
    Trash2,
    Download,
    ChevronLeft,
    ChevronRight,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { usePersohubAdminAuth } from '@/context/PersohubAdminAuthContext';

import EventAdminShell, { useEventAdminShell } from './EventAdminShell';
import EntityDetailsModal from './EntityDetailsModal';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const PAGE_SIZE = 10;

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

const GENDERS = ['Male', 'Female'];
const STATUSES = ['Active', 'Eliminated', 'Pending'];
const formatDateTime = (value) => {
    if (!value) return '-';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '-';
    return parsed.toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
    });
};

const paymentStatusBadgeClass = (status) => {
    const normalized = String(status || '').toLowerCase();
    if (normalized === 'approved') return 'border-emerald-300 bg-emerald-50 text-emerald-700';
    if (normalized === 'declined') return 'border-red-300 bg-red-50 text-red-700';
    if (normalized === 'pending') return 'border-amber-300 bg-amber-50 text-amber-700';
    return 'border-black/10 bg-white text-slate-700';
};

function ParticipantsContent() {
    const { getAuthHeader } = usePersohubAdminAuth();
    const {
        eventInfo,
        eventSlug,
        pushLocalUndo,
        pushSavedUndo,
        warnNonUndoable,
    } = useEventAdminShell();

    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [totalRows, setTotalRows] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [selectedEntity, setSelectedEntity] = useState(null);
    const [roundStats, setRoundStats] = useState([]);
    const [roundStatsLoading, setRoundStatsLoading] = useState(false);
    const [roundStatsError, setRoundStatsError] = useState('');
    const [entitySummary, setEntitySummary] = useState(null);
    const [teamMembers, setTeamMembers] = useState([]);
    const [statusDialogOpen, setStatusDialogOpen] = useState(false);
    const [statusTarget, setStatusTarget] = useState(null);
    const [pendingStatus, setPendingStatus] = useState(null);
    const [statusActionAcknowledged, setStatusActionAcknowledged] = useState(false);
    const [teamDeleteDialogOpen, setTeamDeleteDialogOpen] = useState(false);
    const [teamDeleteTarget, setTeamDeleteTarget] = useState(null);
    const [deletingTeam, setDeletingTeam] = useState(false);
    const [participantDeleteDialogOpen, setParticipantDeleteDialogOpen] = useState(false);
    const [participantDeleteTarget, setParticipantDeleteTarget] = useState(null);
    const [participantDeleteConfirmText, setParticipantDeleteConfirmText] = useState('');
    const [deletingParticipant, setDeletingParticipant] = useState(false);
    const [approvingPaymentEntityKey, setApprovingPaymentEntityKey] = useState('');
    const [paymentApprovalTarget, setPaymentApprovalTarget] = useState(null);
    const [paymentApprovalDetails, setPaymentApprovalDetails] = useState(null);
    const [paymentApprovalLoading, setPaymentApprovalLoading] = useState(false);
    const [paymentApprovalError, setPaymentApprovalError] = useState('');
    const [paymentApprovalAcknowledged, setPaymentApprovalAcknowledged] = useState(false);
    const [filters, setFilters] = useState({
        department: '',
        gender: '',
        batch: '',
        mit_scope: '',
        status: '',
        search: '',
    });

    const isTeamMode = eventInfo?.participant_mode === 'team';

    const getErrorMessage = (error, fallback) => (
        error?.response?.data?.detail || error?.response?.data?.message || fallback
    );

    const fetchRows = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (filters.search) params.append('search', filters.search);
            if (filters.status) params.append('status', filters.status);
            if (!isTeamMode) {
                if (filters.mit_scope) params.append('mit_scope', filters.mit_scope);
                if (filters.department) params.append('department', filters.department);
                if (filters.gender) params.append('gender', filters.gender);
                if (filters.batch) params.append('batch', filters.batch);
            }
            params.append('page', String(currentPage));
            params.append('page_size', String(PAGE_SIZE));

            const response = await axios.get(`${API}/persohub/admin/persohub-events/${eventSlug}/participants?${params.toString()}`, {
                headers: getAuthHeader(),
            });
            const data = Array.isArray(response.data) ? response.data : [];
            setRows(data);
            setTotalRows(Number(response.headers['x-total-count'] || data.length || 0));
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to load participants'));
            setRows([]);
            setTotalRows(0);
        } finally {
            setLoading(false);
        }
    }, [currentPage, eventSlug, filters.batch, filters.department, filters.gender, filters.mit_scope, filters.search, filters.status, getAuthHeader, isTeamMode]);

    useEffect(() => {
        fetchRows();
    }, [fetchRows]);

    useEffect(() => {
        const onUndoApplied = (event) => {
            if (event?.detail?.eventSlug !== eventSlug) return;
            fetchRows();
        };
        window.addEventListener('event-admin-undo-applied', onUndoApplied);
        return () => window.removeEventListener('event-admin-undo-applied', onUndoApplied);
    }, [eventSlug, fetchRows]);

    useEffect(() => {
        setCurrentPage(1);
    }, [filters.batch, filters.department, filters.gender, filters.mit_scope, filters.search, filters.status]);

    const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));

    useEffect(() => {
        if (currentPage > totalPages) {
            setCurrentPage(totalPages);
        }
    }, [currentPage, totalPages]);

    const handleExport = async (format) => {
        try {
            const params = new URLSearchParams();
            params.append('format', format);
            if (filters.search) params.append('search', filters.search);
            if (filters.status) params.append('status', filters.status);
            if (!isTeamMode) {
                if (filters.mit_scope) params.append('mit_scope', filters.mit_scope);
                if (filters.department) params.append('department', filters.department);
                if (filters.gender) params.append('gender', filters.gender);
                if (filters.batch) params.append('batch', filters.batch);
            }

            const response = await axios.get(`${API}/persohub/admin/persohub-events/${eventSlug}/export/participants?${params.toString()}`, {
                headers: getAuthHeader(),
                responseType: 'blob',
            });

            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `participants.${format}`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);

            toast.success('Export successful');
        } catch (error) {
            toast.error(getErrorMessage(error, 'Export failed'));
        }
    };

    const clearFilters = () => {
        const previous = { ...filters };
        setFilters({
            department: '',
            gender: '',
            batch: '',
            mit_scope: '',
            status: '',
            search: '',
        });
        pushLocalUndo({
            label: 'Undo clear participant filters',
            undoFn: () => setFilters(previous),
        });
    };

    const handleStatusChange = async (entityId, nextStatus, currentStatus) => {
        try {
            await axios.put(
                `${API}/persohub/admin/persohub-events/${eventSlug}/participants/${entityId}/status?status=${encodeURIComponent(nextStatus)}`,
                {},
                { headers: getAuthHeader() }
            );
            if (currentStatus && currentStatus !== nextStatus) {
                pushSavedUndo({
                    label: 'Undo participant status change',
                    command: {
                        type: 'participant_status_bulk_restore',
                        updates: [
                            {
                                entity_type: 'user',
                                entity_id: Number(entityId),
                                status: currentStatus,
                            },
                        ],
                    },
                });
            }
            toast.success('Status updated');
            fetchRows();
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to update status'));
        }
    };

    const handleTeamDelete = async (teamId) => {
        setDeletingTeam(true);
        try {
            await axios.delete(`${API}/persohub/admin/persohub-events/${eventSlug}/teams/${teamId}`, {
                headers: getAuthHeader(),
            });
            toast.success('Team deleted');
            if (selectedEntity?.entity_id === teamId) {
                setSelectedEntity(null);
            }
            fetchRows();
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to delete team'));
        } finally {
            setDeletingTeam(false);
        }
    };

    const handleParticipantDelete = async (participantId) => {
        setDeletingParticipant(true);
        try {
            await axios.delete(`${API}/persohub/admin/persohub-events/${eventSlug}/participants/${participantId}`, {
                headers: getAuthHeader(),
            });
            toast.success('Participant deleted');
            if (selectedEntity?.entity_id === participantId) {
                setSelectedEntity(null);
            }
            fetchRows();
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to delete participant'));
        } finally {
            setDeletingParticipant(false);
        }
    };

    const openApprovePaymentDialog = async (row) => {
        if (!row) return;
        setPaymentApprovalTarget(row);
        setPaymentApprovalDetails(null);
        setPaymentApprovalError('');
        setPaymentApprovalAcknowledged(false);
        setPaymentApprovalLoading(true);
        try {
            const response = await axios.get(
                `${API}/persohub/admin/persohub-events/${eventSlug}/participants/${row.entity_id}/pending-payment`,
                { headers: getAuthHeader() }
            );
            setPaymentApprovalDetails(response.data || null);
        } catch (error) {
            setPaymentApprovalError(getErrorMessage(error, 'Failed to load payment details'));
        } finally {
            setPaymentApprovalLoading(false);
        }
    };

    const closeApprovePaymentDialog = () => {
        if (approvingPaymentEntityKey) return;
        setPaymentApprovalTarget(null);
        setPaymentApprovalDetails(null);
        setPaymentApprovalError('');
        setPaymentApprovalAcknowledged(false);
        setPaymentApprovalLoading(false);
    };

    const handleApprovePendingPayment = async () => {
        if (!paymentApprovalTarget) return;
        if (!paymentApprovalAcknowledged) {
            toast.error('Please acknowledge the approval warning');
            return;
        }
        const entityKey = `${paymentApprovalTarget.entity_type}-${paymentApprovalTarget.entity_id}`;
        if (approvingPaymentEntityKey === entityKey) return;
        setApprovingPaymentEntityKey(entityKey);
        try {
            await axios.post(
                `${API}/persohub/admin/persohub-events/${eventSlug}/participants/${paymentApprovalTarget.entity_id}/approve-payment`,
                {},
                { headers: getAuthHeader() }
            );
            toast.success('Payment approved');
            closeApprovePaymentDialog();
            fetchRows();
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to approve payment'));
        } finally {
            setApprovingPaymentEntityKey('');
        }
    };

    const openStatusDialog = (row, newStatus) => {
        setStatusTarget(row);
        setPendingStatus(newStatus);
        setStatusActionAcknowledged(false);
        setStatusDialogOpen(true);
    };

    const openTeamDeleteDialog = (row) => {
        setTeamDeleteTarget(row);
        setTeamDeleteDialogOpen(true);
    };

    const openParticipantDeleteDialog = (row) => {
        if (!row) return;
        setParticipantDeleteTarget(row);
        setParticipantDeleteConfirmText('');
        setParticipantDeleteDialogOpen(true);
    };

    const openEntityModal = async (row) => {
        setSelectedEntity(row);
        setRoundStats([]);
        setRoundStatsError('');
        setRoundStatsLoading(true);
        setEntitySummary(null);
        setTeamMembers([]);

        try {
            const [roundRes, summaryRes] = await Promise.all([
                axios.get(`${API}/persohub/admin/persohub-events/${eventSlug}/participants/${row.entity_id}/rounds`, {
                    headers: getAuthHeader(),
                }),
                axios.get(`${API}/persohub/admin/persohub-events/${eventSlug}/participants/${row.entity_id}/summary`, {
                    headers: getAuthHeader(),
                }),
            ]);
            setRoundStats(roundRes.data || []);
            setEntitySummary(summaryRes.data || null);
            if (isTeamMode) {
                const teamRes = await axios.get(`${API}/persohub/admin/persohub-events/${eventSlug}/teams/${row.entity_id}`, {
                    headers: getAuthHeader(),
                });
                setTeamMembers(teamRes.data?.members || []);
            }
        } catch (error) {
            setRoundStatsError('Failed to load details');
        } finally {
            setRoundStatsLoading(false);
        }
    };

    const hasAnyFilters = Boolean(filters.department || filters.gender || filters.batch || filters.mit_scope || filters.status || filters.search);

    const batchOptions = useMemo(() => {
        const values = new Set();
        rows.forEach((row) => {
            if (row.batch) values.add(String(row.batch));
        });
        return Array.from(values).sort();
    }, [rows]);

    const departmentLabel = selectedEntity
        ? (DEPARTMENTS.find((d) => d.value === selectedEntity.department)?.label || selectedEntity.department)
        : '';
    const paymentApprovalAmount = Number(paymentApprovalDetails?.amount || 0);

    return (
        <>
            <div className="neo-card mb-6">
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6">
                    <div>
                        <h1 className="font-heading font-bold text-3xl">{isTeamMode ? 'Teams' : 'Participants'}</h1>
                        <p className="text-gray-600">{totalRows} {isTeamMode ? 'teams' : 'participants'} found</p>
                    </div>
                    <div className="flex gap-2">
                        <Button onClick={() => handleExport('csv')} variant="outline" className="border-2 border-black shadow-neo">
                            <Download className="w-4 h-4 mr-2" /> CSV
                        </Button>
                        <Button onClick={() => handleExport('xlsx')} variant="outline" className="border-2 border-black shadow-neo">
                            <Download className="w-4 h-4 mr-2" /> Excel
                        </Button>
                    </div>
                </div>

                <div className={`grid gap-3 ${isTeamMode ? 'grid-cols-1 md:grid-cols-3' : 'grid-cols-1 md:grid-cols-7'}`}>
                    <div className={`relative ${isTeamMode ? 'md:col-span-2' : 'md:col-span-2'}`}>
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <Input
                            placeholder="Search by name, code, email..."
                            value={filters.search}
                            onChange={(e) => {
                                const previous = { ...filters };
                                const nextSearch = e.target.value;
                                setFilters((prev) => ({ ...prev, search: nextSearch }));
                                pushLocalUndo({
                                    label: 'Undo participant search change',
                                    undoFn: () => setFilters(previous),
                                });
                            }}
                            className="neo-input pl-10"
                        />
                    </div>

                    {!isTeamMode ? (
                        <Select
                            value={filters.mit_scope || 'all'}
                            onValueChange={(value) => {
                                const previous = { ...filters };
                                const nextValue = value === 'all' ? '' : value;
                                setFilters((prev) => ({ ...prev, mit_scope: nextValue }));
                                pushLocalUndo({
                                    label: 'Undo MIT scope filter change',
                                    undoFn: () => setFilters(previous),
                                });
                            }}
                        >
                            <SelectTrigger className="neo-input">
                                <SelectValue placeholder="MIT Scope" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Participants</SelectItem>
                                <SelectItem value="MIT">MIT</SelectItem>
                                <SelectItem value="NON_MIT">Non MIT</SelectItem>
                            </SelectContent>
                        </Select>
                    ) : null}

                    {!isTeamMode ? (
                        <Select
                            value={filters.department || 'all'}
                            onValueChange={(value) => {
                                const previous = { ...filters };
                                const nextValue = value === 'all' ? '' : value;
                                setFilters((prev) => ({ ...prev, department: nextValue }));
                                pushLocalUndo({
                                    label: 'Undo department filter change',
                                    undoFn: () => setFilters(previous),
                                });
                            }}
                        >
                            <SelectTrigger className="neo-input">
                                <SelectValue placeholder="Department" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Departments</SelectItem>
                                {DEPARTMENTS.map((d) => (
                                    <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    ) : null}

                    {!isTeamMode ? (
                        <Select
                            value={filters.gender || 'all'}
                            onValueChange={(value) => {
                                const previous = { ...filters };
                                const nextValue = value === 'all' ? '' : value;
                                setFilters((prev) => ({ ...prev, gender: nextValue }));
                                pushLocalUndo({
                                    label: 'Undo gender filter change',
                                    undoFn: () => setFilters(previous),
                                });
                            }}
                        >
                            <SelectTrigger className="neo-input">
                                <SelectValue placeholder="Gender" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Genders</SelectItem>
                                {GENDERS.map((gender) => (
                                    <SelectItem key={gender} value={gender}>{gender}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    ) : null}

                    {!isTeamMode ? (
                        <Select
                            value={filters.batch || 'all'}
                            onValueChange={(value) => {
                                const previous = { ...filters };
                                const nextValue = value === 'all' ? '' : value;
                                setFilters((prev) => ({ ...prev, batch: nextValue }));
                                pushLocalUndo({
                                    label: 'Undo batch filter change',
                                    undoFn: () => setFilters(previous),
                                });
                            }}
                        >
                            <SelectTrigger className="neo-input">
                                <SelectValue placeholder="Batch" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Batches</SelectItem>
                                {batchOptions.map((batch) => (
                                    <SelectItem key={batch} value={batch}>{batch}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    ) : null}

                    <Select
                        value={filters.status || 'all'}
                        onValueChange={(value) => {
                            const previous = { ...filters };
                            const nextValue = value === 'all' ? '' : value;
                            setFilters((prev) => ({ ...prev, status: nextValue }));
                            pushLocalUndo({
                                label: 'Undo status filter change',
                                undoFn: () => setFilters(previous),
                            });
                        }}
                    >
                        <SelectTrigger className="neo-input">
                            <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Statuses</SelectItem>
                            {STATUSES.map((status) => (
                                <SelectItem key={status} value={status}>{status}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                {hasAnyFilters ? (
                    <Button onClick={clearFilters} variant="outline" size="sm" className="mt-4 border-2 border-black">
                        <Filter className="w-4 h-4 mr-2" /> Clear Filters
                    </Button>
                ) : null}
            </div>

            {loading ? (
                <div className="neo-card text-center py-12">
                    <div className="loading-spinner mx-auto"></div>
                    <p className="mt-4">Loading {isTeamMode ? 'teams' : 'participants'}...</p>
                </div>
            ) : rows.length === 0 ? (
                <div className="neo-card text-center py-12">
                    <Users className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                    <h3 className="font-heading font-bold text-xl mb-2">No {isTeamMode ? 'Teams' : 'Participants'} Found</h3>
                    <p className="text-gray-600">No entries match your filters.</p>
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="neo-table">
                        <thead>
                            <tr>
                                <th>{isTeamMode ? 'Team Code' : 'Register No'}</th>
                                <th>{isTeamMode ? 'Team Name' : 'Name'}</th>
                                {isTeamMode ? <th>Members</th> : <th>Email</th>}
                                {!isTeamMode ? <th>College</th> : null}
                                {!isTeamMode ? <th>Department</th> : null}
                                {!isTeamMode ? <th>Batch</th> : null}
                                {!isTeamMode ? <th>Gender</th> : null}
                                {!isTeamMode ? <th>Referrals</th> : null}
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row) => (
                                <tr
                                    key={`${row.entity_type}-${row.entity_id}`}
                                    className="cursor-pointer hover:bg-secondary"
                                    onClick={() => openEntityModal(row)}
                                >
                                    <td className="font-mono font-bold">{row.regno_or_code}</td>
                                    <td className="font-medium">{row.name}</td>
                                    {isTeamMode ? (
                                        <td>{row.members_count || 0}</td>
                                    ) : (
                                        <td className="text-sm">{row.email}</td>
                                    )}
                                    {!isTeamMode ? <td className="text-sm">{row.college || '-'}</td> : null}
                                    {!isTeamMode ? (
                                        <td className="text-sm">{DEPARTMENTS.find((d) => d.value === row.department)?.label || row.department}</td>
                                    ) : null}
                                    {!isTeamMode ? <td className="text-sm">{row.batch}</td> : null}
                                    {!isTeamMode ? <td className="text-sm">{row.gender}</td> : null}
                                    {!isTeamMode ? (
                                        <td>
                                            <span className="bg-accent px-2 py-1 border border-black font-bold text-sm">
                                                {row.referral_count || 0}
                                            </span>
                                        </td>
                                    ) : null}
                                    <td>
                                        <span className={`tag border-2 ${row.status === 'Active' ? 'bg-green-100 text-green-800 border-green-500' : 'bg-red-100 text-red-800 border-red-500'}`}>
                                            {row.status}
                                        </span>
                                    </td>
                                    <td>
                                        {!isTeamMode ? (
                                            row.status === 'Pending' ? (
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        openApprovePaymentDialog(row);
                                                    }}
                                                    disabled={approvingPaymentEntityKey === `${row.entity_type}-${row.entity_id}`}
                                                    className="border-2 border-black text-emerald-600"
                                                    title="Approve payment"
                                                >
                                                    <UserCheck className="w-4 h-4" />
                                                </Button>
                                            ) : row.status === 'Active' ? (
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        openStatusDialog(row, 'Eliminated');
                                                    }}
                                                    className="border-2 border-black text-red-500"
                                                >
                                                    <UserX className="w-4 h-4" />
                                                </Button>
                                            ) : (
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        openStatusDialog(row, 'Active');
                                                    }}
                                                    className="border-2 border-black text-green-500"
                                                >
                                                    <UserCheck className="w-4 h-4" />
                                                </Button>
                                            )
                                        ) : (
                                            <div className="flex items-center gap-2">
                                                {row.status === 'Pending' ? (
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            openApprovePaymentDialog(row);
                                                        }}
                                                        disabled={approvingPaymentEntityKey === `${row.entity_type}-${row.entity_id}`}
                                                        className="border-2 border-black text-emerald-600"
                                                        title="Approve payment"
                                                    >
                                                        <UserCheck className="w-4 h-4" />
                                                    </Button>
                                                ) : null}
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        openTeamDeleteDialog(row);
                                                    }}
                                                    className="border-2 border-black text-red-500"
                                                    title="Delete team with cascade"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </Button>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <Dialog
                open={Boolean(paymentApprovalTarget)}
                onOpenChange={(open) => {
                    if (!open) {
                        closeApprovePaymentDialog();
                    }
                }}
            >
                <DialogContent className="border-4 border-black bg-white sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle className="font-heading font-bold text-xl">Confirm Payment</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        {paymentApprovalLoading ? (
                            <p className="text-sm text-gray-600">Loading payment details...</p>
                        ) : paymentApprovalError ? (
                            <p className="text-sm text-red-700">{paymentApprovalError}</p>
                        ) : paymentApprovalDetails ? (
                            <>
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                        <p className="text-xs uppercase tracking-[0.24em] text-slate-500">{paymentApprovalDetails.event_slug || eventSlug}</p>
                                        <h3 className="text-lg font-heading font-black">{paymentApprovalDetails.event_title || eventInfo?.title || 'Event'}</h3>
                                        <p className="text-sm text-slate-600">
                                            {paymentApprovalDetails.participant_name || paymentApprovalTarget?.name}
                                            {paymentApprovalDetails.participant_regno ? ` (${paymentApprovalDetails.participant_regno})` : ''}
                                        </p>
                                    </div>
                                    <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${paymentStatusBadgeClass(paymentApprovalDetails.status)}`}>
                                        {paymentApprovalDetails.status || 'pending'}
                                    </span>
                                </div>

                                <div className="grid gap-3 text-sm text-slate-700 sm:grid-cols-2">
                                    <p><span className="font-semibold">Fee Slab:</span> {paymentApprovalDetails.fee_key || '-'}</p>
                                    <p>
                                        <span className="font-semibold">Amount:</span>{' '}
                                        {Number.isFinite(paymentApprovalAmount)
                                            ? `${paymentApprovalAmount} ${paymentApprovalDetails.currency || 'INR'}`
                                            : '-'}
                                    </p>
                                    <p><span className="font-semibold">Attempt:</span> {paymentApprovalDetails.attempt || 1}</p>
                                    <p><span className="font-semibold">Recipient Email:</span> {paymentApprovalDetails.participant_email || '-'}</p>
                                    <p><span className="font-semibold">Recipient Phone:</span> {paymentApprovalDetails.participant_phno || '-'}</p>
                                    <p><span className="font-semibold">Recipient College:</span> {paymentApprovalDetails.participant_college || '-'}</p>
                                    <p><span className="font-semibold">Recipient Dept:</span> {paymentApprovalDetails.participant_dept || '-'}</p>
                                    <p><span className="font-semibold">Submitted At:</span> {formatDateTime(paymentApprovalDetails.created_at)}</p>
                                    <p><span className="font-semibold">Reviewed At:</span> {formatDateTime(paymentApprovalDetails?.review?.at)}</p>
                                    {paymentApprovalDetails.comment ? (
                                        <p className="sm:col-span-2"><span className="font-semibold">Payment Note:</span> {paymentApprovalDetails.comment}</p>
                                    ) : null}
                                </div>

                                {paymentApprovalDetails.payment_info_url ? (
                                    <div className="space-y-2">
                                        <a
                                            href={paymentApprovalDetails.payment_info_url}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="inline-flex"
                                        >
                                            <Button type="button" variant="outline" className="border-black/20">View Screenshot</Button>
                                        </a>
                                        <a
                                            href={paymentApprovalDetails.payment_info_url}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="block overflow-hidden rounded-lg border border-black/10 bg-slate-50"
                                        >
                                            <img
                                                src={paymentApprovalDetails.payment_info_url}
                                                alt="Payment screenshot"
                                                className="max-h-64 w-full object-contain"
                                            />
                                        </a>
                                    </div>
                                ) : null}

                                <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3">
                                    <input
                                        id="participant-payment-approve-warning"
                                        type="checkbox"
                                        checked={paymentApprovalAcknowledged}
                                        onChange={(event) => setPaymentApprovalAcknowledged(Boolean(event.target.checked))}
                                        className="mt-1 h-4 w-4"
                                    />
                                    <label htmlFor="participant-payment-approve-warning" className="text-sm font-medium text-amber-900">
                                        I have verified the proof, amount and participant details and want to approve this payment.
                                    </label>
                                </div>
                            </>
                        ) : (
                            <p className="text-sm text-gray-600">No payment details available.</p>
                        )}

                        <div className="flex justify-end gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                className="border-2 border-black"
                                onClick={closeApprovePaymentDialog}
                                disabled={Boolean(approvingPaymentEntityKey)}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="button"
                                className="bg-emerald-600 text-white border-2 border-black hover:bg-emerald-700"
                                onClick={handleApprovePendingPayment}
                                disabled={
                                    !paymentApprovalDetails
                                    || paymentApprovalLoading
                                    || Boolean(paymentApprovalError)
                                    || !paymentApprovalAcknowledged
                                    || Boolean(approvingPaymentEntityKey)
                                }
                            >
                                {Boolean(approvingPaymentEntityKey) ? 'Confirming...' : 'Confirm'}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog
                open={statusDialogOpen}
                onOpenChange={(open) => {
                    setStatusDialogOpen(open);
                    if (!open) {
                        setStatusTarget(null);
                        setPendingStatus(null);
                        setStatusActionAcknowledged(false);
                    }
                }}
            >
                <DialogContent className="border-4 border-black">
                    <DialogHeader>
                        <DialogTitle className="font-heading font-bold text-xl">
                            {pendingStatus === 'Eliminated' ? 'Eliminate Participant' : 'Activate Participant'}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <p className="text-gray-600">
                            {pendingStatus === 'Eliminated'
                                ? `Are you sure you want to eliminate ${statusTarget?.name || 'this participant'}?`
                                : `Are you sure you want to activate ${statusTarget?.name || 'this participant'}?`}
                        </p>
                        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3">
                            <input
                                id="participant-status-warning"
                                type="checkbox"
                                checked={statusActionAcknowledged}
                                onChange={(event) => setStatusActionAcknowledged(Boolean(event.target.checked))}
                                className="mt-1 h-4 w-4"
                            />
                            <label htmlFor="participant-status-warning" className="text-sm font-medium text-amber-900">
                                {pendingStatus === 'Eliminated'
                                    ? 'I understand this participant will be eliminated from progression.'
                                    : 'I understand this participant will be marked active again.'}
                            </label>
                        </div>
                        <div className="flex gap-2">
                            <Button variant="outline" className="flex-1 border-2 border-black" onClick={() => setStatusDialogOpen(false)}>
                                Cancel
                            </Button>
                            <Button
                                className={`flex-1 ${pendingStatus === 'Eliminated' ? 'bg-red-500' : 'bg-green-500'} text-white border-2 border-black`}
                                disabled={!statusActionAcknowledged}
                                onClick={() => {
                                    if (statusTarget && pendingStatus) {
                                        handleStatusChange(statusTarget.entity_id, pendingStatus, statusTarget.status);
                                    }
                                    setStatusActionAcknowledged(false);
                                    setStatusDialogOpen(false);
                                }}
                            >
                                Confirm
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={teamDeleteDialogOpen} onOpenChange={setTeamDeleteDialogOpen}>
                <DialogContent className="border-4 border-black">
                    <DialogHeader>
                        <DialogTitle className="font-heading font-bold text-xl">Delete Team</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <p className="text-gray-600">
                            Delete <span className="font-semibold">{teamDeleteTarget?.name || 'this team'}</span> ({teamDeleteTarget?.regno_or_code || '-'})?
                            This will cascade-remove registration, members, scores, attendance, badges, and invites for this event.
                        </p>
                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                className="flex-1 border-2 border-black"
                                onClick={() => {
                                    if (deletingTeam) return;
                                    setTeamDeleteDialogOpen(false);
                                    setTeamDeleteTarget(null);
                                }}
                                disabled={deletingTeam}
                            >
                                Cancel
                            </Button>
                            <Button
                                className="flex-1 bg-red-500 text-white border-2 border-black"
                                disabled={!teamDeleteTarget || deletingTeam}
                                onClick={async () => {
                                    if (!teamDeleteTarget) return;
                                    warnNonUndoable({
                                        title: 'Team Delete Is Not Undoable',
                                        message: `Deleting ${teamDeleteTarget.name || 'this team'} cannot be undone from header Undo. Continue?`,
                                        proceed: async () => {
                                            await handleTeamDelete(teamDeleteTarget.entity_id);
                                            setTeamDeleteDialogOpen(false);
                                            setTeamDeleteTarget(null);
                                        },
                                    });
                                }}
                            >
                                {deletingTeam ? 'Deleting...' : 'Delete Team'}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={participantDeleteDialogOpen} onOpenChange={setParticipantDeleteDialogOpen}>
                <DialogContent className="border-4 border-black">
                    <DialogHeader>
                        <DialogTitle className="font-heading font-bold text-xl">Delete Participant</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <p className="text-gray-600">
                            Delete <span className="font-semibold">{participantDeleteTarget?.name || 'this participant'}</span> ({participantDeleteTarget?.regno_or_code || '-'})?
                            This will cascade-remove registration, attendance, scores, badges, and invites for this event.
                        </p>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-700" htmlFor="confirm-participant-delete-input">
                                Type <span className="font-bold">DELETE</span> to confirm
                            </label>
                            <Input
                                id="confirm-participant-delete-input"
                                className="neo-input"
                                value={participantDeleteConfirmText}
                                onChange={(e) => setParticipantDeleteConfirmText(e.target.value)}
                                placeholder="DELETE"
                                autoComplete="off"
                            />
                        </div>
                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                className="flex-1 border-2 border-black"
                                onClick={() => {
                                    if (deletingParticipant) return;
                                    setParticipantDeleteDialogOpen(false);
                                    setParticipantDeleteTarget(null);
                                    setParticipantDeleteConfirmText('');
                                }}
                                disabled={deletingParticipant}
                            >
                                Cancel
                            </Button>
                            <Button
                                className="flex-1 bg-red-500 text-white border-2 border-black"
                                disabled={!participantDeleteTarget || deletingParticipant || participantDeleteConfirmText.trim() !== 'DELETE'}
                                onClick={async () => {
                                    if (!participantDeleteTarget) return;
                                    warnNonUndoable({
                                        title: 'Participant Delete Is Not Undoable',
                                        message: `Deleting ${participantDeleteTarget.name || 'this participant'} cannot be undone from header Undo. Continue?`,
                                        proceed: async () => {
                                            await handleParticipantDelete(participantDeleteTarget.entity_id);
                                            setParticipantDeleteDialogOpen(false);
                                            setParticipantDeleteTarget(null);
                                            setParticipantDeleteConfirmText('');
                                        },
                                    });
                                }}
                            >
                                {deletingParticipant ? 'Deleting...' : 'Delete Participant'}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {!loading && totalRows > 0 ? (
                <div className="mt-4 flex items-center justify-between">
                    <p className="text-sm text-gray-600">
                        Showing {(currentPage - 1) * PAGE_SIZE + 1}-{Math.min((currentPage - 1) * PAGE_SIZE + rows.length, totalRows)} of {totalRows}
                    </p>
                    <div className="flex items-center gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                            disabled={currentPage === 1}
                            className="border-2 border-black shadow-neo disabled:opacity-50"
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <span className="min-w-20 text-center text-sm font-bold">Page {currentPage} / {totalPages}</span>
                        <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                            disabled={currentPage === totalPages}
                            className="border-2 border-black shadow-neo disabled:opacity-50"
                        >
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            ) : null}

            <EntityDetailsModal
                open={Boolean(selectedEntity)}
                onOpenChange={() => setSelectedEntity(null)}
                entity={selectedEntity}
                roundStats={roundStats}
                roundStatsLoading={roundStatsLoading}
                roundStatsError={roundStatsError}
                overallPoints={entitySummary?.overall_points}
                overallRank={entitySummary?.overall_rank}
                entityMode={isTeamMode ? 'team' : 'individual'}
                teamMembers={teamMembers}
                departmentLabel={departmentLabel}
                showDeleteAction={!isTeamMode}
                deleteActionLabel="Delete Participant"
                onDeleteRequest={() => {
                    setSelectedEntity(null);
                    openParticipantDeleteDialog(selectedEntity);
                }}
            />
        </>
    );
}

export default function EventAdminParticipantsPage() {
    return (
        <EventAdminShell activeTab="participants">
            <ParticipantsContent />
        </EventAdminShell>
    );
}
