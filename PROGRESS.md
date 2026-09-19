# Progress / Roadmap

Running tracker for turning OpenStock into a private Swing Trading Research
Terminal. Update this file whenever a milestone's status changes — it's the
source of truth for what's actually done versus planned, so work is never
lost between sessions.

Status legend: ✅ done · 🟡 partial · ⬜ not started

## Milestone 1 — Vanilla deployment (Phase 0–1)

- ✅ Repository audited (see `docs/architecture.md`)
- ✅ OpenStock imported as the base, SaaS growth-marketing cruft
  (Kit/ConvertKit integration, debug/migration scripts with a hardcoded
  personal test account) excluded
- ✅ Production build succeeds with strict TypeScript + ESLint (the
  `ignoreBuildErrors`/`ignoreDuringBuilds` escape hatches are gone)
- ✅ Production build no longer requires a live MongoDB connection (Better
  Auth now initializes lazily; see `docs/architecture.md`)
- ✅ `netlify.toml` + `@netlify/plugin-nextjs`
- ✅ `.env.example` documents every variable the code reads; optional ones
  clearly marked
- ✅ `test:db` script fixed (was pointing at a nonexistent file)
- ⬜ Actual live deploy to a Netlify project + MongoDB Atlas cluster (needs
  the owner's real credentials — can't be done from inside this session)

## Milestone 2 — Private terminal mode (Phase 2)

