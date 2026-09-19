import type { PriceZone, RuleResult, SetupType, SwingStatus } from '@/lib/swing/types';
import type { CandidateIndicatorSnapshot, CandidateStatus } from '@/database/models/candidate.model';

/**
 * The client-facing shape of a Candidate document — plain data (dates as
 * ISO strings, `_id` as a string) after `JSON.parse(JSON.stringify(...))`,
 * never the Mongoose Document itself. Client components should only ever
 * import this, never anything from database/models/*.
 */
export interface SerializedCandidate {
    _id: string;
    userId: string;
    symbol: string;
    exchange?: string;
    market?: string;

    signalAt: string;

    strategyId: string;
    strategyVersion: string;

    setupType?: SetupType;
    price: number;

    score: number;
    maxScore: number;
    analysisStatus: SwingStatus;
    rules: RuleResult[];

    entryZone?: PriceZone;
    stopLevel?: number;
    targets?: number[];
    riskReward?: number;

    supportLevels?: PriceZone[];
    resistanceLevels?: PriceZone[];
    warnings?: string[];

    indicatorSnapshot: CandidateIndicatorSnapshot;

    status: CandidateStatus;
    firstTargetHitAt?: string;
    secondTargetHitAt?: string;
    stopHitAt?: string;
    closedAt?: string;
    outcomeNotes?: string;

    maxFavorableExcursion?: number;
    maxAdverseExcursion?: number;

    createdAt: string;
}

export const CLOSED_CANDIDATE_STATUSES: CandidateStatus[] = [
    'TARGET_1_HIT',
    'TARGET_2_HIT',
    'STOP_HIT',
    'EXPIRED',
    'CANCELLED',
    'AMBIGUOUS',
];

export function isClosedStatus(status: CandidateStatus): boolean {
    return CLOSED_CANDIDATE_STATUSES.includes(status);
}
