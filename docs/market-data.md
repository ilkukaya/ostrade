# Market Data

See also: `docs/daily-data-engine.md` (the local-first data architecture,
the sync engine, `DailyAnalysisSnapshot`) and `docs/bist.md` (BIST
specifics). This document covers the provider layer itself: what each
provider is used for, how routing/fallback works, error handling, and the
zero-cost-first principle.

## Why this layer exists

Nothing outside `lib/market-data/` should ever import a specific provider
(Finnhub/Stooq/Yahoo) directly, or construct a provider-specific symbol
(like Yahoo's `.IS` suffix) itself. Everything else — UI, server actions,
the swing engine, the sync engine — depends only on
`lib/market-data/service.ts`, the `MarketDataProvider` interface, and
`InstrumentId` (`lib/market-data/types.ts`). That's what let BIST support
get added later without touching the UI or the analysis engine at all, and
is what would let a future provider replace any of these three without a
wider rewrite.

```
lib/market-data/
  types.ts                Quote, HistoricalBar, CompanyProfile, NewsItem,
                          SearchResult, InstrumentId, MarketDataProvider
                          interface, MarketDataError
  instruments/
    bist.ts               BIST symbol membership + InstrumentId + verified
                          company names (see docs/bist.md)
    resolve.ts             resolveInstrument() — the ONE symbol -> full
                          InstrumentId translation point every layer uses
  universes/
    dow30.ts, nasdaq100.ts, sp500.ts, bist30.ts, bist50.ts, bist100.ts
                          static, dated, versioned symbol lists
  universe.ts              MarketUniverse registry + Custom Watchlist
  marketCalendar.ts        timezone-correct bar dates, session-complete
                          checks (see docs/daily-data-engine.md)
  validateBar.ts           bar validation/sanitization before storage
  localSearch.ts           local symbol/name search (see below)
  historicalDataRepository.ts
                          local-first MarketBar reads/writes (see
                          docs/daily-data-engine.md)
  sync/                    the market-data sync engine (see
                          docs/daily-data-engine.md)
  providers/
    finnhub.ts             optional enrichment: quotes/company-profile
                          (US), financials, news, live search
    stooq.ts                free, no-key US daily-bar CSV provider
    yahoo.ts                free, no-key EOD provider — primary for BIST,
                          fallback for US
  service.ts               routes a symbol to the right provider chain
                          for each capability, and orchestrates things a
                          single provider shouldn't have to know about
                          (news across a whole watchlist, batched quotes)
```

`lib/actions/finnhub.actions.ts` is a thin Server Action adapter over
`service.ts`, kept only so existing call sites (search command, header,
watchlist chips) didn't have to change shape when providers were added.
New code should import `lib/market-data/service.ts` directly.

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

## Provider fallback chains

Each *capability* has its own chain, decided once in `service.ts` — never
duplicated or re-decided inside an individual provider file:

| Capability | US | BIST/TR | On total failure |
| --- | --- | --- | --- |
| Historical daily bars | Stooq → Yahoo | Yahoo | last provider's error; caller falls back to whatever's already stored locally |
| Quote | Finnhub → Yahoo | Yahoo | last provider's error |
| Company profile | Finnhub → Yahoo | Yahoo | last provider's error |
| Financials | Finnhub only | Yahoo (honestly `unavailable`) | Finnhub's error |
| News | Finnhub only | Yahoo (honestly `unavailable`) | Finnhub's error |
| Symbol search | Local universe search (always) + Finnhub (optional) | same | never fails |

Each chain tries providers in order and returns the first success; if
every provider fails, it returns the **last** provider's error (the one
that got furthest), since that's usually the most informative failure to
surface. Nothing here ever fabricates a bar, quote, or profile when the
whole chain fails.

### Why Stooq is primary for US, and Yahoo is the fallback everywhere

Finnhub's `/stock/candle` endpoint (daily OHLC history) is gated behind a
paid plan for most free-tier keys, so it was dropped from the
historical-bars chain entirely — trying it first would just waste a
request. **Stooq** (`providers/stooq.ts`, `stooq.com/q/d/l/`) is a free,
no-API-key daily-bar CSV endpoint used by open-source market-data tooling
for exactly this gap, and is the primary US source. **Yahoo Finance**
(`providers/yahoo.ts`) is an unofficial, undocumented chart endpoint (no
key, no published contract, no uptime guarantee) that covers both US
(fallback) and BIST (primary, and only, source — see `docs/bist.md`).

Both are covered by unit tests against fixture responses
(`__tests__/stooq.test.ts`, `__tests__/market-data/yahoo.test.ts`) so a
real format change from either provider is caught by a failing test, not a
silent data-quality regression — `parseStooqDailyCsv`/`toBars` (Yahoo)
both throw a typed error rather than returning garbage on an unexpected
shape.

### Adjusted vs. unadjusted prices