- ✅ `AUTHORIZED_EMAIL` allowlist gates sign-up (open when unset, so a fresh
  deploy still works before it's configured)
- ✅ Sign-up page stops showing the form once the owner's account exists
- ✅ No plaintext passwords, no weakened session/auth security (Better Auth
  untouched)
- ⬜ API-route-level protection audit beyond the existing middleware
  (current middleware already redirects any unauthenticated request except
  the public auth pages — revisit once new API routes are added for the
  scanner/journal)

## Milestone 3 — Market data provider abstraction (Phase 3)

- ✅ `MarketDataProvider` interface (`lib/market-data/types.ts`)
- ✅ Finnhub provider (quotes, profile, financials, news, search)
- ✅ `getHistoricalPrices` — Stooq primary / Yahoo fallback for US, Yahoo
  for BIST (see `docs/market-data.md` — redesigned in Milestone 11; this
  bullet originally described a Finnhub-candle-first version that no
  longer exists)
- ✅ `FINNHUB_API_KEY` renamed off its misleading `NEXT_PUBLIC_` prefix
- ✅ A second provider (Yahoo Finance) and BIST support — see Milestone 11
  (originally deferred here; the "why and what's needed first" reasoning
  in `docs/market-data.md` this bullet used to point to is now
  `docs/bist.md`'s completion checklist instead)

## Milestone 4 — Swing engine (Phase 4)

- ✅ `lib/technical/`: SMA, EMA, RSI, MACD, Stochastic, Bollinger Bands,
  ATR, relative volume, momentum, rolling volatility, trend classification,
  support/resistance zone clustering — all pure, all unit-tested with
  hand-computed fixtures
- ✅ `lib/swing/config.ts`: configurable strategy thresholds
- ✅ Deterministic rule engine (`RuleResult`, `SwingAnalysisResult`)
- ✅ Swing score (0–100) with transparent per-rule breakdown and a
  PASS/WATCH/QUALIFIED status
- ✅ One setup implemented: **BREAKOUT** (`lib/swing/setups/breakout.ts`)
- ✅ Stock detail page shows the full breakdown (or a clear "data
  unavailable" message — never a fabricated result)
- ⬜ Remaining setup types (architecture supports them; only the config
  values and rule sets need writing): PULLBACK, TREND_CONTINUATION,
  SUPPORT_REVERSAL, MOMENTUM, BOLLINGER_SQUEEZE
- ⬜ Configurable score weights aren't stored anywhere editable by the
  owner yet (they're just the `defaultSwingStrategyConfig` object) — no UI
  or database-backed strategy versioning yet

## Milestone 5 — Scanner (Phase 8)

- ✅ `MarketUniverse` abstraction: Dow 30 (complete), Nasdaq-100 and S&P 500
  (explicitly-labeled partial static snapshots), plus a dynamic Custom
  Watchlist universe (`lib/market-data/universe.ts`)
- ✅ Batch analysis reusing `analyzeSwingSetupDetailed` — no duplicated
  indicator/rule logic (`lib/scanner/service.ts`)
- ✅ Rate-limit protection: concurrency-limited batches (10 symbols/call, 4
  concurrent — `lib/concurrencyLimiter.ts`) so a scan never fires an
  unbounded request burst and stays within serverless execution limits
  regardless of universe size
- ✅ MongoDB-backed scan caching (`ScannerRun`, TTL-indexed, 6h default) —
  a repeat scan of the same universe is served instantly with zero
  market-data calls until `forceRefresh` or expiry
- ✅ `/scanner` page: universe picker, client-side filters (score, setup,
  R/R, relative volume, RSI range, trend), sorting, live "scanning N/total"
  + qualified-count progress, per-row rule-by-rule explainability (shared
  renderer with the stock detail page, not a duplicate), links into the
  existing stock detail page
- ✅ "Save Candidate" from a scanner row (see Milestone 6)
- See `docs/scanner.md`

## Milestone 6 — Candidate tracking (Phase 9)

- ✅ `Candidate` model (`database/models/candidate.model.ts`): immutable
  analysis snapshot (score, rules, trade plan, indicator readings at
  signal time — explicitly excluding the raw bar history, which doesn't
  need to live on every candidate) + a mutable lifecycle
  (`ACTIVE`/`TARGET_1_HIT`/`TARGET_2_HIT`/`STOP_HIT`/`EXPIRED`/
  `CANCELLED`/`AMBIGUOUS`)
- ✅ `saveCandidate` re-runs the analysis fresh at save time (from the
  Scanner or the stock detail page) and persists it — see
  `docs/candidates.md` for why nothing about a saved candidate is ever
  recomputed afterwards
- ✅ `/candidates` page: filters (status, setup, score, symbol, date
  range), and a clear "Signal Snapshot" (frozen) vs. "View Current
  Analysis" (live, links to the stock page) distinction per row
- ✅ Manual cancel action for active candidates
- ✅ **Automatic outcome tracking**: daily Inngest cron
  (`checkCandidateOutcomes`, `lib/inngest/functions.ts`) walks every
  `ACTIVE` candidate forward through the daily bars since its signal via
  the pure, fully unit-tested `lib/candidates/outcome.ts::evaluateCandidateOutcome`
  — detects `TARGET_1_HIT`/`TARGET_2_HIT`/`STOP_HIT`, marks a same-bar
  stop-and-target touch `AMBIGUOUS` rather than guessing which happened
  first, never re-checks the original stop once Target 1 is hit (no
  trailing-stop modeling), and marks 60-day-unresolved candidates
  `EXPIRED`. Long-only (targets above stop) — see `docs/candidates.md`.
- ✅ **Trade Journal** (`database/models/trade.model.ts`, `/journal`,
  `/journal/new`) — a separate collection from Candidate, per above:
  - Manual entry only, no broker execution; optionally linked to a
    Candidate via `candidateId` (copies its setupType/strategy/signalDate
    at creation, not live-joined)
  - `lib/risk/positionSizing.ts`: pure, currency-agnostic position sizing
    (Risk Budget/Risk Per Share/Maximum Shares/Position Value/Portfolio
    Exposure), embedded in the log-trade form as
    `components/risk/PositionSizeCalculator.tsx`
  - `lib/trades/excursion.ts`: MFE/MAE from daily bars, computed at
    creation, refreshed at close or on demand for an open trade (no daily
    cron, unlike candidate outcome tracking — see `docs/journal.md`)
  - `lib/trades/pnl.ts`: grossPnl/netPnl/R-multiple, computed once at close
    and stored; `status` (`OPEN`/`WIN`/`LOSS`/`BREAKEVEN`) derived purely
    from netPnl's sign
  - Trades are editable/deletable by the owner (not immutable like a
    Candidate) — correcting a mistake means delete-and-relog
  - See `docs/journal.md`

## Milestone 7 — Statistics (Phase 11)

- ✅ `/statistics` — candidate and trade statistics kept in separate
  sections, never blended (`docs/statistics.md`)
- ✅ Candidate side (`lib/statistics/candidateStats.ts`): score-bucket table
  (configurable buckets, default 60–64…90+) over **resolved** candidates
  only (ACTIVE/CANCELLED excluded from every rate) — target/stop/
  ambiguous/expired rates, median *theoretical* realized R, average
  planned R:R, average MFE/MAE, always with its own `n =`. Makes no
  assumption that a higher score performs better; that's what the table is
  for finding out.
- ✅ Candidate MFE/MAE: added to the Candidate model, computed once at
  resolution by the existing outcome-tracking job (reuses the same bars it
  already fetches — zero extra market-data cost)
- ✅ Trade side (`lib/statistics/tradeStats.ts`): win rate / avg R / median
  R over closed trades, P/L and profit factor **broken out per currency**
  (never summed across currencies), breakdown by setup type
- ⬜ UI control for custom score-bucket boundaries (the function already
  accepts them; not yet exposed as a page control)
- ⬜ Market-regime breakdowns — deferred until backtesting defines what a
  "regime" means, rather than inventing a second definition here first

## Milestone 8 — Backtesting (Phase 12)

- ✅ `/backtest` — chronological, no-look-ahead walk-forward simulation
  (`lib/backtest/simulate.ts`) reusing `analyzeSwingSetupDetailed` (signal
  generation), `evaluateCandidateOutcome` (exit resolution — the *same*
  function the live outcome-tracking cron uses) and `calculateExcursion`
  (MFE/MAE) rather than a parallel implementation of any of them
- ✅ Two real correctness bugs this reuse surfaced were caught by
  `simulate.test.ts` before shipping (a missing-`closedAt` fallback for a
  plain TARGET_1_HIT, and an unbounded `maxHoldingDays` window that would
  have misreported EXPIRED's date) — see `docs/backtesting.md`
- ✅ Configurable fees/slippage (basis points; slippage on entry + stop
  fills only, fees as a flat round-trip R drag), configurable min score /
  max holding days / date range
- ✅ Strategy versioning: every `BacktestRun` permanently stores the full
  `SwingStrategyConfig` snapshot + fingerprint used, distinct from the
  ephemeral, TTL-expired `ScannerRun` cache — no fingerprint-based reuse,
  every run is a separate, listable research record
- ✅ Rate-limit protection: reuses the scanner's exact batching/concurrency
  architecture (one market-data call per symbol regardless of the date
  range simulated, since full history is fetched once and walked in
  memory) — `BATCH_SIZE=5`/`CONCURRENCY=3`, smaller than the scanner's
  10/4 since each unit of work is a full multi-year simulation
- ✅ Outputs: summary (win rate, expectancy, profit factor, max drawdown —
  documented as a sequential-R simplification, not a concurrent-portfolio
  simulation), broken down by year / setup / score bucket (reusing the
  same `DEFAULT_SCORE_BUCKETS` as candidate statistics)
- ✅ Holdout/validation: optional `holdoutStartDate` splits a run into
  train vs. holdout summaries side by side, to check for curve-fitting
  rather than trusting a full-history number alone
- See `docs/backtesting.md` for the full list of documented simplifications
  (long-only, daily timeframe, one open position per symbol at a time, no
  market-regime breakdown yet)

## Milestone 9 — Monte Carlo (Phase 13)

- ✅ `/monte-carlo` — bootstrap resampling (with replacement) of a real
  R-multiple distribution from either a completed `/backtest` run or the
  owner's own closed Trade Journal entries; never a fabricated
  distribution (`lib/monte-carlo/simulate.ts`)
- ✅ Deterministic/seeded (`lib/monte-carlo/random.ts` — a small seedable
  PRNG, since `Math.random()` can't be reproduced for debugging)
- ✅ Outputs: ending-equity P5/P25/P50/P75/P95, max-drawdown distribution
  + probability of exceeding 10/20/30% drawdown, max losing-streak
  distribution, and risk of ruin against an explicit, configurable
  threshold (kept distinct from peak-relative drawdown — see
  `docs/monte-carlo.md` for why those are two different metrics)
- ⬜ **Not built** (explicitly the lower-priority half of this milestone):
  a separate "Scenario Simulation" of possible future *prices* — if ever
  added, must never be labeled "Prediction"; see `docs/monte-carlo.md`

## Milestone 10 — Portfolio analytics, BIST (Phase 14–15)

- ✅ `/portfolio` — manually-entered holdings only, intentionally minimal
  (current-value snapshot, not a historical performance tracker — see
  `docs/portfolio.md` for the explicit "out of scope" list). One row per
  symbol, blended on add via weighted-average cost
  (`lib/portfolio/valuation.ts`); market value never summed across
  currencies (same principle as trade statistics)
- ✅ BIST preparation docs (`docs/market-data.md`): what's already
  architecture-ready (currency plumbing, exchange-suffix mapping, the
  Market Universe abstraction) vs. what a real provider still needs, and
  an explicit explanation of why scraping is rejected outright rather
  than just deprioritized
- ✅ Dashboard evolution (`/`): a Research Summary section (active
  candidates, open trades, closed-trade win rate, quick links into
  Scanner/Backtest/Monte Carlo/Candidates) replacing the generic
  TradingView-only homepage; removed the Peerlist upvote badge
  (SaaS-marketing cruft, per Milestone 1's original exclusion criteria)
- ✅ Nav updated incrementally as each milestone shipped — Scanner,
  Candidates, Journal, Statistics, Backtest, Monte Carlo, Portfolio all
  present in `NAV_ITEMS`
- ✅ Data-freshness timestamp added to the Swing Analysis panel (the
  primary trading-decision surface) — the Scanner, Candidates, Journal,
  and Backtest pages already showed their own relevant dates
- ⬜ The donate popup and Siray partner banner (see "Known gaps" below)
  remain — left alone deliberately, since removing them cleanly requires
  untangling `components/NavItems.tsx`'s `DonatePopupContext` wiring, a
  higher-risk change than this milestone's scope justified

## Milestone 11 — Daily EOD Market Data Engine + BIST Support (Phase B)

A full redesign of the market-data architecture around end-of-day data,
with first-class BIST support — see `docs/daily-data-engine.md` (the new
architecture) and `docs/bist.md` (BIST specifics) for the complete
picture; this entry is the changelog-style summary.

- ✅ **BIST instrument/universe layer**: `InstrumentId` extended with
  `providerSymbol`/`timezone`; `lib/market-data/instruments/{bist,resolve}.ts`
  (symbol → full metadata, the one translation point every layer uses);
  BIST 30/50/100 static, dated, `partial`-labeled universes
  (`lib/market-data/universes/bist{30,50,100}.ts`).
- ✅ **Yahoo Finance EOD provider** (`providers/yahoo.ts`) behind the
  existing `MarketDataProvider` interface — no API key, isolated (nothing
  outside this file constructs a `.IS` symbol), primary source for BIST,
  fallback for US historical bars/quotes/company-profile.
- ✅ **Provider fallback chains redesigned** in `service.ts`: historical
  bars (Stooq → Yahoo for US, Yahoo-only for TR), quote/company-profile
  (Finnhub → Yahoo for US, Yahoo-only for TR), financials/news unchanged
  (Finnhub-only), search (local-first, Finnhub as optional enrichment).
- ✅ **Normalized `MarketBar` model** + `validateBar`/`sanitizeBars`
  (rejects bad OHLC/volume/timestamps with a stated reason) +
  `historicalDataRepository.ts` (`getBars`/`getBarsOrFetch`/`upsertBars`/
  `getCoverage*`/`getDataProvenance`) — the local-first data layer every
  other feature now reads through instead of calling a provider directly.
- ✅ **Market-data sync engine** (`lib/market-data/sync/`): resumable,
  batched, concurrency-limited, mirrors the scanner/backtest run pattern;
  "incremental" means skip-if-current, full-refetch-and-upsert otherwise
  (documented finding: Stooq/Yahoo have no partial-range endpoint, so this
  is actually more robust than a small overlap window, not less).
- ✅ **`/data` admin page**: owner-authenticated manual sync (per market or
  all), data-freshness dashboard, per-symbol failure diagnostics, and (see
  below) daily-analysis-snapshot generation.
- ✅ **Scanner, stock detail/swing analysis, backtest, and candidate
  outcome tracking all migrated to local-first** reads
  (`historicalDataRepository.ts`), preserving every existing behavior
  (filters, explainability, save-candidate, chronology/holdout/fees/
  slippage, TARGET/STOP/AMBIGUOUS/EXPIRED semantics) — only the
  underlying data source changed. Backtests now stamp a
  `datasetProvenance` (generated-at, latest bar date, providers used) and
  the UI shows a survivorship-bias warning for any static-universe run.
  The stock detail page shows "Data through / Provider / Market /
  Currency" with a staleness warning.
- ✅ **`DailyAnalysisSnapshot`**: one row per (symbol, market,
  strategyVersion, marketDate), generated by re-running the existing
  Swing Engine over local bars (never a second scoring implementation),
  compared against the prior session to produce a purely-descriptive
  `changeClassification` (`NEW_SETUP`/`NEWLY_QUALIFIED`/`SCORE_IMPROVED`/
  `SCORE_DETERIORATED`/`LOST_QUALIFICATION`/`SETUP_INVALIDATED`/
  `NO_MATERIAL_CHANGE`) — never a buy/sell instruction, never feeding back
  into strategy scoring.
- ✅ **`/review` (Daily Review)** and **`/review/weekly` (Weekly Review)**
  pages, plus a "Daily Research Pulse" card on the main dashboard (data
  freshness + today's classification counts + notable watchlist changes
  per market).
- ✅ **Finnhub made fully optional**: local symbol/company-name search
  (`lib/market-data/localSearch.ts`) needing no key; quote/company-profile
  fall back to Yahoo when Finnhub isn't configured, for every market;
  `.env.example`/`scripts/check-env.mjs` no longer describe
  `FINNHUB_API_KEY` as required. `npm run build` verified to succeed with
  zero market-data credentials configured.
- ✅ Zero-cost-first principle stated explicitly in
  `docs/daily-data-engine.md` and `docs/market-data.md`.
- ⬜ **No automatic sync/snapshot cron** — both remain manual, owner-
  triggered (`/data`), a deliberate choice (see
  `docs/daily-data-engine.md`'s "What's optional vs. automatic today").
  `checkCandidateOutcomes` is the one piece that already runs
  automatically, and was migrated to read local-first alongside this
  milestone's other changes.
- ⬜ No real market-holiday calendar, no automatic corporate-action
  symbol-rename handling, BIST company names remain a small verified list
  rather than a complete mapping, a second independent BIST historical
  source (redundancy against Yahoo) — all stated as known limitations in
  `docs/daily-data-engine.md`/`docs/bist.md` rather than left implicit.
- ⬜ New setup types (Pullback/Momentum/Support Reversal/Bollinger
  Squeeze/Trend Continuation) and price-prediction/scenario Monte Carlo —
  explicitly out of scope for this milestone (data architecture only; see
  Milestone 4/9 for where those belong).

## Known gaps / follow-ups worth remembering

- Price alerts are detected (`checkStockAlerts` Inngest cron, every 5
  minutes) and marked triggered in the database, but never actually
  emailed — `lib/nodemailer/templates.ts` still has
  `STOCK_ALERT_UPPER_EMAIL_TEMPLATE` / `STOCK_ALERT_LOWER_EMAIL_TEMPLATE`
  ready to use, the send call was just never wired back up after the
  Kit/ConvertKit removal.
- Cosmetic-only cleanup not fully addressed (low priority, explicitly
  deprioritized versus functional work per the deployment brief): the
  Peerlist upvote badge was removed as part of Milestone 10's dashboard
  update, but the donate popup and Siray partner banner are still present
  from upstream — removing them cleanly requires untangling
  `components/NavItems.tsx`'s `DonatePopupContext` wiring (the "Donate"
  nav button), which was judged a higher-risk change than this milestone's
  scope justified. None of this is functionally wrong, just not
  private-terminal-appropriate branding.
- A handful of `<img>` → `next/image` and React-hooks-exhaustive-deps
  ESLint *warnings* remain (not errors — they don't block the build).
  Tracked, not urgent.
- ✅ `npm audit`: resolved — down from 72 vulnerabilities to 3, via five
  non-breaking direct-dependency bumps (`next`, `better-auth`, `mongoose`,
  `inngest`, `vitest`) plus two small type-fixups they required. The
  `npm audit fix` internal-npm-bug workaround (`--legacy-peer-deps`, then
  a plain re-install to normalize the lockfile) is documented for next
  time. The 2 remaining findings (`nodemailer`, a `postcss` copy bundled
  in `next`) need a breaking major upgrade with no in-range fix and are
  assessed as low-reachability — see `docs/security-audit.md`.
