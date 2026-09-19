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

    // Added 2026-09-19 — cross-validated against two independent sources
    // (a TradingView-scanner-derived dataset and individual WebSearch
    // confirmation from Turkish financial data sites for every symbol
    // below) rather than trusted from a single source. Three of these
    // (TRALT, TRMET, TRENJ) are 2025-11-24 renames of previously-known
    // symbols KOZAL/KOZAA/IPEKE respectively — same companies, new
    // tickers, not duplicates.
    AEFES: 'Anadolu Efes',
    DSTKF: 'Destek Finans Faktoring',
    TRALT: 'Türk Altın İşletmeleri',
    ALARK: 'Alarko Holding',
    BRSAN: 'Borusan Birleşik Boru Fabrikaları',
    BTCIM: 'Batıçim',
    CANTE: 'Çan2 Termik',
    CIMSA: 'Çimsa Çimento',
    ECILC: 'Eczacıbaşı İlaç',
    EFOR: 'Efor Yatırım Sanayi Ticaret',
    GLRMK: 'Gülermak Ağır Sanayi İnşaat ve Taahhüt',
    KTLEV: 'Katılımevim Tasarruf Finansman',
    KUYAS: 'Kuyumcukent Gayrimenkul Yatırımları',
    MIATK: 'Mia Teknoloji',
    OYAKC: 'OYAK Çimento Fabrikaları',
    PASEU: 'Pasifik Eurasia Lojistik Dış Ticaret',
    TRMET: 'TR Anadolu Metal Madencilik İşletmeleri',
    TURSG: 'Türkiye Sigorta',
    ALTNY: 'Altınay Savunma Teknolojileri',
    ANSGR: 'Anadolu Sigorta',
    BALSU: 'Balsu Gıda Sanayi ve Ticaret',
    BERA: 'Bera Holding',
    BRYAT: 'Borusan Yatırım ve Pazarlama',
    BSOKE: 'Batısöke Söke Çimento Sanayii',
    CVKMD: 'CVK Maden İşletmeleri Sanayi ve Ticaret',
    CWENE: 'CW Enerji Mühendislik Ticaret ve Sanayi',
    DAPGM: 'DAP Gayrimenkul Geliştirme',
    DOHOL: 'Doğan Holding',
    ENERY: 'Enerya Enerji',
    ENJSA: 'Enerjisa Enerji',
    ESEN: 'Esenboğa Elektrik Üretim',
    EUPWR: 'Europower Enerji ve Otomasyon Teknolojileri',
    EUREN: 'Europen Endüstri',
    FENER: 'Fenerbahçe Futbol',
    GENIL: 'Gen İlaç ve Sağlık Ürünleri',
    GESAN: 'Girişim Elektrik',
    GRSEL: 'Gür-Sel Turizm Taşımacılık ve Servis Ticaret',
    GRTHO: 'Grainturk Holding',
    GSRAY: 'Galatasaray Sportif',
    IEYHO: 'Işıklar Enerji ve Yapı Holding',
    ISMEN: 'İş Yatırım Menkul Değerler',
    IZENR: 'İzdemir Enerji',
    KLRHO: 'Kiler Holding',
    MAGEN: 'Margün Enerji',
    MAVI: 'Mavi Giyim',
    MPARK: 'MLP Sağlık Hizmetleri',
    OBAMS: 'Oba Makarnacılık',
    ODINE: 'Odine Solutions Teknoloji',
    OTKAR: 'Otokar',
    PAHOL: 'Pasifik Holding',
    PATEK: 'Pasifik Teknoloji',
    PSGYO: 'Pasifik Gayrimenkul Yatırım Ortaklığı',
    QUAGR: 'Qua Granite',
    RALYH: 'Ral Yatırım Holding',
    REEDR: 'Reeder Teknoloji',
    SARKY: 'Sarkuysan',
    SKBNK: 'Şekerbank',
    SOKM: 'ŞOK Marketler',
    TKFEN: 'Tekfen Holding',
    TRENJ: 'TR Doğal Enerji Kaynakları Araştırma ve Üretim',
    TSKB: 'Türkiye Sınai Kalkınma Bankası',
    TUKAS: 'Tukaş Gıda',
    VESTL: 'Vestel Elektronik',
    ZOREN: 'Zorlu Enerji',
};

/** Looked up by symbol only where a name is actually known — see comment
 * above; never fabricated for the rest of the universe. */
export function getBistCompanyName(symbol: string): string | undefined {
    return BIST_NAMES[symbol.toUpperCase()];
}
