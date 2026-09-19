import type { InstrumentId } from './types';
import { DOW_30_SYMBOLS } from './universes/dow30';
import { NASDAQ_100_SYMBOLS } from './universes/nasdaq100';
import { SP_500_SYMBOLS } from './universes/sp500';
import { BIST_30_SYMBOLS } from './universes/bist30';
import { BIST_50_ADDITIONAL_SYMBOLS } from './universes/bist50';
import { BIST_100_ADDITIONAL_SYMBOLS } from './universes/bist100';
import { buildBistInstrument } from './instruments/bist';

export interface MarketUniverse {
    id: string;
    name: string;
    market: string;
    symbols: InstrumentId[];
    /** When this static snapshot was put together — these lists drift from
     * actual index membership over time and need periodic manual review;
     * they are never scraped or re-fetched live. See docs/market-data.md. */
    asOf: string;
    /** Set only on a universe that is explicitly a partial/curated subset
     * of a larger real index (see universes/sp500.ts), so the UI can be
     * honest about it instead of implying full membership. */
    partial?: boolean;
}

function toInstruments(symbols: readonly string[]): InstrumentId[] {
    return symbols.map((symbol) => ({ symbol, exchange: 'US', market: 'US', currency: 'USD' }));
}

function toBistInstruments(symbols: readonly string[]): InstrumentId[] {
    return symbols.map((symbol) => buildBistInstrument(symbol));
}

const BIST_50_SYMBOLS = [...BIST_30_SYMBOLS, ...BIST_50_ADDITIONAL_SYMBOLS];
const BIST_100_SYMBOLS = [...BIST_50_SYMBOLS, ...BIST_100_ADDITIONAL_SYMBOLS];

const STATIC_UNIVERSES: Record<string, MarketUniverse> = {
    'dow-30': {
        id: 'dow-30',
        name: 'Dow Jones Industrial Average',
        market: 'US',
        symbols: toInstruments(DOW_30_SYMBOLS),
        asOf: '2025-01',
    },
    'nasdaq-100': {
        id: 'nasdaq-100',
        name: 'Nasdaq-100',
        market: 'US',
        symbols: toInstruments(NASDAQ_100_SYMBOLS),
        asOf: '2025-01',
        partial: true,
    },
    'sp-500': {
        id: 'sp-500',
        name: 'S&P 500 (curated subset)',
        market: 'US',
        symbols: toInstruments(SP_500_SYMBOLS),
        asOf: '2025-01',
        partial: true,
    },
    'bist-30': {
        id: 'bist-30',
        name: 'BIST 30',
        market: 'TR',
        symbols: toBistInstruments(BIST_30_SYMBOLS),
        asOf: '2025-01',
        partial: true,
    },
    'bist-50': {
        id: 'bist-50',
        name: 'BIST 50',
        market: 'TR',
        symbols: toBistInstruments(BIST_50_SYMBOLS),
        asOf: '2025-01',
        partial: true,
    },
    'bist-100': {
        id: 'bist-100',
        name: 'BIST 100 (curated subset)',
        market: 'TR',
        symbols: toBistInstruments(BIST_100_SYMBOLS),
        asOf: '2025-01',
        partial: true,
    },
};

/** Static universes only — excludes the per-user "Custom Watchlist" pseudo
 * universe, which has no fixed symbol list and must be resolved with a
 * userId (see lib/scanner/service.ts's resolveUniverseSymbols). */
export function listStaticUniverses(): MarketUniverse[] {
    return Object.values(STATIC_UNIVERSES);
}

export function getStaticUniverse(id: string): MarketUniverse | null {
    return STATIC_UNIVERSES[id] ?? null;
}

export const CUSTOM_WATCHLIST_UNIVERSE_ID = 'custom-watchlist';

/** Universe metadata for the picker UI — includes the dynamic "Custom
 * Watchlist" entry (symbol count unknown until resolved per-user) alongside
 * the static ones. */
export function listUniverseOptions(): Array<{ id: string; name: string; market: string; symbolCount: number | null; partial?: boolean }> {
    return [
        { id: CUSTOM_WATCHLIST_UNIVERSE_ID, name: 'Custom Watchlist', market: 'ALL', symbolCount: null },
        ...listStaticUniverses().map((u) => ({ id: u.id, name: u.name, market: u.market, symbolCount: u.symbols.length, partial: u.partial })),
    ];
}
