import { describe, expect, it } from 'vitest';
import { macd } from '@/lib/technical/macd';
import { ema } from '@/lib/technical/ema';

describe('macd', () => {
    const closes = [10, 11, 12, 13, 12, 11, 13, 15, 16, 15, 17, 18, 19, 18, 20, 21, 22, 21, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34];

    it('macd line equals fastEma - slowEma at every valid index', () => {
        const result = macd(closes, 12, 26, 9);
        const fast = ema(closes, 12);
        const slow = ema(closes, 26);

        for (let i = 0; i < closes.length; i++) {
            if (fast[i] === null || slow[i] === null) {
                expect(result.macd[i]).toBeNull();
            } else {
                expect(result.macd[i]).toBeCloseTo(fast[i]! - slow[i]!, 10);
            }
        }
    });

    it('histogram equals macd - signal at every valid index', () => {
        const result = macd(closes, 12, 26, 9);
        for (let i = 0; i < closes.length; i++) {
            if (result.macd[i] === null || result.signal[i] === null) {
                expect(result.histogram[i]).toBeNull();
            } else {
                expect(result.histogram[i]).toBeCloseTo(result.macd[i]! - result.signal[i]!, 10);
            }
        }
    });

    it('is entirely null before the slow EMA warms up', () => {
        const result = macd(closes, 3, 5, 2);
        expect(result.macd.slice(0, 4)).toEqual([null, null, null, null]);
    });

    it('handles insufficient history gracefully (no throw, all null)', () => {
        const result = macd([1, 2, 3], 12, 26, 9);
        expect(result.macd.every((v) => v === null)).toBe(true);
        expect(result.signal.every((v) => v === null)).toBe(true);
        expect(result.histogram.every((v) => v === null)).toBe(true);
    });
});
