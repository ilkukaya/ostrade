import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OhlcBar } from '@/lib/technical/types';
import type { MarketDataResult, HistoricalBar } from '@/lib/market-data/types';
import type { BacktestExecutionConfig } from '@/lib/backtest/types';

vi.mock('@/database/mongoose', () => ({
    connectToDatabase: vi.fn(async () => ({})),
}));

// --- In-memory fake for the BacktestRun model, faithful only to the query
// shapes lib/backtest/service.ts actually issues (create / findOne /
// findByIdAndUpdate with $push+$set). ---
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
            async (id: string, update: { $push?: Record<string, { $each: unknown[] }>; $set?: Partial<FakeRun> }) => {
                const run = runStore.find((r) => r._id === id);
                if (!run) return null;
                if (update.$push) {
                    for (const [field, op] of Object.entries(update.$push)) {
                        (run as unknown as Record<string, unknown[]>)[field] = [
                            ...((run as unknown as Record<string, unknown[]>)[field] ?? []),
                            ...op.$each,
                        ];
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

vi.mock('@/lib/market-data/service', () => ({
    getHistoricalPrices: vi.fn(async (symbol: string): Promise<MarketDataResult<HistoricalBar[]>> => {
        const bars = FIXTURE_BARS[symbol];
        if (!bars) {
            return { ok: false, error: { kind: 'not_found', message: 'no data', name: 'MarketDataError' } as never };
        }
        return { ok: true, data: bars };
    }),
}));

import { getHistoricalPrices } from '@/lib/market-data/service';
import { listBacktestRuns, runBacktestBatch, startBacktest } from '@/lib/backtest/service';

function baseExecConfig(): Omit<BacktestExecutionConfig, 'universeId'> {
    return { startDate: '2024-01-01', endDate: '2025-12-31', minScore: 0, maxHoldingDays: 60, feeBps: 5, slippageBps: 10 };
}

describe('backtest service', () => {
    beforeEach(() => {
        runStore = [];
        nextId = 0;
        watchlistItems = [];
        vi.mocked(getHistoricalPrices).mockClear();
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

        expect(progress.skipped).toEqual([{ symbol: FAILING_SYMBOL, reason: 'No data found for this symbol.' }]);
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
});
