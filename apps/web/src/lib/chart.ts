// Scale and tick math for the SVG line chart.

/** Round-number ticks covering [min, max], about `count` of them. */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (min === max) {
    const pad = Math.abs(min) * 0.1 || 1;
    min -= pad;
    max += pad;
  }
  const raw = (max - min) / Math.max(1, count - 1);
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const residual = raw / magnitude;
  const step =
    (residual > 5 ? 10 : residual > 2.5 ? 5 : residual > 2 ? 2.5 : residual > 1 ? 2 : 1) *
    magnitude;
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= end + step / 2; v += step) ticks.push(Number(v.toFixed(10)));
  return ticks;
}

export function linearScale(
  [d0, d1]: [number, number],
  [r0, r1]: [number, number],
): (v: number) => number {
  const span = d1 - d0 || 1;
  return (v) => r0 + ((v - d0) / span) * (r1 - r0);
}

/** Index of the value in a sorted array closest to `target`. */
export function nearestIndex(sorted: number[], target: number): number {
  if (sorted.length === 0) return -1;
  let lo = 0;
  let hi = sorted.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((sorted[mid] ?? 0) < target) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && Math.abs((sorted[lo - 1] ?? 0) - target) <= Math.abs((sorted[lo] ?? 0) - target)) {
    return lo - 1;
  }
  return lo;
}

const DAY_MS = 86_400_000;

/** First-of-month epoch days between two epoch days, thinned to at most `max` ticks. */
export function monthTicks(minDay: number, maxDay: number, max = 6): number[] {
  const start = new Date(minDay * DAY_MS);
  const y = start.getUTCFullYear();
  let m = start.getUTCMonth();
  if (start.getUTCDate() !== 1) m += 1;
  const months: number[] = [];
  for (;;) {
    const day = Date.UTC(y + Math.floor(m / 12), m % 12, 1) / DAY_MS;
    if (day > maxDay) break;
    months.push(day);
    m += 1;
  }
  if (months.length <= max) return months;
  const steps = [2, 3, 6, 12, 24, 60];
  const every = steps.find((s) => Math.ceil(months.length / s) <= max) ?? 120;
  return months.filter((day) => {
    const d = new Date(day * DAY_MS);
    return every < 12
      ? d.getUTCMonth() % every === 0
      : d.getUTCMonth() === 0 && d.getUTCFullYear() % (every / 12) === 0;
  });
}

/** Whole-number ticks from 0 that cover `max`, at most about four steps. */
export function countTicks(max: number): number[] {
  const top = Math.max(1, Math.ceil(max));
  const step = [1, 2, 5, 10, 20, 50, 100, 200, 500].find((s) => top / s <= 4) ?? 1000;
  const end = Math.ceil(top / step) * step;
  return Array.from({ length: end / step + 1 }, (_, i) => i * step);
}

/**
 * Widths for segments sized by value along `avail` pixels. A segment never gets less than `min`
 * pixels, so a run of zero days stays visible, and the others share the rest in proportion.
 */
export function segmentWidths(values: number[], avail: number, min = 6): number[] {
  const n = values.length;
  if (n === 0 || avail <= 0) return values.map(() => 0);
  const floor = Math.min(min, avail / n);
  const positive = values.map((v) => Math.max(0, v));
  const total = positive.reduce((sum, v) => sum + v, 0);
  if (total === 0) return values.map(() => avail / n);
  let widths = positive.map((v) => (v / total) * avail);
  const pinned = new Set<number>();
  for (let pass = 0; pass < n; pass++) {
    const before = pinned.size;
    widths.forEach((w, i) => {
      if (w < floor) pinned.add(i);
    });
    if (pinned.size === before) break;
    const space = avail - pinned.size * floor;
    const rest = positive.reduce((sum, v, i) => (pinned.has(i) ? sum : sum + v), 0);
    widths = positive.map((v, i) => (pinned.has(i) ? floor : rest > 0 ? (v / rest) * space : 0));
  }
  return widths;
}

/** Path of a column with rounded top corners of radius `r` and a square base. */
export function topRoundedRect(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.max(0, Math.min(r, w / 2, h));
  const f = (n: number) => n.toFixed(2);
  return (
    `M${f(x)} ${f(y + h)}V${f(y + rr)}A${f(rr)} ${f(rr)} 0 0 1 ${f(x + rr)} ${f(y)}` +
    `H${f(x + w - rr)}A${f(rr)} ${f(rr)} 0 0 1 ${f(x + w)} ${f(y + rr)}V${f(y + h)}Z`
  );
}
