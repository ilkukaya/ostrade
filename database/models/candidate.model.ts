import { Schema, model, models, type Document, type Model } from 'mongoose';
import type { IndicatorSnapshot, PriceZone, RuleResult, SetupType, SwingAnalysisResult, SwingStatus } from '@/lib/swing/types';

/**
 * A candidate is a saved, immutable snapshot of what the swing-analysis
 * engine found for a symbol at a specific moment — NOT the same thing as
 * an executed trade (see database/models/trade.model.ts) and never
 * recomputed later. If the stock's indicators look different next week,
 * this document must still show exactly what it showed the day it was
 * saved — that's the whole point (docs/candidates.md). Only the lifecycle
 * fields at the bottom (status/xHitAt/closedAt) are ever mutated after
 * creation, by the automatic outcome-tracking job.
 */

/** Same shape as lib/swing/types.ts's IndicatorSnapshot, minus the raw
 * `bars` array — a candidate stores the computed readings that mattered
 * for scoring, not the full underlying price history (which is large and
 * independently re-fetchable from market data; the snapshot's job is to
 * freeze the ANALYSIS, not to become a bar-data cache). */
export type CandidateIndicatorSnapshot = Omit<IndicatorSnapshot, 'bars' | 'symbol'>;

/** The candidate's own lifecycle — distinct from `analysisStatus`
 * (PASS/WATCH/QUALIFIED), which is the immutable classification the setup
 * received at signal time. AMBIGUOUS is a real, distinct outcome — not an
 * error state — for when a single daily bar touches both the stop and a
 * target and OHLC data cannot reveal which happened first; see
 * docs/candidates.md and lib/scanner (outcome tracking). */
export type CandidateStatus = 'ACTIVE' | 'TARGET_1_HIT' | 'TARGET_2_HIT' | 'STOP_HIT' | 'EXPIRED' | 'CANCELLED' | 'AMBIGUOUS';

export interface CandidateDocument extends Document {
    userId: string;
    symbol: string;
    exchange?: string;
    market?: string;

    /** When the analysis snapshot was produced (SwingAnalysisResult.timestamp). */
    signalAt: Date;

    /** Identifies which strategy/config produced this — a hook for the
     * strategy-versioning system described in docs/strategy-config.md,
     * which doesn't exist yet. Hardcoded today since there is exactly one
     * config in use; stored now so nothing needs backfilling once real
     * versioning exists. */
    strategyId: string;
    strategyVersion: string;

    setupType?: SetupType;
    price: number;

    score: number;
    maxScore: number;
    /** The setup's PASS/WATCH/QUALIFIED classification at signal time —
     * immutable, unlike `status` below. */
    analysisStatus: SwingStatus;
    rules: RuleResult[];

    entryZone?: PriceZone;
    stopLevel?: number;
    targets?: number[];
    riskReward?: number;

    supportLevels?: PriceZone[];
    resistanceLevels?: PriceZone[];
    warnings?: string[];

    indicatorSnapshot: CandidateIndicatorSnapshot;

    /** Candidate lifecycle — the only fields the outcome-tracking job may
     * ever write after creation. */
    status: CandidateStatus;
    firstTargetHitAt?: Date;
    secondTargetHitAt?: Date;
    stopHitAt?: Date;
    closedAt?: Date;
    outcomeNotes?: string;

    createdAt: Date;
}

const PriceZoneSchema = new Schema<PriceZone>({ low: Number, high: Number }, { _id: false });

const RuleResultSchema = new Schema<RuleResult>(
    {
        id: { type: String, required: true },
        name: { type: String, required: true },
        passed: { type: Boolean, required: true },
        value: { type: Schema.Types.Mixed },
        score: { type: Number, required: true },
        maxScore: { type: Number, required: true },
        explanation: { type: String, required: true },
    },
    { _id: false },
);

const CandidateSchema = new Schema<CandidateDocument>({
    userId: { type: String, required: true, index: true },
    symbol: { type: String, required: true, uppercase: true, trim: true, index: true },
    exchange: { type: String },
    market: { type: String },

    signalAt: { type: Date, required: true, index: true },

    strategyId: { type: String, required: true, default: 'swing-core' },
    strategyVersion: { type: String, required: true, default: '1.0', index: true },

    setupType: { type: String, index: true },
    price: { type: Number, required: true },

    score: { type: Number, required: true, index: true },
    maxScore: { type: Number, required: true },
    analysisStatus: { type: String, enum: ['PASS', 'WATCH', 'QUALIFIED'], required: true },
    rules: { type: [RuleResultSchema], required: true },

    entryZone: { type: PriceZoneSchema },
    stopLevel: { type: Number },
    targets: { type: [Number] },
    riskReward: { type: Number },

    supportLevels: { type: [PriceZoneSchema] },
    resistanceLevels: { type: [PriceZoneSchema] },
    warnings: { type: [String] },

    // Loosely typed on purpose — this is a frozen snapshot blob, never
    // queried field-by-field (see the class doc comment above).
    indicatorSnapshot: { type: Schema.Types.Mixed, required: true },

    status: {
        type: String,
        enum: ['ACTIVE', 'TARGET_1_HIT', 'TARGET_2_HIT', 'STOP_HIT', 'EXPIRED', 'CANCELLED', 'AMBIGUOUS'],
        required: true,
        default: 'ACTIVE',
        index: true,
    },
    firstTargetHitAt: { type: Date },
    secondTargetHitAt: { type: Date },
    stopHitAt: { type: Date },
    closedAt: { type: Date },
    outcomeNotes: { type: String },

    createdAt: { type: Date, required: true, default: Date.now },
});

// The query shapes the candidates page and outcome-tracking job actually
// need — not one index per field (per the deployment brief's own guidance).
CandidateSchema.index({ userId: 1, status: 1, signalAt: -1 });
CandidateSchema.index({ userId: 1, setupType: 1 });

export const Candidate: Model<CandidateDocument> =
    (models?.Candidate as Model<CandidateDocument>) || model<CandidateDocument>('Candidate', CandidateSchema);

/** Builds the immutable portion of a Candidate document from a fresh
 * SwingAnalysisResult + the indicator snapshot it was derived from. Kept
 * here (next to the schema) so every call site constructs a candidate the
 * same way — see lib/actions/candidate.actions.ts. */
export function buildCandidateSnapshot(params: {
    userId: string;
    analysis: SwingAnalysisResult;
    snapshot: IndicatorSnapshot;
    exchange?: string;
    market?: string;
    strategyId?: string;
    strategyVersion?: string;
}) {
    const { bars: _bars, symbol: _symbol, ...indicatorSnapshot } = params.snapshot;
    void _bars;
    void _symbol;

    return {
        userId: params.userId,
        symbol: params.analysis.symbol,
        exchange: params.exchange,
        market: params.market,
        signalAt: new Date(params.analysis.timestamp),
        strategyId: params.strategyId ?? 'swing-core',
        strategyVersion: params.strategyVersion ?? '1.0',
        setupType: params.analysis.setupType,
        price: params.snapshot.price,
        score: params.analysis.score,
        maxScore: params.analysis.maxScore,
        analysisStatus: params.analysis.status,
        rules: params.analysis.rules,
        entryZone: params.analysis.entryZone,
        stopLevel: params.analysis.stopLevel,
        targets: params.analysis.targets,
        riskReward: params.analysis.riskReward,
        supportLevels: params.analysis.supportLevels,
        resistanceLevels: params.analysis.resistanceLevels,
        warnings: params.analysis.warnings,
        indicatorSnapshot,
        status: 'ACTIVE' as const,
    };
}
