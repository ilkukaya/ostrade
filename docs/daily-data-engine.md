# Daily EOD Market Data Engine

## The core principle

OSTRADE is a **Daily End-of-Day Swing Trading Research Terminal**, not a
realtime trading terminal. The primary reference price for every piece of
analysis is the **last completed daily bar** — never an incomplete,
still-forming intraday candle. The app is designed to be opened once (or a
few times) a day, not polled continuously; "Friday" additionally implies a
weekly review (see below), but every other weekday gets the same daily
treatment. Nothing in this architecture assumes or requires intraday
polling, websockets, or a live tick feed.

This shapes almost everything below: data flows one direction, from
provider → normalized local database → every feature that needs it, and
"live" market-data calls are the exception (a sync run, or a one-time
seed), not the default read path.

```
DAILY EOD DATA (Stooq/Yahoo)
        ↓  (sync — manual today, see below)
NORMALIZED HISTORICAL DATABASE (MongoDB MarketBar)
        ↓  (local-first reads — historicalDataRepository.ts)
SCANNER / STOCK ANALYSIS / BACKTEST / CANDIDATE OUTCOME TRACKING
        ↓
DailyAnalysisSnapshot (one row per instrument per session)
        ↓
CANDIDATES / JOURNAL / STATISTICS / DAILY REVIEW / WEEKLY REVIEW
```

## Local-first: the single most important architectural change

Before this engine existed, the scanner, stock detail page, backtester, and
candidate-outcome cron each called `lib/market-data/service.ts` directly —
meaning a full universe scan, a backtest, and a daily outcome check all
independently re-fetched the same symbols' history from a live provider,
every time. That doesn't scale (rate limits, latency, cost-if-a-provider-
ever-charges) and it isn't necessary: daily bars from days ago never change.

Now, every one of those reads through **`lib/market-data/historicalDataRepository.ts`**:

- `getBars(instrument, options)` — reads ONLY from MongoDB's `MarketBar`
  collection. Never calls a provider. Supports `{ from, to, limit }` so a
  caller can ask for "the last 300 bars" (the scanner, the stock page) or
  "everything" (the backtester, candidate outcome tracking).
