# OSTRADE

Private Daily EOD Swing Trading Research Terminal.

OSTRADE is a single-owner research workspace for scanning BIST and US universes, reviewing deterministic swing setups, saving candidates, journaling real trades, backtesting the same rule engine used in production, and running risk/Monte Carlo analysis.

## Core workflow

1. Sync market data from **Market Data**
2. Generate **Daily Analysis**
3. Review **Daily Review / Weekly Review**
4. Run the **Scanner**
5. Save interesting setups as **Candidates**
6. Log only real executions in **Journal**
7. Validate ideas with **Backtest** and **Monte Carlo**

## Architecture

- Next.js 15 / React 19
- TypeScript
- Tailwind CSS v4
- Better Auth
- MongoDB Atlas
- Yahoo Finance EOD for BIST
- Stooq/Yahoo routing for supported US historical data
- Netlify deployment
- GitHub CI

See:
- [docs/architecture.md](docs/architecture.md)
- [docs/market-data.md](docs/market-data.md)
- [docs/bist.md](docs/bist.md)
- [docs/backtesting.md](docs/backtesting.md)
- [docs/deployment-netlify.md](docs/deployment-netlify.md)
- [PROGRESS.md](PROGRESS.md)

## Research principles

- End-of-day data, not intraday execution.
- Deterministic and explainable setup scoring.
- Candidates are research snapshots, not trades.
- Journal records actual user-entered trades only.
- Backtests avoid look-ahead by evaluating only bars available at each historical decision point.
- Historical index tests still carry survivorship-bias risk when today’s constituent list is applied backward.

## Private deployment

The current build is designed as an owner-only terminal. `AUTHORIZED_EMAIL` is enforced server-side. Public signup, multi-tenant privacy, billing, brokerage execution and regulated-advice workflows are out of scope.

## License and upstream attribution

This repository is a modified AGPL-3.0 codebase derived from the upstream Open Dev Society / OpenStock project. The original copyright and license notices remain applicable to the upstream portions of the code.

See [LICENSE](LICENSE) and the Git history for attribution details.

OSTRADE is the product identity of this private fork. The research interface intentionally does not present the upstream product branding.
