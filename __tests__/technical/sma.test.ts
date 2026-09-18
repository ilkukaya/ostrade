import { describe, expect, it } from 'vitest';
import { sma, latestSma } from '@/lib/technical/sma';

describe('sma', () => {
    it('computes a simple moving average, null during warm-up', () => {
        expect(sma([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
    });

    it('returns all nulls when there is not enough history', () => {
        expect(sma([1, 2], 3)).toEqual([null, null]);
    });

    it('handles an empty series', () => {
        expect(sma([], 3)).toEqual([]);
    });

    it('throws for a non-positive period', () => {
        expect(() => sma([1, 2, 3], 0)).toThrow();
    });

    it('latestSma returns the final value, or null if undefined', () => {
        expect(latestSma([1, 2, 3, 4, 5], 3)).toBe(4);
        expect(latestSma([1, 2], 3)).toBeNull();
    });
});
