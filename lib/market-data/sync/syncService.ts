import { connectToDatabase } from '@/database/mongoose';
import { MarketDataSyncRun, type MarketDataSyncRunDocument, type SyncFailure } from '@/database/models/marketDataSyncRun.model';
import { getHistoricalPricesWithProvider } from '@/lib/market-data/service';
import { describeMarketDataError, type InstrumentId } from '@/lib/market-data/types';
import { resolveInstrument } from '@/lib/market-data/instruments/resolve';
import { getLatestBar, upsertBars } from '@/lib/market-data/historicalDataRepository';
import { latestExpectedCompletedSession, type MarketId } from '@/lib/market-data/marketCalendar';
import { createConcurrencyLimiter } from '@/lib/concurrencyLimiter';
import { resolveMarketSymbols } from './resolveMarketSymbols';

/**
 * A daily EOD sync, batched and resumable exactly like the scanner/backtest
 * engines (see docs/daily-data-engine.md). Smaller batch than the scanner's
 * (10) since a sync's per-symbol work can include a full-history provider
 * fetch (Yahoo/Stooq return everything they have — there is no "give me
 * just the last few days" range request available for these free
 * providers; see the module doc comment on `syncOneSymbol` below).
 */
const BATCH_SIZE = 8;
const CONCURRENCY = 4;

export interface StartSyncParams {
    userId: string;
    market: string;
    /** Bypasses the "already covers the latest expected session" skip and
     * re-fetches every symbol regardless — useful for re-seeding or
     * debugging, not normal daily use. */
    forceRefresh?: boolean;
}

export async function startMarketDataSync(params: StartSyncParams): Promise<{ runId: string }> {
    await connectToDatabase();

    // Reuse an already-running sync for this (user, market) instead of
    // starting a second one — a double-click on "Update US" must not
    // launch two identical massive imports (see docs/daily-data-engine.md,
    // "Data admin safety").
    const alreadyRunning = await MarketDataSyncRun.findOne({ userId: params.userId, market: params.market, status: 'running' });
    if (alreadyRunning) {
        return { runId: String(alreadyRunning._id) };
    }

    const instruments = resolveMarketSymbols(params.market);
    const now = new Date();
    const isTriviallyDone = instruments.length === 0;

    const run = await MarketDataSyncRun.create({
        userId: params.userId,
        market: params.market,
        forceRefresh: params.forceRefresh ?? false,
        status: isTriviallyDone ? 'completed' : 'running',
        symbols: instruments.map((i) => i.symbol),
        cursor: 0,
        successfulSymbols: [],
        unchangedSymbols: [],
        failedSymbols: [],
        barsInserted: 0,
        barsUpdated: 0,
        startedAt: now,
        updatedAt: now,
        completedAt: isTriviallyDone ? now : undefined,
    });

    return { runId: String(run._id) };
}

type SyncOutcome =
    | { symbol: string; kind: 'unchanged' }
    | { symbol: string; kind: 'success'; inserted: number; updated: number }
    | { symbol: string; kind: 'failed'; reason: string; provider: string };

/**
 * Stooq and Yahoo's chart/CSV endpoints have no "give me only new bars"
 * range parameter — every successful fetch returns the provider's full
 * available history. "Incremental" therefore does not mean a smaller
 * provider request; it means:
 *   1. Skip symbols that already have a bar for the latest expected
 *      completed session — nothing could possibly be new for them yet.
 *   2. For everything else, fetch the full history anyway (unavoidable
 *      with these providers) and upsert it — safe and idempotent thanks to
 *      MarketBar's unique index, so re-storing already-correct historical
 *      bars changes nothing, while any provider correction to an older
 *      bar, or any genuinely new bar, is picked up automatically.
 * This is documented rather than left implicit — see docs/daily-data-engine.md.
 */
async function syncOneSymbol(instrument: InstrumentId, market: string, forceRefresh: boolean): Promise<SyncOutcome> {
    try {
        if (!forceRefresh) {
            const latest = await getLatestBar(instrument);
            if (latest && latest.time >= latestExpectedCompletedSession(market as MarketId)) {
                return { symbol: instrument.symbol, kind: 'unchanged' };
            }
        }

        const { result, providerId } = await getHistoricalPricesWithProvider(instrument.symbol, 'D');
        if (!result.ok) {
            return { symbol: instrument.symbol, kind: 'failed', reason: describeMarketDataError(result.error), provider: providerId };
        }

        const upserted = await upsertBars(instrument, result.data, providerId, 'D');
        return { symbol: instrument.symbol, kind: 'success', inserted: upserted.inserted, updated: upserted.updated };
    } catch (error) {
        console.error(`Market data sync: unexpected error syncing ${instrument.symbol}`, error);
        return { symbol: instrument.symbol, kind: 'failed', reason: 'Unexpected error syncing this symbol.', provider: 'none' };
    }
}

