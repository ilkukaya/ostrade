import { describe, expect, it } from 'vitest';
import { stochastic } from '@/lib/technical/stochastic';
import type { OhlcBar } from '@/lib/technical/types';

function bar(high: number, low: number, close: number): OhlcBar {
    return { time: '2024-01-01', open: close, high, low, close, volume: 1000 };
}

describe('stochastic', () => {
    it('matches a hand-computed %K/%D case', () => {
        const bars = [bar(10, 8, 9), bar(12, 9, 11), bar(11, 9, 10), bar(13, 10, 12)];
        const result = stochastic(bars, 3, 2);

        // i=2: window bars[0..2], highestHigh=12, lowestLow=8, close=10 -> (10-8)/4*100=50
        expect(result.k[2]).toBeCloseTo(50, 10);
        // i=3: window bars[1..3], highestHigh=13, lowestLow=9, close=12 -> (12-9)/4*100=75
        expect(result.k[3]).toBeCloseTo(75, 10);
        expect(result.k.slice(0, 2)).toEqual([null, null]);

        // %D is the 2-period SMA of %K: null at the first valid k, then (50+75)/2=62.5
        expect(result.d[2]).toBeNull();
        expect(result.d[3]).toBeCloseTo(62.5, 10);
    });

    it('reads 50 when the range is completely flat (high === low)', () => {
        const bars = [bar(10, 10, 10), bar(10, 10, 10), bar(10, 10, 10)];
        const result = stochastic(bars, 3, 2);
        expect(result.k[2]).toBe(50);
    });

    it('is null when there is not enough history', () => {
        const bars = [bar(10, 8, 9)];
        const result = stochastic(bars, 3, 2);
        expect(result.k).toEqual([null]);
        expect(result.d).toEqual([null]);
    });
});
