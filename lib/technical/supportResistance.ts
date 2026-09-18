import type { OhlcBar } from './types';

export interface PriceZone {
    low: number;
    high: number;
    /** How many swing points contributed to this zone — a rough proxy for
     * how well-established the level is. Never hidden from the UI: a zone
     * with touches = 1 is a much weaker claim than one with touches = 4. */
    touches: number;
}

/**
 * Finds local swing highs/lows: a bar whose high (low) is the highest
 * (lowest) within `lookback` bars on either side. This is deliberately the
 * simplest reasonable definition — no pseudo-scientific pivot math — per
 * docs/swing-engine.md.
 */
export function findSwingPoints(bars: OhlcBar[], lookback = 3): { highs: number[]; lows: number[] } {
    const highs: number[] = [];
    const lows: number[] = [];

    for (let i = lookback; i < bars.length - lookback; i++) {
        const window = bars.slice(i - lookback, i + lookback + 1);
        const highestHigh = Math.max(...window.map((b) => b.high));
        const lowestLow = Math.min(...window.map((b) => b.low));
        if (bars[i].high === highestHigh) highs.push(bars[i].high);
        if (bars[i].low === lowestLow) lows.push(bars[i].low);
    }

    return { highs, lows };
}

/** Groups nearby price levels into zones rather than reporting false
 * precision (e.g. "142.80–143.40" instead of "143.017291"). Levels within
 * `tolerance` of the current zone's edge are merged into it. */
export function clusterLevelsIntoZones(levels: number[], tolerance: number): PriceZone[] {
    if (levels.length === 0) return [];

    const sorted = [...levels].sort((a, b) => a - b);
    const zones: PriceZone[] = [];
    let current: PriceZone = { low: sorted[0], high: sorted[0], touches: 1 };

    for (let i = 1; i < sorted.length; i++) {
        const level = sorted[i];
        if (level - current.high <= tolerance) {
            current.high = level;
            current.touches += 1;
        } else {
            zones.push(current);
            current = { low: level, high: level, touches: 1 };
        }
    }
    zones.push(current);

    return zones.sort((a, b) => b.touches - a.touches);
}

export interface SupportResistanceZones {
    support: PriceZone[];
    resistance: PriceZone[];
}

/**
 * Support/resistance zones near the current price, derived from recent
 * swing points and clustered with an ATR-aware tolerance (falls back to 1%
 * of price when ATR isn't available). Returns at most the 3 nearest zones
 * on each side, closest first.
 */
export function findSupportResistanceZones(
    bars: OhlcBar[],
    currentPrice: number,
    atrValue: number | null,
    lookback = 3,
): SupportResistanceZones {
    const { highs, lows } = findSwingPoints(bars, lookback);
    const tolerance = atrValue !== null && atrValue > 0 ? atrValue * 0.5 : currentPrice * 0.01;

    const resistanceZones = clusterLevelsIntoZones(highs, tolerance)
        .filter((z) => z.low >= currentPrice)
        .sort((a, b) => a.low - b.low);

    const supportZones = clusterLevelsIntoZones(lows, tolerance)
        .filter((z) => z.high <= currentPrice)
        .sort((a, b) => b.high - a.high);

    return {
        support: supportZones.slice(0, 3),
        resistance: resistanceZones.slice(0, 3),
    };
}
