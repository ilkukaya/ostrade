import { describe, expect, it } from 'vitest';
import { classifyDailyChange, type DailySnapshotComparable } from '@/lib/analysis/dailyChangeClassification';

function comparable(status: DailySnapshotComparable['status'], score: number): DailySnapshotComparable {
    return { status, score };
}

describe('classifyDailyChange', () => {
    describe('no prior snapshot (first-ever observation)', () => {
        it('classifies a PASS baseline as no material change — nothing to report yet', () => {
            expect(classifyDailyChange(null, comparable('PASS', 20))).toBe('NO_MATERIAL_CHANGE');
        });

        it('classifies an already-WATCH first observation as a new setup', () => {
            expect(classifyDailyChange(null, comparable('WATCH', 55))).toBe('NEW_SETUP');
        });

        it('classifies an already-QUALIFIED first observation as a new setup', () => {
            expect(classifyDailyChange(null, comparable('QUALIFIED', 90))).toBe('NEW_SETUP');
        });
    });

    describe('transitions out of PASS', () => {
        it('PASS -> WATCH is a new setup', () => {
            expect(classifyDailyChange(comparable('PASS', 10), comparable('WATCH', 50))).toBe('NEW_SETUP');
        });

        it('PASS -> QUALIFIED is a new setup', () => {
            expect(classifyDailyChange(comparable('PASS', 10), comparable('QUALIFIED', 92))).toBe('NEW_SETUP');
        });

        it('PASS -> PASS is no material change regardless of score movement', () => {
            expect(classifyDailyChange(comparable('PASS', 10), comparable('PASS', 40))).toBe('NO_MATERIAL_CHANGE');
        });
    });

    describe('transitions into PASS', () => {
        it('WATCH -> PASS is setup invalidated', () => {
            expect(classifyDailyChange(comparable('WATCH', 55), comparable('PASS', 20))).toBe('SETUP_INVALIDATED');
        });

        it('QUALIFIED -> PASS is setup invalidated', () => {
            expect(classifyDailyChange(comparable('QUALIFIED', 90), comparable('PASS', 15))).toBe('SETUP_INVALIDATED');
        });
    });

    describe('qualification transitions (both sides WATCH or QUALIFIED)', () => {
        it('WATCH -> QUALIFIED is newly qualified', () => {
            expect(classifyDailyChange(comparable('WATCH', 65), comparable('QUALIFIED', 88))).toBe('NEWLY_QUALIFIED');
        });

        it('QUALIFIED -> WATCH is lost qualification', () => {
            expect(classifyDailyChange(comparable('QUALIFIED', 88), comparable('WATCH', 65))).toBe('LOST_QUALIFICATION');
        });
    });

    describe('same status on both sides — score-driven classification', () => {
        it('WATCH -> WATCH with a large score gain is score improved', () => {
            expect(classifyDailyChange(comparable('WATCH', 50), comparable('WATCH', 62))).toBe('SCORE_IMPROVED');
        });

        it('WATCH -> WATCH with a large score drop is score deteriorated', () => {
            expect(classifyDailyChange(comparable('WATCH', 62), comparable('WATCH', 50))).toBe('SCORE_DETERIORATED');
        });

        it('QUALIFIED -> QUALIFIED with a large score gain is score improved', () => {
            expect(classifyDailyChange(comparable('QUALIFIED', 80), comparable('QUALIFIED', 95))).toBe('SCORE_IMPROVED');
        });

        it('QUALIFIED -> QUALIFIED with a large score drop is score deteriorated', () => {
            expect(classifyDailyChange(comparable('QUALIFIED', 95), comparable('QUALIFIED', 80))).toBe('SCORE_DETERIORATED');
        });

        it('a small score wiggle under the threshold is no material change', () => {
            expect(classifyDailyChange(comparable('QUALIFIED', 80), comparable('QUALIFIED', 82))).toBe('NO_MATERIAL_CHANGE');
        });

        it('an identical score is no material change', () => {
            expect(classifyDailyChange(comparable('WATCH', 60), comparable('WATCH', 60))).toBe('NO_MATERIAL_CHANGE');
        });

        it('respects a custom threshold', () => {
            expect(classifyDailyChange(comparable('WATCH', 60), comparable('WATCH', 63), 2)).toBe('SCORE_IMPROVED');
            expect(classifyDailyChange(comparable('WATCH', 60), comparable('WATCH', 61), 2)).toBe('NO_MATERIAL_CHANGE');
        });

        it('treats the threshold boundary itself as a real change (>=), not just past it', () => {
            expect(classifyDailyChange(comparable('WATCH', 60), comparable('WATCH', 65), 5)).toBe('SCORE_IMPROVED');
            expect(classifyDailyChange(comparable('WATCH', 65), comparable('WATCH', 60), 5)).toBe('SCORE_DETERIORATED');
        });
    });
});
