import { describe, expect, it } from 'vitest';
import { aggregateScore, determineStatus } from '@/lib/swing/score';
import { defaultSwingStrategyConfig } from '@/lib/swing/config';
import type { RuleResult } from '@/lib/swing/types';

function rule(passed: boolean, score: number, maxScore: number): RuleResult {
    return { id: 'x', name: 'X', passed, score, maxScore, explanation: '' };
}

describe('aggregateScore', () => {
    it('sums scores and max scores across all rules', () => {
        const rules = [rule(true, 20, 20), rule(false, 0, 15), rule(true, 15, 15)];
        expect(aggregateScore(rules)).toEqual({ score: 35, maxScore: 50 });
    });

    it('handles an empty rule set', () => {
        expect(aggregateScore([])).toEqual({ score: 0, maxScore: 0 });
    });
});

describe('determineStatus', () => {
    const config = { ...defaultSwingStrategyConfig, minimumScore: 60 };

    it('is PASS below the minimum score, regardless of individual rules', () => {
        const rules = [rule(true, 59, 100)];
        expect(determineStatus(59, rules, config)).toBe('PASS');
    });

    it('is QUALIFIED at/above the minimum score when every rule passed', () => {
        const rules = [rule(true, 60, 60), rule(true, 40, 40)];
        expect(determineStatus(100, rules, config)).toBe('QUALIFIED');
    });

    it('is WATCH at/above the minimum score when at least one rule failed', () => {
        const rules = [rule(true, 60, 60), rule(false, 0, 40)];
        expect(determineStatus(60, rules, config)).toBe('WATCH');
    });

    it('treats the minimum score as inclusive', () => {
        const rules = [rule(true, 60, 60)];
        expect(determineStatus(60, rules, config)).toBe('QUALIFIED');
        expect(determineStatus(59.99, rules, config)).toBe('PASS');
    });
});
