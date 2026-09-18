/**
 * Strategy configuration for the swing-analysis engine.
 *
 * These are starting values, not a finalized trading strategy — the whole
 * point of pulling them out into one object is that they can be edited (or,
 * later, stored per strategy version in the database — see
 * docs/swing-engine.md) without touching any rule logic. Nothing here
 * should be treated as investment advice.
 */
export interface SwingStrategyConfig {
    /** Score (out of 100) below which a candidate is not shown as a
     * qualifying setup at all. */
    minimumScore: number;

    riskReward: {
        /** Minimum acceptable reward-to-risk ratio to Target 1. */
        minimum: number;
    };

    rsi: {
        min: number;
        max: number;
    };

    volume: {
        /** Minimum current-volume / 20-day-average-volume ratio. */
        relativeVolumeMinimum: number;
    };

    movingAverages: {
        short: number;
        medium: number;
        long: number;
    };

    atrPeriod: number;

    /** Bars on each side used when detecting swing highs/lows for
     * support/resistance zones — see lib/technical/supportResistance.ts. */
    supportResistanceLookback: number;
}

export const defaultSwingStrategyConfig: SwingStrategyConfig = {
    minimumScore: 60,
    riskReward: {
        minimum: 2.0,
    },
    rsi: {
        min: 40,
        max: 70,
    },
    volume: {
        relativeVolumeMinimum: 1.2,
    },
    movingAverages: {
        short: 20,
        medium: 50,
        long: 200,
    },
    atrPeriod: 14,
    supportResistanceLookback: 3,
};
