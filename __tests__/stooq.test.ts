import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseStooqDailyCsv, stooqProvider } from '@/lib/market-data/providers/stooq';
import { MarketDataError } from '@/lib/market-data/types';

describe('parseStooqDailyCsv', () => {
    it('parses a well-formed daily CSV into bars', () => {
        const csv = [
            'Date,Open,High,Low,Close,Volume',
            '2024-01-02,100,105,99,104,1000000',
            '2024-01-03,104,110,103,108,1200000',
        ].join('\n');

        expect(parseStooqDailyCsv(csv)).toEqual([
            { time: '2024-01-02', open: 100, high: 105, low: 99, close: 104, volume: 1000000 },
            { time: '2024-01-03', open: 104, high: 110, low: 103, close: 108, volume: 1200000 },
        ]);
    });

    it('returns an empty array for an empty or whitespace-only response', () => {
        expect(parseStooqDailyCsv('')).toEqual([]);
        expect(parseStooqDailyCsv('   \n  ')).toEqual([]);
    });

    it('throws a MarketDataError when the header is not the expected shape', () => {
        expect(() => parseStooqDailyCsv('oops,not,a,header\n1,2,3,4')).toThrow(MarketDataError);
    });

    it('skips rows with non-numeric fields instead of feeding NaN into bars', () => {
        const csv = [
            'Date,Open,High,Low,Close,Volume',
            '2024-01-02,100,105,99,104,1000000',
            '2024-01-03,N/D,N/D,N/D,N/D,N/D',
        ].join('\n');

        expect(parseStooqDailyCsv(csv)).toEqual([
            { time: '2024-01-02', open: 100, high: 105, low: 99, close: 104, volume: 1000000 },
        ]);
    });

    it('skips rows where high < low (corrupt data)', () => {
        const csv = [
            'Date,Open,High,Low,Close,Volume',
            '2024-01-02,100,90,99,95,1000000', // high (90) < low (99)
        ].join('\n');

        expect(parseStooqDailyCsv(csv)).toEqual([]);
    });

    it('skips rows where close is outside the high/low range', () => {
        const csv = [
            'Date,Open,High,Low,Close,Volume',
            '2024-01-02,100,105,99,120,1000000', // close (120) > high (105)
        ].join('\n');

        expect(parseStooqDailyCsv(csv)).toEqual([]);
    });

    it('sorts bars chronologically and drops duplicate timestamps', () => {
        const csv = [
            'Date,Open,High,Low,Close,Volume',
            '2024-01-03,104,110,103,108,1200000',
            '2024-01-02,100,105,99,104,1000000',
            '2024-01-02,100,105,99,104,1000000',
        ].join('\n');

        expect(parseStooqDailyCsv(csv).map((b) => b.time)).toEqual(['2024-01-02', '2024-01-03']);
    });

    it('defaults volume to 0 when the column is absent', () => {
        const csv = ['Date,Open,High,Low,Close', '2024-01-02,100,105,99,104'].join('\n');

        expect(parseStooqDailyCsv(csv)).toEqual([
            { time: '2024-01-02', open: 100, high: 105, low: 99, close: 104, volume: 0 },
        ]);
    });
});

function mockCsvResponse(csv: string) {
    vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({ ok: true, status: 200, text: async () => csv })),
    );
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('stooqProvider', () => {
    const csv = ['Date,Open,High,Low,Close,Volume', '2024-01-02,100,105,99,104,1000000', '2024-01-03,104,110,103,108,1200000'].join('\n');

    it('getHistoricalPrices returns the parsed bars', async () => {
        mockCsvResponse(csv);
        const result = await stooqProvider.getHistoricalPrices('AAPL', 'D');
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.data).toHaveLength(2);
    });

    it('getHistoricalPrices rejects a non-daily timeframe without a network call', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        const result = await stooqProvider.getHistoricalPrices('AAPL', 'W');
        expect(result.ok).toBe(false);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('getQuote derives price/change/changePercent from the last two bars', async () => {
        mockCsvResponse(csv);
        const result = await stooqProvider.getQuote('AAPL');
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.data.price).toBe(108);
            expect(result.data.change).toBe(4);
            expect(result.data.changePercent).toBeCloseTo((4 / 104) * 100);
        }
    });

    it('getCompanyProfile/getFinancials/getNews/searchSymbols all report unavailable, never fabricated data', async () => {
        expect((await stooqProvider.getCompanyProfile('AAPL')).ok).toBe(false);
        expect((await stooqProvider.getFinancials('AAPL')).ok).toBe(false);
        expect((await stooqProvider.getNews('AAPL')).ok).toBe(false);
        expect((await stooqProvider.searchSymbols('AAPL')).ok).toBe(false);
    });
});
