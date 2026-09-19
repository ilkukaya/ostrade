import { resolveMarketSymbols } from './resolveMarketSymbols';
import { getCoverageForSymbols } from '../historicalDataRepository';
import { latestExpectedCompletedSession, type MarketId } from '../marketCalendar';

export interface MarketFreshness {
    market: string;
    totalSymbols: number;
    syncedSymbols: number;
    /** Symbols with zero stored bars — never synced at all. */
    unsyncedSymbols: string[];
    /** Symbols with at least one bar, but not yet current with the latest
     * expected completed session. */
    staleSymbols: string[];
    /** The most recent bar date found across every synced symbol, or null
     * if nothing has been synced yet. */
    latestSessionDate: string | null;
    /** What "current" means right now, per lib/market-data/marketCalendar.ts. */
    expectedLatestSession: string;
    /** True only when every symbol has a bar for expectedLatestSession (or
     * later) — never reported as current just because SOME symbols are
     * caught up (see docs/daily-data-engine.md, "never make stale data
     * look current"). */
    isCurrent: boolean;
}

/**
 * The data-freshness dashboard's core computation — one aggregation query
 * (via getCoverageForSymbols) rather than one query per symbol. Deliberately
 * conservative: `isCurrent` requires the WHOLE universe to be caught up, not
 * just an average or a majority.
 */
export async function getMarketFreshness(market: string): Promise<MarketFreshness> {
    const instruments = resolveMarketSymbols(market);
    const symbols = instruments.map((i) => i.symbol);
    const coverage = await getCoverageForSymbols(symbols, market);
    const expectedLatestSession = latestExpectedCompletedSession(market as MarketId);

    const synced = coverage.filter((c) => c.latestDate !== null);
    const unsyncedSymbols = coverage.filter((c) => c.latestDate === null).map((c) => c.symbol);
    const staleSymbols = synced.filter((c) => (c.latestDate as string) < expectedLatestSession).map((c) => c.symbol);
    const latestSessionDate = synced.reduce<string | null>((max, c) => {
        const date = c.latestDate as string;
        return max === null || date > max ? date : max;
    }, null);

    return {
        market,
        totalSymbols: symbols.length,
        syncedSymbols: synced.length,
        unsyncedSymbols,
        staleSymbols,
        latestSessionDate,
        expectedLatestSession,
        isCurrent: symbols.length > 0 && unsyncedSymbols.length === 0 && staleSymbols.length === 0,
    };
}
