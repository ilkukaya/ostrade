# Monte Carlo

**Status: implemented** (strategy-equity simulation — the primary,
higher-priority half of this milestone; see "Explicitly not built" below
for the deprioritized half). Route: `/monte-carlo`.

## What it's for (and not for)

Takes a real, historical set of R-multiples — either a completed
`/backtest` run's resolved trades, or the owner's own closed Trade Journal
entries — and bootstrap-resamples it (draws with replacement) many times to
answer: "given how this strategy has actually performed, what does the
range of possible equity curves look like, and how bad could a losing
streak or drawdown realistically get?"

This is explicitly **not** used to predict where a stock's price is going.
`lib/monte-carlo/simulate.ts` never looks at price, a symbol, or any
market data at all — its only input is an array of numbers (R-multiples)
and a handful of scalar parameters. See the deployment brief's own section
on this distinction, and "Explicitly not built" below.

## Two sources, one engine

`lib/actions/montecarlo.actions.ts` exposes both, feeding the same
`simulateMonteCarlo`:

- **`runMonteCarloFromBacktest`** — pulls `netRMultiple` from a completed
  `BacktestRun`'s trades (`docs/backtesting.md`), excluding `null` values
  (STILL_OPEN/AMBIGUOUS trades) the same way every other aggregate over
  `BacktestTrade[]` does.
- **`runMonteCarloFromJournal`** — pulls `rMultiple` from the owner's own
  closed Trade Journal entries (`docs/journal.md`), reflecting what they
  actually did (real entry timing, size, fees) rather than the backtest's
  theoretical fills.

Never a fabricated or synthetic distribution "just to see the charts
work" — both paths return a clear, structured error (`{valid: false,
reason}`) rather than silently falling back to made-up numbers when there
isn't a real resolved trade to resample from yet.

## The simulation

Per simulated path (`numSimulations` of them, each `numTradesPerSimulation`
trades long):

```
equity = startingEquity
for each trade:
    r = a uniformly random draw (with replacement) from the historical R-multiples
    riskAmount = equity * (riskPerTradePercent / 100)
    equity += riskAmount * r              # compounding, matching lib/risk/positionSizing.ts's
                                           # own risk-percent convention
    track: running peak, drawdown-from-peak, consecutive-losing-trade streak
    track: has equity ever fallen to <= ruinThresholdPercent% of STARTING equity?
```

`startingEquity` is an arbitrary unit — this is a ratio/percentage
simulation, not tied to any instrument's currency, same reasoning as
`docs/statistics.md`'s currency-agnostic R-multiple statistics.

### Risk of ruin has an explicit, configurable threshold

With percentage-of-equity position sizing, equity mathematically
approaches zero only in the limit — a single trade essentially never wipes
it out completely. "Ruin" is therefore a **configured threshold**
(`ruinThresholdPercent`, e.g. 50 = "lost at least half of starting
capital"), not literal zero. This is a *different* metric from the
drawdown-exceedance probabilities below: ruin is relative to **starting**
equity (an absolute capital-preservation line), while drawdown is relative
to each path's own **peak** (a running risk-management measure). Reporting
both, separately, was a deliberate choice — collapsing them into one number
would hide which failure mode is actually being described.

## Outputs

All percentile sets (P5/P25/P50/P75/P95) use linear-interpolation
percentiles over the sorted per-path results:

- **Ending-equity distribution** — the range of outcomes after
  `numTradesPerSimulation` trades.
- **Max-drawdown distribution** (percent of each path's own peak) plus the
  probability of ever exceeding a 10%/20%/30% drawdown.
- **Max losing-streak distribution** (consecutive losing trades).
- **Risk of ruin** — the fraction of paths whose equity ever fell to or
  below the configured threshold.

## Reproducibility

`lib/monte-carlo/random.ts::createSeededRandom` is a small, deterministic
PRNG (mulberry32) — `Math.random()` cannot be seeded, so a run built on it
could never be reproduced for debugging. `MonteCarloConfig.seed` is the
only source of randomness; the same seed always reproduces the exact same
`MonteCarloResult`, tested directly in `__tests__/monte-carlo/random.test.ts`
and `__tests__/monte-carlo/simulate.test.ts`.

## Practical limits

Unlike the scanner/backtest engine, this is a single synchronous
computation with no external I/O to batch around — there's no resumable-job
architecture here. `MAX_SIMULATIONS` (50,000) and `MAX_TRADES_PER_SIMULATION`
(2,000) cap one call's work to stay comfortably inside a serverless
function's execution window; exceeding either is rejected with a clear
reason rather than silently clamped. This is more conservative than the
deployment brief's illustrative "100,000 runs" example — if that scale is
ever genuinely needed, it would call for the same batched/resumable
approach the scanner and backtest engine already use, not a bigger
synchronous call.

## Explicitly not built

A separate, clearly-labeled **"Scenario Simulation"** of possible future
*prices* (e.g. bootstrap-resampling historical daily returns, or geometric
Brownian motion) was explicitly the lower-priority half of this milestone
and has not been built. If it's added later, it must never be labeled or
presented as a "Prediction" — same distinction this whole document opens
with — and should live in its own module, not inside `lib/monte-carlo/`,
since it would resample *price returns*, a conceptually different input
from the *strategy R-multiples* this module resamples.
