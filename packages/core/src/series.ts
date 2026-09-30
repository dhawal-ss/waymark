// Processing time series helpers.
import { addMonths, type LocalDate } from './dates.ts';
import type { SeriesPoint } from './model.ts';

export type Range = '3m' | '6m' | '1y' | 'all';

const RANGE_MONTHS: Record<Exclude<Range, 'all'>, number> = { '3m': 3, '6m': 6, '1y': 12 };

/** Points within the range, measured back from the latest point. */
export function pointsInRange(points: readonly SeriesPoint[], range: Range): SeriesPoint[] {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const last = sorted[sorted.length - 1];
  if (!last || range === 'all') return sorted;
  const from: LocalDate = addMonths(last.date, -RANGE_MONTHS[range]);
  return sorted.filter((p) => p.date >= from);
}

export interface SeriesChange {
  from: SeriesPoint;
  to: SeriesPoint;
  delta: number;
  /** Relative change; null when the first value is 0. */
  percent: number | null;
}

export function seriesChange(points: readonly SeriesPoint[]): SeriesChange | null {
  if (points.length < 2) return null;
  const from = points[0]!;
  const to = points[points.length - 1]!;
  const delta = to.value - from.value;
  return { from, to, delta, percent: from.value === 0 ? null : delta / from.value };
}

export function describeChange(change: SeriesChange | null, unit = 'months'): string {
  if (!change) return 'Add at least 2 points to see a change.';
  const d = Math.abs(change.delta);
  const amount = Number.isInteger(d) ? String(d) : d.toFixed(1);
  if (change.delta === 0) return `No change since ${change.from.date}.`;
  const pct = change.percent === null ? '' : ` (${Math.round(Math.abs(change.percent) * 100)}%)`;
  return `${change.delta > 0 ? 'Up' : 'Down'} ${amount} ${unit}${pct} since ${change.from.date}.`;
}
