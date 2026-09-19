import { describe, expect, it } from 'vitest';
import { blendAverageCost, valuatePortfolio } from '@/lib/portfolio/valuation';

describe('blendAverageCost', () => {
    it('computes the weighted-average cost when adding to an existing position', () => {
        // 10 shares @ $100 + 10 shares @ $120 -> 20 shares @ $110
        expect(blendAverageCost(10, 100, 10, 120)).toEqual({ quantity: 20, averageCost: 110 });
    });

    it('weights by quantity, not a naive average of the two prices', () => {
        // 90 shares @ $100 + 10 shares @ $200 -> 100 shares @ $110 (not $150)
        const result = blendAverageCost(90, 100, 10, 200);
        expect(result.quantity).toBe(100);
        expect(result.averageCost).toBeCloseTo(110);
    });
});

describe('valuatePortfolio', () => {
    it('computes cost basis, market value, and unrealized P/L for a single holding', () => {
        const result = valuatePortfolio([{ symbol: 'AAPL', quantity: 10, averageCost: 100, currency: 'USD' }], { AAPL: 120 });
        const [row] = result.holdings;
        expect(row.costBasis).toBe(1_000);
        expect(row.marketValue).toBe(1_200);
        expect(row.unrealizedPnl).toBe(200);
        expect(row.unrealizedPnlPercent).toBeCloseTo(20);
        expect(row.percentOfCurrencyGroup).toBe(100); // only holding in its currency group
    });

    it('reports null current price / market value / P/L when no quote is available, never fabricating one', () => {
        const result = valuatePortfolio([{ symbol: 'ZZZ', quantity: 5, averageCost: 50, currency: 'USD' }], {});
        const [row] = result.holdings;
        expect(row.currentPrice).toBeNull();
        expect(row.marketValue).toBeNull();
        expect(row.unrealizedPnl).toBeNull();
        expect(row.unrealizedPnlPercent).toBeNull();
        expect(row.costBasis).toBe(250); // cost basis is always knowable, quote or not
    });

    it('never sums market value across currencies — one byCurrency entry per currency', () => {
        const result = valuatePortfolio(
            [
                { symbol: 'AAPL', quantity: 10, averageCost: 100, currency: 'USD' },
                { symbol: 'THYAO', quantity: 100, averageCost: 50, currency: 'TRY' },
            ],
            { AAPL: 150, THYAO: 60 },
        );
        expect(result.byCurrency).toHaveLength(2);
        const usd = result.byCurrency.find((g) => g.currency === 'USD')!;
        const tryGroup = result.byCurrency.find((g) => g.currency === 'TRY')!;
        expect(usd.marketValue).toBe(1_500);
        expect(tryGroup.marketValue).toBe(6_000);
    });

    it('computes percentOfCurrencyGroup only within the same currency, not the whole portfolio', () => {
        const result = valuatePortfolio(
            [
                { symbol: 'AAPL', quantity: 10, averageCost: 100, currency: 'USD' },
                { symbol: 'MSFT', quantity: 10, averageCost: 100, currency: 'USD' },
                { symbol: 'THYAO', quantity: 100, averageCost: 50, currency: 'TRY' },
            ],
            { AAPL: 100, MSFT: 300, THYAO: 50 },
        );
        const aapl = result.holdings.find((h) => h.symbol === 'AAPL')!;
        const msft = result.holdings.find((h) => h.symbol === 'MSFT')!;
        const thyao = result.holdings.find((h) => h.symbol === 'THYAO')!;
        // USD group total market value = 1000 + 3000 = 4000
        expect(aapl.percentOfCurrencyGroup).toBeCloseTo(25);
        expect(msft.percentOfCurrencyGroup).toBeCloseTo(75);
        // TRY group has only THYAO -> 100%
        expect(thyao.percentOfCurrencyGroup).toBe(100);
    });

    it('marks a currency group total as null when any holding in it is missing a quote', () => {
        const result = valuatePortfolio(
            [
                { symbol: 'AAPL', quantity: 10, averageCost: 100, currency: 'USD' },
                { symbol: 'ZZZ', quantity: 5, averageCost: 50, currency: 'USD' },
            ],
            { AAPL: 150 }, // ZZZ has no quote
        );
        const usd = result.byCurrency.find((g) => g.currency === 'USD')!;
        expect(usd.marketValue).toBeNull(); // never a partial/fabricated total
        expect(usd.costBasis).toBe(1_250); // cost basis is unaffected — always knowable
    });

    it('handles an empty holdings list', () => {
        const result = valuatePortfolio([], {});
        expect(result.holdings).toEqual([]);
        expect(result.byCurrency).toEqual([]);
    });
});
