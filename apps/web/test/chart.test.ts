import { describe, expect, it } from 'vitest';
import { linearScale, monthTicks, nearestIndex, niceTicks } from '../src/lib/chart';

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
