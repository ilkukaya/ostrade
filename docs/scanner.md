# Swing Scanner

**Status: implemented.** Scans a symbol universe and reuses the exact same
deterministic rule engine as the stock detail page — see
`docs/swing-engine.md`. Route: `/scanner`.

## Architecture

```
Market Universe (lib/market-data/universe.ts)
      ↓
Historical bars (lib/market-data/service.ts — Finnhub, Stooq fallback)
      ↓
analyzeSwingSetupDetailed (lib/swing/analyze.ts — the SAME function the
      stock detail page calls; the scanner never reimplements indicators
      or rules)
      ↓
ScannerResult (lib/scanner/types.ts — composes SwingAnalysisResult, adds
      instrument/price/timestamp/rsi/relativeVolume/trend)
      ↓
Persisted incrementally in a ScannerRun (database/models/scannerRun.model.ts)
      ↓
Client polls lib/actions/scanner.actions.ts::scanUniverse until complete
```

## Why it's batched instead of one big request

Netlify's serverless functions have an execution time limit. Scanning
100+ symbols sequentially (or even in one large parallel burst against a
free-tier API) risks both a timeout and a rate-limit rejection. So a scan
is never "one request, one big response": `runScannerBatch`
(`lib/scanner/service.ts`) processes at most 10 symbols per call, at most 4
of those concurrently (`lib/concurrencyLimiter.ts`), and records progress
in MongoDB. The client (`components/scanner/ScannerClient.tsx`) calls it
repeatedly — this is the "simplest robust alternative to streaming
progress" the deployment brief asks for: no websockets, no queue
infrastructure, just cheap, bounded, idempotent polling.

## Caching

A completed scan is cached (the same `ScannerRun` document, TTL-indexed) for
6 hours by default — reasonable given daily bars only change once a
trading day. A plain repeat request for the same (user, universe, config)
combination is served from that cache instantly, with zero market-data
calls. "Refresh" (`forceRefresh: true`) bypasses it and starts over. Since
none of the scanner's filters (score, setup, R/R, relative volume, RSI
range, trend) change the underlying analysis — they only decide what's
*shown* — changing them never re-triggers a scan; they're applied
client-side against the already-fetched result set.

## Market universes

Three static universes (Dow 30, Nasdaq-100, S&P 500 curated subset — see
`docs/market-data.md` for why the latter two are explicitly approximate)
plus a dynamic "Custom Watchlist" universe resolved per-user from the
existing `Watchlist` collection. See `lib/market-data/universe.ts`.

## Explainability

Every row expands into the exact same rule-by-rule breakdown
(`components/swing/shared.tsx`'s `RuleRow`) used on the stock detail page —
there is exactly one renderer for a `RuleResult`, shared by both, so they
can never drift out of sync with each other.

## Saving a candidate

Each row (expanded) has a "Save Candidate" button
(`components/swing/SaveCandidateButton.tsx`) — see `docs/candidates.md`
for what that persists and why it re-runs the analysis fresh at save time
rather than reusing the (possibly hours-old, cached) scan result.

## Known limitations

- A symbol whose historical data can't be fetched (Finnhub plan
  restriction with no Stooq coverage, e.g. a non-US symbol) is recorded in
  `skipped` with a reason, never silently dropped or faked.
- The Nasdaq-100 and S&P 500 lists are static, best-effort snapshots (see
  `docs/market-data.md`) — they will drift from real index membership over
  time and need periodic manual review.
- Only the BREAKOUT setup exists today (see `docs/swing-engine.md`), so
  every scanner result is evaluated against that one setup.
