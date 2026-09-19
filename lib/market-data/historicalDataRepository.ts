import { connectToDatabase } from '@/database/mongoose';
import { MarketBar } from '@/database/models/marketBar.model';
import type { HistoricalBar, InstrumentId, Timeframe } from './types';
import { sanitizeBars, validateBar } from './validateBar';
import { getHistoricalPrices } from './service';

type BarLike = Pick<HistoricalBar, 'time' | 'open' | 'high' | 'low' | 'close' | 'volume'> & { adjustedClose?: number };

function toHistoricalBar(doc: BarLike): HistoricalBar {
    return {
        time: doc.time,
        open: doc.open,
        high: doc.high,
        low: doc.low,
        close: doc.close,
        adjustedClose: doc.adjustedClose,
        volume: doc.volume,
    };
}

export interface GetBarsOptions {
    timeframe?: Timeframe;
    /** YYYY-MM-DD, inclusive. */
    from?: string;
    /** YYYY-MM-DD, inclusive. */
    to?: string;
    /** Most-recent N bars — still returned in chronological order. */
    limit?: number;
}

/**
 * The one place the app reads/writes normalized daily bars — the scanner,
 * stock analysis, backtester, and candidate outcome tracking all depend on
 * this instead of calling a market-data provider directly (see
 * docs/daily-data-engine.md's "local-first scanner" principle). A
 * market-data provider is only ever consulted during a sync
 * (lib/market-data/sync/), not on every read.
 */
export async function getBars(instrument: Pick<InstrumentId, 'symbol' | 'market'>, options: GetBarsOptions = {}): Promise<HistoricalBar[]> {
    await connectToDatabase();
    const timeframe = options.timeframe ?? 'D';
    const market = instrument.market ?? 'US';
    const symbol = instrument.symbol.toUpperCase();

    const query: Record<string, unknown> = { symbol, market, timeframe };
    if (options.from || options.to) {
        const dateFilter: Record<string, string> = {};
        if (options.from) dateFilter.$gte = options.from;
        if (options.to) dateFilter.$lte = options.to;
        query.date = dateFilter;
    }

    if (options.limit) {
        const docs = await MarketBar.find(query).sort({ date: -1 }).limit(options.limit).lean();
        return docs.map((d) => toHistoricalBar({ ...d, time: d.date })).reverse();
    }

    const docs = await MarketBar.find(query).sort({ date: 1 }).lean();
    return docs.map((d) => toHistoricalBar({ ...d, time: d.date }));
}

export async function getLatestBar(instrument: Pick<InstrumentId, 'symbol' | 'market'>, timeframe: Timeframe = 'D'): Promise<HistoricalBar | null> {
    await connectToDatabase();
    const doc = await MarketBar.findOne({ symbol: instrument.symbol.toUpperCase(), market: instrument.market ?? 'US', timeframe })
        .sort({ date: -1 })
        .lean();
    return doc ? toHistoricalBar({ ...doc, time: doc.date }) : null;
}

export interface UpsertBarsResult {
    inserted: number;
    updated: number;
    rejected: Array<{ time: string; reason: string }>;
}

/**
 * Validates and upserts bars for one instrument. The unique
 * (symbol, market, timeframe, date) index on MarketBar means a repeated
 * fetch of an already-stored date safely overwrites it (picking up a
 * provider's correction) rather than creating a duplicate row — see
 * section 9/13 of the daily-data-engine design. Invalid bars are reported
 * in `rejected`, never silently stored, never silently dropped without a
 * reason.
 */
export async function upsertBars(
    instrument: Pick<InstrumentId, 'symbol' | 'market' | 'exchange' | 'currency'>,
    bars: HistoricalBar[],
    provider: string,
    timeframe: Timeframe = 'D',
): Promise<UpsertBarsResult> {
    await connectToDatabase();

    const rejected: Array<{ time: string; reason: string }> = [];
    for (const bar of bars) {
        const validation = validateBar(bar);
        if (!validation.valid) rejected.push({ time: bar.time, reason: validation.reason });
    }

    const clean = sanitizeBars(bars);
    if (clean.length === 0) {
        return { inserted: 0, updated: 0, rejected };
    }

    const symbol = instrument.symbol.toUpperCase();
    const market = instrument.market ?? 'US';
    const now = new Date();

    const ops = clean.map((bar) => ({
        updateOne: {
            filter: { symbol, market, timeframe, date: bar.time },
            update: {
                $set: {
                    symbol,
                    market,
                    timeframe,
                    date: bar.time,
                    exchange: instrument.exchange,
                    currency: instrument.currency,
                    open: bar.open,
                    high: bar.high,
                    low: bar.low,
                    close: bar.close,
                    adjustedClose: bar.adjustedClose,
                    volume: bar.volume,
                    provider,
                    fetchedAt: now,
                },
            },
            upsert: true,
        },
    }));

    const result = await MarketBar.bulkWrite(ops, { ordered: false });
    return {
        inserted: result.upsertedCount ?? 0,
        updated: result.modifiedCount ?? 0,
        rejected,
    };
}

