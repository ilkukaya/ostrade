import { mean, median, rate } from '@/lib/statistics/math';
import { DEFAULT_SCORE_BUCKETS, type BucketDefinition } from '@/lib/statistics/candidateStats';
import type { BacktestTrade } from './types';

/** A trade only has a defined net R-multiple when it actually resolved to
 * a concrete fill — STILL_OPEN (ran out of data) and AMBIGUOUS (daily OHLC
 * couldn't reveal which of stop/target hit first) are real, counted
 * outcomes but contribute no fabricated return (see lib/backtest/simulate.ts). */
function isDecisive(trade: BacktestTrade): boolean {
    return trade.netRMultiple !== null;
}

export interface BacktestSummary {
    totalSignals: number;
    resolvedCount: number;
    winRate: number | null;
    avgNetR: number | null;
    medianNetR: number | null;
    /** sum(winning R) / abs(sum(losing R)); null when there are no losing
     * trades yet (the ratio is undefined, not infinite) or nothing resolved. */
    profitFactor: number | null;
    /** Largest peak-to-trough decline in cumulative net R, ordering
     * resolved trades by entry date and summing sequentially — a
     * deliberately simplified proxy, NOT a real concurrent-position
     * portfolio simulation (a trader could hold several symbols
     * simultaneously; this assumes one trade "at a time" in aggregate).
     * See docs/backtesting.md for why this scope was chosen. */
    maxDrawdownR: number | null;
    stopHitCount: number;
    targetHitCount: number;
    ambiguousCount: number;
    expiredCount: number;
    stillOpenCount: number;
}

export function computeBacktestSummary(trades: BacktestTrade[]): BacktestSummary {
    const decisive = trades.filter(isDecisive);
    const netRs = decisive.map((t) => t.netRMultiple as number);
    const wins = netRs.filter((r) => r > 0);
    const losses = netRs.filter((r) => r < 0);
    const lossSum = Math.abs(losses.reduce((sum, r) => sum + r, 0));

    const orderedByEntry = [...decisive].sort((a, b) => a.entryDate.localeCompare(b.entryDate));
    let cumulative = 0;
    let peak = 0;
    let maxDrawdown = 0;
    for (const trade of orderedByEntry) {
        cumulative += trade.netRMultiple as number;
        peak = Math.max(peak, cumulative);
        maxDrawdown = Math.max(maxDrawdown, peak - cumulative);
    }

    return {
        totalSignals: trades.length,
        resolvedCount: decisive.length,
        winRate: rate(wins.length, decisive.length),
        avgNetR: mean(netRs),
        medianNetR: median(netRs),
        profitFactor: lossSum > 0 ? wins.reduce((sum, r) => sum + r, 0) / lossSum : null,
        maxDrawdownR: decisive.length > 0 ? maxDrawdown : null,
        stopHitCount: trades.filter((t) => t.outcome === 'STOP_HIT').length,
        targetHitCount: trades.filter((t) => t.outcome === 'TARGET_1_HIT' || t.outcome === 'TARGET_2_HIT').length,
        ambiguousCount: trades.filter((t) => t.outcome === 'AMBIGUOUS').length,
        expiredCount: trades.filter((t) => t.outcome === 'EXPIRED').length,
        stillOpenCount: trades.filter((t) => t.outcome === 'STILL_OPEN').length,
    };
}

export interface BacktestGroupStats {
    label: string;
    n: number;
    winRate: number | null;
    avgNetR: number | null;
    medianNetR: number | null;
}

function statsForTrades(label: string, trades: BacktestTrade[]): BacktestGroupStats {
    const decisive = trades.filter(isDecisive);
    const netRs = decisive.map((t) => t.netRMultiple as number);
    return {
        label,
        n: decisive.length,
        winRate: rate(netRs.filter((r) => r > 0).length, decisive.length),
        avgNetR: mean(netRs),
        medianNetR: median(netRs),
    };
}

export function computeBacktestStatsByYear(trades: BacktestTrade[]): BacktestGroupStats[] {
    const years = Array.from(new Set(trades.map((t) => t.entryDate.slice(0, 4)))).sort();
    return years.map((year) => statsForTrades(year, trades.filter((t) => t.entryDate.slice(0, 4) === year)));
}

export function computeBacktestStatsBySetup(trades: BacktestTrade[]): BacktestGroupStats[] {
    const setups = Array.from(new Set(trades.map((t) => t.setupType ?? 'UNSPECIFIED'))).sort();
    return setups.map((setup) => statsForTrades(setup, trades.filter((t) => (t.setupType ?? 'UNSPECIFIED') === setup)));
}

/**
 * Splits a run's trades by entry date into a "train" portion (before the
 * holdout boundary) and a "holdout" portion (on or after it) — pure
 * filtering, so the same `computeBacktestSummary` can be run over each half
 * independently. This is the entire mechanism: comparing the two summaries
 * is what answers "does this edge hold up out-of-sample, or did I just
 * curve-fit the full history" (docs/backtesting.md). Never mutates or
 * reorders `trades`.
 */
export function splitTrainHoldout(
    trades: BacktestTrade[],
    holdoutStartDate: string,
): { trainTrades: BacktestTrade[]; holdoutTrades: BacktestTrade[] } {
    return {
        trainTrades: trades.filter((t) => t.entryDate < holdoutStartDate),
        holdoutTrades: trades.filter((t) => t.entryDate >= holdoutStartDate),
    };
}

/** Reuses the exact same bucket definitions as the candidate-statistics
 * score-bucket table (lib/statistics/candidateStats.ts) so a backtested
 * score bucket means the same thing as a live-candidate score bucket. */
export function computeBacktestStatsByScoreBucket(trades: BacktestTrade[], buckets: BucketDefinition[] = DEFAULT_SCORE_BUCKETS): BacktestGroupStats[] {
    return buckets.map((bucket) => statsForTrades(bucket.label, trades.filter((t) => t.score >= bucket.min && t.score < bucket.max)));
}
