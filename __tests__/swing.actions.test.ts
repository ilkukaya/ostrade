import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OhlcBar } from '@/lib/technical/types';
import type { HistoricalBar } from '@/lib/market-data/types';
import type { DataProvenance } from '@/lib/market-data/historicalDataRepository';

function makeBars(count: number, trendPerBar: number): OhlcBar[] {
    const bars: OhlcBar[] = [];
    for (let i = 0; i < count; i++) {
        const close = 100 + i * trendPerBar + Math.sin(i / 3) * 1.5;
        bars.push({
            time: `2024-${String(Math.floor(i / 28) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
            open: close,
            high: close * 1.01,
            low: close * 0.99,
            close,
            volume: 1_000_000,
        });
    }
    return bars;
}

const FIXTURE_BARS: Record<string, OhlcBar[]> = {
    AAPL: makeBars(60, 0.5),
    THYAO: makeBars(60, 0.4),
};

// The stock page's swing analysis is local-first (see
// historicalDataRepository.ts) — it never calls a market-data provider
// directly, only the repository.
const mockGetBarsOrFetch = vi.fn(async (instrument: { symbol: string }, options?: unknown): Promise<HistoricalBar[]> => {
    void options;
    return FIXTURE_BARS[instrument.symbol] ?? [];
});
const mockGetDataProvenance = vi.fn(async (instrument: { symbol: string }): Promise<DataProvenance> => {
    const bars = FIXTURE_BARS[instrument.symbol];
    if (!bars || bars.length === 0) return { latestDate: null, provider: null };
    return { latestDate: bars[bars.length - 1].time, provider: 'stooq' };
});
vi.mock('@/lib/market-data/historicalDataRepository', () => ({
    getBarsOrFetch: (...args: [{ symbol: string }, unknown?]) => mockGetBarsOrFetch(...args),
    getDataProvenance: (...args: [{ symbol: string }]) => mockGetDataProvenance(...args),
}));

import { getSwingAnalysis } from '@/lib/actions/swing.actions';

describe('getSwingAnalysis', () => {
    beforeEach(() => {
        mockGetBarsOrFetch.mockClear();
        mockGetDataProvenance.mockClear();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns an ok outcome with US market/currency dataProvenance for a US symbol', async () => {
        const outcome = await getSwingAnalysis('AAPL');
        expect(outcome.status).toBe('ok');
        if (outcome.status !== 'ok') return;

        expect(outcome.analysis.setupType).toBe('BREAKOUT');
        expect(outcome.dataProvenance).toEqual({
            latestDate: FIXTURE_BARS.AAPL[FIXTURE_BARS.AAPL.length - 1].time,
            provider: 'stooq',
            market: 'US',
            currency: 'USD',
        });
    });

    it('resolves BIST market/currency metadata for a known BIST symbol, case-insensitively', async () => {
        const outcome = await getSwingAnalysis('thyao');
        expect(outcome.status).toBe('ok');
        if (outcome.status !== 'ok') return;

        expect(outcome.dataProvenance.market).toBe('TR');
        expect(outcome.dataProvenance.currency).toBe('TRY');
    });

    it('returns unavailable with a clear reason, never a fabricated score, when no data can be found', async () => {
        const outcome = await getSwingAnalysis('ZZZZ');
        expect(outcome).toEqual({ status: 'unavailable', reason: 'No historical data available for this symbol.' });
        // Provenance is only meaningful once there's an actual analysis to
        // attach it to — never fetched for a symbol that produced nothing.
        expect(mockGetDataProvenance).not.toHaveBeenCalled();
    });

    it('requests only a capped recent-bars window — not the full stored history', async () => {
        await getSwingAnalysis('AAPL');
        expect(mockGetBarsOrFetch).toHaveBeenCalledWith(
            expect.objectContaining({ symbol: 'AAPL' }),
            expect.objectContaining({ limit: expect.any(Number) }),
        );
    });
});
