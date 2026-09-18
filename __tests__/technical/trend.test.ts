import { describe, expect, it } from 'vitest';
import { classifyTrend } from '@/lib/technical/trend';

describe('classifyTrend', () => {
    it('is UNKNOWN without a 50-day average', () => {
        expect(classifyTrend({ price: 100, sma20: 100, sma50: null, sma200: null })).toBe('UNKNOWN');
    });

    it('is UP when price and the 50-day are both above the 200-day', () => {
        expect(classifyTrend({ price: 110, sma20: 108, sma50: 105, sma200: 100 })).toBe('UP');
    });

    it('is DOWN when price and the 50-day are both below the 200-day', () => {
        expect(classifyTrend({ price: 90, sma20: 92, sma50: 95, sma200: 100 })).toBe('DOWN');
    });

    it('is SIDEWAYS when the averages are not cleanly aligned', () => {
        expect(classifyTrend({ price: 110, sma20: 108, sma50: 95, sma200: 100 })).toBe('SIDEWAYS');
    });

    it('falls back to price-vs-50-day when there is no 200-day history yet', () => {
        expect(classifyTrend({ price: 110, sma20: 108, sma50: 105, sma200: null })).toBe('UP');
        expect(classifyTrend({ price: 100, sma20: 108, sma50: 105, sma200: null })).toBe('DOWN');
        expect(classifyTrend({ price: 105, sma20: 105, sma50: 105, sma200: null })).toBe('SIDEWAYS');
    });
});
