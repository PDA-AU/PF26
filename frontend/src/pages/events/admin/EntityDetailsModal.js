import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const safeText = (value) => (value === null || value === undefined || value === '' ? '—' : value);

export default function EntityDetailsModal({
    open,
    onOpenChange,
    entity,
    roundStats,
    roundStatsLoading,
    roundStatsError,
    overallPoints,
    overallRank,
    entityMode,
    teamMembers = [],
    departmentLabel,
}) {
    if (!entity) {
        return null;
    }

    const entityName = entity.name || entity.team_name || '—';
    const entityCode = entity.regno_or_code || entity.register_number || entity.team_code || '—';
    const statusText = entity.status || entity.participant_status || '—';
    const roundsCount = roundStats ? roundStats.length : 0;
    const pointsText = typeof overallPoints === 'number' ? overallPoints.toFixed(2) : '—';
    const rankText = typeof overallRank === 'number' ? overallRank : '—';

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl bg-white">
                <DialogHeader>
                    <DialogTitle className="text-2xl font-heading font-black">
                        {entityMode === 'team' ? 'Team Details' : 'Participant Details'}
                    </DialogTitle>
                    <p className="text-sm text-gray-600">Profile + round stats snapshot.</p>
                </DialogHeader>
                <div className="grid gap-6 md:grid-cols-[0.9fr_1.1fr]">
                    <div className="rounded-2xl border-2 border-black bg-[#fff3cc] p-5">
                        <div className="flex flex-col text-left gap-3">
                            <div>
                                <h3 className="font-heading font-bold text-xl">{entityName}</h3>
                                <p className="text-sm text-gray-700">{safeText(entityCode)}</p>
                                {entityMode !== 'team' ? (
                                    <p className="text-sm text-gray-700">{safeText(entity.email)}</p>
                                ) : null}
                            </div>
                            <div className="w-full text-left space-y-2 text-sm">
                                {entityMode !== 'team' ? (
                                    <>
                                        <div className="flex justify-between">
                                            <span className="font-semibold">Department</span>
                                            <span>{departmentLabel || safeText(entity.department)}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="font-semibold">Batch</span>
                                            <span>{safeText(entity.batch)}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="font-semibold">Gender</span>
                                            <span>{safeText(entity.gender)}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="font-semibold">Referrals</span>
                                            <span>{safeText(entity.referral_count)}</span>
                                        </div>
                                    </>
                                ) : (
                                    <div className="flex justify-between">
                                        <span className="font-semibold">Members</span>
                                        <span>{safeText(entity.members_count)}</span>
                                    </div>
                                )}
                                <div className="flex justify-between">
                                    <span className="font-semibold">Status</span>
                                    <span>{safeText(statusText)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="font-semibold">Overall Points</span>
                                    <span>{pointsText}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="font-semibold">Overall Rank</span>
                                    <span>{rankText}</span>
                                </div>
                            </div>
                            {entityMode === 'team' ? (
                                <div className="mt-3">
                                    <h4 className="font-semibold text-sm mb-2">Team Members</h4>
                                    {teamMembers.length === 0 ? (
                                        <p className="text-sm text-gray-600">No members found.</p>
                                    ) : (
                                        <div className="space-y-2">
                                            {teamMembers.map((member) => (
                                                <div key={member.user_id} className="rounded-lg border border-black/20 bg-white px-3 py-2">
                                                    <p className="font-medium text-sm">{member.name}</p>
                                                    <p className="text-xs text-gray-600">{member.regno} · {member.role}</p>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ) : null}
                        </div>
                    </div>

                    <div className="rounded-2xl border-2 border-black bg-white p-5">
                        <div className="flex items-center justify-between mb-4">
                            <h4 className="font-heading font-bold text-lg">Round Stats</h4>
                            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
                                {roundsCount} rounds
                            </span>
                        </div>
                        {roundStatsLoading ? (
                            <div className="text-sm text-gray-600">Loading round stats...</div>
                        ) : roundStatsError ? (
                            <div className="text-sm text-red-600">{roundStatsError}</div>
                        ) : roundsCount === 0 ? (
                            <div className="text-sm text-gray-600">No rounds yet.</div>
                        ) : (
                            <div className="space-y-3">
                                {roundStats.map((round) => (
                                    <details key={round.round_id} className="rounded-xl border border-black/10 bg-[#fff8e1] px-4 py-3">
                                        <summary className="flex cursor-pointer list-none items-center justify-between">
                                            <div>
                                                <p className="text-xs uppercase tracking-[0.2em] text-gray-500">
                                                    {round.round_no} · {round.round_state}
                                                </p>
                                                <p className="font-semibold">{round.round_name}</p>
                                            </div>
                                            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-700">
                                                {round.status}
                                            </span>
                                        </summary>
                                        <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-gray-700">
                                            <div>Present: {round.is_present === null ? '—' : round.is_present ? 'Yes' : 'No'}</div>
                                            <div>Round Score: {round.normalized_score ?? '—'}</div>
                                            <div>Round Rank: {round.round_rank ?? '—'}</div>
                                            <div></div>
                                        </div>
                                    </details>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

