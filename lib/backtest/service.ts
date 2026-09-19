import { connectToDatabase } from '@/database/mongoose';
import { BacktestRun, type BacktestRunDocument } from '@/database/models/backtestRun.model';
import { Watchlist } from '@/database/models/watchlist.model';
import { CUSTOM_WATCHLIST_UNIVERSE_ID, getStaticUniverse } from '@/lib/market-data/universe';
import { getHistoricalPrices } from '@/lib/market-data/service';
import { describeMarketDataError } from '@/lib/market-data/types';
import { defaultSwingStrategyConfig, type SwingStrategyConfig } from '@/lib/swing/config';
import { fingerprintStrategyConfig } from '@/lib/swing/configFingerprint';
import { createConcurrencyLimiter } from '@/lib/concurrencyLimiter';
import { simulateSymbolBacktest } from './simulate';
import {
    computeBacktestStatsByScoreBucket,
    computeBacktestStatsBySetup,
    computeBacktestStatsByYear,
    computeBacktestSummary,
    splitTrainHoldout,
} from './aggregate';
import type { BacktestExecutionConfig, BacktestProgress, BacktestRunListItem, BacktestSkippedSymbol, BacktestTrade } from './types';

/** The full set of derived fields recomputed whenever a run's trade list is
 * considered final — shared by the trivially-empty-universe path in
 * startBacktest and the normal completion path in runBacktestBatch, so the
 * "completed always has a summary" invariant can never drift between the
 * two call sites. */
function computeDerivedFields(trades: BacktestTrade[], holdoutStartDate?: string) {
    const split = holdoutStartDate ? splitTrainHoldout(trades, holdoutStartDate) : null;
    return {
        summary: computeBacktestSummary(trades),
        byYear: computeBacktestStatsByYear(trades),
        bySetup: computeBacktestStatsBySetup(trades),
        byScoreBucket: computeBacktestStatsByScoreBucket(trades),
        ...(split
            ? { trainSummary: computeBacktestSummary(split.trainTrades), holdoutSummary: computeBacktestSummary(split.holdoutTrades) }
            : {}),
    };
}

/** Smaller than the scanner's batch size — each unit of work here is a
 * full multi-year chronological simulation (heavier CPU per symbol than a
 * single day's analysis), so batches stay smaller to comfortably finish
 * within a serverless function's execution window. */
const BATCH_SIZE = 5;
const CONCURRENCY = 3;

async function resolveUniverseSymbols(universeId: string, userId: string): Promise<string[]> {
    if (universeId === CUSTOM_WATCHLIST_UNIVERSE_ID) {
        await connectToDatabase();
        const items = await Watchlist.find({ userId }, { symbol: 1 }).lean();
        return items.map((i) => i.symbol);
    }
    const universe = getStaticUniverse(universeId);
    if (!universe) throw new Error(`Unknown universe: ${universeId}`);
    return universe.symbols.map((s) => s.symbol);
}

async function backtestSymbol(
    symbol: string,
    strategyConfig: SwingStrategyConfig,
    execConfig: BacktestExecutionConfig,
): Promise<{ trades?: BacktestTrade[]; skip?: BacktestSkippedSymbol }> {
    try {
        const barsResult = await getHistoricalPrices(symbol, 'D');
        if (!barsResult.ok) {
            return { skip: { symbol, reason: describeMarketDataError(barsResult.error) } };
        }
        if (barsResult.data.length === 0) {
            return { skip: { symbol, reason: 'No historical data available for this symbol.' } };
        }
        const { trades } = simulateSymbolBacktest(symbol, barsResult.data, strategyConfig, execConfig);
        return { trades };
    } catch (error) {
        // A bug or unexpected exception simulating one symbol must never
        // take down the whole batch/run — every other symbol still gets a
        // result, and this one is reported as skipped, never silently
        // dropped.
        console.error(`Backtest: unexpected error simulating ${symbol}`, error);
        return { skip: { symbol, reason: 'Unexpected error simulating this symbol.' } };
    }
}

export interface StartBacktestParams {
    userId: string;
    universeId: string;
    executionConfig: Omit<BacktestExecutionConfig, 'universeId'>;
    strategyConfig?: SwingStrategyConfig;
}

/**
 * Creates a new, permanent BacktestRun record and returns its id — unlike
 * the scanner, there is no dedup-by-config cache reuse here: every call
 * starts a fresh, separately-listable research run, since re-running the
 * same config (or a slight variant) to compare results is a normal thing
 * to want, not something to collapse into a single cached entry (see
 * docs/backtesting.md).
 */
