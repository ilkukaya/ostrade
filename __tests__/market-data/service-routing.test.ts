import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CompanyProfile, MarketDataResult, HistoricalBar, Quote } from '@/lib/market-data/types';

const stooqGetHistoricalPrices = vi.fn<(symbol: string, timeframe: string) => Promise<MarketDataResult<HistoricalBar[]>>>();
const yahooGetHistoricalPrices = vi.fn<(symbol: string, timeframe: string) => Promise<MarketDataResult<HistoricalBar[]>>>();
const yahooGetQuote = vi.fn<(symbol: string) => Promise<MarketDataResult<Quote>>>();
const yahooGetCompanyProfile = vi.fn<(symbol: string) => Promise<MarketDataResult<CompanyProfile>>>();
const finnhubGetQuote = vi.fn<(symbol: string) => Promise<MarketDataResult<Quote>>>();
const finnhubGetCompanyProfile = vi.fn<(symbol: string) => Promise<MarketDataResult<CompanyProfile>>>();

vi.mock('@/lib/market-data/providers/stooq', () => ({
    stooqProvider: { id: 'stooq', getHistoricalPrices: (...args: [string, string]) => stooqGetHistoricalPrices(...args) },
}));
vi.mock('@/lib/market-data/providers/yahoo', () => ({
    yahooProvider: {
        id: 'yahoo',
        getHistoricalPrices: (...args: [string, string]) => yahooGetHistoricalPrices(...args),
        getQuote: (...args: [string]) => yahooGetQuote(...args),
        getCompanyProfile: (...args: [string]) => yahooGetCompanyProfile(...args),
    },
}));
vi.mock('@/lib/market-data/providers/finnhub', () => ({
    finnhubProvider: {
        id: 'finnhub',
        getQuote: (...args: [string]) => finnhubGetQuote(...args),
        getHistoricalPrices: vi.fn(),
        getCompanyProfile: (...args: [string]) => finnhubGetCompanyProfile(...args),
        getFinancials: vi.fn(),
        getNews: vi.fn(),
        searchSymbols: vi.fn(),
    },
}));

import { getCompanyProfile, getHistoricalPrices, getHistoricalPricesWithProvider, getQuote } from '@/lib/market-data/service';

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

describe('service.getHistoricalPricesWithProvider', () => {
    beforeEach(() => {
        stooqGetHistoricalPrices.mockReset();
        yahooGetHistoricalPrices.mockReset();
    });

    it('attributes a successful result to the provider that actually produced it', async () => {
        stooqGetHistoricalPrices.mockResolvedValue({ ok: false, error: { kind: 'not_found', message: 'x' } as never });
        yahooGetHistoricalPrices.mockResolvedValue({ ok: true, data: bars });

        const { result, providerId } = await getHistoricalPricesWithProvider('AAPL', 'D');
        expect(result.ok).toBe(true);
        expect(providerId).toBe('yahoo');
    });

    it('attributes a total failure to the last provider tried', async () => {
        stooqGetHistoricalPrices.mockResolvedValue({ ok: false, error: { kind: 'not_found', message: 'x' } as never });
        yahooGetHistoricalPrices.mockResolvedValue({ ok: false, error: { kind: 'rate_limit', message: 'y' } as never });

        const { providerId } = await getHistoricalPricesWithProvider('AAPL', 'D');
        expect(providerId).toBe('yahoo');
    });
});

describe('service.getProviderForSymbol (quote / company profile routing)', () => {
    beforeEach(() => {
        yahooGetQuote.mockReset();
        yahooGetCompanyProfile.mockReset();
        finnhubGetQuote.mockReset();
        finnhubGetCompanyProfile.mockReset();
    });

    it('routes a US symbol to Finnhub for quote and company profile', async () => {
        finnhubGetQuote.mockResolvedValue({
            ok: true,
            data: { symbol: 'AAPL', price: 1, change: 0, changePercent: 0, currency: 'USD', asOf: '2024-01-05T00:00:00.000Z' },
        });
        finnhubGetCompanyProfile.mockResolvedValue({ ok: true, data: { symbol: 'AAPL', name: 'Apple Inc.', currency: 'USD' } });

        await getQuote('AAPL');
        await getCompanyProfile('AAPL');

        expect(finnhubGetQuote).toHaveBeenCalledWith('AAPL');
        expect(finnhubGetCompanyProfile).toHaveBeenCalledWith('AAPL');
        expect(yahooGetQuote).not.toHaveBeenCalled();
        expect(yahooGetCompanyProfile).not.toHaveBeenCalled();
    });

    it('routes a known BIST symbol to Yahoo for quote and company profile — never Finnhub, which has no BIST coverage', async () => {
        yahooGetQuote.mockResolvedValue({
            ok: true,
            data: { symbol: 'THYAO', price: 1, change: 0, changePercent: 0, currency: 'TRY', asOf: '2024-01-05T00:00:00.000Z' },
        });
        yahooGetCompanyProfile.mockResolvedValue({ ok: true, data: { symbol: 'THYAO', name: 'Türk Hava Yolları', currency: 'TRY' } });

        await getQuote('THYAO');
        await getCompanyProfile('THYAO');

        expect(yahooGetQuote).toHaveBeenCalledWith('THYAO');
        expect(yahooGetCompanyProfile).toHaveBeenCalledWith('THYAO');
        expect(finnhubGetQuote).not.toHaveBeenCalled();
        expect(finnhubGetCompanyProfile).not.toHaveBeenCalled();
    });
});
