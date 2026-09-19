import type { SetupType } from '@/lib/swing/types';

/** A trade is always either long (bought first) or short (sold first) — the
 * only setup implemented today (BREAKOUT) is long-only, but the journal is
 * manual-entry, so a trader can log a short taken outside the engine. */
export type TradeDirection = 'LONG' | 'SHORT';

/** OPEN until an exit is recorded; the three closed outcomes are mutually
 * exclusive and derived purely from netPnl's sign (see lib/trades/pnl.ts) —
 * there is no separate generic "CLOSED" state, since a closed trade is
 * always exactly one of WIN/LOSS/BREAKEVEN. */
export type TradeStatus = 'OPEN' | 'WIN' | 'LOSS' | 'BREAKEVEN';

/**
 * The client-facing shape of a Trade document — plain data (dates as ISO
 * strings, `_id`/`candidateId` as strings) after
 * `JSON.parse(JSON.stringify(...))`, never the Mongoose Document itself.
 * Mirrors lib/candidates/types.ts's SerializedCandidate convention.
 */
export interface SerializedTrade {
    _id: string;
    userId: string;
    candidateId?: string;

    symbol: string;
    exchange?: string;
    market?: string;
    currency: string;

    direction: TradeDirection;
    setupType?: SetupType;
    strategyId?: string;
    strategyVersion?: string;

    signalDate?: string;
    entryDate: string;
    entryPrice: number;
    positionSize: number;
    stopLevel?: number;
    targets?: number[];

    fees?: number;

    exitDate?: string;
    exitPrice?: number;

    grossPnl?: number;
    netPnl?: number;
    rMultiple?: number;

    maxFavorableExcursion?: number;
    maxAdverseExcursion?: number;
    mfeAt?: string;
    maeAt?: string;

    status: TradeStatus;
    notes?: string;

    createdAt: string;
    updatedAt: string;
}
