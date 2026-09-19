import { Schema, model, models, type Document, type Model } from 'mongoose';

/**
 * A single "Update BIST" / "Update US" / "Update All" run — resumable,
 * batched, exactly the same pattern as ScannerRun/BacktestRun (see
 * docs/daily-data-engine.md). Doubles as the provider-diagnostics log
 * (section 19's "simple diagnostics view/log is enough" — no separate
 * ProviderHealth tracking table): `failedSymbols` records why each symbol
 * failed, and every stored MarketBar already carries its own `provider`
 * field, so "which provider served this data" is always visible without a
 * second bookkeeping system.
 */
export type MarketDataSyncRunStatus = 'running' | 'completed' | 'failed';

export interface SyncFailure {
    symbol: string;
    reason: string;
    /** Which provider in the chain the failure was attributed to (the last
     * one tried) — see service.ts::getHistoricalPricesWithProvider. */
    provider: string;
}

export interface MarketDataSyncRunDocument extends Document {
    userId: string;
    market: string;
    /** Bypasses the "already covers the latest expected session, skip it"
     * check and re-fetches every symbol regardless — see
     * lib/market-data/sync/syncService.ts. */
    forceRefresh: boolean;

    status: MarketDataSyncRunStatus;
    /** Full, fixed symbol list for this run, in processing order. */
    symbols: string[];
    /** How many of `symbols` have been processed (successfully or not) so far. */
    cursor: number;

    successfulSymbols: string[];
    /** Already covered the latest expected session — nothing to fetch. */
    unchangedSymbols: string[];
    failedSymbols: SyncFailure[];

    barsInserted: number;
    barsUpdated: number;

    startedAt: Date;
    updatedAt: Date;
    completedAt?: Date;
}

const SyncFailureSchema = new Schema<SyncFailure>(
    { symbol: { type: String, required: true }, reason: { type: String, required: true }, provider: { type: String, required: true } },
    { _id: false },
);

const MarketDataSyncRunSchema = new Schema<MarketDataSyncRunDocument>({
    userId: { type: String, required: true },
    market: { type: String, required: true },
    forceRefresh: { type: Boolean, required: true, default: false },

    status: { type: String, enum: ['running', 'completed', 'failed'], required: true, default: 'running' },
    symbols: { type: [String], required: true },
    cursor: { type: Number, required: true, default: 0 },

    successfulSymbols: { type: [String], default: [] },
    unchangedSymbols: { type: [String], default: [] },
    failedSymbols: { type: [SyncFailureSchema], default: [] },

    barsInserted: { type: Number, required: true, default: 0 },
    barsUpdated: { type: Number, required: true, default: 0 },

    startedAt: { type: Date, required: true, default: Date.now },
    updatedAt: { type: Date, required: true, default: Date.now },
    completedAt: { type: Date },
});

// Listing recent runs for a market, newest first — the one query shape the
// /data admin page actually needs.
MarketDataSyncRunSchema.index({ userId: 1, market: 1, startedAt: -1 });

export const MarketDataSyncRun: Model<MarketDataSyncRunDocument> =
    (models?.MarketDataSyncRun as Model<MarketDataSyncRunDocument>) || model<MarketDataSyncRunDocument>('MarketDataSyncRun', MarketDataSyncRunSchema);
