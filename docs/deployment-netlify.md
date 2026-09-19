# Deploying to Netlify

Target cost: **$0** across every service in this list (see `README.md`'s
cost table). This walks through getting the private terminal live.

## 1. MongoDB Atlas (free tier)

1. Create a free ("M0") cluster at [mongodb.com/atlas](https://www.mongodb.com/atlas).
2. Create a database user (Database Access) with a strong password.
3. **Network Access → Add IP Address → Allow Access from Anywhere
   (0.0.0.0/0).** Netlify's build and function infrastructure doesn't use
   static IPs, so an IP allowlist restricted to specific addresses will
   break both the build and the deployed app. This is the standard
   trade-off for serverless deployments; Atlas connections still require
   the correct username/password.
4. Copy the connection string (`mongodb+srv://...`) — this is your
   `MONGODB_URI`.

## 2. Market data — no signup required

Core historical daily bars (US via Stooq/Yahoo, BIST via Yahoo — see
`docs/market-data.md`) need **no API key and no account at all**. There is
nothing to set up in this step for core functionality to work.

Optionally, sign up at [finnhub.io](https://finnhub.io) (free tier) and
set `FINNHUB_API_KEY` for richer live quotes, company financials, and
news — this is pure enrichment (`docs/market-data.md`'s "Finnhub is
optional" section); every core swing-analysis feature works identically
without it.

## 3. Netlify project

1. Push this repository to GitHub (or your own fork/remote).
2. In Netlify: **Add new site → Import an existing project**, pick the
   repo. `netlify.toml` already declares the build command and the
   official `@netlify/plugin-nextjs` runtime — no manual build
   configuration needed.
3. **Site configuration → Environment variables** — add everything in
   `.env.example` that isn't commented out as optional. At minimum:
   - `MONGODB_URI`
   - `BETTER_AUTH_SECRET` (generate with `openssl rand -base64 32`)
   - `BETTER_AUTH_URL` (your Netlify site's URL, e.g.
     `https://your-site.netlify.app` — update this if you later attach a
     custom domain)
   - `NODE_ENV=production`
   - `FINNHUB_API_KEY` is **not** in this list — it's optional (step 2).
4. **Set `AUTHORIZED_EMAIL` before your first deploy if at all possible**
   (see `docs/architecture.md` / `lib/private-access.ts`). If you deploy
   without it first, set it right after creating your own account —
   sign-up is rejected for every other email address either way, but the
   sign-up page itself only stops being served once your account exists
   and this variable is set.
5. Deploy.
6. **First-run data seed**: sign in, visit `/data`, and click "Update All"
   for each market you care about (US and/or BIST) — this populates the
   local `MarketBar` database from Stooq/Yahoo (see
   `docs/daily-data-engine.md`). The scanner, stock analysis, and
   backtester all read this local database first and only fall back to a
   live provider fetch, once, for a symbol nobody has ever looked at — a
   fresh deploy with an empty database is slower on first use of any given
   symbol until this step runs. Then visit `/data` again (or wait for a
   future automatic job — see `docs/daily-data-engine.md`) and use the
   "Generate Daily Analysis" action so `/review` and `/review/weekly` have
   something to show.

## 4. Optional integrations

Everything in `.env.example`'s "optional integrations" section can be left
unset. The app boots and every core feature (auth, search, watchlist,
stock detail, swing analysis) works without them:

- **Email** (`NODEMAILER_EMAIL`/`NODEMAILER_PASSWORD`) — without these,
  password-reset emails can't be sent and the sign-up welcome email is
  silently skipped. Both are logged, neither crashes the app.
- **Inngest** (`INNGEST_SIGNING_KEY`) — needed once deployed for the
  welcome-email job and the 5-minute price-alert check to run on a
  schedule; for local development, run `npx inngest-cli@latest dev`
  instead.
- **AI** (`GEMINI_API_KEY` or another provider) — only used for the
  welcome email's personalized copy. Every actual analysis calculation
  (indicators, scoring, rules) is deterministic code, never AI — see
  `docs/swing-engine.md`.
- **Adanos** (`ADANOS_API_KEY`) — optional sentiment card on the stock
  detail page.

## Dependency security

See `docs/security-audit.md` for the full `npm audit` pass: what was
fixed (five direct-dependency bumps, all non-breaking), what's left
(`nodemailer` and a `postcss` copy bundled inside `next`, both needing a
breaking major upgrade with no in-range fix — assessed as low-reachability
and documented rather than forced), and a note on an npm/Arborist internal
bug encountered along the way and how it was worked around.

## Verifying the build locally before deploying

```bash
npm install
npm run typecheck   # tsc --noEmit
npm run lint
npm test
npm run build        # this must succeed WITHOUT any .env file present —
                      # if it doesn't, something reintroduced a build-time
                      # dependency on a live service (see docs/architecture.md,
                      # "the production build required a live database
                      # connection just to compile")
```

## Known constraint: MongoDB Atlas free tier auto-pauses

Atlas pauses an M0 (free) cluster after roughly 60 days with no
connections at all, to reclaim capacity. For a private, low-traffic tool
this is a real possibility if you don't log in for a couple of months.
Unlike some serverless databases, Atlas does **not** auto-resume on the
next connection attempt — a paused cluster has to be manually resumed from
the Atlas dashboard (or its API) before the app can reach it again. If the
app suddenly can't connect after a long gap, check the cluster's status in
Atlas first.

## Storage growth on the free tier (512MB, M0)

`MarketBar` (daily OHLCV) and `DailyAnalysisSnapshot` (per-session scoring
history) are the only two collections designed to grow **permanently** —
no TTL, by design (see `docs/daily-data-engine.md`). Both store normalized
values only, no duplicate raw provider payloads, so growth is slow: a
single US+BIST universe's daily bars for several years is a small fraction
of an M0 cluster's 512MB. This is worth knowing about, not worth
pre-optimizing — if it ever becomes a real constraint, the fix is pruning
or archiving old rows deliberately, not silently TTL-expiring data other
features (the Weekly Review's multi-session history, a backtest's date
range) depend on.
