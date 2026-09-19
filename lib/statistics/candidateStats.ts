import type { CandidateStatus } from '@/database/models/candidate.model';
import { mean, median, rate } from '@/lib/statistics/math';

/** The subset of a (serialized) Candidate this module actually needs —
 * decoupled from the full document/DTO shape so it's trivial to construct
 * fixtures in tests. */
export interface CandidateForStats {
    score: number;
    status: CandidateStatus;
    price: number;
    stopLevel?: number;
    targets?: number[];
    riskReward?: number;
    maxFavorableExcursion?: number;
    maxAdverseExcursion?: number;
}

/** A candidate only has a knowable outcome once it's stopped moving —
 * ACTIVE hasn't finished its story yet, and CANCELLED means the owner
 * abandoned it before it could play out, so neither belongs in an
 * outcome-rate or return statistic (see docs/statistics.md). */
const RESOLVED_STATUSES: CandidateStatus[] = ['TARGET_1_HIT', 'TARGET_2_HIT', 'STOP_HIT', 'EXPIRED', 'AMBIGUOUS'];

export function isResolvedStatus(status: CandidateStatus): boolean {
    return RESOLVED_STATUSES.includes(status);
}

/**
 * The R-multiple a candidate would have realized IF traded exactly as
 * planned (entry at the recorded signal price, full size, no slippage/fees)
 * — distinct from a Trade's realized R-multiple, which reflects what the
 * owner actually did. Null whenever that number isn't well-defined:
 * - EXPIRED: there was no exit, so no return exists to compute.
 * - AMBIGUOUS: daily OHLC couldn't reveal which of stop/target hit first.
 * - No stop recorded, or stop equals price (undefined unit of risk).
 * STOP_HIT is always exactly -1 by construction (every implemented setup
 * requires price > stopLevel, so (stopLevel-price)/(price-stopLevel) = -1).
 */
export function computeRealizedR(candidate: CandidateForStats): number | null {
    const { status, price, stopLevel, targets } = candidate;
    if (stopLevel === undefined || price === stopLevel) return null;
    const riskPerShare = price - stopLevel;

    switch (status) {
        case 'STOP_HIT':
            return (stopLevel - price) / riskPerShare;
        case 'TARGET_1_HIT':
            return targets?.[0] !== undefined ? (targets[0] - price) / riskPerShare : null;
        case 'TARGET_2_HIT':
            return targets?.[1] !== undefined ? (targets[1] - price) / riskPerShare : null;
        default:
            return null;
    }
}

export interface BucketDefinition {
    label: string;
    /** Inclusive lower bound. */
    min: number;
    /** Exclusive upper bound (use Infinity for an open-ended top bucket). */
    max: number;
}

/** Configurable — pass a custom array to computeScoreBucketStats instead of
 * relying on this default if a different granularity is useful later. */
export const DEFAULT_SCORE_BUCKETS: BucketDefinition[] = [
    { label: '60-64', min: 60, max: 65 },
    { label: '65-69', min: 65, max: 70 },
    { label: '70-74', min: 70, max: 75 },
    { label: '75-79', min: 75, max: 80 },
    { label: '80-84', min: 80, max: 85 },
    { label: '85-89', min: 85, max: 90 },
    { label: '90+', min: 90, max: Infinity },
];

export interface BucketStats {
    label: string;
    /** Count of RESOLVED candidates in this bucket — every rate/return
     * figure below is computed over exactly this population, never a
     * differently-filtered one, so a single n applies to the whole row. */
    n: number;
    target1PlusRate: number | null;
    target2Rate: number | null;
    stopRate: number | null;
    ambiguousRate: number | null;
    expiredRate: number | null;
    medianRealizedR: number | null;
    avgPlannedRiskReward: number | null;
    avgMaxFavorableExcursion: number | null;
    avgMaxAdverseExcursion: number | null;
}

function statsForGroup(label: string, resolved: CandidateForStats[]): BucketStats {
    const n = resolved.length;
    const count = (status: CandidateStatus) => resolved.filter((c) => c.status === status).length;
    const target1Plus = count('TARGET_1_HIT') + count('TARGET_2_HIT');

    const realizedRs = resolved.map(computeRealizedR).filter((r): r is number => r !== null);
    const plannedRRs = resolved.map((c) => c.riskReward).filter((r): r is number => r !== undefined);
    const mfes = resolved.map((c) => c.maxFavorableExcursion).filter((v): v is number => v !== undefined);
    const maes = resolved.map((c) => c.maxAdverseExcursion).filter((v): v is number => v !== undefined);

    return {
        label,
        n,
        target1PlusRate: rate(target1Plus, n),
        target2Rate: rate(count('TARGET_2_HIT'), n),
        stopRate: rate(count('STOP_HIT'), n),
        ambiguousRate: rate(count('AMBIGUOUS'), n),
        expiredRate: rate(count('EXPIRED'), n),
        medianRealizedR: median(realizedRs),
        avgPlannedRiskReward: mean(plannedRRs),
        avgMaxFavorableExcursion: mean(mfes),
        avgMaxAdverseExcursion: mean(maes),
    };
}

/**
 * Buckets RESOLVED candidates by score and reports outcome rates/returns per
 * bucket — deliberately makes no assumption that a higher score implies a
 * better outcome; that's exactly the question this table lets the data
 * answer (see docs/statistics.md). Buckets with n=0 are still returned (not
 * hidden) so a sparse bucket is visibly sparse rather than silently absent.
 */
export function computeScoreBucketStats(candidates: CandidateForStats[], buckets: BucketDefinition[] = DEFAULT_SCORE_BUCKETS): BucketStats[] {
    const resolved = candidates.filter((c) => isResolvedStatus(c.status));
    return buckets.map((bucket) => statsForGroup(bucket.label, resolved.filter((c) => c.score >= bucket.min && c.score < bucket.max)));
}

export interface OverallCandidateStats {
    totalSaved: number;
    activeCount: number;
    cancelledCount: number;
    resolvedCount: number;
    targetHitRate: number | null;
    stopHitRate: number | null;
    ambiguousRate: number | null;
    expiredRate: number | null;
    medianRealizedR: number | null;
}

export function computeOverallCandidateStats(candidates: CandidateForStats[]): OverallCandidateStats {
    const resolved = candidates.filter((c) => isResolvedStatus(c.status));
    const n = resolved.length;
    const count = (status: CandidateStatus) => resolved.filter((c) => c.status === status).length;
    const targetHits = count('TARGET_1_HIT') + count('TARGET_2_HIT');
    const realizedRs = resolved.map(computeRealizedR).filter((r): r is number => r !== null);

    return {
        totalSaved: candidates.length,
        activeCount: candidates.filter((c) => c.status === 'ACTIVE').length,
        cancelledCount: candidates.filter((c) => c.status === 'CANCELLED').length,
        resolvedCount: n,
        targetHitRate: rate(targetHits, n),
        stopHitRate: rate(count('STOP_HIT'), n),
        ambiguousRate: rate(count('AMBIGUOUS'), n),
        expiredRate: rate(count('EXPIRED'), n),
        medianRealizedR: median(realizedRs),
    };
}
