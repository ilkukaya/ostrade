# Candidates

**Status: implemented.** Route: `/candidates`. See `docs/journal.md` for
the separate, still-not-implemented Trade Journal — a candidate is
explicitly **not** the same thing as an executed trade; keep the two
concepts distinct rather than conflating them into one "was it traded"
flag (see the deployment brief).

## What a candidate is

An immutable, point-in-time snapshot of what the swing-analysis engine
found for a symbol — saved from either the Scanner
(`components/scanner/ScannerClient.tsx`) or the stock detail page's Swing
Analysis panel via the same `SaveCandidateButton`
(`components/swing/SaveCandidateButton.tsx` →
`lib/actions/candidate.actions.ts::saveCandidate`).

Saving always re-runs `analyzeSwingSetupDetailed` fresh at the moment of
saving — it does not reuse a possibly-hours-old cached scanner result —
because that fresh computation *is* the signal being recorded.

## Why it's immutable, and how that's enforced

If the stock's indicators look different next week, the saved candidate
must still show exactly what it showed the day it was saved — otherwise
any later statistics or backtesting built on this data would be
meaningless (the "reconstructing past signals from current market state"
trap the deployment brief calls out). Concretely, in
`database/models/candidate.model.ts`:

- `buildCandidateSnapshot()` copies every analysis field (score, rules,
  entry/stop/targets, indicator readings) into plain data at save time.
- Nothing in the codebase ever recomputes or overwrites those fields after
  creation — only the lifecycle fields below are ever updated, and only by
  the automatic outcome-tracking job (`docs/backtesting.md`-adjacent, see
  the "Automatic outcome tracking" section).
- The `bars` array (large, and independently re-fetchable from market
  data) is deliberately excluded from the stored `indicatorSnapshot` — the
  snapshot's job is to freeze the *analysis*, not to become an OHLCV cache.

## Lifecycle

```
ACTIVE  →  TARGET_1_HIT | TARGET_2_HIT | STOP_HIT | EXPIRED | AMBIGUOUS
        →  CANCELLED (manual, via the candidates page)
```

`AMBIGUOUS` is a real, distinct outcome — not an error state — for when a
single daily bar's high/low range touches both the stop and a target and
daily OHLC data genuinely cannot reveal which happened first. Never
silently resolve that in the favorable direction; see the automatic
outcome-tracking job.

## Strategy versioning hook

Every candidate stores `strategyId`/`strategyVersion` (currently always
`'swing-core'` / `'1.0'`, since there's only one config in use — see
`docs/strategy-config.md`). This is a forward-looking hook: once real
strategy versioning exists, historical candidates won't need any
migration, because they already recorded which version produced them.

## The candidates page (`/candidates`)

Filters: status (active/closed), setup type, minimum score, symbol, date
range. Every row expands to show:

- **Signal Snapshot** — the frozen rule-by-rule breakdown, reusing the
  exact same `RuleRow` renderer as the stock detail page and scanner
  (`components/swing/shared.tsx`) — never a re-derived or re-styled copy.
- A **"View Current Analysis"** link to `/stocks/[symbol]`, which runs the
  engine fresh, right now. The two are visually and functionally distinct
  on purpose — conflating "what we knew then" with "what's true now" is
  exactly the look-ahead-bias mistake this whole system exists to avoid.

Current price (a live quote, fetched separately per distinct symbol on the
list) is shown for context only — it is never written into the candidate
document itself.

## Automatic outcome tracking

`checkCandidateOutcomes` (`lib/inngest/functions.ts`, cron `0 22 * * *` —
once daily, after the trading day's bars are expected to be available)
walks every `ACTIVE` candidate forward through the daily bars since its
`signalAt` using `lib/candidates/outcome.ts::evaluateCandidateOutcome`, a
pure, fully unit-tested function (`__tests__/candidates/outcome.test.ts`)
that:

- Only ever looks at bars strictly *after* the signal date — the signal
  bar itself is excluded, since the earliest a position could have been
  entered is the next bar.
- Detects `TARGET_1_HIT` / `TARGET_2_HIT` / `STOP_HIT` from the first bar
  whose high/low range resolves one of them.
- Marks a bar that touches **both** the stop and Target 1 as `AMBIGUOUS`
  — daily OHLC cannot reveal which happened first intrabar, and this is
  never silently resolved in the favorable direction.
- Does **not** re-check the original stop once Target 1 has been hit —
  modeling a trailing stop or partial exit is out of scope; once Target 1
  is confirmed, that is the recorded outcome even if price later falls
  back through the original stop.
- Marks a candidate `EXPIRED` (default: 60 trading days with no
  resolution) rather than leaving it `ACTIVE` forever.

Only long/bullish setups are modeled (targets above the stop) — the only
implemented setup (BREAKOUT) is always long. This will need a `direction`
parameter once a short-biased setup exists.

At the same moment a candidate resolves, the job also computes and stores
`maxFavorableExcursion`/`maxAdverseExcursion` (`lib/trades/excursion.ts` —
the same function the Trade Journal uses) over the identical bars already
fetched for the outcome check, at zero extra market-data cost. This is
computed exactly once, never updated again, and never populated for a
candidate that's still `ACTIVE` — see `docs/statistics.md`.

## Statistics

Score-bucket and setup statistics over saved candidates now exist at
`/statistics` — see `docs/statistics.md`, which documents how a candidate's
*theoretical* realized R (if traded exactly as planned) is computed and why
it's kept distinct from a Trade Journal entry's actual realized R-multiple.
