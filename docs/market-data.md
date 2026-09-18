# Market Data

## Why this layer exists

Nothing outside `lib/market-data/` should ever import Finnhub (or any other
provider) directly. Everything else — UI, server actions, the swing engine
— depends on `lib/market-data/service.ts` and the types in
`lib/market-data/types.ts`. That's what lets a symbol like `THYAO` route to
a future BIST provider someday without touching the UI or the analysis
engine at all (see "Future providers" below).

```
lib/market-data/
  types.ts               Quote, HistoricalBar, CompanyProfile, NewsItem,
                          MarketDataProvider interface, MarketDataError
  providers/
    finnhub.ts            the only provider today
    stooq.ts               free historical-bar fallback (see below) — not a
                          full MarketDataProvider, just a helper Finnhub's
                          provider calls internally
  service.ts               getQuote/getHistoricalPrices/getCompanyProfile/
                          getFinancials/getNews/searchSymbols — routes a
                          symbol to its provider (currently always Finnhub)
                          and orchestrates things a single provider
                          shouldn't have to know about (e.g. news across a
                          whole watchlist, batched quotes for a table)
```

`lib/actions/finnhub.actions.ts` is a thin Server Action adapter over
`service.ts`, kept only so existing call sites (search command, header,
watchlist chips) didn't have to change shape during the refactor. New code
should import `lib/market-data/service.ts` directly.

## Error handling

Every provider call returns a `MarketDataResult<T>` —
`{ ok: true, data: T } | { ok: false, error: MarketDataError }` — never a
bare `null` that collapses "not configured", "rate limited", "symbol
doesn't exist", and "provider is down" into the same undifferentiated
failure. `MarketDataError.kind` is one of:

| kind | meaning |
| --- | --- |
| `not_configured` | no API key set |
| `auth` | provider rejected the credentials |
| `rate_limit` | provider throttled the request |
| `plan_restricted` | valid credentials, but this endpoint needs a paid plan |
| `not_found` | the symbol/resource doesn't exist |
| `network` | the request never completed |
| `bad_response` | the provider responded, but the payload was malformed |
| `unavailable` | reachable, but returned a server error |

`describeMarketDataError()` (in `types.ts`) maps each kind to a short,
user-facing message — the UI shows that, never raw provider error text.

## Historical prices: Finnhub's free-tier gap, and the Stooq fallback

Finnhub's `/stock/candle` endpoint (daily OHLC history) is gated behind a
paid plan for most free-tier API keys. Since the entire swing-analysis
engine, the eventual scanner, and backtesting all need real historical
bars, this would otherwise be a hard blocker for a $0 deployment.

`getHistoricalPrices` in `providers/finnhub.ts` handles this in order:

1. Try Finnhub's candle endpoint. If the caller does have access (a paid
   plan, or a symbol/resolution the free tier happens to allow), this just
   works.
2. If Finnhub reports a plan restriction (or isn't configured for
   candles), fall back to **Stooq** (`providers/stooq.ts`) — a free,
   no-API-key daily-bar CSV endpoint (`stooq.com/q/d/l/`) that's been used
   by open-source market-data tooling for exactly this gap for years.

This is real historical data, not invented — but it's also explicitly
best-effort:

- Stooq is only used as a fallback for **daily** bars; weekly/monthly
  history still requires a Finnhub plan with candle access, and
  `getHistoricalPrices` returns a clear `unavailable` result rather than
  guessing when that's not available.
- Coverage is US-listed tickers only (see `toStooqSymbol` in
  `providers/stooq.ts`) — non-US symbols get an honest `not_found`/
  `unavailable` result, never fabricated bars.
- If Stooq's CSV format or endpoint ever changes, `parseStooqDailyCsv`
  throws a `bad_response` error rather than silently returning garbage —
  it's covered by unit tests with fixture CSVs
  (`__tests__/stooq.test.ts`) precisely so a real format change would be
  caught by a failing test, not a silent data-quality regression.

## Future providers (BIST, etc.)

Do not build a BIST provider speculatively — the deployment brief is
explicit about this: don't invent a data source before a reliable free one
is confirmed to exist. When one is:

1. Implement `MarketDataProvider` in `lib/market-data/providers/<name>.ts`.
2. Teach `getProviderForSymbol()` in `service.ts` to route the relevant
   symbols/exchanges to it (currently a single-line stub — see the comment
   there).
3. Nothing else changes. The UI, the swing engine, and every server action
   already depend only on the `MarketDataProvider` interface.
