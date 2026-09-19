import { connectToDatabase } from '@/database/mongoose';
import { Candidate } from '@/database/models/candidate.model';
import { getBarsOrFetch } from '@/lib/market-data/historicalDataRepository';
import { resolveInstrument } from '@/lib/market-data/instruments/resolve';
import { createConcurrencyLimiter } from '@/lib/concurrencyLimiter';
import { calculateExcursion } from '@/lib/trades/excursion';
import { evaluateCandidateOutcome } from './outcome';

export interface ActiveCandidateRecord {
    _id: unknown;
    symbol: string;
    signalAt: string | Date;
    price: number;
    stopLevel?: number;
    targets?: number[];
}

export interface UpdateOutcomesResult {
    updated: number;
    failed: number;
}

/**
 * Walks every ACTIVE candidate forward through daily bars since its signal
 * to see whether its target(s) or stop have since been hit — see
 * lib/candidates/outcome.ts for the (deterministic, no-look-ahead)
 * detection logic and docs/candidates.md for the lifecycle this writes.
 *
 * Reads through the local market-data database (see
 * docs/daily-data-engine.md's "local-first" principle) instead of calling a
 * market-data provider for every candidate on every run — a symbol that has
 * never been seeded gets a one-time live-provider fallback (see
 * historicalDataRepository.ts::getBarsOrFetch), not a repeated one.
 */
export async function updateActiveCandidateOutcomes(candidates: ActiveCandidateRecord[]): Promise<UpdateOutcomesResult> {
    await connectToDatabase();

    const limit = createConcurrencyLimiter(4);
    let updated = 0;
    let failed = 0;

    await Promise.all(
        candidates.map((candidate) =>
            limit(async () => {
                try {
                    const instrument = resolveInstrument(candidate.symbol);
                    const signalDateStr = new Date(candidate.signalAt).toISOString().slice(0, 10);
                    // Only the signal date onward is relevant — the query
                    // includes that date itself (inclusive `from`) so the
                    // filter below can still correctly exclude it.
                    const bars = await getBarsOrFetch(instrument, { from: signalDateStr });
                    if (bars.length === 0) return;

                    const barsAfterSignal = bars.filter((b) => b.time > signalDateStr);

                    const outcome = evaluateCandidateOutcome({
                        stopLevel: candidate.stopLevel,
                        targets: candidate.targets,
                        barsAfterSignal,
                    });

                    if (outcome.status !== 'ACTIVE') {
                        // Same bars already fetched for the outcome check — MFE/MAE is a
                        // free byproduct, computed once at resolution and never updated
                        // again (see docs/candidates.md, docs/statistics.md). Every
                        // implemented setup is long-only.
                        const excursion = calculateExcursion({ direction: 'LONG', entryPrice: candidate.price, bars: barsAfterSignal });
                        await Candidate.findByIdAndUpdate(candidate._id, {
                            $set: {
                                ...outcome,
                                maxFavorableExcursion: excursion.maxFavorableExcursion,
                                maxAdverseExcursion: excursion.maxAdverseExcursion,
                            },
                        });
                        updated++;
                        console.log(`📈 Candidate ${candidate.symbol} (${candidate._id}) resolved: ${outcome.status}`);
                    }
                } catch (error) {
                    failed++;
                    console.error(`Failed to evaluate outcome for candidate ${candidate._id} (${candidate.symbol})`, error);
                }
            }),
        ),
    );

    return { updated, failed };
}
