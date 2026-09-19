import { DOW_30_SYMBOLS } from './dow30';
import { NASDAQ_100_SYMBOLS } from './nasdaq100';

/**
 * S&P 500 — **explicitly a curated large-cap subset, not the complete 500**.
 *
 * Hand-listing all 500 constituents from memory risks real inaccuracy at
 * that size, and the deployment brief is explicit that "reliable" beats
 * "complete" here. Rather than pretend to a precision this can't honestly
 * claim, this is the union of the Dow 30, the Nasdaq-100 list above (both
 * of which are themselves S&P 500 members), and this additional set of
 * well-known large caps from sectors those two lists under-represent
 * (financials, energy, industrials, healthcare, real estate, utilities,
 * materials). See docs/market-data.md for why, and how to replace this
 * with a real S&P 500 constituent feed later if one becomes available.
 */
const ADDITIONAL_SP_500_SYMBOLS = [
    // Financials
    'BAC', 'WFC', 'C', 'MS', 'SCHW', 'BLK', 'SPGI', 'MMC', 'AON', 'PGR', 'CB', 'MET', 'PRU', 'AIG',
    'USB', 'PNC', 'TFC', 'COF', 'BK', 'STT', 'ICE', 'CME', 'NDAQ', 'MCO',
    // Energy
    'XOM', 'COP', 'SLB', 'EOG', 'MPC', 'PSX', 'VLO', 'OXY', 'WMB', 'KMI', 'OKE',
    // Healthcare
    'LLY', 'PFE', 'ABBV', 'TMO', 'ABT', 'DHR', 'BMY', 'CVS', 'CI', 'ELV', 'HUM', 'ZTS', 'MDT', 'SYK', 'BSX', 'HCA',
    // Industrials
    'GE', 'RTX', 'LMT', 'NOC', 'GD', 'UNP', 'UPS', 'FDX', 'DE', 'EMR', 'ETN', 'ITW', 'PH', 'CMI', 'WM', 'RSG',
    // Consumer
    'TGT', 'LOW', 'TJX', 'CL', 'KMB', 'GIS', 'HSY', 'MO', 'PM',
    // Tech / communication (NYSE-listed, not already in the Nasdaq-100 list)
    'ORCL', 'ACN', 'NOW', 'UBER', 'SPOT', 'T',
    // Materials
    'APD', 'ECL', 'NEM', 'FCX',
    // Real estate
    'AMT', 'PLD', 'EQIX', 'PSA', 'O', 'SPG',
    // Utilities
    'NEE', 'DUK', 'SO', 'D',
] as const;

const SP_500_SET = new Set<string>([...DOW_30_SYMBOLS, ...NASDAQ_100_SYMBOLS, ...ADDITIONAL_SP_500_SYMBOLS]);

export const SP_500_SYMBOLS = Array.from(SP_500_SET).sort();
