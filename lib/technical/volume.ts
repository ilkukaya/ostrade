import { sma } from './sma';
import type { OhlcBar, Series } from './types';

export function averageVolume(bars: OhlcBar[], period = 20): Series {
    return sma(bars.map((b) => b.volume), period);
}

/** Current volume divided by its trailing average — the standard "relative
 * volume" (RVOL) reading used to spot unusual participation. Null wherever
 * the average isn't defined yet or would be a division by zero. */
export function relativeVolume(bars: OhlcBar[], period = 20): Series {
    const avg = averageVolume(bars, period);
    return bars.map((bar, i) => {
        const a = avg[i];
        return a !== null && a > 0 ? bar.volume / a : null;
    });
}

export function latestRelativeVolume(bars: OhlcBar[], period = 20): number | null {
    const series = relativeVolume(bars, period);
    return series.length > 0 ? series[series.length - 1] : null;
}
