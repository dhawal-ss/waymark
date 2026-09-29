// Dates are stored as local calendar dates in YYYY-MM-DD form. Arithmetic runs on
// epoch days (days since 1970-01-01) computed in UTC, so DST never shifts a date.

export type LocalDate = string;

const DAY_MS = 86_400_000;
const LOCAL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isLocalDate(value: unknown): value is LocalDate {
  if (typeof value !== 'string') return false;
  const m = LOCAL_DATE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

export function toEpochDay(date: LocalDate): number {
  const m = LOCAL_DATE.exec(date);
  if (!m) throw new Error(`Not a YYYY-MM-DD date: ${date}`);
  return Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / DAY_MS);
}

export function fromEpochDay(day: number): LocalDate {
  const d = new Date(day * DAY_MS);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${String(y).padStart(4, '0')}-${m}-${dd}`;
}

/** Today's date in the given time zone (or the device zone). */
export function today(timeZone?: string, now: Date = new Date()): LocalDate {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function daysBetween(from: LocalDate, to: LocalDate): number {
  return toEpochDay(to) - toEpochDay(from);
}

export function addDays(date: LocalDate, days: number): LocalDate {
  return fromEpochDay(toEpochDay(date) + days);
}

/** Add calendar months, clamping to the last day of the target month. */
export function addMonths(date: LocalDate, months: number): LocalDate {
  const m = LOCAL_DATE.exec(date);
  if (!m) throw new Error(`Not a YYYY-MM-DD date: ${date}`);
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1 + months;
  const d = Number(m[3]);
  const targetYear = y + Math.floor(mo / 12);
  const targetMonth = ((mo % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return fromEpochDay(Math.floor(Date.UTC(targetYear, targetMonth, Math.min(d, lastDay)) / DAY_MS));
}
