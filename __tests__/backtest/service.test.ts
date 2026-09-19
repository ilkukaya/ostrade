import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OhlcBar } from '@/lib/technical/types';
import type { HistoricalBar } from '@/lib/market-data/types';
import type { BacktestDatasetProvenance, BacktestExecutionConfig } from '@/lib/backtest/types';

vi.mock('@/database/mongoose', () => ({
    connectToDatabase: vi.fn(async () => ({})),
}));

function getNested(obj: Record<string, unknown>, path: string): unknown {
    return path.split('.').reduce<unknown>((acc, key) => (acc as Record<string, unknown> | undefined)?.[key], obj);
}
function setNested(obj: Record<string, unknown>, path: string, value: unknown): void {
    const keys = path.split('.');
    let cur = obj;
    for (let i = 0; i < keys.length - 1; i++) {
        cur = cur[keys[i]] as Record<string, unknown>;
    }
    cur[keys[keys.length - 1]] = value;
}

// --- In-memory fake for the BacktestRun model, faithful only to the query
// shapes lib/backtest/service.ts actually issues (create / findOne /
// findByIdAndUpdate with $push+$addToSet+$max+$set). ---
interface FakeRun {
    _id: string;
    userId: string;
    universeId: string;
    executionConfig: BacktestExecutionConfig;
    strategyConfig: unknown;
    strategyFingerprint: string;
    status: 'running' | 'completed' | 'failed';
    symbols: string[];
    cursor: number;
    trades: unknown[];
    skipped: unknown[];
    summary?: unknown;
    byYear?: unknown[];
    bySetup?: unknown[];
    byScoreBucket?: unknown[];
    datasetProvenance: BacktestDatasetProvenance;
    startedAt: Date;
    updatedAt: Date;
    completedAt?: Date;
}

let runStore: FakeRun[];
let nextId: number;

vi.mock('@/database/models/backtestRun.model', () => ({
    BacktestRun: {
        create: vi.fn(async (doc: Partial<FakeRun>) => {
            const created = {
                _id: `run-${++nextId}`,
                trades: [],
                skipped: [],
                cursor: 0,
                startedAt: new Date(),
                updatedAt: new Date(),
                ...doc,
            } as FakeRun;
            runStore.push(created);
            return created;
        }),
        findOne: vi.fn(async (filter: { _id: string; userId: string }) => {
            return runStore.find((r) => r._id === filter._id && r.userId === filter.userId) ?? null;
        }),
        findByIdAndUpdate: vi.fn(
            async (
                id: string,
                update: {
                    $push?: Record<string, { $each: unknown[] }>;
                    $addToSet?: Record<string, { $each: unknown[] }>;
                    $max?: Record<string, unknown>;
                    $set?: Partial<FakeRun>;
                },
            ) => {
                const run = runStore.find((r) => r._id === id);
                if (!run) return null;
                const runRecord = run as unknown as Record<string, unknown>;
                if (update.$push) {
                    for (const [field, op] of Object.entries(update.$push)) {
                        (run as unknown as Record<string, unknown[]>)[field] = [
                            ...((run as unknown as Record<string, unknown[]>)[field] ?? []),
                            ...op.$each,
                        ];
                    }
                }
                if (update.$addToSet) {
                    for (const [path, op] of Object.entries(update.$addToSet)) {
                        const existing = (getNested(runRecord, path) as unknown[]) ?? [];
                        setNested(runRecord, path, [...new Set([...existing, ...op.$each])]);
                    }
                }
                if (update.$max) {
                    for (const [path, value] of Object.entries(update.$max)) {
                        const existing = getNested(runRecord, path) as string | null | undefined;
                        if (existing == null || (value as string) > existing) setNested(runRecord, path, value);
                    }
                }
                if (update.$set) Object.assign(run, update.$set);
                return run;
            },
        ),
        find: vi.fn((filter: { userId: string }) => ({
            sort: vi.fn(() => ({
                lean: vi.fn(async () =>
                    runStore
                        .filter((r) => r.userId === filter.userId)
                        .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime()),
                ),
            })),
        })),
    },
}));

vi.mock('@/database/models/watchlist.model', () => ({
    Watchlist: {
        find: vi.fn(() => ({
            lean: vi.fn(async () => watchlistItems),
        })),
    },
}));

let watchlistItems: Array<{ symbol: string }>;

