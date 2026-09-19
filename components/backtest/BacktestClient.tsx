'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { Loader2, Play, TriangleAlert } from 'lucide-react';
import { advanceBacktestRun, startBacktestRun } from '@/lib/actions/backtest.actions';
import { DEFAULT_BACKTEST_EXECUTION, type BacktestDatasetProvenance, type BacktestProgress, type BacktestRunListItem } from '@/lib/backtest/types';
import { CUSTOM_WATCHLIST_UNIVERSE_ID } from '@/lib/market-data/universe';
import { formatPrice } from '@/lib/utils';

interface UniverseOption {
    id: string;
    name: string;
    market: string;
    symbolCount: number | null;
    partial?: boolean;
}

const MAX_TRADE_ROWS_SHOWN = 500;

function todayIso(): string {
    return new Date().toISOString().slice(0, 10);
}
function yearsAgoIso(years: number): string {
    const d = new Date();
    d.setFullYear(d.getFullYear() - years);
    return d.toISOString().slice(0, 10);
}

function pct(value: number | null): string {
    return value === null ? '—' : `${(value * 100).toFixed(1)}%`;
}
function r(value: number | null): string {
    return value === null ? '—' : `${value.toFixed(2)}R`;
}

const inputClass = 'h-9 rounded-md border border-gray-700 bg-black/30 px-2 text-sm text-gray-200';
const selectClass = inputClass;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label className="flex flex-col gap-1 text-xs text-gray-500">
            {label}
            {children}
        </label>
    );
}