- `getBarsOrFetch(instrument, options)` — the same, except when a symbol
  has **never been seeded** (zero stored bars at all), it performs exactly
  one live provider fetch (via `service.ts`'s fallback chain — see below),
  validates and stores the result, then reads locally again. This is a
  **just-in-time seed**, not a general cache-refresh mechanism: an
  already-seeded symbol whose data has simply gone stale is **not**
  re-fetched here. That's a deliberate sync run's job.
- `upsertBars` / `getCoverage` / `getCoverageForSymbols` / `getDataProvenance`
  — the write path and the freshness/diagnostics queries, all driven off
  the same collection.

A market-data **provider** (Finnhub/Stooq/Yahoo) is now only ever consulted
in two places: a deliberate sync run, or `getBarsOrFetch`'s just-in-time
fallback for a symbol nobody has ever looked at. Every other feature reads
the local database and nothing else — which also delivers the
**"SAME DATA + SAME STRATEGY = SAME RESULT"** guarantee: the stock detail
page, the scanner, and the backtester all compute a symbol's score from
the exact same stored bars, so they can never quietly disagree.

## The `MarketBar` model

`database/models/marketBar.model.ts` — one normalized row per
(symbol, market, timeframe, date):

```
symbol, market, exchange?, currency?, timeframe ('D'|'W'|'M'), date (YYYY-MM-DD)
open, high, low, close, adjustedClose?, volume
provider, fetchedAt
```

- **Unique index** on `(symbol, market, timeframe, date)` — a repeated
  fetch of an already-stored date safely overwrites it (picking up a
  provider's correction) instead of creating a duplicate row.
- **No TTL.** Daily OHLCV rows are small (a few dozen bytes each) and are
  the raw material the whole app depends on — they are kept **permanently**,
  unlike `ScannerRun`/`BacktestRun`-style ephemeral caches. See "MongoDB
  storage" below.
- **Data source attribution**: every bar carries `provider` and
  `fetchedAt`, so a fallback is never invisible — `getDataProvenance()`
  and the `/data` diagnostics view both read straight from this field.

### Validation — never feed corrupt data to the indicator engine

`lib/market-data/validateBar.ts`'s `validateBar`/`sanitizeBars` reject (with
a stated reason, never silently):

- `high < low`
- an out-of-range open/close (outside `[low, high]`)
- a non-finite value (`NaN`/`Infinity`) in any OHLC/volume field
- negative volume
- a malformed/invalid `time` (must be `YYYY-MM-DD`)
- a duplicate timestamp within the same batch (the DB's unique index is
  the second line of defense; this catches it before a write is even
  attempted)

`upsertBars` runs every bar through this before writing and reports
rejects separately from inserted/updated counts — a rejected bar is never
silently dropped without a reason, and never silently stored either.

### Adjusted vs. unadjusted prices — one consistent policy

Both Stooq and Yahoo can return a dividend/split-adjusted close alongside
(or instead of) the raw close. This project picked **one** policy and
applies it everywhere, rather than letting each provider's default behavior
leak through inconsistently:

- **`close` is always the raw (split-adjusted, not dividend-adjusted)
  price** — this is what every technical indicator, the swing engine, the
  backtester, and every chart-comparison assumption in this app uses.
- **`adjustedClose` is stored for transparency only**, never substituted
  into `close`, and never read by any indicator/rule/backtest calculation.

This means a stock's own history is never a silent mix of adjusted and
unadjusted values depending on which provider happened to answer a given
sync run — `close` means the same thing on every single row, forever.

## Provider fallback chains (`lib/market-data/service.ts`)

| Purpose | US chain | BIST/TR chain | Fallback-on-total-failure |
| --- | --- | --- | --- |
| Historical daily bars | Stooq → Yahoo | Yahoo | last provider's error returned; caller (sync, or `getBarsOrFetch`) falls back to whatever is already stored locally |
| Quote / company profile | Finnhub → Yahoo | Yahoo | last provider's error |
| Financials / news | Finnhub only | Yahoo (honestly `unavailable` — not implemented) | Finnhub's error, unchanged |
| Symbol search | Local universe search (always) + Finnhub (optional enrichment) | same | never fails — local search always returns something, even empty |

None of these ever fabricates a result when every provider in the chain
fails — the caller gets a typed `MarketDataError`, and every feature built
on top of this (scanner, stock page, sync, candidate tracking) treats that
as "skip with a reason," never as "show a plausible-looking fake number."
See `docs/market-data.md` for the full provider-selection rationale
(why Stooq is primary for US, why Yahoo is the only viable BIST source, and
Yahoo's own documented limitations) and `docs/bist.md` for BIST specifics.

## The sync engine (`lib/market-data/sync/`)

A **manual, owner-triggered, resumable batch job** — not an automatic cron
(see "What's optional" below) — that keeps the shared `MarketBar` collection
current for every static universe's symbols (never the per-user Custom
Watchlist, which seeds lazily via `getBarsOrFetch` instead).

- **`resolveMarketSymbols(market)`** — the deduplicated union of every
  static universe for that market (e.g. Dow 30 ∪ Nasdaq-100 ∪ S&P 500 for
  `US`; BIST 30 ∪ 50 ∪ 100 for `TR`).
- **`startMarketDataSync({ userId, market, forceRefresh })`** — creates a
  `MarketDataSyncRun` (id, market, universe, startedAt/finishedAt, status,
  requestedSymbols, successful/failed/unchangedSymbols, barsInserted/
  barsUpdated, per-symbol failures). Reuses an already-`running` run for
  the same `(userId, market)` instead of starting a duplicate — a
  double-click on "Update US" never launches two identical imports.
- **`runMarketDataSyncBatch`** — advances one run by a small batch
  (`BATCH_SIZE=8`, `CONCURRENCY=4` — smaller than the scanner's, since a
  sync's per-symbol cost can include a full-history provider fetch),
  idempotent to call repeatedly; the client polls until `completed`. This
  is the exact same resumable-batch pattern as `ScannerRun`/`BacktestRun`
  (see `docs/scanner.md`), reused rather than reinvented.

### What "incremental" actually means here

The spec's original intuition was a small "overlap window" re-fetch. In
practice, **Stooq's and Yahoo's free endpoints have no "just the new bars"
range parameter** — every successful call returns the provider's entire
available history. So "incremental" means:

1. **Skip** a symbol whose latest stored bar already covers the latest
   expected completed session (`marketCalendar.ts::latestExpectedCompletedSession`)
   — nothing could possibly be new for it yet.
2. Otherwise, fetch the full history anyway (unavoidable with these
   providers) and **upsert** it. This is safe and idempotent thanks to
   `MarketBar`'s unique index — re-storing already-correct bars changes
   nothing — and it is actually **more robust** than a small overlap
   window would have been: it catches a provider's correction to *any*
   historical bar, not just the last few days.

`forceRefresh: true` bypasses the skip check entirely (re-seeding,
debugging) — not normal daily use.

### Market calendar (`lib/market-data/marketCalendar.ts`)

Deliberately lightweight — **not** a full market-holiday calendar:

- Every bar date is derived in the exchange's own timezone
  (`epochSecondsToMarketDate`, via `Intl.DateTimeFormat`), never a naive
  UTC slice — the same instant can be a different calendar date in
  New York vs. Istanbul.
- `isSessionLikelyComplete` / `latestExpectedCompletedSession` know
  weekends and each market's approximate close time, so "today" is never
  treated as complete before it plausibly could be.
- A real market holiday is **not** detected — it's treated like an
  ordinary trading day that simply has no bar. Data-gap detection (below)
  is what surfaces that gap to the owner; this module doesn't try to guess
  "was that a holiday or a provider failure."

### Data gap detection

`historicalDataRepository.ts`'s coverage functions (and the `/data`
freshness dashboard) report **missing bars as missing** — a symbol behind
the expected session is `stale`, a symbol with zero bars is `unsynced`.
Nothing interpolates a missing day's price. A genuine holiday and a
provider failure look identical from this layer's point of view (see
above); telling them apart is left to the owner reading the gap, not
guessed at automatically.

