import { Schema, model, models, type Document, type Model } from 'mongoose';
import type { SwingAnalysisResult } from '@/lib/swing/types';

/** One symbol's outcome within a scan. `analysis` is stored as-is (a
 * SwingAnalysisResult snapshot) rather than mapped into a strict Mongoose
 * sub-schema — the scanner run is a short-lived cache/progress record, not
 * the durable candidate history (see candidate.model.ts for that), so there
 * is nothing here that needs field-level querying. */
export interface ScannerResultDoc {
    symbol: string;
    companyName?: string;
    price: number;
    changePercent: number;
    dataTimestamp: string;
    relativeVolume: number | null;
    rsi: number | null;
    trend: string;
    analysis: SwingAnalysisResult;
}

export interface ScannerSkippedSymbol {
    symbol: string;
    reason: string;
}

export type ScannerRunStatus = 'running' | 'completed' | 'failed';

export interface ScannerRunDocument extends Document {
    userId: string;
    universeId: string;
    configFingerprint: string;
    status: ScannerRunStatus;
    /** Full, fixed symbol list for this run, in scan order. */
    symbols: string[];
    /** How many of `symbols` have been processed (successfully or not) so far. */
    cursor: number;
    results: ScannerResultDoc[];
    skipped: ScannerSkippedSymbol[];
    startedAt: Date;
    updatedAt: Date;
    completedAt?: Date;
    /** TTL field — Mongo automatically deletes the document once this
     * passes, so a stale run/cache entry never lingers forever. */
    expiresAt: Date;
}

const ScannerResultSchema = new Schema<ScannerResultDoc>(
    {
        symbol: { type: String, required: true },
        companyName: { type: String },
        price: { type: Number, required: true },
        changePercent: { type: Number, required: true },
        dataTimestamp: { type: String, required: true },
        relativeVolume: { type: Number, default: null },
        rsi: { type: Number, default: null },
        trend: { type: String, required: true },
        analysis: { type: Schema.Types.Mixed, required: true },
    },
    { _id: false },
);

const ScannerSkippedSchema = new Schema<ScannerSkippedSymbol>(
    {
        symbol: { type: String, required: true },
        reason: { type: String, required: true },
    },
    { _id: false },
);

const ScannerRunSchema = new Schema<ScannerRunDocument>({
    userId: { type: String, required: true },
    universeId: { type: String, required: true },
    configFingerprint: { type: String, required: true },
    status: { type: String, enum: ['running', 'completed', 'failed'], required: true, default: 'running' },
    symbols: { type: [String], required: true },
    cursor: { type: Number, required: true, default: 0 },
    results: { type: [ScannerResultSchema], default: [] },
    skipped: { type: [ScannerSkippedSchema], default: [] },
    startedAt: { type: Date, required: true, default: Date.now },
    updatedAt: { type: Date, required: true, default: Date.now },
    completedAt: { type: Date },
    expiresAt: { type: Date, required: true },
});

// One active/cached run per (user, universe, config) — a new scan request
// reuses or advances the existing document instead of creating duplicates.
ScannerRunSchema.index({ userId: 1, universeId: 1, configFingerprint: 1 }, { unique: true });
// TTL index: Mongo removes the document once expiresAt passes.
ScannerRunSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const ScannerRun: Model<ScannerRunDocument> =
    (models?.ScannerRun as Model<ScannerRunDocument>) || model<ScannerRunDocument>('ScannerRun', ScannerRunSchema);
