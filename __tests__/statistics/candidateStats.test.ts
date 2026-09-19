import { describe, expect, it } from 'vitest';
import {
    computeOverallCandidateStats,
    computeRealizedR,
    computeScoreBucketStats,
    type CandidateForStats,
} from '@/lib/statistics/candidateStats';
import type { CandidateStatus } from '@/database/models/candidate.model';

function candidate(overrides: Partial<CandidateForStats> = {}): CandidateForStats {
    return {
        score: 70,
        status: 'ACTIVE' as CandidateStatus,
        price: 100,
        stopLevel: 95,
        targets: [110, 120],
        riskReward: 2,
        ...overrides,
    };
}

describe('computeRealizedR', () => {
    it('is always exactly -1 for a stop hit (by construction: long-only, price > stop)', () => {
        expect(computeRealizedR(candidate({ status: 'STOP_HIT' }))).toBe(-1);
    });

    it('computes R for a Target 1 hit', () => {
        // riskPerShare = 100-95 = 5; (110-100)/5 = 2
        expect(computeRealizedR(candidate({ status: 'TARGET_1_HIT' }))).toBe(2);
    });

    it('computes R for a Target 2 hit', () => {
        // (120-100)/5 = 4
        expect(computeRealizedR(candidate({ status: 'TARGET_2_HIT' }))).toBe(4);
    });

    it('returns null for EXPIRED — there was no exit to compute a return from', () => {
        expect(computeRealizedR(candidate({ status: 'EXPIRED' }))).toBeNull();
    });

    it('returns null for AMBIGUOUS — which of stop/target hit first is unknown', () => {
        expect(computeRealizedR(candidate({ status: 'AMBIGUOUS' }))).toBeNull();
    });

    it('returns null when there is no recorded stop', () => {
        expect(computeRealizedR(candidate({ status: 'TARGET_1_HIT', stopLevel: undefined }))).toBeNull();
    });

    it('returns null when the stop equals the price (undefined risk unit)', () => {
        expect(computeRealizedR(candidate({ status: 'TARGET_1_HIT', stopLevel: 100 }))).toBeNull();
    });

    it('returns null for a still-ACTIVE or CANCELLED candidate', () => {
        expect(computeRealizedR(candidate({ status: 'ACTIVE' }))).toBeNull();
        expect(computeRealizedR(candidate({ status: 'CANCELLED' }))).toBeNull();
    });
});

describe('computeScoreBucketStats', () => {
    const candidates: CandidateForStats[] = [
        // 60-64 bucket: one target hit, one stop hit -> n=2
        candidate({ score: 61, status: 'TARGET_1_HIT', riskReward: 1.5 }),
        candidate({ score: 63, status: 'STOP_HIT', riskReward: 2.5 }),
        // Also in 60-64 range but must be excluded from n (not resolved)
        candidate({ score: 62, status: 'ACTIVE' }),
        candidate({ score: 64, status: 'CANCELLED' }),
        // 90+ bucket: both targets hit
        candidate({ score: 95, status: 'TARGET_2_HIT', riskReward: 3 }),
    ];

    it('excludes ACTIVE and CANCELLED candidates from n and every rate', () => {
        const buckets = computeScoreBucketStats(candidates);
        const bucket60 = buckets.find((b) => b.label === '60-64')!;
        expect(bucket60.n).toBe(2);
    });

    it('computes hit/stop rates and median realized R for a populated bucket', () => {
        const buckets = computeScoreBucketStats(candidates);
        const bucket60 = buckets.find((b) => b.label === '60-64')!;
        expect(bucket60.target1PlusRate).toBe(0.5);
        expect(bucket60.stopRate).toBe(0.5);
        // realized Rs: TARGET_1_HIT -> 2, STOP_HIT -> -1; median of [-1, 2] = 0.5
        expect(bucket60.medianRealizedR).toBe(0.5);
        expect(bucket60.avgPlannedRiskReward).toBeCloseTo(2.0); // mean(1.5, 2.5)
    });

    it('reports n=0 with null rates/medians for an empty bucket rather than 0 or NaN', () => {
        const buckets = computeScoreBucketStats(candidates);
        const bucket70 = buckets.find((b) => b.label === '70-74')!;
        expect(bucket70.n).toBe(0);
        expect(bucket70.target1PlusRate).toBeNull();
        expect(bucket70.medianRealizedR).toBeNull();
        expect(bucket70.avgPlannedRiskReward).toBeNull();
    });

    it('places a 90-scored candidate in the open-ended top bucket', () => {
        const buckets = computeScoreBucketStats(candidates);
        const bucket90 = buckets.find((b) => b.label === '90+')!;
        expect(bucket90.n).toBe(1);
        expect(bucket90.target2Rate).toBe(1);
    });

    it('supports custom bucket definitions', () => {
        const buckets = computeScoreBucketStats(candidates, [{ label: 'all', min: 0, max: Infinity }]);
        expect(buckets).toHaveLength(1);
        expect(buckets[0].n).toBe(3); // the 3 resolved candidates across all scores
    });
});

describe('computeOverallCandidateStats', () => {
    it('separates active/cancelled from the resolved population used for rates', () => {
        const candidates: CandidateForStats[] = [
            candidate({ status: 'ACTIVE' }),
            candidate({ status: 'ACTIVE' }),
            candidate({ status: 'CANCELLED' }),
            candidate({ status: 'TARGET_1_HIT' }),
            candidate({ status: 'STOP_HIT' }),
            candidate({ status: 'STOP_HIT' }),
        ];
        const stats = computeOverallCandidateStats(candidates);
        expect(stats.totalSaved).toBe(6);
        expect(stats.activeCount).toBe(2);
        expect(stats.cancelledCount).toBe(1);
        expect(stats.resolvedCount).toBe(3);
        expect(stats.targetHitRate).toBeCloseTo(1 / 3);
        expect(stats.stopHitRate).toBeCloseTo(2 / 3);
    });

    it('returns null rates when nothing has resolved yet', () => {
        const stats = computeOverallCandidateStats([candidate({ status: 'ACTIVE' })]);
        expect(stats.resolvedCount).toBe(0);
        expect(stats.targetHitRate).toBeNull();
        expect(stats.medianRealizedR).toBeNull();
    });
});
