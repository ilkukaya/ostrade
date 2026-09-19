'use server';

import { headers } from 'next/headers';
import { getAuth } from '@/lib/better-auth/auth';
import { getDailyReview, type DailyReviewData } from '@/lib/analysis/dailyReview';
import { getWeeklyReview, getWeeklyCandidateOutcomeChanges, type WeeklyReviewData, type WeeklyCandidateOutcomeChange } from '@/lib/analysis/weeklyReview';
import { getMarketFreshness, type MarketFreshness } from '@/lib/market-data/sync/freshness';
import { getUserWatchlist } from '@/lib/actions/watchlist.actions';
import { resolveInstrument } from '@/lib/market-data/instruments/resolve';
import { DailyAnalysisSnapshot } from '@/database/models/dailyAnalysisSnapshot.model';
import { connectToDatabase } from '@/database/mongoose';

async function requireUserId(): Promise<string> {
    const auth = await getAuth();
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
        throw new Error('Not authenticated');
    }
    return session.user.id;
}

export async function getDailyReviewForMarket(market: string, universeId?: string): Promise<DailyReviewData> {
    await requireUserId();
    return getDailyReview({ market, universeId });
}

export async function getWeeklyReviewForMarket(market: string, universeId?: string): Promise<WeeklyReviewData> {
    await requireUserId();
    return getWeeklyReview({ market, universeId });
}

export async function getWeeklyCandidateChanges(sinceDate: string): Promise<WeeklyCandidateOutcomeChange[]> {
    const userId = await requireUserId();
    return getWeeklyCandidateOutcomeChanges(userId, sinceDate);
}

export interface DashboardResearchPulse {
    freshness: Record<string, MarketFreshness>;
    dailyReview: Record<string, DailyReviewData>;
}

/** What the main dashboard's "research pulse" card needs, for every market
 * in one call — see docs/scanner.md's dashboard layout. */
export async function getDashboardResearchPulse(): Promise<DashboardResearchPulse> {
    await requireUserId();
    const markets = ['US', 'TR'];
    const [freshnessList, reviewList] = await Promise.all([
        Promise.all(markets.map((m) => getMarketFreshness(m))),
        Promise.all(markets.map((m) => getDailyReview({ market: m }))),
    ]);

    return {
        freshness: Object.fromEntries(markets.map((m, i) => [m, freshnessList[i]])),
        dailyReview: Object.fromEntries(markets.map((m, i) => [m, reviewList[i]])),
    };
}

export interface WatchlistChangeSummary {
    symbol: string;
    /** null when this symbol has no daily-analysis snapshot for today yet
     * — never fabricated (see docs/daily-data-engine.md). Most likely
     * because it isn't part of any tracked static universe, so the shared
     * snapshot job never covers it. */
    classification: DailyReviewData['rows'][number]['changeClassification'] | null;
    scoreChange: number | null;
}

/** For the dashboard's "Watchlist Changes" section: the user's Custom
 * Watchlist symbols, matched against today's DailyAnalysisSnapshot where one
 * exists. A watchlist symbol that isn't part of any tracked static universe
 * has no shared snapshot to match — reported as `classification: null`
 * rather than silently omitted or guessed at. */
export async function getWatchlistChangeSummary(): Promise<WatchlistChangeSummary[]> {
    await requireUserId();
    await connectToDatabase();

    const watchlist: Array<{ symbol: string }> = await getUserWatchlist();
    if (watchlist.length === 0) return [];

    const bySymbolMarket = new Map<string, { symbol: string; market: string }>();
    for (const item of watchlist) {
        const instrument = resolveInstrument(item.symbol);
        bySymbolMarket.set(instrument.symbol, { symbol: instrument.symbol, market: instrument.market ?? 'US' });
    }

    const results = await Promise.all(
        Array.from(bySymbolMarket.values()).map(async ({ symbol, market }) => {
            const latest = await DailyAnalysisSnapshot.findOne({ symbol, market }).sort({ marketDate: -1 }).lean();
            return {
                symbol,
                classification: latest?.changeClassification ?? null,
                scoreChange: latest?.scoreChange ?? null,
            } as WatchlistChangeSummary;
        }),
    );

    return results;
}
