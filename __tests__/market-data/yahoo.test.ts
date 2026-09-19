import { afterEach, describe, expect, it, vi } from 'vitest';
import { toBars, yahooProvider } from '@/lib/market-data/providers/yahoo';

function chartResponse(overrides: Record<string, unknown> = {}) {
    return {
        chart: {
            result: [
                {
                    meta: {
                        currency: 'USD',
                        symbol: 'AAPL',
                        exchangeName: 'NMS',
                        exchangeTimezoneName: 'America/New_York',
                        regularMarketPrice: 110,
                        previousClose: 100,
                        ...((overrides.meta as object) ?? {}),
                    },
                    timestamp: (overrides.timestamp as number[]) ?? [
                        Date.UTC(2024, 0, 2, 21, 0, 0) / 1000,
                        Date.UTC(2024, 0, 3, 21, 0, 0) / 1000,
                    ],
                    indicators: (overrides.indicators as object) ?? {
                        quote: [{ open: [100, 105], high: [106, 111], low: [99, 104], close: [104, 108], volume: [1_000_000, 1_200_000] }],
                        adjclose: [{ adjclose: [103.5, 107.5] }],
                    },
                },
            ],
            error: null,
        },
    };
}

function mockFetchOnce(status: number, body: unknown) {
    vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({
            ok: status >= 200 && status < 300,
            status,
            json: async () => body,
            text: async () => JSON.stringify(body),
        })),
    );
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('toBars', () => {
    it('normalizes a well-formed chart result into sorted bars with adjustedClose carried alongside', () => {
        const result = chartResponse().chart.result[0];
        expect(toBars(result)).toEqual([
            { time: '2024-01-02', open: 100, high: 106, low: 99, close: 104, volume: 1_000_000, adjustedClose: 103.5 },
            { time: '2024-01-03', open: 105, high: 111, low: 104, close: 108, volume: 1_200_000, adjustedClose: 107.5 },
        ]);
    });

    it('skips an index where any OHLC field is null (a still-forming or missing session)', () => {
        const result = chartResponse({
            indicators: { quote: [{ open: [100, null], high: [106, null], low: [99, null], close: [104, null], volume: [1000, null] }] },
        }).chart.result[0];
        expect(toBars(result)).toHaveLength(1);
    });

    it('rejects a bar where high < low', () => {
        const result = chartResponse({
            indicators: { quote: [{ open: [100], high: [90], low: [99], close: [95], volume: [1000] }] },
            timestamp: [Date.UTC(2024, 0, 2, 21, 0, 0) / 1000],
        }).chart.result[0];
        expect(toBars(result)).toEqual([]);
    });

    it('defaults a missing/negative volume to 0 rather than rejecting the bar', () => {
        const result = chartResponse({
            indicators: { quote: [{ open: [100], high: [106], low: [99], close: [104], volume: [-5] }] },
            timestamp: [Date.UTC(2024, 0, 2, 21, 0, 0) / 1000],
        }).chart.result[0];
        expect(toBars(result)[0].volume).toBe(0);
    });

    it('sorts out-of-order timestamps and drops duplicates', () => {
        const result = chartResponse({
            timestamp: [Date.UTC(2024, 0, 3, 21, 0, 0) / 1000, Date.UTC(2024, 0, 2, 21, 0, 0) / 1000, Date.UTC(2024, 0, 2, 21, 0, 0) / 1000],
            indicators: {
                quote: [{ open: [105, 100, 100], high: [111, 106, 106], low: [104, 99, 99], close: [108, 104, 104], volume: [1, 2, 2] }],
            },
        }).chart.result[0];
        expect(toBars(result).map((b) => b.time)).toEqual(['2024-01-02', '2024-01-03']);
    });

    it('derives the market date from the exchange timezone, not naive UTC', () => {
        // 23:30 UTC on Jan 3 is already Jan 4 in Istanbul (UTC+3).
        const result = chartResponse({
            meta: { exchangeTimezoneName: 'Europe/Istanbul' },
            timestamp: [Date.UTC(2024, 0, 3, 23, 30, 0) / 1000],
            indicators: { quote: [{ open: [100], high: [106], low: [99], close: [104], volume: [1000] }] },
        }).chart.result[0];
        expect(toBars(result)[0].time).toBe('2024-01-04');
    });

    it('returns an empty array when there is no quote block at all', () => {
        expect(toBars({})).toEqual([]);
    });
});

