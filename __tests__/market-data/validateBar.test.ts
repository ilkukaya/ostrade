import { describe, expect, it } from 'vitest';
import { sanitizeBars, validateBar } from '@/lib/market-data/validateBar';
import type { HistoricalBar } from '@/lib/market-data/types';

function bar(overrides: Partial<HistoricalBar> = {}): HistoricalBar {
    return { time: '2024-01-02', open: 100, high: 105, low: 99, close: 104, volume: 1_000_000, ...overrides };
}

describe('validateBar', () => {
    it('accepts a well-formed bar', () => {
        expect(validateBar(bar())).toEqual({ valid: true });
    });

    it('rejects a malformed date', () => {
        expect(validateBar(bar({ time: '01/02/2024' })).valid).toBe(false);
        expect(validateBar(bar({ time: '' })).valid).toBe(false);
    });

    it('rejects NaN in any numeric field', () => {
        expect(validateBar(bar({ open: NaN })).valid).toBe(false);
        expect(validateBar(bar({ volume: NaN })).valid).toBe(false);
    });

    it('rejects Infinity in any numeric field', () => {
        expect(validateBar(bar({ high: Infinity })).valid).toBe(false);
        expect(validateBar(bar({ close: -Infinity })).valid).toBe(false);
    });

    it('rejects negative volume', () => {
        expect(validateBar(bar({ volume: -1 })).valid).toBe(false);
    });

    it('rejects high < low', () => {
        expect(validateBar(bar({ high: 90, low: 99 })).valid).toBe(false);
    });

    it('rejects open outside [low, high]', () => {
        expect(validateBar(bar({ open: 200 })).valid).toBe(false);
        expect(validateBar(bar({ open: 10 })).valid).toBe(false);
    });

    it('rejects close outside [low, high]', () => {
        expect(validateBar(bar({ close: 200 })).valid).toBe(false);
    });

    it('accepts a bar with no adjustedClose (optional field)', () => {
        expect(validateBar(bar({ adjustedClose: undefined })).valid).toBe(true);
    });

    it('rejects a non-finite adjustedClose when present', () => {
        expect(validateBar(bar({ adjustedClose: NaN })).valid).toBe(false);
    });
});

describe('sanitizeBars', () => {
    it('drops invalid bars while keeping valid ones', () => {
        const bars = [bar({ time: '2024-01-02' }), bar({ time: '2024-01-03', high: 90, low: 99 }), bar({ time: '2024-01-04' })];
        expect(sanitizeBars(bars).map((b) => b.time)).toEqual(['2024-01-02', '2024-01-04']);
    });

    it('sorts out-of-order bars chronologically', () => {
        const bars = [bar({ time: '2024-01-04' }), bar({ time: '2024-01-02' }), bar({ time: '2024-01-03' })];
        expect(sanitizeBars(bars).map((b) => b.time)).toEqual(['2024-01-02', '2024-01-03', '2024-01-04']);
    });

    it('collapses duplicate dates to the last occurrence in the input', () => {
        const bars = [bar({ time: '2024-01-02', close: 100 }), bar({ time: '2024-01-02', close: 105 })];
        const result = sanitizeBars(bars);
        expect(result).toHaveLength(1);
        expect(result[0].close).toBe(105);
    });

    it('returns an empty array for an empty input', () => {
        expect(sanitizeBars([])).toEqual([]);
    });
});
