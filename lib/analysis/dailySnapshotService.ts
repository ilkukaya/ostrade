import { connectToDatabase } from '@/database/mongoose';
import { DailyAnalysisSnapshot } from '@/database/models/dailyAnalysisSnapshot.model';
import { getBarsOrFetch } from '@/lib/market-data/historicalDataRepository';
import { resolveMarketSymbols } from '@/lib/market-data/sync/resolveMarketSymbols';
import { analyzeSwingSetupDetailed } from '@/lib/swing/analyze';
import { defaultSwingStrategyConfig, type SwingStrategyConfig } from '@/lib/swing/config';
import { fingerprintStrategyConfig } from '@/lib/swing/configFingerprint';
import { createConcurrencyLimiter } from '@/lib/concurrencyLimiter';
import { classifyDailyChange, type DailySnapshotComparable } from './dailyChangeClassification';

/** Same window as the scanner/stock page (see lib/scanner/service.ts) —
 * this reuses the identical Swing Engine, so it needs the identical amount
 * of history, no more. */
const SNAPSHOT_BARS_LIMIT = 300;

/** Local-only reads + pure computation, no provider rate limits to respect
 * — just enough of a cap to avoid opening an unbounded number of
 * simultaneous Mongo queries for a large universe. */
const CONCURRENCY = 8;

export interface SkippedSnapshotSymbol {
    symbol: string;
    reason: string;
}

export interface GenerateDailySnapshotsParams {
    market: string;
    strategyConfig?: SwingStrategyConfig;
}

export interface GenerateDailySnapshotsResult {
    market: string;
    strategyVersion: string;
    /** Every symbol resolved for this market, whether it produced a
     * snapshot or was skipped — see resolveMarketSymbols. */
    totalSymbols: number;
    processed: number;
    skipped: SkippedSnapshotSymbol[];
}

/**
 * Generates (or regenerates) one DailyAnalysisSnapshot per instrument in
 * `market`'s static-universe union, by re-running the existing deterministic
 * Swing Engine over each instrument's locally-stored bars — never a second
 * scoring implementation (see docs/daily-data-engine.md). Each symbol's
 * snapshot is dated by ITS OWN latest available bar (never "today" by
 * wall-clock assumption — see the model's doc comment), and is compared
 * against that same instrument's most recent PRIOR snapshot to derive a
 * change classification and score delta, stored once so every reader sees
 * the same values rather than recomputing them.
 *
 * A single, unbatched pass — unlike market-data sync/scanner/backtest, this
 * touches no external provider and does no per-symbol network I/O (bars are
 * already local), so even a full universe is cheap; only Mongo round-trips
 * are concurrency-capped. Intended to run manually (or from a scheduled job
 * later) AFTER that day's market-data sync — see docs/daily-data-engine.md's
 * cron-ordering note.
 */
export async function generateDailySnapshots(params: GenerateDailySnapshotsParams): Promise<GenerateDailySnapshotsResult> {
    await connectToDatabase();

    const strategyConfig = params.strategyConfig ?? defaultSwingStrategyConfig;
    const strategyVersion = fingerprintStrategyConfig(strategyConfig);
    const instruments = resolveMarketSymbols(params.market);

    const limiter = createConcurrencyLimiter(CONCURRENCY);
    const skipped: SkippedSnapshotSymbol[] = [];
    let processed = 0;

    await Promise.all(
        instruments.map((instrument) =>
            limiter(async () => {
                try {
                    const market = instrument.market ?? 'US';
                    const bars = await getBarsOrFetch(instrument, { limit: SNAPSHOT_BARS_LIMIT });
                    const detailed = analyzeSwingSetupDetailed(instrument.symbol, bars, strategyConfig);
                    if (!detailed) {
                        skipped.push({ symbol: instrument.symbol, reason: 'No historical data available for this symbol.' });
                        return;
                    }

                    const { snapshot, result } = detailed;
                    const marketDate = snapshot.asOf;

                    const previousDoc = await DailyAnalysisSnapshot.findOne({
                        symbol: instrument.symbol,
                        market,
                        strategyVersion,
                        marketDate: { $lt: marketDate },
                    })
                        .sort({ marketDate: -1 })
                        .lean();

                    const previous: DailySnapshotComparable | null = previousDoc
                        ? { status: previousDoc.status, score: previousDoc.score }
                        : null;
                    const changeClassification = classifyDailyChange(previous, { status: result.status, score: result.score });
                    const scoreChange = previousDoc ? result.score - previousDoc.score : null;

                    await DailyAnalysisSnapshot.findOneAndUpdate(
                        { symbol: instrument.symbol, market, strategyVersion, marketDate },
                        {
                            $set: {
                                symbol: instrument.symbol,
                                market,
                                exchange: instrument.exchange,
                                currency: instrument.currency,
                                marketDate,
                                close: snapshot.price,
                                score: result.score,
                                maxScore: result.maxScore,
                                status: result.status,
                                setupType: result.setupType,
                                rsi: snapshot.rsi14,
                                relativeVolume: snapshot.relativeVolume,
                                trend: snapshot.trend,
                                strategyVersion,
                                changeClassification,
                                scoreChange,
                                calculatedAt: new Date(),
                            },
                        },
                        { upsert: true },
                    );

                    processed++;
                } catch (error) {
                    console.error(`Daily snapshot: unexpected error generating a snapshot for ${instrument.symbol}`, error);
                    skipped.push({ symbol: instrument.symbol, reason: 'Unexpected error generating this snapshot.' });
                }
            }),
        ),
    );

    return { market: params.market, strategyVersion, totalSymbols: instruments.length, processed, skipped };
}
