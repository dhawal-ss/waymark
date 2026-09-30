import { describe, expect, it } from 'vitest';
import {
  describeChange,
  parseCutoffCsv,
  parseDateInput,
  parseMonthInput,
  parseSeriesCsv,
  pointsInRange,
  seriesChange,
} from '../src';

describe('date and month input', () => {
  it('accepts both date formats', () => {
    expect(parseDateInput('2025-03-01')).toBe('2025-03-01');
    expect(parseDateInput('3/1/2025')).toBe('2025-03-01');
    expect(parseDateInput('02/30/2025')).toBeNull();
    expect(parseDateInput('2025/03/01')).toBeNull();
  });

  it('accepts month formats', () => {
    expect(parseMonthInput('2025-03')).toBe('2025-03');
    expect(parseMonthInput('3/2025')).toBe('2025-03');
    expect(parseMonthInput('2025-03-15')).toBe('2025-03');
    expect(parseMonthInput('13/2025')).toBeNull();
  });
});

describe('parseSeriesCsv', () => {
  it('parses rows, skips a header, sorts, and keeps the last duplicate', () => {
    const { items, errors } = parseSeriesCsv(
      'date,months\n2025-02-01, 12.5\n01/01/2025,12\n\n2025-02-01;13\t\n',
    );
    expect(errors).toEqual([]);
    expect(items).toEqual([
      { date: '2025-01-01', value: 12 },
      { date: '2025-02-01', value: 13 },
    ]);
  });

  it('reports bad rows with line numbers', () => {
    const { items, errors } = parseSeriesCsv('2025-01-01,12\nsoon,4\n2025-03-01,\n2025-04-01,-2');
    expect(items).toHaveLength(1);
    expect(errors).toEqual([
      'Line 2: "soon" is not a date. Use YYYY-MM-DD or MM/DD/YYYY.',
      'Line 3: "" is not a number of months.',
      'Line 4: "-2" is not a number of months.',
    ]);
  });
});

describe('parseCutoffCsv', () => {
  it('parses dates and C', () => {
    const { items, errors } = parseCutoffCsv(
      'month,cutoff\n2025-02,C\n01/2025,2019-06-01\n2025-03,current\n2025-04,x',
    );
    expect(items).toEqual([
      { month: '2025-01', cutoff: '2019-06-01' },
      { month: '2025-02', cutoff: 'C' },
      { month: '2025-03', cutoff: 'C' },
    ]);
    expect(errors).toEqual(['Line 5: "x" is not a date or C.']);
  });
});

describe('series ranges', () => {
  const points = Array.from({ length: 14 }, (_, i) => ({
    date: `${2024 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}-01`,
    value: 10 + i * 0.5,
  }));

  it('filters back from the latest point', () => {
    expect(pointsInRange(points, '3m')).toHaveLength(4);
    expect(pointsInRange(points, '1y')).toHaveLength(13);
    expect(pointsInRange(points, 'all')).toHaveLength(14);
    expect(pointsInRange([], '3m')).toEqual([]);
  });

  it('describes the change', () => {
    const change = seriesChange(pointsInRange(points, '3m'));
    expect(change?.delta).toBe(1.5);
    expect(describeChange(change)).toBe('Up 1.5 months (10%) since 2024-11-01.');
    expect(describeChange(seriesChange([points[0]!, { ...points[1]!, value: 10 }]))).toBe(
      'No change since 2024-01-01.',
    );
    expect(describeChange(null)).toBe('Add at least 2 points to see a change.');
  });
});
