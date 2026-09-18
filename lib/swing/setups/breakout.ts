import type { SwingStrategyConfig } from '../config';
import type { IndicatorSnapshot, PriceZone, RuleResult } from '../types';

export interface TradePlan {
    entryZone?: PriceZone;
    stopLevel?: number;
    targets?: number[];
    riskReward?: number;
    warnings: string[];
}

/**
 * Builds the trade-plan levels for a breakout candidate.
 *
 * The setup this models: price has already cleared a resistance zone, which
 * — once broken — becomes the new support/invalidation reference (a
 * standard technical-analysis "role reversal"). That's why the entry/stop
 * come from `snapshot.support[0]` (the nearest zone AT OR BELOW price, i.e.
 * the level just broken) rather than `snapshot.resistance`, which by
 * definition only contains zones still ABOVE price — those become the
 * target references instead.
 *
 * Every level has a documented origin (never an arbitrary number): entry
 * and stop come from real swing-point structure when it exists; targets
 * come from the next real resistance zones above price, falling back to a
 * plain risk-multiple (2R / 3R) only when no further structure is visible.
 */
export function buildBreakoutTradePlan(snapshot: IndicatorSnapshot): TradePlan {
    const warnings: string[] = [];
    const brokenLevel = snapshot.support[0];

    if (!brokenLevel) {
        warnings.push('No support/resistance structure was found near the current price — trade plan levels are unavailable.');
        return { warnings };
    }

    const entryZone = brokenLevel;
    const entryReference = (entryZone.low + entryZone.high) / 2;
    const atrBuffer = snapshot.atr14 ?? snapshot.price * 0.02;
    const stopLevel = entryZone.low - atrBuffer * 0.5;
    const risk = entryReference - stopLevel;

    if (risk <= 0) {
        warnings.push('Computed risk (entry to stop) was not positive — trade plan levels are unavailable.');
        return { entryZone, warnings };
    }

    const nextResistance = snapshot.resistance[0];
    const target1 = nextResistance ? nextResistance.low : entryReference + risk * 2;
    if (!nextResistance) {
        warnings.push('No resistance zone found above price — Target 1 falls back to a 2R risk-multiple instead of a structural level.');
    }

    const secondResistance = snapshot.resistance[1];
    const target2 = secondResistance ? secondResistance.low : entryReference + risk * 3;
    if (!secondResistance) {
        warnings.push('No second resistance zone found above price — Target 2 falls back to a 3R risk-multiple instead of a structural level.');
    }

    const riskReward = (target1 - entryReference) / risk;

    return {
        entryZone,
        stopLevel,
        targets: [target1, target2],
        riskReward,
        warnings,
    };
}

export interface BreakoutEvaluation {
    rules: RuleResult[];
    tradePlan: TradePlan;
}

export function evaluateBreakoutSetup(snapshot: IndicatorSnapshot, config: SwingStrategyConfig): BreakoutEvaluation {
    const tradePlan = buildBreakoutTradePlan(snapshot);
    const rules: RuleResult[] = [];

    const trendPassed = snapshot.trend === 'UP';
    rules.push({
        id: 'trend',
        name: 'Trend',
        passed: trendPassed,
        value: snapshot.trend,
        score: trendPassed ? 20 : 0,
        maxScore: 20,
        explanation: trendPassed
            ? 'Price is above the 50-day average, which is above the 200-day average.'
            : `Trend is classified ${snapshot.trend}, not a confirmed uptrend.`,
    });

    const brokenLevel = snapshot.support[0];
    const atrBuffer = snapshot.atr14 ?? snapshot.price * 0.02;
    const withinBreakoutRange = brokenLevel ? snapshot.price - brokenLevel.high <= atrBuffer * 2 : false;
    rules.push({
        id: 'structure',
        name: 'Breakout Structure',
        passed: withinBreakoutRange,
        value: brokenLevel ? `${brokenLevel.low.toFixed(2)}-${brokenLevel.high.toFixed(2)}` : undefined,
        score: withinBreakoutRange ? 20 : 0,
        maxScore: 20,
        explanation: brokenLevel
            ? withinBreakoutRange
                ? `Price is still within a reasonable range of the ${brokenLevel.low.toFixed(2)}-${brokenLevel.high.toFixed(2)} level it broke above.`
                : `Price has moved too far beyond the nearest support/resistance structure (${brokenLevel.low.toFixed(2)}-${brokenLevel.high.toFixed(2)}) to call this a fresh breakout.`
            : 'No support/resistance structure was found near the current price.',
    });

    const relVol = snapshot.relativeVolume;
    const volumePassed = relVol !== null && relVol >= config.volume.relativeVolumeMinimum;
    rules.push({
        id: 'volume',
        name: 'Relative Volume',
        passed: volumePassed,
        value: relVol !== null ? Number(relVol.toFixed(2)) : undefined,
        score: volumePassed ? 15 : 0,
        maxScore: 15,
        explanation:
            relVol !== null
                ? `Volume is ${relVol.toFixed(2)}x the 20-day average (required >= ${config.volume.relativeVolumeMinimum}x).`
                : 'Relative volume could not be computed (insufficient history).',
    });

    const rsiValue = snapshot.rsi14;
    const rsiPassed = rsiValue !== null && rsiValue >= config.rsi.min && rsiValue <= config.rsi.max;
    rules.push({
        id: 'rsi',
        name: 'RSI',
        passed: rsiPassed,
        value: rsiValue !== null ? Number(rsiValue.toFixed(1)) : undefined,
        score: rsiPassed ? 15 : 0,
        maxScore: 15,
        explanation:
            rsiValue !== null
                ? `RSI is ${rsiValue.toFixed(1)} (required between ${config.rsi.min} and ${config.rsi.max}).`
                : 'RSI could not be computed (insufficient history).',
    });

    const macdHistogram = snapshot.macd.histogram;
    const macdPassed = macdHistogram !== null && macdHistogram > 0;
    rules.push({
        id: 'macd',
        name: 'MACD',
        passed: macdPassed,
        value: macdHistogram !== null ? Number(macdHistogram.toFixed(3)) : undefined,
        score: macdPassed ? 15 : 0,
        maxScore: 15,
        explanation:
            macdHistogram !== null
                ? macdPassed
                    ? 'MACD is above its signal line (bullish).'
                    : 'MACD is at or below its signal line (not confirmed bullish).'
                : 'MACD could not be computed (insufficient history).',
    });

    const riskReward = tradePlan.riskReward;
    const rrPassed = riskReward !== undefined && riskReward >= config.riskReward.minimum;
    rules.push({
        id: 'riskReward',
        name: 'Risk / Reward',
        passed: rrPassed,
        value: riskReward !== undefined ? Number(riskReward.toFixed(2)) : undefined,
        score: rrPassed ? 15 : 0,
        maxScore: 15,
        explanation:
            riskReward !== undefined
                ? `Potential risk/reward to Target 1 is ${riskReward.toFixed(2)} (required >= ${config.riskReward.minimum}).`
                : 'Risk/reward could not be computed — see warnings for the trade plan.',
    });

    return { rules, tradePlan };
}
