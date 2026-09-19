/**
 * BIST 100 (index XU100) — additional constituents beyond BIST 50.
 *
 * Same verified 2026 Q3 snapshot and sourcing as bist30.ts (see there for
 * the full cross-validation write-up) — this is now a verified, exact
 * 50-symbol addition (BIST_30_SYMBOLS + BIST_50_ADDITIONAL_SYMBOLS + this
 * = exactly 100), not the earlier best-effort ~96-symbol curated subset.
 * Combined with BIST_30_SYMBOLS + BIST_50_ADDITIONAL_SYMBOLS this is the
 * full universe (lib/market-data/universe.ts).
 */
export const BIST_100_ADDITIONAL_SYMBOLS = [
    'AKSA', 'ALTNY', 'ANSGR', 'ARCLK', 'BALSU', 'BERA', 'BRYAT', 'BSOKE',
    'CVKMD', 'CWENE', 'DAPGM', 'DOAS', 'DOHOL', 'ENERY', 'ENJSA', 'ESEN',
    'EUPWR', 'EUREN', 'FENER', 'GENIL', 'GESAN', 'GRSEL', 'GRTHO', 'GSRAY',
    'IEYHO', 'ISMEN', 'IZENR', 'KLRHO', 'MAGEN', 'MAVI', 'MPARK', 'OBAMS',
    'ODAS', 'ODINE', 'OTKAR', 'PAHOL', 'PATEK', 'PSGYO', 'QUAGR', 'RALYH',
    'REEDR', 'SARKY', 'SKBNK', 'SOKM', 'TKFEN', 'TRENJ', 'TSKB', 'TUKAS',
    'VESTL', 'ZOREN',
] as const;
