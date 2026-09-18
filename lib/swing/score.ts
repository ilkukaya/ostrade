import type { SwingStrategyConfig } from './config';
import type { RuleResult, SwingStatus } from './types';

export function aggregateScore(rules: RuleResult[]): { score: number; maxScore: number } {
    return {
        score: rules.reduce((sum, r) => sum + r.score, 0),
        maxScore: rules.reduce((sum, r) => sum + r.maxScore, 0),
    };
}

/**
 * PASS below the configured minimum score — this is a "no trade candidate",
 * per the deployment brief's terminology, not a partial signal.
 *
 * At or above the minimum, the setup is a genuine candidate; whether it's
 * QUALIFIED (every rule passed — full confluence) or just WATCH (met the
 * score bar but at least one rule still failed) is derived from the rules
 * themselves rather than a second arbitrary score cutoff, so there's
 * nothing here to silently drift out of sync with what the rules actually
 * found.
 */
export function determineStatus(score: number, rules: RuleResult[], config: SwingStrategyConfig): SwingStatus {
    if (score < config.minimumScore) return 'PASS';
    return rules.every((r) => r.passed) ? 'QUALIFIED' : 'WATCH';
}
