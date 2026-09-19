import { beforeEach, describe, expect, it, vi } from 'vitest';
import { summarizeSymbolWeek } from '@/lib/analysis/weeklyReview';

vi.mock('@/database/mongoose', () => ({
    connectToDatabase: vi.fn(async () => ({})),
}));

interface FakeSnapshotDoc {
    symbol: string;
    market: string;
    marketDate: string;
    close: number;
    score: number;
    status: string;
    setupType?: string;
    changeClassification: string;
}

let snapshotStore: FakeSnapshotDoc[];

vi.mock('@/database/models/dailyAnalysisSnapshot.model', () => ({
    DailyAnalysisSnapshot: {
        distinct: vi.fn(async (field: string, filter: { market: string }) => {
            void field;
            return Array.from(new Set(snapshotStore.filter((d) => d.market === filter.market).map((d) => d.marketDate)));
        }),
        find: vi.fn((filter: { market: string; marketDate: { $in: string[] }; symbol?: { $in: string[] } }) => ({
            sort: vi.fn(() => ({
                lean: vi.fn(async () =>
                    snapshotStore
                        .filter(
                            (d) =>
                                d.market === filter.market &&
                                filter.marketDate.$in.includes(d.marketDate) &&
                                (!filter.symbol || filter.symbol.$in.includes(d.symbol)),
                        )
                        .sort((a, b) => (a.symbol === b.symbol ? (a.marketDate < b.marketDate ? -1 : 1) : a.symbol < b.symbol ? -1 : 1)),
                ),
            })),
        })),
    },
}));

interface FakeCandidateDoc {
    _id: string;
    userId: string;
    symbol: string;
    status: string;
    closedAt: Date;
}

let candidateStore: FakeCandidateDoc[];

vi.mock('@/database/models/candidate.model', () => ({
    Candidate: {
        find: vi.fn((filter: { userId: string; status: { $ne: string }; closedAt: { $gte: Date } }) => ({
            sort: vi.fn(() => ({
                lean: vi.fn(async () =>
                    candidateStore
                        .filter(
                            (c) =>
                                c.userId === filter.userId &&
                                c.status !== filter.status.$ne &&
                                c.closedAt.getTime() >= filter.closedAt.$gte.getTime(),
                        )
                        .sort((a, b) => b.closedAt.getTime() - a.closedAt.getTime()),
                ),
            })),
        })),
    },
}));

import { getWeeklyCandidateOutcomeChanges, getWeeklyReview } from '@/lib/analysis/weeklyReview';

describe('summarizeSymbolWeek (pure)', () => {
    const sessionDates = ['2024-01-02', '2024-01-03', '2024-01-04', '2024-01-05', '2024-01-08'];

    it('computes score change, return, qualified count, and status changes over a full week', () => {
        const docs = [
            { symbol: 'AAA', marketDate: '2024-01-02', score: 50, status: 'WATCH' as const, close: 100, changeClassification: 'NEW_SETUP' as const },
            { symbol: 'AAA', marketDate: '2024-01-03', score: 60, status: 'WATCH' as const, close: 102, changeClassification: 'SCORE_IMPROVED' as const },
            { symbol: 'AAA', marketDate: '2024-01-04', score: 75, status: 'QUALIFIED' as const, close: 108, changeClassification: 'NEWLY_QUALIFIED' as const },
            { symbol: 'AAA', marketDate: '2024-01-05', score: 80, status: 'QUALIFIED' as const, close: 110, changeClassification: 'NO_MATERIAL_CHANGE' as const },
            { symbol: 'AAA', marketDate: '2024-01-08', score: 65, status: 'WATCH' as const, close: 104, changeClassification: 'LOST_QUALIFICATION' as const },
        ];

        const summary = summarizeSymbolWeek('AAA', 'US', sessionDates, docs);

        expect(summary.observedSessionCount).toBe(5);
        expect(summary.qualifiedSessionCount).toBe(2);
        expect(summary.weeklyScoreChange).toBe(65 - 50);
        expect(summary.weeklyReturnPct).toBeCloseTo((104 - 100) / 100, 10);
        expect(summary.weeklyHigh).toBe(110);
        expect(summary.weeklyLow).toBe(100);
        // WATCH->WATCH->QUALIFIED->QUALIFIED->WATCH: 2 transitions.
        expect(summary.statusChangeCount).toBe(2);
        expect(summary.latestStatus).toBe('WATCH');
        expect(summary.latestClassification).toBe('LOST_QUALIFICATION');
        expect(summary.scoreSequence.map((p) => p.score)).toEqual([50, 60, 75, 80, 65]);
    });

    it('never fabricates a value for a gap session — leaves it null in the sequence and out of the aggregates', () => {
        const docs = [
            { symbol: 'AAA', marketDate: '2024-01-02', score: 50, status: 'WATCH' as const, close: 100, changeClassification: 'NEW_SETUP' as const },
            // 01-03 missing entirely (a gap, e.g. sync failure that day)
            { symbol: 'AAA', marketDate: '2024-01-04', score: 55, status: 'WATCH' as const, close: 101, changeClassification: 'NO_MATERIAL_CHANGE' as const },
        ];

        const summary = summarizeSymbolWeek('AAA', 'US', sessionDates, docs);

        expect(summary.observedSessionCount).toBe(2);
        expect(summary.scoreSequence.map((p) => p.score)).toEqual([50, null, 55, null, null]);
        expect(summary.weeklyScoreChange).toBe(5);
    });

    it('reports null score change / return for a symbol observed on only one session', () => {
        const docs = [{ symbol: 'AAA', marketDate: '2024-01-08', score: 90, status: 'QUALIFIED' as const, close: 120, changeClassification: 'NEW_SETUP' as const }];
        const summary = summarizeSymbolWeek('AAA', 'US', sessionDates, docs);

        expect(summary.observedSessionCount).toBe(1);
        expect(summary.weeklyScoreChange).toBeNull();
        expect(summary.weeklyReturnPct).toBeNull();
        expect(summary.statusChangeCount).toBe(0);
    });

    it('reports every field as empty/null for a symbol with zero observed sessions', () => {
        const summary = summarizeSymbolWeek('AAA', 'US', sessionDates, []);

        expect(summary.observedSessionCount).toBe(0);
        expect(summary.qualifiedSessionCount).toBe(0);
        expect(summary.weeklyScoreChange).toBeNull();
        expect(summary.weeklyHigh).toBeNull();
        expect(summary.weeklyLow).toBeNull();
        expect(summary.latestStatus).toBeNull();
        expect(summary.scoreSequence.every((p) => p.score === null)).toBe(true);
    });
});

