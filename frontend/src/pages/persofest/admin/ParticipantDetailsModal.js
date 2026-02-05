import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const safeText = (value) => (value === null || value === undefined || value === '' ? '—' : value);

export default function ParticipantDetailsModal({
    open,
    onOpenChange,
    participant,
    roundStats,
    roundStatsLoading,
    roundStatsError,
    overallPoints,
    overallRank,
    getProfileImageUrl,
    departmentLabel
}) {
    const hasParticipant = Boolean(participant);
    const roundsCount = roundStats ? roundStats.length : 0;
    const pointsText = typeof overallPoints === 'number' ? overallPoints.toFixed(2) : '—';
    const rankText = typeof overallRank === 'number' ? overallRank : '—';

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl bg-white">
                {hasParticipant ? (
                    <>
                        <DialogHeader>
                            <DialogTitle className="text-2xl font-heading font-black">Participant Details</DialogTitle>
                            <p className="text-sm text-gray-600">Profile + round stats snapshot.</p>
                        </DialogHeader>
                        <div className="grid gap-6 md:grid-cols-[0.9fr_1.1fr]">
                            <div className="rounded-2xl border-2 border-black bg-[#fff3cc] p-5">
                                <div className="flex flex-col items-center text-center gap-3">
                                    {participant.profile_picture ? (
                                        <img
                                            src={getProfileImageUrl(participant)}
                                            alt={participant.name}
                                            className="h-28 w-28 rounded-full border-4 border-black object-cover"
                                        />
                                    ) : (
                                        <div className="h-28 w-28 rounded-full border-4 border-black bg-white text-3xl font-bold flex items-center justify-center">
                                            {participant.name ? participant.name.charAt(0).toUpperCase() : '?'}
                                        </div>
                                    )}
                                    <div>
                                        <h3 className="font-heading font-bold text-xl">{participant.name}</h3>
                                        <p className="text-sm text-gray-700">{safeText(participant.register_number)}</p>
                                        <p className="text-sm text-gray-700">{safeText(participant.email)}</p>
                                    </div>
                                    <div className="w-full text-left space-y-2 text-sm">
                                        <div className="flex justify-between">
                                            <span className="font-semibold">Department</span>
                                            <span>{departmentLabel || participant.department}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="font-semibold">Year</span>
                                            <span>{safeText(participant.year_of_study)}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="font-semibold">Gender</span>
                                            <span>{safeText(participant.gender)}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="font-semibold">Status</span>
                                            <span>{safeText(participant.status)}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="font-semibold">Overall Points</span>
                                            <span>{pointsText}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="font-semibold">Overall Rank</span>
                                            <span>{rankText}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="font-semibold">Referrals</span>
                                            <span>{safeText(participant.referral_count)}</span>
                                        </div>
                                    </div>
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
                    </>
                ) : null}
            </DialogContent>
        </Dialog>
    );
}
