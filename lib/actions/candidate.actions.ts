'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { getAuth } from '@/lib/better-auth/auth';
import { connectToDatabase } from '@/database/mongoose';
import { Candidate, type CandidateStatus } from '@/database/models/candidate.model';
import { buildAndSaveCandidateSnapshot, type SaveCandidateOutcome } from '@/lib/candidates/buildAndSaveCandidateSnapshot';
import type { SerializedCandidate } from '@/lib/candidates/types';

async function requireUserId(): Promise<string> {
    const auth = await getAuth();
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
        throw new Error('Not authenticated');
    }
    return session.user.id;
}

/** Saves an immutable candidate snapshot for a symbol — see
 * lib/candidates/buildAndSaveCandidateSnapshot.ts for the actual logic. */
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
