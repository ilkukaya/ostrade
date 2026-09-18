import { finnhubProvider } from '@/lib/market-data/providers/finnhub';
import type {
    CompanyProfile,
    FinancialData,
    HistoricalBar,
    MarketDataProvider,
    MarketDataResult,
    NewsItem,
    Quote,
    SearchResult,
    Timeframe,
} from '@/lib/market-data/types';

/**
 * Routes a symbol to its market-data provider.
 *
 * Every symbol currently resolves to Finnhub. This is intentionally the only
 * place that decision is made — adding a future BIST (or any other) provider
 * means teaching this function to recognize those symbols/exchanges and
 * return a different MarketDataProvider, with zero changes required in the
 * UI or the swing-analysis engine. See docs/market-data.md.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- seam for future symbol-based provider routing (e.g. BIST)
export function getProviderForSymbol(_symbol: string): MarketDataProvider {
    return finnhubProvider;
}

export function getQuote(symbol: string): Promise<MarketDataResult<Quote>> {
    return getProviderForSymbol(symbol).getQuote(symbol);
}

export function getHistoricalPrices(symbol: string, timeframe: Timeframe = 'D'): Promise<MarketDataResult<HistoricalBar[]>> {
    return getProviderForSymbol(symbol).getHistoricalPrices(symbol, timeframe);
}

export function getCompanyProfile(symbol: string): Promise<MarketDataResult<CompanyProfile>> {
    return getProviderForSymbol(symbol).getCompanyProfile(symbol);
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

export function searchSymbols(query: string): Promise<MarketDataResult<SearchResult[]>> {
    // Symbol search has no symbol to route on yet; defer to the default
    // (Finnhub) provider until a second provider/universe exists.
    return finnhubProvider.searchSymbols(query);
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
