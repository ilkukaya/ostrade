# Backtesting

**Status: implemented.** Route: `/backtest`. Chronological, no-look-ahead
simulation of the exact same deterministic rule engine used on the stock
detail page, the scanner, and saved candidates — a backtest signal means
exactly what a live `QUALIFIED` result means, never a separately-tuned
"backtest mode."

## The one hard requirement, and how it's structurally guaranteed

A backtest must never let a rule at time T see a bar from after time T.
`lib/backtest/simulate.ts::simulateSymbolBacktest` walks a symbol's full
daily bar history forward one bar at a time, calling
`analyzeSwingSetupDetailed(symbol, bars.slice(0, i + 1), strategyConfig)`
at each step — there is no hidden global state or caching inside
`lib/swing/` that could leak future data across calls, so the slice itself
is the entire guarantee. This is directly tested: `simulate.test.ts`'s
"never lets analyzeSwingSetupDetailed see a bar beyond the day being
evaluated" test records every call the mocked analysis function receives
and asserts each one is byte-identical to `bars.slice(0, k + 1)` for its
own last bar — not just "trust the slice," but a check that would fail if
a future refactor accidentally passed the wrong array.

## Reusing production logic, not a parallel implementation

Per the deployment brief's explicit instruction not to duplicate
indicator/strategy logic, the simulator composes three already-tested,
already-production pieces rather than reimplementing any of them:

- **Signal generation**: `analyzeSwingSetupDetailed` (`lib/swing/analyze.ts`)
  — identical to the scanner and stock page.
- **Exit resolution**: `evaluateCandidateOutcome` (`lib/candidates/outcome.ts`)
  — the *same* function the live daily outcome-tracking cron uses (see
  `docs/candidates.md`). A backtest can never quietly disagree with
  production about what "hit the stop" or "hit the target" means, because
  there is only one implementation of that decision, not two that could
  drift apart.
- **MFE/MAE**: `calculateExcursion` (`lib/trades/excursion.ts`) — the same
  function the Trade Journal uses.

### A subtlety this reuse surfaced (and fixed)

`evaluateCandidateOutcome` only sets `closedAt` for `STOP_HIT` /
`TARGET_2_HIT` / `EXPIRED` / `AMBIGUOUS` — a plain `TARGET_1_HIT` (target 2
never defined or never reached) sets only `firstTargetHitAt`, which is fine
for live tracking (`docs/candidates.md`'s outcome job never needs a
`closedAt` for that case) but would have broken the backtester's need to
locate *which bar* a trade exited on. Fixed by using the same fallback
chain `components/candidates/CandidatesClient.tsx`'s `outcomeDate()` helper
already established: `outcome.closedAt ?? outcome.firstTargetHitAt ??
outcome.stopHitAt`.

A second subtlety: `evaluateCandidateOutcome`'s `EXPIRED` check is
`barsAfterSignal.length >= maxHoldingDays` against *whatever array it's
given* — the live cron self-corrects because it always passes "every bar
since the signal through today" (which grows by exactly one bar per daily
run), so the check naturally fires on the correct day. A backtest instead
has the *entire* remaining history available in one call; naively passing
all of it would make `EXPIRED` fire using the last bar of all remaining
history rather than the real `maxHoldingDays` boundary. Fixed by bounding
the window before calling it: `bars.slice(entryIndex, entryIndex +
maxHoldingDays)`. When fewer than `maxHoldingDays` bars remain (near the
end of fetched history), the same slice naturally falls back to `ACTIVE`,
which the simulator reports as `STILL_OPEN` — a deliberately distinct
outcome from `EXPIRED` (see below).

Both of these were caught by `simulate.test.ts` before shipping, not found
in production — exactly the value of testing the mechanics in isolation
(next section).

## Why the simulator's tests mock the analysis function

Constructing real bars that satisfy every rule of the actual Breakout setup
(RSI band, relative volume, trend, ATR-based stop, support/resistance
structure) is fragile busywork that duplicates what `breakout.test.ts` and
`analyze.test.ts` already verify. `simulate.test.ts` instead mocks
`analyzeSwingSetupDetailed` to fire a `QUALIFIED` signal on a specific,
chosen day with specific stop/target levels, which gives full deterministic
control to test the simulator's *own* mechanics: next-bar entry with
slippage, fee drag on net R only, one open trade per symbol at a time (a
second signal mid-trade is never even queried), `STILL_OPEN` vs `EXPIRED`
vs `AMBIGUOUS`, and the no-look-ahead guarantee above.
`evaluateCandidateOutcome` and `calculateExcursion` are used for real
(unmocked) in these tests, since their own correctness is already covered
by their dedicated test suites.

## Execution modeling: fees and slippage

Both are configurable in basis points (`BacktestExecutionConfig.feeBps` /
`slippageBps`), applied without needing a real position size or currency
(R-multiples are size- and currency-invariant, matching the same principle
`docs/statistics.md` applies to trade statistics):

- **Slippage** is applied to the entry fill (`rawOpen * (1 + slippageBps /
  10_000)`) and to a stop-triggered exit (`stopLevel * (1 - slippageBps /
  10_000)`) — modeling both as market orders that fill slightly worse than
  their theoretical price. A target fill is modeled as a limit order and
  fills at its exact level, no slippage.
- **Fees** are a flat round-trip drag subtracted from the R-multiple
  regardless of win/loss: `netR = grossR - (2 * feeBps / 10_000 *
  entryPrice) / riskPerShare`.