describe('getWeeklyReview', () => {
    beforeEach(() => {
        snapshotStore = [];
    });

    it('returns an empty result when nothing has been generated yet', async () => {
        const result = await getWeeklyReview({ market: 'US' });
        expect(result.sessionDates).toEqual([]);
        expect(result.symbols).toEqual([]);
    });

    it('caps the window at the 5 most recent distinct sessions', async () => {
        const dates = ['2024-01-01', '2024-01-02', '2024-01-03', '2024-01-04', '2024-01-05', '2024-01-08'];
        for (const d of dates) {
            snapshotStore.push({ symbol: 'AAA', market: 'US', marketDate: d, score: 60, status: 'WATCH', changeClassification: 'NO_MATERIAL_CHANGE', close: 100 });
        }

        const result = await getWeeklyReview({ market: 'US' });

        expect(result.sessionDates).toEqual(['2024-01-02', '2024-01-03', '2024-01-04', '2024-01-05', '2024-01-08']);
        expect(result.symbols[0].observedSessionCount).toBe(5); // the oldest date (01-01) is outside the window
    });

    it('produces one summary per distinct symbol observed in the window', async () => {
        snapshotStore.push({ symbol: 'AAA', market: 'US', marketDate: '2024-01-05', score: 70, status: 'QUALIFIED', changeClassification: 'NEW_SETUP', close: 100 });
        snapshotStore.push({ symbol: 'BBB', market: 'US', marketDate: '2024-01-05', score: 40, status: 'PASS', changeClassification: 'NO_MATERIAL_CHANGE', close: 50 });

        const result = await getWeeklyReview({ market: 'US' });
        expect(result.symbols.map((s) => s.symbol).sort()).toEqual(['AAA', 'BBB']);
    });
});

describe('getWeeklyCandidateOutcomeChanges', () => {
    beforeEach(() => {
        candidateStore = [];
    });

    it('returns candidates resolved on or after sinceDate for the requesting user only', async () => {
        candidateStore.push({ _id: 'c1', userId: 'user-1', symbol: 'AAA', status: 'TARGET_1_HIT', closedAt: new Date('2024-01-05T10:00:00Z') });
        candidateStore.push({ _id: 'c2', userId: 'user-1', symbol: 'BBB', status: 'STOP_HIT', closedAt: new Date('2023-12-20T10:00:00Z') }); // too early
        candidateStore.push({ _id: 'c3', userId: 'user-2', symbol: 'CCC', status: 'STOP_HIT', closedAt: new Date('2024-01-06T10:00:00Z') }); // different user

        const result = await getWeeklyCandidateOutcomeChanges('user-1', '2024-01-01');

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({ candidateId: 'c1', symbol: 'AAA', status: 'TARGET_1_HIT' });
    });
});
