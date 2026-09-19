import type { OhlcBar } from '@/lib/technical/types';
import { defaultSwingStrategyConfig, type SwingStrategyConfig } from './config';
import { buildIndicatorSnapshot } from './indicatorSnapshot';
import { evaluateBreakoutSetup } from './setups/breakout';
import { aggregateScore, determineStatus } from './score';
import type { IndicatorSnapshot, SwingAnalysisResult } from './types';

export interface SwingAnalysis {
    snapshot: IndicatorSnapshot;
    result: SwingAnalysisResult;
}

/**
 * Same as `analyzeSwingSetup`, but also returns the `IndicatorSnapshot` used
 * to produce the result — needed by callers (the scanner, in particular)
 * that want cheap access to raw indicator readings (RSI, relative volume,
 * trend) for filtering/sorting without recomputing them from bars a second
 * time. `analyzeSwingSetup` below is a thin wrapper over this for callers
 * that only need the result.
 */
export function analyzeSwingSetupDetailed(
    symbol: string,
    bars: OhlcBar[],
    config: SwingStrategyConfig = defaultSwingStrategyConfig,
): SwingAnalysis | null {
    const snapshot = buildIndicatorSnapshot(symbol, bars, config);
    if (!snapshot) return null;

    const { rules, tradePlan } = evaluateBreakoutSetup(snapshot, config);
    const { score, maxScore } = aggregateScore(rules);
    const status = determineStatus(score, rules, config);

    const result: SwingAnalysisResult = {
        symbol,
        timestamp: new Date().toISOString(),
        score,
        maxScore,
        setupType: 'BREAKOUT',
        status,
        rules,
        entryZone: tradePlan.entryZone,
        stopLevel: tradePlan.stopLevel,
        targets: tradePlan.targets,
        riskReward: tradePlan.riskReward,
        supportLevels: snapshot.support,
        resistanceLevels: snapshot.resistance,
        warnings: tradePlan.warnings.length > 0 ? tradePlan.warnings : undefined,
    };

    return { snapshot, result };
}

/**
 * The single entry point for swing analysis: same bars + same config always
 * produce the same result (no randomness, no wall-clock dependence beyond
 * the `timestamp` field, no network calls). Returns null only when there
 * isn't even one bar to look at — callers should show "Unavailable" rather
 * than inventing a score in that case; every other case at least returns
 * warnings explaining what could and couldn't be computed.
 *
 * Only BREAKOUT is implemented so far — see docs/swing-engine.md for the
 * setup types the architecture leaves room for (PULLBACK,
 * TREND_CONTINUATION, SUPPORT_REVERSAL, MOMENTUM, BOLLINGER_SQUEEZE).
 */
export function analyzeSwingSetup(
    symbol: string,
    bars: OhlcBar[],
    config: SwingStrategyConfig = defaultSwingStrategyConfig,
): SwingAnalysisResult | null {
    return analyzeSwingSetupDetailed(symbol, bars, config)?.result ?? null;
}
