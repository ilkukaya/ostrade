import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/market-data/sync/resolveMarketSymbols', () => ({
    resolveMarketSymbols: vi.fn((market: string) => (market === 'EMPTY' ? [] : [{ symbol: 'AAA' }, { symbol: 'BBB' }, { symbol: 'CCC' }])),
}));

const mockGetCoverageForSymbols = vi.fn();
vi.mock('@/lib/market-data/historicalDataRepository', () => ({
    getCoverageForSymbols: (...args: [string[], string]) => mockGetCoverageForSymbols(...args),
}));

vi.mock('@/lib/market-data/marketCalendar', () => ({
    latestExpectedCompletedSession: vi.fn(() => '2024-01-05'),
}));

import { getMarketFreshness } from '@/lib/market-data/sync/freshness';

describe('getMarketFreshness', () => {
    beforeEach(() => {
        mockGetCoverageForSymbols.mockReset();
    });

    it('reports isCurrent: true only when every symbol is caught up to the expected session', async () => {
        mockGetCoverageForSymbols.mockResolvedValue([
            { symbol: 'AAA', latestDate: '2024-01-05', barCount: 100 },
            { symbol: 'BBB', latestDate: '2024-01-05', barCount: 100 },
            { symbol: 'CCC', latestDate: '2024-01-05', barCount: 100 },
        ]);
        const freshness = await getMarketFreshness('US');
        expect(freshness.isCurrent).toBe(true);
        expect(freshness.latestSessionDate).toBe('2024-01-05');
        expect(freshness.unsyncedSymbols).toEqual([]);
        expect(freshness.staleSymbols).toEqual([]);
    });

    it('reports isCurrent: false when even one symbol has never been synced', async () => {
        mockGetCoverageForSymbols.mockResolvedValue([
            { symbol: 'AAA', latestDate: '2024-01-05', barCount: 100 },
            { symbol: 'BBB', latestDate: '2024-01-05', barCount: 100 },
            { symbol: 'CCC', latestDate: null, barCount: 0 },
        ]);
        const freshness = await getMarketFreshness('US');
        expect(freshness.isCurrent).toBe(false);
        expect(freshness.unsyncedSymbols).toEqual(['CCC']);
    });

    it('reports isCurrent: false when a synced symbol is behind the expected session (stale)', async () => {
        mockGetCoverageForSymbols.mockResolvedValue([
            { symbol: 'AAA', latestDate: '2024-01-05', barCount: 100 },
            { symbol: 'BBB', latestDate: '2024-01-03', barCount: 98 }, // behind
            { symbol: 'CCC', latestDate: '2024-01-05', barCount: 100 },
        ]);
        const freshness = await getMarketFreshness('US');
        expect(freshness.isCurrent).toBe(false);
        expect(freshness.staleSymbols).toEqual(['BBB']);
        expect(freshness.syncedSymbols).toBe(3); // still counted as "synced", just stale
    });

    it('reports isCurrent: false (never true) for a market with zero resolved symbols', async () => {
        mockGetCoverageForSymbols.mockResolvedValue([]);
        const freshness = await getMarketFreshness('EMPTY');
        expect(freshness.totalSymbols).toBe(0);
        expect(freshness.isCurrent).toBe(false);
        expect(freshness.latestSessionDate).toBeNull();
    });
});
