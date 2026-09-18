import { describe, expect, it } from 'vitest';
import { momentum, rateOfChange } from '@/lib/technical/momentum';

describe('momentum', () => {
    it('computes absolute price change over the period', () => {
        expect(momentum([10, 12, 15, 13], 2)).toEqual([null, null, 5, 1]);
    });

    it('computes percentage rate of change over the period', () => {
        const result = rateOfChange([10, 12, 15, 13], 2);
        expect(result[2]).toBeCloseTo(50, 10); // (15-10)/10*100
        expect(result[3]).toBeCloseTo(8.3333, 3); // (13-12)/12*100
    });

    it('is null during warm-up', () => {
        expect(momentum([1, 2], 5)).toEqual([null, null]);
    });
});
