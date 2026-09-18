import type { Series } from './types';

/** Simple Moving Average. `result[i]` is null until index `period - 1`. */
export function sma(values: number[], period: number): Series {
    if (period <= 0) throw new Error('period must be a positive integer');

    const result: Series = new Array(values.length).fill(null);
    let sum = 0;

    for (let i = 0; i < values.length; i++) {
        sum += values[i];
        if (i >= period) sum -= values[i - period];
        if (i >= period - 1) result[i] = sum / period;
    }

    return result;
}

/** The most recent SMA value, or null if there isn't enough history yet. */
export function latestSma(values: number[], period: number): number | null {
    const series = sma(values, period);
    return series.length > 0 ? series[series.length - 1] : null;
}
