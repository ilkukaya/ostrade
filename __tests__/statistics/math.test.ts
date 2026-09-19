import { describe, expect, it } from 'vitest';
import { mean, median, rate } from '@/lib/statistics/math';

describe('median', () => {
    it('returns null for an empty array', () => {
        expect(median([])).toBeNull();
    });
    it('returns the middle value for an odd-length array', () => {
        expect(median([3, 1, 2])).toBe(2);
    });
    it('averages the two middle values for an even-length array', () => {
        expect(median([1, 2, 3, 4])).toBe(2.5);
    });
    it('does not mutate the input array', () => {
        const input = [5, 1, 3];
        median(input);
        expect(input).toEqual([5, 1, 3]);
    });
});

describe('mean', () => {
    it('returns null for an empty array', () => {
        expect(mean([])).toBeNull();
    });
    it('averages values', () => {
        expect(mean([1, 2, 3])).toBe(2);
    });
});

describe('rate', () => {
    it('returns null when the total is zero, never a fabricated 0%', () => {
        expect(rate(0, 0)).toBeNull();
    });
    it('computes a fraction', () => {
        expect(rate(3, 12)).toBe(0.25);
    });
});
