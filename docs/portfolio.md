# Portfolio Analytics

**Status: implemented (intentionally minimal).** Route: `/portfolio`. This
was the explicitly lowest-priority milestone in the deployment brief
("manual holdings only... if time remains") and is scoped accordingly —
smaller and simpler than the Trade Journal, Statistics, Backtesting, or
Monte Carlo, deliberately.

## What this is (and isn't)

A **current-value snapshot** of manually-entered holdings — no broker
connection or execution, ever, same principle as the Trade Journal
(`docs/journal.md`). It is explicitly **not**:

- A historical performance tracker (no time-weighted return, no equity
  curve over time — that's what `/statistics` and `/backtest` already do
  for candidates/trades).
- A live brokerage sync — every holding is typed in by the owner.
- A tax-lot or realized-P/L tracker — only the current position (quantity
  + weighted-average cost) is modeled, not the history of buys/sells that
  produced it.

## One row per symbol, blended on add

`database/models/holding.model.ts` enforces a unique `(userId, symbol)`
index — adding more of a symbol already held blends into the existing row
via `lib/portfolio/valuation.ts::blendAverageCost` (the standard
weighted-average-cost formula: `(existingQty × existingCost + addedQty ×
addedPrice) / newQty`), rather than creating a second line item for the
same position. Adding at a *different* currency than the existing row is
rejected outright — blending cost basis across currencies would produce a
number with no real meaning.

There is no separate "edit" action. Correcting a mistake means delete and
re-add — the same precedent already established for the Trade Journal,
which keeps the action surface to just `addHolding`/`deleteHolding` rather
than a second code path to keep in sync with the blending behavior.

## Currency safety

Exactly the same principle as `docs/statistics.md`'s trade statistics and
`docs/journal.md`'s position sizing: market values are never summed across
currencies. `PortfolioValuation.byCurrency` is a list, one entry per
currency actually present among the holdings — a single-currency portfolio
simply has one entry. Each holding's "% of portfolio" is computed only
*within its own currency group* (`percentOfCurrencyGroup`), never as a
fraction of a blended, meaningless total.

A currency group's total market value is reported as `null` — not a
partial sum — if even one holding in that group is missing a live quote,
so a partial total is never mistaken for the whole picture. Cost basis
(which needs no live quote) is always computed, regardless.

## Explicitly out of scope

- Realized P/L / tax lots.
- Historical equity-curve / time-weighted performance.
- Automatic reconciliation with a broker or exchange.
- Any connection between a Portfolio holding and a Trade Journal entry —
  the two are independent; logging a trade doesn't update a holding, and
  vice versa. Wiring them together (e.g., closing a Journal trade
  auto-adjusting the matching holding) is a reasonable future idea, not
  built now, in keeping with this milestone's explicitly minimal scope.
