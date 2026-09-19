'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight, Loader2, RefreshCw } from 'lucide-react';
import { scanUniverse } from '@/lib/actions/scanner.actions';
import type { ScannerProgress, ScannerResult } from '@/lib/scanner/types';
import { ruleCounts } from '@/lib/scanner/types';
import type { SetupType } from '@/lib/swing/types';
import type { TrendDirection } from '@/lib/technical/trend';
import { formatChangePercent, formatPrice, getChangeColorClass } from '@/lib/utils';
import { RuleRow, statusClasses, statusLabel } from '@/components/swing/shared';
import SaveCandidateButton from '@/components/swing/SaveCandidateButton';

interface UniverseOption {
    id: string;
    name: string;
    market: string;
    symbolCount: number | null;
    partial?: boolean;
}

const POLL_DELAY_MS = 700;

const TREND_LABELS: Record<TrendDirection, string> = {
    UP: 'Bullish',
    DOWN: 'Bearish',
    SIDEWAYS: 'Sideways',
    UNKNOWN: 'Unknown',
};

interface Filters {
    minScore: number;
    setupType: 'ALL' | SetupType;
    minRiskReward: number;
    minRelativeVolume: number;
    rsiMin: number;
    rsiMax: number;
    trend: 'ALL' | TrendDirection;
}

const DEFAULT_FILTERS: Filters = {
    minScore: 60,
    setupType: 'ALL',
    minRiskReward: 0,
    minRelativeVolume: 0,
    rsiMin: 0,
    rsiMax: 100,
    trend: 'ALL',
};

type SortKey = 'score' | 'riskReward' | 'relativeVolume' | 'changePercent';

function sortValue(result: ScannerResult, key: SortKey): number {
    switch (key) {
        case 'score':
            return result.analysis.score;
        case 'riskReward':
            return result.analysis.riskReward ?? -Infinity;
        case 'relativeVolume':
            return result.relativeVolume ?? -Infinity;
        case 'changePercent':
            return result.changePercent;
        default:
            return 0;
    }
}

