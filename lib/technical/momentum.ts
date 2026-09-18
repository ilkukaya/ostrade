import type { Series } from './types';

/** Absolute price change over `period` bars (close[i] - close[i-period]). */
export function momentum(closes: number[], period = 10): Series {
    const result: Series = new Array(closes.length).fill(null);
    for (let i = period; i < closes.length; i++) {
        result[i] = closes[i] - closes[i - period];
    }
    return result;
}

/** Percentage rate of change over `period` bars. */
export function rateOfChange(closes: number[], period = 10): Series {
    const result: Series = new Array(closes.length).fill(null);
    for (let i = period; i < closes.length; i++) {
        const past = closes[i - period];
        result[i] = past !== 0 ? ((closes[i] - past) / past) * 100 : null;
    }
    return result;
}
