// Parser for the JSON behind egov.uscis.gov/processing-times. The endpoint is public but not
// documented, so the parser looks for the documented page concepts (a time range with units and a
// publication date) wherever they sit, and reports clearly when it finds none.
import { isLocalDate, type LocalDate } from '../dates.ts';

export interface ProcessingTime {
  form: string;
  office: string;
  subtype: string;
  subtypeLabel?: string;
  /** The headline time: 80% of cases are completed within this many months. */
  months: number;
  /** Lower end of the published range, when there is one. */
  lowMonths?: number;
  /** Date USCIS published the time, from the response. */
  publishedDate?: LocalDate;
}

const MONTH_NAMES = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

/** "July 25, 2024", "07/25/2024", or ISO to a local date. */
export function parsePublishedDate(value: unknown): LocalDate | undefined {
  if (typeof value !== 'string') return undefined;
  const s = value.trim();
  if (isLocalDate(s.slice(0, 10))) return s.slice(0, 10);
  const long = /^([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(s);
  if (long) {
    const m = MONTH_NAMES.findIndex((n) => n.startsWith(long[1]!.toLowerCase().slice(0, 3)));
    const date = `${long[3]}-${String(m + 1).padStart(2, '0')}-${long[2]!.padStart(2, '0')}`;
    return m >= 0 && isLocalDate(date) ? date : undefined;
  }
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (us) {
    const date = `${us[3]}-${us[1]!.padStart(2, '0')}-${us[2]!.padStart(2, '0')}`;
    return isLocalDate(date) ? date : undefined;
  }
  return undefined;
}

/** Convert a value with a unit to months. */
export function toMonths(value: number, unit: string): number | null {
  if (!Number.isFinite(value) || value < 0) return null;
  const u = unit.toLowerCase();
  if (/month/.test(u)) return value;
  if (/week/.test(u)) return (value * 7) / 30.4375;
  if (/day/.test(u)) return value / 30.4375;
  if (/year/.test(u)) return value * 12;
  return null;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown) =>
  typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '';

function rangeMonths(range: unknown): number[] {
  if (!Array.isArray(range)) return [];
  const out: number[] = [];
  for (const r of range) {
    if (!isObj(r)) continue;
    const value = typeof r.value === 'number' ? r.value : Number(r.value);
    const months = toMonths(value, str(r.unit_en) || str(r.unit) || 'months');
    if (months !== null) out.push(Math.round(months * 10) / 10);
  }
  return out;
}

function dateIn(o: Obj): LocalDate | undefined {
  for (const key of [
    'publication_date',
    'publicationDate',
    'published_date',
    'last_updated',
    'lastUpdated',
    'date',
  ]) {
    const d = parsePublishedDate(o[key]);
    if (d) return d;
  }
  return undefined;
}

export interface ProcessingTimeContext {
  form: string;
  office: string;
  /** Subtype to keep. Empty keeps every subtype in the response. */
  subtype?: string;
}

/** Parse a processing time response. Returns one record per subtype found. */
export function parseProcessingTimes(
  body: unknown,
  context: ProcessingTimeContext,
): { times: ProcessingTime[]; problems: string[] } {
  const times: ProcessingTime[] = [];
  const seen = new Set<string>();

  const visit = (
    node: unknown,
    inherited: { date?: LocalDate; subtype?: string; label?: string },
    depth: number,
  ) => {
    if (depth > 8) return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item, inherited, depth + 1);
      return;
    }
    if (!isObj(node)) return;
    const scope = {
      date: dateIn(node) ?? inherited.date,
      subtype:
        str(node.form_type) || str(node.subtype) || str(node.form_subtype) || inherited.subtype,
      label:
        str(node.subtype_info_en) ||
        str(node.subtype_info) ||
        str(node.form_subtype_name) ||
        inherited.label,
    };
    const values = rangeMonths(node.range);
    if (values.length > 0) {
      const subtype = scope.subtype ?? '';
      const wanted = !context.subtype || !subtype || subtype === context.subtype;
      const key = `${subtype}|${scope.date ?? ''}`;
      if (wanted && !seen.has(key)) {
        seen.add(key);
        const time: ProcessingTime = {
          form: context.form,
          office: context.office,
          subtype,
          months: Math.max(...values),
        };
        if (values.length > 1) time.lowMonths = Math.min(...values);
        if (scope.date) time.publishedDate = scope.date;
        if (scope.label) time.subtypeLabel = scope.label;
        times.push(time);
      }
    }
    for (const [key, value] of Object.entries(node)) {
      if (key !== 'range' && (isObj(value) || Array.isArray(value))) visit(value, scope, depth + 1);
    }
  };

  visit(body, {}, 0);
  // A parent range often repeats a subtype range; keep subtype records when both exist.
  const specific = times.filter((t) => t.subtype);
  const result =
    specific.length > 0 ? specific : times.map((t) => ({ ...t, subtype: context.subtype ?? '' }));
  const problems =
    result.length === 0
      ? ['The response has no processing time range. The USCIS page format may have changed.']
      : [];
  return { times: result, problems };
}
