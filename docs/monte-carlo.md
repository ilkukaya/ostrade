# Monte Carlo

**Status: not implemented yet.** Design sketch for `PROGRESS.md`
Milestone 9. Depends on `docs/backtesting.md` existing first — this
resamples from a *real* historical trade/R-multiple distribution, it does
not forecast prices.

## What it's for (and not for)

Take the R-multiple outcome of every historical trade (or backtested
signal — see `docs/backtesting.md`) and simulate many possible orderings
of that same set of outcomes, to answer: "given how this strategy has
actually performed, what does the range of possible equity curves look
like, and how bad could a losing streak realistically get?"

This is explicitly **not** used to predict where a stock's price is
going. If a price-scenario simulation (geometric Brownian motion /
bootstrap) is ever added as a separate, clearly-labeled educational
feature, it must be presented as a "Scenario Distribution" with visible
methodology — never as a "Prediction". See the deployment brief's own
section on this distinction.

## Inputs

- A set of historical R-multiples (one per closed trade or backtested
  signal) — from `docs/backtesting.md`'s output, once it exists.
- Starting capital, risk-per-trade %, and a run count (the deployment
  brief's example: 100,000 runs).

## Outputs

- Ending-equity distribution: P5 / P25 / median / P75 / P95
- Max-drawdown distribution: median, P95, and probability of exceeding
  10%/20%/30% drawdown thresholds
- Losing-streak distribution: median and worst-5%
- Risk of ruin

## Implementation approach (once the inputs exist)

A simple bootstrap resampling (draw with replacement from the historical
R-multiple set, N times, simulate the resulting equity curve, repeat for
the configured number of runs) is enough to start — no need for anything
more sophisticated than that for a first version. Keep the simulation
itself in `lib/` as pure, seedable functions (accept an explicit random
source rather than calling `Math.random()` directly) so a specific run can
be reproduced for debugging and testing, the same way every other
calculation in this codebase is deterministic given its inputs.

## Explicitly out of scope until real trade data exists

Do not build this against a fabricated or synthetic trade distribution
"just to see the charts work" — the entire value of this feature is that
it reflects the strategy's actual, evidenced performance. A Monte Carlo
simulation over made-up numbers is worse than not having the feature at
all, because it looks credible while being meaningless.
