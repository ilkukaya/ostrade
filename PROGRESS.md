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
- ✅ `getHistoricalPrices` — Finnhub candle attempt, Stooq free daily-bar
  fallback when Finnhub reports a plan restriction (see
  `docs/market-data.md`)
- ✅ `FINNHUB_API_KEY` renamed off its misleading `NEXT_PUBLIC_` prefix
- ⬜ A second provider (BIST) — intentionally not started; see
  `docs/market-data.md` for why and what's needed first

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

## Milestone 7 — Statistics (Phase 11) — ⬜ Not implemented yet

Depends on Milestone 6 existing first (there's no candidate/trade data to
aggregate yet). Candidate outcome data now accumulates daily; trade data
accumulates as the owner logs and closes trades. Needed: win rate /
expectancy / profit factor by setup, score bucket, and market regime,
always alongside sample size (`n = ...`), per the "never hide small
samples" principle in the deployment brief.

## Milestone 8 — Backtesting (Phase 12) — ⬜ Not implemented yet

The rule engine (Milestone 4) is deliberately deterministic and side-effect
free specifically so it can be replayed bar-by-bar later without
look-ahead bias — that's the main technical prerequisite, and it's done.
Still needed: a chronological walk-forward runner, an entry/exit/stop
simulator against historical bars, and strategy versioning so a later
config change doesn't silently rewrite what a historical backtest meant.

## Milestone 9 — Monte Carlo (Phase 13) — ⬜ Not implemented yet

Depends on Milestone 8 (needs a real trade/R-multiple distribution to
resample from — this is about simulating equity-curve paths from actual
historical outcomes, not about forecasting prices).

## Milestone 10 — Portfolio analytics, BIST (Phase 14–15) — ⬜ Not implemented yet

Explicitly deprioritized until the above are real and evidence-backed, per
the deployment brief's own priority order.

## Known gaps / follow-ups worth remembering

- Price alerts are detected (`checkStockAlerts` Inngest cron, every 5
  minutes) and marked triggered in the database, but never actually
  emailed — `lib/nodemailer/templates.ts` still has
  `STOCK_ALERT_UPPER_EMAIL_TEMPLATE` / `STOCK_ALERT_LOWER_EMAIL_TEMPLATE`
  ready to use, the send call was just never wired back up after the
  Kit/ConvertKit removal.
- Cosmetic-only cleanup not addressed (low priority, explicitly
  deprioritized versus functional work per the deployment brief): the
  donate popup, the Siray partner banner, and the Peerlist upvote badges
  are all still present from upstream. None of this is functionally wrong,
  just not private-terminal-appropriate branding.
- A handful of `<img>` → `next/image` and React-hooks-exhaustive-deps
  ESLint *warnings* remain (not errors — they don't block the build).
  Tracked, not urgent.
- `npm audit` reports vulnerabilities in transitive dependencies;
  `npm audit fix` currently crashes with an internal npm bug unrelated to
  this project. Worth retrying after a `package-lock.json` refresh in a
  normal (non-sandboxed) environment.
