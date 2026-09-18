import { MarketDataError, type HistoricalBar } from '@/lib/market-data/types';

/**
 * Stooq (stooq.com) daily-bar CSV endpoint.
 *
 * Why this exists: Finnhub's free tier does not include historical daily
 * candles (`/stock/candle` returns a plan-restriction error for most free
 * keys), but the entire technical-analysis / swing-scoring / backtesting
 * engine needs real OHLC history to run on. Stooq publishes free, no-key
 * daily bars for US-listed tickers and is a long-standing source used by
 * open-source market-data tooling for exactly this gap.
 *
 * This is used only as a fallback inside the Finnhub provider's
 * getHistoricalPrices — see providers/finnhub.ts. Treat it as best-effort:
 * if the format ever changes or a symbol isn't covered, callers get a
 * MarketDataError instead of fabricated bars (never invented data).
 */

const STOOQ_BASE_URL = 'https://stooq.com/q/d/l/';

/** Parses Stooq's `Date,Open,High,Low,Close,Volume` daily CSV into bars.
 * Exported standalone (no network) so it can be unit-tested with fixtures. */
export function parseStooqDailyCsv(csv: string): HistoricalBar[] {
    const lines = csv
        .trim()
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

    if (lines.length === 0) {
        return [];
    }

    const [header, ...rows] = lines;
    const columns = header.split(',').map((c) => c.trim().toLowerCase());
    const idx = {
        date: columns.indexOf('date'),
        open: columns.indexOf('open'),
        high: columns.indexOf('high'),
        low: columns.indexOf('low'),
        close: columns.indexOf('close'),
        volume: columns.indexOf('volume'),
    };

    if (idx.date === -1 || idx.open === -1 || idx.high === -1 || idx.low === -1 || idx.close === -1) {
        throw new MarketDataError('bad_response', 'Unexpected Stooq CSV header format');
    }

    const bars: HistoricalBar[] = [];
    for (const row of rows) {
        const cells = row.split(',');
        const time = cells[idx.date];
        const open = Number(cells[idx.open]);
        const high = Number(cells[idx.high]);
        const low = Number(cells[idx.low]);
        const close = Number(cells[idx.close]);
        const volume = idx.volume !== -1 ? Number(cells[idx.volume]) : 0;

        // Skip corrupt rows rather than feeding bad data into indicators
        // (missing OHLC, non-numeric fields, high < low, etc.)
        if (!time || ![open, high, low, close, volume].every(Number.isFinite)) continue;
        if (high < low) continue;
        if (close > high || close < low) continue;

        bars.push({ time, open, high, low, close, volume });
    }

    // Stooq returns oldest-first already, but don't assume — sort explicitly
    // and drop any duplicate timestamps.
    bars.sort((a, b) => a.time.localeCompare(b.time));
    const deduped: HistoricalBar[] = [];
    for (const bar of bars) {
        if (deduped.length > 0 && deduped[deduped.length - 1].time === bar.time) continue;
        deduped.push(bar);
    }
    return deduped;
}

function toStooqSymbol(symbol: string): string {
    // Stooq expects a market suffix; default to the US market since that's
    // the only universe this app currently covers end-to-end. Symbols that
    // already carry a Finnhub-style exchange suffix (e.g. "BARC.L") aren't
    // translated here — historical bars for non-US symbols are simply
    // reported unavailable rather than guessed at.
    return `${symbol.toLowerCase()}.us`;
}

export async function fetchStooqDailyBars(symbol: string): Promise<HistoricalBar[]> {
    const url = `${STOOQ_BASE_URL}?s=${encodeURIComponent(toStooqSymbol(symbol))}&i=d`;

    let res: Response;
    try {
        res = await fetch(url, { cache: 'force-cache', next: { revalidate: 21600 } });
    } catch {
        throw new MarketDataError('network', `Could not reach Stooq for ${symbol}`);
    }

    if (!res.ok) {
        throw new MarketDataError('unavailable', `Stooq returned HTTP ${res.status} for ${symbol}`);
    }

    const csv = await res.text();
    if (/no data/i.test(csv)) {
        throw new MarketDataError('not_found', `Stooq has no historical data for ${symbol}`);
    }

    return parseStooqDailyCsv(csv);
}
