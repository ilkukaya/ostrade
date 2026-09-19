import { describe, expect, it } from 'vitest';
import { MAX_SIMULATIONS, MAX_TRADES_PER_SIMULATION, simulateMonteCarlo } from '@/lib/monte-carlo/simulate';
import type { MonteCarloConfig } from '@/lib/monte-carlo/types';

function baseConfig(overrides: Partial<MonteCarloConfig> = {}): MonteCarloConfig {
    return {
        rMultiples: [2, -1, 1, -1, 3],
        numSimulations: 200,
        numTradesPerSimulation: 50,
        riskPerTradePercent: 1,
        startingEquity: 10_000,
        ruinThresholdPercent: 50,
        seed: 42,
        ...overrides,
    };
}

describe('simulateMonteCarlo', () => {
    it('is fully deterministic given the same seed', () => {
        const a = simulateMonteCarlo(baseConfig());
        const b = simulateMonteCarlo(baseConfig());
        expect(a).toEqual(b);
    });

    it('produces a different result for a different seed', () => {
        const a = simulateMonteCarlo(baseConfig({ seed: 1 }));
        const b = simulateMonteCarlo(baseConfig({ seed: 2 }));
        expect(a).not.toEqual(b);
    });

    it('computes an exact, analytically-verifiable result with a single-value R-multiple pool', () => {
        // Only one possible draw -> every trade is deterministic regardless
        // of the random sequence, so the result can be computed by hand.
        const outcome = simulateMonteCarlo(
            baseConfig({ rMultiples: [1], riskPerTradePercent: 10, numTradesPerSimulation: 1, numSimulations: 5 }),
        );
        expect(outcome.valid).toBe(true);
        if (outcome.valid) {
            // equity = 10000 + 10000*0.10*1 = 11000, identical for every path.
            expect(outcome.result.finalEquity).toEqual({ p5: 11_000, p25: 11_000, p50: 11_000, p75: 11_000, p95: 11_000 });
            expect(outcome.result.riskOfRuin).toBe(0);
            expect(outcome.result.maxDrawdownPercent.p50).toBe(0); // equity only ever rises
        }
    });

    it('never draws outside the provided R-multiple pool (bootstrap with replacement)', () => {
        const outcome = simulateMonteCarlo(baseConfig({ rMultiples: [0], numTradesPerSimulation: 30, numSimulations: 10 }));
        expect(outcome.valid).toBe(true);
        if (outcome.valid) {
            // Every trade is breakeven -> equity never moves at all.
            expect(outcome.result.finalEquity.p50).toBe(10_000);
            expect(outcome.result.maxDrawdownPercent.p50).toBe(0);
            expect(outcome.result.riskOfRuin).toBe(0);
        }
    });

    it('drives every path to ruin when every trade is a large loss', () => {
        const outcome = simulateMonteCarlo(
            baseConfig({ rMultiples: [-1], riskPerTradePercent: 20, numTradesPerSimulation: 20, numSimulations: 50, ruinThresholdPercent: 50 }),
        );
        expect(outcome.valid).toBe(true);
        if (outcome.valid) {
            expect(outcome.result.riskOfRuin).toBe(1);
            expect(outcome.result.maxLosingStreak.p50).toBe(20); // every single trade lost
            expect(outcome.result.drawdownExceedanceProbability.at30).toBe(1);
        }
    });

    it('keeps drawdown-exceedance probabilities monotonically non-increasing across thresholds', () => {
        const outcome = simulateMonteCarlo(baseConfig({ numSimulations: 500, numTradesPerSimulation: 80 }));
        expect(outcome.valid).toBe(true);
        if (outcome.valid) {
            const { at10, at20, at30 } = outcome.result.drawdownExceedanceProbability;
            expect(at10).toBeGreaterThanOrEqual(at20);
            expect(at20).toBeGreaterThanOrEqual(at30);
        }
    });

    it('keeps percentiles ordered p5 <= p25 <= p50 <= p75 <= p95', () => {
        const outcome = simulateMonteCarlo(baseConfig());
        expect(outcome.valid).toBe(true);
        if (outcome.valid) {
            const { p5, p25, p50, p75, p95 } = outcome.result.finalEquity;
            expect(p5).toBeLessThanOrEqual(p25);
            expect(p25).toBeLessThanOrEqual(p50);
            expect(p50).toBeLessThanOrEqual(p75);
            expect(p75).toBeLessThanOrEqual(p95);
        }
    });

    it('rejects an empty R-multiple pool', () => {
        expect(simulateMonteCarlo(baseConfig({ rMultiples: [] }))).toEqual({
            valid: false,
            reason: expect.stringContaining('at least one historical R-multiple'),
        });
    });

    it('rejects non-positive or excessive simulation counts', () => {
        expect(simulateMonteCarlo(baseConfig({ numSimulations: 0 })).valid).toBe(false);
        expect(simulateMonteCarlo(baseConfig({ numSimulations: -5 })).valid).toBe(false);
        expect(simulateMonteCarlo(baseConfig({ numSimulations: MAX_SIMULATIONS + 1 })).valid).toBe(false);
        expect(simulateMonteCarlo(baseConfig({ numSimulations: MAX_SIMULATIONS })).valid).toBe(true);
    });

    it('rejects non-positive or excessive trades-per-simulation counts', () => {
        expect(simulateMonteCarlo(baseConfig({ numTradesPerSimulation: 0 })).valid).toBe(false);
        expect(simulateMonteCarlo(baseConfig({ numTradesPerSimulation: MAX_TRADES_PER_SIMULATION + 1 })).valid).toBe(false);
    });

    it('rejects non-positive risk-per-trade or starting equity', () => {
        expect(simulateMonteCarlo(baseConfig({ riskPerTradePercent: 0 })).valid).toBe(false);
        expect(simulateMonteCarlo(baseConfig({ startingEquity: 0 })).valid).toBe(false);
    });

    it('rejects a ruin threshold outside (0, 100)', () => {
        expect(simulateMonteCarlo(baseConfig({ ruinThresholdPercent: 0 })).valid).toBe(false);
        expect(simulateMonteCarlo(baseConfig({ ruinThresholdPercent: 100 })).valid).toBe(false);
        expect(simulateMonteCarlo(baseConfig({ ruinThresholdPercent: 150 })).valid).toBe(false);
    });
});
