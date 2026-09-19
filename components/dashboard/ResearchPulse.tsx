import Link from 'next/link';
import type { DashboardResearchPulse, WatchlistChangeSummary } from '@/lib/actions/review.actions';

const MARKET_LABELS: Record<string, string> = { US: 'US', TR: 'BIST' };

export default function ResearchPulse({
    pulse,
    watchlistChanges,
}: {
    pulse: DashboardResearchPulse;
    watchlistChanges: WatchlistChangeSummary[];
}) {
    const markets = ['US', 'TR'];
    const notableWatchlist = watchlistChanges.filter((w) => w.classification && w.classification !== 'NO_MATERIAL_CHANGE');

    return (
        <section className="w-full space-y-4 rounded-2xl border border-gray-800 bg-gray-950/40 p-5 backdrop-blur-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-white">Daily Research Pulse</h2>
                <Link href="/review" className="text-xs font-medium text-teal-400 hover:underline">
                    Open Daily Review →
                </Link>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {markets.map((m) => {
                    const freshness = pulse.freshness[m];
                    const review = pulse.dailyReview[m];
                    const counts = review.countsByClassification;
                    return (
                        <div key={m} className="rounded-xl border border-gray-800 bg-black/20 p-4">
                            <div className="flex items-center justify-between">
                                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{MARKET_LABELS[m] ?? m}</p>
                                <span
                                    className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                                        freshness.isCurrent
                                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                                            : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                                    }`}
                                >
                                    {freshness.isCurrent ? 'Data current' : 'Data stale'}
                                </span>
                            </div>
                            <p className="mt-1 text-xs text-gray-600">
                                {review.marketDate ? `Analysis for session ${review.marketDate}` : 'No daily analysis generated yet'}
                            </p>
                            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-400">
                                <Stat label="New today" value={counts.NEW_SETUP} />
                                <Stat label="Newly qualified" value={counts.NEWLY_QUALIFIED} />
                                <Stat label="Improved" value={counts.SCORE_IMPROVED} />
                                <Stat label="Deteriorated" value={counts.SCORE_DETERIORATED} />
                            </dl>
                        </div>
                    );
                })}
            </div>

            <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Watchlist changes</p>
                {notableWatchlist.length === 0 ? (
                    <p className="mt-1 text-xs text-gray-600">
                        {watchlistChanges.length === 0 ? 'Your watchlist is empty.' : 'No notable changes today.'}
                    </p>
                ) : (
                    <ul className="mt-2 flex flex-wrap gap-2">
                        {notableWatchlist.map((w) => (
                            <li key={w.symbol}>
                                <Link
                                    href={`/stocks/${w.symbol}`}
                                    className="rounded-full border border-gray-700 bg-black/30 px-2 py-1 text-xs text-gray-300 hover:border-teal-700"
                                >
                                    {w.symbol} · {w.classification}
                                </Link>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            <Link href="/data" className="block text-xs text-gray-600 hover:text-gray-400">
                Manage market data sync →
            </Link>
        </section>
    );
}

function Stat({ label, value }: { label: string; value: number }) {
    return (
        <div className="flex items-center justify-between rounded-lg bg-gray-900/40 px-2 py-1">
            <span>{label}</span>
            <span className="font-semibold text-white">{value}</span>
        </div>
    );
}
