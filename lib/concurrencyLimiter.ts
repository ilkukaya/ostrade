/**
 * A minimal concurrency limiter (no dependency needed for something this
 * small): `createConcurrencyLimiter(5)` returns a `limit` function — wrap
 * any async call in it and at most 5 wrapped calls run at once, the rest
 * queue up and start as earlier ones finish. Used by the scanner so it
 * never fires an unbounded burst of requests at Finnhub/Stooq — see
 * docs/scanner.md.
 */
export function createConcurrencyLimiter(maxConcurrent: number) {
    if (maxConcurrent <= 0) throw new Error('maxConcurrent must be a positive integer');

    let active = 0;
    const queue: Array<() => void> = [];

    function scheduleNext() {
        if (active >= maxConcurrent || queue.length === 0) return;
        active++;
        const run = queue.shift()!;
        run();
    }

    return function limit<T>(fn: () => Promise<T>): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            queue.push(() => {
                fn()
                    .then(resolve, reject)
                    .finally(() => {
                        active--;
                        scheduleNext();
                    });
            });
            scheduleNext();
        });
    };
}