export default function ScannerClient({ universes }: { universes: UniverseOption[] }) {
    const defaultUniverseId = universes.find((u) => u.id === 'dow-30')?.id ?? universes[0]?.id ?? '';
    const [universeId, setUniverseId] = useState(defaultUniverseId);
    const [progress, setProgress] = useState<ScannerProgress | null>(null);
    const [isPolling, setIsPolling] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
    const [sortBy, setSortBy] = useState<SortKey>('score');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
    const [expandedSymbol, setExpandedSymbol] = useState<string | null>(null);

    // Guards against a stale poll response overwriting state after the user
    // switches universes or hits Refresh mid-scan.
    const activeRequestId = useRef(0);

    const runScan = useCallback(async (uid: string, forceRefresh = false) => {
        if (!uid) return;
        const requestId = ++activeRequestId.current;
        setIsPolling(true);
        setError(null);

        try {
            let current = await scanUniverse({ universeId: uid, forceRefresh });
            if (activeRequestId.current !== requestId) return;
            setProgress(current);

            while (current.status === 'running' && activeRequestId.current === requestId) {
                await new Promise((resolve) => setTimeout(resolve, POLL_DELAY_MS));
                if (activeRequestId.current !== requestId) return;
                current = await scanUniverse({ universeId: uid });
                if (activeRequestId.current !== requestId) return;
                setProgress(current);
            }
        } catch (e) {
            if (activeRequestId.current === requestId) {
                setError(e instanceof Error ? e.message : 'Scan failed.');
            }
        } finally {
            if (activeRequestId.current === requestId) setIsPolling(false);
        }
    }, []);

    useEffect(() => {
        setProgress(null);
        setExpandedSymbol(null);
        runScan(universeId);
    }, [universeId, runScan]);

    const filteredResults = useMemo(() => {
        if (!progress) return [];

        return progress.results
            .filter((r) => r.analysis.score >= filters.minScore)
            .filter((r) => filters.setupType === 'ALL' || r.analysis.setupType === filters.setupType)
            .filter((r) => filters.minRiskReward === 0 || (r.analysis.riskReward ?? 0) >= filters.minRiskReward)
            .filter((r) => filters.minRelativeVolume === 0 || (r.relativeVolume ?? 0) >= filters.minRelativeVolume)
            .filter((r) => r.rsi === null || (r.rsi >= filters.rsiMin && r.rsi <= filters.rsiMax))
            .filter((r) => filters.trend === 'ALL' || r.trend === filters.trend)
            .sort((a, b) => (sortValue(a, sortBy) - sortValue(b, sortBy)) * (sortDir === 'desc' ? -1 : 1));
    }, [progress, filters, sortBy, sortDir]);

    const qualifiedCount = useMemo(
        () => (progress ? progress.results.filter((r) => r.analysis.status === 'QUALIFIED').length : 0),
        [progress],
    );

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 rounded-2xl border border-gray-800 bg-gray-950/40 p-5 backdrop-blur-sm">
                <div className="flex flex-wrap items-end gap-4">
                    <Field label="Universe">
                        <select
                            value={universeId}
                            onChange={(e) => setUniverseId(e.target.value)}
                            className="h-9 rounded-md border border-gray-700 bg-black/30 px-3 text-sm text-gray-200"
                        >
                            {universes.map((u) => (
                                <option key={u.id} value={u.id}>
                                    {u.name}
                                    {u.symbolCount !== null ? ` (${u.partial ? '~' : ''}${u.symbolCount})` : ''}
                                </option>
                            ))}
                        </select>
                    </Field>

                    <button
                        type="button"
                        onClick={() => runScan(universeId, true)}
                        disabled={isPolling}
                        className="flex h-9 items-center gap-2 rounded-md border border-gray-700 bg-black/30 px-3 text-sm font-medium text-gray-200 hover:bg-black/50 disabled:opacity-50"
                    >
                        <RefreshCw className={`h-4 w-4 ${isPolling ? 'animate-spin' : ''}`} />
                        Refresh
                    </button>

                    <Field label="Min score">
                        <NumberInput value={filters.minScore} onChange={(v) => setFilters((f) => ({ ...f, minScore: v }))} min={0} max={100} />
                    </Field>

                    <Field label="Setup">
                        <select
                            value={filters.setupType}
                            onChange={(e) => setFilters((f) => ({ ...f, setupType: e.target.value as Filters['setupType'] }))}
                            className="h-9 rounded-md border border-gray-700 bg-black/30 px-3 text-sm text-gray-200"
                        >
                            <option value="ALL">All setups</option>
                            <option value="BREAKOUT">Breakout</option>
                        </select>
                    </Field>

                    <Field label="Min R/R">
                        <NumberInput value={filters.minRiskReward} onChange={(v) => setFilters((f) => ({ ...f, minRiskReward: v }))} min={0} step={0.1} />
                    </Field>

                    <Field label="Min RVOL">
                        <NumberInput value={filters.minRelativeVolume} onChange={(v) => setFilters((f) => ({ ...f, minRelativeVolume: v }))} min={0} step={0.1} />
                    </Field>

                    <Field label="RSI range">
                        <div className="flex items-center gap-1">
                            <NumberInput value={filters.rsiMin} onChange={(v) => setFilters((f) => ({ ...f, rsiMin: v }))} min={0} max={100} />
                            <span className="text-gray-600">–</span>
                            <NumberInput value={filters.rsiMax} onChange={(v) => setFilters((f) => ({ ...f, rsiMax: v }))} min={0} max={100} />
                        </div>
                    </Field>

                    <Field label="Trend">
                        <select
                            value={filters.trend}
                            onChange={(e) => setFilters((f) => ({ ...f, trend: e.target.value as Filters['trend'] }))}
                            className="h-9 rounded-md border border-gray-700 bg-black/30 px-3 text-sm text-gray-200"
                        >
                            <option value="ALL">All</option>
                            <option value="UP">Bullish</option>
                            <option value="DOWN">Bearish</option>
                            <option value="SIDEWAYS">Sideways</option>
                        </select>
                    </Field>

                    <Field label="Sort by">
                        <div className="flex items-center gap-1">
                            <select
                                value={sortBy}
                                onChange={(e) => setSortBy(e.target.value as SortKey)}
                                className="h-9 rounded-md border border-gray-700 bg-black/30 px-3 text-sm text-gray-200"
                            >
                                <option value="score">Score</option>
                                <option value="riskReward">Risk/Reward</option>
                                <option value="relativeVolume">Relative Volume</option>
                                <option value="changePercent">Daily Change</option>
                            </select>
                            <button
                                type="button"
                                onClick={() => setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))}
                                className="flex h-9 w-9 items-center justify-center rounded-md border border-gray-700 bg-black/30 text-gray-300 hover:bg-black/50"
                                title={sortDir === 'desc' ? 'Descending' : 'Ascending'}
                            >
                                {sortDir === 'desc' ? '↓' : '↑'}
                            </button>
                        </div>
                    </Field>
                </div>

                {universes.find((u) => u.id === universeId)?.partial ? (
                    <p className="text-xs text-amber-400/80">
                        This universe is a curated static snapshot, not a complete or live index feed — see{' '}
                        <code className="text-amber-300">docs/market-data.md</code>.
                    </p>
                ) : null}
            </div>

            {error ? (
                <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-4 text-sm text-rose-300">{error}</div>
            ) : null}

            {progress ? (
                <div className="flex flex-wrap items-center gap-4 text-sm text-gray-400">
                    <span className="flex items-center gap-2">
                        {progress.status === 'running' ? <Loader2 className="h-4 w-4 animate-spin text-teal-400" /> : null}
                        Scanning {progress.scannedSymbols} / {progress.totalSymbols}
                    </span>
                    <span>
                        Qualified candidates: <span className="font-semibold text-emerald-400">{qualifiedCount}</span>
                    </span>
                    <span>Showing {filteredResults.length} of {progress.results.length} scanned</span>
                    {progress.skipped.length > 0 ? <span className="text-gray-600">{progress.skipped.length} unavailable</span> : null}
                    <span className="text-gray-600">
                        Data as of {progress.results[0] ? new Date(progress.results[0].dataTimestamp).toLocaleDateString() : '—'}
                    </span>
                </div>
            ) : (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Starting scan…
                </div>
            )}

            <ResultsTable
                results={filteredResults}
                currency={universes.find((u) => u.id === universeId)?.market === 'TR' ? 'TRY' : 'USD'}
                expandedSymbol={expandedSymbol}
                onToggleExpand={(symbol) => setExpandedSymbol((s) => (s === symbol ? null : symbol))}
            />
        </div>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label className="flex flex-col gap-1 text-xs text-gray-500">
            {label}
            {children}
        </label>
    );
}

