import { describe, expect, it } from 'vitest';
import { createConcurrencyLimiter } from '@/lib/concurrencyLimiter';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('createConcurrencyLimiter', () => {
    it('never runs more tasks concurrently than the configured limit', async () => {
        const limit = createConcurrencyLimiter(3);
        let active = 0;
        let maxActive = 0;
        const pendingResolvers: Array<() => void> = [];

        const tasks = Array.from({ length: 10 }, (_, i) =>
            limit(
                () =>
                    new Promise<number>((resolve) => {
                        active++;
                        maxActive = Math.max(maxActive, active);
                        pendingResolvers.push(() => {
                            active--;
                            resolve(i);
                        });
                    }),
            ),
        );

        // Exactly `maxConcurrent` tasks should have started synchronously;
        // the rest are queued, not yet invoked.
        expect(active).toBe(3);
        expect(pendingResolvers).toHaveLength(3);

        while (pendingResolvers.length > 0) {
            pendingResolvers.shift()!();
            await tick();
        }

        const results = await Promise.all(tasks);
        expect(maxActive).toBeLessThanOrEqual(3);
        expect([...results].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    });

    it('propagates rejections without breaking the queue for later tasks', async () => {
        const limit = createConcurrencyLimiter(2);

        const failing = limit(() => Promise.reject(new Error('boom')));
        const succeeding = limit(() => Promise.resolve('ok'));

        await expect(failing).rejects.toThrow('boom');
        await expect(succeeding).resolves.toBe('ok');
    });

    it('rejects a non-positive concurrency limit', () => {
        expect(() => createConcurrencyLimiter(0)).toThrow();
        expect(() => createConcurrencyLimiter(-1)).toThrow();
    });
});
