import { cache } from 'react';
import { getDateRange, validateArticle, formatArticle } from '@/lib/utils';
import { POPULAR_STOCK_SYMBOLS } from '@/lib/constants';
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

const FINNHUB_BASE_URL = process.env.FINNHUB_BASE_URL || 'https://finnhub.io/api/v1';

function apiKey(): string {
    return process.env.FINNHUB_API_KEY ?? '';
}

type FinnhubQuote = { c?: number; d?: number; dp?: number };
type FinnhubCompanyProfile = {
    currency?: string;
    exchange?: string;
    logo?: string;
    marketCapitalization?: number;
    name?: string;
    ticker?: string;
    finnhubIndustry?: string;
};
type FinnhubMetricResponse = { metric?: Record<string, number | null> };
type FinnhubCandle = { s: string; t?: number[]; o?: number[]; h?: number[]; l?: number[]; c?: number[]; v?: number[] };

const FINNHUB_EXCHANGE_SUFFIXES = new Set([
    'AS', 'AT', 'AX', 'BA', 'BK', 'BO', 'BR', 'CO', 'DE', 'F', 'HE', 'HK',
    'IL', 'IS', 'JK', 'JO', 'KL', 'KQ', 'KS', 'L', 'LS', 'MC', 'MI', 'MX',
    'NS', 'NZ', 'OL', 'PA', 'PR', 'SA', 'SI', 'SS', 'ST', 'SW', 'SZ', 'T',
    'TA', 'TO', 'TW', 'TWO', 'V', 'VI', 'WA',
]);

function getExchangeLabel(symbol: string, exchange?: string) {
    if (exchange?.trim()) return exchange.trim();
    const parts = symbol.split('.');
    const suffix = parts.length > 1 ? parts[parts.length - 1].toUpperCase() : '';
    if (!suffix) return 'US';
    return FINNHUB_EXCHANGE_SUFFIXES.has(suffix) ? suffix : 'US';
}

/** Fetches JSON and classifies HTTP failures into MarketDataError kinds
 * instead of collapsing everything into a generic throw. */
async function fetchJSON<T>(url: string, revalidateSeconds?: number): Promise<T> {
    const options: RequestInit & { next?: { revalidate?: number } } = revalidateSeconds
        ? { cache: 'force-cache', next: { revalidate: revalidateSeconds } }
        : { cache: 'no-store' };

    let res: Response;
    try {
        res = await fetch(url, options);
    } catch {
        throw new MarketDataError('network', 'Finnhub request failed to complete');
    }

    if (res.status === 401 || res.status === 403) {
        const text = await res.text().catch(() => '');
        // Finnhub uses 403 both for "bad key" and "this endpoint needs a paid
        // plan" — the message text is the only way to tell them apart.
        if (/plan|upgrade|premium/i.test(text)) {
            throw new MarketDataError('plan_restricted', `Finnhub: ${text || 'endpoint requires a paid plan'}`);
        }
        throw new MarketDataError('auth', `Finnhub rejected the API key (HTTP ${res.status})`);
    }
    if (res.status === 429) {
        throw new MarketDataError('rate_limit', 'Finnhub rate limit exceeded');
    }
    if (res.status === 404) {
        throw new MarketDataError('not_found', 'Finnhub: symbol not found');
    }
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new MarketDataError('unavailable', `Finnhub HTTP ${res.status}: ${text}`);
    }

    try {
        return (await res.json()) as T;
    } catch {
        throw new MarketDataError('bad_response', 'Finnhub returned a non-JSON response');
    }
}

function ok<T>(data: T): MarketDataResult<T> {
    return { ok: true, data };
}

function fail<T>(error: unknown, fallbackMessage: string): MarketDataResult<T> {
    if (error instanceof MarketDataError) return { ok: false, error };
    return { ok: false, error: new MarketDataError('unavailable', fallbackMessage) };
}

