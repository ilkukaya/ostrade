'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { getAuth } from '@/lib/better-auth/auth';
import { connectToDatabase } from '@/database/mongoose';
import { Holding } from '@/database/models/holding.model';
import { getQuotesForSymbols } from '@/lib/market-data/service';
import { blendAverageCost, valuatePortfolio, type PortfolioValuation } from '@/lib/portfolio/valuation';

async function requireUserId(): Promise<string> {
    const auth = await getAuth();
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
        throw new Error('Not authenticated');
    }
    return session.user.id;
}

export interface AddHoldingParams {
    symbol: string;
    quantity: number;
    averageCost: number;
    currency: string;
    notes?: string;
}

export type AddHoldingOutcome = { success: true } | { success: false; error: string };

/** Adds a position. If the owner already holds this symbol, blends into
 * the existing row (weighted-average cost) rather than creating a second
 * line item for the same symbol — see database/models/holding.model.ts. */
export async function addHolding(params: AddHoldingParams): Promise<AddHoldingOutcome> {
    const userId = await requireUserId();

    if (!(params.quantity > 0)) return { success: false, error: 'Quantity must be greater than zero.' };
    if (!(params.averageCost > 0)) return { success: false, error: 'Average cost must be greater than zero.' };

    await connectToDatabase();
    const symbol = params.symbol.toUpperCase();
    const existing = await Holding.findOne({ userId, symbol });

    if (existing) {
        if (existing.currency !== params.currency) {
            return { success: false, error: `This position is already tracked in ${existing.currency} — cannot mix currencies for the same symbol.` };
        }
        const blended = blendAverageCost(existing.quantity, existing.averageCost, params.quantity, params.averageCost);
        existing.quantity = blended.quantity;
        existing.averageCost = blended.averageCost;
        if (params.notes) existing.notes = params.notes;
        await existing.save();
    } else {
        await Holding.create({
            userId,
            symbol,
            quantity: params.quantity,
            averageCost: params.averageCost,
            currency: params.currency,
            notes: params.notes,
        });
    }

    revalidatePath('/portfolio');
    return { success: true };
}

/** No separate "edit" action — correcting a mistake means delete and
 * re-add, the same precedent already established for the Trade Journal
 * (docs/journal.md), which keeps this one small addHolding/deleteHolding
 * surface the only thing to keep in sync with the blend-on-add behavior. */
export async function deleteHolding(holdingId: string): Promise<{ success: boolean }> {
    const userId = await requireUserId();
    await connectToDatabase();
    await Holding.deleteOne({ _id: holdingId, userId });
    revalidatePath('/portfolio');
    return { success: true };
}

export interface SerializedHolding {
    _id: string;
    symbol: string;
    quantity: number;
    averageCost: number;
    currency: string;
    notes?: string;
}

export async function getPortfolioValuation(): Promise<{ holdings: SerializedHolding[]; valuation: PortfolioValuation }> {
    const userId = await requireUserId();
    await connectToDatabase();

    const docs = await Holding.find({ userId }).sort({ symbol: 1 }).lean();
    const holdings: SerializedHolding[] = docs.map((d) => ({
        _id: String(d._id),
        symbol: d.symbol,
        quantity: d.quantity,
        averageCost: d.averageCost,
        currency: d.currency,
        notes: d.notes,
    }));

    const quotes = await getQuotesForSymbols(holdings.map((h) => h.symbol));
    const quotesBySymbol = Object.fromEntries(quotes.map((q) => [q.symbol, q.price]));

    const valuation = valuatePortfolio(holdings, quotesBySymbol);
    return { holdings, valuation };
}
