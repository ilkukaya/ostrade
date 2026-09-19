import { describe, expect, it, vi, beforeEach } from 'vitest';
import { simulateSymbolBacktest } from '@/lib/backtest/simulate';
import { analyzeSwingSetupDetailed } from '@/lib/swing/analyze';
import { defaultSwingStrategyConfig } from '@/lib/swing/config';
import type { BacktestExecutionConfig } from '@/lib/backtest/types';
import type { SwingAnalysis } from '@/lib/swing/analyze';
import type { OhlcBar } from '@/lib/technical/types';

vi.mock('@/lib/swing/analyze', () => ({
    analyzeSwingSetupDetailed: vi.fn(),
}));

function isoDate(dayIndex: number): string {
    const d = new Date('2024-01-01T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + dayIndex);
    return d.toISOString().slice(0, 10);
}

function bar(dayIndex: number, open: number, high: number, low: number, close = (high + low) / 2): OhlcBar {
    return { time: isoDate(dayIndex), open, high, low, close, volume: 1_000_000 };
}

function flatBars(count: number, price = 100): OhlcBar[] {
    return Array.from({ length: count }, (_, i) => bar(i, price, price + 1, price - 1, price));
}

function makeSignal(overrides: Partial<SwingAnalysis['result']> = {}): SwingAnalysis {
    return {
        snapshot: {} as SwingAnalysis['snapshot'],
        result: {
            symbol: 'TEST',
            timestamp: new Date().toISOString(),
            score: 0,
            maxScore: 100,
            status: 'PASS',
            rules: [],
            ...overrides,
        },
    };
}

const PASS_SIGNAL = makeSignal();

function execConfig(overrides: Partial<BacktestExecutionConfig> = {}): BacktestExecutionConfig {
    return {
        universeId: 'dow-30',
        startDate: '2024-01-01',
        endDate: '2025-12-31',
        minScore: 0,
        maxHoldingDays: 60,
        feeBps: 0,
        slippageBps: 0,
        ...overrides,
    };
}

/** Configures the mock to fire a QUALIFIED signal exactly when the bars
 * slice's last bar matches `signalDayIndex`, and PASS otherwise — giving
 * full deterministic control over when "a setup was found" without needing
 * to reverse-engineer real qualifying indicator values. */
function mockSignalOnDay(signalDayIndex: number, signal: Partial<SwingAnalysis['result']>) {
    vi.mocked(analyzeSwingSetupDetailed).mockImplementation((_symbol, barsSoFar) => {
        const lastBar = barsSoFar[barsSoFar.length - 1];
        if (lastBar && lastBar.time === isoDate(signalDayIndex)) {
            return makeSignal(signal);
        }
        return PASS_SIGNAL;
    });
}

beforeEach(() => {
    vi.mocked(analyzeSwingSetupDetailed).mockReset();
});

describe('simulateSymbolBacktest', () => {
    it('enters at the next bar\'s open and applies slippage to the fill', () => {
        const bars = [
            bar(0, 100, 101, 99), // signal day
            bar(1, 100, 101, 99), // entry bar: open = 100
            bar(2, 125, 125, 115), // target day: high=125 clears target1=120
        ];
        mockSignalOnDay(0, { score: 80, maxScore: 100, setupType: 'BREAKOUT', status: 'QUALIFIED', stopLevel: 90, targets: [120, 130], riskReward: 2 });

        const { trades } = simulateSymbolBacktest('TEST', bars, defaultSwingStrategyConfig, execConfig({ slippageBps: 100 }));

        expect(trades).toHaveLength(1);
        const [trade] = trades;
        expect(trade.signalDate).toBe(isoDate(0));
        expect(trade.entryDate).toBe(isoDate(1));
        expect(trade.entryPrice).toBeCloseTo(101); // 100 * 1.01
        expect(trade.outcome).toBe('TARGET_1_HIT');
        expect(trade.exitPrice).toBe(120); // limit fill, exact, no slippage
        // riskPerShare = 101-90 = 11; grossR = (120-101)/11
        expect(trade.grossRMultiple).toBeCloseTo((120 - 101) / 11);
        expect(trade.netRMultiple).toBeCloseTo(trade.grossRMultiple!); // feeBps defaults to 0 here
    });

    it('applies a stop fill worse than the raw stop level by slippage', () => {
        const bars = [bar(0, 100, 101, 99), bar(1, 100, 101, 99), bar(2, 92, 93, 80)]; // day2 low=80 hits stop=90
        mockSignalOnDay(0, { score: 80, maxScore: 100, status: 'QUALIFIED', stopLevel: 90, targets: [120] });

        const { trades } = simulateSymbolBacktest('TEST', bars, defaultSwingStrategyConfig, execConfig({ slippageBps: 100 }));

        expect(trades[0].outcome).toBe('STOP_HIT');
        expect(trades[0].exitPrice).toBeCloseTo(90 * 0.99); // worse than the stop level itself
    });

    it('deducts a round-trip fee drag from net R-multiple without touching gross R-multiple', () => {
        const bars = [bar(0, 100, 101, 99), bar(1, 100, 101, 99), bar(2, 125, 125, 115)];
        mockSignalOnDay(0, { score: 80, maxScore: 100, status: 'QUALIFIED', stopLevel: 90, targets: [120] });

        const { trades } = simulateSymbolBacktest('TEST', bars, defaultSwingStrategyConfig, execConfig({ feeBps: 50, slippageBps: 0 }));

        const trade = trades[0];
        // riskPerShare = 100-90 = 10; grossR = (120-100)/10 = 2
        expect(trade.grossRMultiple).toBeCloseTo(2);
        // feeDragInR = (2 * 0.005 * 100) / 10 = 0.1
        expect(trade.netRMultiple).toBeCloseTo(2 - 0.1);
    });

    it('never lets analyzeSwingSetupDetailed see a bar beyond the day being evaluated (no look-ahead)', () => {
        const bars = flatBars(20);
        vi.mocked(analyzeSwingSetupDetailed).mockReturnValue(PASS_SIGNAL);

        simulateSymbolBacktest('TEST', bars, defaultSwingStrategyConfig, execConfig());

        const calls = vi.mocked(analyzeSwingSetupDetailed).mock.calls;
        expect(calls.length).toBeGreaterThan(0);
        for (const [, barsSoFar] of calls) {
            const lastTime = (barsSoFar as OhlcBar[])[barsSoFar.length - 1].time;
            const k = bars.findIndex((b) => b.time === lastTime);
            expect(barsSoFar).toEqual(bars.slice(0, k + 1));
        }
    });

    it('does not open a second trade for the same symbol until the first has resolved', () => {
        const bars = [
            bar(0, 100, 101, 99), // signal day 1
            bar(1, 100, 101, 99), // entry
            bar(2, 100, 101, 99), // would-be signal day 2 (must be ignored while trade 1 is open)
            bar(3, 100, 101, 99),
            bar(4, 125, 125, 115), // resolves trade 1 via target
            bar(5, 100, 101, 99), // signal day 2, now that trade 1 has resolved
            bar(6, 100, 101, 99), // entry 2
            bar(7, 130, 130, 120), // resolves trade 2
        ];
        vi.mocked(analyzeSwingSetupDetailed).mockImplementation((_symbol, barsSoFar) => {
            const lastTime = barsSoFar[barsSoFar.length - 1].time;
            if (lastTime === isoDate(0) || lastTime === isoDate(5)) {
                return makeSignal({ score: 80, maxScore: 100, status: 'QUALIFIED', stopLevel: 90, targets: [120] });
            }
            return PASS_SIGNAL;
        });

        const { trades } = simulateSymbolBacktest('TEST', bars, defaultSwingStrategyConfig, execConfig());

        expect(trades).toHaveLength(2);
        expect(trades[0].signalDate).toBe(isoDate(0));
        expect(trades[1].signalDate).toBe(isoDate(5));

        // The "day 2" signal condition (isoDate(2)) must never even have been queried while trade 1 was open.
        const queriedLastTimes = vi.mocked(analyzeSwingSetupDetailed).mock.calls.map((c) => c[1][c[1].length - 1].time);
        expect(queriedLastTimes).not.toContain(isoDate(2));
    });

    it('marks a trade STILL_OPEN when the data runs out before resolution or the holding window elapsing', () => {
        const bars = [bar(0, 100, 101, 99), bar(1, 100, 101, 99), bar(2, 100, 105, 95)]; // never reaches stop(90) or target(120)
        mockSignalOnDay(0, { score: 80, maxScore: 100, status: 'QUALIFIED', stopLevel: 90, targets: [120] });

        const { trades } = simulateSymbolBacktest('TEST', bars, defaultSwingStrategyConfig, execConfig({ maxHoldingDays: 60 }));

        expect(trades).toHaveLength(1);
        expect(trades[0].outcome).toBe('STILL_OPEN');
        expect(trades[0].grossRMultiple).toBeNull();
        expect(trades[0].netRMultiple).toBeNull();
        expect(trades[0].exitPrice).toBeUndefined();
    });

    it('marks EXPIRED at the maxHoldingDays boundary, not at the last bar of all remaining history', () => {
        // entry (day1) counts as holding-day 1, so with maxHoldingDays=5 the
        // window is [day1..day5] — day6+ must never even be consulted for
        // this decision, however much more history actually exists.
        const holdingBars = Array.from({ length: 5 }, (_, k) => bar(2 + k, 100, 105, 95, 100 + k));
        const bars = [bar(0, 100, 101, 99), bar(1, 100, 101, 99), ...holdingBars];
        mockSignalOnDay(0, { score: 80, maxScore: 100, status: 'QUALIFIED', stopLevel: 90, targets: [120] });

        const { trades } = simulateSymbolBacktest('TEST', bars, defaultSwingStrategyConfig, execConfig({ maxHoldingDays: 5 }));

        expect(trades[0].outcome).toBe('EXPIRED');
        expect(trades[0].exitDate).toBe(holdingBars[3].time); // day5 — the 5th holding day (day1..day5)
        expect(trades[0].exitPrice).toBe(holdingBars[3].close);
        expect(trades[0].grossRMultiple).not.toBeNull();
    });

    it('marks AMBIGUOUS with no defined exit price when one bar touches both stop and target', () => {
        const bars = [bar(0, 100, 101, 99), bar(1, 100, 101, 99), bar(2, 105, 125, 80)]; // range spans both 90 and 120
        mockSignalOnDay(0, { score: 80, maxScore: 100, status: 'QUALIFIED', stopLevel: 90, targets: [120] });

        const { trades } = simulateSymbolBacktest('TEST', bars, defaultSwingStrategyConfig, execConfig());

        expect(trades[0].outcome).toBe('AMBIGUOUS');
        expect(trades[0].exitPrice).toBeUndefined();
        expect(trades[0].grossRMultiple).toBeNull();
        expect(trades[0].netRMultiple).toBeNull();
    });

    it('does not enter a trade when the signal fires on the last available bar', () => {
        const bars = flatBars(3);
        mockSignalOnDay(2, { score: 80, maxScore: 100, status: 'QUALIFIED', stopLevel: 90, targets: [120] });

        const { trades } = simulateSymbolBacktest('TEST', bars, defaultSwingStrategyConfig, execConfig());

        expect(trades).toHaveLength(0);
    });

    it('filters out a QUALIFIED signal scoring below minScore', () => {
        const bars = [bar(0, 100, 101, 99), bar(1, 100, 101, 99), bar(2, 125, 125, 115)];
        mockSignalOnDay(0, { score: 65, maxScore: 100, status: 'QUALIFIED', stopLevel: 90, targets: [120] });

        const { trades } = simulateSymbolBacktest('TEST', bars, defaultSwingStrategyConfig, execConfig({ minScore: 70 }));

        expect(trades).toHaveLength(0);
    });

    it('ignores a signal before startDate or after endDate', () => {
        const bars = [bar(0, 100, 101, 99), bar(1, 100, 101, 99), bar(2, 125, 125, 115)];
        mockSignalOnDay(0, { score: 80, maxScore: 100, status: 'QUALIFIED', stopLevel: 90, targets: [120] });

        const before = simulateSymbolBacktest('TEST', bars, defaultSwingStrategyConfig, execConfig({ startDate: isoDate(1) }));
        expect(before.trades).toHaveLength(0);

        const after = simulateSymbolBacktest('TEST', bars, defaultSwingStrategyConfig, execConfig({ endDate: isoDate(-1) }));
        expect(after.trades).toHaveLength(0);
    });

    it('reports WATCH/PASS-status days as non-signals even at a high score', () => {
        const bars = [bar(0, 100, 101, 99), bar(1, 100, 101, 99), bar(2, 125, 125, 115)];
        mockSignalOnDay(0, { score: 90, maxScore: 100, status: 'WATCH', stopLevel: 90, targets: [120] });

        const { trades } = simulateSymbolBacktest('TEST', bars, defaultSwingStrategyConfig, execConfig());

        expect(trades).toHaveLength(0);
    });
});
