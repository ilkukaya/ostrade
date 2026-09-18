# Swing Analysis Engine

## Core principle

This is not "a machine that tells you what stock will go up." It's a
machine that systematically finds situations matching explicit rules,
quantifies the risk, and shows its work — every score is a sum of visible,
named rule results, never a black box. Nothing in this engine is AI: same
bars in, same result out, every time (see `__tests__/swing/analyze.test.ts`
for a determinism test). AI has no role in indicators, scoring, rules,
risk/reward, or position sizing anywhere in this codebase, and shouldn't
going forward either — see the deployment brief's own "do not overuse AI"
section.

## Two layers

```
lib/technical/    pure math over OHLCV bars — SMA, EMA, RSI, MACD,
                  Stochastic, Bollinger Bands, ATR, relative volume,
                  momentum, rolling volatility, trend classification,
                  support/resistance zone clustering. No knowledge of
                  "setups" or "scores" — just indicators. No dependency on
                  lib/market-data or the database, so it's testable with
                  plain fixtures and reusable by the (future) scanner and
                  backtester without dragging in a network call.

lib/swing/        the rule engine built on top:
  config.ts         SwingStrategyConfig — every threshold in one place.
                    See docs/strategy-config.md.
  indicatorSnapshot.ts
                    Computes every indicator ONCE per (symbol, bars) pair
                    into an IndicatorSnapshot, so individual rules never
                    redundantly recompute the same series (see the
                    deployment brief's performance guidance: fetch →
                    normalize → calculate → cache → render).
  setups/           One file per setup type. Each exports an
                    `evaluate<Name>Setup(snapshot, config)` returning
                    `{ rules: RuleResult[], tradePlan }`.
  score.ts          Sums rule scores into a 0-100 total and derives status.
  analyze.ts        The single entry point: `analyzeSwingSetup(symbol,
                    bars, config?)` → `SwingAnalysisResult | null`.
```

## Status semantics

- **PASS** — score below `config.minimumScore`. Not a candidate; per the
  deployment brief's terminology this is "no trade candidate", not a
  partial signal.
- **WATCH** — met the minimum score, but at least one rule still failed.
- **QUALIFIED** — met the minimum score AND every rule passed.

QUALIFIED is defined by "every rule passed", not a second score cutoff —
so it can never silently drift out of sync with what the rules actually
found. See `lib/swing/score.ts`.

## Setups implemented

| Setup | Status | File |
| --- | --- | --- |
| BREAKOUT | ✅ implemented | `lib/swing/setups/breakout.ts` |
| PULLBACK | ⬜ not started | — |
| TREND_CONTINUATION | ⬜ not started | — |
| SUPPORT_REVERSAL | ⬜ not started | — |
| MOMENTUM | ⬜ not started | — |
| BOLLINGER_SQUEEZE | ⬜ not started | — |

### Breakout

Models: price has already cleared a resistance zone, which — once broken —
becomes the new support/invalidation reference (a standard technical
"role reversal"). That's why the trade plan's entry/stop come from
`snapshot.support[0]` (the nearest zone AT/BELOW price — i.e. the level
just broken) while targets come from `snapshot.resistance` (zones still
ABOVE price, by construction of `findSupportResistanceZones`).

Rules (100 points total): Trend (20), Breakout Structure — is price still
near the broken level, not extended too far beyond it (20), Relative
Volume (15), RSI (15), MACD (15), Risk/Reward (15).

Every trade-plan level has a documented origin:
- Entry zone / stop → the broken support zone, ATR-buffered
- Target 1 / Target 2 → the next real resistance zone(s) above price, or,
  when no further resistance is visible, an explicit 2R/3R risk-multiple
  fallback (never presented as equivalent to a structural level — a
  warning is attached whenever the fallback is used)

## Adding a new setup type

1. Add the type to `SetupType` in `lib/swing/types.ts` if it isn't already
   listed there.
2. Create `lib/swing/setups/<name>.ts` exporting
   `evaluate<Name>Setup(snapshot: IndicatorSnapshot, config:
   SwingStrategyConfig): { rules: RuleResult[]; tradePlan: TradePlan }`
   (see `breakout.ts` for the shape — every rule needs an `explanation`
   string that would make sense to someone who has never seen the code).
3. Wire it into `analyzeSwingSetup` in `lib/swing/analyze.ts` (today it
   always evaluates BREAKOUT; a real setup-selection or multi-setup
   evaluation strategy is part of the scanner work in `PROGRESS.md`).
4. Add hand-computed test fixtures the same way `__tests__/swing/
   breakout.test.ts` does: build an `IndicatorSnapshot` directly with
   specific field values rather than trying to reverse-engineer real bar
   data to hit exact conditions.

## What this deliberately does not do

- No look-ahead: `analyzeSwingSetup` only ever sees the bars it's given.
  Nothing in `lib/technical` or `lib/swing` reaches out to "future" data.
  This matters most once backtesting exists (see `PROGRESS.md`).
- No partial-credit scoring (yet): every rule is binary pass/fail with a
  fixed point value, not a graduated score based on "how close" a
  condition was. This is simpler and fully transparent; a future
  refinement could make in-range values score proportionally, but that's
  an explicit design change to make deliberately, not an accident of the
  current implementation.