describe('yahooProvider.getHistoricalPrices', () => {
    it('returns normalized bars on success', async () => {
        mockFetchOnce(200, chartResponse());
        const result = await yahooProvider.getHistoricalPrices('AAPL', 'D');
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.data).toHaveLength(2);
    });

    it('appends .IS to the request URL for a known BIST symbol, never for a US symbol', async () => {
        const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => chartResponse(), text: async () => '' }));
        vi.stubGlobal('fetch', fetchMock);

        await yahooProvider.getHistoricalPrices('THYAO', 'D');
        const bistUrl = String(fetchMock.mock.calls[0]?.[0] ?? '');
        expect(bistUrl).toContain('THYAO.IS');
        expect(bistUrl).toContain('interval=1d');
        expect(bistUrl).toContain('period1=');
        expect(bistUrl).toContain('period2=');
        expect(bistUrl).not.toContain('range=max');

        fetchMock.mockClear();
        await yahooProvider.getHistoricalPrices('AAPL', 'D');
        const usUrl = String(fetchMock.mock.calls[0]?.[0] ?? '');
        expect(usUrl).toContain('/AAPL?');
        expect(usUrl).toContain('interval=1d');
        expect(usUrl).toContain('period1=');
        expect(usUrl).toContain('period2=');
    });

    it('maps HTTP 404 to a not_found error', async () => {
        mockFetchOnce(404, {});
        const result = await yahooProvider.getHistoricalPrices('ZZZZ', 'D');
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.kind).toBe('not_found');
    });

    it('maps HTTP 429 to a rate_limit error', async () => {
        mockFetchOnce(429, {});
        const result = await yahooProvider.getHistoricalPrices('AAPL', 'D');
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.kind).toBe('rate_limit');
    });

    it('maps a network failure to a network error, never a thrown exception', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => {
                throw new Error('boom');
            }),
        );
        const result = await yahooProvider.getHistoricalPrices('AAPL', 'D');
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.kind).toBe('network');
    });

    it('rejects a non-daily timeframe without making a network call', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        const result = await yahooProvider.getHistoricalPrices('AAPL', 'W');
        expect(result.ok).toBe(false);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('reports an empty result set as not_found rather than an empty ok array', async () => {
        mockFetchOnce(200, { chart: { result: [{ meta: {}, timestamp: [], indicators: { quote: [{}] } }], error: null } });
        const result = await yahooProvider.getHistoricalPrices('AAPL', 'D');
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.kind).toBe('not_found');
    });
});

describe('yahooProvider.getQuote', () => {
    it('derives price/change/changePercent from meta, with asOf reflecting the last bar\'s market date', async () => {
        mockFetchOnce(200, chartResponse());
        const result = await yahooProvider.getQuote('AAPL');
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.data.price).toBe(110);
            expect(result.data.change).toBe(10);
            expect(result.data.changePercent).toBeCloseTo(10);
            expect(result.data.asOf.startsWith('2024-01-03')).toBe(true);
        }
    });

    it('falls back to the last bar\'s close when meta.regularMarketPrice is absent', async () => {
        mockFetchOnce(200, chartResponse({ meta: { regularMarketPrice: undefined } }));
        const result = await yahooProvider.getQuote('AAPL');
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.data.price).toBe(108); // last bar's close
    });
});

describe('yahooProvider.getCompanyProfile', () => {
    it('uses the known BIST company name when available', async () => {
        mockFetchOnce(200, chartResponse());
        const result = await yahooProvider.getCompanyProfile('THYAO');
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.data.name).toBe('Türk Hava Yolları');
    });

    it('falls back to the symbol itself rather than a fabricated name', async () => {
        mockFetchOnce(200, chartResponse());
        const result = await yahooProvider.getCompanyProfile('AAPL');
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.data.name).toBe('AAPL');
    });
});

describe('yahooProvider unimplemented methods never throw and never fabricate data', () => {
    it('getFinancials/getNews/searchSymbols all report unavailable', async () => {
        expect((await yahooProvider.getFinancials('AAPL')).ok).toBe(false);
        expect((await yahooProvider.getNews('AAPL')).ok).toBe(false);
        expect((await yahooProvider.searchSymbols('AAPL')).ok).toBe(false);
    });
});
