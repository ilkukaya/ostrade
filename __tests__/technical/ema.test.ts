import { describe, expect, it } from 'vitest';
import { ema } from '@/lib/technical/ema';
import { sma } from '@/lib/technical/sma';

describe('ema', () => {
    it('matches SMA over a perfectly linear series (no surprise to react to)', () => {
        expect(ema([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
    });

    it('reacts faster than SMA to a sudden jump', () => {
        const values = [10, 10, 10, 10, 20];
        const smaSeries = sma(values, 3);
        const emaSeries = ema(values, 3);

        // SMA(3) at the jump: (10 + 10 + 20) / 3 = 13.33...
        expect(smaSeries[4]).toBeCloseTo(13.3333, 3);
        // EMA(3) at the jump: 20*0.5 + 10*0.5 = 15
        expect(emaSeries[4]).toBe(15);
        expect(emaSeries[4]!).toBeGreaterThan(smaSeries[4]!);
    });

    it('returns all nulls when there is not enough history', () => {
        expect(ema([1, 2], 3)).toEqual([null, null]);
    });
});
