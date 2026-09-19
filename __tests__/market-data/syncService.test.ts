import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HistoricalBar, InstrumentId, MarketDataResult } from '@/lib/market-data/types';

vi.mock('@/database/mongoose', () => ({
    connectToDatabase: vi.fn(async () => ({})),
}));

interface FakeRun {
    _id: string;
    userId: string;
    market: string;
    forceRefresh: boolean;
    status: 'running' | 'completed' | 'failed';
    symbols: string[];
    cursor: number;
    successfulSymbols: string[];
    unchangedSymbols: string[];
    failedSymbols: Array<{ symbol: string; reason: string; provider: string }>;
    barsInserted: number;
    barsUpdated: number;
    startedAt: Date;
    updatedAt: Date;
    completedAt?: Date;
}

let runStore: FakeRun[];
let nextId: number;

vi.mock('@/database/models/marketDataSyncRun.model', () => ({
    MarketDataSyncRun: {
        create: vi.fn(async (doc: Partial<FakeRun>) => {
            const created = { _id: `run-${++nextId}`, ...doc } as FakeRun;
            runStore.push(created);
            return created;
        }),
        findOne: vi.fn(async (filter: { _id: string; userId: string }) => runStore.find((r) => r._id === filter._id && r.userId === filter.userId) ?? null),
        findByIdAndUpdate: vi.fn(
            async (
                id: string,
                update: { $push?: Record<string, { $each: unknown[] }>; $inc?: Record<string, number>; $set?: Partial<FakeRun> },
            ) => {
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
                if (update.$inc) {
                    for (const [field, delta] of Object.entries(update.$inc)) {
                        (run as unknown as Record<string, number>)[field] = ((run as unknown as Record<string, number>)[field] ?? 0) + delta;
                    }
                }
                if (update.$set) Object.assign(run, update.$set);
                return run;
            },
        ),
        find: vi.fn((filter: { userId: string; market?: string }) => ({
            sort: vi.fn(() => ({
                limit: vi.fn((n: number) => ({
                    lean: vi.fn(async () =>
                        runStore
                            .filter((r) => r.userId === filter.userId && (!filter.market || r.market === filter.market))
                            .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
                            .slice(0, n),
                    ),
                })),
            })),
        })),
    },
}));

vi.mock('@/lib/market-data/sync/resolveMarketSymbols', () => ({
    resolveMarketSymbols: vi.fn((market: string) => {
        if (market === 'US') {
            return [
                { symbol: 'AAA', market: 'US', exchange: 'US', currency: 'USD' },
                { symbol: 'BBB', market: 'US', exchange: 'US', currency: 'USD' },
            ];
        }
        return [];
    }),
}));

vi.mock('@/lib/market-data/instruments/resolve', () => ({
    resolveInstrument: vi.fn((symbol: string) => ({ symbol, market: 'US', exchange: 'US', currency: 'USD' })),
}));

const mockGetHistoricalPricesWithProvider = vi.fn();
vi.mock('@/lib/market-data/service', () => ({
    getHistoricalPricesWithProvider: (...args: [string, string]) => mockGetHistoricalPricesWithProvider(...args),
}));

const mockGetLatestBar = vi.fn();
const mockUpsertBars = vi.fn();
vi.mock('@/lib/market-data/historicalDataRepository', () => ({
    getLatestBar: (...args: [InstrumentId]) => mockGetLatestBar(...args),
    upsertBars: (...args: [InstrumentId, HistoricalBar[], string, string]) => mockUpsertBars(...args),
}));

vi.mock('@/lib/market-data/marketCalendar', () => ({
    latestExpectedCompletedSession: vi.fn(() => '2024-01-05'),
}));

import { listRecentSyncRuns, runMarketDataSyncBatch, startMarketDataSync } from '@/lib/market-data/sync/syncService';

function okResult(bars: HistoricalBar[]): { result: MarketDataResult<HistoricalBar[]>; providerId: string } {
    return { result: { ok: true, data: bars }, providerId: 'stooq' };
}

const bars: HistoricalBar[] = [{ time: '2024-01-05', open: 1, high: 2, low: 0.5, close: 1.5, volume: 100 }];

