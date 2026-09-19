# Trade Journal

**Status: implemented.** Route: `/journal` (list) and `/journal/new` (log a
trade). See `docs/candidates.md` for the separate Candidate system — a
trade is explicitly **not** the same thing as a candidate; the two stay
distinct collections rather than conflating "was it traded" into a signal
snapshot (see the deployment brief).

## What a trade is

Something the owner actually executed — always manually entered, with no
broker connection or execution, ever. A trade can optionally link back to
the `Candidate` that led to it (`candidateId`, `database/models/trade.model.ts`),
copying that candidate's `setupType`/`strategyId`/`strategyVersion`/`signalDate`
at creation time so the trade's own record of "what kind of setup this was"
never changes even if the candidate is later cancelled — but a trade can
also be logged completely standalone, with no candidate at all.

Unlike a Candidate, a trade is **not immutable** — it's the owner's personal
bookkeeping, not a reproducible research signal, so mistakes can be deleted
outright (`deleteTrade`) rather than requiring a correction workflow.

## Lifecycle

```
OPEN  →  WIN | LOSS | BREAKEVEN     (via "Close Trade" on the journal page)
```

There is no separate generic `CLOSED` status distinct from
WIN/LOSS/BREAKEVEN — once an exit is recorded, `netPnl`'s sign always
resolves to exactly one of those three (`lib/trades/pnl.ts::computeTradeFinancials`),
so a fourth "closed but undetermined" state would be redundant. Closing is
one-way: to fix a mistake on a closed trade, delete it and re-log it rather
than re-closing.

## Position sizing (the Risk Engine)

`lib/risk/positionSizing.ts::calculatePositionSize` — pure arithmetic, no
market-data or database dependency, embedded directly in the "Log Trade"
form (`components/risk/PositionSizeCalculator.tsx`) so the owner can size a
position before committing to the trade:

```
Inputs:  Account Equity, Risk Per Trade %, Entry Price, Stop Price
Outputs: Risk Budget       = Equity × (Risk% / 100)
         Risk Per Share    = |Entry − Stop|
         Maximum Shares    = floor(Risk Budget / Risk Per Share)
         Position Value    = Maximum Shares × Entry Price
         Portfolio Exposure = Position Value / Equity
```

Always rounds `maxShares` **down** — rounding up would silently risk more
than the configured percentage. `maxShares: 0` is a valid, meaningful result
(the stop is too wide, or the risk budget too small, for this account) — it
is never reported as an error; the calculator only reports `valid: false`
when the calculation itself is impossible (non-positive equity/risk/price,
or a stop equal to the entry, which would divide by zero).

Account equity and risk % are calculator inputs only — nothing about them
is persisted, since this app doesn't model a brokerage account. Currency is
never hardcoded: the calculator displays whatever currency string the trade
form carries, sourced from `lookupInstrumentCurrency` (a best-effort quote
lookup) or the owner's own manual override — the "USD" shown in the form by
default is a UI starting value the owner can freely change, not a business
rule anywhere in `lib/risk/` or `lib/trades/`.

## MFE / MAE

`lib/trades/excursion.ts::calculateExcursion` — **Maximum Favorable
Excursion** and **Maximum Adverse Excursion**, computed from each daily
bar's high/low between the entry date (inclusive — the entry already
happened during that session) and the exit date (inclusive), or through
the most recent available bar for a still-open trade:

- Long: favorable = `bar.high − entryPrice`; adverse = `entryPrice − bar.low`.
- Short: favorable = `entryPrice − bar.low`; adverse = `bar.high − entryPrice`.
- Both are clamped at zero (never negative) — if price never moved
  favorably/adversely, that excursion is simply 0, not a negative number.

Computed automatically at trade creation and again at close (over the full
entry-to-exit window). Unlike candidate outcome tracking, there is **no
daily cron** keeping an open trade's MFE/MAE live — the "Refresh MFE/MAE"
button on an open trade's row (`components/journal/JournalClient.tsx`)
recomputes it on demand instead, which was judged the simplest robust
option for a value that most matters at close time anyway.

## P/L and R-multiple

`lib/trades/pnl.ts::computeTradeFinancials` — computed once at close and
stored (fees and the exit price don't change after the fact, so there's no
reason to recompute on every read):

```
grossPnl   = (exitPrice − entryPrice) × positionSize          [LONG]
           = (entryPrice − exitPrice) × positionSize          [SHORT]
netPnl     = grossPnl − fees
rMultiple  = (exitPrice − entryPrice) / |entryPrice − stopLevel|   [LONG, sign-flipped for SHORT]
```

`rMultiple` is omitted (not fabricated as some default) whenever no stop
was recorded, or the stop equals the entry price — an R-multiple requires a
well-defined unit of risk.

## The journal pages

- **`/journal`** — filters (status, symbol, date range), a table of every
  logged trade, and an expandable row per trade showing stop/targets,
  MFE/MAE, notes, and (for an OPEN trade) the "Close Trade" mini-form and
  "Refresh MFE/MAE". A closed-trade summary line (`n = ...`, win rate,
  average R) links to `/statistics` for the full breakdown — see
  `docs/statistics.md`.
- **`/journal/new`** — the manual entry form, with the position-size
  calculator embedded so sizing happens as part of logging, not a separate
  step. Reachable standalone, or pre-filled from a candidate via "Log Trade
  From This" on the candidate's expanded row (`/candidates`), which carries
  `candidateId`/`symbol`/`stopLevel`/`target1`/`target2` across as query
  parameters — the owner still enters their own actual entry date/price/size,
  since that's what genuinely happened and can differ from the candidate's
  plan.

## Explicitly out of scope

No broker execution, ever — this stays manual research/journal software,
per the deployment brief. Free-form editing of an already-logged trade's
core fields (beyond closing it) isn't built — delete and re-log covers
correcting a mistake without adding a second edit pathway to keep in sync
with the close/financials logic.
