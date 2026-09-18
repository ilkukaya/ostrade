/**
 * Market-data provider abstraction.
 *
 * The rest of the app (UI, swing-analysis engine, scanner, etc.) should only
 * ever depend on these types and on `lib/market-data/service.ts` — never
 * reach into a specific provider (Finnhub, Stooq, a future BIST source...)
 * directly. That's what lets us route different symbols to different
 * providers later (e.g. AAPL -> Finnhub, THYAO -> a future BIST provider)
 * without touching the UI or analysis code.
 */

/** A normalized instrument identifier — not every symbol is NYSE/NASDAQ. */
export interface InstrumentId {
    symbol: string;
    exchange?: string;
    market?: string;
    currency?: string;
}

/** Daily/weekly/monthly historical bar resolution. Intraday is intentionally
 * out of scope for a swing-trading terminal (see docs/market-data.md). */
export type Timeframe = 'D' | 'W' | 'M';

export interface Quote {
    symbol: string;
    price: number;
    change: number;
    changePercent: number;
    currency: string;
    /** ISO timestamp of when this snapshot was fetched — surfaced in the UI
     * so stale data is never silently presented as live (see docs section on
     * data freshness). */
    asOf: string;
}

export interface HistoricalBar {
    /** ISO date (YYYY-MM-DD) for daily bars. */
    time: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

export interface CompanyProfile {
    symbol: string;
    name: string;
    exchange?: string;
    currency?: string;
    marketCapitalization?: number;
    logo?: string;
    industry?: string;
}

export interface FinancialData {
    symbol: string;
    metric: Record<string, number>;
}

export interface NewsItem {
    id: number;
    headline: string;
    summary: string;
    source: string;
    url: string;
    datetime: number;
    category: string;
    related: string;
    image?: string;
}

export interface DividendData {
    symbol: string;
    exDate: string;
    amount: number;
}

export interface EarningsData {
    symbol: string;
    date: string;
    epsActual?: number;
    epsEstimate?: number;
}

export interface SearchResult {
    symbol: string;
    name: string;
    exchange: string;
    type: string;
}

/**
 * Every failure mode a provider call can hit, kept distinct so callers (and
 * the UI) can react appropriately instead of collapsing everything into a
 * generic "something went wrong". See docs/market-data.md.
 */
export type MarketDataErrorKind =
    | 'not_configured' // missing API key/credentials
    | 'auth' // provider rejected the credentials
    | 'rate_limit' // provider throttled us
    | 'plan_restricted' // valid credentials, but this endpoint needs a paid plan
    | 'not_found' // symbol/resource does not exist
    | 'network' // request never completed (timeout, DNS, connection reset)
    | 'bad_response' // provider responded, but the payload was malformed
    | 'unavailable'; // provider reachable but returned a server error

export class MarketDataError extends Error {
    readonly kind: MarketDataErrorKind;

    constructor(kind: MarketDataErrorKind, message: string) {
        super(message);
        this.name = 'MarketDataError';
        this.kind = kind;
    }
}

export type MarketDataResult<T> =
    | { ok: true; data: T }
    | { ok: false; error: MarketDataError };

export interface MarketDataProvider {
    readonly id: string;
    getQuote(symbol: string): Promise<MarketDataResult<Quote>>;
    getHistoricalPrices(symbol: string, timeframe: Timeframe): Promise<MarketDataResult<HistoricalBar[]>>;
    getCompanyProfile(symbol: string): Promise<MarketDataResult<CompanyProfile>>;
    getFinancials(symbol: string): Promise<MarketDataResult<FinancialData>>;
    getNews(symbol?: string): Promise<MarketDataResult<NewsItem[]>>;
    searchSymbols(query: string): Promise<MarketDataResult<SearchResult[]>>;
}
