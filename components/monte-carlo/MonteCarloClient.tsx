'use client';

import { useEffect, useMemo, useState } from 'react';
import { Dices, Loader2 } from 'lucide-react';
import { runMonteCarloFromBacktest, runMonteCarloFromJournal, type MonteCarloParams } from '@/lib/actions/montecarlo.actions';
import { getBacktestRuns } from '@/lib/actions/backtest.actions';
import type { MonteCarloResult, PercentileSet } from '@/lib/monte-carlo/types';
import type { BacktestRunListItem } from '@/lib/backtest/types';

const inputClass = 'h-9 rounded-md border border-gray-700 bg-black/30 px-2 text-sm text-gray-200';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label className="flex flex-col gap-1 text-xs text-gray-500">
            {label}
            {children}
        </label>
    );
}

function pct(value: number): string {
    return `${(value * 100).toFixed(1)}%`;
}

export default function MonteCarloClient({ backtestRuns }: { backtestRuns: BacktestRunListItem[] }) {
    const [runs, setRuns] = useState(backtestRuns);
    const completedRuns = useMemo(() => runs.filter((r) => r.status === 'completed'), [runs]);
    const [source, setSource] = useState<'backtest' | 'journal'>(completedRuns.length > 0 ? 'backtest' : 'journal');
    const [runId, setRunId] = useState(completedRuns[0]?.runId ?? '');
    const [refreshingRuns, setRefreshingRuns] = useState(false);

    const [numSimulations, setNumSimulations] = useState(2000);
    const [numTradesPerSimulation, setNumTradesPerSimulation] = useState(100);
    const [riskPerTradePercent, setRiskPerTradePercent] = useState(1);
    const [startingEquity, setStartingEquity] = useState(10_000);
    const [ruinThresholdPercent, setRuinThresholdPercent] = useState(50);
    const [seed, setSeed] = useState(1);

    const [result, setResult] = useState<MonteCarloResult | null>(null);
    const [sampleSize, setSampleSize] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isRunning, setIsRunning] = useState(false);

    const refreshRuns = async () => {
        setRefreshingRuns(true);
        try {
            const latest = await getBacktestRuns();
            setRuns(latest);
            const completed = latest.filter((r) => r.status === 'completed');
            if (completed.length > 0) {
                setSource('backtest');
                setRunId((current) => completed.some((r) => r.runId === current) ? current : completed[0].runId);
            }
        } finally {
            setRefreshingRuns(false);
        }
    };

    useEffect(() => {
        void refreshRuns();
        // Refresh once on mount so a Next.js-prefetched route cannot leave
        // Monte Carlo with a stale "no completed runs" snapshot.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleRun = async () => {
        setError(null);
        setIsRunning(true);
        try {
            const params: MonteCarloParams = { numSimulations, numTradesPerSimulation, riskPerTradePercent, startingEquity, ruinThresholdPercent, seed };
            const outcome = source === 'backtest' ? await runMonteCarloFromBacktest(runId, params) : await runMonteCarloFromJournal(params);

            setSampleSize(outcome.sampleSize);
            if (outcome.valid) {
                setResult(outcome.result);
            } else {
                setResult(null);
                setError(outcome.reason);
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Simulation failed.');
        } finally {
            setIsRunning(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 rounded-2xl border border-gray-800 bg-gray-950/40 p-5 backdrop-blur-sm">
                <div className="flex flex-wrap items-end gap-4">
                    <Field label="Resample from">
                        <select value={source} onChange={(e) => setSource(e.target.value as 'backtest' | 'journal')} className={inputClass}>
                            <option value="backtest">A backtest run</option>
                            <option value="journal">My Trade Journal (closed trades)</option>
                        </select>
                    </Field>
                    {source === 'backtest' ? (
                        <Field label="Backtest run">
                            <select value={runId} onChange={(e) => setRunId(e.target.value)} className={inputClass}>
                                {completedRuns.length === 0 ? <option value="">No completed runs yet</option> : null}
                                {completedRuns.map((r) => (
                                    <option key={r.runId} value={r.runId}>
                                        {r.universeId} — {new Date(r.startedAt).toLocaleDateString()}
                                        {r.summary ? ` (n=${r.summary.resolvedCount})` : ''}
                                    </option>
                                ))}
                            </select>
                        </Field>
                    ) : null}
                    <button
                        type="button"
                        onClick={refreshRuns}
                        disabled={refreshingRuns}
                        className="flex h-9 items-center gap-2 rounded-md border border-gray-700 bg-black/30 px-3 text-sm font-medium text-gray-200 hover:bg-black/50 disabled:opacity-50"
                    >
                        {refreshingRuns ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        Refresh runs
                    </button>
                    <Field label="Simulations">
                        <input type="number" min={1} value={numSimulations} onChange={(e) => setNumSimulations(e.target.valueAsNumber || 1)} className="h-9 w-24 rounded-md border border-gray-700 bg-black/30 px-2 text-sm text-gray-200" />
                    </Field>
                    <Field label="Trades / simulation">
                        <input type="number" min={1} value={numTradesPerSimulation} onChange={(e) => setNumTradesPerSimulation(e.target.valueAsNumber || 1)} className="h-9 w-28 rounded-md border border-gray-700 bg-black/30 px-2 text-sm text-gray-200" />
                    </Field>
                    <Field label="Risk / trade (%)">
                        <input type="number" min={0.1} step={0.1} value={riskPerTradePercent} onChange={(e) => setRiskPerTradePercent(e.target.valueAsNumber || 0.1)} className="h-9 w-20 rounded-md border border-gray-700 bg-black/30 px-2 text-sm text-gray-200" />
                    </Field>
                    <Field label="Starting equity">
                        <input type="number" min={1} value={startingEquity} onChange={(e) => setStartingEquity(e.target.valueAsNumber || 1)} className="h-9 w-28 rounded-md border border-gray-700 bg-black/30 px-2 text-sm text-gray-200" />
                    </Field>
                    <Field label="Ruin threshold (%)">
                        <input type="number" min={1} max={99} value={ruinThresholdPercent} onChange={(e) => setRuinThresholdPercent(e.target.valueAsNumber || 1)} className="h-9 w-24 rounded-md border border-gray-700 bg-black/30 px-2 text-sm text-gray-200" />
                    </Field>
                    <Field label="Seed">
                        <div className="flex items-center gap-1">
                            <input type="number" value={seed} onChange={(e) => setSeed(e.target.valueAsNumber || 0)} className="h-9 w-20 rounded-md border border-gray-700 bg-black/30 px-2 text-sm text-gray-200" />
                            <button type="button" onClick={() => setSeed(Math.floor(Math.random() * 1_000_000))} title="New random seed" className="flex h-9 w-9 items-center justify-center rounded-md border border-gray-700 bg-black/30 text-gray-300 hover:bg-black/50">
                                <Dices className="h-4 w-4" />
                            </button>
                        </div>
                    </Field>
                    <button
                        type="button"
                        onClick={handleRun}
                        disabled={isRunning || (source === 'backtest' && !runId)}
                        className="flex h-9 items-center gap-2 rounded-md border border-teal-700 bg-teal-500/10 px-3 text-sm font-medium text-teal-300 hover:bg-teal-500/20 disabled:opacity-50"
                    >
                        {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        Run Simulation
                    </button>
                </div>
                <p className="text-xs text-gray-600">
                    Bootstrap-resamples (with replacement) from a real, historical R-multiple distribution — this
                    never forecasts prices. Same seed always reproduces the same result. See{' '}
                    <code className="text-gray-500">docs/monte-carlo.md</code>.
                </p>
            </div>

            {error ? <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-4 text-sm text-rose-300">{error}</div> : null}

            {result ? <ResultPanels result={result} sampleSize={sampleSize} startingEquity={startingEquity} /> : null}
        </div>
    );
}

function ResultPanels({ result, sampleSize, startingEquity }: { result: MonteCarloResult; sampleSize: number | null; startingEquity: number }) {
    return (
        <div className="space-y-4">
            <p className="text-xs text-gray-500">
                n = {sampleSize} historical R-multiples resampled across {result.numSimulations.toLocaleString()} simulations of{' '}
                {result.numTradesPerSimulation} trades each.
            </p>

            <PercentileCard title="Ending equity" set={result.finalEquity} format={(v) => v.toFixed(0)} note={`Started at ${startingEquity.toLocaleString()}.`} />
            <PercentileCard title="Max drawdown (% of that path's own peak)" set={result.maxDrawdownPercent} format={(v) => `${v.toFixed(1)}%`} />
            <PercentileCard title="Max losing streak (consecutive losing trades)" set={result.maxLosingStreak} format={(v) => v.toFixed(0)} />

            <div className="grid grid-cols-1 gap-4 rounded-2xl border border-gray-800 bg-gray-950/40 p-5 sm:grid-cols-2">
                <div>
                    <p className="mb-2 text-xs uppercase tracking-wide text-gray-600">Probability of exceeding a drawdown of...</p>
                    <div className="flex flex-wrap gap-4 text-sm">
                        <Stat label="10%" value={pct(result.drawdownExceedanceProbability.at10)} />
                        <Stat label="20%" value={pct(result.drawdownExceedanceProbability.at20)} />
                        <Stat label="30%" value={pct(result.drawdownExceedanceProbability.at30)} />
                    </div>
                </div>
                <div>
                    <p className="mb-2 text-xs uppercase tracking-wide text-gray-600">
                        Risk of ruin (equity ever falling to ≤ the configured threshold of starting equity)
                    </p>
                    <div className="text-2xl font-semibold text-rose-400">{pct(result.riskOfRuin)}</div>
                </div>
            </div>
        </div>
    );
}

function PercentileCard({ title, set, format, note }: { title: string; set: PercentileSet; format: (v: number) => string; note?: string }) {
    return (
        <div className="rounded-2xl border border-gray-800 bg-gray-950/40 p-5">
            <p className="mb-3 text-xs uppercase tracking-wide text-gray-600">{title}</p>
            <div className="flex flex-wrap gap-6 text-sm">
                <Stat label="P5" value={format(set.p5)} />
                <Stat label="P25" value={format(set.p25)} />
                <Stat label="Median (P50)" value={format(set.p50)} highlight />
                <Stat label="P75" value={format(set.p75)} />
                <Stat label="P95" value={format(set.p95)} />
            </div>
            {note ? <p className="mt-2 text-xs text-gray-600">{note}</p> : null}
        </div>
    );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
    return (
        <div>
            <div className="text-[11px] uppercase tracking-wide text-gray-600">{label}</div>
            <div className={highlight ? 'font-semibold text-emerald-400' : 'font-semibold text-gray-100'}>{value}</div>
        </div>
    );
}
