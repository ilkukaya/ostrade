# Dependency Security Audit

Run as part of the production-hardening pass before the first live deploy.
`npm audit` findings before this pass: **72 vulnerabilities** (3 low, 45
moderate, 19 high, 5 critical). After: **3 vulnerabilities** (1 moderate, 2
high) — both remaining ones require a breaking major-version upgrade with
no safe in-range fix, and are documented below rather than forced.

## What was fixed (non-breaking, in-range bumps)

All five are direct dependencies, bumped to the latest version within
their existing semver range (`package.json`'s caret, or the same exact
patch line for `next`, which is pinned without a caret) — every one
resolved real, published CVEs with no breaking API change:

| Package | Before | After | Severity fixed | Notes |
| --- | --- | --- | --- | --- |
| `next` | 15.5.7 | 15.5.25 | critical, high | Server Actions source exposure, DoS via Server Components, Image Optimizer DoS |
| `better-auth` | 1.3.25 | 1.7.5 | critical | Unauthenticated API-key creation (api-key plugin, unused here), a `rou3`-based path-normalization bypass of `disabledPaths`/rate limits, a 2FA session-caching bypass (2FA is not enabled in this app, but the underlying session-cache code path is shared) |
| `mongoose` | 8.19.0 | 8.24.4 | high | `$nor` sanitize-filter bypass, `__proto__`-prefixed prototype pollution in update casting |
| `inngest` | 3.47.0 | 3.54.2 | high | Environment-variable exposure via the `serve()` handler on unhandled HTTP methods |
| `vitest` (dev-only) | 4.1.0 | 4.1.11 | moderate | Path traversal / arbitrary file read via `@vitest/mocker`'s redirect-mock handling |

Bumping these also transitively resolved the entire long tail of nested
vulnerabilities that were only reachable through them (OpenTelemetry's
gRPC/protobufjs stack and AWS SDK's `fast-xml-parser`/`tar` dependencies,
pulled in via `inngest`'s telemetry integration; `kysely`, pulled in via
`better-auth`; ESLint/build-tooling transitives like `brace-expansion`,
`minimatch`, `js-yaml`, `nanoid`, `picomatch`) — none of those needed a
direct fix of their own once their parent was current.

Two of these five (`better-auth`, `mongoose`) required small source
changes to keep `tsc --noEmit` clean, even though the version bump itself
was non-breaking per the package's own semver — the type-level surface
shifted in a way that needed reconciling:

- `lib/better-auth/auth.ts`: the cached `authInstance` was typed via
  `ReturnType<typeof betterAuth>` (the function's generic **default**
  type), while the actual call passed a specific options object whose
  inferred type stopped being assignable to that default in 1.7.x.
  Fixed by deriving the type from a small `initAuth()` wrapper instead
  (`ReturnType<typeof initAuth>`), so the declared type always matches
  exactly what's actually constructed — no behavior change, purely a type
  annotation fix.
- `lib/inngest/functions.ts`: three `step.run(...)` results (Mongoose
  `.lean()` output flowing through Inngest's own step-serialization
  typing) already used an explicit `as AlertRecord[]` /
  `as ActiveCandidateRecord[]` cast — a pre-existing, deliberate escape
  hatch for a shape TypeScript couldn't fully infer. The newer
  `inngest`/`mongoose` combination narrowed the inferred source type
  enough that a direct `as` cast was no longer considered to have
  sufficient overlap; changed to `as unknown as X[]`, exactly what the
  compiler itself suggests for this situation. No runtime change (a
  double cast is a no-op at execution time) — this reuses the exact same
  escape hatch the code already had, just spelled the way the stricter
  checker now requires.

## What remains (breaking fixes only — not applied)

