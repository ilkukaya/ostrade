import { connectToDatabase } from '@/database/mongoose';
import { ScannerRun, type ScannerRunDocument, type ScannerResultDoc, type ScannerSkippedSymbol } from '@/database/models/scannerRun.model';
import { Watchlist } from '@/database/models/watchlist.model';
import { CUSTOM_WATCHLIST_UNIVERSE_ID, getStaticUniverse } from '@/lib/market-data/universe';
import { getCompanyProfile } from '@/lib/market-data/service';
import { getBarsOrFetch } from '@/lib/market-data/historicalDataRepository';
import { resolveInstrument } from '@/lib/market-data/instruments/resolve';
import { analyzeSwingSetupDetailed } from '@/lib/swing/analyze';
import { defaultSwingStrategyConfig, type SwingStrategyConfig } from '@/lib/swing/config';
import { fingerprintStrategyConfig } from '@/lib/swing/configFingerprint';
import { createConcurrencyLimiter } from '@/lib/concurrencyLimiter';
import type { ScannerProgress, ScannerResult } from './types';

/** How many symbols one call to `runScannerBatch` processes — small enough
 * to comfortably finish within a serverless function's execution window
 * even on a cold cache, per docs/scanner.md. The client polls, each poll
 * advancing the scan by one batch, until it reports `completed`. */
const BATCH_SIZE = 10;

/** How many symbols within a batch are fetched/analyzed at once. Caps the
 * scanner's peak concurrent outbound requests to the market-data provider
 * regardless of universe size — see lib/concurrencyLimiter.ts. */
const CONCURRENCY = 4;

/** A completed scan is reused as-is for this long before a plain (non
 * force-refresh) request triggers a new one. Daily bars only change once a
 * trading day, so there is little value in rescanning more often than this
 * by default. */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

/** Latest-N bars requested per symbol during a scan — enough for every
 * indicator the swing engine computes (longest lookback: the 200-day SMA),
 * with headroom to spare. Local-first (see historicalDataRepository.ts), so
 * this only trims what's returned, never what's stored; the backtester
 * requests its own full range separately. See docs/scanner.md. */
const SCAN_BARS_LIMIT = 300;

async function resolveUniverseSymbols(universeId: string, userId: string): Promise<string[]> {
    if (universeId === CUSTOM_WATCHLIST_UNIVERSE_ID) {
        await connectToDatabase();
        const items = await Watchlist.find({ userId }, { symbol: 1 }).lean();
        return items.map((i) => i.symbol);
    }

    const universe = getStaticUniverse(universeId);
    if (!universe) {
        throw new Error(`Unknown universe: ${universeId}`);
    }
    return universe.symbols.map((s) => s.symbol);
}

async function analyzeSymbol(
    symbol: string,
    config: SwingStrategyConfig,
): Promise<{ result?: ScannerResultDoc; skip?: ScannerSkippedSymbol }> {
    try {
        const instrument = resolveInstrument(symbol);
        const [bars, profileResult] = await Promise.all([
            getBarsOrFetch(instrument, { limit: SCAN_BARS_LIMIT }),
            getCompanyProfile(instrument.symbol),
        ]);

        const detailed = analyzeSwingSetupDetailed(instrument.symbol, bars, config);
        if (!detailed) {
            return { skip: { symbol: instrument.symbol, reason: 'No historical data available for this symbol.' } };
        }

        const { snapshot, result } = detailed;
        const currentBar = bars[bars.length - 1];
        const previousBar = bars.length >= 2 ? bars[bars.length - 2] : undefined;
        const changePercent =
            currentBar && previousBar && previousBar.close !== 0
                ? ((currentBar.close - previousBar.close) / previousBar.close) * 100
                : 0;

        const doc: ScannerResultDoc = {
            symbol: instrument.symbol,
            companyName: profileResult.ok ? profileResult.data.name : undefined,
            price: snapshot.price,
            changePercent,
            dataTimestamp: snapshot.asOf,
            relativeVolume: snapshot.relativeVolume,
            rsi: snapshot.rsi14,
            trend: snapshot.trend,
            analysis: result,
        };
        return { result: doc };
    } catch (error) {
        // A bug or unexpected exception analyzing one symbol must never take
        // down the whole batch — every other symbol still gets a result.
        console.error(`Scanner: unexpected error analyzing ${symbol}`, error);
        return { skip: { symbol, reason: 'Unexpected error analyzing this symbol.' } };
    }
}

