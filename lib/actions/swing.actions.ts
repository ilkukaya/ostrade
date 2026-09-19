// Deliberately NOT 'use server' — every exported function in a 'use server'
// file becomes its own publicly, anonymously invokable HTTP endpoint
// (confirmed against .next/server/server-reference-manifest.json), even one
// only ever called from a Server Component. getSwingAnalysis is only called
// from app/(root)/stocks/[symbol]/page.tsx, itself gated by the (root)
// layout's session check — a plain server-only module keeps it that way. Do
// not add 'use server' back without also adding a requireUserId() check
// (see lib/actions/candidate.actions.ts's requireUserId for the pattern).

import { getBarsOrFetch, getDataProvenance } from '@/lib/market-data/historicalDataRepository';
import { resolveInstrument } from '@/lib/market-data/instruments/resolve';
import { analyzeSwingSetup } from '@/lib/swing/analyze';
import type { SwingAnalysisResult } from '@/lib/swing/types';

/** Latest-N bars requested for a single stock's swing analysis — same
 * window as the scanner (see lib/scanner/service.ts's SCAN_BARS_LIMIT), so
 * a symbol's score/status is identical whether reached from the scanner or
 * the stock page: same stored bars in, same deterministic engine, same
 * result out (see docs/scanner.md's "SAME DATA + SAME STRATEGY = SAME
 * RESULT"). */
const SWING_BARS_LIMIT = 300;

export interface StockDataProvenance {
    /** YYYY-MM-DD of the most recent stored bar, or null if nothing is
     * stored for this symbol at all. */
    latestDate: string | null;
    /** Which provider produced that latest bar — never fabricated; null
     * only alongside a null latestDate. */
    provider: string | null;
    market: string;
    currency: string;
}

export type SwingAnalysisOutcome =
    | { status: 'ok'; analysis: SwingAnalysisResult; dataProvenance: StockDataProvenance }
    | { status: 'unavailable'; reason: string };

/**
 * Reads daily historical bars for a symbol from the local market-data
 * database (see docs/daily-data-engine.md's "local-first" principle —
 * historicalDataRepository.ts, not a market-data provider, is called on
 * every page load) and runs the deterministic swing-analysis engine on
 * them. A symbol that has never been seeded gets a one-time live-provider
 * fallback (see getBarsOrFetch); an already-seeded symbol is read purely
 * locally. Never fabricates a score: if no data can be found either way,
 * this returns a clear "unavailable" outcome with a reason instead of a
 * fake or partial result.
 */
export async function getSwingAnalysis(symbol: string): Promise<SwingAnalysisOutcome> {
    const instrument = resolveInstrument(symbol);
    const bars = await getBarsOrFetch(instrument, { limit: SWING_BARS_LIMIT });

    const analysis = analyzeSwingSetup(instrument.symbol, bars);
    if (!analysis) {
        return { status: 'unavailable', reason: 'No historical data available for this symbol.' };
    }

    const provenance = await getDataProvenance(instrument);
    return {
        status: 'ok',
        analysis,
        dataProvenance: {
            ...provenance,
            market: instrument.market ?? 'US',
            currency: instrument.currency ?? 'USD',
        },
    };
}
