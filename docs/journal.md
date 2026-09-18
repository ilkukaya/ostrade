# Candidate Journal & Trade Journal

**Status: not implemented yet.** Design sketch for `PROGRESS.md`
Milestone 6.

## Two distinct concepts — keep them separate

- **Candidate**: a setup the engine flagged, saved for the record. Not
  necessarily traded. This is the larger, more statistically useful sample
  for eventually answering "does a higher score actually correlate with a
  better outcome?" (`PROGRESS.md` Milestone 7).
- **Trade**: something actually executed (manually entered — no broker
  connection). Smaller sample, but the one that matters for real P/L.

Don't conflate them into one collection with an "was it traded" flag bolted
on — the deployment brief calls this out explicitly, and their outcome
tracking is genuinely different (a candidate's outcome is "did price
reach Target 1 / hit the stop / expire", a trade's outcome also involves
actual entry/exit price, position size, and realized R-multiple).

## Look-ahead bias: the one rule that matters most here

When a candidate is saved, snapshot the `SwingAnalysisResult` (score,
rules, entry/stop/targets) **as computed at that moment**, and store it
immutably. Never recompute indicators later using bars that didn't exist
yet when the candidate was flagged — that's how a "backtest" quietly stops
being a backtest. `SwingAnalysisResult` already carries a `timestamp` and
every rule's `value`/`explanation`, so nothing needs to change in
`lib/swing/` to support this — it's a matter of persisting the object
Next.js already computes, not changing what it computes.

## Suggested schema (not yet built)

```
Candidate
  symbol, analyzedAt, strategyVersion (see docs/strategy-config.md)
  swingAnalysisSnapshot: SwingAnalysisResult (stored as-is, immutable)
  outcome: 'target1_hit' | 'target2_hit' | 'stop_hit' | 'expired' | 'open'
  outcomeUpdatedAt

Trade
  candidateId? (optional link back to the candidate that led to it)
  symbol, direction, setupType
  entryDate, entryPrice, positionSize
  stopLevel, target1, target2
  exitDate, exitPrice
  rMultiple (computed from entry/stop/exit, not stored redundantly if it
    can be derived — decide at implementation time whether to store or
    compute on read)
  outcome: 'win' | 'loss' | 'breakeven' | 'open'
  notes
```

## What already exists to build on

- The `Watchlist`/`Alert` Mongoose models (`database/models/`) are the
  existing pattern to follow for a new `Candidate`/`Trade` model — same
  conventions (per-user via `userId`, indexed appropriately).
- `SwingAnalysisResult` (from `lib/swing/types.ts`) is already the exact
  shape to snapshot into `Candidate.swingAnalysisSnapshot`.

## Explicitly out of scope until Milestone 5 (scanner) or manual entry exists

There's no candidate *to* save yet outside of viewing one stock page at a
time — a "Save to Swing Candidates" button on the stock detail page is a
reasonable first step that doesn't require the scanner to exist first.
