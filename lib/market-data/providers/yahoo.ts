import {
    MarketDataError,
    type CompanyProfile,
    type FinancialData,
    type HistoricalBar,
    type MarketDataProvider,
    type MarketDataResult,
    type NewsItem,
    type Quote,
    type SearchResult,
    type Timeframe,
} from '@/lib/market-data/types';
import { resolveInstrument } from '@/lib/market-data/instruments/resolve';
import { getBistCompanyName } from '@/lib/market-data/instruments/bist';
import { epochSecondsToMarketDate } from '@/lib/market-data/marketCalendar';

/**
 * Yahoo Finance EOD provider — an UNOFFICIAL, undocumented interface (no
 * API key, no published contract, no uptime guarantee). Per docs/market-data.md's
 * "Important Yahoo rule": every Yahoo-specific detail (the chart endpoint
 * shape, the ".IS" BIST suffix, response quirks) is isolated to this one
 * file. Nothing outside lib/market-data/ should ever know this provider is
 * Yahoo, let alone construct a Yahoo URL itself.
 *
 * This is the PRIMARY historical-bar source for BIST (no viable free
 * alternative was identified — see docs/bist.md) and a FALLBACK for US
 * symbols behind Stooq (see providers/stooq.ts and service.ts's routing).
 */

const YAHOO_CHART_BASE_URL = 'https://query1.finance.yahoo.com/v8/finance/chart';

interface YahooChartMeta {
    currency?: string;
    symbol?: string;
    exchangeName?: string;
    regularMarketPrice?: number;
    previousClose?: number;
    chartPreviousClose?: number;
    exchangeTimezoneName?: string;
}

interface YahooChartQuote {
    open?: (number | null)[];
    high?: (number | null)[];
    low?: (number | null)[];
    close?: (number | null)[];
    volume?: (number | null)[];
}

interface YahooChartResult {
    meta?: YahooChartMeta;
    timestamp?: number[];
    indicators?: {
        quote?: YahooChartQuote[];
        adjclose?: Array<{ adjclose?: (number | null)[] }>;
    };
}

interface YahooChartResponse {
    chart: {
        result?: YahooChartResult[];
        error?: { code?: string; description?: string } | null;
    };
}

function ok<T>(data: T): MarketDataResult<T> {
    return { ok: true, data };
}

function fail<T>(error: unknown, fallbackMessage: string): MarketDataResult<T> {
    if (error instanceof MarketDataError) return { ok: false, error };
    return { ok: false, error: new MarketDataError('unavailable', fallbackMessage) };
}

/** Translates a business symbol to Yahoo's own notation (e.g. "THYAO" ->
 * "THYAO.IS") via the shared instrument registry — this is the only place
 * in this file that touches that translation. */
function toProviderSymbol(symbol: string): string {
    return resolveInstrument(symbol).providerSymbol ?? symbol.toUpperCase();
}

type YahooChartWindow = { range: string } | { period1: number; period2: number };

async function fetchYahooChart(providerSymbol: string, window: YahooChartWindow): Promise<YahooChartResult> {
    const query =
        'range' in window
            ? `range=${window.range}`
            : `period1=${window.period1}&period2=${window.period2}`;
    const url = `${YAHOO_CHART_BASE_URL}/${encodeURIComponent(providerSymbol)}?${query}&interval=1d&events=div%2Csplits`;

    let res: Response;
    try {
        res = await fetch(url, {
            cache: 'force-cache',
            next: { revalidate: 3600 },
            headers: {
                // An unauthenticated, unofficial endpoint has been observed
                // elsewhere to reject requests with no User-Agent at all;
                // this could not be verified against the live endpoint from
                // this environment (no outbound network access during
                // development) — see docs/market-data.md's Yahoo section.
                'User-Agent': 'Mozilla/5.0 (compatible; OstradeResearchTerminal/1.0; +https://github.com/)',
            },
        });
    } catch {
        throw new MarketDataError('network', `Could not reach Yahoo Finance for ${providerSymbol}`);
    }

    if (res.status === 429) {
        throw new MarketDataError('rate_limit', 'Yahoo Finance rate limit reached');
    }
    if (res.status === 404) {
        throw new MarketDataError('not_found', `Yahoo Finance: symbol not found (${providerSymbol})`);
    }
    if (!res.ok) {
        throw new MarketDataError('unavailable', `Yahoo Finance HTTP ${res.status} for ${providerSymbol}`);
    }

    let payload: YahooChartResponse;
    try {
        payload = (await res.json()) as YahooChartResponse;
    } catch {
        throw new MarketDataError('bad_response', 'Yahoo Finance returned a non-JSON response');
    }

    if (payload.chart?.error) {
        throw new MarketDataError('not_found', `Yahoo Finance: ${payload.chart.error.description || payload.chart.error.code || 'unknown error'}`);
    }
    const result = payload.chart?.result?.[0];
    if (!result) {
        throw new MarketDataError('bad_response', 'Yahoo Finance returned no chart result');
    }
    return result;
}

