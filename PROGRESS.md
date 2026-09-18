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

## Milestone 5 — Scanner (Phase 8) — ⬜ Not implemented yet

Needed:
- A named symbol universe concept (`lib/market-data` already has the
  `InstrumentId` shape to build on; nothing stores a "S&P 500" or "Custom
  Watchlist" list yet)
- Batch analysis: run `analyzeSwingSetup` across a universe, respecting
  Finnhub's free-tier rate limits (`lib/market-data/service.ts` already has
  `getQuotesForSymbols` for batched quotes — historical-bar batching for a
  full universe scan does not exist yet and needs caching/scheduling before
  it's safe to run on demand)
- Scanner results table + filters (score, setup, R/R, relative volume,
  price range) — no UI yet
- Caching layer so a scan doesn't refetch history for every symbol on every
  page load

## Milestone 6 — Candidate tracking / Journal (Phase 9–10) — ⬜ Not implemented yet

Needed:
- Database models: `Candidate`, `Trade`, `AnalysisSnapshot`,
  `StrategyVersion` (none of these exist yet — only `Watchlist` and `Alert`
  do)
- A "Save to Swing Candidates" action from the stock page
  (`SwingAnalysisResult` already has everything needed to snapshot: score,
  rules, trade plan, timestamp)
- Manual trade entry UI + outcome tracking (target/stop hit, R multiple)
- Look-ahead-bias-safe outcome evaluation (compare a saved snapshot against
  later price action, never recompute indicators using future data)

## Milestone 7 — Statistics (Phase 11) — ⬜ Not implemented yet

Depends on Milestone 6 existing first (there's no candidate/trade data to
aggregate yet). Needed: win rate / expectancy / profit factor by setup,
score bucket, and market regime, always alongside sample size (`n = ...`),
per the "never hide small samples" principle in the deployment brief.

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