export default function BacktestClient({ universes, pastRuns }: { universes: UniverseOption[]; pastRuns: BacktestRunListItem[] }) {
    const defaultUniverseId = universes.find((u) => u.id === 'dow-30')?.id ?? universes[0]?.id ?? '';
    const [universeId, setUniverseId] = useState(defaultUniverseId);
    const [startDate, setStartDate] = useState(yearsAgoIso(2));
    const [endDate, setEndDate] = useState(todayIso());
    const [minScore, setMinScore] = useState(DEFAULT_BACKTEST_EXECUTION.minScore);
    const [maxHoldingDays, setMaxHoldingDays] = useState(DEFAULT_BACKTEST_EXECUTION.maxHoldingDays);
    const [feeBps, setFeeBps] = useState(DEFAULT_BACKTEST_EXECUTION.feeBps);
    const [slippageBps, setSlippageBps] = useState(DEFAULT_BACKTEST_EXECUTION.slippageBps);
    const [holdoutStartDate, setHoldoutStartDate] = useState('');

    const [progress, setProgress] = useState<BacktestProgress | null>(null);
    const [isRunning, setIsRunning] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const activeRequestId = useRef(0);

    const pollRun = useCallback(async (runId: string) => {
        const requestId = ++activeRequestId.current;
        setIsRunning(true);
        setError(null);
        try {
            let current = await advanceBacktestRun(runId);
            if (activeRequestId.current !== requestId) return;
            setProgress(current);

            while (current.status === 'running' && activeRequestId.current === requestId) {
                await new Promise((resolve) => setTimeout(resolve, 700));
                if (activeRequestId.current !== requestId) return;
                current = await advanceBacktestRun(runId);
                if (activeRequestId.current !== requestId) return;
                setProgress(current);
            }
        } catch (e) {
            if (activeRequestId.current === requestId) {
                setError(e instanceof Error ? e.message : 'Backtest failed.');
            }
        } finally {
            if (activeRequestId.current === requestId) setIsRunning(false);
        }
    }, []);

    const handleStart = async () => {
        setError(null);
        try {
            const { runId } = await startBacktestRun({
                universeId,
                startDate,
                endDate,
                minScore,
                maxHoldingDays,
                feeBps,
                slippageBps,
                holdoutStartDate: holdoutStartDate || undefined,
            });
            pollRun(runId);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not start backtest.');
        }
    };

    const visibleTrades = useMemo(() => progress?.trades.slice(0, MAX_TRADE_ROWS_SHOWN) ?? [], [progress]);

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 rounded-2xl border border-gray-800 bg-gray-950/40 p-5 backdrop-blur-sm">
                <div className="flex flex-wrap items-end gap-4">
                    <Field label="Universe">
                        <select value={universeId} onChange={(e) => setUniverseId(e.target.value)} className={selectClass}>
                            {universes.map((u) => (
                                <option key={u.id} value={u.id}>
                                    {u.name}
                                    {u.symbolCount !== null ? ` (${u.partial ? '~' : ''}${u.symbolCount})` : ''}
                                </option>
                            ))}
                        </select>
                    </Field>
                    <Field label="Start date">
                        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputClass} />
                    </Field>
                    <Field label="End date">
                        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={inputClass} />
                    </Field>
                    <Field label="Min score (extra filter)">
                        <input type="number" min={0} max={100} value={minScore} onChange={(e) => setMinScore(e.target.valueAsNumber || 0)} className="h-9 w-20 rounded-md border border-gray-700 bg-black/30 px-2 text-sm text-gray-200" />
                    </Field>
                    <Field label="Max holding days">
                        <input type="number" min={1} value={maxHoldingDays} onChange={(e) => setMaxHoldingDays(e.target.valueAsNumber || 1)} className="h-9 w-24 rounded-md border border-gray-700 bg-black/30 px-2 text-sm text-gray-200" />
                    </Field>
                    <Field label="Fee (bps)">
                        <input type="number" min={0} value={feeBps} onChange={(e) => setFeeBps(e.target.valueAsNumber || 0)} className="h-9 w-20 rounded-md border border-gray-700 bg-black/30 px-2 text-sm text-gray-200" />
                    </Field>
                    <Field label="Slippage (bps)">
                        <input type="number" min={0} value={slippageBps} onChange={(e) => setSlippageBps(e.target.valueAsNumber || 0)} className="h-9 w-20 rounded-md border border-gray-700 bg-black/30 px-2 text-sm text-gray-200" />
                    </Field>
                    <Field label="Holdout start (optional)">
                        <input type="date" value={holdoutStartDate} onChange={(e) => setHoldoutStartDate(e.target.value)} className={inputClass} />
                    </Field>
                    <button
                        type="button"
                        onClick={handleStart}
                        disabled={isRunning}
                        className="flex h-9 items-center gap-2 rounded-md border border-teal-700 bg-teal-500/10 px-3 text-sm font-medium text-teal-300 hover:bg-teal-500/20 disabled:opacity-50"
                    >
                        {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                        Run Backtest
                    </button>
                </div>
                <p className="text-xs text-gray-600">
                    Only every rule in the setup passing (QUALIFIED) counts as a signal — the min-score field is an
                    additional filter on top, not a replacement for it. Fees/slippage are basis points applied per
                    lib/backtest/simulate.ts; see docs/backtesting.md for exactly how. Set a holdout start date to
                    split the results into train (before it) vs. holdout (on/after it) — a strategy whose edge
                    vanishes in the holdout half was likely curve-fit to the train half.
                </p>
            </div>

            {error ? <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-4 text-sm text-rose-300">{error}</div> : null}

            {progress ? (
                <>
                    <div className="flex flex-wrap items-center gap-4 text-sm text-gray-400">
                        <span className="flex items-center gap-2">
                            {progress.status === 'running' ? <Loader2 className="h-4 w-4 animate-spin text-teal-400" /> : null}
                            Simulating {progress.scannedSymbols} / {progress.totalSymbols} symbols
                        </span>
                        <span>Signals found: <span className="font-semibold text-white">{progress.trades.length}</span></span>
                        {progress.skipped.length > 0 ? <span className="text-gray-600">{progress.skipped.length} unavailable</span> : null}
                    </div>

                    {progress.universeId !== CUSTOM_WATCHLIST_UNIVERSE_ID ? (
                        <SurvivorshipBiasWarning universeName={universes.find((u) => u.id === progress!.universeId)?.name ?? progress.universeId} />
                    ) : null}
                    <DatasetProvenanceLine provenance={progress.datasetProvenance} />

                    {progress.summary ? <SummaryPanel summary={progress.summary} /> : null}
                    {progress.trainSummary && progress.holdoutSummary ? (
                        <TrainHoldoutPanel train={progress.trainSummary} holdout={progress.holdoutSummary} />
                    ) : null}
                    {progress.byYear && progress.byYear.length > 0 ? <GroupTable title="By year" groups={progress.byYear} /> : null}
                    {progress.bySetup && progress.bySetup.length > 0 ? <GroupTable title="By setup" groups={progress.bySetup} /> : null}
                    {progress.byScoreBucket ? <GroupTable title="By score bucket" groups={progress.byScoreBucket} /> : null}

                    {progress.status === 'completed' && progress.trades.length > 0 ? (
                        <TradesTable trades={visibleTrades} totalCount={progress.trades.length} />
                    ) : null}
                </>
            ) : null}

            <PastRunsTable runs={pastRuns} onLoad={pollRun} />
        </div>
    );
}

