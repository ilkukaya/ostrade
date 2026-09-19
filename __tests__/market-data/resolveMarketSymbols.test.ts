import { describe, expect, it } from 'vitest';
import { resolveMarketSymbols } from '@/lib/market-data/sync/resolveMarketSymbols';

describe('resolveMarketSymbols', () => {
    it('returns a deduplicated union of every US universe (Dow 30 + Nasdaq-100 + S&P 500)', () => {
        const symbols = resolveMarketSymbols('US');
        const names = symbols.map((s) => s.symbol);
        expect(new Set(names).size).toBe(names.length); // no duplicates
        expect(names).toContain('AAPL'); // present in more than one universe, counted once
        expect(names.length).toBeGreaterThan(30); // more than just Dow 30
    });

    it('returns the full BIST universe (BIST 100 superset) for TR', () => {
        const symbols = resolveMarketSymbols('TR');
        const names = symbols.map((s) => s.symbol);
        expect(names).toContain('THYAO');
        expect(new Set(names).size).toBe(names.length);
    });

    it('every returned instrument carries the requested market', () => {
        for (const instrument of resolveMarketSymbols('TR')) {
            expect(instrument.market).toBe('TR');
        }
    });

    it('returns an empty array for an unknown market', () => {
        expect(resolveMarketSymbols('XX')).toEqual([]);
    });
});
