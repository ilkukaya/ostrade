import type { OhlcBar } from '@/lib/technical/types';
import type { CandidateStatus } from '@/database/models/candidate.model';

export interface CandidateOutcomeInput {
    stopLevel?: number;
    targets?: number[];
    /** Bars strictly AFTER the signal date, in chronological order. The
     * signal day itself is excluded — the trade plan was only known as of
     * that day's close, so the earliest an entry could have happened is
     * the next bar; including the signal bar itself would be look-ahead
     * bias. */
    barsAfterSignal: OhlcBar[];
    /** Trading days (bars) without a resolution after which a candidate is
     * considered EXPIRED rather than left ACTIVE forever. Default matches
     * a reasonable swing-trade holding-period ceiling; override for
     * shorter/longer strategies. */
    maxHoldingDays?: number;
}

export interface CandidateOutcome {
    status: CandidateStatus;
    firstTargetHitAt?: string;
    secondTargetHitAt?: string;
    stopHitAt?: string;
    closedAt?: string;
    outcomeNotes?: string;
}

const DEFAULT_MAX_HOLDING_DAYS = 60;

/**
 * Determines what happened to a candidate's trade plan since it was
 * signaled — chronologically, using only bars that existed after the
 * signal (never the signal bar itself, never anything from "the future"
 * relative to whatever bar is being evaluated).
 *
 * Only long/bullish setups are modeled today (targets above the stop) —
 * the only setup implemented (BREAKOUT) is always long; this will need a
 * `direction` parameter once a short-biased setup exists.
 *
 * OHLC ambiguity is handled explicitly rather than guessed at: a bar whose
 * high/low range touches both the stop and Target 1 is AMBIGUOUS, not
 * resolved in whichever direction happens to look better. See
 * docs/candidates.md.
 */
export function evaluateCandidateOutcome(input: CandidateOutcomeInput): CandidateOutcome {
    const { stopLevel, targets, barsAfterSignal } = input;
    const target1 = targets?.[0];
    const target2 = targets?.[1];

    // Can't evaluate an outcome without a trade plan to measure against —
    // report ACTIVE rather than inventing a result.
    if (stopLevel === undefined || target1 === undefined) {
        return { status: 'ACTIVE' };
    }

    let firstTargetHitAt: string | undefined;

    for (const bar of barsAfterSignal) {
        const hitsStop = bar.low <= stopLevel;
        const hitsTarget1 = bar.high >= target1;

        if (!firstTargetHitAt) {
            if (hitsStop && hitsTarget1) {
                return {
                    status: 'AMBIGUOUS',
                    closedAt: bar.time,
                    outcomeNotes: `Bar on ${bar.time} touched both the stop (${stopLevel}) and Target 1 (${target1}) — daily OHLC cannot reveal which happened first.`,
                };
            }
            if (hitsStop) {
                return { status: 'STOP_HIT', stopHitAt: bar.time, closedAt: bar.time };
            }
            if (hitsTarget1) {
                firstTargetHitAt = bar.time;
                if (target2 !== undefined && bar.high >= target2) {
                    // Same bar cleared target2 too — unambiguous, since
                    // target2 > target1 in the same direction.
                    return { status: 'TARGET_2_HIT', firstTargetHitAt, secondTargetHitAt: bar.time, closedAt: bar.time };
                }
            }
            continue;
        }

        // Target 1 already hit on an earlier bar — from here we only look
        // for Target 2. The original stop is not re-checked afterward
        // (that would require modeling a trailing-stop/partial-exit policy
        // this system doesn't claim to simulate — see docs/candidates.md).
        if (target2 !== undefined && bar.high >= target2) {
            return { status: 'TARGET_2_HIT', firstTargetHitAt, secondTargetHitAt: bar.time, closedAt: bar.time };
        }
    }

    if (firstTargetHitAt) {
        return { status: 'TARGET_1_HIT', firstTargetHitAt };
    }

    const maxHoldingDays = input.maxHoldingDays ?? DEFAULT_MAX_HOLDING_DAYS;
    if (barsAfterSignal.length >= maxHoldingDays) {
        const lastBar = barsAfterSignal[barsAfterSignal.length - 1];
        return { status: 'EXPIRED', closedAt: lastBar.time };
    }

    return { status: 'ACTIVE' };
}
