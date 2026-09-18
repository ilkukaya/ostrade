import { ema } from './ema';
import type { Series } from './types';

export interface MacdResult {
    macd: Series;
    signal: Series;
    histogram: Series;
}

/** Standard MACD(12, 26, 9): the 12/26 EMA spread, its 9-period EMA
 * ("signal"), and the difference between them ("histogram"). */
export function macd(closes: number[], fastPeriod = 12, slowPeriod = 26, signalPeriod = 9): MacdResult {
    const fast = ema(closes, fastPeriod);
    const slow = ema(closes, slowPeriod);

    const macdLine: Series = closes.map((_, i) => {
        const f = fast[i];
        const s = slow[i];
        return f !== null && s !== null ? f - s : null;
    });

    const firstValidIndex = macdLine.findIndex((v) => v !== null);
    const signal: Series = new Array(closes.length).fill(null);

    if (firstValidIndex !== -1) {
        const macdValues = macdLine.slice(firstValidIndex) as number[];
        const signalOnValid = ema(macdValues, signalPeriod);
        for (let i = 0; i < signalOnValid.length; i++) {
            signal[firstValidIndex + i] = signalOnValid[i];
        }
    }

    const histogram: Series = closes.map((_, i) => {
        const m = macdLine[i];
        const s = signal[i];
        return m !== null && s !== null ? m - s : null;
    });

    return { macd: macdLine, signal, histogram };
}
