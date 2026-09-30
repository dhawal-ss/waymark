// Display formatting. Local dates format in UTC so the calendar date never shifts.
import { toEpochDay, type LocalDate } from '@waymark/core';

const DAY_MS = 86_400_000;
const LOCALE = 'en-US';

const dateFmt = new Intl.DateTimeFormat(LOCALE, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});
const shortFmt = new Intl.DateTimeFormat(LOCALE, {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});
const monthFmt = new Intl.DateTimeFormat(LOCALE, {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});
const money = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: 'USD' });
const rtf = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' });

export function formatDate(date: LocalDate): string {
  return dateFmt.format(new Date(toEpochDay(date) * DAY_MS));
}

export function formatShortDate(date: LocalDate, today?: LocalDate): string {
  if (today && date.slice(0, 4) !== today.slice(0, 4)) return formatDate(date);
  return shortFmt.format(new Date(toEpochDay(date) * DAY_MS));
}

/** "2025-03" to "Mar 2025". */
export function formatMonth(month: string): string {
  return monthFmt.format(new Date(`${month}-01T00:00:00Z`));
}

/** Instant in the chosen zone with the zone name, for example "Mar 1, 2025, 10:00 AM EST". */
export function formatDateTime(instant: string, timeZone?: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
    timeZone,
  }).format(new Date(instant));
}

export function relativeTime(instant: string, now: Date = new Date()): string {
  const seconds = (new Date(instant).getTime() - now.getTime()) / 1000;
  const abs = Math.abs(seconds);
  if (abs < 60) return 'just now';
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(seconds / 3600), 'hour');
  if (abs < 86400 * 45) return rtf.format(Math.round(seconds / 86400), 'day');
  if (abs < 86400 * 365) return rtf.format(Math.round(seconds / (86400 * 30.44)), 'month');
  return rtf.format(Math.round(seconds / (86400 * 365.25)), 'year');
}

/** Days from `today` to `date` in words: "today", "tomorrow", "in 5 days", "3 days ago". */
export function relativeDays(date: LocalDate, today: LocalDate): string {
  return rtf.format(toEpochDay(date) - toEpochDay(today), 'day');
}

export function formatMoney(cents: number): string {
  return money.format(cents / 100);
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString(LOCALE)} ${n === 1 ? one : many}`;
}

export function formatNumber(n: number, digits = 1): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(digits);
}
