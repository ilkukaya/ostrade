import type { OhlcBar } from '@/lib/technical/types';
import type { TrendDirection } from '@/lib/technical/trend';

export type SetupType =
    | 'BREAKOUT'
    | 'PULLBACK'
    | 'TREND_CONTINUATION'
    | 'SUPPORT_REVERSAL'
    | 'MOMENTUM'
    | 'BOLLINGER_SQUEEZE';

/** PASS = below the minimum score, not a candidate at all ("no trade").
 * WATCH = met the minimum score but at least one rule still failed.
 * QUALIFIED = met the minimum score AND every rule in the setup passed. */
export type SwingStatus = 'PASS' | 'WATCH' | 'QUALIFIED';

export interface RuleResult {
    id: string;
    name: string;
    passed: boolean;
    value?: number | string;
    score: number;
    maxScore: number;
    explanation: string;
}

export interface PriceZone {
    low: number;
    high: number;
}

export interface SwingAnalysisResult {
    symbol: string;
    timestamp: string;

    score: number;
    maxScore: number;
    setupType?: SetupType;
    status: SwingStatus;
    rules: RuleResult[];

    entryZone?: PriceZone;
    stopLevel?: number;
    targets?: number[];
    riskReward?: number;

    supportLevels?: PriceZone[];
    resistanceLevels?: PriceZone[];

    warnings?: string[];
}

export interface IndicatorSnapshot {
    symbol: string;
    asOf: string;
    price: number;
    sma20: number | null;
    sma50: number | null;
    sma200: number | null;
    ema9: number | null;
    ema21: number | null;
    rsi14: number | null;
    macd: { macd: number | null; signal: number | null; histogram: number | null };
    stochastic: { k: number | null; d: number | null };
    bollinger: { upper: number | null; middle: number | null; lower: number | null; bandwidth: number | null };
    atr14: number | null;
    relativeVolume: number | null;
    trend: TrendDirection;
    support: PriceZone[];
    resistance: PriceZone[];
    /** Raw bars, kept for setups/rules that need more context than the
     * single latest-value snapshot (e.g. a squeeze rule looking at recent
     * bandwidth trend). */
    bars: OhlcBar[];
}
