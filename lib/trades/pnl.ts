import type { TradeDirection } from '@/lib/trades/types';

export interface TradeFinancialsInput {
    direction: TradeDirection;
    entryPrice: number;
    exitPrice: number;
    positionSize: number;
    /** Total round-trip fees/commissions, in the trade's own currency. */
    fees?: number;
    /** When present, used to compute the R-multiple (return expressed as a
     * multiple of the risk originally taken). Omitted if no stop was
     * recorded — an R-multiple without a defined risk would be fabricated. */
    stopLevel?: number;
}

export interface TradeFinancials {
    grossPnl: number;
    netPnl: number;
    rMultiple?: number;
    status: 'WIN' | 'LOSS' | 'BREAKEVEN';
}

/**
 * Pure P/L math for a closed trade — no market-data or database dependency.
 * `status` is derived purely from netPnl's sign; there is no independent
 * "closed but undetermined" state; see lib/trades/types.ts.
 */
export function computeTradeFinancials(input: TradeFinancialsInput): TradeFinancials {
    const { direction, entryPrice, exitPrice, positionSize, fees, stopLevel } = input;

    const grossPnl = direction === 'LONG' ? (exitPrice - entryPrice) * positionSize : (entryPrice - exitPrice) * positionSize;
    const netPnl = grossPnl - (fees ?? 0);

    let rMultiple: number | undefined;
    if (stopLevel !== undefined) {
        const riskPerShare = Math.abs(entryPrice - stopLevel);
        if (riskPerShare > 0) {
            const priceMove = direction === 'LONG' ? exitPrice - entryPrice : entryPrice - exitPrice;
            rMultiple = priceMove / riskPerShare;
        }
    }

    const status = netPnl > 0 ? 'WIN' : netPnl < 0 ? 'LOSS' : 'BREAKEVEN';

    return { grossPnl, netPnl, rMultiple, status };
}