function makeBars(count: number, trendPerBar: number): OhlcBar[] {
    const bars: OhlcBar[] = [];
    for (let i = 0; i < count; i++) {
        const close = 100 + i * trendPerBar + Math.sin(i / 3) * 1.5;
        bars.push({
            time: `2024-${String(Math.floor(i / 28) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
            open: close,
            high: close * 1.01,
            low: close * 0.99,
            close,
            volume: 1_000_000,
        });
    }
    return bars;
}

const FIXTURE_BARS: Record<string, OhlcBar[]> = {
    AAA: makeBars(60, 0.5),
    BBB: makeBars(60, 0.3),
};
const FAILING_SYMBOL = 'ZZZ';

// The backtester is local-first (see historicalDataRepository.ts) — it
// never calls a market-data provider directly, only the repository.
const mockGetBarsOrFetch = vi.fn(async (instrument: { symbol: string }, options?: unknown): Promise<HistoricalBar[]> => {
    void options;
    return FIXTURE_BARS[instrument.symbol] ?? [];
});
const mockGetDataProvenance = vi.fn(async (instrument: { symbol: string }) => {
    const bars = FIXTURE_BARS[instrument.symbol];
    if (!bars || bars.length === 0) return { latestDate: null, provider: null };
    return { latestDate: bars[bars.length - 1].time, provider: 'stooq' };
});
vi.mock('@/lib/market-data/historicalDataRepository', () => ({
    getBarsOrFetch: (...args: [{ symbol: string }, unknown?]) => mockGetBarsOrFetch(...args),
    getDataProvenance: (...args: [{ symbol: string }]) => mockGetDataProvenance(...args),
}));

import { listBacktestRuns, runBacktestBatch, startBacktest } from '@/lib/backtest/service';

function baseExecConfig(): Omit<BacktestExecutionConfig, 'universeId'> {
    return { startDate: '2024-01-01', endDate: '2025-12-31', minScore: 0, maxHoldingDays: 60, feeBps: 5, slippageBps: 10 };
}

describe('backtest service', () => {
    beforeEach(() => {
        runStore = [];
        nextId = 0;
        watchlistItems = [];
        mockGetBarsOrFetch.mockClear();
        mockGetDataProvenance.mockClear();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('starts and completes a small custom-watchlist backtest in one batch', async () => {
        watchlistItems = [{ symbol: 'AAA' }, { symbol: 'BBB' }];

        const { runId } = await startBacktest({ userId: 'user-1', universeId: 'custom-watchlist', executionConfig: baseExecConfig() });
        const progress = await runBacktestBatch({ runId, userId: 'user-1' });

        expect(progress.status).toBe('completed');
        expect(progress.totalSymbols).toBe(2);
        expect(progress.scannedSymbols).toBe(2);
        expect(progress.summary).toBeDefined();
        expect(progress.summary!.totalSignals).toBe(progress.trades.length);
        expect(progress.byYear).toBeDefined();
        expect(progress.bySetup).toBeDefined();
        expect(progress.byScoreBucket).toBeDefined();
    });

    it('records a symbol that fails to fetch as skipped, not silently dropped', async () => {
        watchlistItems = [{ symbol: 'AAA' }, { symbol: FAILING_SYMBOL }];

        const { runId } = await startBacktest({ userId: 'user-1', universeId: 'custom-watchlist', executionConfig: baseExecConfig() });
        const progress = await runBacktestBatch({ runId, userId: 'user-1' });

        expect(progress.skipped).toEqual([{ symbol: FAILING_SYMBOL, reason: 'No historical data available for this symbol.' }]);
        expect(progress.scannedSymbols).toBe(2);
    });

    it('leaves summary/byYear/bySetup/byScoreBucket undefined while still running', async () => {
        const { runId } = await startBacktest({ userId: 'user-1', universeId: 'dow-30', executionConfig: baseExecConfig() });
        const progress = await runBacktestBatch({ runId, userId: 'user-1' });

        expect(progress.status).toBe('running'); // 30 symbols, batch size 5
        expect(progress.summary).toBeUndefined();
        expect(progress.byYear).toBeUndefined();
    });

    it('processes a universe larger than one batch across multiple calls (Dow 30 = 6 exact batches of 5)', async () => {
        const { runId } = await startBacktest({ userId: 'user-1', universeId: 'dow-30', executionConfig: baseExecConfig() });

        const expectedCursors = [5, 10, 15, 20, 25, 30];
        for (const expectedCursor of expectedCursors) {
            const progress = await runBacktestBatch({ runId, userId: 'user-1' });
            expect(progress.scannedSymbols).toBe(expectedCursor);
        }

        const final = await runBacktestBatch({ runId, userId: 'user-1' });
        expect(final.status).toBe('completed');
        expect(final.scannedSymbols).toBe(30);
        expect(final.summary).toBeDefined();
    });

    it('computes train/holdout summaries when a holdoutStartDate is configured, even for a trivially-empty universe', async () => {
        watchlistItems = [];
        const { runId } = await startBacktest({
            userId: 'user-1',
            universeId: 'custom-watchlist',
            executionConfig: { ...baseExecConfig(), holdoutStartDate: '2025-01-01' },
        });
        const progress = await runBacktestBatch({ runId, userId: 'user-1' });

        expect(progress.status).toBe('completed');
        expect(progress.trainSummary).toBeDefined();
        expect(progress.holdoutSummary).toBeDefined();
        expect(progress.trainSummary!.totalSignals).toBe(0);
    });

    it('omits train/holdout summaries when no holdoutStartDate was configured', async () => {
        watchlistItems = [];
        const { runId } = await startBacktest({ userId: 'user-1', universeId: 'custom-watchlist', executionConfig: baseExecConfig() });
        const progress = await runBacktestBatch({ runId, userId: 'user-1' });

        expect(progress.trainSummary).toBeUndefined();
        expect(progress.holdoutSummary).toBeUndefined();
    });

    it('creates a brand-new run on every startBacktest call — no fingerprint-based reuse like the scanner', async () => {
        const first = await startBacktest({ userId: 'user-1', universeId: 'dow-30', executionConfig: baseExecConfig() });
        const second = await startBacktest({ userId: 'user-1', universeId: 'dow-30', executionConfig: baseExecConfig() });
        expect(first.runId).not.toBe(second.runId);
        expect(runStore).toHaveLength(2);
    });

    it('never resolves a batch call for a run owned by a different user', async () => {
        const { runId } = await startBacktest({ userId: 'user-a', universeId: 'custom-watchlist', executionConfig: baseExecConfig() });
        await expect(runBacktestBatch({ runId, userId: 'user-b' })).rejects.toThrow('Backtest run not found.');
    });

    it('lists past runs newest-relevant-fields only, scoped to the requesting user', async () => {
        watchlistItems = [{ symbol: 'AAA' }];
        const { runId } = await startBacktest({ userId: 'user-1', universeId: 'custom-watchlist', executionConfig: baseExecConfig() });
        await runBacktestBatch({ runId, userId: 'user-1' });
        await startBacktest({ userId: 'user-2', universeId: 'custom-watchlist', executionConfig: baseExecConfig() });

        const runsForUser1 = await listBacktestRuns('user-1');
        expect(runsForUser1).toHaveLength(1);
        expect(runsForUser1[0].runId).toBe(runId);
        expect(runsForUser1[0].summary).toBeDefined();
    });

    it('handles an empty universe as immediately completed with no work done', async () => {
        watchlistItems = [];
        const { runId } = await startBacktest({ userId: 'user-1', universeId: 'custom-watchlist', executionConfig: baseExecConfig() });
        const progress = await runBacktestBatch({ runId, userId: 'user-1' });

        expect(progress.status).toBe('completed');
        expect(progress.totalSymbols).toBe(0);
        expect(progress.trades).toEqual([]);
        // "completed" always carries a summary, even for a trivially-empty
        // universe — the UI should never have to guess why it's missing.
        expect(progress.summary).toBeDefined();
        expect(progress.summary!.totalSignals).toBe(0);
    });

    it('stamps datasetProvenance.generatedAt at creation, even for a trivially-empty universe', async () => {
        watchlistItems = [];
        const before = Date.now();
        const { runId } = await startBacktest({ userId: 'user-1', universeId: 'custom-watchlist', executionConfig: baseExecConfig() });
        const progress = await runBacktestBatch({ runId, userId: 'user-1' });

        expect(progress.datasetProvenance.providers).toEqual([]);
        expect(progress.datasetProvenance.latestBarDate).toBeNull();
        expect(new Date(progress.datasetProvenance.generatedAt).getTime()).toBeGreaterThanOrEqual(before);
    });

    it('accumulates providers and the latest observed bar date across processed symbols', async () => {
        watchlistItems = [{ symbol: 'AAA' }, { symbol: 'BBB' }];
        const { runId } = await startBacktest({ userId: 'user-1', universeId: 'custom-watchlist', executionConfig: baseExecConfig() });
        const progress = await runBacktestBatch({ runId, userId: 'user-1' });

        expect(progress.datasetProvenance.providers).toEqual(['stooq']);
        expect(progress.datasetProvenance.latestBarDate).toBe(FIXTURE_BARS.AAA[FIXTURE_BARS.AAA.length - 1].time);
        expect(mockGetDataProvenance).toHaveBeenCalledTimes(2);
    });

    it('never records provenance for a symbol that had no data (skipped, not just empty-provenance)', async () => {
        watchlistItems = [{ symbol: FAILING_SYMBOL }];
        const { runId } = await startBacktest({ userId: 'user-1', universeId: 'custom-watchlist', executionConfig: baseExecConfig() });
        const progress = await runBacktestBatch({ runId, userId: 'user-1' });

        expect(progress.skipped).toHaveLength(1);
        expect(progress.datasetProvenance.providers).toEqual([]);
        expect(progress.datasetProvenance.latestBarDate).toBeNull();
        expect(mockGetDataProvenance).not.toHaveBeenCalled();
    });

    it('keeps a two-symbol dataset-provenance snapshot across a run reflected in listBacktestRuns too', async () => {
        watchlistItems = [{ symbol: 'AAA' }];
        const { runId } = await startBacktest({ userId: 'user-1', universeId: 'custom-watchlist', executionConfig: baseExecConfig() });
        await runBacktestBatch({ runId, userId: 'user-1' });

        const runs = await listBacktestRuns('user-1');
        expect(runs[0].datasetProvenance.providers).toEqual(['stooq']);
    });
});
