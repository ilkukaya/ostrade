import { sma } from './sma';
import type { Series } from './types';

export interface BollingerResult {
    upper: Series;
    middle: Series;
    lower: Series;
    /** Band width as a percentage of the middle band — a simple, comparable
     * proxy for a Bollinger squeeze (low bandwidth = compressed volatility). */
    bandwidth: Series;
}

export function bollingerBands(closes: number[], period = 20, stdDevMultiplier = 2): BollingerResult {
    const middle = sma(closes, period);
    const upper: Series = new Array(closes.length).fill(null);
    const lower: Series = new Array(closes.length).fill(null);
    const bandwidth: Series = new Array(closes.length).fill(null);

    for (let i = period - 1; i < closes.length; i++) {
        const mean = middle[i];
        if (mean === null) continue;

        const window = closes.slice(i - period + 1, i + 1);
        const variance = window.reduce((sum, v) => sum + (v - mean) ** 2, 0) / period;
        const stdDev = Math.sqrt(variance);

        upper[i] = mean + stdDevMultiplier * stdDev;
        lower[i] = mean - stdDevMultiplier * stdDev;
        bandwidth[i] = mean !== 0 ? ((upper[i]! - lower[i]!) / mean) * 100 : null;
    }

    return { upper, middle, lower, bandwidth };
}