export interface RunSyncBatchParams {
    runId: string;
    userId: string;
}

export interface MarketDataSyncProgress {
    runId: string;
    status: MarketDataSyncRunDocument['status'];
    market: string;
    totalSymbols: number;
    processedSymbols: number;
    successfulSymbols: string[];
    unchangedSymbols: string[];
    failedSymbols: SyncFailure[];
    barsInserted: number;
    barsUpdated: number;
    startedAt: string;
    updatedAt: string;
    completedAt?: string;
}

/**
 * Advances one existing sync run by exactly one batch — idempotent to call
 * repeatedly, exactly like the scanner/backtest engines; the client polls
 * this until status === 'completed'.
 */
export async function runMarketDataSyncBatch(params: RunSyncBatchParams): Promise<MarketDataSyncProgress> {
    await connectToDatabase();

    let run = await MarketDataSyncRun.findOne({ _id: params.runId, userId: params.userId });
    if (!run) {
        throw new Error('Market data sync run not found.');
    }

    if (run.status === 'running') {
        const limiter = createConcurrencyLimiter(CONCURRENCY);
        const batchSymbols = run.symbols.slice(run.cursor, run.cursor + BATCH_SIZE);
        const outcomes = await Promise.all(
            batchSymbols.map((symbol) => limiter(() => syncOneSymbol(resolveInstrument(symbol), run!.market, run!.forceRefresh))),
        );

        const newSuccess = outcomes.filter((o): o is Extract<SyncOutcome, { kind: 'success' }> => o.kind === 'success').map((o) => o.symbol);
        const newUnchanged = outcomes.filter((o) => o.kind === 'unchanged').map((o) => o.symbol);
        const newFailed: SyncFailure[] = outcomes
            .filter((o): o is Extract<SyncOutcome, { kind: 'failed' }> => o.kind === 'failed')
            .map((o) => ({ symbol: o.symbol, reason: o.reason, provider: o.provider }));
        const newInserted = outcomes.reduce((sum, o) => sum + (o.kind === 'success' ? o.inserted : 0), 0);
        const newUpdated = outcomes.reduce((sum, o) => sum + (o.kind === 'success' ? o.updated : 0), 0);

        const newCursor = run.cursor + batchSymbols.length;
        const isDone = newCursor >= run.symbols.length;
        const now = new Date();

        run = await MarketDataSyncRun.findByIdAndUpdate(
            run._id,
            {
                $push: {
                    successfulSymbols: { $each: newSuccess },
                    unchangedSymbols: { $each: newUnchanged },
                    failedSymbols: { $each: newFailed },
                },
                $inc: { barsInserted: newInserted, barsUpdated: newUpdated },
                $set: {
                    cursor: newCursor,
                    updatedAt: now,
                    status: isDone ? 'completed' : 'running',
                    ...(isDone ? { completedAt: now } : {}),
                },
            },
            { new: true },
        );
    }

    return toProgress(run!);
}

function toProgress(run: MarketDataSyncRunDocument): MarketDataSyncProgress {
    return {
        runId: String(run._id),
        status: run.status,
        market: run.market,
        totalSymbols: run.symbols.length,
        processedSymbols: run.cursor,
        successfulSymbols: run.successfulSymbols,
        unchangedSymbols: run.unchangedSymbols,
        failedSymbols: run.failedSymbols,
        barsInserted: run.barsInserted,
        barsUpdated: run.barsUpdated,
        startedAt: run.startedAt.toISOString(),
        updatedAt: run.updatedAt.toISOString(),
        completedAt: run.completedAt?.toISOString(),
    };
}

export async function listRecentSyncRuns(userId: string, market?: string, limit = 10): Promise<MarketDataSyncProgress[]> {
    await connectToDatabase();
    const query: Record<string, unknown> = { userId };
    if (market) query.market = market;

    const runs = await MarketDataSyncRun.find(query).sort({ startedAt: -1 }).limit(limit).lean();
    return runs.map((run) => ({
        runId: String(run._id),
        status: run.status,
        market: run.market,
        totalSymbols: run.symbols.length,
        processedSymbols: run.cursor,
        successfulSymbols: run.successfulSymbols,
        unchangedSymbols: run.unchangedSymbols,
        failedSymbols: run.failedSymbols,
        barsInserted: run.barsInserted,
        barsUpdated: run.barsUpdated,
        startedAt: run.startedAt.toISOString(),
        updatedAt: run.updatedAt.toISOString(),
        completedAt: run.completedAt?.toISOString(),
    }));
}
