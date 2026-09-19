'use server';

import { headers } from 'next/headers';
import { getAuth } from '@/lib/better-auth/auth';
import { runBacktestBatch } from '@/lib/backtest/service';
import { listTrades } from '@/lib/actions/trade.actions';
import { simulateMonteCarlo } from '@/lib/monte-carlo/simulate';
import type { MonteCarloOutcome } from '@/lib/monte-carlo/types';

async function requireUserId(): Promise<string> {
    const auth = await getAuth();
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
        throw new Error('Not authenticated');
    }
    return session.user.id;
}

export interface MonteCarloParams {
    numSimulations: number;
    numTradesPerSimulation: number;
    riskPerTradePercent: number;
    startingEquity: number;
    ruinThresholdPercent: number;
    seed: number;
}

/** Resamples from a completed backtest run's resolved trades — never a
 * fabricated distribution (see docs/monte-carlo.md). STILL_OPEN/AMBIGUOUS
 * trades have no netRMultiple and are excluded, same as every other
 * aggregate over BacktestTrade[] (lib/backtest/aggregate.ts). */
export async function runMonteCarloFromBacktest(runId: string, params: MonteCarloParams): Promise<MonteCarloOutcome & { sampleSize: number }> {
    const userId = await requireUserId();
    const run = await runBacktestBatch({ runId, userId });

    const rMultiples = run.trades.map((t) => t.netRMultiple).filter((r): r is number => r !== null);
    if (rMultiples.length === 0) {
        return { valid: false, reason: 'This backtest run has no resolved trades to resample from yet.', sampleSize: 0 };
    }

    const outcome = simulateMonteCarlo({ ...params, rMultiples });
    return { ...outcome, sampleSize: rMultiples.length };
}

/** Resamples from the owner's own closed Trade Journal entries — reflects
 * actual execution (including their own entry timing/sizing/fees), unlike
 * the backtest's theoretical fills. */
export async function runMonteCarloFromJournal(params: MonteCarloParams): Promise<MonteCarloOutcome & { sampleSize: number }> {
    await requireUserId(); // listTrades() itself re-derives and scopes by the session user
    const trades = await listTrades({ status: 'ALL' });

    const rMultiples = trades.map((t) => t.rMultiple).filter((r): r is number => r !== undefined);
    if (rMultiples.length === 0) {
        return { valid: false, reason: 'No closed journal trades with a recorded R-multiple yet (a stop is required to compute one).', sampleSize: 0 };
    }

    const outcome = simulateMonteCarlo({ ...params, rMultiples });
    return { ...outcome, sampleSize: rMultiples.length };
}
