import { connectToDatabase } from '@/database/mongoose';
import { Candidate, buildCandidateSnapshot } from '@/database/models/candidate.model';
import { getBarsOrFetch } from '@/lib/market-data/historicalDataRepository';
import { resolveInstrument } from '@/lib/market-data/instruments/resolve';
import { analyzeSwingSetupDetailed } from '@/lib/swing/analyze';

/** Same window as the scanner/stock page (see lib/scanner/service.ts's
 * SCAN_BARS_LIMIT) — enough for every indicator the swing engine computes,
 * read locally-first rather than from a live provider, so a saved
 * candidate's snapshot is computed from the SAME stored bars the scanner
 * row that led to it was (see docs/daily-data-engine.md's "SAME DATA +
 * SAME STRATEGY = SAME RESULT"). */
const SAVE_CANDIDATE_BARS_LIMIT = 300;

export type SaveCandidateOutcome = { success: true; candidateId: string } | { success: false; error: string };

/**
 * The auth-free core of saveCandidate — deliberately kept in a plain,
 * non-'use server' module (not lib/actions/candidate.actions.ts) so it is
 * NOT independently invokable as its own Server Action HTTP endpoint (every
 * exported function in a 'use server' file is, regardless of whether
 * anything else calls it — confirmed against
 * .next/server/server-reference-manifest.json). saveCandidate is the only
 * caller and is the one that must stay auth-checked; this also keeps the
 * function directly unit-testable without mocking the Better Auth session
 * machinery (see __tests__/candidate.actions.test.ts). Always re-runs the
 * analysis fresh at the moment of saving (rather than trusting a possibly-
 * stale cached scanner result) — that fresh computation IS the signal time
 * being recorded. "Fresh" means read fresh from the local market-data
 * database (see docs/daily-data-engine.md's "local-first" principle), not a
 * live provider call bypassing it — the same stored bars the scanner/stock
 * page just displayed, not a second, potentially different fetch. See
 * database/models/candidate.model.ts for why nothing about this document is
 * ever recomputed afterwards.
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
