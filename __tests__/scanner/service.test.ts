import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OhlcBar } from '@/lib/technical/types';
import type { MarketDataResult, HistoricalBar, CompanyProfile } from '@/lib/market-data/types';

vi.mock('@/database/mongoose', () => ({
    connectToDatabase: vi.fn(async () => ({})),
}));

// --- In-memory fake for the ScannerRun model, faithful only to the query
// shapes lib/scanner/service.ts actually issues (findOne / findOneAndUpdate
// with upsert / findByIdAndUpdate with $push+$set). ---
interface FakeRun {
    _id: string;
    userId: string;
    universeId: string;
    configFingerprint: string;
    status: 'running' | 'completed' | 'failed';
    symbols: string[];
    cursor: number;
    results: unknown[];
    skipped: unknown[];
    startedAt: Date;
    updatedAt: Date;
    completedAt?: Date;
    expiresAt: Date;
}

let runStore: FakeRun[];
let nextId: number;

function keyOf(f: { userId: string; universeId: string; configFingerprint: string }) {
    return `${f.userId}:${f.universeId}:${f.configFingerprint}`;
}

vi.mock('@/database/models/scannerRun.model', () => ({
    ScannerRun: {
        findOne: vi.fn(async (filter: { userId: string; universeId: string; configFingerprint: string }) => {
            return runStore.find((r) => keyOf(r) === keyOf(filter)) ?? null;
        }),
        findOneAndUpdate: vi.fn(
            async (
                filter: { userId: string; universeId: string; configFingerprint: string },
                update: { $set: Partial<FakeRun> },
            ) => {
                const existing = runStore.find((r) => keyOf(r) === keyOf(filter));
                if (existing) {
                    Object.assign(existing, update.$set);
                    return existing;
                }
                const created: FakeRun = {
                    _id: `run-${++nextId}`,
                    userId: filter.userId,
                    universeId: filter.universeId,
                    configFingerprint: filter.configFingerprint,
                    status: 'running',
                    symbols: [],
                    cursor: 0,
                    results: [],
                    skipped: [],
                    startedAt: new Date(),
                    updatedAt: new Date(),
                    expiresAt: new Date(),
                    ...update.$set,
                };
                runStore.push(created);
                return created;
            },
        ),
        findByIdAndUpdate: vi.fn(
            async (
                id: string,
                update: { $push?: Record<string, { $each: unknown[] }>; $set?: Partial<FakeRun> },
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
                if (update.$set) Object.assign(run, update.$set);
                return run;
            },
        ),
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

// --- Fake market data: deterministic per-symbol bars/profile, so the real
// swing-analysis engine runs on real (fixture) data rather than mocking the
// analysis itself. ---
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
    CCC: makeBars(60, 0.2),
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
    getCompanyProfile: vi.fn(async (symbol: string): Promise<MarketDataResult<CompanyProfile>> => {
        return { ok: true, data: { symbol, name: `${symbol} Inc.`, currency: 'USD' } };
    }),
}));

import { getHistoricalPrices, getCompanyProfile } from '@/lib/market-data/service';
import { runScannerBatch } from '@/lib/scanner/service';

describe('runScannerBatch', () => {
    beforeEach(() => {
        runStore = [];
        nextId = 0;
        watchlistItems = [];
        vi.mocked(getHistoricalPrices).mockClear();
        vi.mocked(getCompanyProfile).mockClear();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('scans a small custom-watchlist universe to completion in one call', async () => {
        watchlistItems = [{ symbol: 'AAA' }, { symbol: 'BBB' }];

        const progress = await runScannerBatch({ userId: 'user-1', universeId: 'custom-watchlist' });

        expect(progress.status).toBe('completed');
        expect(progress.totalSymbols).toBe(2);
        expect(progress.scannedSymbols).toBe(2);
        expect(progress.results).toHaveLength(2);
        expect(progress.results.map((r) => r.instrument.symbol).sort()).toEqual(['AAA', 'BBB']);
        // Every result reuses the real swing-analysis output, not a stub.
        for (const result of progress.results) {
            expect(result.analysis.setupType).toBe('BREAKOUT');
            expect(typeof result.analysis.score).toBe('number');
            expect(result.companyName).toBe(`${result.instrument.symbol} Inc.`);
        }
    });

    it('records a symbol that fails to fetch as skipped, not as a fake result', async () => {
        watchlistItems = [{ symbol: 'AAA' }, { symbol: FAILING_SYMBOL }];

        const progress = await runScannerBatch({ userId: 'user-1', universeId: 'custom-watchlist' });

        expect(progress.results).toHaveLength(1);
        expect(progress.results[0].instrument.symbol).toBe('AAA');
        expect(progress.skipped).toEqual([{ symbol: FAILING_SYMBOL, reason: 'No data found for this symbol.' }]);
        expect(progress.scannedSymbols).toBe(2); // still counted as scanned, just not a qualifying result
    });

    it('serves a fresh completed run from cache without re-fetching market data', async () => {
        watchlistItems = [{ symbol: 'AAA' }];

        const first = await runScannerBatch({ userId: 'user-1', universeId: 'custom-watchlist' });
        expect(first.fromCache).toBe(false);
        expect(getHistoricalPrices).toHaveBeenCalledTimes(1);

        const second = await runScannerBatch({ userId: 'user-1', universeId: 'custom-watchlist' });
        expect(second.fromCache).toBe(true);
        expect(second.results).toHaveLength(1);
        // No new market-data calls — served entirely from the cached run.
        expect(getHistoricalPrices).toHaveBeenCalledTimes(1);
    });

    it('forceRefresh bypasses the cache and re-scans', async () => {
        watchlistItems = [{ symbol: 'AAA' }];
        await runScannerBatch({ userId: 'user-1', universeId: 'custom-watchlist' });
        expect(getHistoricalPrices).toHaveBeenCalledTimes(1);

        const refreshed = await runScannerBatch({ userId: 'user-1', universeId: 'custom-watchlist', forceRefresh: true });
        expect(refreshed.fromCache).toBe(false);
        expect(getHistoricalPrices).toHaveBeenCalledTimes(2);
    });

    it('processes a universe larger than one batch across multiple calls, reporting progress', async () => {
        // Dow 30 has exactly 30 symbols — 3 exact batches of the real
        // BATCH_SIZE (10). None of them have fixture bars, so every symbol
        // is recorded as skipped, but that's irrelevant to what this test
        // verifies: that scannedSymbols/status advance correctly across
        // repeated calls to the SAME run instead of restarting it.
        const call1 = await runScannerBatch({ userId: 'user-1', universeId: 'dow-30', forceRefresh: true });
        expect(call1.totalSymbols).toBe(30);
        expect(call1.scannedSymbols).toBe(10);
        expect(call1.status).toBe('running');
        expect(call1.skipped).toHaveLength(10);

        const call2 = await runScannerBatch({ userId: 'user-1', universeId: 'dow-30' });
        expect(call2.scannedSymbols).toBe(20);
        expect(call2.status).toBe('running');
        expect(call2.skipped).toHaveLength(20);

        const call3 = await runScannerBatch({ userId: 'user-1', universeId: 'dow-30' });
        expect(call3.scannedSymbols).toBe(30);
        expect(call3.status).toBe('completed');
        expect(call3.skipped).toHaveLength(30);
        expect(call3.completedAt).toBeDefined();

        // A 4th call now hits the fresh-completed-run cache path, not a
        // re-scan of a "running" state that no longer exists.
        const call4 = await runScannerBatch({ userId: 'user-1', universeId: 'dow-30' });
        expect(call4.fromCache).toBe(true);
        expect(call4.scannedSymbols).toBe(30);
    });

    it('keeps separate scans isolated per user', async () => {
        watchlistItems = [{ symbol: 'AAA' }];
        await runScannerBatch({ userId: 'user-a', universeId: 'custom-watchlist' });

        watchlistItems = [{ symbol: 'BBB' }];
        const userB = await runScannerBatch({ userId: 'user-b', universeId: 'custom-watchlist' });

        expect(userB.results.map((r) => r.instrument.symbol)).toEqual(['BBB']);
    });

    it('resolves a static universe (Dow 30) without touching the watchlist', async () => {
        const progress = await runScannerBatch({ userId: 'user-1', universeId: 'dow-30', forceRefresh: true });
        expect(progress.totalSymbols).toBe(30);
    });

    it('handles an empty universe as immediately completed with no results', async () => {
        watchlistItems = [];
        const progress = await runScannerBatch({ userId: 'user-1', universeId: 'custom-watchlist' });
        expect(progress.status).toBe('completed');
        expect(progress.totalSymbols).toBe(0);
        expect(progress.results).toEqual([]);
    });
});
