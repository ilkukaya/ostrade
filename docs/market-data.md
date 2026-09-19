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

### What's already architecture-ready for BIST specifically

Nothing below is BIST *support* — it's the parts of the existing
architecture that a real BIST provider would slot into without needing a
redesign, listed so a future implementer doesn't have to rediscover this:

- **Currency**: `InstrumentId.currency`/`Quote.currency`/`CompanyProfile.currency`
  (`lib/market-data/types.ts`) are already optional, provider-supplied
  strings, never hardcoded to `USD` — a BIST provider returning `TRY`
  requires no type change. `lib/risk/positionSizing.ts` and every R-multiple
  calculation in `lib/trades/`, `lib/statistics/`, and `lib/backtest/` are
  already currency-agnostic (R-multiples are dimensionless ratios); only
  the Trade Journal's *display* formatting is currency-aware today
  (`components/journal/JournalClient.tsx::formatMoney`) — a BIST rollout
  would need the same per-currency treatment anywhere else raw prices are
  displayed, which today assumes USD for formatting (`lib/utils.ts::formatPrice`)
  even though the data layer underneath doesn't.
- **Exchange symbol mapping**: `lib/utils.ts::FINNHUB_TO_TRADINGVIEW_EXCHANGE`
  already maps Finnhub's `.IS` suffix to `BIST` for TradingView widget
  embeds — a leftover from the upstream project, not something built for
  this feature, but confirming the exchange-suffix convention this app
  already uses is compatible.
- **Market Universe abstraction** (`lib/market-data/universe.ts`): adding a
  `bist-30` (or similar) entry is exactly as much work as `dow-30` was —
  a static, versioned, explicitly-labeled symbol list (see
  `lib/market-data/universes/dow30.ts` for the pattern). The scanner,
  backtester, and candidate/statistics pipeline all already work against
  any `MarketUniverse`, BIST included, with zero further changes once a
  provider exists.
- **Rule engine**: `lib/swing/` operates on `OhlcBar[]` and has no
  provider- or exchange-specific logic anywhere in it.

### Why scraping is explicitly rejected, not just deprioritized

A scraped BIST data source (screen-scraping a public website, or an
undocumented/unauthorized endpoint) is not an acceptable substitute for a
real provider, for the same reasons the Nasdaq-100/S&P-500 universes are
labeled `partial: true` rather than pretending to be exact (`docs/scanner.md`):

- It breaks silently and often (a page layout change, a bot-detection
  rollout, a ToS enforcement action) with no warning to the owner, unlike
  a documented API error (`MarketDataError`) the rest of this layer is
  built to handle explicitly.
- It's frequently a Terms of Service violation, which this project does
  not do regardless of technical feasibility.
- A backtester or live scanner silently fed corrupted/incomplete scraped
  data is worse than one that plainly says "BIST isn't available yet" —
  exactly the "looks credible while being wrong" failure mode
  `docs/backtesting.md` and `docs/monte-carlo.md` both call out for their
  own respective risks.

A real BIST integration needs a provider with published, authorized
API access (free or paid) and stable historical daily bars — the same bar
this project already held Finnhub/Stooq to (see above). Until one is
confirmed, BIST stays exactly what it is today: an architecture that's
ready, not a feature that pretends to work.
