import { describe, expect, it } from 'vitest';
import { buildBistInstrument, getBistCompanyName } from '@/lib/market-data/instruments/bist';

describe('buildBistInstrument', () => {
    it('appends .IS as the provider symbol without touching the business symbol', () => {
        const instrument = buildBistInstrument('THYAO');
        expect(instrument.symbol).toBe('THYAO');
        expect(instrument.providerSymbol).toBe('THYAO.IS');
    });

    it('always assigns TRY/XIST/TR/Europe-Istanbul metadata', () => {
        const instrument = buildBistInstrument('GARAN');
        expect(instrument.currency).toBe('TRY');
        expect(instrument.exchange).toBe('XIST');
        expect(instrument.market).toBe('TR');
        expect(instrument.timezone).toBe('Europe/Istanbul');
    });
});

describe('getBistCompanyName', () => {
    it('returns a known name for a well-known symbol', () => {
        expect(getBistCompanyName('THYAO')).toBe('Türk Hava Yolları');
    });

    it('is case-insensitive', () => {
        expect(getBistCompanyName('thyao')).toBe('Türk Hava Yolları');
    });

    it('returns undefined rather than a fabricated name for an unknown symbol', () => {
        expect(getBistCompanyName('ZZZZZ')).toBeUndefined();
    });
});
