'use server';

/**
 * Thin server-action adapter over lib/market-data/service.ts.
 *
 * This file exists so existing call sites (search command, header, watchlist
 * chips, the sign-up welcome-email job) don't need to change: it preserves
 * their existing shapes while the actual Finnhub HTTP calls now live behind
 * the provider abstraction in lib/market-data/. New code should prefer
 * importing lib/market-data/service.ts directly.
 */

import * as marketData from '@/lib/market-data/service';
import type { Quote } from '@/lib/market-data/types';

export async function getQuote(symbol: string): Promise<Quote | null> {
    const result = await marketData.getQuote(symbol);
    return result.ok ? result.data : null;
}

export async function getCompanyProfile(symbol: string) {
    const result = await marketData.getCompanyProfile(symbol);
    return result.ok ? result.data : null;
}

export async function getWatchlistData(symbols: string[]) {
    return marketData.getQuotesForSymbols(symbols);
}

export async function getNews(symbols?: string[]): Promise<MarketNewsArticle[]> {
    if (symbols && symbols.length > 0) {
        return marketData.getNewsForWatchlist(symbols);
    }
    const result = await marketData.getNews();
    if (!result.ok) {
        throw new Error('Failed to fetch news');
    }
    return result.data;
}

export const searchStocks = async (query?: string): Promise<StockWithWatchlistStatus[]> => {
    const result = await marketData.searchSymbols(query ?? '');
    if (!result.ok) return [];

    return result.data.map((r) => ({
        symbol: r.symbol,
        name: r.name,
        exchange: r.exchange,
        type: r.type,
        isInWatchlist: false,
    }));
};
