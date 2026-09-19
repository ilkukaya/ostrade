import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MarketDataResult, HistoricalBar } from '@/lib/market-data/types';

const stooqGetHistoricalPrices = vi.fn<(symbol: string, timeframe: string) => Promise<MarketDataResult<HistoricalBar[]>>>();
const yahooGetHistoricalPrices = vi.fn<(symbol: string, timeframe: string) => Promise<MarketDataResult<HistoricalBar[]>>>();

vi.mock('@/lib/market-data/providers/stooq', () => ({
    stooqProvider: { id: 'stooq', getHistoricalPrices: (...args: [string, string]) => stooqGetHistoricalPrices(...args) },
}));
vi.mock('@/lib/market-data/providers/yahoo', () => ({
    yahooProvider: { id: 'yahoo', getHistoricalPrices: (...args: [string, string]) => yahooGetHistoricalPrices(...args) },
}));
// Finnhub is untouched by this routing but service.ts still imports it —
// keep its module inert for these tests.
vi.mock('@/lib/market-data/providers/finnhub', () => ({
    finnhubProvider: { id: 'finnhub', getQuote: vi.fn(), getHistoricalPrices: vi.fn(), getCompanyProfile: vi.fn(), getFinancials: vi.fn(), getNews: vi.fn(), searchSymbols: vi.fn() },
}));

import { getHistoricalPrices } from '@/lib/market-data/service';

const bars: HistoricalBar[] = [{ time: '2024-01-02', open: 1, high: 2, low: 0.5, close: 1.5, volume: 100 }];

describe('service.getHistoricalPrices routing chain', () => {
    beforeEach(() => {
        stooqGetHistoricalPrices.mockReset();
        yahooGetHistoricalPrices.mockReset();
    });

    it('tries Stooq first for a US symbol and returns its result on success', async () => {
        stooqGetHistoricalPrices.mockResolvedValue({ ok: true, data: bars });
        const result = await getHistoricalPrices('AAPL', 'D');
        expect(result).toEqual({ ok: true, data: bars });
        expect(stooqGetHistoricalPrices).toHaveBeenCalledWith('AAPL', 'D');
        expect(yahooGetHistoricalPrices).not.toHaveBeenCalled();
    });

    it('falls back to Yahoo for a US symbol when Stooq fails', async () => {
        stooqGetHistoricalPrices.mockResolvedValue({ ok: false, error: { kind: 'not_found', message: 'x' } as never });
        yahooGetHistoricalPrices.mockResolvedValue({ ok: true, data: bars });

        const result = await getHistoricalPrices('AAPL', 'D');
        expect(result.ok).toBe(true);
        expect(stooqGetHistoricalPrices).toHaveBeenCalled();
        expect(yahooGetHistoricalPrices).toHaveBeenCalledWith('AAPL', 'D');
    });

    it('never calls Stooq for a known BIST symbol — Yahoo only', async () => {
        yahooGetHistoricalPrices.mockResolvedValue({ ok: true, data: bars });
        const result = await getHistoricalPrices('THYAO', 'D');
        expect(result.ok).toBe(true);
        expect(stooqGetHistoricalPrices).not.toHaveBeenCalled();
        expect(yahooGetHistoricalPrices).toHaveBeenCalledWith('THYAO', 'D');
    });

    it('returns the last error in the chain (not the first) when every provider fails', async () => {
        const stooqError = { kind: 'not_found', message: 'stooq miss' } as never;
        const yahooError = { kind: 'rate_limit', message: 'yahoo throttled' } as never;
        stooqGetHistoricalPrices.mockResolvedValue({ ok: false, error: stooqError });
        yahooGetHistoricalPrices.mockResolvedValue({ ok: false, error: yahooError });

        const result = await getHistoricalPrices('AAPL', 'D');
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toBe(yahooError);
    });
});
