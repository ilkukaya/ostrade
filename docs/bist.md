# BIST (Borsa İstanbul) Support

## Status

BIST historical daily bars, quotes, company names (partial), universes
(BIST 30/50/100), scanner/stock-detail/backtest/candidate-tracking, and
currency handling are implemented and covered by tests. See "Completion
criteria" below for exactly what that does and doesn't include — having a
`.IS` symbol mapping is not, by itself, "BIST support."

## Symbol mapping — never forced into business logic

OSTRADE's own business-layer symbol for a BIST stock is its plain ticker
(e.g. `THYAO`), exactly like every US symbol. The `.IS` suffix Yahoo
Finance needs, the exchange code, currency, and timezone are all resolved
in exactly one place:

- `lib/market-data/instruments/bist.ts`:
  - `isKnownBistSymbol(symbol)` — membership check against the union of
    the BIST 30/50/100 static symbol lists.
  - `buildBistInstrument(symbol)` → `{ symbol, providerSymbol: symbol +
    '.IS', exchange: 'XIST', market: 'TR', currency: 'TRY', timezone:
    'Europe/Istanbul' }`.
  - `getBistCompanyName(symbol)` — a small, manually-verified map of
    company names (see "Company names" below); returns `undefined`,
    never a guess, for anything not on the list.
- `lib/market-data/instruments/resolve.ts::resolveInstrument(symbol)` — the
  **single** symbol → full-`InstrumentId` translation point every other
  layer uses (the Yahoo provider self-translating its own requests,
  `service.ts`'s market-aware routing, the sync engine, the scanner,
  `swing.actions.ts`, the backtester, candidate outcome tracking, local
  search). No other file guesses `.IS` or hardcodes `'TR'`/`'TRY'`.

`InstrumentId.symbol` is always the plain ticker; `InstrumentId.providerSymbol`
carries the provider-specific notation. Nothing outside
`lib/market-data/providers/yahoo.ts` ever constructs a `.IS` string itself.

## Historical data provider: Yahoo Finance only

No free, reliable, published-API alternative to Yahoo's undocumented chart
endpoint was identified for BIST daily bars (see `docs/market-data.md` for
why scraping Borsa İstanbul's own bulletin was rejected outright, not just
deprioritized). The historical-bar chain for `market === 'TR'` is
therefore `[yahooProvider]` — no Stooq attempt at all, since Stooq has no
BIST coverage and trying it first would be pure wasted latency.

This is a real limitation, stated plainly: Yahoo's endpoint is
unofficial, undocumented, and has no uptime guarantee. If it ever breaks
or changes shape, BIST data acquisition breaks with it until a real
replacement is found — the fallback-on-total-failure behavior
(`docs/market-data.md`) is "use whatever is already stored locally and
mark it stale," never "fabricate a bar."

## Currency

BIST instruments are always `TRY` unless an instrument's own metadata says
otherwise (it never does today — every known BIST symbol resolves to
`TRY`). This flows through everywhere currency-aware code already existed
before BIST support: `lib/risk/positionSizing.ts`, every R-multiple
calculation (`lib/trades/`, `lib/statistics/`, `lib/backtest/`) is already
currency-agnostic (R-multiples are dimensionless ratios), and Portfolio/
Journal/Statistics all continue to **never sum TRY and USD together** —
this was already true before BIST existed (multi-currency was designed in
from Milestone 10) and BIST is simply the first real user of it.

## BIST universes — static, versioned, explicitly labeled

`lib/market-data/universes/bist30.ts` / `bist50.ts` / `bist100.ts`:

- `BIST_30_SYMBOLS` (30 symbols).
- `BIST_50_ADDITIONAL_SYMBOLS` (20 symbols on top of BIST 30 — BIST 50 is
  the union).
- `BIST_100_ADDITIONAL_SYMBOLS` (46 symbols on top of BIST 50 — BIST 100
  is the union).

