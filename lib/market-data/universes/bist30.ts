/**
 * BIST 30 — the 30 largest/most liquid Borsa Istanbul constituents.
 *
 * Best-effort static snapshot (assembled without a live, machine-verified
 * feed — see docs/bist.md and docs/market-data.md for why this project
 * does not scrape index membership at runtime). BIST 30 membership is
 * reviewed quarterly by Borsa Istanbul and does shift; treat this as a
 * reasonable starting point for a private research terminal, not an
 * authoritative index feed. Verify against Borsa Istanbul's own published
 * constituent list before relying on it for anything index-sensitive.
 */
export const BIST_30_SYMBOLS = [
    'AKBNK', 'ARCLK', 'ASELS', 'ASTOR', 'BIMAS', 'EKGYO', 'ENKAI', 'EREGL',
    'FROTO', 'GARAN', 'GUBRF', 'HEKTS', 'ISCTR', 'KCHOL', 'KOZAL', 'KRDMD',
    'MGROS', 'ODAS', 'OYAKC', 'PETKM', 'PGSUS', 'SAHOL', 'SASA', 'SISE',
    'TCELL', 'THYAO', 'TOASO', 'TUPRS', 'VAKBN', 'YKBNK',
] as const;