### Corporate actions (splits, symbol changes)

At the level this project operates at:

- **Splits**: handled implicitly by using each provider's own
  split-adjusted `close` (see "Adjusted vs. unadjusted prices" above) — a
  split does not require any special-case code here, since the provider
  already returns a continuous, split-adjusted series.
- **Discontinuities / symbol changes**: `InstrumentId.symbol` is the
  business-layer identity OSTRADE uses everywhere (candidates, journal,
  statistics); nothing architecturally forces it to equal "whatever the
  exchange currently calls this company." If a BIST or US symbol is ever
  renamed, the existing rows under the old symbol are simply historical
  fact under that old key — this project does not yet implement an
  automatic symbol-rename migration (a documented limitation, not
  something silently mishandled).
- Dividends are intentionally **not** applied to `close` at all (see
  above) — there is no dividend-adjustment logic to get wrong.

### Provider health / diagnostics

Deliberately **not** a separate monitoring subsystem. `MarketDataSyncRun`'s
own `failedSymbols` (with `{ symbol, reason, provider }`) already is the
diagnostics log the spec asked for — the `/data` page surfaces it directly
(expandable failure list per market) rather than duplicating it into a
second tracked model.

## The manual `/data` admin page

Owner-authenticated (every action re-checks the session server-side —
never trust a hidden route alone), Netlify-serverless-safe (the same
batched-polling pattern as everywhere else, no persistent process):

- **Update BIST / Update US / Update All** buttons, each showing live
  progress (`X / Y updated`, unchanged/failed counts, new/updated bar
  counts) without blocking the UI.
- **Data freshness dashboard**: per-market symbol counts, synced vs.
  stale vs. never-synced, the latest session date actually stored, and
  what "current" means right now (`getMarketFreshness` —
  `lib/market-data/sync/freshness.ts`) — computed with a single
  aggregation query (`getCoverageForSymbols`), not one query per symbol.
- **Failure list**: every failed symbol with its reason and which
  provider produced the failure — never a silent skip.

## `DailyAnalysisSnapshot` — per-session scoring history

`database/models/dailyAnalysisSnapshot.model.ts` — one row per
(symbol, market, strategyVersion, marketDate), generated by
`lib/analysis/dailySnapshotService.ts::generateDailySnapshots`, which
**reuses the existing deterministic Swing Engine** (`analyzeSwingSetupDetailed`)
over locally-stored bars — never a second scoring implementation.

Key design choices:

- **Dated by the instrument's own latest available bar**, not "today" by
  wall-clock assumption. A symbol whose data is a few days stale still
  gets a snapshot — just correctly dated for the session it actually
  reflects, never backdated or fabricated to look current.
- **Compared against the most recent strictly-prior snapshot** for the
  same instrument + strategy version, producing a
  `changeClassification` (see `lib/analysis/dailyChangeClassification.ts`):
  `NEW_SETUP` / `NEWLY_QUALIFIED` / `SCORE_IMPROVED` / `SCORE_DETERIORATED`
  / `LOST_QUALIFICATION` / `SETUP_INVALIDATED` / `NO_MATERIAL_CHANGE`, plus
  a `scoreChange`. Both are computed once at generation time and stored,
  so every reader (the Daily Review page, the dashboard pulse card) sees
  the same value rather than recomputing it. **Purely descriptive research
  context — never a buy/sell instruction**, and the weekly "qualified N of
  the last 5 sessions" persistence metric derived from this data
  (`lib/analysis/weeklyReview.ts`) explicitly never feeds back into
  strategy scoring.
- **Never touches `Candidate`.** A `Candidate` is a user's own deliberate,
  immutable "I saved this" snapshot (`docs/candidates.md`); a
  `DailyAnalysisSnapshot` is an unattended, objective, market-wide
  observation generated for every tracked instrument whether or not any
  user ever looks at it. Saving a candidate never reads or writes this
  collection, and generating snapshots never mutates a candidate.
