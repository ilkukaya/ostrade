'use server';

import { headers } from 'next/headers';
import { getAuth } from '@/lib/better-auth/auth';
import { startBacktest, runBacktestBatch, listBacktestRuns } from '@/lib/backtest/service';
import { DEFAULT_BACKTEST_EXECUTION, type BacktestExecutionConfig, type BacktestProgress, type BacktestRunListItem } from '@/lib/backtest/types';
import { listUniverseOptions } from '@/lib/market-data/universe';

async function requireUserId(): Promise<string> {
    const auth = await getAuth();
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
        throw new Error('Not authenticated');
    }
    return session.user.id;
}

export interface StartBacktestParams {
    universeId: string;
    startDate: string;
    endDate: string;
    minScore?: number;
    maxHoldingDays?: number;
    feeBps?: number;
    slippageBps?: number;
    /** Optional out-of-sample boundary — see BacktestExecutionConfig. */
    holdoutStartDate?: string;
}

export async function startBacktestRun(params: StartBacktestParams): Promise<{ runId: string }> {
    const userId = await requireUserId();

    if (params.startDate >= params.endDate) {
        throw new Error('Start date must be before end date.');
    }
    if (params.holdoutStartDate && (params.holdoutStartDate <= params.startDate || params.holdoutStartDate >= params.endDate)) {
        throw new Error('Holdout start date must fall strictly between the start and end dates.');
    }

    const executionConfig: Omit<BacktestExecutionConfig, 'universeId'> = {
        startDate: params.startDate,
        endDate: params.endDate,
        minScore: params.minScore ?? DEFAULT_BACKTEST_EXECUTION.minScore,
        maxHoldingDays: params.maxHoldingDays ?? DEFAULT_BACKTEST_EXECUTION.maxHoldingDays,
        feeBps: params.feeBps ?? DEFAULT_BACKTEST_EXECUTION.feeBps,
        slippageBps: params.slippageBps ?? DEFAULT_BACKTEST_EXECUTION.slippageBps,
        holdoutStartDate: params.holdoutStartDate || undefined,
    };

    return startBacktest({ userId, universeId: params.universeId, executionConfig });
}

export async function advanceBacktestRun(runId: string): Promise<BacktestProgress> {
    const userId = await requireUserId();
    return runBacktestBatch({ runId, userId });
}

export async function getBacktestRuns(): Promise<BacktestRunListItem[]> {
    const userId = await requireUserId();
    return listBacktestRuns(userId);
}

export async function getUniverseOptionsForBacktest() {
    return listUniverseOptions();
}
