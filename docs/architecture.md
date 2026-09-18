# Architecture

This is a fork of [Open-Dev-Society/OpenStock](https://github.com/Open-Dev-Society/OpenStock)
(AGPL-3.0), re-purposed as a private, single-owner swing trading research
terminal. See `README.md` for what changed at a glance and `PROGRESS.md`
for what's implemented versus planned.

## Stack

- Next.js 15 (App Router), React 19, TypeScript (strict), Tailwind CSS v4,
  shadcn/ui + Radix primitives
- Better Auth (email/password) with the MongoDB adapter
- MongoDB via Mongoose (`database/`) — Atlas free tier in production, a
  local Docker container for development
- Finnhub for quotes/profile/financials/news/search, with a free daily-bar
  fallback via Stooq for historical prices (see `docs/market-data.md`)
- TradingView embeddable widgets for charts (kept — see "Why TradingView
  stays" below)
- Inngest for the two remaining background jobs (welcome email, price-alert
  cron)
- Vitest for tests

## Directory map

```
app/                    Next.js App Router routes
  (auth)/                sign-in, sign-up, forgot/reset password — public
  (root)/                everything else — requires a session
  api/inngest/           Inngest's webhook endpoint

components/              UI components (shadcn primitives in components/ui)

database/
  mongoose.ts            connection singleton
  models/                Watchlist, Alert (Mongoose models managed by this
                          app; Better Auth manages its own user/session/
                          account collections directly via the native
                          MongoDB driver)

lib/
  actions/               Next.js Server Actions — the only way client
                          components reach the server in this app
  better-auth/           Better Auth instance (lazily initialized — see below)
  inngest/                background jobs
  nodemailer/             outbound email (gated: no-ops if unconfigured)
  market-data/            provider-agnostic market data (docs/market-data.md)
  technical/              pure technical-analysis functions (docs/swing-engine.md)
  swing/                  the rule engine built on top of lib/technical
  private-access.ts       AUTHORIZED_EMAIL allowlist logic
  ai-provider.ts          gemini/minimax/siray abstraction (welcome-email
                          copy only — never used for indicators/scoring)

middleware/index.ts       redirects unauthenticated requests to /sign-in
                          (checks for a session cookie only — full session
                          validation happens per-request in the route/action)

__tests__/                 flat top-level tests, plus __tests__/technical/
                          and __tests__/swing/ for the analysis engine
```

## Why TradingView stays

TradingView widgets remain the charting layer. They're free, already
working, and licensed for exactly this kind of embed. The differentiator
this project adds is the analysis layer *around* the chart (swing score,
rule breakdown, trade plan) — not a chart replacement. See the deployment
brief's own framing: "TradingView = visual chart inspection; our engine =
systematic setup research."

## Deliberately excluded from the OpenStock import

- **Kit/ConvertKit integration** (`lib/kit.ts` and the newsletter/
  re-engagement Inngest jobs that used it) — this was multi-user SaaS
  growth tooling (broadcast newsletters, inactive-user win-back emails)
  that doesn't apply to a single-owner deployment, and one of its debug
  scripts seeded a hardcoded personal test account into the database.
- **`@vercel/analytics`** — Vercel-specific telemetry; it would just no-op
  (with wasted network calls) once deployed to Netlify.
- A handful of one-off debug scripts (`check_db_name.js`, `resolve_srv.js`,
  `inspect-user.mjs`, etc.) that weren't part of the documented tooling in
  the upstream README.

## Notable fixes made getting a strict build working

`next.config.ts` used to set `eslint.ignoreDuringBuilds` and
`typescript.ignoreBuildErrors` to `true`. Turning those off surfaced real,
pre-existing bugs that had been silently masked:

1. **Inngest functions were broken.** The installed SDK version requires
   `createFunction(options, trigger, handler)` as three separate
   arguments; the code passed `{ ...options, triggers: [...] }` as one.
   Both cron/event functions would have failed at runtime.
2. **The production build required a live database connection just to
   compile.** `lib/better-auth/auth.ts` used to do
   `export const auth = await getAuth()` — a top-level `await` that ran
   the instant the module was imported. Since most routes import it
   (transitively), Next.js's "Collecting page data" build step ended up
   opening a real MongoDB connection during `next build`. On Netlify (or
   anywhere without guaranteed DB reachability at build time), this is a
   real risk of build failures unrelated to the actual code. Fixed by
   making `getAuth()` a lazily-invoked async function (call sites now do
   `const auth = await getAuth()` at the top of whatever route/action needs
   it) and marking the two route trees that depend on session state
   (`app/(root)/layout.tsx`, `app/(auth)/layout.tsx`) as
   `export const dynamic = 'force-dynamic'` so they're never prerendered.
3. `test:db` referenced a nonexistent `scripts/test-db.mjs` (the real file
   is `test-db.ts`) — fixed by adding `tsx` and running the actual file.
4. Assorted `any` types, unescaped JSX entities, and one fully orphaned
   component (`WatchlistTable.tsx`, superseded by `WatchlistManager.tsx`
   but never deleted) that `tsc`/`next lint` had never actually been
   allowed to check.

See `PROGRESS.md` for what's still open.
