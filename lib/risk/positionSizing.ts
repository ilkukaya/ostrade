/**
 * Deterministic position-sizing math — no market-data or database
 * dependency, currency-agnostic (it works in whatever unit accountEquity
 * and the prices are already expressed in; it never assumes USD). See
 * docs/journal.md for the formulas this implements.
 */
export interface PositionSizingInput {
    /** Total account equity, in the account's own currency. */
    accountEquity: number;
    /** Risk budget for this one trade, as a percentage (e.g. 1 = 1%, not 0.01). */
    riskPercent: number;
    entryPrice: number;
    stopPrice: number;
}

export type PositionSizingResult =
    | {
          valid: true;
          riskBudget: number;
          riskPerShare: number;
          maxShares: number;
          positionValue: number;
          /** Position value as a fraction of account equity (0.15 = 15%). */
          portfolioExposure: number;
      }
    | { valid: false; reason: string };

/**
 * `maxShares: 0` is a valid, meaningful result (the stop is too wide, or the
 * risk budget too small, to take even one share/unit at this equity) — it
 * is never reported as an error. `valid: false` is reserved for inputs that
 * make the calculation itself impossible (non-positive equity/risk/price, or
 * a stop equal to the entry, which would divide by zero).
 */
export function calculatePositionSize(input: PositionSizingInput): PositionSizingResult {
    const { accountEquity, riskPercent, entryPrice, stopPrice } = input;

    if (!Number.isFinite(accountEquity) || accountEquity <= 0) {
        return { valid: false, reason: 'Account equity must be greater than zero.' };
    }
    if (!Number.isFinite(riskPercent) || riskPercent <= 0) {
        return { valid: false, reason: 'Risk per trade must be greater than zero.' };
    }
    if (!Number.isFinite(entryPrice) || entryPrice <= 0) {
        return { valid: false, reason: 'Entry price must be greater than zero.' };
    }
    if (!Number.isFinite(stopPrice) || stopPrice < 0) {
        return { valid: false, reason: 'Stop price must be zero or greater.' };
    }

    const riskPerShare = Math.abs(entryPrice - stopPrice);
    if (riskPerShare === 0) {
        return { valid: false, reason: 'Stop price cannot equal entry price — risk per share would be zero.' };
    }

    const riskBudget = accountEquity * (riskPercent / 100);
    // Always round down: rounding up would silently risk more than the
    // configured percentage.
    const maxShares = Math.floor(riskBudget / riskPerShare);
    const positionValue = maxShares * entryPrice;
    const portfolioExposure = positionValue / accountEquity;

    return { valid: true, riskBudget, riskPerShare, maxShares, positionValue, portfolioExposure };
}