/**
 * Normalizes a raw Yahoo chart result into sorted, deduplicated,
 * gap-free-of-nulls `HistoricalBar[]` — exported standalone (no network) so
 * every edge case (null entries mid-array, out-of-order timestamps,
 * duplicate timestamps, an inverted high/low) can be unit-tested with
 * fixtures, the same convention as providers/stooq.ts::parseStooqDailyCsv.
 *
 * `close` is always the raw (split-adjusted, not dividend-adjusted, as
 * Yahoo's `quote.close` array is understood to behave) price technical
 * analysis and backtesting use; `adjustedClose` (further adjusted for
 * dividends) is carried for transparency only, never substituted into the
 * OHLC fields — see docs/market-data.md's adjusted-price policy.
 */
export function toBars(result: YahooChartResult): HistoricalBar[] {
    const timezone = result.meta?.exchangeTimezoneName || 'UTC';
    const timestamps = result.timestamp ?? [];
    const quote = result.indicators?.quote?.[0];
    const adjclose = result.indicators?.adjclose?.[0]?.adjclose;
    if (!quote) return [];

    const bars: HistoricalBar[] = [];
    for (let i = 0; i < timestamps.length; i++) {
        const open = quote.open?.[i];
        const high = quote.high?.[i];
        const low = quote.low?.[i];
        const close = quote.close?.[i];
        const volume = quote.volume?.[i];

        // Yahoo represents a still-forming or missing session as null in
        // these parallel arrays — skip rather than feed a fabricated 0 into
        // the indicator engine.
        if (open == null || high == null || low == null || close == null) continue;
        if (![open, high, low, close].every(Number.isFinite)) continue;
        if (high < low) continue;

        const adjustedCloseValue = adjclose?.[i];
        bars.push({
            time: epochSecondsToMarketDate(timestamps[i], timezone),
            open,
            high,
            low,
            close,
            volume: volume != null && Number.isFinite(volume) && volume >= 0 ? volume : 0,
            adjustedClose: adjustedCloseValue != null && Number.isFinite(adjustedCloseValue) ? adjustedCloseValue : undefined,
        });
    }

    bars.sort((a, b) => a.time.localeCompare(b.time));
    const deduped: HistoricalBar[] = [];
    for (const bar of bars) {
        if (deduped.length > 0 && deduped[deduped.length - 1].time === bar.time) continue;
        deduped.push(bar);
    }
    return deduped;
}

