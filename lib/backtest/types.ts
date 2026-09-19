import type { SetupType } from '@/lib/swing/types';
import type { BacktestGroupStats, BacktestSummary } from './aggregate';

/** Execution/scope assumptions for one backtest run — distinct from
 * SwingStrategyConfig (which governs signal generation itself). Persisted
 * verbatim alongside the strategy config on every BacktestRun so a run's
 * results are always reproducible/auditable later (see docs/backtesting.md). */
export interface BacktestExecutionConfig {
    universeId: string;
    /** ISO date (YYYY-MM-DD), inclusive — bounds when a SIGNAL may fire.
     * A trade entered from a signal near this boundary is still tracked to
     * its real resolution even if that falls after `endDate` — the window
     * bounds signal generation, not how long a trade is allowed to run. */
    startDate: string;
    endDate: string;
    /** Extra filter on top of requiring SwingStatus === 'QUALIFIED' (the
     * strategy's own definition of a complete, all-rules-passed setup).
     * Default 0 = no additional filtering. */
    minScore: number;
    maxHoldingDays: number;
    /** Round-trip commission drag, in basis points of the entry price,
     * applied once as a flat deduction from the R-multiple regardless of
     * win/loss (see lib/backtest/simulate.ts). */
    feeBps: number;
    /** Execution slippage, in basis points, applied to the entry fill and
     * to a stop-exit fill (never to a target fill, modeled as a limit
     * order filling at its set price) — see docs/backtesting.md. */
    slippageBps: number;
    /** Optional out-of-sample boundary (ISO date). When set, trades with
     * entryDate before this are "train" and on/after it are "holdout" —
     * comparing the two summaries is how a strategy's edge is checked for
     * curve-fitting rather than trusting the full-history number alone
     * (see lib/backtest/aggregate.ts::splitTrainHoldout, docs/backtesting.md). */
    holdoutStartDate?: string;
}

export const DEFAULT_BACKTEST_EXECUTION: Omit<BacktestExecutionConfig, 'universeId' | 'startDate' | 'endDate'> = {
    minScore: 0,
    maxHoldingDays: 60,
    feeBps: 5,
    slippageBps: 10,
};

export type BacktestTradeOutcome = 'TARGET_1_HIT' | 'TARGET_2_HIT' | 'STOP_HIT' | 'EXPIRED' | 'AMBIGUOUS' | 'STILL_OPEN';

/** One simulated trade — every implemented setup is long-only (see
 * docs/candidates.md), so all price relationships assume that. */
export interface BacktestTrade {
    symbol: string;
    setupType?: SetupType;
    /** The score/maxScore/riskReward the signal carried at the moment it
     * fired — for the year/setup/score-bucket breakdowns
     * (lib/backtest/aggregate.ts), never recomputed after the fact. */
    score: number;
    maxScore: number;
    riskReward?: number;

    signalDate: string;
    entryDate: string;
    /** Slippage-adjusted fill, not the raw next-bar open — see
     * docs/backtesting.md for why slippage applies here and not to target
     * fills. */
    entryPrice: number;
    stopLevel: number;
    targets: number[];

    exitDate?: string;
    exitPrice?: number;
    outcome: BacktestTradeOutcome;

    /** null only for STILL_OPEN (no exit exists yet) and AMBIGUOUS (no
     * defined fill — see evaluateCandidateOutcome) — never fabricated. */
    grossRMultiple: number | null;
    /** grossRMultiple minus the round-trip fee drag. */
    netRMultiple: number | null;

    maxFavorableExcursion: number;
    maxAdverseExcursion: number;
}

export interface BacktestSymbolResult {
    symbol: string;
    trades: BacktestTrade[];
    barsUsed: number;
}

export interface BacktestSkippedSymbol {
    symbol: string;
    reason: string;
}

/**
 * Stamped once when a run starts and updated as symbols are processed —
 * answers "what data was this backtest actually run against?" so a run is
 * never silently re-interpreted later as if it used data that has since
 * changed (see docs/backtesting.md, docs/daily-data-engine.md's dataset
 * provenance requirement). `strategyFingerprint` (on BacktestRunDocument)
 * already covers the "strategy version" half of that question — this
 * covers the data half.
 */
export interface BacktestDatasetProvenance {
    /** When this run was launched — the run's own fixed point in time,
     * never updated afterward. Two runs with identical config still get
     * distinct values here, so they're never confused with each other even
     * if the underlying data changed between them. */
    generatedAt: string;
    /** The latest stored-bar date observed across every symbol actually
     * read during this run, or null before any symbol has been processed
     * yet. */
    latestBarDate: string | null;
    /** Distinct market-data providers observed across the symbols this run
     * read — e.g. a US universe backtest naming both `stooq` and `yahoo`
     * makes a mixed-source dataset visible instead of implying one source. */
    providers: string[];
}

export type BacktestRunStatus = 'running' | 'completed' | 'failed';

export interface BacktestProgress {
    runId: string;
    status: BacktestRunStatus;
    universeId: string;
    totalSymbols: number;
    scannedSymbols: number;
    trades: BacktestTrade[];
    skipped: BacktestSkippedSymbol[];
    startedAt: string;
    updatedAt: string;
    completedAt?: string;
    executionConfig: BacktestExecutionConfig;
    /** Populated only once status === 'completed'. */
    summary?: BacktestSummary;
    byYear?: BacktestGroupStats[];
    bySetup?: BacktestGroupStats[];
    byScoreBucket?: BacktestGroupStats[];
    /** Populated only once completed AND executionConfig.holdoutStartDate
     * was set. */
    trainSummary?: BacktestSummary;
    holdoutSummary?: BacktestSummary;
    datasetProvenance: BacktestDatasetProvenance;
}

export interface BacktestRunListItem {
    runId: string;
    universeId: string;
    status: BacktestRunStatus;
    startedAt: string;
    completedAt?: string;
    executionConfig: BacktestExecutionConfig;
    summary?: BacktestSummary;
    datasetProvenance: BacktestDatasetProvenance;
}
