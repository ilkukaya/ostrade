import { sma } from './sma';
import type { OhlcBar, Series } from './types';

export interface StochasticResult {
    k: Series;
    d: Series;
}

/** Stochastic Oscillator: %K measures where the close sits within the
 * recent high/low range, %D is its `dPeriod`-period moving average. A
 * completely flat range (high === low) reads as 50, not a division error. */
export function stochastic(bars: OhlcBar[], kPeriod = 14, dPeriod = 3): StochasticResult {
    const k: Series = new Array(bars.length).fill(null);

    for (let i = kPeriod - 1; i < bars.length; i++) {
        const window = bars.slice(i - kPeriod + 1, i + 1);
        const highestHigh = Math.max(...window.map((b) => b.high));
        const lowestLow = Math.min(...window.map((b) => b.low));
        const range = highestHigh - lowestLow;
        k[i] = range === 0 ? 50 : ((bars[i].close - lowestLow) / range) * 100;
    }

    const firstValidIndex = k.findIndex((v) => v !== null);
    const d: Series = new Array(bars.length).fill(null);

    if (firstValidIndex !== -1) {
        const kValues = k.slice(firstValidIndex) as number[];
        const dOnValid = sma(kValues, dPeriod);
        for (let i = 0; i < dOnValid.length; i++) {
            d[firstValidIndex + i] = dOnValid[i];
        }
    }

    return { k, d };
}
