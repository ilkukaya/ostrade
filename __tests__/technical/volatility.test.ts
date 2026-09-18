import { describe, expect, it } from 'vitest';
import { rollingVolatility } from '@/lib/technical/volatility';

describe('rollingVolatility', () => {
    it('is zero for a perfectly flat series', () => {
        const result = rollingVolatility([100, 100, 100, 100, 100], 2);
        expect(result[2]).toBe(0);
        expect(result[3]).toBe(0);
    });

    it('matches a hand-computed symmetric case', () => {
        // returns: +0.5, -0.5 (100->150 then 150->75) => mean 0, variance 0.25, stdDev 0.5
        const result = rollingVolatility([100, 150, 75], 2);
        expect(result[2]).toBeCloseTo(0.5, 10);
    });

    it('is null during warm-up or when a return in the window is undefined', () => {
        expect(rollingVolatility([100], 2)).toEqual([null]);
    });
});
