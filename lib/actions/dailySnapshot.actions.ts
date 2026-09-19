'use server';

import { headers } from 'next/headers';
import { getAuth } from '@/lib/better-auth/auth';
import { generateDailySnapshots, type GenerateDailySnapshotsResult } from '@/lib/analysis/dailySnapshotService';

async function requireUserId(): Promise<void> {
    const auth = await getAuth();
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
        throw new Error('Not authenticated');
    }
}

/** Owner-authenticated trigger for daily-analysis-snapshot generation — see
 * docs/daily-data-engine.md's "Data admin safety": never assume a hidden UI
 * route is protection on its own. */
export async function runDailySnapshotGeneration(market: string): Promise<GenerateDailySnapshotsResult> {
    await requireUserId();
    return generateDailySnapshots({ market });
}
