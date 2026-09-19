/**
 * Lightweight market-timezone/session awareness — deliberately NOT a full
 * market-holiday calendar (see docs/daily-data-engine.md's documented
 * limitation: a missing bar on a real holiday is not itself an error, just
 * a gap the owner can interpret). What this module DOES guarantee: a daily
 * bar's date is always derived in the exchange's own timezone, never
 * shifted a day by naive UTC conversion (see docs/market-data.md, "Market
 * session awareness").
 */

export type MarketId = 'US' | 'TR';

const MARKET_TIMEZONES: Record<MarketId, string> = {
    US: 'America/New_York',
    TR: 'Europe/Istanbul',
};

/** Approximate regular-session close time, in the exchange's own local
 * time. Used only to decide whether "today" should be treated as complete
 * yet — not for anything that needs minute-level precision. */
const MARKET_CLOSE_TIME: Record<MarketId, { hour: number; minute: number }> = {
    US: { hour: 16, minute: 0 }, // NYSE/Nasdaq regular session, 4:00pm ET
    TR: { hour: 18, minute: 0 }, // Borsa Istanbul equity session, ~6:00pm TRT
};

export function getMarketTimezone(market: MarketId): string {
    return MARKET_TIMEZONES[market];
}

/** Converts a Unix epoch (seconds) into the calendar date (YYYY-MM-DD) it
 * falls on IN THE GIVEN TIMEZONE — the one piece of logic standing between
 * "a bar's real trading session" and "the wrong date because someone did
 * `new Date(...).toISOString().slice(0,10)`, which is always UTC". */
export function epochSecondsToMarketDate(epochSeconds: number, timezone: string): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
        new Date(epochSeconds * 1000),
    );
}

/** "Today", as a YYYY-MM-DD string, in the given timezone. */
export function todayInTimezone(timezone: string, now: Date = new Date()): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** Saturday/Sunday check for a YYYY-MM-DD string — anchored at UTC noon so
 * the weekday read is stable regardless of timezone (a calendar date's
 * day-of-week doesn't depend on timezone; only the exact epoch instant
 * does). Does not know about market holidays — see the module doc comment. */
export function isWeekend(dateStr: string): boolean {
    const day = new Date(`${dateStr}T12:00:00Z`).getUTCDay();
    return day === 0 || day === 6;
}

/**
 * Whether `market`'s regular session for `marketDate` should have already
 * completed by `now`. Weekends are treated as trivially "complete" (there
 * was no session to wait for) — a genuine market holiday is NOT detected
 * here and will be treated the same as an ordinary trading day, meaning it
 * can be misreported as "not yet complete" until its close time passes,
 * then simply have no bar. Downstream data-gap detection is what surfaces
 * that gap to the owner, not this function.
 */
export function isSessionLikelyComplete(market: MarketId, marketDate: string, now: Date = new Date()): boolean {
    if (isWeekend(marketDate)) return true;

    const timezone = getMarketTimezone(market);
    const nowMarketDate = todayInTimezone(timezone, now);
    if (marketDate < nowMarketDate) return true;
    if (marketDate > nowMarketDate) return false;

    const close = MARKET_CLOSE_TIME[market];
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(
        now,
    );
    const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
    const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
    return hour > close.hour || (hour === close.hour && minute >= close.minute);
}

/** The most recent date that `market`'s session should already be complete
 * for, as of `now` — i.e. what "the latest completed session" means right
 * now. Walks backward from today at most 10 days (comfortably past any
 * holiday weekend) looking for a non-weekend day whose close time has
 * passed; a real multi-day holiday run longer than that is not modeled. */
export function latestExpectedCompletedSession(market: MarketId, now: Date = new Date()): string {
    const timezone = getMarketTimezone(market);
    const today = todayInTimezone(timezone, now);

    for (let back = 0; back < 10; back++) {
        const candidate = shiftMarketDate(today, -back);
        if (isWeekend(candidate)) continue;
        if (isSessionLikelyComplete(market, candidate, now)) return candidate;
    }
    return shiftMarketDate(today, -1);
}

function shiftMarketDate(dateStr: string, days: number): string {
    const d = new Date(`${dateStr}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}
