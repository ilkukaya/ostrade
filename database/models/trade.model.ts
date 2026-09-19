import { Schema, model, models, Types, type Document, type Model } from 'mongoose';
import type { SetupType } from '@/lib/swing/types';
import type { TradeDirection, TradeStatus } from '@/lib/trades/types';

/**
 * A trade is something the owner actually executed — manually entered, no
 * broker connection or execution (see docs/journal.md). It is explicitly
 * NOT a Candidate (database/models/candidate.model.ts): a candidate is an
 * immutable signal snapshot the engine produced, while a trade is the
 * owner's own editable record of what they did, optionally referencing the
 * candidate that led to it via `candidateId`. Unlike a Candidate, a trade's
 * fields may be corrected by the owner after creation (e.g. fixing a typo'd
 * entry price) — there is no "immutability" requirement here, since a trade
 * is personal bookkeeping, not a reproducible research signal.
 */
export interface TradeDocument extends Document {
    userId: string;
    candidateId?: Types.ObjectId;

    symbol: string;
    exchange?: string;
    market?: string;
    /** Never assume USD — comes from instrument metadata at entry time, or
     * the owner's manual override (see docs/journal.md). */
    currency: string;

    direction: TradeDirection;
    setupType?: SetupType;
    strategyId?: string;
    strategyVersion?: string;

    /** When the setup was first identified, if known (usually copied from
     * the linked candidate's signalAt). */
    signalDate?: Date;
    entryDate: Date;
    entryPrice: number;
    positionSize: number;
    stopLevel?: number;
    targets?: number[];

    fees?: number;

    exitDate?: Date;
    exitPrice?: number;

    /** Computed once at close time by lib/trades/pnl.ts and stored — fees
     * and the exit price don't change after the fact, so there's no reason
     * to recompute these on every read. */
    grossPnl?: number;
    netPnl?: number;
    rMultiple?: number;

    /** Computed by lib/trades/excursion.ts — refreshed at close, and
     * refreshable on demand while still OPEN (see
     * lib/actions/trade.actions.ts::refreshExcursion). Not kept live via a
     * cron the way candidate outcomes are; see docs/journal.md. */
    maxFavorableExcursion?: number;
    maxAdverseExcursion?: number;
    mfeAt?: Date;
    maeAt?: Date;

    status: TradeStatus;
    notes?: string;

    createdAt: Date;
    updatedAt: Date;
}

const TradeSchema = new Schema<TradeDocument>(
    {
        userId: { type: String, required: true, index: true },
        candidateId: { type: Schema.Types.ObjectId, ref: 'Candidate' },

        symbol: { type: String, required: true, uppercase: true, trim: true, index: true },
        exchange: { type: String },
        market: { type: String },
        currency: { type: String, required: true },

        direction: { type: String, enum: ['LONG', 'SHORT'], required: true },
        setupType: { type: String },
        strategyId: { type: String },
        strategyVersion: { type: String },

        signalDate: { type: Date },
        entryDate: { type: Date, required: true },
        entryPrice: { type: Number, required: true },
        positionSize: { type: Number, required: true },
        stopLevel: { type: Number },
        targets: { type: [Number] },

        fees: { type: Number },

        exitDate: { type: Date },
        exitPrice: { type: Number },

        grossPnl: { type: Number },
        netPnl: { type: Number },
        rMultiple: { type: Number },

        maxFavorableExcursion: { type: Number },
        maxAdverseExcursion: { type: Number },
        mfeAt: { type: Date },
        maeAt: { type: Date },

        status: { type: String, enum: ['OPEN', 'WIN', 'LOSS', 'BREAKEVEN'], required: true, default: 'OPEN', index: true },
        notes: { type: String },
    },
    { timestamps: true },
);

// The query shapes the journal page (and, later, statistics) actually need
// — not one index per field.
TradeSchema.index({ userId: 1, status: 1, entryDate: -1 });
TradeSchema.index({ userId: 1, symbol: 1 });

export const Trade: Model<TradeDocument> = (models?.Trade as Model<TradeDocument>) || model<TradeDocument>('Trade', TradeSchema);
