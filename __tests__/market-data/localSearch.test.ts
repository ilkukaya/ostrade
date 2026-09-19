import { describe, expect, it } from 'vitest';
import { searchLocalInstruments } from '@/lib/market-data/localSearch';

describe('searchLocalInstruments', () => {
    it('matches a known US symbol by exact ticker, case-insensitively', () => {
        const results = searchLocalInstruments('aapl');
        expect(results.some((r) => r.symbol === 'AAPL')).toBe(true);
    });

    it('matches a known BIST symbol by its verified local company name', () => {
        const results = searchLocalInstruments('garanti', 50);
        expect(results.some((r) => r.symbol === 'GARAN')).toBe(true);
    });

    it('never fabricates a name for a symbol with no verified local name — falls back to the ticker', () => {
        const results = searchLocalInstruments('AAPL');
        const aapl = results.find((r) => r.symbol === 'AAPL');
        expect(aapl?.name).toBe('AAPL');
    });

    it('returns tracked instruments (up to the limit) for an empty query, never an empty "browse" result', () => {
        const results = searchLocalInstruments('', 5);
        expect(results.length).toBe(5);
    });

    it('respects the limit parameter for a non-empty query too', () => {
        const results = searchLocalInstruments('A', 3);
        expect(results.length).toBeLessThanOrEqual(3);
    });

    it('returns no results for a query matching nothing tracked', () => {
        const results = searchLocalInstruments('ZZZZZZZZZZ');
        expect(results).toEqual([]);
    });

    it('deduplicates a symbol that appears in more than one universe', () => {
        // AAPL is a member of both Dow 30 and Nasdaq-100.
        const results = searchLocalInstruments('AAPL', 50);
        expect(results.filter((r) => r.symbol === 'AAPL')).toHaveLength(1);
    });
});
