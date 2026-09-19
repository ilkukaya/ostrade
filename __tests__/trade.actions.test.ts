import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HistoricalBar } from '@/lib/market-data/types';

let FIXTURE_BARS: Record<string, HistoricalBar[]>;
const mockGetBarsOrFetch = vi.fn(
    async (instrument: { symbol: string }, options?: { from?: string; to?: string }): Promise<HistoricalBar[]> => {
        const bars = FIXTURE_BARS[instrument.symbol] ?? [];
        return bars.filter((b) => (!options?.from || b.time >= options.from) && (!options?.to || b.time <= options.to));
    },
);
vi.mock('@/lib/market-data/historicalDataRepository', () => ({
    getBarsOrFetch: (...args: [{ symbol: string }, { from?: string; to?: string }?]) => mockGetBarsOrFetch(...args),
}));

import { fetchBarsSinceEntry } from '@/lib/actions/trade.actions';

function bar(time: string): HistoricalBar {
    return { time, open: 100, high: 101, low: 99, close: 100, volume: 1000 };
}

describe('fetchBarsSinceEntry (local-first)', () => {
    beforeEach(() => {
        FIXTURE_BARS = {};
        mockGetBarsOrFetch.mockClear();
    });

    it('reads through the local-first repository with the entry/through date window, never a direct provider call', async () => {
        FIXTURE_BARS.AAA = [bar('2024-01-01'), bar('2024-01-02'), bar('2024-01-03')];

        const bars = await fetchBarsSinceEntry('AAA', new Date('2024-01-01T00:00:00.000Z'), new Date('2024-01-03T00:00:00.000Z'));

        expect(mockGetBarsOrFetch).toHaveBeenCalledWith(
            expect.objectContaining({ symbol: 'AAA' }),
            expect.objectContaining({ from: '2024-01-01', to: '2024-01-03' }),
        );
        expect(bars.map((b) => b.time)).toEqual(['2024-01-01', '2024-01-02', '2024-01-03']);
    });

    it('resolves BIST instrument metadata for a known BIST symbol', async () => {
        FIXTURE_BARS.THYAO = [bar('2024-01-01')];

        await fetchBarsSinceEntry('thyao', new Date('2024-01-01T00:00:00.000Z'), new Date('2024-01-02T00:00:00.000Z'));

        expect(mockGetBarsOrFetch).toHaveBeenCalledWith(
            expect.objectContaining({ symbol: 'THYAO', market: 'TR', currency: 'TRY' }),
            expect.anything(),
        );
    });

    it('returns an empty array rather than throwing when no data is available', async () => {
        const bars = await fetchBarsSinceEntry('ZZZZ', new Date('2024-01-01T00:00:00.000Z'), new Date('2024-01-02T00:00:00.000Z'));
        expect(bars).toEqual([]);
    });
});
