import type { InstrumentId } from '@/lib/market-data/types';
import type { SwingAnalysisResult } from '@/lib/swing/types';
import type { TrendDirection } from '@/lib/technical/trend';

/**
 * A single symbol's scanner row. Deliberately composes `SwingAnalysisResult`
 * (score, status, setup, rules, trade plan — already produced by
 * lib/swing/analyze.ts) rather than flattening/duplicating its fields —
 * the scanner's only job is to add the market-wide context
 * (instrument/company/price/timestamp) and a few denormalized fields the
 * result table filters/sorts on (relativeVolume, rsi, trend), never to
 * recompute or restate what the rule engine already produced.
 */
export interface ScannerResult {
    instrument: InstrumentId;
    companyName?: string;
    price: number;
    changePercent: number;
    dataTimestamp: string;
    relativeVolume: number | null;
    rsi: number | null;
    trend: TrendDirection;
    analysis: SwingAnalysisResult;
}

export function ruleCounts(analysis: SwingAnalysisResult): { passed: number; failed: number } {
    const passed = analysis.rules.filter((r) => r.passed).length;
    return { passed, failed: analysis.rules.length - passed };
}

export interface ScannerSkip {
    symbol: string;
    reason: string;
}

export type ScannerRunStatus = 'running' | 'completed' | 'failed';

export interface ScannerProgress {
    status: ScannerRunStatus;
    universeId: string;
    totalSymbols: number;
    scannedSymbols: number;
    results: ScannerResult[];
    skipped: ScannerSkip[];
    startedAt: string;
    updatedAt: string;
    completedAt?: string;
    /** True when this response came from an already-completed, still-fresh
     * cached run with no new work performed this call. */
    fromCache: boolean;
}
