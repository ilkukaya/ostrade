/**
 * Nasdaq-100 — best-effort snapshot, NOT verified complete as of today.
 *
 * 101 tickers (the index nominally targets 100, but multiple share classes
 * for one company — here, Alphabet's GOOG/GOOGL — routinely push the real
 * count slightly over 100). Underlying data snapshot dated 2026-08-04
 * (github.com/floyds1995/Auto-Index-Constituents-Tracker, itself tracking
 * Wikipedia's Nasdaq-100 change log), heavily cross-validated against two
 * confirmed official reconstitution events (Dec 2025 annual, June 2026
 * quarterly — all 22 additions/removals from those two events matched
 * exactly), then hand-adjusted once more: Kraft Heinz (KHC) is removed
 * here because it voluntarily delisted from Nasdaq and moved its primary
 * listing to NYSE effective 2026-09-14.
 *
 * What's NOT resolved, and why this stays `partial: true`
 * (lib/market-data/universe.ts) rather than being promoted to "complete"
 * like BIST/S&P 500: no confirmed replacement for KHC's vacated slot, and
 * a further quarterly rank-based reconstitution Nasdaq reportedly
 * announced ~2026-09-11 (effective ~2026-09-21/22) couldn't be confirmed
 * in detail — every primary source that would (nasdaq.com,
 * ir.nasdaq.com, indexes.nasdaq.com) was unreachable during this research
 * pass. Re-verify directly against one of those once network access
 * allows, ideally after 2026-09-22 when this quarter's changes will have
 * settled and been reported.
 *
 * A couple of entries are unusual and were individually confirmed rather
 * than assumed correct on sight: `SPCX` (Space Exploration Technologies
 * Corp / SpaceX) and `FER` (Ferrovial SE, not Ferguson plc).
 */
export const NASDAQ_100_SYMBOLS = [
    'AAPL', 'ABNB', 'ADBE', 'ADI', 'ADP', 'ADSK', 'AEP', 'ALAB',
    'ALNY', 'AMAT', 'AMD', 'AMGN', 'AMZN', 'APP', 'ARM', 'ASML',
    'AVGO', 'AXON', 'BKNG', 'BKR', 'CCEP', 'CDNS', 'CEG', 'CMCSA',
    'COST', 'CPRT', 'CRWD', 'CRWV', 'CSCO', 'CSX', 'CTAS', 'DASH',
    'DDOG', 'DXCM', 'EXC', 'FANG', 'FAST', 'FER', 'FTNT', 'GEHC',
    'GILD', 'GOOG', 'GOOGL', 'HON', 'HONA', 'IDXX', 'INTC', 'INTU',
    'ISRG', 'KDP', 'KLAC', 'LIN', 'LITE', 'LRCX', 'MAR', 'MCHP',
    'MDLZ', 'MELI', 'META', 'MNST', 'MPWR', 'MRVL', 'MSFT', 'MSTR',
    'MU', 'NBIS', 'NFLX', 'NVDA', 'NXPI', 'ODFL', 'ORLY', 'PANW',
    'PAYX', 'PCAR', 'PDD', 'PEP', 'PLTR', 'PYPL', 'QCOM', 'REGN',
    'RKLB', 'ROP', 'ROST', 'SBUX', 'SHOP', 'SNDK', 'SNPS', 'SPCX',
    'STX', 'TER', 'TMUS', 'TRI', 'TSLA', 'TTWO', 'TXN', 'VRTX',
    'WBD', 'WDAY', 'WDC', 'WMT', 'XEL',
] as const;