async function getHistoricalPrices(symbol: string, timeframe: Timeframe): Promise<MarketDataResult<HistoricalBar[]>> {
    if (timeframe !== 'D') {
        return fail(
            new MarketDataError('unavailable', 'The Yahoo EOD provider only supports daily bars'),
            'unavailable',
        );
    }
    try {
        // "max" — the sync engine (not this provider) decides how much of
        // it a given caller actually needs; see lib/market-data/historicalDataRepository.ts
        // and docs/market-data.md's "Scanner input window" note.
        // Yahoo may silently coarsen range=max despite interval=1d. Use an
        // explicit period window so the response remains true daily bars.
        // Three years is enough for the app's 2-year backtest plus indicator
        // warm-up while keeping the free MongoDB Atlas footprint bounded.
        const now = new Date();
        const start = new Date(now);
        start.setUTCFullYear(start.getUTCFullYear() - 3);
        const result = await fetchYahooChart(toProviderSymbol(symbol), {
            period1: Math.floor(start.getTime() / 1000),
            period2: Math.floor(now.getTime() / 1000) + 86400,
        });
        const bars = toBars(result);
        if (bars.length === 0) {
            return fail(new MarketDataError('not_found', `No historical data available for ${symbol}`), 'not found');
        }
        return ok(bars);
    } catch (error) {
        return fail(error, `Failed to fetch historical prices for ${symbol}`);
    }
}

async function getQuote(symbol: string): Promise<MarketDataResult<Quote>> {
    try {
        const result = await fetchYahooChart(toProviderSymbol(symbol), { range: '5d' });
        const meta = result.meta ?? {};
        const bars = toBars(result);
        const lastBar = bars[bars.length - 1];
        const price = meta.regularMarketPrice ?? lastBar?.close;

        if (price === undefined) {
            return fail(new MarketDataError('not_found', `No quote available for ${symbol}`), 'not found');
        }

        const previousClose = meta.previousClose ?? meta.chartPreviousClose ?? (bars.length > 1 ? bars[bars.length - 2].close : undefined);
        const change = previousClose !== undefined ? price - previousClose : 0;
        const changePercent = previousClose ? (change / previousClose) * 100 : 0;

        return ok({
            symbol: symbol.toUpperCase(),
            price,
            change,
            changePercent,
            currency: meta.currency || resolveInstrument(symbol).currency || 'USD',
            // The primary reference for EOD analysis is the last COMPLETED
            // daily bar, not "this instant" — asOf reflects that bar's
            // market date rather than implying a live tick this provider
            // does not actually offer (see docs/market-data.md, "Live data
            // is not required").
            asOf: lastBar ? `${lastBar.time}T00:00:00.000Z` : new Date().toISOString(),
        });
    } catch (error) {
        return fail(error, `Failed to fetch quote for ${symbol}`);
    }
}

async function getCompanyProfile(symbol: string): Promise<MarketDataResult<CompanyProfile>> {
    try {
        const result = await fetchYahooChart(toProviderSymbol(symbol), { range: '5d' });
        const meta = result.meta ?? {};
        return ok({
            symbol: symbol.toUpperCase(),
            // Yahoo's chart endpoint carries no company name field — use the
            // real, known-good BIST name where available (never a guess),
            // otherwise fall back to the symbol rather than fabricate one.
            name: getBistCompanyName(symbol) ?? symbol.toUpperCase(),
            exchange: meta.exchangeName,
            currency: meta.currency,
        });
    } catch (error) {
        return fail(error, `Failed to fetch company profile for ${symbol}`);
    }
}

async function getFinancials(_symbol: string): Promise<MarketDataResult<FinancialData>> {
    void _symbol;
    return fail(
        new MarketDataError('unavailable', 'Fundamentals are not implemented for the Yahoo EOD provider — use Finnhub when configured'),
        'unavailable',
    );
}

async function getNews(_symbol?: string): Promise<MarketDataResult<NewsItem[]>> {
    void _symbol;
    return fail(
        new MarketDataError('unavailable', 'News is not implemented for the Yahoo EOD provider — use Finnhub when configured'),
        'unavailable',
    );
}

async function searchSymbols(_query: string): Promise<MarketDataResult<SearchResult[]>> {
    void _query;
    return fail(
        new MarketDataError('unavailable', 'Symbol search is local (lib/market-data/localSearch.ts), not provider-backed'),
        'unavailable',
    );
}

export const yahooProvider: MarketDataProvider = {
    id: 'yahoo',
    getQuote,
    getHistoricalPrices,
    getCompanyProfile,
    getFinancials,
    getNews,
    searchSymbols,
};
