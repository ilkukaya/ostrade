import { describe, expect, it } from 'vitest';
import { computeOverallTradeStats, computeTradeStatsBySetup, type TradeForStats } from '@/lib/statistics/tradeStats';

function trade(overrides: Partial<TradeForStats> = {}): TradeForStats {
    return { status: 'WIN', currency: 'USD', netPnl: 100, rMultiple: 2, setupType: 'BREAKOUT', ...overrides };
}

describe('computeOverallTradeStats', () => {
    it('excludes OPEN trades from every closed-trade statistic', () => {
        const trades = [trade({ status: 'OPEN', netPnl: undefined, rMultiple: undefined }), trade({ status: 'WIN' })];
        const stats = computeOverallTradeStats(trades);
        expect(stats.totalLogged).toBe(2);
        expect(stats.openCount).toBe(1);
        expect(stats.closedCount).toBe(1);
        expect(stats.winRate).toBe(1);
    });

    it('computes win rate and R stats across closed trades', () => {
        const trades = [
            trade({ status: 'WIN', rMultiple: 2 }),
            trade({ status: 'LOSS', rMultiple: -1 }),
            trade({ status: 'BREAKEVEN', rMultiple: 0 }),
        ];
        const stats = computeOverallTradeStats(trades);
        expect(stats.winRate).toBeCloseTo(1 / 3);
        expect(stats.avgR).toBeCloseTo((2 - 1 + 0) / 3);
        expect(stats.medianR).toBe(0);
    });

    it('never blends P/L across currencies — each currency gets its own totals', () => {
        const trades = [
            trade({ currency: 'USD', netPnl: 100, status: 'WIN' }),
            trade({ currency: 'USD', netPnl: -40, status: 'LOSS' }),
            trade({ currency: 'TRY', netPnl: 500, status: 'WIN' }),
        ];
        const stats = computeOverallTradeStats(trades);
        expect(stats.byCurrency.USD.n).toBe(2);
        expect(stats.byCurrency.USD.totalNetPnl).toBe(60);
        expect(stats.byCurrency.USD.profitFactor).toBeCloseTo(100 / 40);
        expect(stats.byCurrency.TRY.n).toBe(1);
        expect(stats.byCurrency.TRY.totalNetPnl).toBe(500);
        // No losing TRY trades yet -> profit factor is undefined, not Infinity.
        expect(stats.byCurrency.TRY.profitFactor).toBeNull();
    });

    it('returns null win/R stats when nothing has closed yet', () => {
        const stats = computeOverallTradeStats([trade({ status: 'OPEN', netPnl: undefined, rMultiple: undefined })]);
        expect(stats.winRate).toBeNull();
        expect(stats.avgR).toBeNull();
        expect(stats.medianR).toBeNull();
        expect(stats.byCurrency).toEqual({});
    });
});

describe('computeTradeStatsBySetup', () => {
    it('groups closed trades by setup type, excluding OPEN trades', () => {
        const trades = [
            trade({ setupType: 'BREAKOUT', status: 'WIN', rMultiple: 2 }),
            trade({ setupType: 'BREAKOUT', status: 'LOSS', rMultiple: -1 }),
            trade({ setupType: undefined, status: 'WIN', rMultiple: 1 }),
            trade({ setupType: 'BREAKOUT', status: 'OPEN', netPnl: undefined, rMultiple: undefined }),
        ];
        const groups = computeTradeStatsBySetup(trades);
        const breakout = groups.find((g) => g.setupType === 'BREAKOUT')!;
        expect(breakout.n).toBe(2);
        expect(breakout.winRate).toBe(0.5);
        expect(breakout.avgR).toBeCloseTo(0.5);

        const unspecified = groups.find((g) => g.setupType === 'UNSPECIFIED')!;
        expect(unspecified.n).toBe(1);
    });
});
