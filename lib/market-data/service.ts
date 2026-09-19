import { finnhubProvider } from '@/lib/market-data/providers/finnhub';
import { stooqProvider } from '@/lib/market-data/providers/stooq';
import { yahooProvider } from '@/lib/market-data/providers/yahoo';
import { resolveInstrument } from '@/lib/market-data/instruments/resolve';
import { searchLocalInstruments } from '@/lib/market-data/localSearch';
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
 * Routes a symbol to its market-data provider for financials/news —
 * Finnhub-only "optional enrichment" per docs/market-data.md, with no
 * fallback: Yahoo doesn't implement either (see providers/yahoo.ts), so an
 * absent/failing Finnhub key means these two genuinely stay `unavailable`,
 * an accepted, documented limitation rather than something to paper over.
 * A BIST symbol still routes to Yahoo (never to Finnhub, which has no BIST
 * coverage at all) purely so the resulting "unavailable" is attributed
 * honestly rather than blamed on a Finnhub failure that never happened.
 * Quote and company-profile have their OWN fallback chains below — they are
 * NOT routed through this function, since Yahoo does implement both.
 */
export function getProviderForSymbol(symbol: string): MarketDataProvider {
    return resolveInstrument(symbol).market === 'TR' ? yahooProvider : finnhubProvider;
}

/** Tries each provider in `chain` in order, returning the first success; if
 * every one fails, returns the LAST provider's error (the one that got
 * furthest down the chain). Shared by the quote/company-profile/historical-
 * bars chains below so "try provider after provider, keep the most useful
 * failure" is implemented exactly once. */
async function tryProviderChain<T>(
    chain: MarketDataProvider[],
    call: (provider: MarketDataProvider) => Promise<MarketDataResult<T>>,
    symbol: string,
    label: string,
): Promise<MarketDataResult<T>> {
    let lastError = new MarketDataError('unavailable', `No ${label} provider available for ${symbol}`);
    for (const provider of chain) {
        const result = await call(provider);
        if (result.ok) return result;
        lastError = result.error;
    }
    return { ok: false, error: lastError };
}

/**
 * Quote fallback chain — unlike financials/news, Yahoo DOES implement
 * quotes (derived from its EOD chart data, not a live tick — see
 * providers/yahoo.ts), so this is the one enrichment-tier function that
 * keeps working, for every market, even with FINNHUB_API_KEY unset: Finnhub
 * is tried first when configured (richer, closer to real-time), Yahoo is
 * the free fallback. BIST has no Finnhub coverage at all, so it skips
 * straight to Yahoo — see docs/market-data.md.
 */
function getQuoteChain(market: string): MarketDataProvider[] {
    return market === 'TR' ? [yahooProvider] : [finnhubProvider, yahooProvider];
}

export async function getQuote(symbol: string): Promise<MarketDataResult<Quote>> {
    const instrument = resolveInstrument(symbol);
    return tryProviderChain(getQuoteChain(instrument.market ?? 'US'), (p) => p.getQuote(symbol), symbol, 'quote');
}

/** Same reasoning as getQuoteChain — Yahoo's company-profile is limited
 * (a verified local name where known, otherwise just the ticker — see
 * providers/yahoo.ts) but real and never fabricated, so it's a legitimate
 * fallback rather than nothing at all. */
function getCompanyProfileChain(market: string): MarketDataProvider[] {
    return market === 'TR' ? [yahooProvider] : [finnhubProvider, yahooProvider];
}

/**
 * The historical-bar fallback chain — the one place "which provider for
 * which market" is decided for EOD OHLCV (see docs/market-data.md):
 *
 *   US:  Stooq (primary, free, no key) -> Yahoo (fallback)
 *   BIST/TR: Yahoo (the only free source identified — see docs/bist.md)
 *
 * Tries each provider in order, returning the first success; if every
 * provider in the chain fails, returns the LAST provider's error (the one
 * that got furthest down the chain) rather than the first, since that's
 * usually the more informative failure to surface. Never fabricates bars
 * when the whole chain fails — callers (the sync engine, or a
 * just-in-time seed — see historicalDataRepository.ts::getBarsOrFetch) are
 * expected to fall back to whatever is already stored locally and mark it
 * stale, per the "never silently fabricate missing bars" rule.
 */
function getHistoricalPricesChain(market: string): MarketDataProvider[] {
    if (market === 'TR') return [yahooProvider];
    return [stooqProvider, yahooProvider];
}

export interface HistoricalPricesWithProvider {
    result: MarketDataResult<HistoricalBar[]>;
    /** Which provider in the chain actually produced this result (or the
     * last one tried, if every provider failed) — see docs/market-data.md's
     * "Data source attribution"; the sync engine stamps this onto every
     * stored bar rather than losing which specific source it came from. */
    providerId: string;
}

export async function getHistoricalPricesWithProvider(symbol: string, timeframe: Timeframe = 'D'): Promise<HistoricalPricesWithProvider> {
    const instrument = resolveInstrument(symbol);
    const chain = getHistoricalPricesChain(instrument.market ?? 'US');

    let lastError = new MarketDataError('unavailable', `No historical-data provider available for ${symbol}`);
    let lastProviderId = 'none';
    for (const provider of chain) {
        const result = await provider.getHistoricalPrices(symbol, timeframe);
        if (result.ok) return { result, providerId: provider.id };
        lastError = result.error;
        lastProviderId = provider.id;
    }
    return { result: { ok: false, error: lastError }, providerId: lastProviderId };
}

