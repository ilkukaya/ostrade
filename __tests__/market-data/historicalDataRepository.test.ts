import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HistoricalBar } from '@/lib/market-data/types';

vi.mock('@/database/mongoose', () => ({
    connectToDatabase: vi.fn(async () => ({})),
}));

const mockGetHistoricalPrices = vi.fn();
vi.mock('@/lib/market-data/service', () => ({
    getHistoricalPrices: (...args: [string, string]) => mockGetHistoricalPrices(...args),
}));

interface FakeBarDoc {
    symbol: string;
    market: string;
    timeframe: string;
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    adjustedClose?: number;
    volume: number;
    exchange?: string;
    currency?: string;
    provider: string;
    fetchedAt: Date;
}

let store: FakeBarDoc[];

function matchesFilter(doc: FakeBarDoc, filter: Record<string, unknown>): boolean {
    for (const [key, value] of Object.entries(filter)) {
        if (key === 'date' && value && typeof value === 'object') {
            const range = value as { $gte?: string; $lte?: string };
            if (range.$gte !== undefined && doc.date < range.$gte) return false;
            if (range.$lte !== undefined && doc.date > range.$lte) return false;
            continue;
        }
        if ((doc as unknown as Record<string, unknown>)[key] !== value) return false;
    }
    return true;
}

function applyQuery(filter: Record<string, unknown>, sortSpec: Record<string, 1 | -1>, limit?: number): FakeBarDoc[] {
    let results = store.filter((d) => matchesFilter(d, filter));
    const [sortKey, sortDir] = Object.entries(sortSpec)[0];
    results = [...results].sort((a, b) => {
        const av = (a as unknown as Record<string, string>)[sortKey];
        const bv = (b as unknown as Record<string, string>)[sortKey];
        return av < bv ? -1 * sortDir : av > bv ? 1 * sortDir : 0;
    });
    return limit ? results.slice(0, limit) : results;
}

vi.mock('@/database/models/marketBar.model', () => ({
    MarketBar: {
        find: vi.fn((filter: Record<string, unknown>) => ({
            sort: vi.fn((sortSpec: Record<string, 1 | -1>) => ({
                lean: vi.fn(async () => applyQuery(filter, sortSpec)),
                limit: vi.fn((n: number) => ({
                    lean: vi.fn(async () => applyQuery(filter, sortSpec, n)),
                })),
            })),
        })),
        findOne: vi.fn((filter: Record<string, unknown>) => ({
            sort: vi.fn((sortSpec: Record<string, 1 | -1>) => ({
                lean: vi.fn(async () => applyQuery(filter, sortSpec, 1)[0] ?? null),
                select: vi.fn(() => ({
                    lean: vi.fn(async () => applyQuery(filter, sortSpec, 1)[0] ?? null),
                })),
            })),
        })),
        countDocuments: vi.fn(async (filter: Record<string, unknown>) => store.filter((d) => matchesFilter(d, filter)).length),
        bulkWrite: vi.fn(async (ops: Array<{ updateOne: { filter: Record<string, unknown>; update: { $set: FakeBarDoc } } }>) => {
            let upsertedCount = 0;
            let modifiedCount = 0;
            for (const op of ops) {
                const { filter, update } = op.updateOne;
                const existing = store.find((d) => matchesFilter(d, filter));
                if (existing) {
                    Object.assign(existing, update.$set);
                    modifiedCount++;
                } else {
                    store.push({ ...update.$set });
                    upsertedCount++;
                }
            }
            return { upsertedCount, modifiedCount };
        }),
        aggregate: vi.fn(async (pipeline: Array<Record<string, unknown>>) => {
            const matchStage = pipeline[0]?.$match as Record<string, unknown> | undefined;
            const filtered = matchStage ? store.filter((d) => matchesAggregateFilter(d, matchStage)) : store;
            const bySymbol = new Map<string, { latestDate: string; barCount: number }>();
            for (const doc of filtered) {
                const existing = bySymbol.get(doc.symbol);
                if (!existing) {
                    bySymbol.set(doc.symbol, { latestDate: doc.date, barCount: 1 });
                } else {
                    existing.barCount++;
                    if (doc.date > existing.latestDate) existing.latestDate = doc.date;
                }
            }
            return Array.from(bySymbol.entries()).map(([symbol, v]) => ({ _id: symbol, ...v }));
        }),
    },
}));

function matchesAggregateFilter(doc: FakeBarDoc, filter: Record<string, unknown>): boolean {
    for (const [key, value] of Object.entries(filter)) {
        if (value && typeof value === 'object' && '$in' in (value as object)) {
            const list = (value as { $in: unknown[] }).$in;
            if (!list.includes((doc as unknown as Record<string, unknown>)[key])) return false;
            continue;
        }
        if ((doc as unknown as Record<string, unknown>)[key] !== value) return false;
    }
    return true;
}

