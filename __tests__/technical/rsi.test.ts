import { describe, expect, it } from 'vitest';
import { rsi } from '@/lib/technical/rsi';

describe('rsi', () => {
    it('reads 100 for a monotonically increasing run (no losses at all)', () => {
        const series = rsi([10, 11, 12, 13, 14, 15], 5);
        expect(series[5]).toBe(100);
    });

    it('reads 0 for a monotonically decreasing run (no gains at all)', () => {
        const series = rsi([15, 14, 13, 12, 11, 10], 5);
        expect(series[5]).toBe(0);
    });

    it('reads 50 for a completely flat run (no change at all)', () => {
        const series = rsi([10, 10, 10, 10, 10, 10], 5);
        expect(series[5]).toBe(50);
    });

    it('matches a hand-computed mixed gain/loss case', () => {
        // changes: +2, -1, +2 => avgGain=4/3, avgLoss=1/3, RS=4, RSI=100-100/5=80
        const series = rsi([10, 12, 11, 13], 3);
        expect(series[3]).toBeCloseTo(80, 6);
    });

    it('continues smoothing correctly past the seed period', () => {
        // Continuing the case above with one more bar (13 -> 12, a loss of 1):
        // avgGain = (4/3*2 + 0)/3 = 8/9, avgLoss = (1/3*2 + 1)/3 = 5/9
        // RS = 8/5 = 1.6, RSI = 100 - 100/2.6 = 61.538461...
        const series = rsi([10, 12, 11, 13, 12], 3);
        expect(series[4]).toBeCloseTo(61.538461, 5);
    });

    it('is null during the warm-up period and when there is not enough history', () => {
        const series = rsi([10, 12, 11, 13], 3);
        expect(series.slice(0, 3)).toEqual([null, null, null]);
        expect(rsi([1, 2], 14)).toEqual([null, null]);
    });
});
