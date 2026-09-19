'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight, ExternalLink, X } from 'lucide-react';
import { cancelCandidate } from '@/lib/actions/candidate.actions';
import { isClosedStatus, type SerializedCandidate } from '@/lib/candidates/types';
import type { CandidateStatus } from '@/database/models/candidate.model';
import { formatPrice } from '@/lib/utils';
import { RuleRow, statusClasses as analysisStatusClasses, statusLabel as analysisStatusLabel } from '@/components/swing/shared';

const STATUS_META: Record<CandidateStatus, { label: string; classes: string }> = {
    ACTIVE: { label: 'Active', classes: 'bg-blue-500/10 text-blue-300 border-blue-500/30' },
    TARGET_1_HIT: { label: 'Target 1 Hit', classes: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
    TARGET_2_HIT: { label: 'Target 2 Hit', classes: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
    STOP_HIT: { label: 'Stop Hit', classes: 'bg-rose-500/10 text-rose-400 border-rose-500/30' },
    EXPIRED: { label: 'Expired', classes: 'bg-gray-500/10 text-gray-400 border-gray-500/30' },
    CANCELLED: { label: 'Cancelled', classes: 'bg-gray-500/10 text-gray-500 border-gray-500/30' },
    AMBIGUOUS: { label: 'Ambiguous', classes: 'bg-amber-500/10 text-amber-300 border-amber-500/30' },
};

function outcomeDate(c: SerializedCandidate): string | null {
    return c.firstTargetHitAt ?? c.stopHitAt ?? c.secondTargetHitAt ?? c.closedAt ?? null;
}

function formatZone(zone?: { low: number; high: number }): string {
    if (!zone) return '—';
    return `${formatPrice(zone.low)} - ${formatPrice(zone.high)}`;
}

/** Only long setups exist today (see docs/candidates.md), so this always
 * prefills direction=LONG — will need revisiting once a short setup ships. */
function logTradeQuery(candidate: SerializedCandidate): string {
    const params = new URLSearchParams({ candidateId: candidate._id, symbol: candidate.symbol, direction: 'LONG' });
    if (candidate.stopLevel !== undefined) params.set('stopLevel', String(candidate.stopLevel));
    if (candidate.targets?.[0] !== undefined) params.set('target1', String(candidate.targets[0]));
    if (candidate.targets?.[1] !== undefined) params.set('target2', String(candidate.targets[1]));
    return params.toString();
}

interface Filters {
    status: 'ALL' | 'ACTIVE' | 'CLOSED';
    setupType: string;
    minScore: number;
    symbol: string;
    from: string;
    to: string;
}

const DEFAULT_FILTERS: Filters = { status: 'ALL', setupType: 'ALL', minScore: 0, symbol: '', from: '', to: '' };

export default function CandidatesClient({
    candidates,
    currentPriceBySymbol,
}: {
    candidates: SerializedCandidate[];
    currentPriceBySymbol: Record<string, number>;
}) {
    const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [items, setItems] = useState(candidates);
    const [isPending, startTransition] = useTransition();

    const filtered = useMemo(() => {
        return items.filter((c) => {
            if (filters.status === 'ACTIVE' && c.status !== 'ACTIVE') return false;
            if (filters.status === 'CLOSED' && !isClosedStatus(c.status)) return false;
            if (filters.setupType !== 'ALL' && c.setupType !== filters.setupType) return false;
            if (c.score < filters.minScore) return false;
            if (filters.symbol && !c.symbol.toUpperCase().includes(filters.symbol.toUpperCase())) return false;
            if (filters.from && c.signalAt < filters.from) return false;
            if (filters.to && c.signalAt > filters.to) return false;
            return true;
        });
    }, [items, filters]);

    const handleCancel = (candidateId: string) => {
        startTransition(async () => {
            await cancelCandidate(candidateId);
            setItems((prev) => prev.map((c) => (c._id === candidateId ? { ...c, status: 'CANCELLED' as const, closedAt: new Date().toISOString() } : c)));
        });
    };

    if (candidates.length === 0) {
        return (
            <div className="rounded-lg border border-gray-800 bg-black/20 p-8 text-center text-sm text-gray-500">
                No candidates saved yet. Save one from the{' '}
                <Link href="/scanner" className="text-teal-400 hover:underline">
                    Scanner
                </Link>{' '}
                or from a stock&apos;s Swing Analysis panel.
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-4 rounded-2xl border border-gray-800 bg-gray-950/40 p-4">
                <Field label="Status">
                    <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value as Filters['status'] }))} className={selectClass}>
                        <option value="ALL">All</option>
                        <option value="ACTIVE">Active</option>
                        <option value="CLOSED">Closed</option>
                    </select>
                </Field>
                <Field label="Setup">
                    <select value={filters.setupType} onChange={(e) => setFilters((f) => ({ ...f, setupType: e.target.value }))} className={selectClass}>
                        <option value="ALL">All setups</option>
                        <option value="BREAKOUT">Breakout</option>
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
                <Field label="Symbol">
                    <input
                        type="text"
                        value={filters.symbol}
                        onChange={(e) => setFilters((f) => ({ ...f, symbol: e.target.value }))}
                        placeholder="e.g. AAPL"
                        className="h-9 w-24 rounded-md border border-gray-700 bg-black/30 px-2 text-sm text-gray-200"
                    />
                </Field>
                <Field label="From">
                    <input type="date" value={filters.from} onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))} className={selectClass} />
                </Field>
                <Field label="To">
                    <input type="date" value={filters.to} onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))} className={selectClass} />
                </Field>
                <span className="text-xs text-gray-500">
                    Showing {filtered.length} of {items.length}
                </span>
            </div>

            <div className="overflow-x-auto rounded-xl border border-gray-800">
                <table className="w-full min-w-[1100px] text-left text-sm">
                    <thead className="bg-gray-900/60 text-xs uppercase tracking-wide text-gray-500">
                        <tr>
                            <th className="w-8 px-3 py-3" />
                            <th className="px-3 py-3">Date</th>
                            <th className="px-3 py-3">Symbol</th>
                            <th className="px-3 py-3">Setup</th>
                            <th className="px-3 py-3 text-right">Score</th>
                            <th className="px-3 py-3">Entry Zone</th>
                            <th className="px-3 py-3 text-right">Stop</th>
                            <th className="px-3 py-3 text-right">Target 1</th>
                            <th className="px-3 py-3 text-right">Target 2</th>
                            <th className="px-3 py-3 text-right">R/R</th>
                            <th className="px-3 py-3">Outcome</th>
                            <th className="px-3 py-3 text-right">Current Price</th>
                            <th className="px-3 py-3" />
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                        {filtered.map((candidate) => (
                            <CandidateRow
                                key={candidate._id}
                                candidate={candidate}
                                currentPrice={currentPriceBySymbol[candidate.symbol]}
                                expanded={expandedId === candidate._id}
                                onToggleExpand={() => setExpandedId((id) => (id === candidate._id ? null : candidate._id))}
                                onCancel={() => handleCancel(candidate._id)}
                                cancelling={isPending}
                            />
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

const selectClass = 'h-9 rounded-md border border-gray-700 bg-black/30 px-3 text-sm text-gray-200';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label className="flex flex-col gap-1 text-xs text-gray-500">
            {label}
            {children}
        </label>
    );
}

function CandidateRow({
    candidate,
    currentPrice,
    expanded,
    onToggleExpand,
    onCancel,
    cancelling,
}: {
    candidate: SerializedCandidate;
    currentPrice: number | undefined;
    expanded: boolean;
    onToggleExpand: () => void;
    onCancel: () => void;
    cancelling: boolean;
}) {
    const meta = STATUS_META[candidate.status];
    const outcomeAt = outcomeDate(candidate);

    return (
        <>
            <tr className="hover:bg-white/5">
                <td className="px-3 py-3">
                    <button type="button" onClick={onToggleExpand} className="text-gray-500 hover:text-gray-300">
                        {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                </td>
                <td className="px-3 py-3 text-gray-400">{new Date(candidate.signalAt).toLocaleDateString()}</td>
                <td className="px-3 py-3 font-semibold text-white">
                    <Link href={`/stocks/${candidate.symbol}`} className="hover:text-teal-400">
                        {candidate.symbol}
                    </Link>
                </td>
                <td className="px-3 py-3 text-gray-300">{candidate.setupType ? candidate.setupType.replace(/_/g, ' ') : '—'}</td>
                <td className="px-3 py-3 text-right font-semibold text-white">
                    {candidate.score}
                    <span className="text-gray-600">/{candidate.maxScore}</span>
                </td>
                <td className="px-3 py-3 text-gray-300">{formatZone(candidate.entryZone)}</td>
                <td className="px-3 py-3 text-right text-gray-300">{candidate.stopLevel !== undefined ? formatPrice(candidate.stopLevel) : '—'}</td>
                <td className="px-3 py-3 text-right text-gray-300">{candidate.targets?.[0] !== undefined ? formatPrice(candidate.targets[0]) : '—'}</td>
                <td className="px-3 py-3 text-right text-gray-300">{candidate.targets?.[1] !== undefined ? formatPrice(candidate.targets[1]) : '—'}</td>
                <td className="px-3 py-3 text-right text-gray-300">{candidate.riskReward !== undefined ? `1:${candidate.riskReward.toFixed(2)}` : '—'}</td>
                <td className="px-3 py-3">
                    <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${meta.classes}`}>{meta.label}</span>
                    {outcomeAt ? <div className="mt-1 text-[11px] text-gray-600">{new Date(outcomeAt).toLocaleDateString()}</div> : null}
                </td>
                <td className="px-3 py-3 text-right text-gray-300">{currentPrice !== undefined ? formatPrice(currentPrice) : '—'}</td>
                <td className="px-3 py-3 text-right">
                    {candidate.status === 'ACTIVE' ? (
                        <button
                            type="button"
                            onClick={onCancel}
                            disabled={cancelling}
                            className="text-gray-500 hover:text-rose-400 disabled:opacity-50"
                            title="Cancel this candidate"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    ) : null}
                </td>
            </tr>
            {expanded ? (
                <tr>
                    <td colSpan={13} className="bg-black/30 px-6 py-4">
                        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                                <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Signal Snapshot</span>
                                <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${analysisStatusClasses(candidate.analysisStatus)}`}>
                                    {analysisStatusLabel(candidate.analysisStatus)}
                                </span>
                                <span className="text-xs text-gray-600">
                                    Frozen at {new Date(candidate.signalAt).toLocaleString()} — never recalculated
                                </span>
                            </div>
                            <div className="flex items-center gap-4">
                                <Link
                                    href={`/journal/new?${logTradeQuery(candidate)}`}
                                    className="flex items-center gap-1 text-xs font-medium text-teal-400 hover:underline"
                                >
                                    Log Trade From This
                                </Link>
                                <Link href={`/stocks/${candidate.symbol}`} className="flex items-center gap-1 text-xs font-medium text-teal-400 hover:underline">
                                    View Current Analysis <ExternalLink className="h-3 w-3" />
                                </Link>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                            {candidate.rules.map((rule) => (
                                <RuleRow key={rule.id} rule={rule} />
                            ))}
                        </div>

                        <div className="mt-4 grid grid-cols-2 gap-4 text-xs text-gray-400 md:grid-cols-4">
                            <div>
                                <span className="text-gray-600">RSI at signal</span>
                                <p className="text-gray-200">{candidate.indicatorSnapshot.rsi14?.toFixed(1) ?? '—'}</p>
                            </div>
                            <div>
                                <span className="text-gray-600">Relative Volume at signal</span>
                                <p className="text-gray-200">
                                    {candidate.indicatorSnapshot.relativeVolume !== null ? `${candidate.indicatorSnapshot.relativeVolume.toFixed(2)}x` : '—'}
                                </p>
                            </div>
                            <div>
                                <span className="text-gray-600">Trend at signal</span>
                                <p className="text-gray-200">{candidate.indicatorSnapshot.trend}</p>
                            </div>
                            <div>
                                <span className="text-gray-600">Strategy</span>
                                <p className="text-gray-200">
                                    {candidate.strategyId} v{candidate.strategyVersion}
                                </p>
                            </div>
                        </div>
                    </td>
                </tr>
            ) : null}
        </>
    );
}
