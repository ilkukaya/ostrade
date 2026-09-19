import { Schema, model, models, type Document, type Model } from 'mongoose';

/**
 * A manually-entered portfolio position — no broker connection or
 * execution, same principle as the Trade Journal (docs/journal.md). One
 * document per (user, symbol): adding more of a symbol the owner already
 * holds blends into this same row (weighted-average cost) rather than
 * creating a second line item, matching how a real position works. See
 * docs/portfolio.md.
 */
export interface HoldingDocument extends Document {
    userId: string;
    symbol: string;
    quantity: number;
    averageCost: number;
    currency: string;
    notes?: string;
    createdAt: Date;
    updatedAt: Date;
}

const HoldingSchema = new Schema<HoldingDocument>(
    {
        userId: { type: String, required: true, index: true },
        symbol: { type: String, required: true, uppercase: true, trim: true },
        quantity: { type: Number, required: true },
        averageCost: { type: Number, required: true },
        currency: { type: String, required: true },
        notes: { type: String },
    },
    { timestamps: true },
);

// One row per (user, symbol) — enforced here so "add more of a symbol I
// already hold" is structurally a blend, never an accidental duplicate row.
HoldingSchema.index({ userId: 1, symbol: 1 }, { unique: true });

export const Holding: Model<HoldingDocument> = (models?.Holding as Model<HoldingDocument>) || model<HoldingDocument>('Holding', HoldingSchema);
