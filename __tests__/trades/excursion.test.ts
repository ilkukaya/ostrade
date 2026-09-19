import { describe, expect, it } from 'vitest';
import { calculateExcursion } from '@/lib/trades/excursion';
import type { OhlcBar } from '@/lib/technical/types';

function bar(time: string, high: number, low: number): OhlcBar {
    return { time, open: (high + low) / 2, high, low, close: (high + low) / 2, volume: 1_000_000 };
}

describe('calculateExcursion', () => {
    it('returns zero excursion with no bars', () => {
        expect(calculateExcursion({ direction: 'LONG', entryPrice: 100, bars: [] })).toEqual({
            maxFavorableExcursion: 0,
            maxAdverseExcursion: 0,
        });
    });

    it('tracks MFE/MAE for a long position across several bars', () => {
        const bars = [
            bar('2026-01-02', 105, 98), // favorable 5, adverse 2
            bar('2026-01-03', 110, 101), // favorable 10, adverse -1 (not adverse)
            bar('2026-01-04', 108, 95), // favorable 8, adverse 5 -> new MAE
        ];
        const result = calculateExcursion({ direction: 'LONG', entryPrice: 100, bars });
        expect(result.maxFavorableExcursion).toBe(10);
        expect(result.mfeAt).toBe('2026-01-03');
        expect(result.maxAdverseExcursion).toBe(5);
        expect(result.maeAt).toBe('2026-01-04');
    });

    it('tracks MFE/MAE for a short position (inverted: favorable is downside, adverse is upside)', () => {
        const bars = [
            bar('2026-01-02', 103, 96), // favorable (entry-low)=4, adverse (high-entry)=3
            bar('2026-01-03', 108, 90), // favorable 10, adverse 8
        ];
        const result = calculateExcursion({ direction: 'SHORT', entryPrice: 100, bars });
        expect(result.maxFavorableExcursion).toBe(10);
        expect(result.mfeAt).toBe('2026-01-03');
        expect(result.maxAdverseExcursion).toBe(8);
        expect(result.maeAt).toBe('2026-01-03');
    });

    it('clamps at zero rather than going negative when price never moves favorably/adversely', () => {
        // Long position that only ever goes up (never below entry, so MAE stays 0).
        const bars = [bar('2026-01-02', 105, 101), bar('2026-01-03', 110, 103)];
        const result = calculateExcursion({ direction: 'LONG', entryPrice: 100, bars });
        expect(result.maxAdverseExcursion).toBe(0);
        expect(result.maeAt).toBeUndefined();
    });

    it('includes the entry-date bar itself in the calculation', () => {
        const bars = [bar('2026-01-02', 112, 98)]; // the entry day's own range
        const result = calculateExcursion({ direction: 'LONG', entryPrice: 100, bars });
        expect(result.maxFavorableExcursion).toBe(12);
        expect(result.maxAdverseExcursion).toBe(2);
    });
});
