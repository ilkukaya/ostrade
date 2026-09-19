import { describe, expect, it } from 'vitest';
import { buildCandidateSnapshot } from '@/database/models/candidate.model';
import type { IndicatorSnapshot, SwingAnalysisResult } from '@/lib/swing/types';

function makeSnapshot(overrides: Partial<IndicatorSnapshot> = {}): IndicatorSnapshot {
    return {
        symbol: 'AAPL',
        asOf: '2026-09-19',
        price: 150,
        sma20: 148,
        sma50: 145,
        sma200: 140,
        ema9: 149,
        ema21: 147,
        rsi14: 58,
        macd: { macd: 1.2, signal: 0.9, histogram: 0.3 },
        stochastic: { k: 60, d: 55 },
        bollinger: { upper: 155, middle: 148, lower: 141, bandwidth: 9.5 },
        atr14: 2.1,
        relativeVolume: 1.7,
        trend: 'UP',
        support: [{ low: 144, high: 146 }],
        resistance: [{ low: 152, high: 154 }],
        bars: [{ time: '2026-09-19', open: 149, high: 151, low: 148, close: 150, volume: 1_000_000 }],
        ...overrides,
    };
}

function makeAnalysis(overrides: Partial<SwingAnalysisResult> = {}): SwingAnalysisResult {
    return {
        symbol: 'AAPL',
        timestamp: '2026-09-19T14:30:00.000Z',
        score: 82,
        maxScore: 100,
        setupType: 'BREAKOUT',
        status: 'QUALIFIED',
        rules: [
            { id: 'trend', name: 'Trend', passed: true, score: 20, maxScore: 20, explanation: 'Uptrend confirmed.' },
        ],
        entryZone: { low: 144, high: 146 },
        stopLevel: 143,
        targets: [152, 158],
        riskReward: 2.7,
        supportLevels: [{ low: 144, high: 146 }],
        resistanceLevels: [{ low: 152, high: 154 }],
        ...overrides,
    };
}

describe('buildCandidateSnapshot', () => {
    it('freezes the analysis + indicator readings into a plain snapshot object', () => {
        const snapshot = buildCandidateSnapshot({
            userId: 'user-1',
            analysis: makeAnalysis(),
            snapshot: makeSnapshot(),
        });

        expect(snapshot.userId).toBe('user-1');
        expect(snapshot.symbol).toBe('AAPL');
        expect(snapshot.signalAt).toEqual(new Date('2026-09-19T14:30:00.000Z'));
        expect(snapshot.score).toBe(82);
        expect(snapshot.analysisStatus).toBe('QUALIFIED');
        expect(snapshot.setupType).toBe('BREAKOUT');
        expect(snapshot.entryZone).toEqual({ low: 144, high: 146 });
        expect(snapshot.stopLevel).toBe(143);
        expect(snapshot.targets).toEqual([152, 158]);
        expect(snapshot.riskReward).toBe(2.7);
        expect(snapshot.status).toBe('ACTIVE');
        expect(snapshot.rules).toHaveLength(1);
    });

    it('excludes the raw bars array and duplicate symbol from the stored indicator snapshot', () => {
        const snapshot = buildCandidateSnapshot({
            userId: 'user-1',
            analysis: makeAnalysis(),
            snapshot: makeSnapshot(),
        });

        expect(snapshot.indicatorSnapshot).not.toHaveProperty('bars');
        expect(snapshot.indicatorSnapshot).not.toHaveProperty('symbol');
        expect(snapshot.indicatorSnapshot.rsi14).toBe(58);
        expect(snapshot.indicatorSnapshot.relativeVolume).toBe(1.7);
        expect(snapshot.indicatorSnapshot.trend).toBe('UP');
    });

    it('defaults strategyId/strategyVersion when not provided', () => {
        const snapshot = buildCandidateSnapshot({ userId: 'user-1', analysis: makeAnalysis(), snapshot: makeSnapshot() });
        expect(snapshot.strategyId).toBe('swing-core');
        expect(snapshot.strategyVersion).toBe('1.0');
    });

    it('honors an explicit strategyId/strategyVersion', () => {
        const snapshot = buildCandidateSnapshot({
            userId: 'user-1',
            analysis: makeAnalysis(),
            snapshot: makeSnapshot(),
            strategyId: 'swing-experimental',
            strategyVersion: '2.0-beta',
        });
        expect(snapshot.strategyId).toBe('swing-experimental');
        expect(snapshot.strategyVersion).toBe('2.0-beta');
    });

    it('two snapshots of the same symbol at different times are independent (no shared mutable state)', () => {
        const first = buildCandidateSnapshot({ userId: 'user-1', analysis: makeAnalysis({ score: 60 }), snapshot: makeSnapshot({ rsi14: 45 }) });
        const second = buildCandidateSnapshot({ userId: 'user-1', analysis: makeAnalysis({ score: 90 }), snapshot: makeSnapshot({ rsi14: 65 }) });

        expect(first.score).toBe(60);
        expect(first.indicatorSnapshot.rsi14).toBe(45);
        expect(second.score).toBe(90);
        expect(second.indicatorSnapshot.rsi14).toBe(65);
    });
});
