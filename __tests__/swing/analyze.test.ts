import { describe, expect, it } from 'vitest';
import { analyzeSwingSetup } from '@/lib/swing/analyze';
import { buildIndicatorSnapshot } from '@/lib/swing/indicatorSnapshot';
import { determineStatus } from '@/lib/swing/score';
import { defaultSwingStrategyConfig } from '@/lib/swing/config';
import type { OhlcBar } from '@/lib/technical/types';

/** A deterministic (no randomness) gentle uptrend with oscillation, long
 * enough to exercise every indicator including MACD's signal line (needs
 * 26 + 9 = 35 bars) and RSI/ATR's 14-day windows. */
function makeUptrendBars(count: number): OhlcBar[] {
    const bars: OhlcBar[] = [];
    for (let i = 0; i < count; i++) {
        const close = 100 + i * 0.5 + Math.sin(i / 3) * 2;
        bars.push({
            time: `2024-${String(Math.floor(i / 28) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
            open: close,
            high: close * 1.01,
            low: close * 0.99,
            close,
            volume: 1_000_000 + (i % 5) * 10_000,
        });
    }
    return bars;
}

describe('analyzeSwingSetup', () => {
    it('returns null when there are no bars at all', () => {
        expect(analyzeSwingSetup('TEST', [])).toBeNull();
    });

    it('degrades gracefully (no throw) with far too little history', () => {
        const result = analyzeSwingSetup('TEST', makeUptrendBars(2));
        expect(result).not.toBeNull();
        expect(result!.score).toBeLessThan(result!.maxScore);
        expect(result!.status).toBe('PASS');
        expect(result!.rules.some((r) => r.explanation.includes('could not be computed'))).toBe(true);
    });

    it('produces internally consistent results against an independently-built snapshot', () => {
        const bars = makeUptrendBars(60);
        const result = analyzeSwingSetup('TEST', bars, defaultSwingStrategyConfig)!;
        const snapshot = buildIndicatorSnapshot('TEST', bars, defaultSwingStrategyConfig)!;

        expect(result.symbol).toBe('TEST');
        expect(result.setupType).toBe('BREAKOUT');
        expect(result.maxScore).toBe(100);

        // Score is exactly the sum of the individual rule scores.
        expect(result.score).toBe(result.rules.reduce((sum, r) => sum + r.score, 0));

        // Status is a pure function of (score, rules, config) — recomputing
        // it independently must agree with what analyzeSwingSetup returned.
        expect(result.status).toBe(determineStatus(result.score, result.rules, defaultSwingStrategyConfig));

        // Support/resistance zones surfaced on the result match what the
        // snapshot computed for the same bars/config.
        expect(result.supportLevels).toEqual(snapshot.support);
        expect(result.resistanceLevels).toEqual(snapshot.resistance);

        // The RSI rule's reported value matches the snapshot's RSI reading.
        const rsiRule = result.rules.find((r) => r.id === 'rsi')!;
        expect(rsiRule.value).toBe(snapshot.rsi14 !== null ? Number(snapshot.rsi14.toFixed(1)) : undefined);
    });

    it('is deterministic: the same bars and config always produce the same result', () => {
        const bars = makeUptrendBars(60);
        const first = analyzeSwingSetup('TEST', bars);
        const second = analyzeSwingSetup('TEST', bars);

        expect(first!.score).toBe(second!.score);
        expect(first!.status).toBe(second!.status);
        expect(first!.rules).toEqual(second!.rules);
        expect(first!.entryZone).toEqual(second!.entryZone);
        expect(first!.targets).toEqual(second!.targets);
    });
});
