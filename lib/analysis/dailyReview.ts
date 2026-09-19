import { connectToDatabase } from '@/database/mongoose';
import { DailyAnalysisSnapshot } from '@/database/models/dailyAnalysisSnapshot.model';
import { getStaticUniverse } from '@/lib/market-data/universe';
import type { DailyChangeClassification } from './dailyChangeClassification';
import type { SetupType, SwingStatus } from '@/lib/swing/types';
import type { TrendDirection } from '@/lib/technical/trend';

export interface DailyReviewRow {
    symbol: string;
    market: string;
    marketDate: string;
    close: number;
    score: number;
    maxScore: number;
    status: SwingStatus;
    setupType?: SetupType;
    rsi: number | null;
    relativeVolume: number | null;
    trend: TrendDirection;
    changeClassification: DailyChangeClassification;
    scoreChange: number | null;
}

const ALL_CLASSIFICATIONS: DailyChangeClassification[] = [
    'NEW_SETUP',
    'NEWLY_QUALIFIED',
    'SCORE_IMPROVED',
    'SCORE_DETERIORATED',
    'LOST_QUALIFICATION',
    'SETUP_INVALIDATED',
    'NO_MATERIAL_CHANGE',
];

/** Pure — how many of `rows` fall into each classification bucket, every
 * bucket present even at zero (never an absent key the UI has to guess
 * about). Exported for direct unit testing. */
export function countByClassification(rows: DailyReviewRow[]): Record<DailyChangeClassification, number> {
    const counts = Object.fromEntries(ALL_CLASSIFICATIONS.map((c) => [c, 0])) as Record<DailyChangeClassification, number>;
    for (const row of rows) counts[row.changeClassification]++;
    return counts;
}

export interface DailyReviewData {
    market: string;
    /** The most recent session actually represented in stored snapshots for
     * this market, or null if nothing has been generated yet — never
     * "today" by wall-clock assumption (see docs/daily-data-engine.md). */
    marketDate: string | null;
    rows: DailyReviewRow[];
    countsByClassification: Record<DailyChangeClassification, number>;
}

/** The most recent marketDate any snapshot actually carries for `market` —
 * what "today's review" means, driven entirely by what's been generated,
 * never by the wall clock. */
export async function getLatestSnapshotMarketDate(market: string): Promise<string | null> {
    await connectToDatabase();
    const doc = await DailyAnalysisSnapshot.findOne({ market }).sort({ marketDate: -1 }).select('marketDate').lean();
    return doc?.marketDate ?? null;
}

export interface GetDailyReviewParams {
    market: string;
    /** Restricts rows to one static universe's symbol set — omit for every
     * symbol tracked for this market (see resolveMarketSymbols). The
     * per-user Custom Watchlist is not a valid value here: this data is
     * shared/market-wide, not user-scoped (see the model's doc comment). */
    universeId?: string;
}

/**
 * Every instrument's latest-session snapshot for a market, dated by
 * whatever session is actually represented in storage (see
 * getLatestSnapshotMarketDate) — this is deliberately NOT "every snapshot
 * with marketDate === today": a symbol whose own latest snapshot is older
 * (sync/generation didn't reach it yet) is left out of today's review
 * rather than shown as if it were current — see the Market Data Status
 * freshness section for surfacing that gap explicitly instead.
 */
export async function getDailyReview(params: GetDailyReviewParams): Promise<DailyReviewData> {
    await connectToDatabase();

    const marketDate = await getLatestSnapshotMarketDate(params.market);
    if (!marketDate) {
        return { market: params.market, marketDate: null, rows: [], countsByClassification: countByClassification([]) };
    }

    const query: Record<string, unknown> = { market: params.market, marketDate };
    if (params.universeId) {
        const universe = getStaticUniverse(params.universeId);
        if (universe) query.symbol = { $in: universe.symbols.map((s) => s.symbol) };
    }

    const docs = await DailyAnalysisSnapshot.find(query).sort({ score: -1 }).lean();
    const rows: DailyReviewRow[] = docs.map((d) => ({
        symbol: d.symbol,
        market: d.market,
        marketDate: d.marketDate,
        close: d.close,
        score: d.score,
        maxScore: d.maxScore,
        status: d.status,
        setupType: d.setupType,
        rsi: d.rsi,
        relativeVolume: d.relativeVolume,
        trend: d.trend as TrendDirection,
        changeClassification: d.changeClassification as DailyChangeClassification,
        scoreChange: d.scoreChange,
    }));

    return { market: params.market, marketDate, rows, countsByClassification: countByClassification(rows) };
}
