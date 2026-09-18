import type { Series } from './types';

/** Rolling standard deviation of daily returns over `period` bars — a
 * simple, well-understood volatility measure (not annualized; multiply by
 * sqrt(252) at the call site if an annualized figure is needed). */
export function rollingVolatility(closes: number[], period = 20): Series {
    const returns: Series = new Array(closes.length).fill(null);
    for (let i = 1; i < closes.length; i++) {
        const prev = closes[i - 1];
        returns[i] = prev !== 0 ? (closes[i] - prev) / prev : null;
    }

    const result: Series = new Array(closes.length).fill(null);
    for (let i = period; i < closes.length; i++) {
        const window = returns.slice(i - period + 1, i + 1);
        if (window.some((v) => v === null)) continue;

        const nums = window as number[];
        const mean = nums.reduce((sum, v) => sum + v, 0) / period;
        const variance = nums.reduce((sum, v) => sum + (v - mean) ** 2, 0) / period;
        result[i] = Math.sqrt(variance);
    }

    return result;
}
