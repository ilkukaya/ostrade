# Server Action Authorization Audit

Run as part of the production-hardening pass before the first live deploy —
verifying every protected page and server action actually enforces the
"private, single-owner terminal" model (`AUTHORIZED_EMAIL`, see
`docs/architecture.md`) server-side, not just via the `(root)` layout's
client-facing redirect.

## The core finding: a page-level redirect does not protect a Server Action

`app/(root)/layout.tsx` redirects to `/sign-in` for any unauthenticated
**page render** under `(root)` — but a Next.js Server Action
(`'use server'`) is a public HTTP endpoint of its own, invokable directly
by anyone who can reach the deployed app, independent of whether the page
that renders it was ever visited. This isn't specific to functions a client
component actually calls: **every exported function in a `'use server'`
file is registered as its own callable action, including one only ever
called by other server-side code in the same file.** Confirmed empirically
against a real build's `.next/server/server-reference-manifest.json` — an
auth-free helper (`buildAndSaveCandidateSnapshot`, only ever called
internally by the already-auth-checked `saveCandidate`) showed up there
with its own action ID, reachable from the `/candidates` and `/statistics`
page bundles, exactly like `saveCandidate` itself.

The one safe assumption: a plain module with **no** `'use server'`
directive is never reachable this way, however it's imported — Next.js only
turns a file's exports into public endpoints when that directive is
present. That's the fix applied throughout this audit — either add a
session check inside the action, or (where nothing about the function
needed to be a browser-invokable action in the first place) move it out of
the `'use server'` file entirely.

## What was found and fixed

| File | Problem | Fix |
| --- | --- | --- |
| `lib/actions/alert.actions.ts` | `createAlert`/`getUserAlerts` trusted a client-supplied `userId` param with no session check at all; `deleteAlert`/`toggleAlert` took only an `alertId` — any caller could delete or toggle **any** alert by ID | Added `requireUserId()`; `userId` is now always derived from the session, never accepted as a parameter; `deleteAlert`/`toggleAlert` now query `{_id, userId}` so an ID alone can't touch another user's record |
| `lib/actions/watchlist.actions.ts` | Same pattern: `addToWatchlist`/`removeFromWatchlist`/`getUserWatchlist`/`isStockInWatchlist` all trusted a client-supplied `userId` | Same fix — `requireUserId()`, `userId` param removed from every signature |
| `lib/actions/finnhub.actions.ts` | No session check on any export (`getQuote`, `searchStocks`, etc.) — anonymously invokable, and would spend the app's own Finnhub quota on unauthenticated requests | Added `requireUserId()` to every export. The one exception: the 5-minute price-alert cron (`lib/inngest/functions.ts`) needs a quote fetch with **no** user session at all (it's a scheduled background job) — it now calls `lib/market-data/service.ts`'s `getQuote` directly instead of going through this file |
| `lib/actions/swing.actions.ts` (`getSwingAnalysis`) | Exported from a `'use server'` file with no auth check, but never actually called from a client component — only from the already layout-gated `stocks/[symbol]/page.tsx` | Removed the `'use server'` directive entirely (with a comment explaining why, so it isn't "helpfully" re-added). No longer a Server Action at all, so there's nothing to anonymously invoke |
| `lib/actions/adanos.actions.ts` (`getStockSentimentInsights`) | Same pattern as `swing.actions.ts` — never called from a client component, would otherwise let an anonymous caller spend the app's Adanos API quota | Same fix — `'use server'` removed |
| `lib/actions/candidate.actions.ts` (`buildAndSaveCandidateSnapshot`) | The exact case that surfaced this whole audit — an auth-free helper, exported for unit-testability, but still independently invokable with an arbitrary `userId` | Moved to `lib/candidates/buildAndSaveCandidateSnapshot.ts`, a plain module with no `'use server'` directive. `saveCandidate` (still in the actions file, still auth-checked) is the only thing that can create a candidate through this path now |
| `lib/actions/trade.actions.ts` (`fetchBarsSinceEntry`) | Same pattern — exported for reuse by `createTrade`/`closeTrade`/`refreshExcursion`, independently invokable | Moved to `lib/trades/fetchBarsSinceEntry.ts`, same treatment |

Given this is a single-owner app (one real account can ever exist, gated
by `AUTHORIZED_EMAIL`), the practical impact of most of these was bounded
— an anonymous caller couldn't see or corrupt the real owner's data through
`listCandidates`/`listTrades`/etc., since those always scope by the
*session's* `userId`. The real exposure was: unauthenticated use of the
app's own paid-adjacent API quotas (Finnhub, Adanos), unauthenticated
database writes (spurious `Alert`/`Watchlist`/`Candidate` rows on a 512MB
free-tier cluster), and — for `deleteAlert`/`toggleAlert` specifically — a
genuine cross-record authorization bypass (IDOR) independent of the
single-owner assumption, since neither ever checked ownership at all.

## Regression tests added

- `__tests__/alert.actions.test.ts`, `__tests__/watchlist.actions.test.ts`
  (new) — assert every export throws `Not authenticated` with no session,
  and that the Mongoose query/document passed to the model always reflects
  the *session's* user ID, via a scoping assertion (e.g.
  `expect(mockFindOneAndDelete).toHaveBeenCalledWith({ _id: 'alert-1', userId: 'user-1' })`)
  that would fail again if the ownership check were ever removed.
- `__tests__/candidate.actions.test.ts`, `__tests__/trade.actions.test.ts`
  — unchanged in substance, only their import path moved to match the
  relocated functions.

## What was already correct (no gap found)

Audited but not changed: `lib/actions/backtest.actions.ts`,
`lib/actions/montecarlo.actions.ts`, `lib/actions/portfolio.actions.ts`,
`lib/actions/scanner.actions.ts`, `lib/actions/review.actions.ts`,
`lib/actions/dailySnapshot.actions.ts`, `lib/actions/marketDataSync.actions.ts`,
`lib/actions/auth.actions.ts` — every export already called
`requireUserId()` (or, for `auth.actions.ts`, is itself the sign-in/sign-up
entry point) before touching the database, and none trusted a
client-supplied user identifier.

## Re-verification after these changes

```
npm run typecheck  # clean
npm run lint       # 0 errors (12 pre-existing warnings, unrelated to this pass)
npm test           # 490 passed, 4 skipped at the time of this pass (493 as of the final production-hardening pass — later work added a few more)
npm run build      # succeeds, including with zero credentials
```

Confirmed directly against the build output
(`.next/server/server-reference-manifest.json`): `buildAndSaveCandidateSnapshot`,
`fetchBarsSinceEntry`, `getSwingAnalysis`, and `getStockSentimentInsights`
no longer appear anywhere in it, while the legitimate actions
(`saveCandidate`, `searchStocks`, `createAlert`, etc.) still do.
