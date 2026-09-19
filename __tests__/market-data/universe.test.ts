import { describe, expect, it } from 'vitest';
import {
    CUSTOM_WATCHLIST_UNIVERSE_ID,
    getStaticUniverse,
    listStaticUniverses,
    listUniverseOptions,
} from '@/lib/market-data/universe';

describe('market universes', () => {
    it('lists exactly the three static universes plus custom watchlist', () => {
        const staticIds = listStaticUniverses().map((u) => u.id).sort();
        expect(staticIds).toEqual(['dow-30', 'nasdaq-100', 'sp-500']);

        const optionIds = listUniverseOptions().map((o) => o.id);
        expect(optionIds).toContain(CUSTOM_WATCHLIST_UNIVERSE_ID);
        expect(optionIds).toHaveLength(4);
    });

    it('has no duplicate symbols within any single static universe', () => {
        for (const universe of listStaticUniverses()) {
            const symbols = universe.symbols.map((i) => i.symbol);
            expect(new Set(symbols).size).toBe(symbols.length);
        }
    });

    it('Dow 30 has exactly 30 symbols', () => {
        expect(getStaticUniverse('dow-30')!.symbols).toHaveLength(30);
    });

    it('the S&P 500 curated subset is a superset of Dow 30 and Nasdaq-100', () => {
        const sp500Symbols = new Set(getStaticUniverse('sp-500')!.symbols.map((i) => i.symbol));
        const dow = getStaticUniverse('dow-30')!.symbols.map((i) => i.symbol);
        const nasdaq = getStaticUniverse('nasdaq-100')!.symbols.map((i) => i.symbol);

        for (const symbol of [...dow, ...nasdaq]) {
            expect(sp500Symbols.has(symbol)).toBe(true);
        }
    });

    it('marks the approximate universes as partial, and Dow 30 as not partial', () => {
        expect(getStaticUniverse('dow-30')!.partial).toBeFalsy();
        expect(getStaticUniverse('nasdaq-100')!.partial).toBe(true);
        expect(getStaticUniverse('sp-500')!.partial).toBe(true);
    });

    it('returns null for an unknown universe id', () => {
        expect(getStaticUniverse('nope')).toBeNull();
    });
});
