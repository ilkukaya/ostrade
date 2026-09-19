/**
 * Weighted-average cost blend for adding to an existing position — the
 * standard formula, so "buy 5 more shares" updates the average cost
 * correctly rather than the naive (and wrong) approach of just adding the
 * new price into an average of two prices.
 */
export function blendAverageCost(
    existingQuantity: number,
    existingAverageCost: number,
    addedQuantity: number,
    addedPrice: number,
): { quantity: number; averageCost: number } {
    const quantity = existingQuantity + addedQuantity;
    const averageCost = quantity !== 0 ? (existingQuantity * existingAverageCost + addedQuantity * addedPrice) / quantity : 0;
    return { quantity, averageCost };
}

export interface HoldingForValuation {
    symbol: string;
    quantity: number;
    averageCost: number;
    currency: string;
}

export interface HoldingValuation {
    symbol: string;
    quantity: number;
    averageCost: number;
    currency: string;
    costBasis: number;
    /** null when no live quote was available for this symbol — never
     * fabricated as 0 or the cost basis. */
    currentPrice: number | null;
    marketValue: number | null;
    unrealizedPnl: number | null;
    unrealizedPnlPercent: number | null;
    /** This holding's market value as a percent of its OWN currency
     * group's total market value — never "percent of the whole portfolio"
     * when holdings span more than one currency (see below). */
    percentOfCurrencyGroup: number | null;
}

export interface CurrencyGroupTotals {
    currency: string;
    costBasis: number;
    marketValue: number | null;
    unrealizedPnl: number | null;
}

export interface PortfolioValuation {
    holdings: HoldingValuation[];
    /** One entry per currency present among the holdings — market values
     * are never summed across currencies (same principle as
     * lib/statistics/tradeStats.ts). A single-currency portfolio simply
     * has one entry here. */
    byCurrency: CurrencyGroupTotals[];
}

/**
 * Pure valuation over manually-entered holdings + a live-quote lookup —
 * this is a snapshot, not a time-weighted or historical-return
 * calculation (see docs/portfolio.md for the deliberately narrow scope).
 */
export function valuatePortfolio(holdings: HoldingForValuation[], quotesBySymbol: Record<string, number>): PortfolioValuation {
    const rows: HoldingValuation[] = holdings.map((h) => {
        const currentPrice = quotesBySymbol[h.symbol] ?? null;
        const costBasis = h.quantity * h.averageCost;
        const marketValue = currentPrice !== null ? h.quantity * currentPrice : null;
        const unrealizedPnl = marketValue !== null ? marketValue - costBasis : null;
        const unrealizedPnlPercent = unrealizedPnl !== null && costBasis !== 0 ? (unrealizedPnl / costBasis) * 100 : null;

        return {
            symbol: h.symbol,
            quantity: h.quantity,
            averageCost: h.averageCost,
            currency: h.currency,
            costBasis,
            currentPrice,
            marketValue,
            unrealizedPnl,
            unrealizedPnlPercent,
            percentOfCurrencyGroup: null, // filled in below, once each group's total is known
        };
    });

    const currencies = Array.from(new Set(rows.map((r) => r.currency)));
    const byCurrency: CurrencyGroupTotals[] = currencies.map((currency) => {
        const inGroup = rows.filter((r) => r.currency === currency);
        const costBasis = inGroup.reduce((sum, r) => sum + r.costBasis, 0);
        const marketValues = inGroup.map((r) => r.marketValue);
        const marketValue = marketValues.every((v): v is number => v !== null) ? marketValues.reduce((sum, v) => sum + (v as number), 0) : null;
        const unrealizedPnl = marketValue !== null ? marketValue - costBasis : null;
        return { currency, costBasis, marketValue, unrealizedPnl };
    });

    const groupMarketValueByCurrency = new Map(byCurrency.map((g) => [g.currency, g.marketValue]));
    for (const row of rows) {
        const groupTotal = groupMarketValueByCurrency.get(row.currency);
        row.percentOfCurrencyGroup = row.marketValue !== null && groupTotal !== null && groupTotal !== undefined && groupTotal !== 0 ? (row.marketValue / groupTotal) * 100 : null;
    }

    return { holdings: rows, byCurrency };
}
