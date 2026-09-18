import { describe, expect, it } from 'vitest';
import { bollingerBands } from '@/lib/technical/bollinger';

describe('bollingerBands', () => {
    it('collapses upper/middle/lower to the same value on a constant series (zero variance)', () => {
        const result = bollingerBands([5, 5, 5, 5, 5], 3, 2);
        expect(result.upper[2]).toBe(5);
        expect(result.middle[2]).toBe(5);
        expect(result.lower[2]).toBe(5);
        expect(result.bandwidth[2]).toBe(0);
    });

    it('matches a hand-computed variance case', () => {
        // mean=2, variance=((1-2)^2+(2-2)^2+(3-2)^2)/3 = 2/3, stdDev=sqrt(2/3)
        const result = bollingerBands([1, 2, 3], 3, 2);
        const stdDev = Math.sqrt(2 / 3);
        expect(result.middle[2]).toBe(2);
        expect(result.upper[2]).toBeCloseTo(2 + 2 * stdDev, 10);
        expect(result.lower[2]).toBeCloseTo(2 - 2 * stdDev, 10);
    });

    it('is null during warm-up', () => {
        const result = bollingerBands([1, 2], 3, 2);
        expect(result.upper).toEqual([null, null]);
        expect(result.middle).toEqual([null, null]);
        expect(result.lower).toEqual([null, null]);
    });
});
