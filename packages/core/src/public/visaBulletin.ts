// Parser for the monthly Visa Bulletin published by the State Department at travel.state.gov.
import { isLocalDate, type LocalDate } from '../dates.ts';
import { extractTables, textOf } from './html.ts';

export type BulletinChart = 'final' | 'filing';
export type Preference = 'family' | 'employment';
/** A date, "C" (current), or "U" (unavailable). */
export type BulletinCutoff = LocalDate | 'C' | 'U';

export interface BulletinRow {
  month: string;
  chart: BulletinChart;
  preference: Preference;
  category: string;
  country: string;
  cutoff: BulletinCutoff;
}

export const BULLETIN_CATEGORY_LABELS: Record<string, string> = {
  F1: 'F1: Unmarried sons and daughters of citizens',
  F2A: 'F2A: Spouses and children of permanent residents',
  F2B: 'F2B: Unmarried sons and daughters of permanent residents',
  F3: 'F3: Married sons and daughters of citizens',
  F4: 'F4: Brothers and sisters of adult citizens',
  EB1: 'EB-1: Priority workers',
  EB2: 'EB-2: Advanced degrees or exceptional ability',
  EB3: 'EB-3: Skilled workers and professionals',
  EW: 'EB-3: Other workers',
  EB4: 'EB-4: Special immigrants',
  SR: 'EB-4: Certain religious workers',
  EB5U: 'EB-5: Unreserved',
  EB5R: 'EB-5: Set aside, rural',
  EB5H: 'EB-5: Set aside, high unemployment',
  EB5I: 'EB-5: Set aside, infrastructure',
};

export const BULLETIN_COUNTRY_LABELS: Record<string, string> = {
  ALL: 'All chargeability areas except those listed',
  CHINA: 'China (mainland born)',
  INDIA: 'India',
  MEXICO: 'Mexico',
  PHILIPPINES: 'Philippines',
};

