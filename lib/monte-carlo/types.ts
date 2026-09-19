export interface PercentileSet {
    p5: number;
    p25: number;
    p50: number;
    p75: number;
    p95: number;
}

export interface MonteCarloConfig {
    /** The historical/backtested R-multiple sample to bootstrap-resample
     * from (with replacement) — never a fabricated or synthetic
     * distribution (see docs/monte-carlo.md). */
    rMultiples: number[];
    numSimulations: number;
    numTradesPerSimulation: number;
    /** Risk per trade, as a percentage of CURRENT equity (e.g. 1 = 1%) —
     * compounding, matching how lib/risk/positionSizing.ts already treats
     * risk percentages. */
    riskPerTradePercent: number;
    /** Arbitrary equity unit — this is a currency-agnostic ratio
     * simulation, not tied to any instrument's currency. */
    startingEquity: number;
    /** Percent of STARTING equity at or below which a path counts as
     * "ruined" (e.g. 50 = lost at least half of starting capital) —
     * distinct from the peak-relative drawdown-exceedance probabilities
     * below, which are a separate risk metric. */
    ruinThresholdPercent: number;
    /** Same seed always reproduces the same result — see lib/monte-carlo/random.ts. */
    seed: number;
}

export interface MonteCarloResult {
    numSimulations: number;
    numTradesPerSimulation: number;
    finalEquity: PercentileSet;
    /** Each path's largest peak-to-trough decline, as a percent (0-100) of
     * that path's own peak equity. */
    maxDrawdownPercent: PercentileSet;
    /** Fraction of paths whose max drawdown-from-peak ever exceeded each
     * threshold. */
    drawdownExceedanceProbability: { at10: number; at20: number; at30: number };
    maxLosingStreak: PercentileSet;
    /** Fraction of paths whose equity ever fell to or below
     * ruinThresholdPercent of starting equity. */
    riskOfRuin: number;
}

export type MonteCarloOutcome = { valid: true; result: MonteCarloResult } | { valid: false; reason: string };
