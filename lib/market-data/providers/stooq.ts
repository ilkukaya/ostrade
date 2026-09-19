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

/**
 * Stooq (stooq.com) daily-bar CSV endpoint — the PRIMARY historical-bar
 * source for US symbols (see docs/market-data.md's provider-priority
 * redesign). No API key, free, and long used by open-source market-data
 * tooling for exactly this gap. US-listed tickers only — see
 * `toStooqSymbol` below; a non-US symbol reports `not_found` rather than
 * being guessed at.
 *
 * Treat it as best-effort: if the format ever changes or a symbol isn't
 * covered, callers get a MarketDataError instead of fabricated bars (never
 * invented data).
 */

const STOOQ_BASE_URL = 'https://stooq.com/q/d/l/';

/** Parses Stooq's `Date,Open,High,Low,Close,Volume` daily CSV into bars.
 * Exported standalone (no network) so it can be unit-tested with fixtures. */
export function parseStooqDailyCsv(csv: string): HistoricalBar[] {
    const lines = csv
        .trim()
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

    if (lines.length === 0) {
        return [];
    }

    const [header, ...rows] = lines;
    const columns = header.split(',').map((c) => c.trim().toLowerCase());
    const idx = {
        date: columns.indexOf('date'),
        open: columns.indexOf('open'),
        high: columns.indexOf('high'),
        low: columns.indexOf('low'),
        close: columns.indexOf('close'),
        volume: columns.indexOf('volume'),
    };

    if (idx.date === -1 || idx.open === -1 || idx.high === -1 || idx.low === -1 || idx.close === -1) {
        throw new MarketDataError('bad_response', 'Unexpected Stooq CSV header format');
    }

    const bars: HistoricalBar[] = [];
    for (const row of rows) {
        const cells = row.split(',');
        const time = cells[idx.date];
        const open = Number(cells[idx.open]);
        const high = Number(cells[idx.high]);
        const low = Number(cells[idx.low]);
        const close = Number(cells[idx.close]);
        const volume = idx.volume !== -1 ? Number(cells[idx.volume]) : 0;

        // Skip corrupt rows rather than feeding bad data into indicators
        // (missing OHLC, non-numeric fields, high < low, etc.)
        if (!time || ![open, high, low, close, volume].every(Number.isFinite)) continue;
        if (high < low) continue;
        if (close > high || close < low) continue;

        bars.push({ time, open, high, low, close, volume });
    }

    // Stooq returns oldest-first already, but don't assume — sort explicitly
    // and drop any duplicate timestamps.
    bars.sort((a, b) => a.time.localeCompare(b.time));
    const deduped: HistoricalBar[] = [];
    for (const bar of bars) {
        if (deduped.length > 0 && deduped[deduped.length - 1].time === bar.time) continue;
        deduped.push(bar);
    }
    return deduped;
}

function toStooqSymbol(symbol: string): string {
    // Stooq expects a market suffix; default to the US market since that's
    // the only universe this app currently covers end-to-end. Symbols that
    // already carry a Finnhub-style exchange suffix (e.g. "BARC.L") aren't
    // translated here — historical bars for non-US symbols are simply
    // reported unavailable rather than guessed at.
    return `${symbol.toLowerCase()}.us`;
}

export async function fetchStooqDailyBars(symbol: string): Promise<HistoricalBar[]> {
    const url = `${STOOQ_BASE_URL}?s=${encodeURIComponent(toStooqSymbol(symbol))}&i=d`;

    let res: Response;
    try {
        res = await fetch(url, { cache: 'force-cache', next: { revalidate: 21600 } });
    } catch {
        throw new MarketDataError('network', `Could not reach Stooq for ${symbol}`);
    }

    if (!res.ok) {
        throw new MarketDataError('unavailable', `Stooq returned HTTP ${res.status} for ${symbol}`);
    }

    const csv = await res.text();
    if (/no data/i.test(csv)) {
        throw new MarketDataError('not_found', `Stooq has no historical data for ${symbol}`);
    }

    return parseStooqDailyCsv(csv);
}

function ok<T>(data: T): MarketDataResult<T> {
    return { ok: true, data };
}

function fail<T>(error: unknown, fallbackMessage: string): MarketDataResult<T> {
    if (error instanceof MarketDataError) return { ok: false, error };
    return { ok: false, error: new MarketDataError('unavailable', fallbackMessage) };
}

async function getHistoricalPrices(symbol: string, timeframe: Timeframe): Promise<MarketDataResult<HistoricalBar[]>> {
    if (timeframe !== 'D') {
        return fail(new MarketDataError('unavailable', 'Stooq only provides daily bars'), 'unavailable');
    }
    try {
        const bars = await fetchStooqDailyBars(symbol);
        if (bars.length === 0) {
            return fail(new MarketDataError('not_found', `No historical data available for ${symbol}`), 'not found');
        }
        return ok(bars);
    } catch (error) {
        return fail(error, `Failed to fetch historical prices for ${symbol}`);
    }
}

async function getQuote(symbol: string): Promise<MarketDataResult<Quote>> {
    // Stooq's daily-bar feed has no separate "live quote" endpoint used
    // here — the last completed daily bar IS the reference price for an
    // EOD terminal anyway (see docs/market-data.md, "Live data is not
    // required"). Derive a quote from it rather than adding a second HTTP
    // call this provider doesn't need.
    try {
        const bars = await fetchStooqDailyBars(symbol);
        const lastBar = bars[bars.length - 1];
        if (!lastBar) {
            return fail(new MarketDataError('not_found', `No quote available for ${symbol}`), 'not found');
        }
        const previousBar = bars.length > 1 ? bars[bars.length - 2] : undefined;
        const change = previousBar ? lastBar.close - previousBar.close : 0;
        const changePercent = previousBar && previousBar.close !== 0 ? (change / previousBar.close) * 100 : 0;
        return ok({
            symbol: symbol.toUpperCase(),
            price: lastBar.close,
            change,
            changePercent,
            currency: 'USD',
            asOf: `${lastBar.time}T00:00:00.000Z`,
        });
    } catch (error) {
        return fail(error, `Failed to fetch quote for ${symbol}`);
    }
}

async function getCompanyProfile(_symbol: string): Promise<MarketDataResult<CompanyProfile>> {
    void _symbol;
    return fail(new MarketDataError('unavailable', 'Company profile is not implemented for the Stooq provider — use Finnhub when configured'), 'unavailable');
}

async function getFinancials(_symbol: string): Promise<MarketDataResult<FinancialData>> {
    void _symbol;
    return fail(new MarketDataError('unavailable', 'Fundamentals are not implemented for the Stooq provider — use Finnhub when configured'), 'unavailable');
}

async function getNews(_symbol?: string): Promise<MarketDataResult<NewsItem[]>> {
    void _symbol;
    return fail(new MarketDataError('unavailable', 'News is not implemented for the Stooq provider — use Finnhub when configured'), 'unavailable');
}

async function searchSymbols(_query: string): Promise<MarketDataResult<SearchResult[]>> {
    void _query;
    return fail(new MarketDataError('unavailable', 'Symbol search is local (lib/market-data/localSearch.ts), not provider-backed'), 'unavailable');
}

/** A first-class MarketDataProvider, not just an internal helper Finnhub
 * used to reach for — see docs/market-data.md's provider-priority redesign.
 * Only historical bars and a derived quote are implemented honestly;
 * everything else reports unavailable rather than fabricating data. */
export const stooqProvider: MarketDataProvider = {
    id: 'stooq',
    getQuote,
    getHistoricalPrices,
    getCompanyProfile,
    getFinancials,
    getNews,
    searchSymbols,
};
