/**
 * A tiny, deterministic PRNG (mulberry32) — NOT cryptographically secure,
 * and not meant to be; its only job is reproducibility. `Math.random()`
 * cannot be seeded, so a Monte Carlo run built on it could never be
 * reproduced for debugging or testing. Given the same seed, this always
 * produces the same sequence.
 */
export function createSeededRandom(seed: number): () => number {
    let state = seed | 0;
    return function random(): number {
        state = (state + 0x6d2b79f5) | 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
