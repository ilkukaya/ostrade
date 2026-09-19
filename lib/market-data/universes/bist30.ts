/**
 * BIST 30 (index XU030) — the 30 largest/most liquid Borsa İstanbul
 * constituents.
 *
 * Verified snapshot for the 2026 Q3 index period (01.07.2026–30.09.2026),
 * assembled 2026-09-19. Cross-validated across independent sources rather
 * than trusted from a single one:
 * - github.com/GamehunterKaan/fundhunter (`data/stocks.json`) — tags each
 *   BIST-listed stock's index tier (30/50/100) from TradingView's
 *   index-membership scanner (`scanner.tradingview.com/turkey/scan`).
 * - github.com/eermis1/bist-trader (`data/bist100_tickers.csv`) — sourced
 *   via the `pykap` library, which wraps KAP (Kamuyu Aydınlatma Platformu),
 *   Turkey's official Public Disclosure Platform. Matched the first source
 *   byte-for-byte on the full BIST 100 superset.
 * - ~15 independent news-search rounds (Turkish financial press covering
 *   the Q3 2026 quarterly reconstitution) confirmed the specific
 *   entries/exits this quarter.
 * Exactly 30 symbols, no duplicates, BIST_30 ⊆ BIST_50 ⊆ BIST_100 holds
 * exactly (verified programmatically, not by inspection).
 *
 * Borsa İstanbul reconstitutes quarterly — this needs re-verification for
 * the next period (effective ~2026-10-01), not assumed to stay exact
 * forever. See docs/bist.md for the full write-up and completeness table.
 */
export const BIST_30_SYMBOLS = [
    'AEFES', 'AKBNK', 'ASELS', 'ASTOR', 'BIMAS', 'DSTKF', 'EKGYO', 'ENKAI',
    'EREGL', 'FROTO', 'GARAN', 'GUBRF', 'ISCTR', 'KCHOL', 'KRDMD', 'MGROS',
    'PETKM', 'PGSUS', 'SAHOL', 'SASA', 'SISE', 'TAVHL', 'TCELL', 'THYAO',
    'TOASO', 'TRALT', 'TTKOM', 'TUPRS', 'VAKBN', 'YKBNK',
] as const;
