import type { SwingStatus } from '@/lib/swing/types';

/**
 * How a symbol's swing-analysis outcome changed from its most recent prior
 * observation to today's — purely descriptive research context, NEVER a
 * buy/sell instruction (see docs/daily-data-engine.md). `setupType` plays no
 * part in this: today only BREAKOUT exists and every result carries it
 * regardless of status, so the only meaningful axes are `status`
 * (PASS/WATCH/QUALIFIED) and `score`.
 */
export type DailyChangeClassification =
    | 'NEW_SETUP'
    | 'NEWLY_QUALIFIED'
    | 'SCORE_IMPROVED'
    | 'SCORE_DETERIORATED'
    | 'LOST_QUALIFICATION'
    | 'SETUP_INVALIDATED'
    | 'NO_MATERIAL_CHANGE';

export interface DailySnapshotComparable {
    status: SwingStatus;
    score: number;
}

/** A same-status score move smaller than this is treated as noise, not a
 * change worth surfacing — see docs/daily-data-engine.md. Tunable per
 * caller; the default is a reasonable starting point, not a tuned constant. */
export const DEFAULT_SCORE_CHANGE_THRESHOLD = 5;

/**
 * Classifies today's observation against the most recent PRIOR one for the
 * same instrument+strategy version (or `null` if this is the first time this
 * instrument has ever been observed). Status (PASS = no actionable setup,
 * WATCH = forming, QUALIFIED = every rule passed) is the primary axis;
 * score only matters once status is held constant on both sides. Exhaustive
 * over every (previous, current) status pair — see docs/daily-data-engine.md
 * for the full decision table this implements.
 */
export function classifyDailyChange(
    previous: DailySnapshotComparable | null,
    current: DailySnapshotComparable,
    scoreChangeThreshold: number = DEFAULT_SCORE_CHANGE_THRESHOLD,
): DailyChangeClassification {
    if (previous === null) {
        return current.status === 'PASS' ? 'NO_MATERIAL_CHANGE' : 'NEW_SETUP';
    }

    if (previous.status === 'PASS' && current.status !== 'PASS') return 'NEW_SETUP';
    if (previous.status !== 'PASS' && current.status === 'PASS') return 'SETUP_INVALIDATED';
    if (previous.status === 'PASS' && current.status === 'PASS') return 'NO_MATERIAL_CHANGE';

    // From here, both previous and current are WATCH or QUALIFIED.
    if (previous.status !== 'QUALIFIED' && current.status === 'QUALIFIED') return 'NEWLY_QUALIFIED';
    if (previous.status === 'QUALIFIED' && current.status !== 'QUALIFIED') return 'LOST_QUALIFICATION';

    // Same status on both sides (WATCH->WATCH or QUALIFIED->QUALIFIED) —
    // the only remaining axis is how much the score moved.
    const delta = current.score - previous.score;
    if (delta >= scoreChangeThreshold) return 'SCORE_IMPROVED';
    if (-delta >= scoreChangeThreshold) return 'SCORE_DETERIORATED';
    return 'NO_MATERIAL_CHANGE';
}
