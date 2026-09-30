// Priority date checks and projections from Visa Bulletin cutoffs.
import { fromEpochDay, toEpochDay, type LocalDate } from './dates.ts';
import type { Cutoff } from './model.ts';

/** A priority date is current when the category is "C" or the date is earlier than the cutoff. */
export function isCurrent(priorityDate: LocalDate, cutoff: LocalDate | 'C'): boolean {
  return cutoff === 'C' || priorityDate < cutoff;
}

export function monthIndex(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return (y ?? 0) * 12 + ((m ?? 1) - 1);
}

export function monthFromIndex(index: number): string {
  const y = Math.floor(index / 12);
  const m = (index % 12) + 1;
  return `${y}-${String(m).padStart(2, '0')}`;
}

export function linearRegression(
  points: { x: number; y: number }[],
): { slope: number; intercept: number } | null {
  const n = points.length;
  if (n < 2) return null;
  const mx = points.reduce((s, p) => s + p.x, 0) / n;
  const my = points.reduce((s, p) => s + p.y, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.x - mx) * (p.y - my);
    den += (p.x - mx) ** 2;
  }
  if (den === 0) return null;
  const slope = num / den;
  return { slope, intercept: my - slope * mx };
}

/** Cutoff movement below this many days per month counts as barely moving. */
export const STALLED_DAYS_PER_MONTH = 3;

export type Projection =
  | { kind: 'no-priority-date' }
  | { kind: 'no-data' }
  | { kind: 'current'; month: string }
  | { kind: 'insufficient'; points: number }
  | { kind: 'stalled'; daysPerMonth: number }
  | {
      kind: 'estimate';
      month: string;
      monthsAway: number;
      daysPerMonth: number;
      fit: { month: string; cutoff: LocalDate }[];
    };

export function projectPriorityDate(
  priorityDate: LocalDate | undefined,
  cutoffs: readonly Cutoff[],
): Projection {
  if (!priorityDate) return { kind: 'no-priority-date' };
  const sorted = [...cutoffs].sort((a, b) => a.month.localeCompare(b.month));
  const latest = sorted[sorted.length - 1];
  if (!latest) return { kind: 'no-data' };
  if (isCurrent(priorityDate, latest.cutoff)) return { kind: 'current', month: latest.month };

  const latestIndex = monthIndex(latest.month);
  const recent = sorted.filter((c) => c.cutoff !== 'C' && monthIndex(c.month) > latestIndex - 12);
  if (recent.length < 3) return { kind: 'insufficient', points: recent.length };

  const fitPoints = recent.map((c) => ({
    x: monthIndex(c.month),
    y: toEpochDay(c.cutoff as LocalDate),
  }));
  const line = linearRegression(fitPoints);
  if (!line || line.slope < STALLED_DAYS_PER_MONTH) {
    return { kind: 'stalled', daysPerMonth: line?.slope ?? 0 };
  }
  // Latest cutoff is not "C" here, because the current check above returned for it.
  const gap = toEpochDay(priorityDate) - toEpochDay(latest.cutoff as LocalDate);
  const monthsAway = Math.max(1, Math.ceil(gap / line.slope));
  const targetIndex = latestIndex + monthsAway;
  const firstIndex = fitPoints[0]!.x;
  const fit = [firstIndex, targetIndex].map((x) => ({
    month: monthFromIndex(x),
    cutoff: fromEpochDay(Math.round(line.intercept + line.slope * x)),
  }));
  return {
    kind: 'estimate',
    month: monthFromIndex(targetIndex),
    monthsAway,
    daysPerMonth: line.slope,
    fit,
  };
}
