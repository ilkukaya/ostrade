'use client';

import { useCallback, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Loader2, RefreshCw } from 'lucide-react';
import { advanceSync, getFreshness, startSync } from '@/lib/actions/marketDataSync.actions';
import type { MarketDataSyncProgress } from '@/lib/market-data/sync/syncService';
import type { MarketFreshness } from '@/lib/market-data/sync/freshness';

const MARKETS = [
    { id: 'US', label: 'US' },
    { id: 'TR', label: 'BIST' },
] as const;

const POLL_DELAY_MS = 700;

function FreshnessCard({ freshness }: { freshness: MarketFreshness | null }) {
    if (!freshness) return <div className="text-sm text-gray-500">Loading…</div>;

    return (
        <div className="rounded-2xl border border-gray-800 bg-gray-950/40 p-5">
            <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-white">
                    {freshness.syncedSymbols} / {freshness.totalSymbols} symbols
                </p>
                <span
                    className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${
                        freshness.isCurrent ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                    }`}
                >
                    {freshness.isCurrent ? 'Current' : 'Stale'}
                </span>
            </div>
            <p className="mt-2 text-xs text-gray-500">
                Latest session: {freshness.latestSessionDate ?? '—'} (expected: {freshness.expectedLatestSession})
            </p>
            {freshness.unsyncedSymbols.length > 0 ? (
                <p className="mt-1 text-xs text-amber-400/80">{freshness.unsyncedSymbols.length} never synced</p>
            ) : null}
            {freshness.staleSymbols.length > 0 ? (
                <p className="mt-1 text-xs text-amber-400/80">{freshness.staleSymbols.length} behind the latest session</p>
            ) : null}
        </div>
    );
}

function ProgressBar({ progress }: { progress: MarketDataSyncProgress }) {
    return (
        <div className="flex flex-wrap items-center gap-4 text-sm text-gray-400">
            <span className="flex items-center gap-2">
                {progress.status === 'running' ? <Loader2 className="h-4 w-4 animate-spin text-teal-400" /> : null}
                {progress.processedSymbols} / {progress.totalSymbols} updated
            </span>
            <span>{progress.unchangedSymbols.length} unchanged</span>
            <span className={progress.failedSymbols.length > 0 ? 'text-rose-400' : ''}>{progress.failedSymbols.length} failed</span>
            <span className="text-gray-600">
                +{progress.barsInserted} new bars, {progress.barsUpdated} updated
            </span>
        </div>
    );
}

export default function DataAdminClient({
    initialFreshness,
}: {
    initialFreshness: Record<string, MarketFreshness>;
}) {
    const [freshness, setFreshness] = useState(initialFreshness);
    const [progress, setProgress] = useState<Partial<Record<string, MarketDataSyncProgress>>>({});
    const [expandedMarket, setExpandedMarket] = useState<string | null>(null);
    const activeRequestIds = useRef<Record<string, number>>({ US: 0, TR: 0 });

    const pollMarket = useCallback(async (market: string, forceRefresh: boolean) => {
        const requestId = ++activeRequestIds.current[market];
        try {
            const { runId } = await startSync(market, forceRefresh);
            let current = await advanceSync(runId);
            if (activeRequestIds.current[market] !== requestId) return;
            setProgress((p) => ({ ...p, [market]: current }));

            while (current.status === 'running' && activeRequestIds.current[market] === requestId) {
                await new Promise((resolve) => setTimeout(resolve, POLL_DELAY_MS));
                if (activeRequestIds.current[market] !== requestId) return;
                current = await advanceSync(runId);
                if (activeRequestIds.current[market] !== requestId) return;
                setProgress((p) => ({ ...p, [market]: current }));
            }

            if (activeRequestIds.current[market] === requestId) {
                const updated = await getFreshness(market);
                setFreshness((f) => ({ ...f, [market]: updated }));
            }
        } catch (error) {
            console.error(`Sync failed for ${market}`, error);
        }
    }, []);

    const handleUpdate = (market: string) => pollMarket(market, false);
    const handleUpdateAll = () => {
        for (const m of MARKETS) pollMarket(m.id, false);
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap gap-3">
                {MARKETS.map((m) => (
                    <button
                        key={m.id}
                        type="button"
                        onClick={() => handleUpdate(m.id)}
                        disabled={progress[m.id]?.status === 'running'}
                        className="flex h-9 items-center gap-2 rounded-md border border-teal-700 bg-teal-500/10 px-3 text-sm font-medium text-teal-300 hover:bg-teal-500/20 disabled:opacity-50"
                    >
                        <RefreshCw className={`h-4 w-4 ${progress[m.id]?.status === 'running' ? 'animate-spin' : ''}`} />
                        Update {m.label}
                    </button>
                ))}
                <button
                    type="button"
                    onClick={handleUpdateAll}
                    disabled={MARKETS.some((m) => progress[m.id]?.status === 'running')}
                    className="flex h-9 items-center gap-2 rounded-md border border-gray-700 bg-black/30 px-3 text-sm font-medium text-gray-200 hover:bg-black/50 disabled:opacity-50"
                >
                    <RefreshCw className="h-4 w-4" />
                    Update All
                </button>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {MARKETS.map((m) => (
                    <div key={m.id} className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{m.label}</p>
                        <FreshnessCard freshness={freshness[m.id] ?? null} />
                        {progress[m.id] ? <ProgressBar progress={progress[m.id]!} /> : null}
                        {progress[m.id] && progress[m.id]!.failedSymbols.length > 0 ? (
                            <div>
                                <button
                                    type="button"
                                    onClick={() => setExpandedMarket((e) => (e === m.id ? null : m.id))}
                                    className="flex items-center gap-1 text-xs text-rose-400 hover:underline"
                                >
                                    {expandedMarket === m.id ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                                    {progress[m.id]!.failedSymbols.length} failure(s)
                                </button>
                                {expandedMarket === m.id ? (
                                    <ul className="mt-2 space-y-1 rounded-lg border border-gray-800 bg-black/20 p-3 text-xs text-gray-400">
                                        {progress[m.id]!.failedSymbols.map((f) => (
                                            <li key={f.symbol}>
                                                <span className="font-semibold text-gray-200">{f.symbol}</span> — {f.reason}{' '}
                                                <span className="text-gray-600">({f.provider})</span>
                                            </li>
                                        ))}
                                    </ul>
                                ) : null}
                            </div>
                        ) : null}
                    </div>
                ))}
            </div>

            <p className="text-xs text-gray-600">
                A daily sync only re-fetches a symbol whose latest stored bar is already behind the expected
                completed session — an already-current symbol is skipped, not re-downloaded. See{' '}
                <code className="text-gray-500">docs/daily-data-engine.md</code>.
            </p>
        </div>
    );
}