Every list is a **best-effort static snapshot**, dated (`asOf: '2025-01'`
in `lib/market-data/universe.ts`), and marked `partial: true` — the exact
same honesty convention already used for the Nasdaq-100/S&P-500 curated
subsets (`docs/market-data.md`). These are **never scraped or re-fetched
live**; updating them for real index-membership changes is a manual,
periodic review, same as the US lists.

## Company names — a small, honest list, not a complete database

`BIST_NAMES` in `instruments/bist.ts` currently covers ~36 well-known BIST
constituents with manually-verified names (Türk Hava Yolları, Aselsan,
Garanti BBVA, and so on). A symbol not on this list is displayed and
searched **by its raw ticker**, never a guessed or fabricated name — this
is a deliberate, stated limitation, not an oversight. Extending this list
is safe, low-risk, incremental work (add a verified name, nothing else
changes) whenever it's worth doing.

The same limitation applies symmetrically to Finnhub: Finnhub has **no
BIST coverage at all**, so `getCompanyProfile`/`getQuote`/`getFinancials`/
`getNews` for a BIST symbol route to Yahoo (company name) or report
`unavailable` (financials/news — Yahoo doesn't implement those either) —
see `docs/market-data.md`'s provider-chain table.

## Validation symbol set (suggested, not automated)

For manual spot-checking after a sync or a Yahoo-endpoint change, a
reasonable small sample across sectors: `THYAO`, `ASELS`, `GARAN`,
`TUPRS`, `EREGL`, `AKBNK`, `KCHOL`, `ISCTR`. This is a suggestion for a
human doing a sanity check, not something the codebase enforces or runs
automatically.

## What flows through the rest of the app unchanged

Every feature migrated to local-first data (`docs/daily-data-engine.md`)
already works for BIST the same way it works for US, because none of them
know what "BIST" means — they only know `InstrumentId`:

- **Scanner**: `bist-30`/`bist-50`/`bist-100` are ordinary entries in
  `listUniverseOptions()`; `resolveInstrument()` inside `analyzeSymbol`
  resolves the right market/currency automatically.
- **Stock detail / swing analysis**: identical code path, reading through
  `historicalDataRepository.ts`.
- **Backtest**: identical code path; a BIST backtest's
  `datasetProvenance.providers` will show `['yahoo']` only, honestly
  reflecting the single-provider chain above.
- **Candidate outcome tracking**: identical code path.
- **Local search**: BIST symbols and their verified names are part of the
  same local instrument index as the US universes (`lib/market-data/localSearch.ts`).

## Completion criteria

BIST support is considered complete for the scope of this engine when all
of the following hold — checked here rather than asserted without
evidence:

- [x] BIST symbols resolve to correct `InstrumentId` metadata
  (`symbol`/`providerSymbol`/`exchange`/`market`/`currency`/`timezone`).
- [x] Historical daily bars fetch, validate, and store correctly for BIST
  symbols via Yahoo.
- [x] BIST 30/50/100 exist as static, dated, `partial`-labeled universes.
- [x] The sync engine, `/data` freshness dashboard, and provider
  diagnostics all work for `market: 'TR'`.
- [x] Scanner, stock detail, backtest, and candidate outcome tracking all
  produce correct, currency-aware (`TRY`) results for BIST symbols,
  reading through the same local-first repository as US symbols.
- [x] Quote/company-profile requests for BIST symbols route to Yahoo, not
  Finnhub (which has zero BIST coverage) — verified by
  `__tests__/market-data/service-routing.test.ts`.
- [x] Local search finds BIST symbols by ticker and by verified company
  name.
- [x] Currency is never silently assumed `USD` for a BIST instrument
  anywhere in Portfolio/Journal/Statistics.
- [ ] Complete, verified company names for every BIST 100 constituent —
  intentionally not done; see "Company names" above.
- [ ] A second, independent historical-data source for BIST (redundancy
  against Yahoo's endpoint changing) — not started; no free alternative
  has been identified yet (see `docs/market-data.md`).
- [ ] Corporate-action / symbol-rename handling specific to BIST beyond
  what `docs/daily-data-engine.md`'s general policy already covers — not
  started.
