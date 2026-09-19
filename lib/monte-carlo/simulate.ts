import { createSeededRandom } from './random';
import type { MonteCarloConfig, MonteCarloOutcome, MonteCarloResult, PercentileSet } from './types';

/** Practical ceilings to keep a run comfortably inside a serverless
 * function's execution window — this is a synchronous, single-call
 * computation (no external I/O to batch around, unlike the scanner/
 * backtest engine), so there's no resumable-job architecture here, just an
 * upper bound on the work one call will do. See docs/monte-carlo.md. */
export const MAX_SIMULATIONS = 50_000;
export const MAX_TRADES_PER_SIMULATION = 2_000;

/** Linear-interpolation percentile (the common definition) over an
 * ALREADY-SORTED ascending array. */
function percentileOf(sorted: number[], p: number): number {
    const index = (p / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    if (lower === upper) return sorted[lower];
    const weight = index - lower;
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function percentileSet(values: number[]): PercentileSet {
    const sorted = [...values].sort((a, b) => a - b);
    return {
        p5: percentileOf(sorted, 5),
        p25: percentileOf(sorted, 25),
        p50: percentileOf(sorted, 50),
        p75: percentileOf(sorted, 75),
        p95: percentileOf(sorted, 95),
    };
}

/**
 * Bootstrap resampling Monte Carlo: draws (with replacement) from a real,
 * historical R-multiple distribution — never a fabricated one — to
 * simulate many possible equity-curve paths. This is explicitly a
 * strategy-performance simulation, NOT a price prediction (see
 * docs/monte-carlo.md); nothing here looks at price at all, only at the
 * distribution of R-multiples a strategy has actually produced.
 */
export function simulateMonteCarlo(config: MonteCarloConfig): MonteCarloOutcome {
    const { rMultiples, numSimulations, numTradesPerSimulation, riskPerTradePercent, startingEquity, ruinThresholdPercent, seed } = config;

    if (rMultiples.length === 0) {
        return { valid: false, reason: 'Need at least one historical R-multiple to resample from.' };
    }
    if (!Number.isInteger(numSimulations) || numSimulations <= 0) {
        return { valid: false, reason: 'Number of simulations must be a positive integer.' };
    }
    if (numSimulations > MAX_SIMULATIONS) {
        return { valid: false, reason: `Number of simulations must not exceed ${MAX_SIMULATIONS}.` };
    }
    if (!Number.isInteger(numTradesPerSimulation) || numTradesPerSimulation <= 0) {
        return { valid: false, reason: 'Trades per simulation must be a positive integer.' };
    }
    if (numTradesPerSimulation > MAX_TRADES_PER_SIMULATION) {
        return { valid: false, reason: `Trades per simulation must not exceed ${MAX_TRADES_PER_SIMULATION}.` };
    }
    if (!(riskPerTradePercent > 0)) {
        return { valid: false, reason: 'Risk per trade must be greater than zero.' };
    }
    if (!(startingEquity > 0)) {
        return { valid: false, reason: 'Starting equity must be greater than zero.' };
    }
    if (!(ruinThresholdPercent > 0) || ruinThresholdPercent >= 100) {
        return { valid: false, reason: 'Ruin threshold must be between 0 and 100 (exclusive).' };
    }

    const random = createSeededRandom(seed);
    const ruinEquityLevel = startingEquity * (ruinThresholdPercent / 100);

    const finalEquities: number[] = [];
    const maxDrawdowns: number[] = [];
    const maxLosingStreaks: number[] = [];
    let ruinedCount = 0;
    let exceeded10 = 0;
    let exceeded20 = 0;
    let exceeded30 = 0;

    for (let sim = 0; sim < numSimulations; sim++) {
        let equity = startingEquity;
        let peak = startingEquity;
        let maxDrawdownPercent = 0;
        let currentLosingStreak = 0;
        let maxLosingStreak = 0;
        let ruined = false;

        for (let trade = 0; trade < numTradesPerSimulation; trade++) {
            const rMultiple = rMultiples[Math.floor(random() * rMultiples.length)];
            const riskAmount = equity * (riskPerTradePercent / 100);
            equity += riskAmount * rMultiple;

            if (equity > peak) peak = equity;
            const drawdownPercent = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
            if (drawdownPercent > maxDrawdownPercent) maxDrawdownPercent = drawdownPercent;

            if (rMultiple < 0) {
                currentLosingStreak++;
                if (currentLosingStreak > maxLosingStreak) maxLosingStreak = currentLosingStreak;
            } else {
                currentLosingStreak = 0;
            }

            if (!ruined && equity <= ruinEquityLevel) {
                ruined = true;
            }
            // A ruined path still finishes its remaining trades — equity
            // can (and in reality would) keep moving; "ruined" records
            // that the threshold was breached at least once, not that the
            // path stops there.
        }

        finalEquities.push(equity);
        maxDrawdowns.push(maxDrawdownPercent);
        maxLosingStreaks.push(maxLosingStreak);
        if (ruined) ruinedCount++;
        if (maxDrawdownPercent > 10) exceeded10++;
        if (maxDrawdownPercent > 20) exceeded20++;
        if (maxDrawdownPercent > 30) exceeded30++;
    }

    const result: MonteCarloResult = {
        numSimulations,
        numTradesPerSimulation,
        finalEquity: percentileSet(finalEquities),
        maxDrawdownPercent: percentileSet(maxDrawdowns),
        drawdownExceedanceProbability: {
            at10: exceeded10 / numSimulations,
            at20: exceeded20 / numSimulations,
            at30: exceeded30 / numSimulations,
        },
        maxLosingStreak: percentileSet(maxLosingStreaks),
        riskOfRuin: ruinedCount / numSimulations,
    };

    return { valid: true, result };
}
