import type { HistoricalBar } from './types';

export type BarValidationResult = { valid: true } | { valid: false; reason: string };

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Rejects a bar with a malformed date, a non-finite (NaN/Infinity) field,
 * negative volume, an inverted high/low, or an open/close outside the
 * [low, high] range — corrupt data must never reach the indicator engine
 * or the database (see docs/market-data.md's normalization/validation
 * policy). This checks one bar in isolation; duplicate-date rejection is a
 * sequence-level concern handled by `sanitizeBars` below and, ultimately,
 * by MarketBar's unique index at the storage layer.
 */
export function validateBar(bar: HistoricalBar): BarValidationResult {
    if (!DATE_PATTERN.test(bar.time)) {
        return { valid: false, reason: `Invalid date format: "${bar.time}"` };
    }

    const numericFields: Array<[string, number | undefined]> = [
        ['open', bar.open],
        ['high', bar.high],
        ['low', bar.low],
        ['close', bar.close],
        ['volume', bar.volume],
        ['adjustedClose', bar.adjustedClose],
    ];
    for (const [name, value] of numericFields) {
        if (value === undefined) continue; // adjustedClose is optional
        if (!Number.isFinite(value)) {
            return { valid: false, reason: `${name} is not a finite number (${value})` };
        }
    }

    if (bar.volume < 0) {
        return { valid: false, reason: `Negative volume (${bar.volume})` };
    }
    if (bar.high < bar.low) {
        return { valid: false, reason: `high (${bar.high}) < low (${bar.low})` };
    }
    if (bar.open < bar.low || bar.open > bar.high) {
        return { valid: false, reason: `open (${bar.open}) outside [low, high] = [${bar.low}, ${bar.high}]` };
    }
    if (bar.close < bar.low || bar.close > bar.high) {
        return { valid: false, reason: `close (${bar.close}) outside [low, high] = [${bar.low}, ${bar.high}]` };
    }

    return { valid: true };
}

/**
 * Keeps only valid bars (per `validateBar`), sorted chronologically, with
 * duplicate dates collapsed to the LAST occurrence in the input (the most
 * recently fetched value for that date, in case a single provider response
 * revised an earlier entry within the same batch). Invalid bars are
 * dropped silently here — a caller that needs to report *why* a specific
 * bar was rejected should call `validateBar` directly per bar first (see
 * lib/market-data/historicalDataRepository.ts::upsertBars).
 */
export function sanitizeBars(bars: HistoricalBar[]): HistoricalBar[] {
    const valid = bars.filter((b) => validateBar(b).valid);
    valid.sort((a, b) => a.time.localeCompare(b.time));

    const deduped: HistoricalBar[] = [];
    for (const bar of valid) {
        if (deduped.length > 0 && deduped[deduped.length - 1].time === bar.time) {
            deduped[deduped.length - 1] = bar;
            continue;
        }
        deduped.push(bar);
    }
    return deduped;
}
