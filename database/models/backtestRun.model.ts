import { Schema, model, models, type Document, type Model } from 'mongoose';
import type { SwingStrategyConfig } from '@/lib/swing/config';
import type { BacktestDatasetProvenance, BacktestExecutionConfig, BacktestSkippedSymbol, BacktestTrade } from '@/lib/backtest/types';
import type { BacktestGroupStats, BacktestSummary } from '@/lib/backtest/aggregate';

export type BacktestRunStatus = 'running' | 'completed' | 'failed';

/**
 * Unlike ScannerRun (an ephemeral, TTL-expired cache of a live scan), a
 * BacktestRun is a permanent research record — it exists specifically so a
 * strategy config change never silently changes what a past backtest
 * result meant (strategy versioning, docs/backtesting.md). No TTL index:
 * these are kept until the owner deletes them.
 */
export interface BacktestRunDocument extends Document {
    userId: string;
    universeId: string;

    /** Execution/scope assumptions — persisted verbatim, never recomputed. */
    executionConfig: BacktestExecutionConfig;
    /** The full rule-engine config snapshot this run used. */
    strategyConfig: SwingStrategyConfig;
    strategyFingerprint: string;

    status: BacktestRunStatus;
    /** Full, fixed symbol list for this run, in processing order. */
    symbols: string[];
    /** How many of `symbols` have been processed (successfully or not) so far. */
    cursor: number;
    trades: BacktestTrade[];
    skipped: BacktestSkippedSymbol[];

    /** Populated only once status is 'completed' — computed from the full
     * `trades` list by lib/backtest/aggregate.ts. */
    summary?: BacktestSummary;
    byYear?: BacktestGroupStats[];
    bySetup?: BacktestGroupStats[];
    byScoreBucket?: BacktestGroupStats[];
    /** Populated only once completed AND executionConfig.holdoutStartDate
     * was set — see lib/backtest/aggregate.ts::splitTrainHoldout. */
    trainSummary?: BacktestSummary;
    holdoutSummary?: BacktestSummary;

    /** What data this run actually read — see BacktestDatasetProvenance's
     * doc comment. Always present (set at creation, refined as symbols are
     * processed), never optional the way the derived summary fields are. */
    datasetProvenance: BacktestDatasetProvenance;

    startedAt: Date;
    updatedAt: Date;
    completedAt?: Date;
}

const BacktestTradeSchema = new Schema<BacktestTrade>(
    {
        symbol: { type: String, required: true },
        setupType: { type: String },
        score: { type: Number, required: true },
        maxScore: { type: Number, required: true },
        riskReward: { type: Number },
        signalDate: { type: String, required: true },
        entryDate: { type: String, required: true },
        entryPrice: { type: Number, required: true },
        stopLevel: { type: Number, required: true },
        targets: { type: [Number], required: true },
        exitDate: { type: String },
        exitPrice: { type: Number },
        outcome: { type: String, required: true },
        grossRMultiple: { type: Number, default: null },
        netRMultiple: { type: Number, default: null },
        maxFavorableExcursion: { type: Number, required: true },
        maxAdverseExcursion: { type: Number, required: true },
    },
    { _id: false },
);

const BacktestSkippedSchema = new Schema<BacktestSkippedSymbol>(
    { symbol: { type: String, required: true }, reason: { type: String, required: true } },
    { _id: false },
);

const BacktestRunSchema = new Schema<BacktestRunDocument>({
    userId: { type: String, required: true, index: true },
    universeId: { type: String, required: true },

    // Loosely typed on purpose — these are frozen config/result blobs, never
    // queried field-by-field (same rationale as candidate.model.ts's
    // indicatorSnapshot and scannerRun.model.ts's analysis field).
    executionConfig: { type: Schema.Types.Mixed, required: true },
    strategyConfig: { type: Schema.Types.Mixed, required: true },
    strategyFingerprint: { type: String, required: true },

    status: { type: String, enum: ['running', 'completed', 'failed'], required: true, default: 'running' },
    symbols: { type: [String], required: true },
    cursor: { type: Number, required: true, default: 0 },
    trades: { type: [BacktestTradeSchema], default: [] },
    skipped: { type: [BacktestSkippedSchema], default: [] },

    summary: { type: Schema.Types.Mixed },
    byYear: { type: Array },
    bySetup: { type: Array },
    byScoreBucket: { type: Array },
    trainSummary: { type: Schema.Types.Mixed },
    holdoutSummary: { type: Schema.Types.Mixed },

    datasetProvenance: { type: Schema.Types.Mixed, required: true },

    startedAt: { type: Date, required: true, default: Date.now },
    updatedAt: { type: Date, required: true, default: Date.now },
    completedAt: { type: Date },
});

// Listing past runs for a user, newest first — the one query shape this
// model actually needs (per the deployment brief's "not one index per
// field" guidance).
BacktestRunSchema.index({ userId: 1, startedAt: -1 });

export const BacktestRun: Model<BacktestRunDocument> =
    (models?.BacktestRun as Model<BacktestRunDocument>) || model<BacktestRunDocument>('BacktestRun', BacktestRunSchema);
