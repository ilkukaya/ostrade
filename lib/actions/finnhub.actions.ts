'use server';

/**
 * Thin server-action adapter over lib/market-data/service.ts.
 *
 * This file exists so existing call sites (search command, header, watchlist
 * chips, the sign-up welcome-email job) don't need to change: it preserves
 * their existing shapes while the actual Finnhub HTTP calls now live behind
 * the provider abstraction in lib/market-data/. New code should prefer
 * importing lib/market-data/service.ts directly.
 *
 * Every export requires a session — these are real Server Action HTTP
 * endpoints (browser-invokable), and this is a private, single-owner
 * terminal (see docs/architecture.md). The 5-minute price-alert cron
 * (lib/inngest/functions.ts) deliberately does NOT go through this file —
 * it runs with no user session at all, so it calls
 * lib/market-data/service.ts's getQuote directly instead.
 */

import { headers } from 'next/headers';
import { getAuth } from '@/lib/better-auth/auth';
import * as marketData from '@/lib/market-data/service';
import type { Quote } from '@/lib/market-data/types';

async function requireUserId(): Promise<string> {
    const auth = await getAuth();
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
        throw new Error('Not authenticated');
    }
    return session.user.id;
}

export async function getQuote(symbol: string): Promise<Quote | null> {
    await requireUserId();
    const result = await marketData.getQuote(symbol);
    return result.ok ? result.data : null;
}

export async function getCompanyProfile(symbol: string) {
    await requireUserId();
    const result = await marketData.getCompanyProfile(symbol);
    return result.ok ? result.data : null;
}

export async function getWatchlistData(symbols: string[]) {
    await requireUserId();
    return marketData.getQuotesForSymbols(symbols);
}

export async function getNews(symbols?: string[]): Promise<MarketNewsArticle[]> {
    await requireUserId();
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
    await requireUserId();
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
