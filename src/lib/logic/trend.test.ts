import { describe, expect, it } from 'vitest';
import { weightTrend } from './trend';

const DAY = 86_400_000;
const at = (day: number, y: number) => ({ x: day * DAY, y });

describe('weightTrend', () => {
  it('returns nothing for no readings and the reading itself for one', () => {
    expect(weightTrend([])).toEqual([]);
    expect(weightTrend([at(0, 80)])).toEqual([80]);
  });

  it('moves a tenth of the way per daily reading', () => {
    const t = weightTrend([at(0, 80), at(1, 90), at(2, 90)]);
    expect(t[1]).toBeCloseTo(81);
    expect(t[2]).toBeCloseTo(81.9);
  });

  it('weighs a reading after a gap like daily readings over that gap', () => {
    const gap = weightTrend([at(0, 80), at(7, 90)]).at(-1)!;
    const daily = weightTrend([0, 1, 2, 3, 4, 5, 6, 7].map((d) => at(d, d ? 90 : 80))).at(-1)!;
    expect(gap).toBeCloseTo(daily);
  });

  it('smooths out day-to-day noise and stays within the readings', () => {
    const ys = [80, 81.5, 79.6, 80.8, 79.9, 81.2, 80.1];
    const t = weightTrend(ys.map((y, d) => at(d, y)));
    for (const v of t) {
      expect(v).toBeGreaterThanOrEqual(79.6);
      expect(v).toBeLessThanOrEqual(81.5);
    }
    expect(Math.max(...t) - Math.min(...t)).toBeLessThan(0.5);
  });

  it('treats same-day readings as a day apart instead of ignoring them', () => {
    expect(weightTrend([at(0, 80), at(0, 90)])[1]).toBeCloseTo(81);
  });
});
