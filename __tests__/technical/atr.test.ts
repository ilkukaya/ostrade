import { describe, expect, it } from 'vitest';
import { atr } from '@/lib/technical/atr';
import type { OhlcBar } from '@/lib/technical/types';

function bar(high: number, low: number, close: number): OhlcBar {
    return { time: '2024-01-01', open: close, high, low, close, volume: 1000 };
}

describe('atr', () => {
    it('is zero when every bar has zero range and no gaps', () => {
        const bars = [bar(10, 10, 10), bar(10, 10, 10), bar(10, 10, 10), bar(10, 10, 10)];
        const result = atr(bars, 2);
        expect(result[2]).toBe(0);
        expect(result[3]).toBe(0);
    });

    it('matches a hand-computed constant-true-range case', () => {
        // Every bar has a true range of exactly 2 (high-low=2, no gaps), so
        // Wilder's smoothing trivially stays at 2 throughout.
        const bars = [bar(10, 8, 9), bar(11, 9, 10), bar(12, 10, 11), bar(13, 11, 12)];
        const result = atr(bars, 2);
        expect(result.slice(0, 2)).toEqual([null, null]);
        expect(result[2]).toBeCloseTo(2, 10);
        expect(result[3]).toBeCloseTo(2, 10);
    });

    it('accounts for gaps via the high/low-to-previous-close terms', () => {
        // A gap up: bar 2 opens/trades entirely above bar 1's close.
        const bars = [bar(10, 9, 9), bar(20, 18, 19)];
        const result = atr(bars, 1);
        // TR = max(high-low=2, |high-prevClose|=|20-9|=11, |low-prevClose|=|18-9|=9) = 11
        expect(result[1]).toBeCloseTo(11, 10);
    });

    it('returns all nulls when there is not enough history', () => {
        const bars = [bar(10, 8, 9)];
        expect(atr(bars, 14)).toEqual([null]);
    });
});
