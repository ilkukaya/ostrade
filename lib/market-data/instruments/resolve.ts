import type { InstrumentId } from '../types';
import { buildBistInstrument, isKnownBistSymbol } from './bist';

/**
 * The single place that turns a bare business symbol (e.g. "THYAO" or
 * "AAPL") into a fully-resolved `InstrumentId` — market, currency,
 * exchange, provider symbol. Every caller that needs to know "which
 * market/provider does this symbol belong to" (the Yahoo provider,
 * service.ts's routing, local search) goes through this instead of
 * re-guessing from symbol shape. Only BIST is a special case today; every
 * other symbol defaults to the US shape the app has always assumed. See
 * docs/bist.md.
 */
export function resolveInstrument(symbol: string): InstrumentId {
    const upper = symbol.toUpperCase();
    if (isKnownBistSymbol(upper)) return buildBistInstrument(upper);
    return { symbol: upper, exchange: 'US', market: 'US', currency: 'USD' };
}
