import { describe, expect, it } from 'vitest';
import {
    epochSecondsToMarketDate,
    isSessionLikelyComplete,
    isWeekend,
    latestExpectedCompletedSession,
    todayInTimezone,
} from '@/lib/market-data/marketCalendar';

// 2024-01-01 is a known Monday.
const MON = '2024-01-01';
const TUE = '2024-01-02';
const WED = '2024-01-03';
const THU = '2024-01-04';
const FRI = '2024-01-05';
const SAT = '2024-01-06';
const SUN = '2024-01-07';

describe('epochSecondsToMarketDate', () => {
    it('derives the correct market date per timezone, not a naive UTC date', () => {
        // 2024-01-03 23:30 UTC is still Jan 3 in UTC and New York (UTC-5 in
        // January), but already Jan 4 in Istanbul (UTC+3) — exactly the
        // failure mode this function exists to prevent.
        const epoch = Date.UTC(2024, 0, 3, 23, 30, 0) / 1000;
        expect(epochSecondsToMarketDate(epoch, 'UTC')).toBe('2024-01-03');
        expect(epochSecondsToMarketDate(epoch, 'America/New_York')).toBe('2024-01-03');
        expect(epochSecondsToMarketDate(epoch, 'Europe/Istanbul')).toBe('2024-01-04');
    });
});

describe('todayInTimezone', () => {
    it('can report different calendar dates for the same instant in different timezones', () => {
        const now = new Date(Date.UTC(2024, 0, 3, 23, 30, 0));
        expect(todayInTimezone('America/New_York', now)).toBe('2024-01-03');
        expect(todayInTimezone('Europe/Istanbul', now)).toBe('2024-01-04');
    });
});

describe('isWeekend', () => {
    it('correctly identifies Saturday and Sunday', () => {
        expect(isWeekend(SAT)).toBe(true);
        expect(isWeekend(SUN)).toBe(true);
    });
    it('correctly identifies weekdays as not weekend', () => {
        for (const day of [MON, TUE, WED, THU, FRI]) {
            expect(isWeekend(day)).toBe(false);
        }
    });
});

describe('isSessionLikelyComplete', () => {
    it('is always true for a weekend market date, regardless of now', () => {
        expect(isSessionLikelyComplete('US', SAT, new Date(Date.UTC(2024, 0, 6, 0, 0, 0)))).toBe(true);
    });

    it('is true once the US close time (4pm ET) has passed on the same day', () => {
        // Jan is EST (UTC-5): 21:30 UTC = 16:30 ET, after the 16:00 close.
        const afterClose = new Date(Date.UTC(2024, 0, 3, 21, 30, 0));
        expect(isSessionLikelyComplete('US', WED, afterClose)).toBe(true);
    });

    it('is false before the US close time on the same day', () => {
        // 20:30 UTC = 15:30 ET, before the 16:00 close.
        const beforeClose = new Date(Date.UTC(2024, 0, 3, 20, 30, 0));
        expect(isSessionLikelyComplete('US', WED, beforeClose)).toBe(false);
    });

    it('is true once the TR close time (6pm TRT, UTC+3 year-round) has passed on the same day', () => {
        const afterClose = new Date(Date.UTC(2024, 0, 3, 15, 30, 0)); // 18:30 TRT
        expect(isSessionLikelyComplete('TR', WED, afterClose)).toBe(true);
    });

    it('is false before the TR close time on the same day', () => {
        const beforeClose = new Date(Date.UTC(2024, 0, 3, 14, 30, 0)); // 17:30 TRT
        expect(isSessionLikelyComplete('TR', WED, beforeClose)).toBe(false);
    });

    it('is true for any date strictly before the current market date', () => {
        const now = new Date(Date.UTC(2024, 0, 4, 12, 0, 0));
        expect(isSessionLikelyComplete('US', WED, now)).toBe(true);
    });

    it('is false for a market date in the future', () => {
        const now = new Date(Date.UTC(2024, 0, 3, 12, 0, 0));
        expect(isSessionLikelyComplete('US', THU, now)).toBe(false);
    });
});

describe('latestExpectedCompletedSession', () => {
    it('skips back over the weekend to the prior Friday when checked Monday morning', () => {
        // Monday 10:00 UTC = 5:00 ET, well before the US close.
        const mondayMorning = new Date(Date.UTC(2024, 0, 8, 10, 0, 0));
        expect(latestExpectedCompletedSession('US', mondayMorning)).toBe(FRI);
    });

    it('returns today once its own close time has passed', () => {
        const wednesdayAfterClose = new Date(Date.UTC(2024, 0, 3, 21, 30, 0));
        expect(latestExpectedCompletedSession('US', wednesdayAfterClose)).toBe(WED);
    });

    it('returns the prior day when checked before today\'s close', () => {
        const wednesdayBeforeClose = new Date(Date.UTC(2024, 0, 3, 20, 30, 0));
        expect(latestExpectedCompletedSession('US', wednesdayBeforeClose)).toBe(TUE);
    });
});
