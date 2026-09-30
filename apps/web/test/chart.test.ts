import { describe, expect, it } from 'vitest';
import {
  countTicks,
  linearScale,
  monthTicks,
  nearestIndex,
  niceTicks,
  segmentWidths,
  topRoundedRect,
} from '../src/lib/chart';

describe('niceTicks', () => {
  it('uses round steps that cover the range', () => {
    expect(niceTicks(0, 10, 5)).toEqual([0, 2.5, 5, 7.5, 10]);
    expect(niceTicks(3.2, 17.9, 5)).toEqual([0, 5, 10, 15, 20]);
    const t = niceTicks(-3, 7);
    expect(t[0]).toBeLessThanOrEqual(-3);
    expect(t[t.length - 1]).toBeGreaterThanOrEqual(7);
  });

  it('pads a flat range', () => {
    const t = niceTicks(5, 5);
    expect(t[0]).toBeLessThan(5);
    expect(t[t.length - 1]).toBeGreaterThan(5);
  });

  it('returns nothing for non-finite input', () => {
    expect(niceTicks(Number.NaN, 1)).toEqual([]);
  });
});

describe('linearScale', () => {
  it('maps domain to range, including inverted ranges', () => {
    const y = linearScale([0, 10], [100, 0]);
    expect(y(0)).toBe(100);
    expect(y(5)).toBe(50);
    expect(y(10)).toBe(0);
  });
});

describe('nearestIndex', () => {
  it('finds the closest value', () => {
    const xs = [0, 10, 20, 30];
    expect(nearestIndex(xs, -5)).toBe(0);
    expect(nearestIndex(xs, 14)).toBe(1);
    expect(nearestIndex(xs, 16)).toBe(2);
    expect(nearestIndex(xs, 99)).toBe(3);
    expect(nearestIndex([], 1)).toBe(-1);
  });
});

describe('monthTicks', () => {
  const day = (iso: string) =>
    Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86_400_000;

  it('lists month starts inside the range', () => {
    expect(monthTicks(day('2024-01-15'), day('2024-04-10'))).toEqual([
      day('2024-02-01'),
      day('2024-03-01'),
      day('2024-04-01'),
    ]);
  });

  it('thins long ranges', () => {
    expect(monthTicks(day('2020-01-01'), day('2024-12-31')).length).toBeLessThanOrEqual(6);
  });
});

describe('countTicks', () => {
  it('uses whole numbers that cover the maximum', () => {
    expect(countTicks(0)).toEqual([0, 1]);
    expect(countTicks(1)).toEqual([0, 1]);
    expect(countTicks(4)).toEqual([0, 1, 2, 3, 4]);
    expect(countTicks(7)).toEqual([0, 2, 4, 6, 8]);
    expect(countTicks(23)).toEqual([0, 10, 20, 30]);
  });
});

describe('segmentWidths', () => {
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

  it('sizes segments in proportion to their values', () => {
    const w = segmentWidths([10, 30, 60], 200);
    expect(w[0]).toBeCloseTo(20);
    expect(w[1]).toBeCloseTo(60);
    expect(w[2]).toBeCloseTo(120);
  });

  it('keeps a zero value visible and still fills the width', () => {
    const w = segmentWidths([0, 50, 50], 200, 6);
    expect(w[0]).toBe(6);
    expect(sum(w)).toBeCloseTo(200);
    expect(w[1]).toBeCloseTo(97);
  });

  it('pins several small segments without pushing others below the minimum', () => {
    const w = segmentWidths([1, 1, 1, 100, 3], 120, 8);
    for (const x of w) expect(x).toBeGreaterThanOrEqual(8 - 1e-9);
    expect(sum(w)).toBeCloseTo(120);
  });

  it('splits evenly when every value is zero and copes with tiny widths', () => {
    expect(segmentWidths([0, 0, 0], 90)).toEqual([30, 30, 30]);
    expect(sum(segmentWidths([5, 5, 5, 5], 12, 6))).toBeCloseTo(12);
    expect(segmentWidths([], 100)).toEqual([]);
    expect(segmentWidths([1, 2], 0)).toEqual([0, 0]);
  });
});

describe('topRoundedRect', () => {
  it('starts and ends at the square base', () => {
    const d = topRoundedRect(10, 20, 24, 30, 4);
    expect(d.startsWith('M10.00 50.00')).toBe(true);
    expect(d.endsWith('V50.00Z')).toBe(true);
  });

  it('shrinks the radius for short columns', () => {
    expect(topRoundedRect(0, 0, 24, 2, 4)).toContain('A2.00 2.00');
  });
});
