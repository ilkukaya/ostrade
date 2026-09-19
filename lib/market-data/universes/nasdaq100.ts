/**
 * Nasdaq-100 — a best-effort static snapshot of large Nasdaq-listed
 * companies, not a guaranteed-exact, up-to-the-minute membership list.
 *
 * The real index reconstitutes annually (each December) plus occasional
 * intra-year swaps, and this list was written from general knowledge
 * rather than fetched from an official source at build time (per the
 * deployment brief: prefer a static/versioned definition over scraping a
 * live source at runtime). Treat this as "approximately the Nasdaq-100",
 * useful for scanning, not as an authoritative membership record — see
 * docs/market-data.md for the reasoning and how to refresh it.
 */
export const NASDAQ_100_SYMBOLS = [
    // Mega-cap
    'AAPL', 'MSFT', 'GOOGL', 'GOOG', 'AMZN', 'NVDA', 'META', 'TSLA', 'AVGO', 'COST',
    // Semiconductors / hardware
    'AMD', 'QCOM', 'TXN', 'AMAT', 'ADI', 'LRCX', 'KLAC', 'MU', 'INTC', 'MRVL', 'NXPI', 'ON', 'MCHP',
    // Software / internet
    'NFLX', 'CSCO', 'INTU', 'ADP', 'CTAS', 'PAYX', 'PANW', 'CRWD', 'FTNT', 'WDAY', 'TEAM', 'SNPS', 'CDNS', 'ANSS',
    // Consumer internet / travel
    'ZS', 'DASH', 'ABNB', 'PYPL', 'BKNG', 'MELI', 'PDD', 'EA', 'TTWO',
    // Industrials / distribution
    'ADSK', 'CSGP', 'FAST', 'ODFL', 'PCAR', 'ORLY', 'CTSH', 'VRSK', 'CPRT',
    // Consumer staples / utilities
    'EXC', 'XEL', 'AEP', 'CEG', 'KDP', 'KHC', 'MDLZ', 'MNST', 'PEP', 'SBUX', 'CMCSA', 'CHTR', 'TMUS',
    // Healthcare / biotech
    'MAR', 'REGN', 'VRTX', 'GILD', 'AMGN', 'ISRG', 'BIIB', 'IDXX', 'ILMN', 'DXCM', 'MRNA', 'LULU', 'ROST', 'EBAY', 'WBD',
    // Materials / energy / other large caps
    'LIN', 'BKR', 'FANG', 'CTVA', 'GEHC', 'CDW', 'GFS', 'ARM', 'AXON', 'DOC', 'ZM', 'MSTR', 'APP', 'PLTR', 'HON',
] as const;
