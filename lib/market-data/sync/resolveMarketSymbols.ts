import type { InstrumentId } from '../types';
import { listStaticUniverses } from '../universe';

/**
 * Every distinct symbol the dedicated sync engine covers for a market — the
 * union of all static universes for that market (Dow 30 + Nasdaq-100 +
 * S&P 500 for US; BIST 30/50/100 for TR, deduplicated since BIST 100
 * already contains the smaller tiers). A symbol appearing in more than one
 * universe (e.g. AAPL in both Dow 30 and Nasdaq-100) is only synced once.
 *
 * Deliberately excludes the per-user Custom Watchlist — a personally-added
 * symbol is synced lazily instead, the first time something reads it via
 * `historicalDataRepository.ts::getBarsOrFetch` (see docs/daily-data-engine.md).
 * Proactive daily sync is reserved for the bulk, shared universes.
 */
export function resolveMarketSymbols(market: string): InstrumentId[] {
    const seen = new Map<string, InstrumentId>();
    for (const universe of listStaticUniverses()) {
        if (universe.market !== market) continue;
        for (const instrument of universe.symbols) {
            if (!seen.has(instrument.symbol)) seen.set(instrument.symbol, instrument);
        }
    }
    return Array.from(seen.values());
}
