'use server';

import { headers } from 'next/headers';
import { getAuth } from '@/lib/better-auth/auth';
import { listRecentSyncRuns, runMarketDataSyncBatch, startMarketDataSync, type MarketDataSyncProgress } from '@/lib/market-data/sync/syncService';
import { getMarketFreshness, type MarketFreshness } from '@/lib/market-data/sync/freshness';

async function requireUserId(): Promise<string> {
    const auth = await getAuth();
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
        throw new Error('Not authenticated');
    }
    return session.user.id;
}

/** Every data-sync/admin action requires the owner's own authenticated
 * session server-side — never assume a hidden UI route is protection on
 * its own (see docs/daily-data-engine.md's "Data admin safety" section). */
export async function startSync(market: string, forceRefresh = false): Promise<{ runId: string }> {
    const userId = await requireUserId();
    return startMarketDataSync({ userId, market, forceRefresh });
}

export async function advanceSync(runId: string): Promise<MarketDataSyncProgress> {
    const userId = await requireUserId();
    return runMarketDataSyncBatch({ runId, userId });
}

export async function getFreshness(market: string): Promise<MarketFreshness> {
    await requireUserId();
    return getMarketFreshness(market);
}

export async function getSyncHistory(market?: string): Promise<MarketDataSyncProgress[]> {
    const userId = await requireUserId();
    return listRecentSyncRuns(userId, market);
}
