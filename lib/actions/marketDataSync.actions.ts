'use server';

import { headers } from 'next/headers';
import { getAuth } from '@/lib/better-auth/auth';
import { listRecentSyncRuns, runMarketDataSyncBatch, startMarketDataSync, type MarketDataSyncProgress } from '@/lib/market-data/sync/syncService';
import { getMarketFreshness, type MarketFreshness } from '@/lib/market-data/sync/freshness';
import { connectToDatabase } from '@/database/mongoose';
import { MarketBar } from '@/database/models/marketBar.model';
import { DailyAnalysisSnapshot } from '@/database/models/dailyAnalysisSnapshot.model';
import { Candidate } from '@/database/models/candidate.model';
import { BacktestRun } from '@/database/models/backtestRun.model';
import { ScannerRun } from '@/database/models/scannerRun.model';

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


/** One-time/maintenance repair for BIST research data. This intentionally
 * removes only derived research artifacts that were produced from BIST
 * market bars; executed Trade journal records are never touched. */
export async function rebuildBistDailyData(): Promise<{
    runId: string;
    deleted: { bars: number; snapshots: number; candidates: number; backtests: number; scannerRuns: number };
}> {
    const userId = await requireUserId();
    await connectToDatabase();

    const [bars, snapshots, candidates, backtests, scannerRuns] = await Promise.all([
        MarketBar.deleteMany({ market: 'TR', timeframe: 'D' }),
        DailyAnalysisSnapshot.deleteMany({ market: 'TR' }),
        Candidate.deleteMany({ userId, market: 'TR' }),
        BacktestRun.deleteMany({ userId, universeId: /^bist-/i }),
        ScannerRun.deleteMany({ userId, universeId: /^bist-/i }),
    ]);

    const { runId } = await startMarketDataSync({ userId, market: 'TR', forceRefresh: true });
    return {
        runId,
        deleted: {
            bars: bars.deletedCount ?? 0,
            snapshots: snapshots.deletedCount ?? 0,
            candidates: candidates.deletedCount ?? 0,
            backtests: backtests.deletedCount ?? 0,
            scannerRuns: scannerRuns.deletedCount ?? 0,
        },
    };
}
