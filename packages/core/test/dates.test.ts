import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  daysBetween,
  fromEpochDay,
  isLocalDate,
  toEpochDay,
  today,
} from '../src';

describe('local dates', () => {
  it('validates real calendar dates only', () => {
    expect(isLocalDate('2024-02-29')).toBe(true);
    expect(isLocalDate('2023-02-29')).toBe(false);
    expect(isLocalDate('2024-13-01')).toBe(false);
    expect(isLocalDate('2024-1-01')).toBe(false);
    expect(isLocalDate(20240101)).toBe(false);
  });

  it('round trips epoch days', () => {
    expect(toEpochDay('1970-01-01')).toBe(0);
    for (const d of ['1999-12-31', '2024-02-29', '2024-03-10', '2024-11-03', '2031-07-04']) {
      expect(fromEpochDay(toEpochDay(d))).toBe(d);
    }
  });

  it('counts days across DST changes without drift', () => {
    expect(daysBetween('2024-03-09', '2024-03-11')).toBe(2);
    expect(daysBetween('2024-11-02', '2024-11-04')).toBe(2);
    expect(daysBetween('2024-01-01', '2025-01-01')).toBe(366);
  });

  it('adds days and months', () => {
    expect(addDays('2024-12-31', 1)).toBe('2025-01-01');
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29');
    expect(addMonths('2024-03-15', -3)).toBe('2023-12-15');
    expect(addMonths('2024-05-10', 14)).toBe('2025-07-10');
  });

  it('reads today in a given time zone', () => {
    const instant = new Date('2024-06-01T02:30:00Z');
    expect(today('America/Los_Angeles', instant)).toBe('2024-05-31');
    expect(today('Asia/Kolkata', instant)).toBe('2024-06-01');
  });
});
