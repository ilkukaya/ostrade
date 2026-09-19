import type { SearchResult } from './types';
import { listStaticUniverses } from './universe';
import { getBistCompanyName } from './instruments/bist';

interface LocalInstrumentEntry {
    symbol: string;
    name?: string;
    exchange: string;
}

/** Every symbol across every tracked static universe, deduplicated — built
 * fresh on each call since these lists are small and rarely change; not
 * worth caching. */
function buildLocalInstrumentIndex(): LocalInstrumentEntry[] {
    const seen = new Map<string, LocalInstrumentEntry>();
    for (const universe of listStaticUniverses()) {
        for (const instrument of universe.symbols) {
            if (seen.has(instrument.symbol)) continue;
            seen.set(instrument.symbol, {
                symbol: instrument.symbol,
                name: getBistCompanyName(instrument.symbol),
                exchange: instrument.exchange ?? universe.market,
            });
        }
    }
    return Array.from(seen.values());
}

/**
 * Symbol/company-name search over every symbol in a tracked static universe
 * (Dow 30, Nasdaq-100, S&P 500, BIST 30/50/100) — needs no external API and
 * no API key, so it works identically whether or not FINNHUB_API_KEY is
 * configured (see docs/market-data.md's "Finnhub is optional" principle).
 * A company name is only ever one already verified locally (today: BIST
 * names — see instruments/bist.ts's BIST_NAMES); a symbol with no verified
 * local name is still matchable by ticker, never given a guessed name.
 * Deliberately excludes the per-user Custom Watchlist (not a fixed,
 * searchable universe) and Finnhub's live search (kept as an optional
 * enrichment layered on top in market-data/service.ts).
 */
export function searchLocalInstruments(query: string, limit = 20): SearchResult[] {
    const trimmed = query.trim().toUpperCase();
    const index = buildLocalInstrumentIndex();

    const matches = trimmed
        ? index.filter((e) => e.symbol.includes(trimmed) || (e.name?.toUpperCase().includes(trimmed) ?? false))
        : index;

    return matches.slice(0, limit).map((e) => ({
        symbol: e.symbol,
        name: e.name ?? e.symbol,
        exchange: e.exchange,
        type: 'Common Stock',
    }));
}