| Package | Direct/transitive | Severity | Reachable in this app? | Fix requires |
| --- | --- | --- | --- | --- |
| `nodemailer` | direct | high | Low. See below. | Major bump 7.x → 10.x |
| `postcss` (bundled inside `next`'s own `node_modules/next/node_modules/postcss`) | transitive (via `next`) | moderate/high | Low — build-time only, not served to end users | `next` major bump 15.x → 16.x |

**`nodemailer`** — the published CVEs (SMTP command injection via
`envelope.size`, CRLF injection via a custom transport `name`
(EHLO/HELO), OAuth2 TLS certificate validation, IDN/punycode
allow-list/recipient-domain bypasses, `jsonTransport`/message-`raw`
bypasses of `disableFileAccess`/`disableUrlAccess`) all require either an
attacker-influenced transport configuration or attacker-influenced
recipient/envelope fields. This app's usage
(`lib/nodemailer/index.ts`, `lib/nodemailer/reset-password.ts`):

- Uses the built-in `service: 'gmail'` shorthand with no custom transport
  `name` — nothing attacker-controlled reaches EHLO/HELO.
- Never sets `envelope` explicitly.
- Never uses `jsonTransport` or the message-level `raw` option.
- The only variable field is `to: email` / a user's `name` (HTML-escaped
  before use) — and this is a **single-owner, `AUTHORIZED_EMAIL`-gated
  private terminal**, not a public multi-tenant service accepting
  arbitrary recipients from untrusted users.

Given that, and that the only available fix is a major version bump with
a materially different API (7.x → 10.x), this is left unpatched and
documented rather than force-upgraded, per this project's "don't force a
breaking dependency change just to zero out the audit count" principle.
Revisit if nodemailer's usage ever expands beyond this narrow,
owner-only pattern.

**`postcss` via `next`** — bundled inside Next.js's own dependency tree,
used only at **build time** (CSS processing during `next build`), never
executed against untrusted input at runtime in the deployed app. The
CVEs (XSS via unescaped `</style>`, source-map path traversal) apply to
processing attacker-supplied CSS/source maps, which this app never does
— it only builds its own, developer-authored Tailwind output. The fix
requires Next.js 16, a major version whose own advisory range extends
into `16.3.0-preview.*` (i.e. a channel that was still stabilizing at
the time of this audit) — upgrading a production Next.js app across a
major version is exactly the kind of "breaking change to zero out the
count" this audit was told not to do. Revisit once Next 16 has a settled
stable release and its own migration guide can be followed deliberately.

## A note on `npm audit fix` in this environment

Plain `npm audit fix` (and even a plain `npm install <pkg>@<version>` for
`vitest` specifically) crashed with an internal npm/Arborist bug
(`Cannot read properties of null (reading 'edgesOut')` inside
`@npmcli/arborist`'s peer-set resolution, triggered while resolving
`vitest@4.1.11`'s new `@vitest/browser-playwright` optional peer — a
component-browser-testing addon this project doesn't use). This is an
npm-internal defect, not a problem with this project's `package.json`.

Workaround used: `npm install vitest@4.1.11 --legacy-peer-deps` and
`npm audit fix --legacy-peer-deps` avoided the crash by using npm's older
peer-resolution algorithm. Since a `--legacy-peer-deps`-produced lockfile
is not guaranteed `npm ci`-clean, the lockfile was then **re-normalized**
with a plain `npm install` (no flag) once the problematic packages were
already warm in the local npm cache — which completed successfully in
strict mode on that second pass, producing a lockfile verified to pass
`npm ci` cleanly (see `.github/workflows/ci.yml`). If `npm audit fix`
crashes the same way in a future update, the same two-step workaround
(legacy-peer-deps install, then a plain re-install to normalize the
lockfile, then verify `npm ci`) should be retried before assuming the
project itself has a dependency conflict.

## Re-verification after these changes

```
npm ci             # clean, matches the committed lockfile
npm run typecheck  # clean
npm run lint       # 0 errors (12 pre-existing warnings, unrelated to this pass)
npm test           # 475 passed, 4 skipped at the time of this pass (493 as of the final production-hardening pass — later work added tests, none of it touched dependencies)
npm run build      # succeeds, including with zero market-data credentials
```
