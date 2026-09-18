import { latestSma } from '@/lib/technical/sma';
import { latestEma } from '@/lib/technical/ema';
import { latestRsi } from '@/lib/technical/rsi';
import { macd } from '@/lib/technical/macd';
import { stochastic } from '@/lib/technical/stochastic';
import { bollingerBands } from '@/lib/technical/bollinger';
import { latestAtr } from '@/lib/technical/atr';
import { latestRelativeVolume } from '@/lib/technical/volume';
import { classifyTrend } from '@/lib/technical/trend';
import { findSupportResistanceZones } from '@/lib/technical/supportResistance';
import type { OhlcBar } from '@/lib/technical/types';
import type { SwingStrategyConfig } from './config';
import type { IndicatorSnapshot } from './types';

function last<T>(series: T[]): T {
    return series[series.length - 1];
}

/**
 * Computes every indicator value the rule engine needs, once, from a bar
 * series — so individual rules never recompute the same series
 * independently (see docs/swing-engine.md's performance notes). Returns
 * null when there isn't even a single bar to analyze; individual indicators
 * inside the snapshot are independently null when THEY don't have enough
 * warm-up history, which rules must handle explicitly rather than assume
 * away.
 */
export function buildIndicatorSnapshot(
    symbol: string,
    bars: OhlcBar[],
    config: SwingStrategyConfig,
): IndicatorSnapshot | null {
    if (bars.length === 0) return null;

    const closes = bars.map((b) => b.close);
    const latestBar = bars[bars.length - 1];
    const price = latestBar.close;

    const sma20 = latestSma(closes, config.movingAverages.short);
    const sma50 = latestSma(closes, config.movingAverages.medium);
    const sma200 = latestSma(closes, config.movingAverages.long);
    const ema9 = latestEma(closes, 9);
    const ema21 = latestEma(closes, 21);
    const rsi14 = latestRsi(closes, 14);
    const macdSeries = macd(closes);
    const stochasticSeries = stochastic(bars);
    const bollingerSeries = bollingerBands(closes);
    const atr14 = latestAtr(bars, config.atrPeriod);
    const relativeVolume = latestRelativeVolume(bars, 20);
    const trend = classifyTrend({ price, sma20, sma50, sma200 });
    const { support, resistance } = findSupportResistanceZones(bars, price, atr14, config.supportResistanceLookback);

    return {
        symbol,
        asOf: latestBar.time,
        price,
        sma20,
        sma50,
        sma200,
        ema9,
        ema21,
        rsi14,
        macd: {
            macd: last(macdSeries.macd),
            signal: last(macdSeries.signal),
            histogram: last(macdSeries.histogram),
        },
        stochastic: {
            k: last(stochasticSeries.k),
            d: last(stochasticSeries.d),
        },
        bollinger: {
            upper: last(bollingerSeries.upper),
            middle: last(bollingerSeries.middle),
            lower: last(bollingerSeries.lower),
            bandwidth: last(bollingerSeries.bandwidth),
        },
        atr14,
        relativeVolume,
        trend,
        support,
        resistance,
        bars,
    };
}
