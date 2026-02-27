import React, { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import LoadingState from '@/components/common/LoadingState';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import PersohubAdminLayout from '@/pages/persohub/admin/PersohubAdminLayout';
import { persohubAdminApi } from '@/pages/persohub/admin/api';

const statusBadgeClass = (status) => {
    const normalized = String(status || '').toLowerCase();
    if (normalized === 'approved') return 'border-emerald-300 bg-emerald-50 text-emerald-700';
    if (normalized === 'declined') return 'border-red-300 bg-red-50 text-red-700';
    if (normalized === 'pending') return 'border-amber-300 bg-amber-50 text-amber-700';
    return 'border-black/10 bg-white text-slate-700';
};

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

export default function PersohubAdminPaymentsPage() {
    const [loading, setLoading] = useState(true);
    const [rows, setRows] = useState([]);
    const [refreshing, setRefreshing] = useState(false);
    const [page, setPage] = useState(1);
    const [pageSize] = useState(20);
    const [totalCount, setTotalCount] = useState(0);
    const [eventFilter, setEventFilter] = useState('all');
    const [eventOptions, setEventOptions] = useState([]);
    const [searchInput, setSearchInput] = useState('');
    const [searchDebounced, setSearchDebounced] = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [suggestionsOpen, setSuggestionsOpen] = useState(false);
    const [suggestionLoading, setSuggestionLoading] = useState(false);
    const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
    const [searchFocused, setSearchFocused] = useState(false);
    const blurCloseTimerRef = useRef(null);
    const suggestionRequestIdRef = useRef(0);

    const [confirmTarget, setConfirmTarget] = useState(null);
    const [confirmAcknowledged, setConfirmAcknowledged] = useState(false);
    const [confirming, setConfirming] = useState(false);

    const [declineTarget, setDeclineTarget] = useState(null);
    const [declineReason, setDeclineReason] = useState('');
    const [declining, setDeclining] = useState(false);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            setSearchDebounced(String(searchInput || '').trim());
        }, 250);
        return () => window.clearTimeout(timer);
    }, [searchInput]);

    useEffect(() => {
        setPage(1);
    }, [searchDebounced, eventFilter]);

    useEffect(() => {
        let mounted = true;
        persohubAdminApi
            .listPersohubPaymentEventOptions()
            .then((result) => {
                if (!mounted) return;
                const nextItems = Array.isArray(result?.items) ? result.items : [];
                setEventOptions(nextItems);
            })
            .catch(() => {
                if (!mounted) return;
                setEventOptions([]);
            });
        return () => {
            mounted = false;
        };
    }, []);

    const fetchRows = useCallback(async (isRefresh = false) => {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);
        try {
            const result = await persohubAdminApi.listPersohubPayments({
                page,
                page_size: pageSize,
                q: searchDebounced || undefined,
                event_slug: eventFilter !== 'all' ? eventFilter : undefined,
            });
            const nextRows = Array.isArray(result?.items) ? result.items : [];
            setRows(nextRows);
            setTotalCount(Number(result?.totalCount || 0));
        } catch (error) {
            toast.error(persohubAdminApi.parseApiError(error, 'Failed to load payments'));
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [eventFilter, page, pageSize, searchDebounced]);

    useEffect(() => {
        fetchRows();
    }, [fetchRows]);

    useEffect(() => {
        const query = String(searchDebounced || '').trim();
        if (!searchFocused || query.length < 2) {
            setSuggestionLoading(false);
            setSuggestions([]);
            setSuggestionsOpen(false);
            setActiveSuggestionIndex(-1);
            return;
        }
        const requestId = suggestionRequestIdRef.current + 1;
        suggestionRequestIdRef.current = requestId;
        setSuggestionLoading(true);
        persohubAdminApi
            .listPersohubPaymentSuggestions({ q: query, limit: 8 })
            .then((result) => {
                if (suggestionRequestIdRef.current !== requestId) return;
                const nextItems = Array.isArray(result?.items) ? result.items : [];
                setSuggestions(nextItems);
                setSuggestionsOpen(nextItems.length > 0);
                setActiveSuggestionIndex(nextItems.length ? 0 : -1);
            })
            .catch(() => {
                if (suggestionRequestIdRef.current !== requestId) return;
                setSuggestions([]);
                setSuggestionsOpen(false);
                setActiveSuggestionIndex(-1);
            })
            .finally(() => {
                if (suggestionRequestIdRef.current === requestId) {
                    setSuggestionLoading(false);
                }
            });
    }, [searchDebounced, searchFocused]);

    useEffect(() => () => {
        if (blurCloseTimerRef.current) window.clearTimeout(blurCloseTimerRef.current);
    }, []);

    const applySuggestion = useCallback((item) => {
        const nextValue = String(item?.regno || item?.label || item?.name || '').trim();
        setSearchInput(nextValue);
        setSuggestionsOpen(false);
        setActiveSuggestionIndex(-1);
    }, []);

    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    const startIndex = totalCount ? ((page - 1) * pageSize) + 1 : 0;
    const endIndex = totalCount ? Math.min(totalCount, page * pageSize) : 0;

    const submitConfirm = async () => {
        if (!confirmTarget) return;
        if (!confirmAcknowledged) {
            toast.error('Please acknowledge the approval warning');
            return;
        }
        setConfirming(true);
        try {
            await persohubAdminApi.confirmPersohubPayment(confirmTarget.id, {});
            toast.success('Payment approved');
            setConfirmTarget(null);
            setConfirmAcknowledged(false);
            fetchRows(true);
        } catch (error) {
            toast.error(persohubAdminApi.parseApiError(error, 'Failed to approve payment'));
        } finally {
            setConfirming(false);
        }
    };

    const submitDecline = async () => {
        if (!declineTarget) return;
        setDeclining(true);
        try {
            await persohubAdminApi.declinePersohubPayment(declineTarget.id, {
                reason: declineReason.trim() || null,
            });
            toast.success('Payment declined');
            setDeclineTarget(null);
            setDeclineReason('');
            fetchRows(true);
        } catch (error) {
            toast.error(persohubAdminApi.parseApiError(error, 'Failed to decline payment'));
        } finally {
            setDeclining(false);
        }
    };

    return (
        <PersohubAdminLayout
            title="Payment Reviews"
            subtitle="Review payment proofs and confirm participant registrations."
            activeTab="payments"
        >
            <section className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-2xl font-heading font-black">Payments Queue</h2>
                    <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[340px]">
                        <Select value={eventFilter} onValueChange={setEventFilter}>
                            <SelectTrigger className="h-10 w-full border-black/20 sm:w-[340px]">
                                <SelectValue placeholder="Filter by event" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Events</SelectItem>
                                {eventOptions.map((option) => {
                                    const slug = String(option?.event_slug || '').trim();
                                    const title = String(option?.event_title || '').trim();
                                    if (!slug || !title) return null;
                                    const count = Number(option?.payment_count || 0);
                                    return (
                                        <SelectItem key={slug} value={slug}>
                                            {title} ({count})
                                        </SelectItem>
                                    );
                                })}
                            </SelectContent>
                        </Select>
                        <div
                            className="relative"
                            onFocus={() => {
                                if (blurCloseTimerRef.current) {
                                    window.clearTimeout(blurCloseTimerRef.current);
                                    blurCloseTimerRef.current = null;
                                }
                                setSearchFocused(true);
                                if (suggestions.length > 0 && String(searchInput || '').trim().length >= 2) {
                                    setSuggestionsOpen(true);
                                }
                            }}
                            onBlur={() => {
                                blurCloseTimerRef.current = window.setTimeout(() => {
                                    setSearchFocused(false);
                                    setSuggestionsOpen(false);
                                    setActiveSuggestionIndex(-1);
                                }, 120);
                            }}
                        >
                            <input
                                type="text"
                                value={searchInput}
                                onChange={(event) => setSearchInput(event.target.value)}
                                onKeyDown={(event) => {
                                    if (event.key === 'ArrowDown') {
                                        event.preventDefault();
                                        if (!suggestions.length) return;
                                        setSuggestionsOpen(true);
                                        setActiveSuggestionIndex((prev) => {
                                            const next = prev < 0 ? 0 : Math.min(prev + 1, suggestions.length - 1);
                                            return next;
                                        });
                                        return;
                                    }
                                    if (event.key === 'ArrowUp') {
                                        event.preventDefault();
                                        if (!suggestions.length) return;
                                        setSuggestionsOpen(true);
                                        setActiveSuggestionIndex((prev) => {
                                            const next = prev <= 0 ? 0 : prev - 1;
                                            return next;
                                        });
                                        return;
                                    }
                                    if (event.key === 'Enter' && suggestionsOpen && activeSuggestionIndex >= 0 && suggestions[activeSuggestionIndex]) {
                                        event.preventDefault();
                                        applySuggestion(suggestions[activeSuggestionIndex]);
                                        return;
                                    }
                                    if (event.key === 'Escape') {
                                        setSuggestionsOpen(false);
                                        setActiveSuggestionIndex(-1);
                                    }
                                }}
                                placeholder="Search by participant name or regno"
                                className="h-10 w-full rounded-lg border border-black/20 px-3 text-sm font-medium text-slate-800 outline-none ring-0 transition focus:border-black/40 sm:w-[340px]"
                            />
                            {searchInput ? (
                                <button
                                    type="button"
                                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                                    onMouseDown={(event) => event.preventDefault()}
                                    onClick={() => {
                                        setSearchInput('');
                                        setSuggestions([]);
                                        setSuggestionsOpen(false);
                                        setActiveSuggestionIndex(-1);
                                    }}
                                >
                                    Clear
                                </button>
                            ) : null}
                            {suggestionsOpen ? (
                                <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-black/15 bg-white shadow-[0_10px_24px_rgba(0,0,0,0.14)] sm:w-[340px]">
                                    {suggestionLoading ? (
                                        <p className="px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Loading...</p>
                                    ) : suggestions.length ? (
                                        suggestions.map((item, index) => (
                                            <button
                                                key={`${item.regno || item.name || 'payment'}-${index}`}
                                                type="button"
                                                onMouseDown={(event) => event.preventDefault()}
                                                onClick={() => applySuggestion(item)}
                                                className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm ${
                                                    activeSuggestionIndex === index ? 'bg-slate-100' : 'hover:bg-slate-50'
                                                }`}
                                            >
                                                <span className="min-w-0 truncate font-semibold text-slate-900">{item.label || item.name || '-'}</span>
                                                <span className="shrink-0 text-xs uppercase tracking-[0.12em] text-slate-500">Match</span>
                                            </button>
                                        ))
                                    ) : (
                                        <p className="px-3 py-2 text-sm text-slate-500">No matches found.</p>
                                    )}
                                </div>
                            ) : null}
                        </div>
                        <div className="flex justify-end">
                            <Button
                                type="button"
                                variant="outline"
                                className="border-black/20"
                                disabled={refreshing}
                                onClick={() => fetchRows(true)}
                            >
                                {refreshing ? 'Refreshing...' : 'Refresh'}
                            </Button>
                        </div>
                    </div>
                </div>

                {loading ? (
                    <LoadingState variant="inline" containerClassName="mt-4" />
                ) : rows.length === 0 ? (
                    <p className="mt-4 text-sm text-slate-500">
                        {searchDebounced ? 'No payments found for this search.' : 'No payments submitted yet.'}
                    </p>
                ) : (
                    <div className="mt-4 grid gap-4">
                        {rows.map((row) => {
                            const amount = Number(row.amount || 0);
                            const normalizedStatus = String(row.status || '').toLowerCase();
                            const isPending = normalizedStatus === 'pending';
                            const reviewReason = String(row?.review?.reason || '').trim();
                            const reviewedAt = row?.review?.at || null;
                            return (
                                <article key={row.id} className="rounded-2xl border border-black/10 bg-[#fffdf7] p-4">
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div>
                                            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">{row.event_slug}</p>
                                            <h3 className="text-lg font-heading font-black">{row.event_title}</h3>
                                            <p className="text-sm text-slate-600">
                                                {row.participant_name}
                                                {row.participant_regno ? ` (${row.participant_regno})` : ''}
                                            </p>
                                        </div>
                                        <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${statusBadgeClass(row.status)}`}>
                                            {row.status}
                                        </span>
                                    </div>

                                    <div className="mt-3 grid gap-3 text-sm text-slate-700 sm:grid-cols-2">
                                        <p><span className="font-semibold">Club:</span> {row.club_name || '-'}</p>
                                        <p><span className="font-semibold">Fee Slab:</span> {row.fee_key || '-'}</p>
                                        <p><span className="font-semibold">Amount:</span> {Number.isFinite(amount) ? `${amount} ${row.currency || 'INR'}` : '-'}</p>
                                        <p><span className="font-semibold">Attempt:</span> {row.attempt || 1}</p>
                                        <p><span className="font-semibold">Recipient Email:</span> {row.participant_email || '-'}</p>
                                        <p><span className="font-semibold">Recipient Phone:</span> {row.participant_phno || '-'}</p>
                                        <p><span className="font-semibold">Recipient College:</span> {row.participant_college || '-'}</p>
                                        <p><span className="font-semibold">Recipient Dept:</span> {row.participant_dept || '-'}</p>
                                        <p><span className="font-semibold">Submitted At:</span> {formatDateTime(row.created_at)}</p>
                                        <p><span className="font-semibold">Reviewed At:</span> {formatDateTime(reviewedAt)}</p>
                                        {row.comment ? (
                                            <p className="sm:col-span-2"><span className="font-semibold">Payment Note:</span> {row.comment}</p>
                                        ) : null}
                                        {reviewReason ? (
                                            <p className="sm:col-span-2"><span className="font-semibold">Review Note:</span> {reviewReason}</p>
                                        ) : null}
                                    </div>

                                    <div className="mt-3 flex flex-wrap gap-2">
                                        <a href={row.payment_info_url} target="_blank" rel="noreferrer" className="inline-flex">
                                            <Button type="button" variant="outline" className="border-black/20">View Screenshot</Button>
                                        </a>
                                        <Button
                                            type="button"
                                            className="bg-emerald-600 text-white hover:bg-emerald-700"
                                            disabled={!isPending}
                                            onClick={() => {
                                                if (!isPending) return;
                                                setConfirmTarget(row);
                                                setConfirmAcknowledged(false);
                                            }}
                                        >
                                            {normalizedStatus === 'approved' ? 'Approved' : 'Confirm'}
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            className="border-red-300 text-red-700 hover:bg-red-50"
                                            disabled={!isPending}
                                            onClick={() => {
                                                if (!isPending) return;
                                                setDeclineTarget(row);
                                                setDeclineReason('');
                                            }}
                                        >
                                            {normalizedStatus === 'declined' ? 'Declined' : 'Decline'}
                                        </Button>
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                )}

                {!loading && totalCount > 0 ? (
                    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-black/10 pt-4">
                        <p className="text-sm text-slate-600">
                            Showing <span className="font-semibold text-black">{startIndex}</span>-
                            <span className="font-semibold text-black">{endIndex}</span> of{' '}
                            <span className="font-semibold text-black">{totalCount}</span>
                        </p>
                        <div className="flex items-center gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                className="border-black/20"
                                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                                disabled={page <= 1 || loading || refreshing}
                            >
                                Previous
                            </Button>
                            <span className="text-sm font-semibold text-slate-700">
                                Page {page} / {totalPages}
                            </span>
                            <Button
                                type="button"
                                variant="outline"
                                className="border-black/20"
                                onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                                disabled={page >= totalPages || loading || refreshing}
                            >
                                Next
                            </Button>
                        </div>
                    </div>
                ) : null}
            </section>

            <Dialog open={Boolean(confirmTarget)} onOpenChange={(open) => {
                if (!open) {
                    setConfirmTarget(null);
                    setConfirmAcknowledged(false);
                }
            }}>
                <DialogContent className="border-4 border-black bg-white sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="font-heading text-xl font-black">Confirm Payment</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                        <p className="text-sm text-amber-800">
                            Approving payment will mark registration as active. Please verify screenshot, amount and participant details before continuing.
                        </p>
                        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3">
                            <input
                                id="payment-approve-warning"
                                type="checkbox"
                                checked={confirmAcknowledged}
                                onChange={(event) => setConfirmAcknowledged(Boolean(event.target.checked))}
                                className="mt-1 h-4 w-4"
                            />
                            <Label htmlFor="payment-approve-warning" className="text-sm font-medium text-amber-900">
                                I have verified the proof and want to approve this payment.
                            </Label>
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => {
                                    setConfirmTarget(null);
                                    setConfirmAcknowledged(false);
                                }}
                                disabled={confirming}
                            >
                                Cancel
                            </Button>
                            <Button type="button" onClick={submitConfirm} disabled={confirming || !confirmAcknowledged}>
                                {confirming ? 'Confirming...' : 'Confirm'}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={Boolean(declineTarget)} onOpenChange={(open) => (!open ? setDeclineTarget(null) : null)}>
                <DialogContent className="border-4 border-black bg-white sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="font-heading text-xl font-black">Decline Payment</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                        <p className="text-sm text-slate-700">Add an optional reason. Participant can resubmit after decline.</p>
                        <div className="space-y-2">
                            <Label htmlFor="decline-reason">Reason (optional)</Label>
                            <Textarea
                                id="decline-reason"
                                rows={4}
                                value={declineReason}
                                onChange={(event) => setDeclineReason(event.target.value)}
                            />
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button type="button" variant="outline" onClick={() => setDeclineTarget(null)} disabled={declining}>Cancel</Button>
                            <Button
                                type="button"
                                variant="outline"
                                className="border-red-300 text-red-700 hover:bg-red-50"
                                onClick={submitDecline}
                                disabled={declining}
                            >
                                {declining ? 'Declining...' : 'Decline'}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </PersohubAdminLayout>
    );
}
