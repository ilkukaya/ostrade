# Statistics

**Status: implemented.** Route: `/statistics`. Aggregates over what
`/candidates` and `/journal` have already accumulated — there is no
separate data collection here, only pure aggregation
(`lib/statistics/candidateStats.ts`, `lib/statistics/tradeStats.ts`) over
the exact same `SerializedCandidate`/`SerializedTrade` types those pages
already use.

## Why candidate and trade statistics are reported separately

A Candidate is the engine's plan; a Trade is what the owner actually did
with it (or didn't — most candidates are never turned into a trade at all).
Blending them into one "performance" number would hide the difference
between "the rule engine's calls were good" and "the owner executed well,"
which is exactly the distinction this whole system exists to preserve (see
`docs/candidates.md` and `docs/journal.md`). So the two get their own
sections, their own sample sizes, and are never averaged together.

## Candidate statistics: realized R is theoretical, not executed

`computeRealizedR` (`lib/statistics/candidateStats.ts`) answers "what would
this candidate have returned if traded exactly as planned?" — full size, no
slippage, no fees, entry at the recorded signal price (`candidate.price`).
This is deliberately distinct from a Trade's `rMultiple`
(`lib/trades/pnl.ts`), which reflects whatever the owner's actual entry,
size, and fees were. Only candidates whose story has actually finished
contribute:

| Status | Included in rates? | Realized R |
|---|---|---|
| `ACTIVE` | No — outcome not known yet | n/a |
| `CANCELLED` | No — owner abandoned it before it played out | n/a |
| `TARGET_1_HIT` / `TARGET_2_HIT` | Yes | `(targetPrice − price) / (price − stopLevel)` |
| `STOP_HIT` | Yes | always exactly `−1` (every implemented setup requires `price > stopLevel`) |
| `EXPIRED` | Yes, for hit-rate purposes | **null** — there was no exit, so no return exists to compute |
| `AMBIGUOUS` | Yes, for hit-rate purposes | **null** — daily OHLC couldn't reveal which of stop/target hit first |

`EXPIRED` and `AMBIGUOUS` are real, counted outcomes (their own rate columns
exist precisely so they aren't swept under the rug), but they never
contribute a fabricated number to "median realized R" — a return that
can't be known is left out of that average rather than guessed at.

## Score-bucket analysis: no assumption that a higher score wins

`computeScoreBucketStats` groups **resolved** candidates by score
(`DEFAULT_SCORE_BUCKETS`: 60–64 through 90+, configurable — pass a custom
`BucketDefinition[]` to the function; not yet exposed as a UI control) and
reports, per bucket, over exactly the same population: target/stop/
ambiguous/expired rates, median realized R, the average *planned* R:R
ratio the engine computed at signal time (`candidate.riskReward` — a
different number from realized R, since it's knowable before the outcome),
and average MFE/MAE. The table makes no claim about whether a higher score
bucket actually performs better — that's exactly the question it's built
to let the saved data answer, once enough candidates have resolved to say
anything. A bucket with `n = 2` is shown exactly as plainly as one with
`n = 40`; small samples are never hidden, only left for the reader to
weigh accordingly.

## Candidate MFE/MAE: computed once, at resolution, for free

Candidates didn't originally track MFE/MAE. Since the daily outcome-tracking
job (`checkCandidateOutcomes`, `docs/candidates.md`) already fetches the
bars needed to detect a target/stop hit, computing MFE/MAE
(`lib/trades/excursion.ts` — the exact same function the Trade Journal
uses, since every implemented setup is long-only) over that same bar slice
costs nothing extra. It's computed exactly once, at the moment a candidate
resolves, over the bars from signal date through resolution — never
recomputed afterward, and never populated for a candidate still `ACTIVE`
(there's no cron re-computing a running excursion for unresolved
candidates; see `docs/candidates.md`).

## Trade statistics: never blend P/L across currencies

`computeOverallTradeStats` only aggregates monetary figures (total/average
net P/L, profit factor) **within a single currency** — `byCurrency` is a
map, not a single number, because summing USD and TRY trades into one
total would produce a figure that looks precise but means nothing (see
`docs/journal.md`'s currency-aware position sizing for the same principle
applied here). Win rate and R-multiple statistics have no such restriction
— an R-multiple is a dimensionless ratio, so it's always safe to average
across every closed trade regardless of what currency it was in.

`computeTradeStatsBySetup` breaks closed trades down by `setupType`
(`'UNSPECIFIED'` for a standalone trade with no linked candidate and no
manually-set setup), using R-multiple stats only — adding a further
currency split on top of a setup split would fragment already-small samples
into meaninglessness.

Profit factor (`sum(wins) / abs(sum(losses))`) is reported as `null`, never
`Infinity`, when a currency group has wins but no losses yet — the ratio is
genuinely undefined at that point, not "infinitely good."

## Not yet built

- A UI control for custom score-bucket boundaries (the underlying function
  already accepts them; only the page doesn't expose it yet).
- Market-regime breakdowns (bull/bear/sideways backdrop) — deferred until
  the backtesting engine (`docs/backtesting.md`) has a concrete definition
  of "regime" to reuse here rather than inventing a second one.