export async function startBacktest(params: StartBacktestParams): Promise<{ runId: string }> {
    await connectToDatabase();

    const symbols = await resolveUniverseSymbols(params.universeId, params.userId);
    const strategyConfig = params.strategyConfig ?? defaultSwingStrategyConfig;
    const now = new Date();
    const isTriviallyDone = symbols.length === 0;

    const run = await BacktestRun.create({
        userId: params.userId,
        universeId: params.universeId,
        executionConfig: { ...params.executionConfig, universeId: params.universeId },
        strategyConfig,
        strategyFingerprint: fingerprintStrategyConfig(strategyConfig),
        status: isTriviallyDone ? 'completed' : 'running',
        symbols,
        cursor: 0,
        trades: [],
        skipped: [],
        startedAt: now,
        updatedAt: now,
        completedAt: isTriviallyDone ? now : undefined,
        // Keep the "completed always has a summary" invariant even for a
        // trivially-empty universe, rather than leaving the UI to guess
        // whether an undefined summary means "empty" or "not computed yet".
        ...(isTriviallyDone ? computeDerivedFields([], params.executionConfig.holdoutStartDate) : {}),
    });

    return { runId: String(run._id) };
}

export interface RunBacktestBatchParams {
    runId: string;
    userId: string;
}

/**
 * Advances one existing run by exactly one batch of symbols and returns its
 * current progress — idempotent to call repeatedly, exactly like the
 * scanner's runScannerBatch (see docs/scanner.md); the client polls this
 * until status === 'completed'. Never fetches/simulates more than
 * BATCH_SIZE new symbols in one call, and never more than CONCURRENCY of
 * those at once, regardless of universe size.
 */
export async function runBacktestBatch(params: RunBacktestBatchParams): Promise<BacktestProgress> {
    await connectToDatabase();

    let run = await BacktestRun.findOne({ _id: params.runId, userId: params.userId });
    if (!run) {
        throw new Error('Backtest run not found.');
    }

    if (run.status === 'running') {
        const limiter = createConcurrencyLimiter(CONCURRENCY);
        const batch = run.symbols.slice(run.cursor, run.cursor + BATCH_SIZE);
        const outcomes = await Promise.all(
            batch.map((symbol) => limiter(() => backtestSymbol(symbol, run!.strategyConfig, run!.executionConfig))),
        );

        const newTrades = outcomes.flatMap((o) => o.trades ?? []);
        const newSkips = outcomes.map((o) => o.skip).filter((s): s is BacktestSkippedSymbol => Boolean(s));

        const newCursor = run.cursor + batch.length;
        const isDone = newCursor >= run.symbols.length;
        const now = new Date();

        run = await BacktestRun.findByIdAndUpdate(
            run._id,
            {
                $push: { trades: { $each: newTrades }, skipped: { $each: newSkips } },
                $set: {
                    cursor: newCursor,
                    updatedAt: now,
                    status: isDone ? 'completed' : 'running',
                    ...(isDone ? { completedAt: now } : {}),
                },
            },
            { new: true },
        );

        if (isDone && run) {
            const allTrades = run.trades as BacktestTrade[];
            run = await BacktestRun.findByIdAndUpdate(
                run._id,
                { $set: computeDerivedFields(allTrades, run.executionConfig.holdoutStartDate) },
                { new: true },
            );
        }
    }

    return toProgress(run!);
}

function toProgress(run: BacktestRunDocument): BacktestProgress {
    return {
        runId: String(run._id),
        status: run.status,
        universeId: run.universeId,
        totalSymbols: run.symbols.length,
        scannedSymbols: run.cursor,
        trades: run.trades,
        skipped: run.skipped,
        startedAt: run.startedAt.toISOString(),
        updatedAt: run.updatedAt.toISOString(),
        completedAt: run.completedAt?.toISOString(),
        executionConfig: run.executionConfig,
        summary: run.summary,
        byYear: run.byYear,
        bySetup: run.bySetup,
        byScoreBucket: run.byScoreBucket,
        trainSummary: run.trainSummary,
        holdoutSummary: run.holdoutSummary,
    };
}

export async function listBacktestRuns(userId: string): Promise<BacktestRunListItem[]> {
    await connectToDatabase();
    const runs = await BacktestRun.find(
        { userId },
        { universeId: 1, status: 1, startedAt: 1, completedAt: 1, executionConfig: 1, summary: 1 },
    )
        .sort({ startedAt: -1 })
        .lean();

    return runs.map((run) => ({
        runId: String(run._id),
        universeId: run.universeId,
        status: run.status,
        startedAt: run.startedAt.toISOString(),
        completedAt: run.completedAt?.toISOString(),
        executionConfig: run.executionConfig,
        summary: run.summary,
    }));
}