/**
 * Reads from local storage first; if NOTHING is stored for this instrument
 * yet (never seeded), performs a one-time live provider fetch (via
 * service.ts's fallback chain), validates + upserts the result, then reads
 * from storage again. This is the "just-in-time" fallback described in
 * docs/daily-data-engine.md — it is NOT a general cache-refresh mechanism:
 * an already-seeded symbol whose data has simply gone stale is NOT
 * re-fetched here (that's a deliberate sync run's job, not something that
 * happens implicitly on every read — see lib/market-data/sync/).
 */
export async function getBarsOrFetch(
    instrument: Pick<InstrumentId, 'symbol' | 'market' | 'exchange' | 'currency'>,
    options: GetBarsOptions = {},
): Promise<HistoricalBar[]> {
    const timeframe = options.timeframe ?? 'D';
    const existing = await getBars(instrument, options);
    if (existing.length > 0) return existing;

    const fetched = await getHistoricalPrices(instrument.symbol, timeframe);
    if (!fetched.ok) return [];

    await upsertBars(instrument, fetched.data, 'just-in-time', timeframe);
    return getBars(instrument, options);
}

export interface SymbolCoverage {
    symbol: string;
    latestDate: string | null;
    barCount: number;
}

/** Bulk version of `getCoverage`, for the data-freshness dashboard — one
 * aggregation query instead of N individual ones for an entire universe's
 * worth of symbols. Symbols with no stored bars at all are still included,
 * with `latestDate: null` / `barCount: 0`, so "never synced" is visible
 * rather than silently absent from the result. */
export async function getCoverageForSymbols(symbols: string[], market: string, timeframe: Timeframe = 'D'): Promise<SymbolCoverage[]> {
    await connectToDatabase();
    const upperSymbols = symbols.map((s) => s.toUpperCase());
    if (upperSymbols.length === 0) return [];

    const grouped: Array<{ _id: string; latestDate: string; barCount: number }> = await MarketBar.aggregate([
        { $match: { symbol: { $in: upperSymbols }, market, timeframe } },
        { $group: { _id: '$symbol', latestDate: { $max: '$date' }, barCount: { $sum: 1 } } },
    ]);
    const bySymbol = new Map(grouped.map((g) => [g._id, g]));

    return upperSymbols.map((symbol) => ({
        symbol,
        latestDate: bySymbol.get(symbol)?.latestDate ?? null,
        barCount: bySymbol.get(symbol)?.barCount ?? 0,
    }));
}

export interface CoverageInfo {
    earliestDate: string | null;
    latestDate: string | null;
    barCount: number;
}

/** What's actually stored for an instrument — powers the data-freshness
 * dashboard and diagnostics (docs/daily-data-engine.md) without needing a
 * separate tracking table; this is always derived live from MarketBar. */
export async function getCoverage(instrument: Pick<InstrumentId, 'symbol' | 'market'>, timeframe: Timeframe = 'D'): Promise<CoverageInfo> {
    await connectToDatabase();
    const symbol = instrument.symbol.toUpperCase();
    const market = instrument.market ?? 'US';

    const [earliest, latest, barCount] = await Promise.all([
        MarketBar.findOne({ symbol, market, timeframe }).sort({ date: 1 }).select('date').lean(),
        MarketBar.findOne({ symbol, market, timeframe }).sort({ date: -1 }).select('date').lean(),
        MarketBar.countDocuments({ symbol, market, timeframe }),
    ]);

    return {
        earliestDate: earliest?.date ?? null,
        latestDate: latest?.date ?? null,
        barCount,
    };
}
