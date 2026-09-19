'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { getAuth } from '@/lib/better-auth/auth';
import { connectToDatabase } from '@/database/mongoose';
import { Candidate, buildCandidateSnapshot, type CandidateStatus } from '@/database/models/candidate.model';
import { getBarsOrFetch } from '@/lib/market-data/historicalDataRepository';
import { resolveInstrument } from '@/lib/market-data/instruments/resolve';
import { analyzeSwingSetupDetailed } from '@/lib/swing/analyze';
import type { SerializedCandidate } from '@/lib/candidates/types';

/** Same window as the scanner/stock page (see lib/scanner/service.ts's
 * SCAN_BARS_LIMIT) — enough for every indicator the swing engine computes,
 * read locally-first rather than from a live provider, so a saved
 * candidate's snapshot is computed from the SAME stored bars the scanner
 * row that led to it was (see docs/daily-data-engine.md's "SAME DATA +
 * SAME STRATEGY = SAME RESULT"). */
const SAVE_CANDIDATE_BARS_LIMIT = 300;

async function requireUserId(): Promise<string> {
    const auth = await getAuth();
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
        throw new Error('Not authenticated');
    }
    return session.user.id;
}

export type SaveCandidateOutcome = { success: true; candidateId: string } | { success: false; error: string };

/**
 * The auth-free core of saveCandidate — split out so its local-first data
 * sourcing is directly unit-testable without needing to mock the Better
 * Auth session machinery (see __tests__/candidate.actions.test.ts). Always
 * re-runs the analysis fresh at the moment of saving (rather than trusting
 * a possibly-stale cached scanner result) — that fresh computation IS the
 * signal time being recorded. "Fresh" means read fresh from the local
 * market-data database (see docs/daily-data-engine.md's "local-first"
 * principle), not a live provider call bypassing it — the same stored bars
 * the scanner/stock page just displayed, not a second, potentially
 * different fetch. See database/models/candidate.model.ts for why nothing
 * about this document is ever recomputed afterwards.
 */
export async function buildAndSaveCandidateSnapshot(userId: string, symbol: string): Promise<SaveCandidateOutcome> {
    const instrument = resolveInstrument(symbol);
    const bars = await getBarsOrFetch(instrument, { limit: SAVE_CANDIDATE_BARS_LIMIT });

    const detailed = analyzeSwingSetupDetailed(instrument.symbol, bars);
    if (!detailed) {
        return { success: false, error: 'No historical data available for this symbol.' };
    }

    await connectToDatabase();
    const doc = await Candidate.create(
        buildCandidateSnapshot({ userId, analysis: detailed.result, snapshot: detailed.snapshot }),
    );

    return { success: true, candidateId: String(doc._id) };
}

/** Saves an immutable candidate snapshot for a symbol — see
 * buildAndSaveCandidateSnapshot above for the actual logic. */
export async function saveCandidate(symbol: string): Promise<SaveCandidateOutcome> {
    const userId = await requireUserId();
    const result = await buildAndSaveCandidateSnapshot(userId, symbol);
    if (result.success) revalidatePath('/candidates');
    return result;
}

export interface ListCandidatesParams {
    status?: CandidateStatus | 'ALL';
    setupType?: string;
}

export async function listCandidates(params: ListCandidatesParams = {}): Promise<SerializedCandidate[]> {
    const userId = await requireUserId();
    await connectToDatabase();

    const query: Record<string, unknown> = { userId };
    if (params.status && params.status !== 'ALL') query.status = params.status;
    if (params.setupType && params.setupType !== 'ALL') query.setupType = params.setupType;

    const candidates = await Candidate.find(query).sort({ signalAt: -1 }).lean();
    return JSON.parse(JSON.stringify(candidates));
}

export async function getCandidateById(candidateId: string) {
    const userId = await requireUserId();
    await connectToDatabase();

    const candidate = await Candidate.findOne({ _id: candidateId, userId }).lean();
    return candidate ? JSON.parse(JSON.stringify(candidate)) : null;
}

export async function cancelCandidate(candidateId: string): Promise<{ success: boolean }> {
    const userId = await requireUserId();
    await connectToDatabase();

    await Candidate.findOneAndUpdate(
        { _id: candidateId, userId, status: 'ACTIVE' },
        { $set: { status: 'CANCELLED', closedAt: new Date() } },
    );

    revalidatePath('/candidates');
    return { success: true };
}
