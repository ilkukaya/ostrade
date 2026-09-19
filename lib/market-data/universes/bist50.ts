/**
 * BIST 50 — additional constituents beyond BIST 30 (see bist30.ts for the
 * same "best-effort static snapshot" caveat; combine with BIST_30_SYMBOLS
 * for the full ~50-symbol universe, defined in lib/market-data/universe.ts).
 */
export const BIST_50_ADDITIONAL_SYMBOLS = [
    'AEFES', 'AGHOL', 'ALARK', 'ANHYT', 'BRSAN', 'CCOLA', 'CIMSA', 'DOAS',
    'GESAN', 'GWIND', 'ISDMR', 'KONTR', 'KOZAA', 'MAVI', 'OTKAR', 'SOKM',
    'TAVHL', 'TSKB', 'TTKOM', 'TURSG',
] as const;