function SummaryPanel({ summary }: { summary: NonNullable<BacktestProgress['summary']> }) {
    return (
        <div className="rounded-2xl border border-gray-800 bg-gray-950/40 p-5">
            <p className="mb-3 text-xs text-gray-500">
                n = {summary.resolvedCount} resolved of {summary.totalSignals} signals ({summary.stillOpenCount} still
                open, {summary.ambiguousCount} ambiguous — excluded from the stats below)
            </p>
            <div className="flex flex-wrap gap-6 text-sm">
                <Stat label="Win rate" value={pct(summary.winRate)} />
                <Stat label="Avg net R (expectancy)" value={r(summary.avgNetR)} />
                <Stat label="Median net R" value={r(summary.medianNetR)} />
                <Stat label="Profit factor" value={summary.profitFactor !== null ? summary.profitFactor.toFixed(2) : '— (no losses yet)'} />
                <Stat label="Max drawdown" value={summary.maxDrawdownR !== null ? `${summary.maxDrawdownR.toFixed(2)}R` : '—'} />
                <Stat label="Target hits" value={String(summary.targetHitCount)} />
                <Stat label="Stop hits" value={String(summary.stopHitCount)} />
                <Stat label="Expired" value={String(summary.expiredCount)} />
            </div>
            <p className="mt-3 text-xs text-gray-600">
                Max drawdown assumes trades realize sequentially in a single cumulative-R curve — it is not a
                concurrent multi-position portfolio simulation (see docs/backtesting.md).
            </p>
        </div>
    );
}

function TrainHoldoutPanel({ train, holdout }: { train: NonNullable<BacktestProgress['trainSummary']>; holdout: NonNullable<BacktestProgress['holdoutSummary']> }) {
    return (
        <div className="rounded-2xl border border-amber-800/60 bg-amber-500/5 p-5">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-amber-400">Train vs. holdout (out-of-sample check)</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                    <p className="mb-2 text-xs text-gray-500">Train (n={train.resolvedCount})</p>
                    <div className="flex flex-wrap gap-4 text-sm">
                        <Stat label="Win rate" value={pct(train.winRate)} />
                        <Stat label="Avg net R" value={r(train.avgNetR)} />
                    </div>
                </div>
                <div>
                    <p className="mb-2 text-xs text-gray-500">Holdout (n={holdout.resolvedCount})</p>
                    <div className="flex flex-wrap gap-4 text-sm">
                        <Stat label="Win rate" value={pct(holdout.winRate)} />
                        <Stat label="Avg net R" value={r(holdout.avgNetR)} />
                    </div>
                </div>
            </div>
            <p className="mt-3 text-xs text-gray-600">
                A holdout edge much weaker than train&apos;s is the classic sign of curve-fitting — treat the holdout
                numbers as the more honest estimate of future performance.
            </p>
        </div>
    );
}

function SurvivorshipBiasWarning({ universeName }: { universeName: string }) {
    return (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-300">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
                Survivorship bias: this run applies today&apos;s {universeName} constituent list across the entire
                historical period. Companies removed from the index since then (delisted, acquired, or dropped) are
                not included, which can make the historical results look stronger than they would have been for
                someone actually holding the index the whole time.
            </span>
        </div>
    );
}

function DatasetProvenanceLine({ provenance }: { provenance: BacktestDatasetProvenance }) {
    return (
        <p className="text-xs text-gray-600">
            Data through {provenance.latestBarDate ?? '—'} · Source{provenance.providers.length === 1 ? '' : 's'}:{' '}
            {provenance.providers.length > 0 ? provenance.providers.join(', ') : '—'} · Snapshot taken{' '}
            {new Date(provenance.generatedAt).toLocaleString()}
        </p>
    );
}

function Stat({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <div className="text-[11px] uppercase tracking-wide text-gray-600">{label}</div>
            <div className="font-semibold text-gray-100">{value}</div>
        </div>
    );
}