function NumberInput({
    value,
    onChange,
    min,
    max,
    step,
}: {
    value: number;
    onChange: (value: number) => void;
    min?: number;
    max?: number;
    step?: number;
}) {
    return (
        <input
            type="number"
            value={value}
            min={min}
            max={max}
            step={step ?? 1}
            onChange={(e) => onChange(e.target.valueAsNumber || 0)}
            className="h-9 w-20 rounded-md border border-gray-700 bg-black/30 px-2 text-sm text-gray-200"
        />
    );
}

function ResultsTable({
    results,
    currency,
    expandedSymbol,
    onToggleExpand,
}: {
    results: ScannerResult[];
    currency: string;
    expandedSymbol: string | null;
    onToggleExpand: (symbol: string) => void;
}) {
    if (results.length === 0) {
        return <div className="rounded-lg border border-gray-800 bg-black/20 p-8 text-center text-sm text-gray-500">No candidates match the current filters yet.</div>;
    }

    return (
        <div className="overflow-x-auto rounded-xl border border-gray-800">
            <table className="w-full min-w-[960px] text-left text-sm">
                <thead className="bg-gray-900/60 text-xs uppercase tracking-wide text-gray-500">
                    <tr>
                        <th className="w-8 px-3 py-3" />
                        <th className="px-3 py-3">Symbol</th>
                        <th className="px-3 py-3">Company</th>
                        <th className="px-3 py-3 text-right">Price</th>
                        <th className="px-3 py-3 text-right">Daily Change</th>
                        <th className="px-3 py-3 text-right">Swing Score</th>
                        <th className="px-3 py-3">Setup</th>
                        <th className="px-3 py-3">Status</th>
                        <th className="px-3 py-3 text-right">R/R</th>
                        <th className="px-3 py-3 text-right">RVOL</th>
                        <th className="px-3 py-3 text-right">RSI</th>
                        <th className="px-3 py-3">Trend</th>
                        <th className="px-3 py-3">Data Timestamp</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                    {results.map((result) => (
                        <ResultRow
                            key={result.instrument.symbol}
                            result={result}
                            expanded={expandedSymbol === result.instrument.symbol}
                            onToggleExpand={() => onToggleExpand(result.instrument.symbol)}
                        />
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function ResultRow({ result, expanded, onToggleExpand }: { result: ScannerResult; expanded: boolean; onToggleExpand: () => void }) {
    const { analysis } = result;
    const counts = ruleCounts(analysis);

    return (
        <>
            <tr className="hover:bg-white/5">
                <td className="px-3 py-3">
                    <button type="button" onClick={onToggleExpand} className="text-gray-500 hover:text-gray-300" title="Show rule breakdown">
                        {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                </td>
                <td className="px-3 py-3 font-semibold text-white">
                    <Link href={`/stocks/${result.instrument.symbol}`} className="hover:text-teal-400">
                        {result.instrument.symbol}
                    </Link>
                </td>
                <td className="px-3 py-3 text-gray-400">{result.companyName ?? '—'}</td>
                <td className="px-3 py-3 text-right text-gray-200">{formatPrice(result.price, currency)}</td>
                <td className={`px-3 py-3 text-right ${getChangeColorClass(result.changePercent)}`}>{formatChangePercent(result.changePercent)}</td>
                <td className="px-3 py-3 text-right font-semibold text-white">
                    {analysis.score}
                    <span className="text-gray-600">/{analysis.maxScore}</span>
                </td>
                <td className="px-3 py-3 text-gray-300">{analysis.setupType ? analysis.setupType.replace(/_/g, ' ') : '—'}</td>
                <td className="px-3 py-3">
                    <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${statusClasses(analysis.status)}`}>
                        {statusLabel(analysis.status)}
                    </span>
                </td>
                <td className="px-3 py-3 text-right text-gray-300">{analysis.riskReward !== undefined ? `1:${analysis.riskReward.toFixed(2)}` : '—'}</td>
                <td className="px-3 py-3 text-right text-gray-300">{result.relativeVolume !== null ? `${result.relativeVolume.toFixed(2)}x` : '—'}</td>
                <td className="px-3 py-3 text-right text-gray-300">{result.rsi !== null ? result.rsi.toFixed(1) : '—'}</td>
                <td className="px-3 py-3 text-gray-300">{TREND_LABELS[result.trend]}</td>
                <td className="px-3 py-3 text-xs text-gray-500">{result.dataTimestamp}</td>
            </tr>
            {expanded ? (
                <tr>
                    <td colSpan={13} className="bg-black/30 px-6 py-4">
                        <div className="mb-3 flex items-center justify-between gap-4">
                            <p className="text-xs text-gray-500">
                                {counts.passed}/{analysis.rules.length} rules passed — full breakdown reused from the same rule engine as the
                                stock detail page.
                            </p>
                            <SaveCandidateButton symbol={result.instrument.symbol} />
                        </div>
                        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                            {analysis.rules.map((rule) => (
                                <RuleRow key={rule.id} rule={rule} />
                            ))}
                        </div>
                        {analysis.warnings && analysis.warnings.length > 0 ? (
                            <ul className="mt-3 space-y-1 text-xs text-amber-300">
                                {analysis.warnings.map((w) => (
                                    <li key={w}>⚠ {w}</li>
                                ))}
                            </ul>
                        ) : null}
                    </td>
                </tr>
            ) : null}
        </>
    );
}
