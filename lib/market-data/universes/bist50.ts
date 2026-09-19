/**
 * BIST 50 (index XU050) — additional constituents beyond BIST 30.
 *
 * Same verified 2026 Q3 snapshot and sourcing as bist30.ts (see there for
 * the full cross-validation write-up). Exactly 20 symbols; combined with
 * BIST_30_SYMBOLS this is the full 50-symbol universe
 * (lib/market-data/universe.ts).
 */
export const BIST_50_ADDITIONAL_SYMBOLS = [
    'AKSEN', 'ALARK', 'BRSAN', 'BTCIM', 'CANTE', 'CCOLA', 'CIMSA', 'ECILC',
    'EFOR', 'GLRMK', 'HALKB', 'HEKTS', 'KTLEV', 'KUYAS', 'MIATK', 'OYAKC',
    'PASEU', 'TRMET', 'TURSG', 'ULKER',
] as const;
