'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { getAuth } from '@/lib/better-auth/auth';
import { connectToDatabase } from '@/database/mongoose';
import { Trade } from '@/database/models/trade.model';
import { Candidate } from '@/database/models/candidate.model';
import { getHistoricalPrices, getQuote } from '@/lib/market-data/service';
import { calculateExcursion } from '@/lib/trades/excursion';
import { computeTradeFinancials } from '@/lib/trades/pnl';
import type { TradeDirection, TradeStatus, SerializedTrade } from '@/lib/trades/types';

async function requireUserId(): Promise<string> {
    const auth = await getAuth();
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
        throw new Error('Not authenticated');
    }
    return session.user.id;
}

/** Bars from entryDate (inclusive) through `through` (inclusive), for the
 * MFE/MAE calculation — see lib/trades/excursion.ts. Returns [] rather than
 * throwing if market data is unavailable, since excursion tracking is a
 * secondary enrichment, not the reason the trade is being logged. */
async function fetchBarsSinceEntry(symbol: string, entryDate: Date, through: Date) {
    const barsResult = await getHistoricalPrices(symbol, 'D');
    if (!barsResult.ok) return [];
    const entryStr = entryDate.toISOString().slice(0, 10);
    const throughStr = through.toISOString().slice(0, 10);
    return barsResult.data.filter((b) => b.time >= entryStr && b.time <= throughStr);
}

export interface CreateTradeParams {
    candidateId?: string;
    symbol: string;
    exchange?: string;
    market?: string;
    currency: string;
    direction: TradeDirection;
    setupType?: string;
    entryDate: string;
    entryPrice: number;
    positionSize: number;
    stopLevel?: number;
    targets?: number[];
    fees?: number;
    notes?: string;
}

export type CreateTradeOutcome = { success: true; tradeId: string } | { success: false; error: string };

/**
 * Logs a trade the owner actually took. No broker execution, ever — this is
 * a manual record (see docs/journal.md). If `candidateId` is given, the
 * setup/strategy/signal-date fields are copied from that (immutable)
 * candidate rather than trusting client input for them.
 */
export async function createTrade(params: CreateTradeParams): Promise<CreateTradeOutcome> {
    const userId = await requireUserId();
    await connectToDatabase();

    if (!(params.positionSize > 0)) {
        return { success: false, error: 'Position size must be greater than zero.' };
    }
    if (!(params.entryPrice > 0)) {
        return { success: false, error: 'Entry price must be greater than zero.' };
    }

    let setupType: string | undefined;
    let strategyId: string | undefined;
    let strategyVersion: string | undefined;
    let signalDate: Date | undefined;

    if (params.candidateId) {
        const candidate = await Candidate.findOne({ _id: params.candidateId, userId }).lean();
        if (!candidate) {
            return { success: false, error: 'Linked candidate not found.' };
        }
        setupType = candidate.setupType;
        strategyId = candidate.strategyId;
        strategyVersion = candidate.strategyVersion;
        signalDate = candidate.signalAt;
    } else {
        setupType = params.setupType;
    }

    const entryDate = new Date(params.entryDate);
    const excursion = calculateExcursion({
        direction: params.direction,
        entryPrice: params.entryPrice,
        bars: await fetchBarsSinceEntry(params.symbol, entryDate, new Date()),
    });

    const doc = await Trade.create({
        userId,
        candidateId: params.candidateId,
        symbol: params.symbol.toUpperCase(),
        exchange: params.exchange,
        market: params.market,
        currency: params.currency,
        direction: params.direction,
        setupType,
        strategyId,
        strategyVersion,
        signalDate,
        entryDate,
        entryPrice: params.entryPrice,
        positionSize: params.positionSize,
        stopLevel: params.stopLevel,
        targets: params.targets,
        fees: params.fees,
        notes: params.notes,
        maxFavorableExcursion: excursion.maxFavorableExcursion,
        maxAdverseExcursion: excursion.maxAdverseExcursion,
        mfeAt: excursion.mfeAt ? new Date(excursion.mfeAt) : undefined,
        maeAt: excursion.maeAt ? new Date(excursion.maeAt) : undefined,
        status: 'OPEN',
    });

    revalidatePath('/journal');
    return { success: true, tradeId: String(doc._id) };
}

