import type { OhlcBar } from '@/lib/technical/types';
import type { SwingStrategyConfig } from '@/lib/swing/config';
import { analyzeSwingSetupDetailed } from '@/lib/swing/analyze';
import { evaluateCandidateOutcome } from '@/lib/candidates/outcome';
import { calculateExcursion } from '@/lib/trades/excursion';
import type { BacktestExecutionConfig, BacktestSymbolResult, BacktestTrade, BacktestTradeOutcome } from './types';

/**
 * Walks one symbol's full daily bar history forward, day by day, running
 * the exact same `analyzeSwingSetupDetailed` the live scanner/stock-detail
 * pages use against only the bars available up to that day
 * (`bars.slice(0, i + 1)`) — there is structurally no way for a later bar to
 * influence an earlier decision, which is the one hard requirement of a
 * backtest (see docs/backtesting.md).
 *
 * A "signal" is a day whose analysis reaches `QUALIFIED` (every rule in the
 * setup passed — not just "a high enough score"), scoring at least
 * `minScore`. The simulated entry is the NEXT bar's open (the earliest a
 * position could plausibly have been taken), and the exit is resolved with
 * `evaluateCandidateOutcome` — the identical function the live
 * outcome-tracking cron uses, so a backtest can never quietly disagree with
 * production about what "hit the stop" or "hit the target" means. Only one
 * simulated trade is open per symbol at a time; scanning for the next
 * signal resumes only after the previous trade's exit bar.
 */
export function simulateSymbolBacktest(
    symbol: string,
    bars: OhlcBar[],
    strategyConfig: SwingStrategyConfig,
    execConfig: BacktestExecutionConfig,
): BacktestSymbolResult {
    const trades: BacktestTrade[] = [];
    const { startDate, endDate, minScore, maxHoldingDays, feeBps, slippageBps } = execConfig;

    let i = 0;
    while (i < bars.length) {
        const bar = bars[i];
        if (bar.time > endDate) break;
        if (bar.time < startDate) {
            i++;
            continue;
        }

        const barsSoFar = bars.slice(0, i + 1);
        const detailed = analyzeSwingSetupDetailed(symbol, barsSoFar, strategyConfig);
        const result = detailed?.result;

        if (!result || result.status !== 'QUALIFIED' || result.score < minScore || result.stopLevel === undefined || !result.targets?.length) {
            i++;
            continue;
        }

        const entryIndex = i + 1;
        if (entryIndex >= bars.length) break; // signal on the last available bar — no next bar to enter on

        const stopLevel = result.stopLevel;
        const targets = result.targets;
        const rawEntryPrice = bars[entryIndex].open;
        const entryPrice = rawEntryPrice * (1 + slippageBps / 10_000);
        const riskPerShare = entryPrice - stopLevel;

        if (!(riskPerShare > 0)) {
            // Slippage pushed the fill through (or past) the stop — no
            // sane trade exists; skip rather than report a nonsensical
            // negative-risk trade. Resume right after the entry bar.
            i = entryIndex;
            continue;
        }

        const signalDate = bar.time;
        const entryDate = bars[entryIndex].time;
        // evaluateCandidateOutcome's EXPIRED check is `barsAfterSignal.length
        // >= maxHoldingDays` against whatever array it's handed — the live
        // cron self-corrects because it always passes "bars since signal
        // through today" (naturally growing one bar per day), but a
        // backtest hands it the *entire* remaining history in one call, so
        // the window must be capped here or EXPIRED would misreport using
        // the last bar of all remaining history instead of the actual
        // maxHoldingDays boundary.
        const barsAfterSignal = bars.slice(entryIndex, entryIndex + maxHoldingDays);
        const outcome = evaluateCandidateOutcome({ stopLevel, targets, barsAfterSignal, maxHoldingDays });

        if (outcome.status === 'ACTIVE') {
            // Ran out of historical data before the trade resolved (and
            // before the holding window even elapsed) — a data-boundary
            // artifact, deliberately distinct from a strategy-defined
            // EXPIRED (see lib/backtest/types.ts).
            const excursion = calculateExcursion({ direction: 'LONG', entryPrice, bars: barsAfterSignal });
            trades.push({
                symbol,
                setupType: result.setupType,
                score: result.score,
                maxScore: result.maxScore,
                riskReward: result.riskReward,
                signalDate,
                entryDate,
                entryPrice,
                stopLevel,
                targets,
                outcome: 'STILL_OPEN',
                grossRMultiple: null,
                netRMultiple: null,
                maxFavorableExcursion: excursion.maxFavorableExcursion,
                maxAdverseExcursion: excursion.maxAdverseExcursion,
            });
            break; // no bars remain to look for another signal either
        }

        // evaluateCandidateOutcome only sets closedAt for STOP_HIT/
        // TARGET_2_HIT/EXPIRED/AMBIGUOUS — a plain TARGET_1_HIT (no second
        // target ever hit) sets only firstTargetHitAt, matching the same
        // fallback chain CandidatesClient's outcomeDate() already relies on.
        const exitAt = outcome.closedAt ?? outcome.firstTargetHitAt ?? outcome.stopHitAt;
        const exitIndexInSlice = barsAfterSignal.findIndex((b) => b.time === exitAt);
        const exitBar = barsAfterSignal[exitIndexInSlice];

        let exitPrice: number | undefined;
        switch (outcome.status) {
            case 'STOP_HIT':
                // Modeled as a market order triggered by the stop — worse
                // fill than the stop level itself, unlike a target's limit fill.
                exitPrice = stopLevel * (1 - slippageBps / 10_000);
                break;
            case 'TARGET_1_HIT':
                exitPrice = targets[0];
                break;
            case 'TARGET_2_HIT':
                exitPrice = targets[1];
                break;
            case 'EXPIRED':
                exitPrice = exitBar.close;
                break;
            default:
                // AMBIGUOUS: no defined fill exists — never guessed at.
                break;
        }

        let grossRMultiple: number | null = null;
        let netRMultiple: number | null = null;
        if (exitPrice !== undefined) {
            grossRMultiple = (exitPrice - entryPrice) / riskPerShare;
            const feeDragInR = (2 * (feeBps / 10_000) * entryPrice) / riskPerShare;
            netRMultiple = grossRMultiple - feeDragInR;
        }

        const excursion = calculateExcursion({ direction: 'LONG', entryPrice, bars: barsAfterSignal.slice(0, exitIndexInSlice + 1) });

        trades.push({
            symbol,
            setupType: result.setupType,
            score: result.score,
            maxScore: result.maxScore,
            riskReward: result.riskReward,
            signalDate,
            entryDate,
            entryPrice,
            stopLevel,
            targets,
            exitDate: exitAt,
            exitPrice,
            outcome: outcome.status as BacktestTradeOutcome,
            grossRMultiple,
            netRMultiple,
            maxFavorableExcursion: excursion.maxFavorableExcursion,
            maxAdverseExcursion: excursion.maxAdverseExcursion,
        });

        // Resume scanning only after this trade's exit bar — no overlapping
        // simulated positions in the same symbol.
        i = entryIndex + exitIndexInSlice + 1;
    }

    return { symbol, trades, barsUsed: bars.length };
}
