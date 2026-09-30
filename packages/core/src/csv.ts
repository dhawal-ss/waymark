// Parse pasted CSV for processing time series and Visa Bulletin cutoffs.
import { isLocalDate, type LocalDate } from './dates.ts';
import type { Cutoff, SeriesPoint } from './model.ts';

/** Accepts YYYY-MM-DD or MM/DD/YYYY (single-digit month and day allowed). */
export function parseDateInput(raw: string): LocalDate | null {
  const s = raw.trim().replace(/^"|"$/g, '');
  if (isLocalDate(s)) return s;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (!m) return null;
  const date = `${m[3]}-${m[1]!.padStart(2, '0')}-${m[2]!.padStart(2, '0')}`;
  return isLocalDate(date) ? date : null;
}

/** Accepts YYYY-MM, MM/YYYY, or a full date (its month is used). */
export function parseMonthInput(raw: string): string | null {
  const s = raw.trim().replace(/^"|"$/g, '');
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(s)) return s;
  const m = /^(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) {
    const month = Number(m[1]);
    return month >= 1 && month <= 12 ? `${m[2]}-${String(month).padStart(2, '0')}` : null;
  }
  const d = parseDateInput(s);
  return d ? d.slice(0, 7) : null;
}

function rows(text: string): { line: number; cells: string[] }[] {
  return text
    .split(/\r?\n/)
    .map((raw, i) => ({ line: i + 1, raw: raw.trim() }))
    .filter((r) => r.raw && !r.raw.startsWith('#'))
    .map((r) => ({ line: r.line, cells: r.raw.split(/[,;\t]/).map((c) => c.trim()) }));
}

export interface CsvResult<T> {
  items: T[];
  errors: string[];
}

export function parseSeriesCsv(text: string): CsvResult<SeriesPoint> {
  const byDate = new Map<LocalDate, number>();
  const errors: string[] = [];
  rows(text).forEach(({ line, cells }, index) => {
    const [dateCell = '', valueCell = ''] = cells;
    const date = parseDateInput(dateCell);
    const value = Number(valueCell.replace(/[^\d.-]/g, ''));
    if (index === 0 && !date) return; // header row
    if (!date) {
      errors.push(`Line ${line}: "${dateCell}" is not a date. Use YYYY-MM-DD or MM/DD/YYYY.`);
    } else if (!valueCell || !Number.isFinite(value) || value < 0) {
      errors.push(`Line ${line}: "${valueCell}" is not a number of months.`);
    } else {
      byDate.set(date, value);
    }
  });
  const items = [...byDate]
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));
  return { items, errors };
}

export function parseCutoffCsv(text: string): CsvResult<Cutoff> {
  const byMonth = new Map<string, Cutoff['cutoff']>();
  const errors: string[] = [];
  rows(text).forEach(({ line, cells }, index) => {
    const [monthCell = '', cutoffCell = ''] = cells;
    const month = parseMonthInput(monthCell);
    if (index === 0 && !month) return; // header row
    if (!month) {
      errors.push(`Line ${line}: "${monthCell}" is not a month. Use YYYY-MM or MM/YYYY.`);
      return;
    }
    if (/^c(urrent)?$/i.test(cutoffCell)) {
      byMonth.set(month, 'C');
      return;
    }
    const cutoff = parseDateInput(cutoffCell);
    if (!cutoff) {
      errors.push(`Line ${line}: "${cutoffCell}" is not a date or C.`);
      return;
    }
    byMonth.set(month, cutoff);
  });
  const items = [...byMonth]
    .map(([month, cutoff]) => ({ month, cutoff }))
    .sort((a, b) => a.month.localeCompare(b.month));
  return { items, errors };
}
