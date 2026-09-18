import type { Series } from './types';

/** Wilder's RSI (the standard 14-period definition). `result[i]` is null
 * until index `period` (needs `period` price changes, i.e. `period + 1`
 * closes). A flat run with zero average loss reads as 100, not NaN. */
export function rsi(closes: number[], period = 14): Series {
    if (period <= 0) throw new Error('period must be a positive integer');

    const result: Series = new Array(closes.length).fill(null);
    if (closes.length < period + 1) return result;

    let gainSum = 0;
    let lossSum = 0;
    for (let i = 1; i <= period; i++) {
        const change = closes[i] - closes[i - 1];
        if (change > 0) gainSum += change;
        else lossSum -= change;
    }

    let avgGain = gainSum / period;
    let avgLoss = lossSum / period;
    result[period] = toRsi(avgGain, avgLoss);

    for (let i = period + 1; i < closes.length; i++) {
        const change = closes[i] - closes[i - 1];
        const gain = change > 0 ? change : 0;
        const loss = change < 0 ? -change : 0;
        avgGain = (avgGain * (period - 1) + gain) / period;
        avgLoss = (avgLoss * (period - 1) + loss) / period;
        result[i] = toRsi(avgGain, avgLoss);
    }

    return result;
}

function toRsi(avgGain: number, avgLoss: number): number {
    if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
    const rs = avgGain / avgLoss;
    return 100 - 100 / (1 + rs);
}

export function latestRsi(closes: number[], period = 14): number | null {
    const series = rsi(closes, period);
    return series.length > 0 ? series[series.length - 1] : null;
}
