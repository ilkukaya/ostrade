import { describe, expect, it } from 'vitest';
import {
    computeBacktestStatsByScoreBucket,
    computeBacktestStatsBySetup,
    computeBacktestStatsByYear,
    computeBacktestSummary,
    splitTrainHoldout,
} from '@/lib/backtest/aggregate';
import type { BacktestTrade } from '@/lib/backtest/types';

function trade(overrides: Partial<BacktestTrade> = {}): BacktestTrade {
    return {
        symbol: 'TEST',
        setupType: 'BREAKOUT',
        score: 80,
        maxScore: 100,
        riskReward: 2,
        signalDate: '2024-01-01',
        entryDate: '2024-01-02',
        entryPrice: 100,
        stopLevel: 90,
        targets: [120, 130],
        exitDate: '2024-01-05',
        exitPrice: 120,
        outcome: 'TARGET_1_HIT',
        grossRMultiple: 2,
        netRMultiple: 2,
        maxFavorableExcursion: 20,
        maxAdverseExcursion: 2,
        ...overrides,
    };
}

describe('computeBacktestSummary', () => {
    it('excludes STILL_OPEN and AMBIGUOUS trades from win rate / R stats but still counts them', () => {
        const trades = [
            trade({ outcome: 'TARGET_1_HIT', netRMultiple: 2 }),
            trade({ outcome: 'STOP_HIT', netRMultiple: -1 }),
            trade({ outcome: 'STILL_OPEN', netRMultiple: null, grossRMultiple: null }),
            trade({ outcome: 'AMBIGUOUS', netRMultiple: null, grossRMultiple: null }),
        ];
        const summary = computeBacktestSummary(trades);
        expect(summary.totalSignals).toBe(4);
        expect(summary.resolvedCount).toBe(2);
        expect(summary.winRate).toBe(0.5);
        expect(summary.stillOpenCount).toBe(1);
        expect(summary.ambiguousCount).toBe(1);
    });

    it('computes profit factor as the ratio of summed wins to summed losses', () => {
        const trades = [trade({ netRMultiple: 3 }), trade({ netRMultiple: -1 }), trade({ netRMultiple: -1 })];
        const summary = computeBacktestSummary(trades);
        expect(summary.profitFactor).toBeCloseTo(3 / 2);
    });

    it('reports profit factor as null (undefined), not Infinity, when there are no losses yet', () => {
        const summary = computeBacktestSummary([trade({ netRMultiple: 2 })]);
        expect(summary.profitFactor).toBeNull();
    });

    it('computes max drawdown from the sequential cumulative-R curve ordered by entry date', () => {
        const trades = [
            trade({ entryDate: '2024-01-01', netRMultiple: 2 }), // cumulative: 2 (peak 2)
            trade({ entryDate: '2024-01-02', netRMultiple: -3 }), // cumulative: -1 (drawdown from peak 2 = 3)
            trade({ entryDate: '2024-01-03', netRMultiple: 1 }), // cumulative: 0
        ];
        const summary = computeBacktestSummary(trades);
        expect(summary.maxDrawdownR).toBeCloseTo(3);
    });

    it('returns null stats (not zero/NaN) when nothing has resolved', () => {
        const summary = computeBacktestSummary([trade({ outcome: 'STILL_OPEN', netRMultiple: null, grossRMultiple: null })]);
        expect(summary.winRate).toBeNull();
        expect(summary.avgNetR).toBeNull();
        expect(summary.maxDrawdownR).toBeNull();
        expect(summary.profitFactor).toBeNull();
    });
});

describe('computeBacktestStatsByYear', () => {
    it('groups resolved trades by entry year', () => {
        const trades = [
            trade({ entryDate: '2023-06-01', netRMultiple: 2 }),
            trade({ entryDate: '2023-08-01', netRMultiple: -1 }),
            trade({ entryDate: '2024-02-01', netRMultiple: 1 }),
        ];
        const byYear = computeBacktestStatsByYear(trades);
        expect(byYear.map((g) => g.label)).toEqual(['2023', '2024']);
        expect(byYear.find((g) => g.label === '2023')!.n).toBe(2);
        expect(byYear.find((g) => g.label === '2024')!.n).toBe(1);
    });
});

describe('computeBacktestStatsBySetup', () => {
    it('groups by setupType, falling back to UNSPECIFIED', () => {
        const trades = [trade({ setupType: 'BREAKOUT' }), trade({ setupType: undefined })];
        const bySetup = computeBacktestStatsBySetup(trades);
        expect(bySetup.map((g) => g.label).sort()).toEqual(['BREAKOUT', 'UNSPECIFIED']);
    });
});

describe('splitTrainHoldout', () => {
    it('splits trades by entry date, holdout inclusive of the boundary date', () => {
        const trades = [
            trade({ entryDate: '2023-06-01' }),
            trade({ entryDate: '2023-12-31' }),
            trade({ entryDate: '2024-01-01' }), // exactly the boundary -> holdout
            trade({ entryDate: '2024-03-01' }),
        ];
        const { trainTrades, holdoutTrades } = splitTrainHoldout(trades, '2024-01-01');
        expect(trainTrades.map((t) => t.entryDate)).toEqual(['2023-06-01', '2023-12-31']);
        expect(holdoutTrades.map((t) => t.entryDate)).toEqual(['2024-01-01', '2024-03-01']);
    });

    it('lets each half be summarized independently with the existing summary function', () => {
        const trades = [
            trade({ entryDate: '2023-06-01', netRMultiple: 2 }),
            trade({ entryDate: '2024-06-01', netRMultiple: -1 }),
        ];
        const { trainTrades, holdoutTrades } = splitTrainHoldout(trades, '2024-01-01');
        expect(computeBacktestSummary(trainTrades).winRate).toBe(1);
        expect(computeBacktestSummary(holdoutTrades).winRate).toBe(0);
    });
});

describe('computeBacktestStatsByScoreBucket', () => {
    it('reuses the same default score buckets as candidate statistics', () => {
        const trades = [trade({ score: 62 }), trade({ score: 95 })];
        const buckets = computeBacktestStatsByScoreBucket(trades);
        expect(buckets.find((b) => b.label === '60-64')!.n).toBe(1);
        expect(buckets.find((b) => b.label === '90+')!.n).toBe(1);
        expect(buckets.find((b) => b.label === '70-74')!.n).toBe(0);
    });
});