async function getQuote(symbol: string): Promise<MarketDataResult<Quote>> {
    const token = apiKey();
    if (!token) return fail(new MarketDataError('not_configured', 'FINNHUB_API_KEY is not set'), 'not configured');

    try {
        const url = `${FINNHUB_BASE_URL}/quote?symbol=${encodeURIComponent(symbol)}&token=${token}`;
        const data = await fetchJSON<FinnhubQuote>(url, 0);
        if (data.c === undefined) {
            return fail(new MarketDataError('not_found', `No quote for ${symbol}`), 'not found');
        }
        return ok({
            symbol: symbol.toUpperCase(),
            price: data.c ?? 0,
            change: data.d ?? 0,
            changePercent: data.dp ?? 0,
            currency: 'USD',
            asOf: new Date().toISOString(),
        });
    } catch (error) {
        return fail(error, `Failed to fetch quote for ${symbol}`);
    }
}

async function getCompanyProfile(symbol: string): Promise<MarketDataResult<CompanyProfile>> {
    const token = apiKey();
    if (!token) return fail(new MarketDataError('not_configured', 'FINNHUB_API_KEY is not set'), 'not configured');

    try {
        const url = `${FINNHUB_BASE_URL}/stock/profile2?symbol=${encodeURIComponent(symbol)}&token=${token}`;
        const data = await fetchJSON<FinnhubCompanyProfile>(url, 86400);
        if (!data.name) {
            return fail(new MarketDataError('not_found', `No company profile for ${symbol}`), 'not found');
        }
        return ok({
            symbol: symbol.toUpperCase(),
            name: data.name,
            exchange: data.exchange,
            currency: data.currency,
            marketCapitalization: data.marketCapitalization,
            logo: data.logo,
            industry: data.finnhubIndustry,
        });
    } catch (error) {
        return fail(error, `Failed to fetch company profile for ${symbol}`);
    }
}

async function getFinancials(symbol: string): Promise<MarketDataResult<FinancialData>> {
    const token = apiKey();
    if (!token) return fail(new MarketDataError('not_configured', 'FINNHUB_API_KEY is not set'), 'not configured');

    try {
        const url = `${FINNHUB_BASE_URL}/stock/metric?symbol=${encodeURIComponent(symbol)}&metric=all&token=${token}`;
        const data = await fetchJSON<FinnhubMetricResponse>(url, 86400);
        const metric: Record<string, number> = {};
        for (const [key, value] of Object.entries(data.metric ?? {})) {
            if (typeof value === 'number' && Number.isFinite(value)) metric[key] = value;
        }
        return ok({ symbol: symbol.toUpperCase(), metric });
    } catch (error) {
        return fail(error, `Failed to fetch financials for ${symbol}`);
    }
}

/**
 * Finnhub's `/stock/candle` is gated behind a paid plan for most free-tier
 * keys, and Finnhub is no longer the primary historical-bar source anyway
 * (see docs/market-data.md's provider-priority redesign — Stooq/Yahoo now
 * fill that role via service.ts's own fallback chain). This method still
 * tries Finnhub's own candle endpoint honestly for anyone who does have
 * access, but no longer reaches into Stooq itself on failure — Stooq is a
 * first-class peer provider now (providers/stooq.ts::stooqProvider),
 * called directly by the chain, not nested inside this file.
 */
async function getHistoricalPrices(symbol: string, timeframe: Timeframe): Promise<MarketDataResult<HistoricalBar[]>> {
    const token = apiKey();
    if (!token) return fail(new MarketDataError('not_configured', 'FINNHUB_API_KEY is not set'), 'not configured');

    const resolution = timeframe === 'D' ? 'D' : timeframe === 'W' ? 'W' : 'M';
    try {
        const to = Math.floor(Date.now() / 1000);
        const from = to - 60 * 60 * 24 * 400; // ~400 days of history
        const url = `${FINNHUB_BASE_URL}/stock/candle?symbol=${encodeURIComponent(symbol)}&resolution=${resolution}&from=${from}&to=${to}&token=${token}`;
        const data = await fetchJSON<FinnhubCandle>(url, 3600);

        if (data.s === 'ok' && data.t && data.o && data.h && data.l && data.c && data.v) {
            const bars: HistoricalBar[] = data.t.map((t, i) => ({
                time: new Date(t * 1000).toISOString().slice(0, 10),
                open: data.o![i],
                high: data.h![i],
                low: data.l![i],
                close: data.c![i],
                volume: data.v![i],
            }));
            return ok(bars);
        }
        return fail(new MarketDataError('not_found', `No historical data available for ${symbol}`), 'not found');
    } catch (error) {
        return fail(error, `Failed to fetch historical prices for ${symbol}`);
    }
}

