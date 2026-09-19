/**
 * S&P 500 — the full index, verified current as of 2026-09-19.
 *
 * 503 tickers (500 companies; Alphabet, Fox Corp, and News Corp each carry
 * two share classes). Sourced from
 * github.com/datasets/s-and-p-500-companies (`data/constituents.csv`, an
 * automation-refreshed mirror of Wikipedia's "List of S&P 500 companies",
 * last committed 2026-09-18) and cross-checked against S&P Dow Jones
 * Indices' own press release for the next scheduled change: Bloom Energy
 * (BE), Illumina (ILMN), and Everpure (P) replace Molson Coors (TAP),
 * Trade Desk (TTD), and Builders FirstSource (BLDR) — but only at market
 * open on 2026-09-21, so this snapshot correctly still carries the
 * pre-change tickers (TAP/TTD/BLDR) as of today.
 *
 * Dual-class tickers use a dash (`BRK-B`, `BF-B`), not the dot notation
 * some sources display (`BRK.B`, `BF.B`) — this app's Yahoo/Stooq provider
 * symbol construction (`lib/market-data/providers/stooq.ts`'s
 * `toStooqSymbol`) needs the dash form to resolve correctly.
 *
 * Three entries looked like possible scraping artifacts on first read
 * (`MRSH`, `FDXF`, `ECHO`) and were individually verified rather than
 * trusted on sight or silently "corrected" from memory — each is a real,
 * current ticker reflecting a 2026 corporate action (Marsh McLennan's
 * MMC→MRSH rebrand, the FedEx Freight spin-off trading separately from
 * FDX, EchoStar's SATS→ECHO rebrand) that fell after this app's knowledge
 * cutoff. See docs/market-data.md's "Universe data-quality disclosure".
 * Static, versioned snapshot, never scraped or re-fetched live; needs
 * periodic manual review as real membership changes (quarterly
 * reconstitutions plus ad-hoc replacements).
 */
