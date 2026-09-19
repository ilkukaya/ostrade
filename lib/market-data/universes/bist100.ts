/**
 * BIST 100 — additional constituents beyond BIST 50 (see bist30.ts for the
 * "best-effort static snapshot" caveat, which applies at least as strongly
 * here: this list is a curated ~96-symbol subset assembled from well-known
 * BIST-listed large/mid caps, explicitly NOT a verified, exact 100-symbol
 * index feed. Combine with BIST_30_SYMBOLS + BIST_50_ADDITIONAL_SYMBOLS for
 * the full universe, defined in lib/market-data/universe.ts — see
 * docs/bist.md for the disclosure this drives in the universe picker UI.
 */
export const BIST_100_ADDITIONAL_SYMBOLS = [
    'ALFAS', 'ALKIM', 'AKSA', 'AKSEN', 'AVPGY', 'AYDEM', 'BAGFS', 'BERA',
    'BIOEN', 'BRISA', 'BUCIM', 'CANTE', 'CWENE', 'DEVA', 'EGEEN', 'ENJSA',
    'EUPWR', 'EUREN', 'GLYHO', 'GOLTS', 'HALKB', 'ISMEN', 'KARSN', 'KLSER',
    'KORDS', 'KRDMA', 'MPARK', 'NTGAZ', 'NUGYO', 'PENTA', 'PSGYO', 'SELEC',
    'SKBNK', 'SMRTG', 'SNGYO', 'TABGD', 'TKFEN', 'TKNSA', 'TMSN', 'TUKAS',
    'ULKER', 'VESBE', 'VESTL', 'YATAS', 'YEOTK', 'ZOREN',
] as const;