/** Best-effort currency lookup for the "Log Trade" form — never assumes
 * USD; the caller falls back to a user-editable form default when this
 * fails, it never silently substitutes one on the server. */
export async function lookupInstrumentCurrency(symbol: string): Promise<string | null> {
    const quoteResult = await getQuote(symbol);
    return quoteResult.ok ? quoteResult.data.currency : null;
}

export interface ListTradesParams {
    status?: TradeStatus | 'ALL';
}

export async function listTrades(params: ListTradesParams = {}): Promise<SerializedTrade[]> {
    const userId = await requireUserId();
    await connectToDatabase();

    const query: Record<string, unknown> = { userId };
    if (params.status && params.status !== 'ALL') query.status = params.status;

    const trades = await Trade.find(query).sort({ entryDate: -1 }).lean();
    return JSON.parse(JSON.stringify(trades));
}

export interface CloseTradeParams {
    tradeId: string;
    exitDate: string;
    exitPrice: number;
    fees?: number;
}

export type CloseTradeOutcome = { success: true } | { success: false; error: string };

/** Records the exit, computes final P/L + R-multiple, and refreshes
 * MFE/MAE over the full entry-to-exit window. Only ever acts on a trade
 * that is still OPEN — closing is a one-way transition (correct a mistake
 * by deleting and re-logging, not by re-closing). */
export async function closeTrade(params: CloseTradeParams): Promise<CloseTradeOutcome> {
    const userId = await requireUserId();
    await connectToDatabase();

    const trade = await Trade.findOne({ _id: params.tradeId, userId, status: 'OPEN' });
    if (!trade) {
        return { success: false, error: 'Open trade not found.' };
    }
    if (!(params.exitPrice > 0)) {
        return { success: false, error: 'Exit price must be greater than zero.' };
    }

    const exitDate = new Date(params.exitDate);
    const financials = computeTradeFinancials({
        direction: trade.direction,
        entryPrice: trade.entryPrice,
        exitPrice: params.exitPrice,
        positionSize: trade.positionSize,
        fees: params.fees,
        stopLevel: trade.stopLevel,
    });
    const excursion = calculateExcursion({
        direction: trade.direction,
        entryPrice: trade.entryPrice,
        bars: await fetchBarsSinceEntry(trade.symbol, trade.entryDate, exitDate),
    });

    trade.exitDate = exitDate;
    trade.exitPrice = params.exitPrice;
    trade.fees = params.fees;
    trade.grossPnl = financials.grossPnl;
    trade.netPnl = financials.netPnl;
    trade.rMultiple = financials.rMultiple;
    trade.status = financials.status;
    trade.maxFavorableExcursion = excursion.maxFavorableExcursion;
    trade.maxAdverseExcursion = excursion.maxAdverseExcursion;
    trade.mfeAt = excursion.mfeAt ? new Date(excursion.mfeAt) : undefined;
    trade.maeAt = excursion.maeAt ? new Date(excursion.maeAt) : undefined;
    await trade.save();

    revalidatePath('/journal');
    return { success: true };
}

/** Recomputes MFE/MAE from entryDate through today for a still-OPEN trade
 * — there is no cron keeping this live (unlike candidate outcome tracking),
 * so a trader watching a long-running open position calls this on demand. */
export async function refreshExcursion(tradeId: string): Promise<{ success: boolean }> {
    const userId = await requireUserId();
    await connectToDatabase();

    const trade = await Trade.findOne({ _id: tradeId, userId, status: 'OPEN' });
    if (!trade) return { success: false };

    const excursion = calculateExcursion({
        direction: trade.direction,
        entryPrice: trade.entryPrice,
        bars: await fetchBarsSinceEntry(trade.symbol, trade.entryDate, new Date()),
    });
    trade.maxFavorableExcursion = excursion.maxFavorableExcursion;
    trade.maxAdverseExcursion = excursion.maxAdverseExcursion;
    trade.mfeAt = excursion.mfeAt ? new Date(excursion.mfeAt) : undefined;
    trade.maeAt = excursion.maeAt ? new Date(excursion.maeAt) : undefined;
    await trade.save();

    revalidatePath('/journal');
    return { success: true };
}

export async function deleteTrade(tradeId: string): Promise<{ success: boolean }> {
    const userId = await requireUserId();
    await connectToDatabase();

    await Trade.deleteOne({ _id: tradeId, userId });
    revalidatePath('/journal');
    return { success: true };
}
