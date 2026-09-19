/** Shared, dependency-free math helpers for statistics aggregation. */

/** Returns null for an empty input rather than NaN/0 — "no data" must never
 * be indistinguishable from "the value is zero". */
export function median(values: number[]): number | null {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function mean(values: number[]): number | null {
    if (values.length === 0) return null;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** A fraction (0..1), or null when there is no denominator to compute one
 * from — never reported as 0%, which would misleadingly imply data. */
export function rate(count: number, total: number): number | null {
    if (total === 0) return null;
    return count / total;
}
