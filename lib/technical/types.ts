/**
 * lib/technical is intentionally standalone: pure math over plain
 * arrays/bars, with no dependency on lib/market-data or the database. Every
 * function here is deterministic — same input always produces the same
 * output — so it can be unit tested with fixed fixtures and reused by the
 * rule engine, the scanner, and the backtester alike without ever touching
 * a network call.
 *
 * Structurally identical to market-data's HistoricalBar (so a
 * HistoricalBar[] can be passed straight in), declared separately so this
 * module has zero imports from the data-fetching layer.
 */
export interface OhlcBar {
    time: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

/** A numeric series aligned 1:1 with the input bars/values. `null` marks an
 * index where there isn't yet enough history to compute a value (the
 * indicator's warm-up period) — never a fabricated number. */
export type Series = (number | null)[];
