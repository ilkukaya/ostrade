import { describe, expect, it } from 'vitest';
import { computeTradeFinancials } from '@/lib/trades/pnl';

describe('computeTradeFinancials', () => {
    it('computes a winning long trade with fees and an R-multiple', () => {
        const result = computeTradeFinancials({
            direction: 'LONG',
            entryPrice: 100,
            exitPrice: 110,
            positionSize: 50,
            fees: 20,
            stopLevel: 95,
        });
        // gross = (110-100)*50 = 500; net = 500-20 = 480
        // riskPerShare = 5; priceMove = 10 -> rMultiple = 2
        expect(result).toEqual({ grossPnl: 500, netPnl: 480, rMultiple: 2, status: 'WIN' });
    });

    it('computes a losing short trade', () => {
        const result = computeTradeFinancials({
            direction: 'SHORT',
            entryPrice: 100,
            exitPrice: 108,
            positionSize: 20,
            stopLevel: 105,
        });
        // gross = (100-108)*20 = -160; riskPerShare = 5; priceMove = 100-108 = -8 -> rMultiple = -1.6
        expect(result.grossPnl).toBe(-160);
        expect(result.netPnl).toBe(-160);
        expect(result.rMultiple).toBeCloseTo(-1.6);
        expect(result.status).toBe('LOSS');
    });

    it('classifies exactly zero net P/L as BREAKEVEN', () => {
        const result = computeTradeFinancials({ direction: 'LONG', entryPrice: 100, exitPrice: 102, positionSize: 10, fees: 20 });
        // gross = 20, net = 20 - 20 = 0
        expect(result.netPnl).toBe(0);
        expect(result.status).toBe('BREAKEVEN');
    });

    it('classifies a loss caused entirely by fees on an otherwise-flat trade', () => {
        const result = computeTradeFinancials({ direction: 'LONG', entryPrice: 100, exitPrice: 100, positionSize: 10, fees: 5 });
        expect(result.grossPnl).toBe(0);
        expect(result.netPnl).toBe(-5);
        expect(result.status).toBe('LOSS');
    });

    it('omits rMultiple when no stop was recorded', () => {
        const result = computeTradeFinancials({ direction: 'LONG', entryPrice: 100, exitPrice: 110, positionSize: 10 });
        expect(result.rMultiple).toBeUndefined();
    });

    it('omits rMultiple when the stop equals the entry (undefined risk)', () => {
        const result = computeTradeFinancials({ direction: 'LONG', entryPrice: 100, exitPrice: 110, positionSize: 10, stopLevel: 100 });
        expect(result.rMultiple).toBeUndefined();
    });

    it('defaults fees to zero when omitted', () => {
        const result = computeTradeFinancials({ direction: 'LONG', entryPrice: 100, exitPrice: 105, positionSize: 10 });
        expect(result.netPnl).toBe(result.grossPnl);
    });
});
