import type { SetupType } from '@/lib/swing/types';
import type { TradeStatus } from '@/lib/trades/types';
import { mean, median, rate } from '@/lib/statistics/math';

export interface TradeForStats {
    status: TradeStatus;
    currency: string;
    netPnl?: number;
    rMultiple?: number;
    setupType?: SetupType;
}

function isClosed(trade: TradeForStats): boolean {
    return trade.status !== 'OPEN';
}

/** Monetary figures can only ever be summed/averaged within a single
 * currency — a portfolio with both USD and TRY trades would otherwise
 * produce a blended total that looks precise but means nothing. R-multiple
 * stats have no such restriction, since a multiple of risk is dimensionless
 * regardless of the instrument's currency (see docs/statistics.md). */
export interface CurrencyPnlStats {
    n: number;
    totalNetPnl: number;
    avgNetPnl: number | null;
    /** sum(wins) / abs(sum(losses)); null when there are no losing trades
     * yet in this currency (the ratio is undefined, not infinite-in-a-good-way)
     * or no closed trades at all. */
    profitFactor: number | null;
}

export interface OverallTradeStats {
    totalLogged: number;
    openCount: number;
    closedCount: number;
    winRate: number | null;
    avgR: number | null;
    medianR: number | null;
    byCurrency: Record<string, CurrencyPnlStats>;
}

function currencyStats(trades: TradeForStats[]): Record<string, CurrencyPnlStats> {
    const byCurrency: Record<string, CurrencyPnlStats> = {};
    const currencies = new Set(trades.map((t) => t.currency));

    for (const currency of currencies) {
        const inCurrency = trades.filter((t) => t.currency === currency && t.netPnl !== undefined);
        const netPnls = inCurrency.map((t) => t.netPnl as number);
        const wins = netPnls.filter((p) => p > 0);
        const losses = netPnls.filter((p) => p < 0);
        const totalNetPnl = netPnls.reduce((sum, p) => sum + p, 0);
        const lossSum = Math.abs(losses.reduce((sum, p) => sum + p, 0));

        byCurrency[currency] = {
            n: inCurrency.length,
            totalNetPnl,
            avgNetPnl: mean(netPnls),
            profitFactor: lossSum > 0 ? wins.reduce((sum, p) => sum + p, 0) / lossSum : null,
        };
    }
    return byCurrency;
}

export function computeOverallTradeStats(trades: TradeForStats[]): OverallTradeStats {
    const closed = trades.filter(isClosed);
    const rMultiples = closed.map((t) => t.rMultiple).filter((r): r is number => r !== undefined);

    return {
        totalLogged: trades.length,
        openCount: trades.length - closed.length,
        closedCount: closed.length,
        winRate: rate(closed.filter((t) => t.status === 'WIN').length, closed.length),
        avgR: mean(rMultiples),
        medianR: median(rMultiples),
        byCurrency: currencyStats(closed),
    };
}

export interface SetupTradeStats {
    setupType: SetupType | 'UNSPECIFIED';
    n: number;
    winRate: number | null;
    avgR: number | null;
    medianR: number | null;
}

/** Breaks down closed trades by setup type — currency-agnostic (R-multiple
 * only), since grouping further by currency on top of setup type would
 * fragment small samples into meaninglessness; see docs/statistics.md. */
export function computeTradeStatsBySetup(trades: TradeForStats[]): SetupTradeStats[] {
    const closed = trades.filter(isClosed);
    const setupTypes = new Set(closed.map((t) => t.setupType ?? 'UNSPECIFIED'));

    return Array.from(setupTypes)
        .sort()
        .map((setupType) => {
            const group = closed.filter((t) => (t.setupType ?? 'UNSPECIFIED') === setupType);
            const rMultiples = group.map((t) => t.rMultiple).filter((r): r is number => r !== undefined);
            return {
                setupType: setupType as SetupType | 'UNSPECIFIED',
                n: group.length,
                winRate: rate(group.filter((t) => t.status === 'WIN').length, group.length),
                avgR: mean(rMultiples),
                medianR: median(rMultiples),
            };
        });
}
