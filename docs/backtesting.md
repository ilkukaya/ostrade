# Backtesting

**Status: not implemented yet.** Design sketch for `PROGRESS.md`
Milestone 8.

## The one hard requirement

Chronological validity — a backtest must never let a rule at time T see a
bar from after time T. This is the entire point of a backtest engine; a
backtester that fails this test is worse than useless because it *looks*
credible while being wrong.

## Why the existing code is already most of the way there

`lib/technical/` and `lib/swing/` were built specifically so this would be
possible later without a rewrite:

- Every indicator function takes an explicit bar array and returns a
  series aligned to it — nothing reaches outside the array it's given.
  Feeding `analyzeSwingSetup(symbol, bars.slice(0, i + 1))` for each `i`
  walking forward through history is already exactly correct; there is no
  hidden global state or caching inside `lib/swing` that would leak future
  data across calls.
- `analyzeSwingSetup` is deterministic — the same slice of bars always
  produces the same `SwingAnalysisResult`, which is what makes a backtest
  reproducible at all.

## What still needs to be built

1. **A walk-forward runner**: for a symbol and a historical bar series,
   step forward bar-by-bar (or week-by-week for a swing timeframe — no
   need to evaluate every single day if the strategy is meant to be
   checked weekly), calling `analyzeSwingSetup` on the bars available up
   to that point only, and recording every QUALIFIED (or WATCH, if that's
   the desired backtest scope) result as a signal.
2. **An entry/exit/stop simulator**: given a signal's entry zone, stop
   level, and targets, walk forward through the bars AFTER the signal to
   determine which was hit first (stop, target 1, target 2, or "still
   open" at the end of the available data) — using each subsequent bar's
   high/low, not just its close, to check for intrabar level touches.
   Decide and document a consistent tie-breaking rule for a bar whose
   range touches both a stop and a target (a real ambiguity — the
   deployment brief calls out "realistic candle sequencing
   considerations" for exactly this reason).
3. **Missing-data handling**: real historical series have gaps (holidays,
   provider outages). Skip a signal that can't be evaluated cleanly rather
   than guessing; report how many signals were skipped alongside the
   results (never hide it).
4. **Strategy versioning**: a backtest run is only meaningful if it's
   pinned to one specific `SwingStrategyConfig` (see
   `docs/strategy-config.md`) — a later config change should never
   silently change what an old backtest result means. This doesn't need
   the full "stored, versioned strategies in the database" system from
   `docs/strategy-config.md` — even just recording the config object
   (JSON) alongside the backtest run's results is enough to start.

## Avoiding curve-fitting

Once this exists, do not tune `SwingStrategyConfig` purely to maximize the
backtest's historical profit. Use a train/test split or walk-forward
validation, and report when a bucket's sample size is too small to
conclude anything (`PROGRESS.md` Milestone 7's "never hide sample size"
principle applies here too).

## Explicitly out of scope until this exists

Monte Carlo (`docs/monte-carlo.md`, `PROGRESS.md` Milestone 9) needs a real
trade/R-multiple distribution to resample from — it depends on this
existing first, not the other way around.
