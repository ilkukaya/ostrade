'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Loader2, RefreshCw, TriangleAlert } from 'lucide-react';
import { getDailyReviewForMarket } from '@/lib/actions/review.actions';
import type { DailyReviewData, DailyReviewRow } from '@/lib/analysis/dailyReview';
import type { DailyChangeClassification } from '@/lib/analysis/dailyChangeClassification';
import type { TrendDirection } from '@/lib/technical/trend';
import { formatPrice } from '@/lib/utils';

interface UniverseOption {
    id: string;
    name: string;
    market: string;
    symbolCount: number | null;
    partial?: boolean;
}

const MARKETS = [
    { id: 'US', label: 'US' },
    { id: 'TR', label: 'BIST' },
];

const CLASSIFICATION_LABELS: Record<DailyChangeClassification, string> = {
    NEW_SETUP: 'New setup',
    NEWLY_QUALIFIED: 'Newly qualified',
    SCORE_IMPROVED: 'Score improved',
    SCORE_DETERIORATED: 'Score deteriorated',
    LOST_QUALIFICATION: 'Lost qualification',
    SETUP_INVALIDATED: 'Setup invalidated',
    NO_MATERIAL_CHANGE: 'No material change',
};

const CLASSIFICATION_BADGE_CLASSES: Record<DailyChangeClassification, string> = {
    NEW_SETUP: 'border-teal-500/30 bg-teal-500/10 text-teal-300',
    NEWLY_QUALIFIED: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
    SCORE_IMPROVED: 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400',
    SCORE_DETERIORATED: 'border-amber-500/20 bg-amber-500/5 text-amber-300',
    LOST_QUALIFICATION: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
    SETUP_INVALIDATED: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
    NO_MATERIAL_CHANGE: 'border-gray-700 bg-black/20 text-gray-500',
};

const TREND_LABELS: Record<TrendDirection, string> = {
    UP: 'Bullish',
    DOWN: 'Bearish',
    SIDEWAYS: 'Sideways',
    UNKNOWN: 'Unknown',
};

interface Filters {
    classification: 'ALL' | DailyChangeClassification;
    minScore: number;
    minScoreIncrease: number;
    minRelativeVolume: number;
    trend: 'ALL' | TrendDirection;
}

const DEFAULT_FILTERS: Filters = {
    classification: 'ALL',
    minScore: 0,
    minScoreIncrease: 0,
    minRelativeVolume: 0,
    trend: 'ALL',
};

const inputClass = 'h-9 rounded-md border border-gray-700 bg-black/30 px-2 text-sm text-gray-200';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label className="flex flex-col gap-1 text-xs text-gray-500">
            {label}
            {children}
        </label>
    );
}

