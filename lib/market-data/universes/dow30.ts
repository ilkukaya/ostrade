/**
 * Dow Jones Industrial Average — 30 components.
 *
 * Snapshot as of early 2025 (reflects the Nov 2024 changes: Nvidia replaced
 * Intel, Sherwin-Williams replaced Dow Inc.). The Dow changes rarely
 * (roughly once a year or less), so this list needs far less maintenance
 * than the larger indices below, but it is still a static snapshot, not a
 * live feed — see docs/market-data.md.
 */
export const DOW_30_SYMBOLS = [
    'AAPL', 'AXP', 'AMGN', 'AMZN', 'BA', 'CAT', 'CRM', 'CSCO', 'CVX', 'GS',
    'HD', 'HON', 'IBM', 'JNJ', 'JPM', 'KO', 'MCD', 'MMM', 'MRK', 'MSFT',
    'NKE', 'NVDA', 'PG', 'TRV', 'UNH', 'V', 'VZ', 'WMT', 'DIS', 'SHW',
] as const;
