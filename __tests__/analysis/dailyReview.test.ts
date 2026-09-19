import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DailyReviewRow } from '@/lib/analysis/dailyReview';

vi.mock('@/database/mongoose', () => ({
    connectToDatabase: vi.fn(async () => ({})),
}));

interface FakeSnapshotDoc {
    symbol: string;
    market: string;
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
}

let store: FakeSnapshotDoc[];

vi.mock('@/database/models/dailyAnalysisSnapshot.model', () => ({
    DailyAnalysisSnapshot: {
        findOne: vi.fn((filter: { market: string }) => ({
            sort: vi.fn(() => ({
                select: vi.fn(() => ({
                    lean: vi.fn(async () => {
                        const matches = store.filter((d) => d.market === filter.market).sort((a, b) => (a.marketDate < b.marketDate ? 1 : -1));
                        return matches[0] ?? null;
                    }),
                })),
            })),
        })),
        find: vi.fn((filter: { market: string; marketDate: string; symbol?: { $in: string[] } }) => ({
            sort: vi.fn(() => ({
                lean: vi.fn(async () =>
                    store
                        .filter(
                            (d) =>
                                d.market === filter.market &&
                                d.marketDate === filter.marketDate &&
                                (!filter.symbol || filter.symbol.$in.includes(d.symbol)),
                        )
                        .sort((a, b) => b.score - a.score),
                ),
            })),
        })),
    },
}));

import { countByClassification, getDailyReview, getLatestSnapshotMarketDate } from '@/lib/analysis/dailyReview';

function row(overrides: Partial<DailyReviewRow>): DailyReviewRow {
    return {
        symbol: 'AAA',
        market: 'US',
        marketDate: '2024-01-05',
        close: 100,
        score: 70,
        maxScore: 100,
        status: 'QUALIFIED',
        rsi: 55,
        relativeVolume: 1.5,
        trend: 'UP',
        changeClassification: 'NO_MATERIAL_CHANGE',
        scoreChange: 0,
        ...overrides,
    };
}

function doc(overrides: Partial<FakeSnapshotDoc>): FakeSnapshotDoc {
    return {
        symbol: 'AAA',
        market: 'US',
        marketDate: '2024-01-05',
        close: 100,
        score: 70,
        maxScore: 100,
        status: 'QUALIFIED',
        rsi: 55,
        relativeVolume: 1.5,
        trend: 'UPTREND',
        changeClassification: 'NO_MATERIAL_CHANGE',
        scoreChange: 0,
        ...overrides,
    };
}

describe('countByClassification', () => {
    it('reports every classification bucket, zero-filled, never an absent key', () => {
        const counts = countByClassification([]);
        expect(Object.keys(counts).sort()).toEqual(
            ['LOST_QUALIFICATION', 'NEWLY_QUALIFIED', 'NEW_SETUP', 'NO_MATERIAL_CHANGE', 'SCORE_DETERIORATED', 'SCORE_IMPROVED', 'SETUP_INVALIDATED'].sort(),
        );
        expect(Object.values(counts).every((n) => n === 0)).toBe(true);
    });

    it('tallies rows into their classification bucket', () => {
        const counts = countByClassification([
            row({ symbol: 'AAA', changeClassification: 'NEW_SETUP' }),
            row({ symbol: 'BBB', changeClassification: 'NEW_SETUP' }),
            row({ symbol: 'CCC', changeClassification: 'SCORE_IMPROVED' }),
        ]);
        expect(counts.NEW_SETUP).toBe(2);
        expect(counts.SCORE_IMPROVED).toBe(1);
        expect(counts.NO_MATERIAL_CHANGE).toBe(0);
    });
});

describe('getDailyReview', () => {
    beforeEach(() => {
        store = [];
    });

    it('returns an empty, non-null-marketDate=false result when nothing has been generated yet', async () => {
        const result = await getDailyReview({ market: 'US' });
        expect(result.marketDate).toBeNull();
        expect(result.rows).toEqual([]);
    });

    it('uses the latest marketDate actually stored for the market, not every date ever stored', async () => {
        store.push(doc({ symbol: 'AAA', marketDate: '2024-01-04', score: 50 }));
        store.push(doc({ symbol: 'AAA', marketDate: '2024-01-05', score: 80 }));
        store.push(doc({ symbol: 'BBB', marketDate: '2024-01-05', score: 60 }));

        const result = await getDailyReview({ market: 'US' });

        expect(result.marketDate).toBe('2024-01-05');
        expect(result.rows).toHaveLength(2); // only the latest session's rows
        expect(result.rows.map((r) => r.symbol).sort()).toEqual(['AAA', 'BBB']);
    });

    it('restricts to a universe’s symbol set when universeId is provided', async () => {
        store.push(doc({ symbol: 'AAPL', marketDate: '2024-01-05' }));
        store.push(doc({ symbol: 'ZZZZ', marketDate: '2024-01-05' })); // not a real Dow-30 member

        const result = await getDailyReview({ market: 'US', universeId: 'dow-30' });

        expect(result.rows.map((r) => r.symbol)).toEqual(['AAPL']);
    });

    it('never returns a row from a different market', async () => {
        store.push(doc({ symbol: 'THYAO', market: 'TR', marketDate: '2024-01-05' }));
        store.push(doc({ symbol: 'AAA', market: 'US', marketDate: '2024-01-05' }));

        const result = await getDailyReview({ market: 'US' });
        expect(result.rows.map((r) => r.symbol)).toEqual(['AAA']);
    });
});

describe('getLatestSnapshotMarketDate', () => {
    beforeEach(() => {
        store = [];
    });

    it('returns null when nothing is stored', async () => {
        expect(await getLatestSnapshotMarketDate('US')).toBeNull();
    });

    it('returns the max marketDate for the market', async () => {
        store.push(doc({ marketDate: '2024-01-03' }));
        store.push(doc({ marketDate: '2024-01-05' }));
        store.push(doc({ marketDate: '2024-01-04' }));
        expect(await getLatestSnapshotMarketDate('US')).toBe('2024-01-05');
    });
});
