'use server';

import { getHistoricalPrices } from '@/lib/market-data/service';
import { describeMarketDataError } from '@/lib/market-data/types';
import { analyzeSwingSetup } from '@/lib/swing/analyze';
import type { SwingAnalysisResult } from '@/lib/swing/types';

export type SwingAnalysisOutcome =
    | { status: 'ok'; analysis: SwingAnalysisResult }
    | { status: 'unavailable'; reason: string };

/**
 * Fetches daily historical bars for a symbol and runs the deterministic
 * swing-analysis engine on them. Never fabricates a score: if historical
 * data can't be obtained (e.g. the configured Finnhub plan doesn't include
 * candles and Stooq has no coverage for this symbol), this returns a clear
 * "unavailable" outcome with a reason instead of a fake or partial result.
 */
export async function getSwingAnalysis(symbol: string): Promise<SwingAnalysisOutcome> {
    const barsResult = await getHistoricalPrices(symbol, 'D');
    if (!barsResult.ok) {
        return { status: 'unavailable', reason: describeMarketDataError(barsResult.error) };
    }

    const analysis = analyzeSwingSetup(symbol, barsResult.data);
    if (!analysis) {
        return { status: 'unavailable', reason: 'No historical data available for this symbol.' };
    }

    return { status: 'ok', analysis };
}
