import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OhlcBar } from '@/lib/technical/types';

vi.mock('@/database/mongoose', () => ({
    connectToDatabase: vi.fn(async () => ({})),
}));

const mockFindByIdAndUpdate = vi.fn(async (id: unknown, update: { $set: Record<string, unknown> }) => {
    void id;
    void update;
    return {};
});
vi.mock('@/database/models/candidate.model', () => ({
    Candidate: { findByIdAndUpdate: (...args: [unknown, { $set: Record<string, unknown> }]) => mockFindByIdAndUpdate(...args) },
}));

let FIXTURE_BARS: Record<string, OhlcBar[]>;

// Candidate outcome tracking is local-first (see historicalDataRepository.ts)
// — it never calls a market-data provider directly, only the repository.
const mockGetBarsOrFetch = vi.fn(async (instrument: { symbol: string }, options?: { from?: string }): Promise<OhlcBar[]> => {
    const bars = FIXTURE_BARS[instrument.symbol] ?? [];
    if (!options?.from) return bars;
    return bars.filter((b) => b.time >= options.from!);
});
vi.mock('@/lib/market-data/historicalDataRepository', () => ({
    getBarsOrFetch: (...args: [{ symbol: string }, { from?: string }?]) => mockGetBarsOrFetch(...args),
}));

import { updateActiveCandidateOutcomes } from '@/lib/candidates/updateOutcomes';

function bar(time: string, high: number, low: number): OhlcBar {
    const mid = (high + low) / 2;
    return { time, open: mid, high, low, close: mid, volume: 1_000_000 };
}

describe('updateActiveCandidateOutcomes', () => {
    beforeEach(() => {
        FIXTURE_BARS = {};
        mockGetBarsOrFetch.mockClear();
        mockFindByIdAndUpdate.mockClear();
    });

    it('resolves a candidate whose target was hit after the signal, writing the outcome + excursion', async () => {
        FIXTURE_BARS.AAA = [
            bar('2024-01-01', 101, 99), // signal day itself — must be excluded from evaluation
            bar('2024-01-02', 103, 100),
            bar('2024-01-03', 112, 108), // clears target1 (110)
        ];

        const result = await updateActiveCandidateOutcomes([
            { _id: 'c1', symbol: 'AAA', signalAt: '2024-01-01T00:00:00.000Z', price: 100, stopLevel: 95, targets: [110, 120] },
        ]);

        expect(result).toEqual({ updated: 1, failed: 0 });
        expect(mockFindByIdAndUpdate).toHaveBeenCalledTimes(1);
        const [id, update] = mockFindByIdAndUpdate.mock.calls[0];
        expect(id).toBe('c1');
        expect(update.$set.status).toBe('TARGET_1_HIT');
        expect(update.$set.maxFavorableExcursion).toBeGreaterThan(0);
    });

    it('leaves a still-ACTIVE candidate untouched — no DB write for it', async () => {
        FIXTURE_BARS.AAA = [bar('2024-01-01', 101, 99), bar('2024-01-02', 103, 100)];

        const result = await updateActiveCandidateOutcomes([
            { _id: 'c1', symbol: 'AAA', signalAt: '2024-01-01T00:00:00.000Z', price: 100, stopLevel: 95, targets: [110, 120] },
        ]);

        expect(result).toEqual({ updated: 0, failed: 0 });
        expect(mockFindByIdAndUpdate).not.toHaveBeenCalled();
    });

    it('queries the repository from the signal date onward, not the full unrelated history', async () => {
        FIXTURE_BARS.AAA = [bar('2024-01-01', 101, 99)];
        await updateActiveCandidateOutcomes([
            { _id: 'c1', symbol: 'AAA', signalAt: '2024-01-01T00:00:00.000Z', price: 100, stopLevel: 95, targets: [110] },
        ]);
        expect(mockGetBarsOrFetch).toHaveBeenCalledWith(expect.objectContaining({ symbol: 'AAA' }), expect.objectContaining({ from: '2024-01-01' }));
    });

    it('resolves BIST market/currency metadata for a known BIST symbol', async () => {
        FIXTURE_BARS.THYAO = [bar('2024-01-01', 101, 99), bar('2024-01-02', 90, 85)]; // hits the stop (95)
        await updateActiveCandidateOutcomes([
            { _id: 'c1', symbol: 'THYAO', signalAt: '2024-01-01T00:00:00.000Z', price: 100, stopLevel: 95, targets: [110] },
        ]);
        expect(mockGetBarsOrFetch).toHaveBeenCalledWith(expect.objectContaining({ symbol: 'THYAO', market: 'TR', currency: 'TRY' }), expect.anything());
    });

    it('counts a per-candidate failure without aborting the rest of the batch', async () => {
        mockGetBarsOrFetch.mockRejectedValueOnce(new Error('boom'));
        FIXTURE_BARS.BBB = [bar('2024-01-01', 101, 99), bar('2024-01-03', 112, 108)];

        const result = await updateActiveCandidateOutcomes([
            { _id: 'c1', symbol: 'AAA', signalAt: '2024-01-01T00:00:00.000Z', price: 100, stopLevel: 95, targets: [110] },
            { _id: 'c2', symbol: 'BBB', signalAt: '2024-01-01T00:00:00.000Z', price: 100, stopLevel: 95, targets: [110] },
        ]);

        expect(result.failed).toBe(1);
        expect(result.updated).toBe(1);
    });

    it('does nothing for a symbol with no stored (or fetchable) data at all', async () => {
        const result = await updateActiveCandidateOutcomes([
            { _id: 'c1', symbol: 'ZZZZ', signalAt: '2024-01-01T00:00:00.000Z', price: 100, stopLevel: 95, targets: [110] },
        ]);
        expect(result).toEqual({ updated: 0, failed: 0 });
        expect(mockFindByIdAndUpdate).not.toHaveBeenCalled();
    });
});
