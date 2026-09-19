import type { InstrumentId } from '../types';
import { BIST_30_SYMBOLS } from '../universes/bist30';
import { BIST_50_ADDITIONAL_SYMBOLS } from '../universes/bist50';
import { BIST_100_ADDITIONAL_SYMBOLS } from '../universes/bist100';

const KNOWN_BIST_SYMBOLS = new Set<string>([...BIST_30_SYMBOLS, ...BIST_50_ADDITIONAL_SYMBOLS, ...BIST_100_ADDITIONAL_SYMBOLS]);

/** Whether OSTRADE has BIST instrument metadata for this business symbol —
 * the one membership check every "is this symbol BIST or US" decision in
 * the app should go through (lib/market-data/instruments/resolve.ts,
 * the Yahoo provider, local search), rather than each reimplementing a
 * symbol-suffix guess. */
export function isKnownBistSymbol(symbol: string): boolean {
    return KNOWN_BIST_SYMBOLS.has(symbol.toUpperCase());
}

/**
 * BIST symbol -> instrument metadata translation, isolated here so no other
 * layer (providers, business logic, React components) ever has to know
 * that Yahoo needs a ".IS" suffix or that BIST trades in TRY on the
 * Europe/Istanbul clock. See docs/bist.md.
 *
 * OSTRADE's own business-layer symbol (e.g. "THYAO") is never the
 * provider-specific notation — `providerSymbol` carries that translation.
 */
export function buildBistInstrument(symbol: string): InstrumentId {
    return {
        symbol,
        providerSymbol: `${symbol}.IS`,
        exchange: 'XIST',
        market: 'TR',
        currency: 'TRY',
        timezone: 'Europe/Istanbul',
    };
}

/** Company names known with reasonable confidence — deliberately NOT a
 * complete mapping for every BIST symbol this app tracks. A symbol missing
 * here falls back to being searched/displayed by its raw symbol rather than
 * a guessed name (never fabricate a company name — see docs/bist.md). */
const BIST_NAMES: Record<string, string> = {
    THYAO: 'Türk Hava Yolları',
    ASELS: 'Aselsan',
    GARAN: 'Garanti BBVA',
    TUPRS: 'Tüpraş',
    EREGL: 'Ereğli Demir ve Çelik',
    AKBNK: 'Akbank',
    KCHOL: 'Koç Holding',
    ISCTR: 'Türkiye İş Bankası',
    SAHOL: 'Hacı Ömer Sabancı Holding',
    YKBNK: 'Yapı ve Kredi Bankası',
    BIMAS: 'BİM Birleşik Mağazalar',
    SISE: 'Türkiye Şişe ve Cam Fabrikaları',
    TCELL: 'Turkcell İletişim Hizmetleri',
    PGSUS: 'Pegasus Hava Taşımacılığı',
    FROTO: 'Ford Otomotiv Sanayi',
    TOASO: 'Tofaş Türk Otomobil Fabrikası',
    ARCLK: 'Arçelik',
    VAKBN: 'Türkiye Vakıflar Bankası',
    HALKB: 'Türkiye Halk Bankası',
    PETKM: 'Petkim Petrokimya Holding',
    EKGYO: 'Emlak Konut Gayrimenkul Yatırım Ortaklığı',
    TTKOM: 'Türk Telekomünikasyon',
    ULKER: 'Ülker Bisküvi Sanayi',
    MGROS: 'Migros Ticaret',
    ASTOR: 'Astor Enerji',
    AKSA: 'Aksa Akrilik Kimya Sanayii',
    AKSEN: 'Aksa Enerji Üretim',
    CCOLA: 'Coca-Cola İçecek',
    DOAS: 'Doğuş Otomotiv Servis ve Ticaret',
    TAVHL: 'TAV Havalimanları Holding',
    KOZAL: 'Koza Altın İşletmeleri',
    HEKTS: 'Hektaş Ticaret',
    GUBRF: 'Gübre Fabrikaları',
    SASA: 'Sasa Polyester Sanayi',
    ODAS: 'Odaş Elektrik Üretim',
    ENKAI: 'Enka İnşaat ve Sanayi',
    KRDMD: 'Kardemir Karabük Demir Çelik (D)',
};

/** Looked up by symbol only where a name is actually known — see comment
 * above; never fabricated for the rest of the universe. */
export function getBistCompanyName(symbol: string): string | undefined {
    return BIST_NAMES[symbol.toUpperCase()];
}
