import { describe, expect, it } from 'vitest';
import {
  isCurrent,
  linearRegression,
  monthFromIndex,
  monthIndex,
  projectPriorityDate,
  type Cutoff,
} from '../src';

const monthly = (start: string, cutoffs: (string | 'C')[]): Cutoff[] =>
  cutoffs.map((cutoff, i) => ({ month: monthFromIndex(monthIndex(start) + i), cutoff }));

describe('isCurrent', () => {
  it('is current for C or a priority date earlier than the cutoff', () => {
    expect(isCurrent('2020-01-01', 'C')).toBe(true);
    expect(isCurrent('2020-01-01', '2020-01-02')).toBe(true);
    expect(isCurrent('2020-01-02', '2020-01-02')).toBe(false);
  });
});

describe('linearRegression', () => {
  it('fits a line', () => {
    expect(
      linearRegression([
        { x: 0, y: 1 },
        { x: 1, y: 3 },
        { x: 2, y: 5 },
      ]),
    ).toEqual({ slope: 2, intercept: 1 });
    expect(linearRegression([{ x: 1, y: 1 }])).toBeNull();
    expect(
      linearRegression([
        { x: 1, y: 1 },
        { x: 1, y: 2 },
      ]),
    ).toBeNull();
  });
});

describe('projectPriorityDate', () => {
  it('asks for a priority date and data', () => {
    expect(projectPriorityDate(undefined, [])).toEqual({ kind: 'no-priority-date' });
    expect(projectPriorityDate('2020-01-01', [])).toEqual({ kind: 'no-data' });
  });

  it('reports already current', () => {
    expect(
      projectPriorityDate('2020-01-01', monthly('2025-01', ['2019-01-01', '2020-06-01'])),
    ).toEqual({
      kind: 'current',
      month: '2025-02',
    });
    expect(projectPriorityDate('2020-01-01', monthly('2025-01', ['C']))).toMatchObject({
      kind: 'current',
    });
  });

  it('needs 3 months of dated cutoffs within the last 12 months', () => {
    const data = [
      ...monthly('2023-01', ['2018-01-01', '2018-02-01', '2018-03-01']),
      ...monthly('2025-01', ['2018-06-01', '2018-07-01']),
    ];
    expect(projectPriorityDate('2020-01-01', data)).toEqual({ kind: 'insufficient', points: 2 });
  });

  it('reports a cutoff that is barely moving', () => {
    const data = monthly('2025-01', [
      '2018-01-01',
      '2018-01-02',
      '2018-01-03',
      '2018-01-04',
      '2018-01-04',
    ]);
    expect(projectPriorityDate('2020-01-01', data)).toMatchObject({ kind: 'stalled' });
  });

  it('estimates the month the cutoff passes the priority date', () => {
    // Cutoff advances 31 days per month on average; the gap is about 1 year.
    const data = monthly('2025-01', [
      '2019-01-01',
      '2019-02-01',
      '2019-03-01',
      '2019-04-01',
      '2019-05-01',
      '2019-06-01',
    ]);
    const p = projectPriorityDate('2020-06-01', data);
    expect(p.kind).toBe('estimate');
    if (p.kind !== 'estimate') return;
    expect(p.daysPerMonth).toBeGreaterThan(29);
    expect(p.daysPerMonth).toBeLessThan(32);
    expect(p.monthsAway).toBe(13);
    expect(p.month).toBe('2026-07');
    expect(p.fit[0]!.month).toBe('2025-01');
    expect(p.fit[1]!.month).toBe('2026-07');
  });
});