function GroupTable({ title, groups }: { title: string; groups: NonNullable<BacktestProgress['byYear']> }) {
    return (
        <div className="overflow-x-auto rounded-xl border border-gray-800">
            <table className="w-full min-w-[500px] text-left text-sm">
                <thead className="bg-gray-900/60 text-xs uppercase tracking-wide text-gray-500">
                    <tr>
                        <th className="px-3 py-3">{title}</th>
                        <th className="px-3 py-3 text-right">n</th>
                        <th className="px-3 py-3 text-right">Win rate</th>
                        <th className="px-3 py-3 text-right">Avg net R</th>
                        <th className="px-3 py-3 text-right">Median net R</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                    {groups.map((g) => (
                        <tr key={g.label} className={g.n === 0 ? 'text-gray-600' : 'text-gray-300'}>
                            <td className="px-3 py-3 font-semibold text-white">{g.label}</td>
                            <td className="px-3 py-3 text-right">{g.n}</td>
                            <td className="px-3 py-3 text-right">{pct(g.winRate)}</td>
                            <td className="px-3 py-3 text-right">{r(g.avgNetR)}</td>
                            <td className="px-3 py-3 text-right">{r(g.medianNetR)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function TradesTable({ trades, totalCount }: { trades: BacktestProgress['trades']; totalCount: number }) {
    return (
        <div className="space-y-2">
            <div className="overflow-x-auto rounded-xl border border-gray-800">
                <table className="w-full min-w-[900px] text-left text-sm">
                    <thead className="bg-gray-900/60 text-xs uppercase tracking-wide text-gray-500">
                        <tr>
                            <th className="px-3 py-3">Symbol</th>
                            <th className="px-3 py-3">Signal</th>
                            <th className="px-3 py-3">Entry</th>
                            <th className="px-3 py-3 text-right">Entry price</th>
                            <th className="px-3 py-3">Exit</th>
                            <th className="px-3 py-3 text-right">Exit price</th>
                            <th className="px-3 py-3">Outcome</th>
                            <th className="px-3 py-3 text-right">Net R</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                        {trades.map((t, idx) => (
                            <tr key={`${t.symbol}-${t.entryDate}-${idx}`} className="text-gray-300">
                                <td className="px-3 py-3 font-semibold text-white">{t.symbol}</td>
                                <td className="px-3 py-3 text-gray-500">{t.signalDate}</td>
                                <td className="px-3 py-3">{t.entryDate}</td>
                                <td className="px-3 py-3 text-right">{formatPrice(t.entryPrice)}</td>
                                <td className="px-3 py-3">{t.exitDate ?? '—'}</td>
                                <td className="px-3 py-3 text-right">{t.exitPrice !== undefined ? formatPrice(t.exitPrice) : '—'}</td>
                                <td className="px-3 py-3">{t.outcome.replace(/_/g, ' ')}</td>
                                <td className={`px-3 py-3 text-right ${t.netRMultiple !== null ? (t.netRMultiple >= 0 ? 'text-emerald-400' : 'text-rose-400') : 'text-gray-500'}`}>
                                    {r(t.netRMultiple)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {totalCount > trades.length ? (
                <p className="text-xs text-gray-600">Showing the first {trades.length} of {totalCount} trades.</p>
            ) : null}
        </div>
    );
}

function PastRunsTable({ runs, onLoad }: { runs: BacktestRunListItem[]; onLoad: (runId: string) => void }) {
    if (runs.length === 0) return null;
    return (
        <div>
            <h2 className="mb-2 text-sm font-semibold text-gray-300">Past runs</h2>
            <div className="overflow-x-auto rounded-xl border border-gray-800">
                <table className="w-full min-w-[700px] text-left text-sm">
                    <thead className="bg-gray-900/60 text-xs uppercase tracking-wide text-gray-500">
                        <tr>
                            <th className="px-3 py-3">Started</th>
                            <th className="px-3 py-3">Universe</th>
                            <th className="px-3 py-3">Window</th>
                            <th className="px-3 py-3">Status</th>
                            <th className="px-3 py-3 text-right">Win rate</th>
                            <th className="px-3 py-3" />
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                        {runs.map((run) => (
                            <tr key={run.runId} className="text-gray-300">
                                <td className="px-3 py-3 text-gray-500">{new Date(run.startedAt).toLocaleString()}</td>
                                <td className="px-3 py-3">{run.universeId}</td>
                                <td className="px-3 py-3 text-xs text-gray-500">
                                    {run.executionConfig.startDate} → {run.executionConfig.endDate}
                                </td>
                                <td className="px-3 py-3">{run.status}</td>
                                <td className="px-3 py-3 text-right">{run.summary ? pct(run.summary.winRate) : '—'}</td>
                                <td className="px-3 py-3 text-right">
                                    <button type="button" onClick={() => onLoad(run.runId)} className="text-xs font-medium text-teal-400 hover:underline">
                                        Load
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
