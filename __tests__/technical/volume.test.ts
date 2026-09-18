import { describe, expect, it } from 'vitest';
import { averageVolume, relativeVolume, latestRelativeVolume } from '@/lib/technical/volume';
import type { OhlcBar } from '@/lib/technical/types';

function barWithVolume(volume: number): OhlcBar {
    return { time: '2024-01-01', open: 10, high: 10, low: 10, close: 10, volume };
}

describe('volume', () => {
    it('computes average volume as a plain SMA of volume', () => {
        const bars = [100, 200, 300, 400].map(barWithVolume);
        expect(averageVolume(bars, 2)).toEqual([null, 150, 250, 350]);
    });

    it('computes relative volume against the trailing average', () => {
        const bars = [100, 100, 300].map(barWithVolume);
        // The 2-period average is a trailing window that includes the
        // current bar: avg[1] = (100+100)/2 = 100, avg[2] = (100+300)/2 = 200.
        const result = relativeVolume(bars, 2);
        expect(result[1]).toBeCloseTo(1, 10); // 100 / 100
        expect(result[2]).toBeCloseTo(1.5, 10); // 300 / 200
    });

    it('is null wherever the average is undefined or zero', () => {
        const bars = [0, 0].map(barWithVolume);
        expect(relativeVolume(bars, 2)).toEqual([null, null]);
        expect(latestRelativeVolume([barWithVolume(100)], 20)).toBeNull();
    });
});
