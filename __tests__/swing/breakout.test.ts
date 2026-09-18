import { describe, expect, it } from 'vitest';
import { buildBreakoutTradePlan, evaluateBreakoutSetup } from '@/lib/swing/setups/breakout';
import { defaultSwingStrategyConfig } from '@/lib/swing/config';
import type { IndicatorSnapshot } from '@/lib/swing/types';

function baseSnapshot(overrides: Partial<IndicatorSnapshot> = {}): IndicatorSnapshot {
    return {
        symbol: 'TEST',
        asOf: '2024-01-01',
        price: 110,
        sma20: 108,
        sma50: 105,
        sma200: 100,
        ema9: 109,
        ema21: 107,
        rsi14: 55,
        macd: { macd: 1.5, signal: 1.0, histogram: 0.5 },
        stochastic: { k: 60, d: 55 },
        bollinger: { upper: 115, middle: 108, lower: 101, bandwidth: 12 },
        atr14: 2,
        relativeVolume: 1.5,
        trend: 'UP',
        support: [{ low: 105, high: 106 }],
        resistance: [],
        bars: [],
        ...overrides,
    };
}

describe('buildBreakoutTradePlan', () => {
    it('derives entry/stop/targets from the broken support level with a documented 2R/3R fallback', () => {
        const plan = buildBreakoutTradePlan(baseSnapshot());

        expect(plan.entryZone).toEqual({ low: 105, high: 106 });
        // entryReference = (105+106)/2 = 105.5, stop = 105 - atr(2)*0.5 = 104, risk = 1.5
        expect(plan.stopLevel).toBeCloseTo(104, 10);
        // no resistance above price -> target1 = 105.5 + 1.5*2 = 108.5, target2 = 105.5 + 1.5*3 = 110
        expect(plan.targets).toEqual([108.5, 110]);
        expect(plan.riskReward).toBeCloseTo(2.0, 10);
        expect(plan.warnings).toHaveLength(2); // both targets used the risk-multiple fallback
    });

    it('uses real resistance zones as targets when they exist, instead of the risk-multiple fallback', () => {
        const plan = buildBreakoutTradePlan(
            baseSnapshot({ resistance: [{ low: 112, high: 113 }, { low: 120, high: 121 }] }),
        );

        expect(plan.targets).toEqual([112, 120]);
        // risk = 1.5, reward to target1 = 112 - 105.5 = 6.5 -> R/R = 6.5/1.5
        expect(plan.riskReward).toBeCloseTo(6.5 / 1.5, 10);
        expect(plan.warnings).toEqual([]);
    });

    it('reports no levels (and a warning) when there is no nearby support structure', () => {
        const plan = buildBreakoutTradePlan(baseSnapshot({ support: [] }));
        expect(plan.entryZone).toBeUndefined();
        expect(plan.stopLevel).toBeUndefined();
        expect(plan.targets).toBeUndefined();
        expect(plan.warnings).toEqual([
            'No support/resistance structure was found near the current price — trade plan levels are unavailable.',
        ]);
    });
});

describe('evaluateBreakoutSetup', () => {
    it('passes every rule and scores 100 when every condition is favorable', () => {
        const { rules } = evaluateBreakoutSetup(baseSnapshot(), defaultSwingStrategyConfig);
        expect(rules.every((r) => r.passed)).toBe(true);
        expect(rules.reduce((sum, r) => sum + r.score, 0)).toBe(100);
        expect(rules.reduce((sum, r) => sum + r.maxScore, 0)).toBe(100);
    });

    it('fails the trend rule when the trend is not UP', () => {
        const { rules } = evaluateBreakoutSetup(baseSnapshot({ trend: 'SIDEWAYS' }), defaultSwingStrategyConfig);
        const trendRule = rules.find((r) => r.id === 'trend')!;
        expect(trendRule.passed).toBe(false);
        expect(trendRule.score).toBe(0);
    });

    it('fails the structure rule (but still computes a trade plan) when price has run too far from the broken level', () => {
        const snapshot = baseSnapshot({ support: [{ low: 100, high: 101 }], atr14: 1, price: 110 });
        const { rules, tradePlan } = evaluateBreakoutSetup(snapshot, defaultSwingStrategyConfig);

        const structureRule = rules.find((r) => r.id === 'structure')!;
        expect(structureRule.passed).toBe(false);
        expect(tradePlan.entryZone).toEqual({ low: 100, high: 101 }); // plan is still shown for reference
    });

    it('fails the structure rule with no trade plan when there is no support zone at all', () => {
        const { rules, tradePlan } = evaluateBreakoutSetup(baseSnapshot({ support: [] }), defaultSwingStrategyConfig);
        expect(rules.find((r) => r.id === 'structure')!.passed).toBe(false);
        expect(rules.find((r) => r.id === 'riskReward')!.passed).toBe(false);
        expect(tradePlan.targets).toBeUndefined();
    });

    it('fails the volume rule below the configured relative-volume minimum', () => {
        const { rules } = evaluateBreakoutSetup(baseSnapshot({ relativeVolume: 0.8 }), defaultSwingStrategyConfig);
        expect(rules.find((r) => r.id === 'volume')!.passed).toBe(false);
    });

    it('fails the RSI rule outside the configured range (both overbought and oversold)', () => {
        expect(evaluateBreakoutSetup(baseSnapshot({ rsi14: 85 }), defaultSwingStrategyConfig).rules.find((r) => r.id === 'rsi')!.passed).toBe(false);
        expect(evaluateBreakoutSetup(baseSnapshot({ rsi14: 20 }), defaultSwingStrategyConfig).rules.find((r) => r.id === 'rsi')!.passed).toBe(false);
    });

    it('fails the MACD rule when the histogram is not positive', () => {
        const snapshot = baseSnapshot({ macd: { macd: 1, signal: 1.2, histogram: -0.2 } });
        expect(evaluateBreakoutSetup(snapshot, defaultSwingStrategyConfig).rules.find((r) => r.id === 'macd')!.passed).toBe(false);
    });

    it('surfaces "could not be computed" explanations instead of failing silently when indicators are null', () => {
        const snapshot = baseSnapshot({ rsi14: null, relativeVolume: null, macd: { macd: null, signal: null, histogram: null } });
        const { rules } = evaluateBreakoutSetup(snapshot, defaultSwingStrategyConfig);

        expect(rules.find((r) => r.id === 'rsi')!.explanation).toContain('could not be computed');
        expect(rules.find((r) => r.id === 'volume')!.explanation).toContain('could not be computed');
        expect(rules.find((r) => r.id === 'macd')!.explanation).toContain('could not be computed');
    });
});