function toScannerResult(doc: ScannerResultDoc): ScannerResult {
    return {
        instrument: { symbol: doc.symbol },
        companyName: doc.companyName,
        price: doc.price,
        changePercent: doc.changePercent,
        dataTimestamp: doc.dataTimestamp,
        relativeVolume: doc.relativeVolume,
        rsi: doc.rsi,
        trend: doc.trend as ScannerResult['trend'],
        analysis: doc.analysis,
    };
}

export interface RunScannerBatchParams {
    userId: string;
    universeId: string;
    config?: SwingStrategyConfig;
    /** Bypasses a fresh cached run and starts scanning from scratch. */
    forceRefresh?: boolean;
}

/**
 * Advances (or starts) a scan by exactly one batch and returns the run's
 * current progress. Idempotent to call repeatedly — the client is expected
 * to keep calling this until `status === 'completed'`, per docs/scanner.md.
 * Never fetches/analyzes more than `BATCH_SIZE` new symbols in one call, and
 * never more than `CONCURRENCY` of those at once, regardless of how large
 * the requested universe is.
 */
export async function runScannerBatch(params: RunScannerBatchParams): Promise<ScannerProgress> {
    const config = params.config ?? defaultSwingStrategyConfig;
    const fingerprint = fingerprintStrategyConfig(config);

    await connectToDatabase();

    const filter = { userId: params.userId, universeId: params.universeId, configFingerprint: fingerprint };
    let run = await ScannerRun.findOne(filter);

    const isFreshCompletedRun = run?.status === 'completed' && run.expiresAt.getTime() > Date.now();

    if (params.forceRefresh || !run) {
        const symbols = await resolveUniverseSymbols(params.universeId, params.userId);
        const now = new Date();

        run = await ScannerRun.findOneAndUpdate(
            filter,
            {
                $set: {
                    status: symbols.length === 0 ? 'completed' : 'running',
                    symbols,
                    cursor: 0,
                    results: [],
                    skipped: [],
                    startedAt: now,
                    updatedAt: now,
                    completedAt: symbols.length === 0 ? now : undefined,
                    expiresAt: new Date(now.getTime() + CACHE_TTL_MS),
                },
            },
            { upsert: true, new: true },
        );
    } else if (isFreshCompletedRun) {
        return toProgress(run!, true);
    }

    if (run!.status === 'running') {
        const limiter = createConcurrencyLimiter(CONCURRENCY);
        const batch = run!.symbols.slice(run!.cursor, run!.cursor + BATCH_SIZE);
        const outcomes = await Promise.all(batch.map((symbol) => limiter(() => analyzeSymbol(symbol, config))));

        const newResults = outcomes.map((o) => o.result).filter((r): r is ScannerResultDoc => Boolean(r));
        const newSkips = outcomes.map((o) => o.skip).filter((s): s is ScannerSkippedSymbol => Boolean(s));

        const newCursor = run!.cursor + batch.length;
        const isDone = newCursor >= run!.symbols.length;
        const now = new Date();

        run = await ScannerRun.findByIdAndUpdate(
            run!._id,
            {
                $push: { results: { $each: newResults }, skipped: { $each: newSkips } },
                $set: {
                    cursor: newCursor,
                    updatedAt: now,
                    status: isDone ? 'completed' : 'running',
                    ...(isDone ? { completedAt: now, expiresAt: new Date(now.getTime() + CACHE_TTL_MS) } : {}),
                },
            },
            { new: true },
        );
    }

    return toProgress(run!, false);
}

function toProgress(run: ScannerRunDocument, fromCache: boolean): ScannerProgress {
    return {
        status: run.status,
        universeId: run.universeId,
        totalSymbols: run.symbols.length,
        scannedSymbols: run.cursor,
        results: run.results.map(toScannerResult),
        skipped: run.skipped,
        startedAt: run.startedAt.toISOString(),
        updatedAt: run.updatedAt.toISOString(),
        completedAt: run.completedAt?.toISOString(),
        fromCache,
    };
}
