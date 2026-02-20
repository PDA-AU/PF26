import React from 'react';

const formatScore = (value) => {
    if (value === null || value === undefined || Number.isNaN(value)) return '—';
    return Number(value).toFixed(1);
};

export default function EventRoundStatsCard({ statsState }) {
    if (!statsState) {
        return (
            <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                    <h4 className="font-heading font-bold text-sm uppercase tracking-wide">Round Stats</h4>
                    <span className="text-xs text-gray-500">—</span>
                </div>
                <div className="text-xs text-gray-500">Loading stats...</div>
            </div>
        );
    }

    const loading = statsState.loading;
    const error = statsState.error;
    const stats = statsState.stats;

    let summary = '—';
    let minScore = '—';
    let maxScore = '—';
    let avgScore = '—';
    let absentCount = 0;
    let top10Lines = 'No scores yet';

    if (stats) {
        const presentCount = typeof stats.present_count === 'number' ? stats.present_count : 0;
        const totalCount = typeof stats.total_count === 'number' ? stats.total_count : 0;
        absentCount = typeof stats.absent_count === 'number' ? stats.absent_count : 0;
        summary = `${presentCount}/${totalCount} present · ${absentCount} absent`;
        minScore = formatScore(stats.min_score);
        maxScore = formatScore(stats.max_score);
        avgScore = formatScore(stats.avg_score);

        if (Array.isArray(stats.top10) && stats.top10.length > 0) {
            top10Lines = stats.top10
                .map((entry, index) => `${index + 1}. ${entry.name} — ${formatScore(entry.normalized_score)}`)
                .join('\n');
        }
    }

    return (
        <div className="mb-4">
            <div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <h4 className="font-heading font-bold text-sm uppercase tracking-wide">Round Stats</h4>
                <span className="text-xs text-gray-500 break-words">{summary}</span>
            </div>
            {loading ? (
                <div className="text-xs text-gray-500">Loading stats...</div>
            ) : error ? (
                <div className="text-xs text-red-500">{error}</div>
            ) : (
                <div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                        <div className="border-2 border-black bg-muted px-2 py-2">
                            <div className="text-[11px] text-gray-500 uppercase">Min</div>
                            <div className="font-bold text-sm">{minScore}</div>
                        </div>
                        <div className="border-2 border-black bg-muted px-2 py-2">
                            <div className="text-[11px] text-gray-500 uppercase">Max</div>
                            <div className="font-bold text-sm">{maxScore}</div>
                        </div>
                        <div className="border-2 border-black bg-muted px-2 py-2">
                            <div className="text-[11px] text-gray-500 uppercase">Average</div>
                            <div className="font-bold text-sm">{avgScore}</div>
                        </div>
                        <div className="border-2 border-black bg-muted px-2 py-2">
                            <div className="text-[11px] text-gray-500 uppercase">Absent</div>
                            <div className="font-bold text-sm">{absentCount}</div>
                        </div>
                    </div>
                    <div className="border-2 border-black">
                        <div className="bg-secondary border-b-2 border-black px-2 py-1 text-xs font-bold uppercase">Top 10</div>
                        <pre className="max-h-40 overflow-x-auto overflow-y-auto px-2 py-2 text-xs whitespace-pre-wrap break-words">{top10Lines}</pre>
                    </div>
                </div>
            )}
        </div>
    );
}
