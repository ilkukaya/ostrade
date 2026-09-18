# Swing Scanner

**Status: not implemented yet.** This is a design sketch for the next
session to start from, per `PROGRESS.md` Milestone 5.

## What it needs to do

Given a symbol universe (e.g. "S&P 500", "Custom Watchlist"), run
`analyzeSwingSetup` (see `docs/swing-engine.md`) across every symbol and
return the ones that qualify, filterable by minimum score, setup type,
minimum R/R, minimum relative volume, and sortable by score/R-R/relative
volume/momentum.

## Why it isn't a thin loop over the stock page's logic

The stock detail page fetches one symbol's history on demand, which is
fine for a single page view. A scanner fetching historical bars for
hundreds of symbols on every request would blow through Finnhub's free-tier
rate limits and make Stooq (see `docs/market-data.md`) hammer a free
endpoint with no key — both against the deployment brief's explicit
guidance ("do not implement an architecture that makes hundreds of
uncontrolled API requests per page load").

## What needs to exist first

1. **A named universe concept.** Nothing today stores "S&P 500" or "my
   custom swing-candidate list" as a set of symbols — only per-user
   `Watchlist` documents exist. A `MarketUniverse` collection (or a static
   config file, to start — no need for a database model on day one) needs
   to hold these.
2. **A caching layer for historical bars.** Fetching once and reusing
   across a scan (and across users, if this ever isn't single-owner) is
   required — not fetching fresh bars for 500 symbols on every scan
   request. `lib/market-data/` has no caching today beyond Next.js's
   `fetch` revalidation on individual provider calls; a scanner needs
   something coarser (e.g. a scheduled Inngest job that refreshes a
   universe's bars once a day and stores the computed
   `IndicatorSnapshot`/`SwingAnalysisResult` per symbol, which the scanner
   page then just reads).
3. **Rate-limit-aware batching** when that scheduled refresh does run —
   the deployment brief suggests incremental universe scanning rather than
   trying to refresh everything in one burst.

## What already exists to build on

- `analyzeSwingSetup(symbol, bars, config)` is already deterministic and
  side-effect-free — safe to call in a loop or a background job.
- `getQuotesForSymbols` in `lib/market-data/service.ts` already batches
  quote+profile fetches for a symbol list (built for exactly this kind of
  use case, currently unused pending the scanner).
- `SwingAnalysisResult` already has everything a scanner row needs (score,
  setup, status, risk/reward) with nothing further to compute.

## Explicitly out of scope until the above exists

Don't build the scanner UI against live, uncached, on-demand fetches "just
to see it work" — that's the exact anti-pattern the deployment brief warns
against, and it would need to be re-architected the moment it hit rate
limits with a real universe size.
