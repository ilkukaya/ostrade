'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { getAuth } from '@/lib/better-auth/auth';
import { connectToDatabase } from '@/database/mongoose';
import { Candidate, buildCandidateSnapshot, type CandidateStatus } from '@/database/models/candidate.model';
import { getHistoricalPrices } from '@/lib/market-data/service';
import { describeMarketDataError } from '@/lib/market-data/types';
import { analyzeSwingSetupDetailed } from '@/lib/swing/analyze';
import type { SerializedCandidate } from '@/lib/candidates/types';

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
 * Saves an immutable candidate snapshot for a symbol. Always re-runs the
 * analysis fresh at the moment of saving (rather than trusting a
 * possibly-stale cached scanner result) — that fresh computation IS the
 * signal time being recorded. See database/models/candidate.model.ts for
 * why nothing about this document is ever recomputed afterwards.
 */
export async function saveCandidate(symbol: string): Promise<SaveCandidateOutcome> {
    const userId = await requireUserId();

    const barsResult = await getHistoricalPrices(symbol, 'D');
    if (!barsResult.ok) {
        return { success: false, error: describeMarketDataError(barsResult.error) };
    }

    const detailed = analyzeSwingSetupDetailed(symbol, barsResult.data);
    if (!detailed) {
        return { success: false, error: 'No historical data available for this symbol.' };
    }

    await connectToDatabase();
    const doc = await Candidate.create(
        buildCandidateSnapshot({ userId, analysis: detailed.result, snapshot: detailed.snapshot }),
    );

    revalidatePath('/candidates');
    return { success: true, candidateId: String(doc._id) };
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
