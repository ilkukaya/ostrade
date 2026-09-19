import { describe, expect, it } from 'vitest';
import { calculatePositionSize } from '@/lib/risk/positionSizing';

describe('calculatePositionSize', () => {
    it('computes the textbook case: $100k equity, 1% risk, $2 risk/share', () => {
        const result = calculatePositionSize({ accountEquity: 100_000, riskPercent: 1, entryPrice: 50, stopPrice: 48 });
        expect(result).toEqual({
            valid: true,
            riskBudget: 1_000,
            riskPerShare: 2,
            maxShares: 500,
            positionValue: 25_000,
            portfolioExposure: 0.25,
        });
    });

    it('works identically for a short (stop above entry) — only the absolute distance matters', () => {
        const result = calculatePositionSize({ accountEquity: 100_000, riskPercent: 1, entryPrice: 48, stopPrice: 50 });
        expect(result).toEqual({
            valid: true,
            riskBudget: 1_000,
            riskPerShare: 2,
            maxShares: 500,
            positionValue: 24_000,
            portfolioExposure: 0.24,
        });
    });

    it('always rounds down, never up, so risk is never exceeded', () => {
        // riskBudget = 1000, riskPerShare = 3 -> 333.33 shares, must floor to 333.
        const result = calculatePositionSize({ accountEquity: 100_000, riskPercent: 1, entryPrice: 50, stopPrice: 47 });
        expect(result.valid).toBe(true);
        if (result.valid) {
            expect(result.maxShares).toBe(333);
        }
    });

    it('reports maxShares: 0 as a valid result, not an error, when the stop is too wide for the risk budget', () => {
        const result = calculatePositionSize({ accountEquity: 1_000, riskPercent: 1, entryPrice: 50, stopPrice: 10 });
        expect(result.valid).toBe(true);
        if (result.valid) {
            expect(result.maxShares).toBe(0);
            expect(result.positionValue).toBe(0);
            expect(result.portfolioExposure).toBe(0);
        }
    });

    it('rejects non-positive account equity', () => {
        expect(calculatePositionSize({ accountEquity: 0, riskPercent: 1, entryPrice: 50, stopPrice: 48 })).toEqual({
            valid: false,
            reason: expect.stringContaining('equity'),
        });
        expect(calculatePositionSize({ accountEquity: -5_000, riskPercent: 1, entryPrice: 50, stopPrice: 48 }).valid).toBe(false);
    });

    it('rejects non-positive risk percent', () => {
        const result = calculatePositionSize({ accountEquity: 100_000, riskPercent: 0, entryPrice: 50, stopPrice: 48 });
        expect(result).toEqual({ valid: false, reason: expect.stringContaining('Risk per trade') });
    });

    it('rejects a non-positive entry price', () => {
        const result = calculatePositionSize({ accountEquity: 100_000, riskPercent: 1, entryPrice: 0, stopPrice: 48 });
        expect(result.valid).toBe(false);
    });

    it('rejects a negative stop price', () => {
        const result = calculatePositionSize({ accountEquity: 100_000, riskPercent: 1, entryPrice: 50, stopPrice: -1 });
        expect(result.valid).toBe(false);
    });

    it('rejects a stop equal to the entry price (would divide by zero)', () => {
        const result = calculatePositionSize({ accountEquity: 100_000, riskPercent: 1, entryPrice: 50, stopPrice: 50 });
        expect(result).toEqual({ valid: false, reason: expect.stringContaining('risk per share would be zero') });
    });
});
