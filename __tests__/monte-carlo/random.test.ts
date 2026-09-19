import { describe, expect, it } from 'vitest';
import { createSeededRandom } from '@/lib/monte-carlo/random';

describe('createSeededRandom', () => {
    it('produces an identical sequence for the same seed', () => {
        const a = createSeededRandom(42);
        const b = createSeededRandom(42);
        const seqA = Array.from({ length: 20 }, () => a());
        const seqB = Array.from({ length: 20 }, () => b());
        expect(seqA).toEqual(seqB);
    });

    it('produces a different sequence for a different seed', () => {
        const a = createSeededRandom(1);
        const b = createSeededRandom(2);
        const seqA = Array.from({ length: 20 }, () => a());
        const seqB = Array.from({ length: 20 }, () => b());
        expect(seqA).not.toEqual(seqB);
    });

    it('always returns a value in [0, 1)', () => {
        const random = createSeededRandom(7);
        for (let i = 0; i < 1000; i++) {
            const value = random();
            expect(value).toBeGreaterThanOrEqual(0);
            expect(value).toBeLessThan(1);
        }
    });
});