## Outcomes

Every simulated trade resolves to exactly one of:

`TARGET_1_HIT` · `TARGET_2_HIT` · `STOP_HIT` · `EXPIRED` · `AMBIGUOUS` · `STILL_OPEN`

The first four mirror the Candidate lifecycle (`docs/candidates.md`).
`AMBIGUOUS` (a single bar's range touching both the stop and a target) and
`STILL_OPEN` (the historical data ran out before `maxHoldingDays` elapsed —
a data-boundary artifact, deliberately distinct from a strategy-defined
`EXPIRED`) both contribute to the outcome-rate counts but never a
fabricated R-multiple; every aggregate function treats `netRMultiple ===
null` as "not decisive" and excludes it from win rate / expectancy /
profit factor, while still reporting how many there were.

Only long/bullish setups are modeled — the only implemented setup
(BREAKOUT) is always long.

## Batching architecture (rate-limit protection)

`lib/backtest/service.ts` mirrors the scanner's batching approach
(`docs/scanner.md`): `getHistoricalPrices` is called exactly once per
symbol (fetching the *entire* available history in one call), and the
entire chronological simulation then runs in memory with zero further
network calls — so a backtest's market-data cost is identical to a
scanner run's, one call per symbol in the universe, regardless of how many
years the backtest covers. `BATCH_SIZE = 5` / `CONCURRENCY = 3` (smaller
than the scanner's 10/4) because each unit of work here is a full
multi-year in-memory simulation, not a single day's analysis — a
conservative margin against serverless execution-time limits.

Unlike `ScannerRun` (an ephemeral, TTL-expired cache), a `BacktestRun` is a
**permanent research record** with no TTL: it exists specifically so a
later strategy-config edit never silently changes what a past backtest
meant. Every `startBacktest` call creates a brand-new run — there is no
fingerprint-based cache reuse, since re-running the same (or a slightly
varied) config to compare results side by side is a normal, expected
workflow, not something to collapse into one entry. `/backtest` lists past
runs (`listBacktestRuns`) so nothing is lost between sessions.

## Strategy versioning

Every `BacktestRun` stores the full `SwingStrategyConfig` snapshot it used,
plus its fingerprint (`lib/swing/configFingerprint.ts` — extracted from the
scanner's own fingerprinting so both features share one implementation)
and the separate `BacktestExecutionConfig` (date range, fees, slippage,
min score, max holding days, holdout boundary). A run's results are fully
reproducible and auditable later regardless of what the *current*
`defaultSwingStrategyConfig` has since become.

## Outputs

- **Summary** (`lib/backtest/aggregate.ts::computeBacktestSummary`): win
  rate, average/median net R (expectancy), profit factor (`null`, never
  `Infinity`, when there are no losses yet), max drawdown, and outcome
  counts — always alongside `n =` the resolved count, per the "never hide
  sample size" principle (`docs/statistics.md`).
- **By year / by setup / by score bucket**
  (`computeBacktestStatsByYear`/`BySetup`/`ByScoreBucket`) — the score
  buckets reuse the *exact same* `DEFAULT_SCORE_BUCKETS` as the candidate
  statistics page, so a backtested score bucket means the same thing as a
  live-candidate score bucket.

### Max drawdown is a documented simplification, not a portfolio simulator

`maxDrawdownR` orders resolved trades by entry date and sums their net R
sequentially into one cumulative curve, reporting the largest peak-to-trough
decline. This assumes trades realize one after another in aggregate — it is
**not** a real concurrent-position simulation (a trader could hold several
symbols at once). Modeling true concurrent capital allocation across
symbols is a substantially larger undertaking explicitly deprioritized
until Portfolio Analytics (`PROGRESS.md` Milestone 10), per "a smaller
correct backtester is preferable to a large invalid backtester." The
simplification is stated here rather than left implicit.

## Avoiding curve-fitting: the holdout split

Set `holdoutStartDate` (exposed in the `/backtest` form) to split a run's
trades by entry date into "train" (before it) and "holdout" (on/after it),
each summarized independently with the same `computeBacktestSummary`
(`lib/backtest/aggregate.ts::splitTrainHoldout` — pure filtering, no
separate aggregation logic to keep in sync). The UI shows both side by
side: a strategy whose edge is strong in training but weak or negative in
the holdout window was very likely tuned to the training data's noise
rather than a real, repeatable edge. This is a **discipline the tool
enables**, not one it can enforce — nothing stops re-running a backtest
repeatedly against the full history and hand-tuning `SwingStrategyConfig`
until it looks good; that would defeat the entire point. Use the holdout
split, and treat the holdout numbers as the more honest estimate.

## Known limitations

- Sequential-only drawdown (see above) — not a concurrent portfolio
  simulation.
- Daily timeframe only, matching the rest of the app
  (`docs/market-data.md`).
- Long-only, matching the only implemented setup.
- No market-regime breakdown yet — deferred to whenever Portfolio
  Analytics or a later setup needs a concrete definition of "regime,"
  rather than inventing one here first (`docs/statistics.md`).
- One open simulated trade per symbol at a time (a second signal while a
  trade is open is never even evaluated) — a documented simplification,
  not a pyramiding/scaling model.

## Explicitly out of scope until this exists (now resolved)

Monte Carlo (`docs/monte-carlo.md`, `PROGRESS.md` Milestone 9) needed a real
trade/R-multiple distribution to resample from — that distribution is
exactly what a completed `BacktestRun`'s `trades` array now provides.
