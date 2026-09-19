'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Loader2, RefreshCw, TriangleAlert } from 'lucide-react';
import { getWeeklyCandidateChanges, getWeeklyReviewForMarket } from '@/lib/actions/review.actions';
import type { WeeklyCandidateOutcomeChange, WeeklyReviewData, WeeklySymbolSummary } from '@/lib/analysis/weeklyReview';
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

const inputClass = 'h-9 rounded-md border border-gray-700 bg-black/30 px-2 text-sm text-gray-200';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label className="flex flex-col gap-1 text-xs text-gray-500">
            {label}
            {children}
        </label>
    );
}

export default function WeeklyReviewClient({ universes }: { universes: UniverseOption[] }) {
    const [market, setMarket] = useState('US');
    const [universeId, setUniverseId] = useState('');
    const [data, setData] = useState<WeeklyReviewData | null>(null);
    const [candidateChanges, setCandidateChanges] = useState<WeeklyCandidateOutcomeChange[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const marketUniverses = useMemo(() => universes.filter((u) => u.market === market), [universes, market]);

    const load = async (m: string, uid: string) => {
        setIsLoading(true);
        setError(null);
        try {
            const result = await getWeeklyReviewForMarket(m, uid || undefined);
            setData(result);
            if (result.sessionDates.length > 0) {
                setCandidateChanges(await getWeeklyCandidateChanges(result.sessionDates[0]));
            } else {
                setCandidateChanges([]);
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not load the weekly review.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        setUniverseId('');
        load(market, '');
    }, [market]);

    const sortedSymbols = useMemo(() => {
        if (!data) return [];
        return [...data.symbols].sort((a, b) => (b.weeklyScoreChange ?? -Infinity) - (a.weeklyScoreChange ?? -Infinity));
    }, [data]);

    return (
        <div className="min-w-0 max-w-full space-y-6">
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
                    Covers the last {data?.sessionDates.length ?? 5} trading sessions actually generated for this
                    market — a trading week, not a calendar week. Qualified-session counts are descriptive only and
                    never feed back into strategy scoring. See <code className="text-gray-500">docs/daily-data-engine.md</code>.
                </p>
            </div>

            {error ? <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-4 text-sm text-rose-300">{error}</div> : null}

            {isLoading && !data ? (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                </div>
            ) : null}

            {data && data.sessionDates.length === 0 ? (
                <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-300">
                    <TriangleAlert className="h-4 w-4 shrink-0" />
                    No daily analysis history exists for this market yet.
                </div>
            ) : null}

            {data && data.sessionDates.length > 0 ? (
                <>
                    <p className="text-sm text-gray-400">
                        Sessions: <span className="font-semibold text-white">{data.sessionDates.join(' → ')}</span>
                    </p>
                    <WeeklyTable symbols={sortedSymbols} />
                    <CandidateChangesPanel changes={candidateChanges} />
                </>
            ) : null}
        </div>
    );
}

function WeeklyTable({ symbols }: { symbols: WeeklySymbolSummary[] }) {
    if (symbols.length === 0) return <p className="text-sm text-gray-500">No symbols observed in this window.</p>;

    return (
        <div className="ostrade-scroll-x rounded-xl border border-gray-800">
            <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="bg-gray-900/60 text-xs uppercase tracking-wide text-gray-500">
                    <tr>
                        <th className="px-3 py-3">Symbol</th>
                        <th className="px-3 py-3">Score sequence</th>
                        <th className="px-3 py-3 text-right">Weekly Δ score</th>
                        <th className="px-3 py-3 text-right">Weekly return</th>
                        <th className="px-3 py-3 text-right">Qualified days</th>
                        <th className="px-3 py-3 text-right">Status changes</th>
                        <th className="px-3 py-3 text-right">Weekly high / low</th>
                        <th className="px-3 py-3">Latest status</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                    {symbols.map((s) => (
                        <tr key={s.symbol} className="text-gray-300">
                            <td className="px-3 py-3 font-semibold text-white">
                                <Link href={`/stocks/${s.symbol}`} className="hover:text-teal-400">
                                    {s.symbol}
                                </Link>
                            </td>
                            <td className="px-3 py-3 font-mono text-xs text-gray-400">
                                {s.scoreSequence.map((p) => (p.score === null ? '—' : p.score)).join(' → ')}
                            </td>
                            <td className={`px-3 py-3 text-right ${s.weeklyScoreChange === null ? 'text-gray-600' : s.weeklyScoreChange >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {s.weeklyScoreChange === null ? '—' : s.weeklyScoreChange > 0 ? `+${s.weeklyScoreChange}` : s.weeklyScoreChange}
                            </td>
                            <td className={`px-3 py-3 text-right ${s.weeklyReturnPct === null ? 'text-gray-600' : s.weeklyReturnPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {s.weeklyReturnPct === null ? '—' : `${(s.weeklyReturnPct * 100).toFixed(1)}%`}
                            </td>
                            <td className="px-3 py-3 text-right text-gray-400">
                                {s.qualifiedSessionCount} of {s.observedSessionCount}
                            </td>
                            <td className="px-3 py-3 text-right text-gray-400">{s.statusChangeCount}</td>
                            <td className="px-3 py-3 text-right text-gray-400">
                                {s.weeklyHigh !== null ? formatPrice(s.weeklyHigh) : '—'} / {s.weeklyLow !== null ? formatPrice(s.weeklyLow) : '—'}
                            </td>
                            <td className="px-3 py-3">{s.latestStatus ?? '—'}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function CandidateChangesPanel({ changes }: { changes: WeeklyCandidateOutcomeChange[] }) {
    if (changes.length === 0) return null;
    return (
        <div className="rounded-2xl border border-gray-800 bg-gray-950/40 p-5">
            <h2 className="mb-3 text-sm font-semibold text-white">Your candidates that resolved this week</h2>
            <ul className="space-y-2 text-sm">
                {changes.map((c) => (
                    <li key={c.candidateId} className="flex items-center justify-between gap-3 text-gray-300">
                        <Link href={`/candidates`} className="font-semibold text-white hover:text-teal-400">
                            {c.symbol}
                        </Link>
                        <span className="text-gray-500">{c.status.replace(/_/g, ' ')}</span>
                        <span className="text-xs text-gray-600">{new Date(c.closedAt).toLocaleDateString()}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}
