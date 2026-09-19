import { connectToDatabase } from '@/database/mongoose';
import { DailyAnalysisSnapshot } from '@/database/models/dailyAnalysisSnapshot.model';
import { Candidate, type CandidateStatus } from '@/database/models/candidate.model';
import { getStaticUniverse } from '@/lib/market-data/universe';
import type { DailyChangeClassification } from './dailyChangeClassification';
import type { SetupType, SwingStatus } from '@/lib/swing/types';

/** How many trailing sessions the weekly review covers — a trading week,
 * not a calendar week (see docs/daily-data-engine.md's weekly-review
 * section). Fewer sessions are used if less history has been generated
 * yet — never padded with fabricated ones. */
const WEEKLY_WINDOW_SESSIONS = 5;

export interface WeeklyScoreSequencePoint {
    marketDate: string;
    /** null marks a session this symbol has no snapshot for (a gap) —
     * never interpolated. */
    score: number | null;
    status: SwingStatus | null;
}

export interface WeeklySymbolSummary {
    symbol: string;
    market: string;
    /** Chronological (oldest first), one point per session in the window. */
    scoreSequence: WeeklyScoreSequencePoint[];
    /** Latest observed score minus earliest observed score in the window —
     * null if fewer than two sessions were actually observed for this
     * symbol. Purely descriptive, per docs/daily-data-engine.md — this never
     * feeds back into strategy scoring. */
    weeklyScoreChange: number | null;
    /** (latest close - earliest close) / earliest close over the window's
     * OBSERVED sessions — null under the same condition as above. */
    weeklyReturnPct: number | null;
    qualifiedSessionCount: number;
    observedSessionCount: number;
    /** How many day-to-day status transitions occurred within the window
     * (0 means the status never changed across every observed session). */
    statusChangeCount: number;
    weeklyHigh: number | null;
    weeklyLow: number | null;
    latestStatus: SwingStatus | null;
    latestSetupType?: SetupType;
    latestClassification: DailyChangeClassification | null;
}

export interface WeeklyReviewData {
    market: string;
    /** Distinct session dates actually covered, oldest first — up to
     * WEEKLY_WINDOW_SESSIONS, fewer if less history exists yet. */
    sessionDates: string[];
    symbols: WeeklySymbolSummary[];
}

interface SnapshotDocLike {
    symbol: string;
    marketDate: string;
    score: number;
    status: SwingStatus;
    setupType?: SetupType;
    close: number;
    changeClassification: DailyChangeClassification;
}

/**
 * Pure — folds one symbol's snapshots within the window into the weekly
 * summary described above. `sessionDates` must be chronological
 * (oldest-first); `docs` may contain fewer entries than sessionDates (a
 * symbol synced partway through the week, or a stale gap) and may be in any
 * order. Exported for direct unit testing.
 */
export function summarizeSymbolWeek(symbol: string, market: string, sessionDates: string[], docs: SnapshotDocLike[]): WeeklySymbolSummary {
    const byDate = new Map(docs.map((d) => [d.marketDate, d]));
    const scoreSequence: WeeklyScoreSequencePoint[] = sessionDates.map((marketDate) => {
        const doc = byDate.get(marketDate);
        return { marketDate, score: doc?.score ?? null, status: doc?.status ?? null };
    });

    const observed = sessionDates.map((date) => byDate.get(date)).filter((d): d is SnapshotDocLike => Boolean(d));
    const observedSessionCount = observed.length;
    const qualifiedSessionCount = observed.filter((d) => d.status === 'QUALIFIED').length;

    const first = observed[0];
    const latest = observed[observed.length - 1];
    const weeklyScoreChange = observed.length >= 2 ? latest.score - first.score : null;
    const weeklyReturnPct = observed.length >= 2 && first.close !== 0 ? (latest.close - first.close) / first.close : null;

    let statusChangeCount = 0;
    for (let i = 1; i < observed.length; i++) {
        if (observed[i].status !== observed[i - 1].status) statusChangeCount++;
    }

    const closes = observed.map((d) => d.close);
    const weeklyHigh = closes.length > 0 ? Math.max(...closes) : null;
    const weeklyLow = closes.length > 0 ? Math.min(...closes) : null;

    return {
        symbol,
        market,
        scoreSequence,
        weeklyScoreChange,
        weeklyReturnPct,
        qualifiedSessionCount,
        observedSessionCount,
        statusChangeCount,
        weeklyHigh,
        weeklyLow,
        latestStatus: latest?.status ?? null,
        latestSetupType: latest?.setupType,
        latestClassification: latest?.changeClassification ?? null,
    };
}

export interface GetWeeklyReviewParams {
    market: string;
    universeId?: string;
}

/**
 * The trailing-window weekly review for every instrument snapshotted in
 * `market` — reuses whatever DailyAnalysisSnapshots already exist (see
 * dailySnapshotService.ts); this NEVER mutates them and never recomputes
 * the underlying analysis, only aggregates across days that are already
 * there.
 */
export async function getWeeklyReview(params: GetWeeklyReviewParams): Promise<WeeklyReviewData> {
    await connectToDatabase();

    const allDates: string[] = await DailyAnalysisSnapshot.distinct('marketDate', { market: params.market });
    const sessionDates = allDates.sort().slice(-WEEKLY_WINDOW_SESSIONS);
    if (sessionDates.length === 0) {
        return { market: params.market, sessionDates: [], symbols: [] };
    }

    const query: Record<string, unknown> = { market: params.market, marketDate: { $in: sessionDates } };
    if (params.universeId) {
        const universe = getStaticUniverse(params.universeId);
        if (universe) query.symbol = { $in: universe.symbols.map((s) => s.symbol) };
    }

    const docs = await DailyAnalysisSnapshot.find(query).sort({ symbol: 1, marketDate: 1 }).lean();

    const bySymbol = new Map<string, SnapshotDocLike[]>();
    for (const doc of docs) {
        const list = bySymbol.get(doc.symbol) ?? [];
        list.push(doc);
        bySymbol.set(doc.symbol, list);
    }

    const symbols = Array.from(bySymbol.entries()).map(([symbol, symbolDocs]) => summarizeSymbolWeek(symbol, params.market, sessionDates, symbolDocs));

    return { market: params.market, sessionDates, symbols };
}

export interface WeeklyCandidateOutcomeChange {
    candidateId: string;
    symbol: string;
    status: CandidateStatus;
    closedAt: string;
}

/**
 * Candidates that resolved (any status other than ACTIVE) on or after
 * `sinceDate` — the per-user counterpart to the market-wide weekly review
 * above (a Candidate is a user's own saved signal, never shared data). See
 * docs/candidates.md for the status lifecycle this surfaces unchanged.
 */
export async function getWeeklyCandidateOutcomeChanges(userId: string, sinceDate: string): Promise<WeeklyCandidateOutcomeChange[]> {
    await connectToDatabase();
    const docs = await Candidate.find(
        { userId, status: { $ne: 'ACTIVE' }, closedAt: { $gte: new Date(`${sinceDate}T00:00:00.000Z`) } },
        { symbol: 1, status: 1, closedAt: 1 },
    )
        .sort({ closedAt: -1 })
        .lean();

    return docs.map((d) => ({
        candidateId: String(d._id),
        symbol: d.symbol,
        status: d.status,
        closedAt: (d.closedAt as Date).toISOString(),
    }));
}
