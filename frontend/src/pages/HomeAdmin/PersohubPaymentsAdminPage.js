import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import LoadingState from '@/components/common/LoadingState';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import AdminLayout from '@/pages/HomeAdmin/AdminLayout';
import { ccAdminApi } from '@/pages/HomeAdmin/ccAdminApi';
import { useAuth } from '@/context/AuthContext';

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

export default function PersohubPaymentsAdminPage() {
    const { getAuthHeader } = useAuth();

    const [loading, setLoading] = useState(true);
    const [rows, setRows] = useState([]);
    const [refreshing, setRefreshing] = useState(false);
    const [page, setPage] = useState(1);
    const [pageSize] = useState(20);
    const [totalCount, setTotalCount] = useState(0);

    const [confirmTarget, setConfirmTarget] = useState(null);
    const [confirmPassword, setConfirmPassword] = useState('');
    const [confirming, setConfirming] = useState(false);

    const [declineTarget, setDeclineTarget] = useState(null);
    const [declineReason, setDeclineReason] = useState('');
    const [declining, setDeclining] = useState(false);

    const fetchRows = useCallback(async (isRefresh = false) => {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);
        try {
            const response = await ccAdminApi.listPersohubPayments(getAuthHeader(), {
                page,
                page_size: pageSize,
            });
            const nextRows = Array.isArray(response?.data) ? response.data : [];
            setRows(nextRows);
            setTotalCount(Number(response?.headers?.['x-total-count'] || 0));
        } catch (error) {
            toast.error(error?.response?.data?.detail || 'Failed to load payment queue');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [getAuthHeader, page, pageSize]);

    useEffect(() => {
        fetchRows();
    }, [fetchRows]);

    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    const startIndex = totalCount ? ((page - 1) * pageSize) + 1 : 0;
    const endIndex = totalCount ? Math.min(totalCount, page * pageSize) : 0;

    const submitConfirm = async () => {
        if (!confirmTarget) return;
        if (!confirmPassword.trim()) {
            toast.error('Password is required');
            return;
        }
        setConfirming(true);
        try {
            await ccAdminApi.confirmPersohubPayment(confirmTarget.id, { password: confirmPassword }, getAuthHeader());
            toast.success('Payment approved');
            setConfirmTarget(null);
            setConfirmPassword('');
            fetchRows(true);
        } catch (error) {
            toast.error(error?.response?.data?.detail || 'Failed to approve payment');
        } finally {
            setConfirming(false);
        }
    };

    const submitDecline = async () => {
        if (!declineTarget) return;
        setDeclining(true);
        try {
            await ccAdminApi.declinePersohubPayment(declineTarget.id, { reason: declineReason.trim() || null }, getAuthHeader());
            toast.success('Payment declined');
            setDeclineTarget(null);
            setDeclineReason('');
            fetchRows(true);
        } catch (error) {
            toast.error(error?.response?.data?.detail || 'Failed to decline payment');
        } finally {
            setDeclining(false);
        }
    };

    return (
        <AdminLayout title="Persohub Payments" subtitle="Review and approve paid registrations across clubs." allowEventAdmin>
            <section className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-2xl font-heading font-black">Payments Queue</h2>
                    <Button type="button" variant="outline" onClick={() => fetchRows(true)} disabled={refreshing}>
                        {refreshing ? 'Refreshing...' : 'Refresh'}
                    </Button>
                </div>

                {loading ? (
                    <LoadingState variant="inline" containerClassName="mt-4" />
                ) : rows.length === 0 ? (
                    <p className="mt-4 text-sm text-slate-500">No payments submitted yet.</p>
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
                                            <Button type="button" variant="outline">View Screenshot</Button>
                                        </a>
                                        <Button
                                            type="button"
                                            className="bg-emerald-600 text-white hover:bg-emerald-700"
                                            disabled={!isPending}
                                            onClick={() => {
                                                if (!isPending) return;
                                                setConfirmTarget(row);
                                                setConfirmPassword('');
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
                                onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                                disabled={page >= totalPages || loading || refreshing}
                            >
                                Next
                            </Button>
                        </div>
                    </div>
                ) : null}
            </section>

            <Dialog open={Boolean(confirmTarget)} onOpenChange={(open) => (!open ? setConfirmTarget(null) : null)}>
                <DialogContent className="border-4 border-black bg-white sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="font-heading text-xl font-black">Confirm Payment</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                        <p className="text-sm text-slate-700">Enter your superadmin password to approve this payment.</p>
                        <div className="space-y-2">
                            <Label htmlFor="superadmin-password">Password</Label>
                            <Input
                                id="superadmin-password"
                                type="password"
                                value={confirmPassword}
                                onChange={(event) => setConfirmPassword(event.target.value)}
                            />
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button type="button" variant="outline" onClick={() => setConfirmTarget(null)} disabled={confirming}>Cancel</Button>
                            <Button type="button" onClick={submitConfirm} disabled={confirming}>{confirming ? 'Confirming...' : 'Confirm'}</Button>
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
                            <Label htmlFor="superadmin-decline-reason">Reason (optional)</Label>
                            <Textarea
                                id="superadmin-decline-reason"
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
        </AdminLayout>
    );
}
