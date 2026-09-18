export type TrendDirection = 'UP' | 'DOWN' | 'SIDEWAYS' | 'UNKNOWN';

export interface TrendContext {
    price: number;
    sma20: number | null;
    sma50: number | null;
    sma200: number | null;
}

/**
 * A pragmatic trend classification, not a prediction:
 * - UP: price above the 50-day average, and the 50-day above the 200-day
 *   when that much history exists (a classic "golden cross" alignment).
 * - DOWN: the mirror image.
 * - SIDEWAYS: neither condition holds.
 * - UNKNOWN: not enough history for even a 50-day average.
 */
export function classifyTrend(ctx: TrendContext): TrendDirection {
    if (ctx.sma50 === null) return 'UNKNOWN';

    if (ctx.sma200 !== null) {
        if (ctx.price > ctx.sma50 && ctx.sma50 > ctx.sma200) return 'UP';
        if (ctx.price < ctx.sma50 && ctx.sma50 < ctx.sma200) return 'DOWN';
        return 'SIDEWAYS';
    }

    if (ctx.price > ctx.sma50) return 'UP';
    if (ctx.price < ctx.sma50) return 'DOWN';
    return 'SIDEWAYS';
}