export const SP_500_SYMBOLS = [
    'MMM', 'AOS', 'ABT', 'ABBV', 'ACN', 'ADBE', 'AMD', 'AES',
    'AFL', 'A', 'APD', 'ABNB', 'AKAM', 'ALB', 'ARE', 'ALGN',
    'ALLE', 'LNT', 'ALL', 'GOOGL', 'GOOG', 'MO', 'AMZN', 'AMCR',
    'AEE', 'AEP', 'AXP', 'AIG', 'AMT', 'AWK', 'AMP', 'AME',
    'AMGN', 'APH', 'ADI', 'AON', 'APA', 'APO', 'AAPL', 'AMAT',
    'APP', 'APTV', 'ACGL', 'ADM', 'ARES', 'ANET', 'AJG', 'AIZ',
    'T', 'ATO', 'ADSK', 'ADP', 'AZO', 'AVY', 'AXON', 'BKR',
    'BALL', 'BAC', 'BAX', 'BDX', 'BRK-B', 'BBY', 'TECH', 'BIIB',
    'BLK', 'BX', 'XYZ', 'BNY', 'BA', 'BKNG', 'BSX', 'BMY',
    'AVGO', 'BR', 'BRO', 'BF-B', 'BLDR', 'BG', 'BXP', 'CHRW',
    'CDNS', 'CPT', 'COF', 'CAH', 'CCL', 'CARR', 'CVNA', 'CASY',
    'CAT', 'CBOE', 'CBRE', 'CDW', 'COR', 'CNC', 'CNP', 'CF',
    'CRL', 'SCHW', 'CHTR', 'CVX', 'CMG', 'CB', 'CHD', 'CIEN',
    'CI', 'CINF', 'CTAS', 'CSCO', 'C', 'CFG', 'CLX', 'CME',
    'CMS', 'KO', 'CTSH', 'COHR', 'COIN', 'CL', 'CMCSA', 'FIX',
    'COP', 'ED', 'STZ', 'CEG', 'COO', 'CPRT', 'GLW', 'CPAY',
    'CTVA', 'CSGP', 'COST', 'CRH', 'CRWD', 'CCI', 'CSX', 'CMI',
    'CVS', 'DHR', 'DRI', 'DDOG', 'DVA', 'DECK', 'DE', 'DELL',
    'DAL', 'DVN', 'DXCM', 'FANG', 'DLR', 'DG', 'DLTR', 'D',
    'DPZ', 'DASH', 'DOV', 'DOW', 'DHI', 'DTE', 'DUK', 'DD',
    'ETN', 'EBAY', 'ECHO', 'ECL', 'EIX', 'EW', 'ELV', 'EME',
    'EMR', 'ETR', 'EOG', 'EQT', 'EFX', 'EQIX', 'ERIE', 'ESS',
    'EL', 'EG', 'EVRG', 'ES', 'EXC', 'EXE', 'EXPE', 'EXPD',
    'EXR', 'XOM', 'FFIV', 'FDS', 'FICO', 'FAST', 'FRT', 'FDX',
    'FDXF', 'FERG', 'FIS', 'FITB', 'FSLR', 'FE', 'FISV', 'FLEX',
    'F', 'FTNT', 'FTV', 'FOXA', 'FOX', 'BEN', 'FCX', 'GRMN',
    'IT', 'GE', 'GEHC', 'GEV', 'GEN', 'GNRC', 'GD', 'GIS',
    'GM', 'GPC', 'GILD', 'GPN', 'GL', 'GDDY', 'GS', 'HAL',
    'HIG', 'HAS', 'HCA', 'DOC', 'HSIC', 'HSY', 'HPE', 'HLT',
    'HD', 'HONA', 'HON', 'HRL', 'HST', 'HWM', 'HPQ', 'HUBB',
    'HUM', 'HBAN', 'HII', 'IBM', 'IEX', 'IDXX', 'ITW', 'INCY',
    'IR', 'PODD', 'INTC', 'IBKR', 'ICE', 'IFF', 'IP', 'INTU',
    'ISRG', 'IVZ', 'INVH', 'IQV', 'IRM', 'JBHT', 'JBL', 'JKHY',
    'J', 'JNJ', 'JCI', 'JPM', 'KVUE', 'KDP', 'KEY', 'KEYS',
    'KMB', 'KIM', 'KMI', 'KKR', 'KLAC', 'KHC', 'KR', 'LHX',
    'LH', 'LRCX', 'LVS', 'LDOS', 'LEN', 'LII', 'LLY', 'LIN',
    'LYV', 'LMT', 'L', 'LOW', 'LULU', 'LITE', 'LYB', 'MTB',
    'MPC', 'MAR', 'MRSH', 'MLM', 'MRVL', 'MAS', 'MA', 'MKC',
    'MCD', 'MCK', 'MDT', 'MRK', 'META', 'MET', 'MTD', 'MGM',
    'MCHP', 'MU', 'MSFT', 'MAA', 'MRNA', 'TAP', 'MDLZ', 'MPWR',
    'MNST', 'MCO', 'MS', 'MOS', 'MSI', 'MSCI', 'NDAQ', 'NTAP',
    'NFLX', 'NEM', 'NWSA', 'NWS', 'NEE', 'NKE', 'NI', 'NDSN',
    'NSC', 'NTRS', 'NOC', 'NCLH', 'NRG', 'NUE', 'NVDA', 'NVR',
    'NXPI', 'ORLY', 'OXY', 'ODFL', 'OMC', 'ON', 'OKE', 'ORCL',
    'OTIS', 'PCAR', 'PKG', 'PLTR', 'PANW', 'PSKY', 'PH', 'PAYX',
    'PYPL', 'PNR', 'PEP', 'PFE', 'PCG', 'PM', 'PSX', 'PNW',
    'PNC', 'PPG', 'PPL', 'PFG', 'PG', 'PGR', 'PLD', 'PRU',
    'PEG', 'PTC', 'PSA', 'PHM', 'PWR', 'QCOM', 'DGX', 'Q',
    'RL', 'RJF', 'RDDT', 'RTX', 'O', 'REG', 'REGN', 'RF',
    'RSG', 'RMD', 'RVTY', 'HOOD', 'ROK', 'ROL', 'ROP', 'ROST',
    'RCL', 'SPGI', 'CRM', 'SNDK', 'SBAC', 'SLB', 'STX', 'SRE',
    'NOW', 'SHW', 'SPG', 'SWKS', 'SJM', 'SW', 'SNA', 'SOLV',
    'SO', 'LUV', 'SWK', 'SBUX', 'STT', 'STLD', 'STE', 'SYK',
    'SMCI', 'SYF', 'SNPS', 'SYY', 'TMUS', 'TROW', 'TTWO', 'TPR',
    'TRGP', 'TGT', 'TEL', 'TDY', 'TER', 'TSLA', 'TXN', 'TPL',
    'TXT', 'TMO', 'TJX', 'TKO', 'TTD', 'TSCO', 'TT', 'TDG',
    'TRV', 'TRMB', 'TFC', 'TYL', 'TSN', 'USB', 'UBER', 'UDR',
    'ULTA', 'UNP', 'UAL', 'UPS', 'URI', 'UNH', 'UHS', 'VLO',
    'VEEV', 'VTR', 'VLTO', 'VRSN', 'VRSK', 'VZ', 'VRTX', 'VRT',
    'VTRS', 'VICI', 'V', 'VST', 'VMRK', 'VMC', 'WRB', 'GWW',
    'WAB', 'WMT', 'DIS', 'WBD', 'WM', 'WAT', 'WEC', 'WFC',
    'WELL', 'WST', 'WDC', 'WY', 'WSM', 'WMB', 'WTW', 'WDAY',
    'WYNN', 'XEL', 'XYL', 'YUM', 'ZBRA', 'ZBH', 'ZTS',
] as const;
