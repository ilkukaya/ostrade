import type { OhlcBar, Series } from './types';

/** Average True Range (Wilder's smoothing). True range accounts for gaps
 * between sessions, not just the current bar's high/low. `result[i]` is
 * null until index `period` (the first true range needs the prior bar). */
export function atr(bars: OhlcBar[], period = 14): Series {
    const result: Series = new Array(bars.length).fill(null);
    if (bars.length < period + 1) return result;

    const trueRanges: number[] = [];
    for (let i = 1; i < bars.length; i++) {
        const highLow = bars[i].high - bars[i].low;
        const highPrevClose = Math.abs(bars[i].high - bars[i - 1].close);
        const lowPrevClose = Math.abs(bars[i].low - bars[i - 1].close);
        trueRanges.push(Math.max(highLow, highPrevClose, lowPrevClose));
    }
    // trueRanges[j] corresponds to bars[j + 1]

    let value = 0;
    for (let j = 0; j < period; j++) value += trueRanges[j];
    value /= period;
    result[period] = value;

    for (let j = period; j < trueRanges.length; j++) {
        value = (value * (period - 1) + trueRanges[j]) / period;
        result[j + 1] = value;
    }

    return result;
}

export function latestAtr(bars: OhlcBar[], period = 14): number | null {
    const series = atr(bars, period);
    return series.length > 0 ? series[series.length - 1] : null;
}
