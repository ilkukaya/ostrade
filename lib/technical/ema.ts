import type { Series } from './types';

/** Exponential Moving Average, seeded with a plain SMA of the first
 * `period` values (the standard convention). `result[i]` is null before
 * index `period - 1`. */
export function ema(values: number[], period: number): Series {
    if (period <= 0) throw new Error('period must be a positive integer');

    const result: Series = new Array(values.length).fill(null);
    if (values.length < period) return result;

    const k = 2 / (period + 1);
    let seed = 0;
    for (let i = 0; i < period; i++) seed += values[i];
    let previous = seed / period;
    result[period - 1] = previous;

    for (let i = period; i < values.length; i++) {
        previous = values[i] * k + previous * (1 - k);
        result[i] = previous;
    }

    return result;
}

export function latestEma(values: number[], period: number): number | null {
    const series = ema(values, period);
    return series.length > 0 ? series[series.length - 1] : null;
}
