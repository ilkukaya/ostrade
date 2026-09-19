import { describe, expect, it } from 'vitest';
import {
    CUSTOM_WATCHLIST_UNIVERSE_ID,
    getStaticUniverse,
    listStaticUniverses,
    listUniverseOptions,
} from '@/lib/market-data/universe';

describe('market universes', () => {
    it('lists exactly the six static universes plus custom watchlist', () => {
        const staticIds = listStaticUniverses().map((u) => u.id).sort();
        expect(staticIds).toEqual(['bist-100', 'bist-30', 'bist-50', 'dow-30', 'nasdaq-100', 'sp-500']);

        const optionIds = listUniverseOptions().map((o) => o.id);
        expect(optionIds).toContain(CUSTOM_WATCHLIST_UNIVERSE_ID);
        expect(optionIds).toHaveLength(7);
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

    it('BIST 50 and BIST 100 are supersets of BIST 30, with no duplicates introduced by combining tiers', () => {
        const bist30 = getStaticUniverse('bist-30')!.symbols.map((i) => i.symbol);
        const bist50 = getStaticUniverse('bist-50')!.symbols.map((i) => i.symbol);
        const bist100 = getStaticUniverse('bist-100')!.symbols.map((i) => i.symbol);

        expect(new Set(bist50).size).toBe(bist50.length);
        expect(new Set(bist100).size).toBe(bist100.length);
        for (const symbol of bist30) {
            expect(bist50).toContain(symbol);
            expect(bist100).toContain(symbol);
        }
        for (const symbol of bist50) {
            expect(bist100).toContain(symbol);
        }
    });

    it('every BIST instrument carries TRY/XIST/TR metadata and a .IS provider symbol', () => {
        for (const instrument of getStaticUniverse('bist-30')!.symbols) {
            expect(instrument.currency).toBe('TRY');
            expect(instrument.exchange).toBe('XIST');
            expect(instrument.market).toBe('TR');
            expect(instrument.timezone).toBe('Europe/Istanbul');
            expect(instrument.providerSymbol).toBe(`${instrument.symbol}.IS`);
        }
    });

    it('marks every BIST universe as partial (best-effort snapshot, not a verified live feed)', () => {
        expect(getStaticUniverse('bist-30')!.partial).toBe(true);
        expect(getStaticUniverse('bist-50')!.partial).toBe(true);
        expect(getStaticUniverse('bist-100')!.partial).toBe(true);
    });
});
