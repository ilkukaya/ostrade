import { getBarsOrFetch } from '@/lib/market-data/historicalDataRepository';
import { resolveInstrument } from '@/lib/market-data/instruments/resolve';

/** Bars from entryDate (inclusive) through `through` (inclusive), for the
 * MFE/MAE calculation — see lib/trades/excursion.ts. Reads local-first
 * (see docs/daily-data-engine.md) rather than calling a market-data
 * provider directly, same as every other bar-consuming feature. Returns
 * [] rather than throwing if market data is unavailable, since excursion
 * tracking is a secondary enrichment, not the reason the trade is being
 * logged.
 *
 * Deliberately kept in a plain, non-'use server' module (not
 * lib/actions/trade.actions.ts) — every exported function in a 'use server'
 * file becomes its own publicly, anonymously invokable HTTP endpoint
 * (confirmed against .next/server/server-reference-manifest.json), even one
 * only ever called by other already-auth-checked actions in the same file.
 * createTrade/closeTrade/refreshExcursion are the only callers and are the
 * ones that must stay auth-checked. */
export async function fetchBarsSinceEntry(symbol: string, entryDate: Date, through: Date) {
    const instrument = resolveInstrument(symbol);
    const entryStr = entryDate.toISOString().slice(0, 10);
    const throughStr = through.toISOString().slice(0, 10);
    return getBarsOrFetch(instrument, { from: entryStr, to: throughStr });
}
