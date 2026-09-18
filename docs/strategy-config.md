# Strategy Configuration

`lib/swing/config.ts` exports `SwingStrategyConfig` and a
`defaultSwingStrategyConfig`. These are **starting values from the
deployment brief, not a finalized trading strategy** — nothing about them
is validated against real trading results yet (that's what backtesting,
Milestone 8 in `PROGRESS.md`, is for).

```ts
export const defaultSwingStrategyConfig: SwingStrategyConfig = {
  minimumScore: 60,
  riskReward: { minimum: 2.0 },
  rsi: { min: 40, max: 70 },
  volume: { relativeVolumeMinimum: 1.2 },
  movingAverages: { short: 20, medium: 50, long: 200 },
  atrPeriod: 14,
  supportResistanceLookback: 3,
};
```

| Field | Meaning |
| --- | --- |
| `minimumScore` | Score (out of 100) below which a candidate is a "PASS" (not shown as a qualifying setup) |
| `riskReward.minimum` | Minimum acceptable reward-to-risk ratio to Target 1 |
| `rsi.min` / `rsi.max` | Acceptable RSI(14) range for a setup |
| `volume.relativeVolumeMinimum` | Minimum current-volume / 20-day-average ratio |
| `movingAverages.short/medium/long` | SMA periods used for trend classification |
| `atrPeriod` | ATR period, used both as its own reading and as the buffer/tolerance for support/resistance zone width |
| `supportResistanceLookback` | Bars on each side when detecting swing highs/lows |

## Changing it

Every function in `lib/swing/` takes `config` as an explicit parameter —
nothing reads these values from a global or an environment variable, so
there's no hidden state to lose track of. To use different values:

```ts
import { analyzeSwingSetup } from '@/lib/swing/analyze';
import { defaultSwingStrategyConfig } from '@/lib/swing/config';

const myConfig = {
  ...defaultSwingStrategyConfig,
  rsi: { min: 45, max: 65 },
  riskReward: { minimum: 2.5 },
};

const result = analyzeSwingSetup(symbol, bars, myConfig);
```

## Not yet built: stored, versioned strategies

The deployment brief's longer-term plan (`PROGRESS.md` Milestone 6+) is to
persist named strategy configurations in the database, with a version
identifier attached to every saved candidate/trade snapshot — so a later
config change never silently rewrites what a historical analysis meant.
None of that exists yet; today there is exactly one config object, used
directly. Don't add a database-backed strategy-versioning system
speculatively before candidates/trades themselves are being persisted —
there's nothing to version yet.