export async function getHistoricalPrices(symbol: string, timeframe: Timeframe = 'D'): Promise<MarketDataResult<HistoricalBar[]>> {
    return (await getHistoricalPricesWithProvider(symbol, timeframe)).result;
}

export async function getCompanyProfile(symbol: string): Promise<MarketDataResult<CompanyProfile>> {
    const instrument = resolveInstrument(symbol);
    return tryProviderChain(getCompanyProfileChain(instrument.market ?? 'US'), (p) => p.getCompanyProfile(symbol), symbol, 'company-profile');
}

export function getFinancials(symbol: string): Promise<MarketDataResult<FinancialData>> {
    return getProviderForSymbol(symbol).getFinancials(symbol);
}

export function getNews(symbol?: string): Promise<MarketDataResult<NewsItem[]>> {
    // News is not symbol-routed the way price data is: without a symbol we
    // want general market news, which every provider surfaces the same way.
    return getProviderForSymbol(symbol ?? '').getNews(symbol);
}

/** Personalized news across an entire watchlist: fetches each symbol's
 * company news in parallel and round-robins picks across symbols so no
 * single ticker crowds out the rest, falling back to general market news if
 * nothing could be collected. This is orchestration above the provider
 * abstraction (a provider only knows how to fetch news for one symbol at a
 * time), so it lives here rather than in providers/finnhub.ts. */
export async function getNewsForWatchlist(symbols: string[], maxArticles = 6): Promise<NewsItem[]> {
    const cleanSymbols = symbols.map((s) => s?.trim().toUpperCase()).filter((s): s is string => Boolean(s));
    if (cleanSymbols.length === 0) {
        const general = await getNews();
        return general.ok ? general.data : [];
    }

    const perSymbolArticles = new Map<string, NewsItem[]>();
    await Promise.all(
        cleanSymbols.map(async (symbol) => {
            const result = await getNews(symbol);
            perSymbolArticles.set(symbol, result.ok ? result.data : []);
        }),
    );

    const collected: NewsItem[] = [];
    for (let round = 0; round < maxArticles && collected.length < maxArticles; round++) {
        for (const symbol of cleanSymbols) {
            const list = perSymbolArticles.get(symbol) ?? [];
            const article = list.shift();
            if (article) collected.push(article);
            if (collected.length >= maxArticles) break;
        }
    }

    if (collected.length > 0) {
        collected.sort((a, b) => (b.datetime || 0) - (a.datetime || 0));
        return collected.slice(0, maxArticles);
    }

    const general = await getNews();
    return general.ok ? general.data : [];
}

/**
 * Local universe search (see localSearch.ts — no API key, always available)
 * merged with Finnhub's broader live search as an optional enrichment.
 * Always succeeds: an absent/failing Finnhub key means a smaller result set
 * (local matches only), never a hard error — search must keep working with
 * FINNHUB_API_KEY unset (see docs/market-data.md's zero-cost-first / "core
 * required vs optional" principle).
 */
export async function searchSymbols(query: string): Promise<MarketDataResult<SearchResult[]>> {
    const local = searchLocalInstruments(query);
    const finnhubResult = await finnhubProvider.searchSymbols(query);
    if (!finnhubResult.ok) {
        return { ok: true, data: local };
    }

    const seen = new Set(local.map((r) => r.symbol));
    const merged = [...local, ...finnhubResult.data.filter((r) => !seen.has(r.symbol))];
    return { ok: true, data: merged };
}

export interface WatchlistQuote {
    symbol: string;
    price: number;
    change: number;
    changePercent: number;
    currency: string;
    name: string;
    logo?: string;
    marketCap?: number;
}

/** Batch quote+profile fetch for a list of symbols — what a watchlist table
 * or scanner needs. Never throws: a symbol whose quote/profile can't be
 * fetched is simply left out rather than shown with fabricated numbers. */
export async function getQuotesForSymbols(symbols: string[]): Promise<WatchlistQuote[]> {
    if (!symbols || symbols.length === 0) return [];

    const results = await Promise.all(
        symbols.map(async (symbol) => {
            const [quoteResult, profileResult] = await Promise.all([
                getQuote(symbol),
                getCompanyProfile(symbol),
            ]);

            if (!quoteResult.ok) return null;

            const watchlistQuote: WatchlistQuote = {
                symbol,
                price: quoteResult.data.price,
                change: quoteResult.data.change,
                changePercent: quoteResult.data.changePercent,
                currency: profileResult.ok ? profileResult.data.currency || 'USD' : 'USD',
                name: profileResult.ok ? profileResult.data.name : symbol,
                logo: profileResult.ok ? profileResult.data.logo : undefined,
                marketCap: profileResult.ok ? profileResult.data.marketCapitalization : undefined,
            };
            return watchlistQuote;
        }),
    );

    return results.filter((r): r is WatchlistQuote => r !== null);
}