async function getNews(symbol?: string): Promise<MarketDataResult<NewsItem[]>> {
    const token = apiKey();
    if (!token) return fail(new MarketDataError('not_configured', 'FINNHUB_API_KEY is not set'), 'not configured');

    try {
        const maxArticles = 6;
        if (symbol) {
            const range = getDateRange(5);
            const url = `${FINNHUB_BASE_URL}/company-news?symbol=${encodeURIComponent(symbol)}&from=${range.from}&to=${range.to}&token=${token}`;
            const articles = await fetchJSON<RawNewsArticle[]>(url, 300);
            const formatted = (articles || [])
                .filter(validateArticle)
                .slice(0, maxArticles)
                .map((a, idx) => formatArticle(a, true, symbol, idx));
            return ok(formatted);
        }

        const generalUrl = `${FINNHUB_BASE_URL}/news?category=general&token=${token}`;
        const general = await fetchJSON<RawNewsArticle[]>(generalUrl, 300);
        const seen = new Set<string>();
        const unique: RawNewsArticle[] = [];
        for (const art of general || []) {
            if (!validateArticle(art)) continue;
            const key = `${art.id}-${art.url}-${art.headline}`;
            if (seen.has(key)) continue;
            seen.add(key);
            unique.push(art);
            if (unique.length >= maxArticles) break;
        }
        return ok(unique.map((a, idx) => formatArticle(a, false, undefined, idx)));
    } catch (error) {
        return fail(error, 'Failed to fetch news');
    }
}

type FinnhubSearchCandidate = { symbol: string; description: string; type: string; __exchange?: string };

const searchSymbolsUncached = async (query: string): Promise<MarketDataResult<SearchResult[]>> => {
    const token = apiKey();
    if (!token) return fail(new MarketDataError('not_configured', 'FINNHUB_API_KEY is not set'), 'not configured');

    try {
        const trimmed = query.trim();
        let results: FinnhubSearchCandidate[] = [];

        if (!trimmed) {
            const top = POPULAR_STOCK_SYMBOLS.slice(0, 10);
            const profiles = await Promise.all(
                top.map(async (sym) => {
                    try {
                        const url = `${FINNHUB_BASE_URL}/stock/profile2?symbol=${encodeURIComponent(sym)}&token=${token}`;
                        const profile = await fetchJSON<FinnhubCompanyProfile>(url, 3600);
                        return { sym, profile };
                    } catch {
                        return { sym, profile: null as FinnhubCompanyProfile | null };
                    }
                }),
            );

            results = profiles
                .map(({ sym, profile }): FinnhubSearchCandidate | undefined => {
                    const symbol = sym.toUpperCase();
                    const name = profile?.name || profile?.ticker;
                    if (!name) return undefined;
                    return { symbol, description: name, type: 'Common Stock', __exchange: profile?.exchange };
                })
                .filter((x): x is FinnhubSearchCandidate => Boolean(x));
        } else {
            const url = `${FINNHUB_BASE_URL}/search?q=${encodeURIComponent(trimmed)}&token=${token}`;
            const data = await fetchJSON<FinnhubSearchResponse>(url, 1800);
            results = (Array.isArray(data?.result) ? data.result : []).map((r) => ({
                symbol: r.symbol,
                description: r.description,
                type: r.type,
            }));
        }

        const mapped: SearchResult[] = results
            .map((r) => {
                const upper = (r.symbol || '').toUpperCase();
                return {
                    symbol: upper,
                    name: r.description || upper,
                    exchange: getExchangeLabel(upper, r.__exchange),
                    type: r.type || 'Stock',
                };
            })
            .slice(0, 15);

        return ok(mapped);
    } catch (error) {
        return fail(error, 'Failed to search stocks');
    }
};

// react's cache() dedupes identical calls within a single server render pass.
const searchSymbols = cache(searchSymbolsUncached);

export const finnhubProvider: MarketDataProvider = {
    id: 'finnhub',
    getQuote,
    getHistoricalPrices,
    getCompanyProfile,
    getFinancials,
    getNews,
    searchSymbols,
};
