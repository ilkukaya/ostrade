# Trade Journal

**Status: not implemented yet.** Design sketch for `PROGRESS.md`
Milestone 6/13. See `docs/candidates.md` for the separate, already-
implemented Candidate system — a trade is not the same thing as a
candidate, and the two must stay distinct collections (see the deployment
brief and `docs/candidates.md`'s opening section for why).

## What a trade is

Something the owner actually executed — manually entered, no broker
connection or execution. Optionally linked back to the `Candidate` that
led to it (`candidateId`), but a trade can also be logged standalone.

## Suggested schema

```
Trade
  userId
  candidateId?          (optional link back to the originating candidate)
  symbol, market, direction ('LONG' | 'SHORT')
  setupType, strategyId, strategyVersion

  signalDate?            (when the setup was first identified, if known)
  entryDate, entryPrice
  positionSize
  stopLevel, target1, target2

  exitDate?, exitPrice?
  fees?

  grossPnl?, netPnl?     (computed from entry/exit/size/fees — decide at
                          implementation time whether to store or derive
                          on read; probably store, since fees and exit
                          price won't change after the fact)
  rMultiple?             ((exitPrice - entryPrice) / (entryPrice - stopLevel),
                          sign-adjusted for direction)

  maxFavorableExcursion?  (MFE — see below)
  maxAdverseExcursion?    (MAE — see below)

  status: 'OPEN' | 'WIN' | 'LOSS' | 'BREAKEVEN' | 'CLOSED'
  notes
  createdAt
```

## Position sizing (the Risk Engine)

Before a trade is logged, the owner needs to know how many shares/units a
given risk tolerance implies. Pure, deterministic, currency-aware inputs:

```
Inputs:  Account Equity, Risk Per Trade %, Entry Price, Stop Price
Outputs: Risk Budget       = Equity × Risk%
         Risk Per Share    = |Entry − Stop|
         Maximum Shares    = floor(Risk Budget / Risk Per Share)
         Position Value    = Maximum Shares × Entry Price
         Portfolio Exposure = Position Value / Equity
```

This is pure arithmetic with no market-data dependency — implement it as a
standalone pure function (e.g. `lib/risk/positionSizing.ts`) with the same
"deterministic, unit-tested with fixtures" standard as `lib/technical/`.
Never hardcode USD — the deployment brief is explicit that currency must
come from instrument metadata (`InstrumentId.currency`, already part of
`lib/market-data/types.ts`), since BIST trades will eventually be in TRY.

## MFE / MAE

**Maximum Favorable Excursion** and **Maximum Adverse Excursion**: the best
and worst the trade's open price moved against the entry, measured from
the bars between entry and exit (or entry and "now" for an open trade).
Useful for evaluating whether stops/targets are well-placed independent of
whether the trade actually won or lost. Needs the same OHLC-ambiguity care
as outcome tracking (`docs/candidates.md`) — document the methodology
(e.g. "MFE uses each bar's high for a long position, low for a short")
rather than leaving it implicit.

## What already exists to build on

- `database/models/candidate.model.ts` is the schema pattern to follow —
  same per-user (`userId`) conventions, same "reuse `lib/swing/types.ts`
  types rather than re-declaring them" approach.
- Position sizing and MFE/MAE are pure functions with no dependency on the
  Candidate/Trade models at all — build and test them independently of the
  journal UI, the same way `lib/technical/` was built before anything used
  it.

## Explicitly out of scope for now

No broker execution, ever — this stays manual research/journal software,
per the deployment brief.
