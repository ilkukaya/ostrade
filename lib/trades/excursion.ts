import type { OhlcBar } from '@/lib/technical/types';
import type { TradeDirection } from '@/lib/trades/types';

export interface ExcursionInput {
    direction: TradeDirection;
    entryPrice: number;
    /** Bars from the entry date (inclusive — the entry already happened
     * during that session, so its own high/low are part of the trade's
     * excursion) through the exit date (inclusive) or the most recent
     * available bar for a still-open trade. Chronological order. */
    bars: OhlcBar[];
}

export interface ExcursionResult {
    /** Maximum Favorable Excursion: the best unrealized move in the trade's
     * favor at any point, as a price distance (never negative — clamped to
     * 0 if price never moved favorably). For a long, this is the largest
     * (bar.high - entryPrice) seen; for a short, the largest
     * (entryPrice - bar.low). */
    maxFavorableExcursion: number;
    /** Maximum Adverse Excursion: the worst unrealized move against the
     * trade at any point, as a positive price distance (never negative —
     * clamped to 0 if price never moved adverse). For a long, the largest
     * (entryPrice - bar.low) seen; for a short, the largest
     * (bar.high - entryPrice). */
    maxAdverseExcursion: number;
    mfeAt?: string;
    maeAt?: string;
}

/**
 * Computes MFE/MAE from raw daily bars. Deliberately simple and documented
 * rather than implicit (see docs/journal.md): both are measured from each
 * bar's high/low, independent of whether the trade ultimately won or lost —
 * useful for judging whether a stop/target was well-placed regardless of
 * the outcome.
 */
export function calculateExcursion(input: ExcursionInput): ExcursionResult {
    const { direction, entryPrice, bars } = input;

    let maxFavorableExcursion = 0;
    let maxAdverseExcursion = 0;
    let mfeAt: string | undefined;
    let maeAt: string | undefined;

    for (const bar of bars) {
        const favorable = direction === 'LONG' ? bar.high - entryPrice : entryPrice - bar.low;
        const adverse = direction === 'LONG' ? entryPrice - bar.low : bar.high - entryPrice;

        if (favorable > maxFavorableExcursion) {
            maxFavorableExcursion = favorable;
            mfeAt = bar.time;
        }
        if (adverse > maxAdverseExcursion) {
            maxAdverseExcursion = adverse;
            maeAt = bar.time;
        }
    }

    return { maxFavorableExcursion, maxAdverseExcursion, mfeAt, maeAt };
}
