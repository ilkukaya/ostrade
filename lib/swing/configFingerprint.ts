import crypto from 'crypto';
import type { SwingStrategyConfig } from './config';

/** A short, stable identity for a strategy config — used both by the
 * scanner (to key its result cache) and the backtest engine (to tag a run
 * with exactly which config produced it, so a later config edit never
 * silently changes what a past result means). */
export function fingerprintStrategyConfig(config: SwingStrategyConfig): string {
    return crypto.createHash('sha256').update(JSON.stringify(config)).digest('hex').slice(0, 16);
}