- **No TTL** — same permanent-retention policy as `MarketBar`, since the
  Weekly Review's trailing-session history depends on it.

Generation is a single, unbatched pass (unlike sync/scanner/backtest): it
touches no external provider and does zero network I/O (bars are already
local), so even a full universe is cheap — only Mongo round-trips are
concurrency-capped (`CONCURRENCY=8`).

### Daily Review and Weekly Review (`/review`, `/review/weekly`)

- **`/review`** (`lib/analysis/dailyReview.ts`): every instrument's
  latest-session snapshot for a market, filterable by universe, status
  change, min score, min score increase, min relative volume, and trend —
  with summary counts per classification.
- **`/review/weekly`** (`lib/analysis/weeklyReview.ts`): a trailing
  **5-session** (a trading week, not a calendar week) aggregate per
  instrument — score sequence, weekly score change, weekly return,
  qualified-session ratio, status-change count, weekly high/low — plus the
  user's own candidates that resolved during that window. Explicitly a
  *complement* to daily scanning, never a replacement for it.

Both read only what's already been generated — neither one re-runs the
Swing Engine itself; that only happens in `generateDailySnapshots`.

## Cron ordering (if/when automatic jobs exist)

If automatic scheduling is ever added, the intended order is:

1. Market Data Sync
2. Daily Analysis Snapshot generation
3. Candidate Outcome Update
4. Optional alerts

Today, only step 3 (`checkCandidateOutcomes`, `lib/inngest/functions.ts`)
runs on an automatic schedule; steps 1 and 2 are manual-only (see below),
so this ordering is currently a documented intention for future automation,
not yet an enforced pipeline. `checkCandidateOutcomes` itself already reads
local-first (`lib/candidates/updateOutcomes.ts`) rather than calling a
provider per candidate per day.

## What's optional vs. automatic today

- **Market data sync**: manual only, via `/data`. No automatic Inngest
  cron exists for it. This was a deliberate choice, not an oversight: it
  keeps the "zero-cost-first" guarantee simple (no scheduled job that
  could someday be pointed at a paid plan without a human noticing) and
  keeps every write serverless-safe and owner-initiated. Adding an
  automatic daily sync later is possible (the batching/resumability is
  already there) but is explicitly not required for the app to work.
- **Daily snapshot generation**: same — manual only
  (`lib/actions/dailySnapshot.actions.ts::runDailySnapshotGeneration`),
  for the same reason, and because generating snapshots against
  data that hasn't been synced yet would be misleading.
- **Candidate outcome tracking**: the one piece that *is* automatic today
  (daily Inngest cron, unchanged from before this engine existed).

## MongoDB free-tier storage

`MarketBar` and `DailyAnalysisSnapshot` are the only genuinely
"grows forever" collections here, and both store **normalized values
only** — no duplicate raw provider payloads, no redundant computed fields
beyond what's actually read elsewhere. `ScannerRun`/`BacktestRun`-style
run-tracking documents remain TTL'd or explicitly bounded as before. See
`docs/deployment-netlify.md` for the practical free-tier (M0, 512MB)
implications.

## Zero-cost-first

This project must remain zero-budget-first. Do **not** introduce a
Twelve Data paid plan, a Finnhub paid plan, a Polygon paid plan, a Tiingo
paid plan, a Marketstack paid plan, or any paid BIST data feed — without
the owner's explicit approval. Never enable an automatic paid upgrade or
automatic billing expansion through code. Every provider integrated so far
(Stooq, Yahoo, and Finnhub's free tier) needs no paid plan for the
functionality this app actually depends on; see `docs/market-data.md`'s
"Finnhub is optional" section for how core functionality keeps working
with `FINNHUB_API_KEY` unset entirely.

## Known limitations (stated explicitly, not left implicit)

- No automatic sync/snapshot cron (see above) — both are manual, and a
  fresh deployment shows empty Daily/Weekly Review pages until the owner
  visits `/data` and generates at least one day's snapshots.
- No real market-holiday calendar (see "Market calendar" above) — a
  holiday gap looks identical to an unexplained missing bar.
- No automatic corporate-action symbol-rename migration.
- BIST company names are a small, manually-verified list
  (`instruments/bist.ts`), not a complete mapping — see `docs/bist.md`.
- `DailyAnalysisSnapshot` generation covers only the static-universe
  union per market, not arbitrary Custom Watchlist symbols — the
  dashboard's "Watchlist Changes" section reports `classification: null`
  (never a guess) for a watchlist symbol outside every tracked universe.