import { getBars, getBarsOrFetch, getCoverage, getCoverageForSymbols, getLatestBar, upsertBars } from '@/lib/market-data/historicalDataRepository';

function bar(time: string, close: number): HistoricalBar {
    return { time, open: close, high: close + 1, low: close - 1, close, volume: 1_000 };
}

describe('historicalDataRepository', () => {
    beforeEach(() => {
        store = [];
        mockGetHistoricalPrices.mockReset();
    });

    describe('upsertBars', () => {
        it('inserts new bars and reports the insert count', async () => {
            const result = await upsertBars({ symbol: 'AAPL', market: 'US' }, [bar('2024-01-02', 100), bar('2024-01-03', 105)], 'stooq');
            expect(result.inserted).toBe(2);
            expect(result.updated).toBe(0);
            expect(result.rejected).toEqual([]);
            expect(store).toHaveLength(2);
        });

        it('overwrites an existing bar for the same date rather than duplicating it', async () => {
            await upsertBars({ symbol: 'AAPL', market: 'US' }, [bar('2024-01-02', 100)], 'stooq');
            const result = await upsertBars({ symbol: 'AAPL', market: 'US' }, [bar('2024-01-02', 103)], 'yahoo');
            expect(result.updated).toBe(1);
            expect(result.inserted).toBe(0);
            expect(store).toHaveLength(1);
            expect(store[0].close).toBe(103);
            expect(store[0].provider).toBe('yahoo');
        });

        it('reports invalid bars as rejected instead of storing them', async () => {
            const badBar = bar('2024-01-02', 100);
            badBar.high = 0; // high < low -> invalid
            const result = await upsertBars({ symbol: 'AAPL', market: 'US' }, [badBar], 'stooq');
            expect(result.rejected).toHaveLength(1);
            expect(store).toHaveLength(0);
        });

        it('keeps symbols/markets fully isolated from each other', async () => {
            await upsertBars({ symbol: 'AAPL', market: 'US' }, [bar('2024-01-02', 100)], 'stooq');
            await upsertBars({ symbol: 'THYAO', market: 'TR' }, [bar('2024-01-02', 300)], 'yahoo');
            expect(store).toHaveLength(2);
        });

        it('stamps every stored bar with its provider and instrument metadata', async () => {
            await upsertBars({ symbol: 'thyao', market: 'TR', exchange: 'XIST', currency: 'TRY' }, [bar('2024-01-02', 300)], 'yahoo');
            expect(store[0].symbol).toBe('THYAO');
            expect(store[0].exchange).toBe('XIST');
            expect(store[0].currency).toBe('TRY');
            expect(store[0].provider).toBe('yahoo');
        });
    });

    describe('getBars', () => {
        beforeEach(async () => {
            await upsertBars(
                { symbol: 'AAPL', market: 'US' },
                [bar('2024-01-02', 100), bar('2024-01-03', 102), bar('2024-01-04', 104), bar('2024-01-05', 106)],
                'stooq',
            );
        });

        it('returns all bars in chronological order by default', async () => {
            const bars = await getBars({ symbol: 'AAPL', market: 'US' });
            expect(bars.map((b) => b.time)).toEqual(['2024-01-02', '2024-01-03', '2024-01-04', '2024-01-05']);
        });

        it('filters by an inclusive from/to date range', async () => {
            const bars = await getBars({ symbol: 'AAPL', market: 'US' }, { from: '2024-01-03', to: '2024-01-04' });
            expect(bars.map((b) => b.time)).toEqual(['2024-01-03', '2024-01-04']);
        });

        it('returns the most recent N bars, still in chronological order, when limit is set', async () => {
            const bars = await getBars({ symbol: 'AAPL', market: 'US' }, { limit: 2 });
            expect(bars.map((b) => b.time)).toEqual(['2024-01-04', '2024-01-05']);
        });

        it('returns an empty array for a symbol with no stored bars', async () => {
            expect(await getBars({ symbol: 'ZZZZ', market: 'US' })).toEqual([]);
        });
    });

    describe('getBarsOrFetch', () => {
        it('returns stored bars directly without ever calling the provider chain', async () => {
            await upsertBars({ symbol: 'AAPL', market: 'US' }, [bar('2024-01-02', 100)], 'stooq');
            const bars = await getBarsOrFetch({ symbol: 'AAPL', market: 'US' });
            expect(bars).toHaveLength(1);
            expect(mockGetHistoricalPrices).not.toHaveBeenCalled();
        });

        it('performs a just-in-time provider fetch and seeds storage when nothing is stored yet', async () => {
            mockGetHistoricalPrices.mockResolvedValue({ ok: true, data: [bar('2024-01-02', 100), bar('2024-01-03', 102)] });

            const bars = await getBarsOrFetch({ symbol: 'AAPL', market: 'US' });
            expect(bars).toHaveLength(2);
            expect(mockGetHistoricalPrices).toHaveBeenCalledWith('AAPL', 'D');
            expect(store).toHaveLength(2); // now persisted for next time

            mockGetHistoricalPrices.mockClear();
            const secondCall = await getBarsOrFetch({ symbol: 'AAPL', market: 'US' });
            expect(secondCall).toHaveLength(2);
            expect(mockGetHistoricalPrices).not.toHaveBeenCalled(); // served from storage this time
        });

        it('returns an empty array (never fabricated bars) when the provider chain also fails', async () => {
            mockGetHistoricalPrices.mockResolvedValue({ ok: false, error: { kind: 'not_found', message: 'x' } });
            const bars = await getBarsOrFetch({ symbol: 'ZZZZ', market: 'US' });
            expect(bars).toEqual([]);
            expect(store).toEqual([]);
        });
    });

    describe('getLatestBar', () => {
        it('returns null when nothing is stored yet', async () => {
            expect(await getLatestBar({ symbol: 'AAPL', market: 'US' })).toBeNull();
        });

        it('returns the most recent bar once bars exist', async () => {
            await upsertBars({ symbol: 'AAPL', market: 'US' }, [bar('2024-01-02', 100), bar('2024-01-03', 102)], 'stooq');
            const latest = await getLatestBar({ symbol: 'AAPL', market: 'US' });
            expect(latest?.time).toBe('2024-01-03');
        });
    });

    describe('getCoverage', () => {
        it('reports null/0 for an unseeded symbol', async () => {
            const coverage = await getCoverage({ symbol: 'ZZZZ', market: 'US' });
            expect(coverage).toEqual({ earliestDate: null, latestDate: null, barCount: 0 });
        });

        it('reports earliest/latest/count once bars are stored', async () => {
            await upsertBars({ symbol: 'AAPL', market: 'US' }, [bar('2024-01-02', 100), bar('2024-01-03', 102), bar('2024-01-04', 104)], 'stooq');
            const coverage = await getCoverage({ symbol: 'AAPL', market: 'US' });
            expect(coverage).toEqual({ earliestDate: '2024-01-02', latestDate: '2024-01-04', barCount: 3 });
        });
    });

    describe('getCoverageForSymbols', () => {
        it('reports latestDate: null and barCount: 0 for a symbol with nothing stored, never omitting it', async () => {
            await upsertBars({ symbol: 'AAPL', market: 'US' }, [bar('2024-01-02', 100)], 'stooq');
            const coverage = await getCoverageForSymbols(['AAPL', 'ZZZZ'], 'US');
            expect(coverage).toEqual(
                expect.arrayContaining([
                    { symbol: 'AAPL', latestDate: '2024-01-02', barCount: 1 },
                    { symbol: 'ZZZZ', latestDate: null, barCount: 0 },
                ]),
            );
            expect(coverage).toHaveLength(2);
        });

        it('computes the correct latest date and count across multiple bars per symbol', async () => {
            await upsertBars({ symbol: 'AAPL', market: 'US' }, [bar('2024-01-02', 100), bar('2024-01-03', 102), bar('2024-01-04', 104)], 'stooq');
            await upsertBars({ symbol: 'MSFT', market: 'US' }, [bar('2024-01-02', 300)], 'stooq');

            const coverage = await getCoverageForSymbols(['AAPL', 'MSFT'], 'US');
            expect(coverage.find((c) => c.symbol === 'AAPL')).toEqual({ symbol: 'AAPL', latestDate: '2024-01-04', barCount: 3 });
            expect(coverage.find((c) => c.symbol === 'MSFT')).toEqual({ symbol: 'MSFT', latestDate: '2024-01-02', barCount: 1 });
        });

        it('never mixes bars from a different market for the same symbol string', async () => {
            await upsertBars({ symbol: 'THYAO', market: 'TR' }, [bar('2024-01-02', 300)], 'yahoo');
            const coverage = await getCoverageForSymbols(['THYAO'], 'US');
            expect(coverage[0]).toEqual({ symbol: 'THYAO', latestDate: null, barCount: 0 });
        });

        it('returns an empty array for an empty symbol list', async () => {
            expect(await getCoverageForSymbols([], 'US')).toEqual([]);
        });
    });
});
