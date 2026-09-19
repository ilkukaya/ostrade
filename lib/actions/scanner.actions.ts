'use server';

import { headers } from 'next/headers';
import { getAuth } from '@/lib/better-auth/auth';
import { runScannerBatch } from '@/lib/scanner/service';
import { listUniverseOptions } from '@/lib/market-data/universe';
import type { ScannerProgress } from '@/lib/scanner/types';

async function requireUserId(): Promise<string> {
    const auth = await getAuth();
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
        throw new Error('Not authenticated');
    }
    return session.user.id;
}

export interface ScanUniverseParams {
    universeId: string;
    forceRefresh?: boolean;
}

/**
 * Advances a scan by one batch (see lib/scanner/service.ts). The client is
 * expected to call this repeatedly — each call is cheap and bounded, so
 * polling it is the "simplest robust alternative" to streaming progress on
 * Netlify's serverless functions (see docs/scanner.md).
 *
 * userId always comes from the current session, never from the client —
 * a scan is always scoped to whoever is actually signed in.
 */
export async function scanUniverse(params: ScanUniverseParams): Promise<ScannerProgress> {
    const userId = await requireUserId();
    return runScannerBatch({ userId, universeId: params.universeId, forceRefresh: params.forceRefresh });
}

export async function getUniverseOptions() {
    return listUniverseOptions();
}