export default function DailyReviewClient({ universes }: { universes: UniverseOption[] }) {
    const [market, setMarket] = useState('US');
    const [universeId, setUniverseId] = useState<string>('');
    const [data, setData] = useState<DailyReviewData | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);

    const marketUniverses = useMemo(() => universes.filter((u) => u.market === market), [universes, market]);

    const load = async (m: string, uid: string) => {
        setIsLoading(true);
        setError(null);
        try {
            const result = await getDailyReviewForMarket(m, uid || undefined);
            setData(result);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not load the daily review.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        setUniverseId('');
        load(market, '');
    }, [market]);

    const filteredRows = useMemo(() => {
        if (!data) return [];
        return data.rows
            .filter((r) => filters.classification === 'ALL' || r.changeClassification === filters.classification)
            .filter((r) => r.score >= filters.minScore)
            .filter((r) => filters.minScoreIncrease === 0 || (r.scoreChange ?? -Infinity) >= filters.minScoreIncrease)
            .filter((r) => filters.minRelativeVolume === 0 || (r.relativeVolume ?? 0) >= filters.minRelativeVolume)
            .filter((r) => filters.trend === 'ALL' || r.trend === filters.trend);
    }, [data, filters]);

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 rounded-2xl border border-gray-800 bg-gray-950/40 p-5 backdrop-blur-sm">
                <div className="flex flex-wrap items-end gap-4">
                    <Field label="Market">
                        <select value={market} onChange={(e) => setMarket(e.target.value)} className={inputClass}>
                            {MARKETS.map((m) => (
                                <option key={m.id} value={m.id}>
                                    {m.label}
                                </option>
                            ))}
                        </select>
                    </Field>
                    <Field label="Universe">
                        <select value={universeId} onChange={(e) => { setUniverseId(e.target.value); load(market, e.target.value); }} className={inputClass}>
                            <option value="">All tracked symbols</option>
                            {marketUniverses.map((u) => (
                                <option key={u.id} value={u.id}>
                                    {u.name}
                                    {u.symbolCount !== null ? ` (${u.partial ? '~' : ''}${u.symbolCount})` : ''}
                                </option>
                            ))}
                        </select>
                    </Field>
                    <Field label="Status change">
                        <select
                            value={filters.classification}
                            onChange={(e) => setFilters((f) => ({ ...f, classification: e.target.value as Filters['classification'] }))}
                            className={inputClass}
                        >
                            <option value="ALL">All</option>
                            {(Object.keys(CLASSIFICATION_LABELS) as DailyChangeClassification[]).map((c) => (
                                <option key={c} value={c}>
                                    {CLASSIFICATION_LABELS[c]}
                                </option>
                            ))}
                        </select>
                    </Field>
                    <Field label="Min score">
                        <input
                            type="number"
                            min={0}
                            max={100}
                            value={filters.minScore}
                            onChange={(e) => setFilters((f) => ({ ...f, minScore: e.target.valueAsNumber || 0 }))}
                            className="h-9 w-20 rounded-md border border-gray-700 bg-black/30 px-2 text-sm text-gray-200"
                        />
                    </Field>
                    <Field label="Min score increase">
                        <input
                            type="number"
                            value={filters.minScoreIncrease}
                            onChange={(e) => setFilters((f) => ({ ...f, minScoreIncrease: e.target.valueAsNumber || 0 }))}
                            className="h-9 w-24 rounded-md border border-gray-700 bg-black/30 px-2 text-sm text-gray-200"
                        />
                    </Field>
                    <Field label="Min RVOL">
                        <input
                            type="number"
                            step={0.1}
                            min={0}
                            value={filters.minRelativeVolume}
                            onChange={(e) => setFilters((f) => ({ ...f, minRelativeVolume: e.target.valueAsNumber || 0 }))}
                            className="h-9 w-20 rounded-md border border-gray-700 bg-black/30 px-2 text-sm text-gray-200"
                        />
                    </Field>
                    <Field label="Trend">
                        <select value={filters.trend} onChange={(e) => setFilters((f) => ({ ...f, trend: e.target.value as Filters['trend'] }))} className={inputClass}>
                            <option value="ALL">All</option>
                            {(Object.keys(TREND_LABELS) as TrendDirection[]).map((t) => (
                                <option key={t} value={t}>
                                    {TREND_LABELS[t]}
                                </option>
                            ))}
                        </select>
                    </Field>
                    <button
                        type="button"
                        onClick={() => load(market, universeId)}
                        disabled={isLoading}
                        className="flex h-9 items-center gap-2 rounded-md border border-gray-700 bg-black/30 px-3 text-sm font-medium text-gray-200 hover:bg-black/50 disabled:opacity-50"
                    >
                        <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                        Refresh
                    </button>
                </div>
                <p className="text-xs text-gray-600">
                    Purely descriptive research context — never a buy/sell instruction. See <code className="text-gray-500">docs/daily-data-engine.md</code>.
                </p>
            </div>

            {error ? <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-4 text-sm text-rose-300">{error}</div> : null}

            {isLoading && !data ? (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                </div>
            ) : null}

            {data && !data.marketDate ? (
                <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-300">
                    <TriangleAlert className="h-4 w-4 shrink-0" />
                    No daily analysis has been generated for this market yet. Sync market data, then generate the
                    daily analysis snapshot, from <Link href="/data" className="underline">/data</Link>.
                </div>
            ) : null}

            {data && data.marketDate ? (
                <>
                    <div className="flex flex-wrap items-center gap-4 text-sm text-gray-400">
                        <span>
                            Session: <span className="font-semibold text-white">{data.marketDate}</span>
                        </span>
                        <span>{data.rows.length} tracked</span>
                        <span>{filteredRows.length} shown</span>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        {(Object.keys(CLASSIFICATION_LABELS) as DailyChangeClassification[])
                            .filter((c) => c !== 'NO_MATERIAL_CHANGE')
                            .map((c) => (
                                <span key={c} className={`rounded-full border px-3 py-1 text-xs font-semibold ${CLASSIFICATION_BADGE_CLASSES[c]}`}>
                                    {CLASSIFICATION_LABELS[c]}: {data.countsByClassification[c]}
                                </span>
                            ))}
                    </div>

                    <ResultsTable rows={filteredRows} />
                </>
            ) : null}
        </div>
    );
}

function ResultsTable({ rows }: { rows: DailyReviewRow[] }) {
    if (rows.length === 0) {
        return <p className="text-sm text-gray-500">No symbols match these filters.</p>;
    }

    return (
        <div className="overflow-x-auto rounded-xl border border-gray-800">
            <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="bg-gray-900/60 text-xs uppercase tracking-wide text-gray-500">
                    <tr>
                        <th className="px-3 py-3">Symbol</th>
                        <th className="px-3 py-3 text-right">Close</th>
                        <th className="px-3 py-3">Status change</th>
                        <th className="px-3 py-3 text-right">Score</th>
                        <th className="px-3 py-3 text-right">Score change</th>
                        <th className="px-3 py-3">Setup</th>
                        <th className="px-3 py-3">Status</th>
                        <th className="px-3 py-3 text-right">RSI</th>
                        <th className="px-3 py-3 text-right">RVOL</th>
                        <th className="px-3 py-3">Trend</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                    {rows.map((r) => (
                        <tr key={r.symbol} className="text-gray-300">
                            <td className="px-3 py-3 font-semibold text-white">
                                <Link href={`/stocks/${r.symbol}`} className="hover:text-teal-400">
                                    {r.symbol}
                                </Link>
                            </td>
                            <td className="px-3 py-3 text-right">{formatPrice(r.close)}</td>
                            <td className="px-3 py-3">
                                <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${CLASSIFICATION_BADGE_CLASSES[r.changeClassification]}`}>
                                    {CLASSIFICATION_LABELS[r.changeClassification]}
                                </span>
                            </td>
                            <td className="px-3 py-3 text-right">
                                {r.score}
                                <span className="text-gray-600"> / {r.maxScore}</span>
                            </td>
                            <td className={`px-3 py-3 text-right ${r.scoreChange === null ? 'text-gray-600' : r.scoreChange >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {r.scoreChange === null ? '—' : r.scoreChange > 0 ? `+${r.scoreChange}` : r.scoreChange}
                            </td>
                            <td className="px-3 py-3 text-gray-400">{r.setupType ?? '—'}</td>
                            <td className="px-3 py-3">{r.status}</td>
                            <td className="px-3 py-3 text-right">{r.rsi !== null ? r.rsi.toFixed(1) : '—'}</td>
                            <td className="px-3 py-3 text-right">{r.relativeVolume !== null ? `${r.relativeVolume.toFixed(2)}x` : '—'}</td>
                            <td className="px-3 py-3 text-gray-400">{TREND_LABELS[r.trend]}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
