import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OhlcBar } from '@/lib/technical/types';

vi.mock('@/database/mongoose', () => ({
    connectToDatabase: vi.fn(async () => ({})),
}));

interface FakeSnapshotDoc {
    symbol: string;
    market: string;
    strategyVersion: string;
    marketDate: string;
    close: number;
    score: number;
    maxScore: number;
    status: string;
    setupType?: string;
    rsi: number | null;
    relativeVolume: number | null;
    trend: string;
    changeClassification: string;
    scoreChange: number | null;
    exchange?: string;
    currency?: string;
    calculatedAt: Date;
}

let store: FakeSnapshotDoc[];

function matchesFilter(doc: FakeSnapshotDoc, filter: Record<string, unknown>): boolean {
    return Object.entries(filter).every(([key, value]) => {
        const docValue = (doc as unknown as Record<string, unknown>)[key];
        if (value && typeof value === 'object' && '$lt' in (value as Record<string, unknown>)) {
            const lt = (value as { $lt: string }).$lt;
            return typeof docValue === 'string' && docValue < lt;
        }
        return docValue === value;
    });
}

vi.mock('@/database/models/dailyAnalysisSnapshot.model', () => ({
    DailyAnalysisSnapshot: {
        findOne: vi.fn((filter: Record<string, unknown>) => ({
            sort: vi.fn(() => ({
                lean: vi.fn(async () => {
                    const matches = store
                        .filter((d) => matchesFilter(d, filter))
                        .sort((a, b) => (a.marketDate < b.marketDate ? 1 : a.marketDate > b.marketDate ? -1 : 0));
                    return matches[0] ?? null;
                }),
            })),
        })),
        findOneAndUpdate: vi.fn(
            async (filter: Record<string, unknown>, update: { $set: Partial<FakeSnapshotDoc> }, options: { upsert: boolean }) => {
                void options;
                const existing = store.find((d) => matchesFilter(d, filter));
                if (existing) {
                    Object.assign(existing, update.$set);
                    return existing;
                }
                const created = { ...update.$set } as FakeSnapshotDoc;
                store.push(created);
                return created;
            },
        ),
    },
}));

vi.mock('@/lib/market-data/sync/resolveMarketSymbols', () => ({
    resolveMarketSymbols: vi.fn((market: string) => {
        if (market === 'US') return [{ symbol: 'AAA', market: 'US', exchange: 'US', currency: 'USD' }];
        if (market === 'TR') return [{ symbol: 'THYAO', market: 'TR', exchange: 'XIST', currency: 'TRY' }];
        return [];
    }),
}));

let FIXTURE_BARS: Record<string, OhlcBar[]>;
const mockGetBarsOrFetch = vi.fn(async (instrument: { symbol: string }, options?: unknown): Promise<OhlcBar[]> => {
    void options;
    return FIXTURE_BARS[instrument.symbol] ?? [];
});
vi.mock('@/lib/market-data/historicalDataRepository', () => ({
    getBarsOrFetch: (...args: [{ symbol: string }, unknown?]) => mockGetBarsOrFetch(...args),
}));

import { generateDailySnapshots } from '@/lib/analysis/dailySnapshotService';

const VALID_CLASSIFICATIONS = [
    'NEW_SETUP',
    'NEWLY_QUALIFIED',
    'SCORE_IMPROVED',
    'SCORE_DETERIORATED',
    'LOST_QUALIFICATION',
    'SETUP_INVALIDATED',
    'NO_MATERIAL_CHANGE',
];

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

describe('generateDailySnapshots', () => {
    beforeEach(() => {
        store = [];
        FIXTURE_BARS = {};
        mockGetBarsOrFetch.mockClear();
    });

    it('generates one snapshot per resolved instrument, with no prior comparison on the first run', async () => {
        FIXTURE_BARS.AAA = makeBars(60, 0.5);

        const result = await generateDailySnapshots({ market: 'US' });

        expect(result.totalSymbols).toBe(1);
        expect(result.processed).toBe(1);
        expect(result.skipped).toEqual([]);
        expect(store).toHaveLength(1);

        const snapshot = store[0];
        expect(snapshot.symbol).toBe('AAA');
        expect(snapshot.market).toBe('US');
        expect(snapshot.marketDate).toBe(FIXTURE_BARS.AAA[FIXTURE_BARS.AAA.length - 1].time);
        expect(snapshot.close).toBe(FIXTURE_BARS.AAA[FIXTURE_BARS.AAA.length - 1].close);
        expect(snapshot.scoreChange).toBeNull();
        expect(['NEW_SETUP', 'NO_MATERIAL_CHANGE']).toContain(snapshot.changeClassification);
    });

    it('carries instrument exchange/currency metadata onto the stored snapshot (BIST)', async () => {
        FIXTURE_BARS.THYAO = makeBars(60, 0.4);

        await generateDailySnapshots({ market: 'TR' });

        expect(store).toHaveLength(1);
        expect(store[0]).toMatchObject({ symbol: 'THYAO', market: 'TR', exchange: 'XIST', currency: 'TRY' });
    });

    it('compares against the prior session on a second run, producing a non-null score change', async () => {
        FIXTURE_BARS.AAA = makeBars(60, 0.5);
        await generateDailySnapshots({ market: 'US' });
        const firstMarketDate = store[0].marketDate;

        // One more session's worth of bars — a new latest bar, new asOf date.
        FIXTURE_BARS.AAA = makeBars(61, 0.5);
        const result = await generateDailySnapshots({ market: 'US' });

        expect(result.processed).toBe(1);
        expect(store).toHaveLength(2); // a new session gets its own document, not an overwrite
        const second = store.find((d) => d.marketDate !== firstMarketDate)!;
        expect(second.scoreChange).not.toBeNull();
        expect(VALID_CLASSIFICATIONS).toContain(second.changeClassification);
    });

    it('re-running for the SAME session upserts in place rather than duplicating', async () => {
        FIXTURE_BARS.AAA = makeBars(60, 0.5);
        await generateDailySnapshots({ market: 'US' });
        await generateDailySnapshots({ market: 'US' });

        // Still one document, not two — an unchanged session regenerates in
        // place. Neither run has a STRICTLY-prior session to compare against
        // (both share the same marketDate), so scoreChange stays null on
        // both, exactly as it would on any single first-ever run.
        expect(store).toHaveLength(1);
        expect(store[0].scoreChange).toBeNull();
        expect(['NEW_SETUP', 'NO_MATERIAL_CHANGE']).toContain(store[0].changeClassification);
    });

    it('records a skip reason (never a fabricated snapshot) for a symbol with no data', async () => {
        // AAA resolves for 'US' but FIXTURE_BARS.AAA is left undefined.
        const result = await generateDailySnapshots({ market: 'US' });

        expect(result.processed).toBe(0);
        expect(result.skipped).toEqual([{ symbol: 'AAA', reason: 'No historical data available for this symbol.' }]);
        expect(store).toEqual([]);
    });

    it('does nothing for a market with no resolved symbols', async () => {
        const result = await generateDailySnapshots({ market: 'EMPTY' });
        expect(result.totalSymbols).toBe(0);
        expect(result.processed).toBe(0);
        expect(mockGetBarsOrFetch).not.toHaveBeenCalled();
    });
});
