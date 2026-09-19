import { Schema, model, models, type Document, type Model } from 'mongoose';

/**
 * Normalized, permanent daily OHLCV storage — the local database the
 * scanner, stock analysis, backtester, and candidate outcome tracking
 * increasingly read from instead of calling a remote provider on every
 * request (see docs/daily-data-engine.md, "local-first"). Unlike
 * ScannerRun/BacktestRun, this has NO TTL: historical daily bars are small
 * and kept permanently (see docs/market-data.md, "Market data retention" —
 * "Daily bars are small... do not TTL-delete historical OHLCV").
 */
export interface MarketBarDocument extends Document {
    symbol: string;
    market: string;
    exchange?: string;
    currency?: string;
    timeframe: 'D' | 'W' | 'M';
    /** YYYY-MM-DD — the MARKET date (the exchange's own calendar day for
     * this session), never a naive UTC date. See lib/market-data/marketCalendar.ts. */
    date: string;

    open: number;
    high: number;
    low: number;
    close: number;
    /** Split+dividend adjusted close, when the provider distinguishes it —
     * stored for transparency only; `close` is what technical analysis and
     * backtesting always use (see docs/market-data.md's adjusted-price
     * policy). */
    adjustedClose?: number;
    volume: number;

    /** Which provider this bar came from — surfaced in diagnostics so a
     * fallback is never invisible (see docs/daily-data-engine.md). */
    provider: string;
    fetchedAt: Date;
}

const MarketBarSchema = new Schema<MarketBarDocument>({
    symbol: { type: String, required: true, uppercase: true, trim: true },
    market: { type: String, required: true },
    exchange: { type: String },
    currency: { type: String },
    timeframe: { type: String, enum: ['D', 'W', 'M'], required: true, default: 'D' },
    date: { type: String, required: true },

    open: { type: Number, required: true },
    high: { type: Number, required: true },
    low: { type: Number, required: true },
    close: { type: Number, required: true },
    adjustedClose: { type: Number },
    volume: { type: Number, required: true },

    provider: { type: String, required: true },
    fetchedAt: { type: Date, required: true, default: Date.now },
});

// The one index that matters: uniquely identifies a bar (so a repeated
// fetch of the same date safely overwrites rather than duplicates — see
// lib/market-data/historicalDataRepository.ts::upsertBars) and, scanned in
// either direction, serves every read query this app issues (a symbol's
// full history, a date range, or "most recent N"). Not one index per
// field — see the deployment brief's own indexing guidance.
MarketBarSchema.index({ symbol: 1, market: 1, timeframe: 1, date: 1 }, { unique: true });

export const MarketBar: Model<MarketBarDocument> =
    (models?.MarketBar as Model<MarketBarDocument>) || model<MarketBarDocument>('MarketBar', MarketBarSchema);