describe('syncService', () => {
    beforeEach(() => {
        runStore = [];
        nextId = 0;
        mockGetHistoricalPricesWithProvider.mockReset();
        mockGetLatestBar.mockReset();
        mockUpsertBars.mockReset();
        mockGetLatestBar.mockResolvedValue(null); // default: never seeded
        mockUpsertBars.mockResolvedValue({ inserted: 1, updated: 0, rejected: [] });
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('creates a run scoped to the resolved symbols for the market', async () => {
        const { runId } = await startMarketDataSync({ userId: 'user-1', market: 'US' });
        expect(runStore.find((r) => r._id === runId)?.symbols).toEqual(['AAA', 'BBB']);
        expect(runStore.find((r) => r._id === runId)?.status).toBe('running');
    });

    it('completes trivially for a market with no resolved symbols', async () => {
        const { runId } = await startMarketDataSync({ userId: 'user-1', market: 'EMPTY' });
        expect(runStore.find((r) => r._id === runId)?.status).toBe('completed');
    });

    it('fetches and upserts a symbol that has never been seeded', async () => {
        mockGetHistoricalPricesWithProvider.mockResolvedValue(okResult(bars));

        const { runId } = await startMarketDataSync({ userId: 'user-1', market: 'US' });
        const progress = await runMarketDataSyncBatch({ runId, userId: 'user-1' });

        expect(progress.status).toBe('completed');
        expect(progress.successfulSymbols.sort()).toEqual(['AAA', 'BBB']);
        expect(progress.barsInserted).toBe(2); // 1 per symbol, per the mocked upsertBars
        expect(mockGetHistoricalPricesWithProvider).toHaveBeenCalledTimes(2);
    });

    it('skips a symbol already covering the latest expected session, without calling the provider chain', async () => {
        mockGetLatestBar.mockResolvedValue({ ...bars[0], time: '2024-01-05' }); // matches the mocked latestExpectedCompletedSession

        const { runId } = await startMarketDataSync({ userId: 'user-1', market: 'US' });
        const progress = await runMarketDataSyncBatch({ runId, userId: 'user-1' });

        expect(progress.unchangedSymbols.sort()).toEqual(['AAA', 'BBB']);
        expect(progress.successfulSymbols).toEqual([]);
        expect(mockGetHistoricalPricesWithProvider).not.toHaveBeenCalled();
    });

    it('forceRefresh re-fetches even a symbol that already covers the latest session', async () => {
        mockGetLatestBar.mockResolvedValue({ ...bars[0], time: '2024-01-05' });
        mockGetHistoricalPricesWithProvider.mockResolvedValue(okResult(bars));

        const { runId } = await startMarketDataSync({ userId: 'user-1', market: 'US', forceRefresh: true });
        const progress = await runMarketDataSyncBatch({ runId, userId: 'user-1' });

        expect(progress.successfulSymbols.sort()).toEqual(['AAA', 'BBB']);
        expect(mockGetHistoricalPricesWithProvider).toHaveBeenCalledTimes(2);
    });

    it('records a provider failure as a failed symbol, never silently dropped', async () => {
        mockGetHistoricalPricesWithProvider.mockResolvedValue({
            result: { ok: false, error: { kind: 'not_found', message: 'no data' } },
            providerId: 'yahoo',
        });

        const { runId } = await startMarketDataSync({ userId: 'user-1', market: 'US' });
        const progress = await runMarketDataSyncBatch({ runId, userId: 'user-1' });

        expect(progress.failedSymbols).toHaveLength(2);
        expect(progress.failedSymbols[0].provider).toBe('yahoo');
        expect(progress.successfulSymbols).toEqual([]);
    });

    it('never resolves a batch call for a run owned by a different user', async () => {
        const { runId } = await startMarketDataSync({ userId: 'user-a', market: 'US' });
        await expect(runMarketDataSyncBatch({ runId, userId: 'user-b' })).rejects.toThrow('Market data sync run not found.');
    });

    it('lists recent runs newest-first, scoped to the requesting user', async () => {
        mockGetHistoricalPricesWithProvider.mockResolvedValue(okResult(bars));
        const first = await startMarketDataSync({ userId: 'user-1', market: 'US' });
        await runMarketDataSyncBatch({ runId: first.runId, userId: 'user-1' });
        await startMarketDataSync({ userId: 'user-2', market: 'US' });

        const runsForUser1 = await listRecentSyncRuns('user-1');
        expect(runsForUser1).toHaveLength(1);
        expect(runsForUser1[0].runId).toBe(first.runId);
    });
});