const MONTHS = [
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
const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** Bulletin page URL for a month ("2025-10"). Pages sit in fiscal year folders. */
export function bulletinUrl(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const fiscalYear = m >= 10 ? y + 1 : y;
  return `https://travel.state.gov/content/travel/en/legal/visa-law0/visa-bulletin/${fiscalYear}/visa-bulletin-for-${MONTHS[m - 1]}-${y}.html`;
}

/** "01JAN23" to "2023-01-01". Two-digit years up to 69 are 20xx, others 19xx. */
export function parseBulletinDate(raw: string): LocalDate | null {
  const m = /^(\d{2})\s*([A-Z]{3})\s*(\d{2}|\d{4})$/i.exec(raw.trim());
  if (!m) return null;
  const month = MON.indexOf(m[2]!.toUpperCase());
  if (month < 0) return null;
  let year = Number(m[3]);
  if (m[3]!.length === 2) year += year <= 69 ? 2000 : 1900;
  const date = `${year}-${String(month + 1).padStart(2, '0')}-${m[1]}`;
  return isLocalDate(date) ? date : null;
}

export function parseCutoffCell(raw: string): BulletinCutoff | null {
  const s = raw.trim().toUpperCase();
  if (s === 'C') return 'C';
  if (s === 'U') return 'U';
  return parseBulletinDate(s);
}

export function normalizeCountry(label: string): string {
  const s = label.toLowerCase();
  if (/all charge/.test(s)) return 'ALL';
  if (/china/.test(s)) return 'CHINA';
  if (/india/.test(s)) return 'INDIA';
  if (/mexico/.test(s)) return 'MEXICO';
  if (/philippines/.test(s)) return 'PHILIPPINES';
  return label
    .toUpperCase()
    .replace(/[^A-Z]+/g, '_')
    .replace(/^_|_$/g, '');
}

export function normalizeCategory(label: string, preference: Preference): string {
  const s = label.trim();
  if (preference === 'family') {
    const m = /^F\s*-?\s*(1|2A|2B|3|4)\b/i.exec(s);
    return m ? `F${m[1]!.toUpperCase()}` : s.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  }
  const l = s.toLowerCase();
  if (/^1st/.test(l)) return 'EB1';
  if (/^2nd/.test(l)) return 'EB2';
  if (/^3rd/.test(l)) return 'EB3';
  if (/other workers/.test(l)) return 'EW';
  if (/^4th/.test(l)) return 'EB4';
  if (/religious/.test(l)) return 'SR';
  if (/rural/.test(l)) return 'EB5R';
  if (/high unemployment/.test(l)) return 'EB5H';
  if (/infrastructure/.test(l)) return 'EB5I';
  if (/5th/.test(l) && /unreserved|non-?regional/.test(l)) return 'EB5U';
  return s
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

/** Month from the page title ("Visa Bulletin For September 2025") or the URL. */
export function bulletinMonth(html: string, url?: string): string | null {
  const text = textOf(html.slice(0, 20000));
  const fromText =
    /visa bulletin for (january|february|march|april|may|june|july|august|september|october|november|december) (\d{4})/i.exec(
      text,
    );
  const fromUrl = url ? /visa-bulletin-for-([a-z]+)-(\d{4})/i.exec(url) : null;
  const m = fromText ?? fromUrl;
  if (!m) return null;
  const month = MONTHS.indexOf(m[1]!.toLowerCase()) + 1;
  return month > 0 ? `${m[2]}-${String(month).padStart(2, '0')}` : null;
}

/**
 * Which chart a table belongs to, from the text before it. Section headings are uppercase
 * ("A. FINAL ACTION DATES FOR ..."), while prose below them may mention either chart, so
 * uppercase headings win.
 */
function chartOf(before: string): BulletinChart | null {
  const headings = [...before.matchAll(/FINAL ACTION DATES|DATES FOR FILING/g)];
  const last = headings[headings.length - 1];
  if (last) return last[0] === 'FINAL ACTION DATES' ? 'final' : 'filing';
  const lower = before.toLowerCase();
  const finalAt = lower.lastIndexOf('final action');
  const filingAt = lower.lastIndexOf('dates for filing');
  if (finalAt < 0 && filingAt < 0) return null;
  return finalAt > filingAt ? 'final' : 'filing';
}

export interface BulletinParse {
  month: string | null;
  rows: BulletinRow[];
  problems: string[];
}

export function parseVisaBulletin(html: string, url?: string): BulletinParse {
  const month = bulletinMonth(html, url);
  const problems: string[] = [];
  if (!month)
    return {
      month: null,
      rows: [],
      problems: ['The page has no "Visa Bulletin for <month> <year>" title.'],
    };
  const rows: BulletinRow[] = [];
  for (const table of extractTables(html)) {
    const header = table.rows[0];
    if (!header || header.length < 2) continue;
    const first = header[0]!.toLowerCase();
    const preference: Preference | null = /family/.test(first)
      ? 'family'
      : /employ/.test(first)
        ? 'employment'
        : null;
    if (!preference) continue;
    const chart = chartOf(table.before);
    if (!chart) {
      problems.push(
        `Skipped a ${preference} table with no Final Action or Dates for Filing heading.`,
      );
      continue;
    }
    const countries = header.slice(1).map(normalizeCountry);
    for (const row of table.rows.slice(1)) {
      const label = row[0] ?? '';
      if (!label) continue;
      const category = normalizeCategory(label, preference);
      row.slice(1).forEach((cell, i) => {
        const country = countries[i];
        if (!country) return;
        const cutoff = parseCutoffCell(cell);
        if (cutoff) rows.push({ month, chart, preference, category, country, cutoff });
        else if (cell.trim())
          problems.push(`Could not read "${cell}" for ${category}, ${country}.`);
      });
    }
  }
  if (rows.length === 0) problems.push('No Final Action or Dates for Filing tables found.');
  return { month, rows, problems };
}
