import { describe, expect, it } from 'vitest';
import {
    clusterLevelsIntoZones,
    findSupportResistanceZones,
    findSwingPoints,
} from '@/lib/technical/supportResistance';
import type { OhlcBar } from '@/lib/technical/types';

function bar(high: number, low: number, close: number): OhlcBar {
    return { time: '2024-01-01', open: close, high, low, close, volume: 1000 };
}

describe('findSwingPoints', () => {
    it('finds local swing highs and lows within the lookback window', () => {
        const bars = [
            bar(10, 8, 9),
            bar(15, 12, 13), // swing high (15 is the max of bars[0..2])
            bar(10, 5, 7), // swing low (5 is the min of bars[1..3])
            bar(20, 12, 15), // swing high (20 is the max of bars[2..4])
            bar(10, 8, 9),
        ];

        const { highs, lows } = findSwingPoints(bars, 1);
        expect(highs).toEqual([15, 20]);
        expect(lows).toEqual([5]);
    });

    it('returns nothing when there are fewer bars than 2*lookback + 1', () => {
        const bars = [bar(10, 8, 9), bar(11, 9, 10)];
        expect(findSwingPoints(bars, 3)).toEqual({ highs: [], lows: [] });
    });
});

describe('clusterLevelsIntoZones', () => {
    it('merges nearby levels and reports touch counts, most-touched first', () => {
        const zones = clusterLevelsIntoZones([100, 101, 105, 106, 120], 2);
        expect(zones).toEqual([
            { low: 100, high: 101, touches: 2 },
            { low: 105, high: 106, touches: 2 },
            { low: 120, high: 120, touches: 1 },
        ]);
    });

    it('returns an empty array for no levels', () => {
        expect(clusterLevelsIntoZones([], 2)).toEqual([]);
    });
});

describe('findSupportResistanceZones', () => {
    it('separates zones into support (below price) and resistance (above price)', () => {
        const bars = [
            bar(10, 8, 9),
            bar(15, 12, 13),
            bar(10, 5, 7),
            bar(20, 12, 15),
            bar(10, 8, 9),
        ];

        const { support, resistance } = findSupportResistanceZones(bars, 12, 1, 1);
        // Swing high 15 and 20 are both >= 12 (current price) -> resistance
        expect(resistance.map((z) => z.low)).toEqual([15, 20]);
        // Swing low 5 is <= 12 (current price) -> support
        expect(support.map((z) => z.high)).toEqual([5]);
    });
});
