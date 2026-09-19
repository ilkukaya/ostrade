import { describe, expect, it } from 'vitest';
import { evaluateCandidateOutcome } from '@/lib/candidates/outcome';
import type { OhlcBar } from '@/lib/technical/types';

function bar(time: string, high: number, low: number): OhlcBar {
    return { time, open: (high + low) / 2, high, low, close: (high + low) / 2, volume: 1_000_000 };
}

const STOP = 90;
const TARGET_1 = 110;
const TARGET_2 = 120;

describe('evaluateCandidateOutcome', () => {
    it('reports ACTIVE when there is no trade plan to evaluate against', () => {
        expect(evaluateCandidateOutcome({ barsAfterSignal: [] })).toEqual({ status: 'ACTIVE' });
        expect(evaluateCandidateOutcome({ stopLevel: STOP, barsAfterSignal: [] })).toEqual({ status: 'ACTIVE' });
    });

    it('reports ACTIVE while nothing has resolved yet and the holding window has not elapsed', () => {
        const bars = [bar('2026-01-02', 105, 100), bar('2026-01-03', 106, 101)];
        const outcome = evaluateCandidateOutcome({ stopLevel: STOP, targets: [TARGET_1, TARGET_2], barsAfterSignal: bars, maxHoldingDays: 60 });
        expect(outcome).toEqual({ status: 'ACTIVE' });
    });

    it('detects a clean stop hit with no target ever touched', () => {
        const bars = [bar('2026-01-02', 105, 100), bar('2026-01-03', 95, 88)];
        const outcome = evaluateCandidateOutcome({ stopLevel: STOP, targets: [TARGET_1, TARGET_2], barsAfterSignal: bars });
        expect(outcome).toEqual({ status: 'STOP_HIT', stopHitAt: '2026-01-03', closedAt: '2026-01-03' });
    });

    it('detects a clean Target 1 hit with no stop ever touched', () => {
        const bars = [bar('2026-01-02', 105, 100), bar('2026-01-03', 112, 103)];
        const outcome = evaluateCandidateOutcome({ stopLevel: STOP, targets: [TARGET_1, TARGET_2], barsAfterSignal: bars });
        expect(outcome).toEqual({ status: 'TARGET_1_HIT', firstTargetHitAt: '2026-01-03' });
    });

    it('detects Target 1 then later Target 2, recording both dates', () => {
        const bars = [bar('2026-01-02', 112, 103), bar('2026-01-05', 122, 115)];
        const outcome = evaluateCandidateOutcome({ stopLevel: STOP, targets: [TARGET_1, TARGET_2], barsAfterSignal: bars });
        expect(outcome).toEqual({
            status: 'TARGET_2_HIT',
            firstTargetHitAt: '2026-01-02',
            secondTargetHitAt: '2026-01-05',
            closedAt: '2026-01-05',
        });
    });

    it('detects Target 1 and Target 2 on the same bar (unambiguous — same direction)', () => {
        const bars = [bar('2026-01-02', 125, 103)];
        const outcome = evaluateCandidateOutcome({ stopLevel: STOP, targets: [TARGET_1, TARGET_2], barsAfterSignal: bars });
        expect(outcome).toEqual({
            status: 'TARGET_2_HIT',
            firstTargetHitAt: '2026-01-02',
            secondTargetHitAt: '2026-01-02',
            closedAt: '2026-01-02',
        });
    });

    it('marks a same-bar stop-and-target touch as AMBIGUOUS, never resolved in the favorable direction', () => {
        const bars = [bar('2026-01-02', 112, 88)]; // this bar's range spans both stop and target1
        const outcome = evaluateCandidateOutcome({ stopLevel: STOP, targets: [TARGET_1, TARGET_2], barsAfterSignal: bars });
        expect(outcome.status).toBe('AMBIGUOUS');
        expect(outcome.closedAt).toBe('2026-01-02');
        expect(outcome.outcomeNotes).toContain('cannot reveal which happened first');
        // Must not claim either a target or a stop was definitively hit.
        expect(outcome.firstTargetHitAt).toBeUndefined();
        expect(outcome.stopHitAt).toBeUndefined();
    });

    it('does not re-check the original stop after Target 1 has already been hit', () => {
        // Target 1 hit on day 1; price later falls back through the original
        // stop level. Per the documented assumption, this still counts as
        // TARGET_1_HIT — the system does not model a trailing stop.
        const bars = [bar('2026-01-02', 112, 103), bar('2026-01-05', 105, 85)];
        const outcome = evaluateCandidateOutcome({ stopLevel: STOP, targets: [TARGET_1, TARGET_2], barsAfterSignal: bars });
        expect(outcome).toEqual({ status: 'TARGET_1_HIT', firstTargetHitAt: '2026-01-02' });
    });

    it('detects a gap that jumps straight through Target 1 with no intermediate approach', () => {
        const bars = [bar('2026-01-02', 102, 99), bar('2026-01-03', 130, 118)]; // gap up, opens/trades well above target1
        const outcome = evaluateCandidateOutcome({ stopLevel: STOP, targets: [TARGET_1, TARGET_2], barsAfterSignal: bars });
        expect(outcome.status).toBe('TARGET_2_HIT'); // the gap cleared both targets in one bar
        expect(outcome.firstTargetHitAt).toBe('2026-01-03');
    });

    it('detects a gap down that jumps straight through the stop', () => {
        const bars = [bar('2026-01-02', 102, 99), bar('2026-01-03', 89, 80)]; // gap down, never even approaches target
        const outcome = evaluateCandidateOutcome({ stopLevel: STOP, targets: [TARGET_1, TARGET_2], barsAfterSignal: bars });
        expect(outcome).toEqual({ status: 'STOP_HIT', stopHitAt: '2026-01-03', closedAt: '2026-01-03' });
    });

    it('marks a long-unresolved candidate as EXPIRED once the holding window elapses', () => {
        const bars = Array.from({ length: 60 }, (_, i) => bar(`2026-01-${String(i + 1).padStart(2, '0')}`, 105, 95));
        const outcome = evaluateCandidateOutcome({ stopLevel: STOP, targets: [TARGET_1, TARGET_2], barsAfterSignal: bars, maxHoldingDays: 60 });
        expect(outcome.status).toBe('EXPIRED');
        expect(outcome.closedAt).toBe(bars[bars.length - 1].time);
    });

    it('does not expire a candidate that already resolved, even past the holding window', () => {
        const bars = [
            bar('2026-01-02', 112, 103), // Target 1 hit on day 1
            ...Array.from({ length: 70 }, (_, i) => bar(`2026-02-${String((i % 28) + 1).padStart(2, '0')}`, 105, 95)),
        ];
        const outcome = evaluateCandidateOutcome({ stopLevel: STOP, targets: [TARGET_1, TARGET_2], barsAfterSignal: bars, maxHoldingDays: 60 });
        expect(outcome.status).toBe('TARGET_1_HIT');
    });

    it('works with a single target (no Target 2 configured)', () => {
        const bars = [bar('2026-01-02', 112, 103)];
        const outcome = evaluateCandidateOutcome({ stopLevel: STOP, targets: [TARGET_1], barsAfterSignal: bars });
        expect(outcome).toEqual({ status: 'TARGET_1_HIT', firstTargetHitAt: '2026-01-02' });
    });
});
