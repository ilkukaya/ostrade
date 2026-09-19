import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OhlcBar } from '@/lib/technical/types';

vi.mock('@/database/mongoose', () => ({
    connectToDatabase: vi.fn(async () => ({})),
}));

const mockCreate = vi.fn(async (doc: Record<string, unknown>) => ({ _id: 'candidate-1', ...doc }));
vi.mock('@/database/models/candidate.model', async () => {
    const actual = await vi.importActual<typeof import('@/database/models/candidate.model')>('@/database/models/candidate.model');
    return {
        ...actual,
        Candidate: { create: (...args: [Record<string, unknown>]) => mockCreate(...args) },
    };
});

let FIXTURE_BARS: Record<string, OhlcBar[]>;
const mockGetBarsOrFetch = vi.fn(async (instrument: { symbol: string }, options?: unknown): Promise<OhlcBar[]> => {
    void options;
    return FIXTURE_BARS[instrument.symbol] ?? [];
});
vi.mock('@/lib/market-data/historicalDataRepository', () => ({
    getBarsOrFetch: (...args: [{ symbol: string }, unknown?]) => mockGetBarsOrFetch(...args),
}));

import { buildAndSaveCandidateSnapshot } from '@/lib/actions/candidate.actions';

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

describe('buildAndSaveCandidateSnapshot (local-first)', () => {
    beforeEach(() => {
        FIXTURE_BARS = {};
        mockGetBarsOrFetch.mockClear();
        mockCreate.mockClear();
    });

    it('reads bars through the local-first repository, never a direct provider call', async () => {
        FIXTURE_BARS.AAA = makeBars(60, 0.5);

        const result = await buildAndSaveCandidateSnapshot('user-1', 'AAA');

        expect(result.success).toBe(true);
        expect(mockGetBarsOrFetch).toHaveBeenCalledWith(
            expect.objectContaining({ symbol: 'AAA' }),
            expect.objectContaining({ limit: expect.any(Number) }),
        );
        expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it('resolves BIST instrument metadata for a known BIST symbol', async () => {
        FIXTURE_BARS.THYAO = makeBars(60, 0.4);

        await buildAndSaveCandidateSnapshot('user-1', 'thyao');

        expect(mockGetBarsOrFetch).toHaveBeenCalledWith(
            expect.objectContaining({ symbol: 'THYAO', market: 'TR', currency: 'TRY' }),
            expect.anything(),
        );
    });

    it('returns a clear unavailable error, never a fabricated candidate, when no data exists', async () => {
        const result = await buildAndSaveCandidateSnapshot('user-1', 'ZZZZ');

        expect(result).toEqual({ success: false, error: 'No historical data available for this symbol.' });
        expect(mockCreate).not.toHaveBeenCalled();
    });
});