See `docs/daily-data-engine.md`'s "Adjusted vs. unadjusted prices" section
for the full policy: `close` is always the raw, split-adjusted-only price
every calculation in this app uses; `adjustedClose` is stored for
transparency but never substituted in.

## Finnhub is optional

Finnhub is **enrichment only** — richer live quotes, company financials,
and news when configured — never a hard dependency for core swing
functionality. The app is designed, tested, and built to work fully with
`FINNHUB_API_KEY` unset:

- **Historical bars, the entire local-first data engine, the scanner,
  stock analysis, backtesting, and candidate outcome tracking** never
  touch Finnhub at all — they use Stooq/Yahoo exclusively.
- **Quotes and company profiles** prefer Finnhub when configured (closer
  to real-time), but fall back to Yahoo automatically when it isn't —
  for every market, not just BIST.
- **Symbol search** (`lib/market-data/localSearch.ts`) works entirely
  locally over every tracked static universe (symbol + verified company
  name where known) with no API key at all; Finnhub's live search is
  merged in as an enrichment on top when available, never a requirement.
- **Financials and news** genuinely have no free alternative today (Yahoo
  doesn't implement either) — these two honestly report `unavailable`
  with `FINNHUB_API_KEY` unset, a stated, accepted limitation rather than
  something papered over.
- `npm run build` succeeds, and every core route renders, with zero
  market-data credentials configured — verified as part of this project's
  standard verification pass (see `docs/deployment-netlify.md`).

See `.env.example` for the exact required-vs-optional split.

## Zero-cost-first

This project must remain zero-budget-first. Do not introduce a Twelve
Data paid plan, a Finnhub paid plan, a Polygon paid plan, a Tiingo paid
plan, a Marketstack paid plan, or any paid BIST data feed without the
owner's explicit approval. Never enable an automatic paid upgrade or
automatic billing expansion through code. Stooq, Yahoo, and Finnhub's free
tier are the only providers integrated, and none of them are required to
pay for what this app actually uses.

## Universe data-quality disclosure

Audited 2026-09-19 (production-hardening pass) — per-universe status:

| Universe | Expected count | Actual count | Snapshot date | Source | Complete? |
| --- | --- | --- | --- | --- | --- |
| Dow 30 | 30 | 30 | 2025-01 | Manually maintained | ✅ Yes |
| S&P 500 | 500 companies (503 tickers — 3 dual-class) | 503 | 2026-09-19 | `github.com/datasets/s-and-p-500-companies` (Wikipedia mirror), cross-checked against an official S&P DJI press release | ✅ Yes |
| BIST 30 | 30 | 30 | 2026-09-19 | See `docs/bist.md` | ✅ Yes |
| BIST 50 | 50 | 50 | 2026-09-19 | See `docs/bist.md` | ✅ Yes |
| BIST 100 | 100 | 100 | 2026-09-19 | See `docs/bist.md` | ✅ Yes |
| Nasdaq-100 | ~100 (101 with dual-class) | 101 | 2026-08-04 | `github.com/floyds1995/Auto-Index-Constituents-Tracker`, cross-validated against confirmed reconstitution events | ⚠️ Best-effort — see `universes/nasdaq100.ts`'s doc comment for the specific unresolved gap (an unconfirmed replacement for a mid-2026 Nasdaq delisting, and an imminent quarterly reconstitution this research pass couldn't confirm in detail) |

Five of the six static universes are now verified-complete, exact
constituent lists (not curated approximations) — a change from this
project's earlier state, where Nasdaq-100, S&P 500, and BIST 50/100 were
all `partial: true` curated subsets. Only Nasdaq-100 remains `partial:
true` today, and its doc comment says exactly why, rather than leaving a
vague "best-effort" label unexplained. The UI still shows this
distinction (`~` prefix on the symbol count for whatever remains
`partial`) rather than ever implying a static list is the full, current
real index. Every list — including the now-complete ones — is still a
**manually-maintained snapshot, never scraped or re-fetched live**, and
needs periodic review as real membership changes (index providers
reconstitute quarterly or annually). See `docs/bist.md` for BIST
specifics, and each `universes/*.ts` file's own doc comment for its exact
sourcing and cross-validation.

### Backtest survivorship-bias warning

Running a backtest over a historical period using **today's** static
universe constituent list silently excludes any company that was removed
from that index since (delisted, acquired, or dropped) — which can make
historical performance look stronger than it would have been for someone
actually holding the index the whole time. The `/backtest` UI shows this
warning explicitly for every static universe (never for the per-user
Custom Watchlist) — see `docs/backtesting.md`.

## BIST

See `docs/bist.md` for BIST symbol mapping, the Yahoo-only provider
chain, BIST 30/50/100 universes, currency handling, and an honest
completion checklist. The historical "why scraping Borsa İstanbul's own
bulletin is rejected outright" reasoning lives there too: it's a Terms of
Service risk, it breaks silently with no typed error the rest of this
layer knows how to handle, and a scanner/backtester silently fed corrupted
scraped data is worse than one that plainly says data isn't available.
