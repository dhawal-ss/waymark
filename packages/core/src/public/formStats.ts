// Normalizer for the quarterly USCIS form data files (published as spreadsheets under
// uscis.gov/tools/reports-and-studies). Rows come from a CSV export or an XLSX reader.

export interface FormStat {
  quarter: string;
  form: string;
  office: string;
  received: number | null;
  approved: number | null;
  denied: number | null;
  pending: number | null;
}

/** RFC 4180 style CSV: quoted fields, doubled quotes, commas and newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.map((r) => r.map((c) => c.trim()));
}

/** "FY2025 Q3", "Q3 FY2025", "fy25q3", "2025 Q3" to "FY2025 Q3". */
export function parseQuarter(raw: string): string | null {
  const s = raw.toUpperCase().replace(/\s+/g, ' ');
  const m =
    /FY\s*(\d{4}|\d{2}).*?Q\s*([1-4])|Q\s*([1-4]).*?FY\s*(\d{4}|\d{2})|^(\d{4})\s*Q\s*([1-4])$/.exec(
      s,
    );
  if (!m) return null;
  const year = m[1] ?? m[4] ?? m[5];
  const q = m[2] ?? m[3] ?? m[6];
  if (!year || !q) return null;
  const full = year.length === 2 ? 2000 + Number(year) : Number(year);
  return `FY${full} Q${q}`;
}

/** Last day of a fiscal quarter. Fiscal year N runs from October N-1 to September N. */
export function quarterEndDate(quarter: string): string {
  const m = /^FY(\d{4}) Q([1-4])$/.exec(quarter);
  if (!m) throw new Error(`Not a quarter: ${quarter}`);
  const fy = Number(m[1]);
  return { '1': `${fy - 1}-12-31`, '2': `${fy}-03-31`, '3': `${fy}-06-30`, '4': `${fy}-09-30` }[
    m[2] as '1' | '2' | '3' | '4'
  ];
}

/** "I485", "i-485", "Form I-485", "I-129F" to "I-485" style. */
export function normalizeStatForm(raw: string): string | null {
  const m = /\b([A-Z])\s*-?\s*(\d{1,4}[A-Z]{0,2})\b/i.exec(raw.replace(/^form\s+/i, ''));
  return m ? `${m[1]!.toUpperCase()}-${m[2]!.toUpperCase()}` : null;
}

function number(raw: string | undefined): number | null {
  const s = (raw ?? '').replace(/[,\s]/g, '');
  if (!s || s === '-' || /^d$/i.test(s) || /^n\/?a$/i.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

const METRICS = ['received', 'approved', 'denied', 'pending'] as const;
type Metric = (typeof METRICS)[number];

function findColumn(header: string[], pattern: RegExp): number {
  return header.findIndex((h) => pattern.test(h) && !/rate|%|percent|average|median/i.test(h));
}

/**
 * Find the header row (a form column and at least two of received, approved, denied, pending),
 * then read the rows below it. Blank form cells repeat the form above (merged cells).
 */
export function normalizeFormStats(
  rows: string[][],
  quarter: string,
): { records: FormStat[]; problems: string[] } {
  const problems: string[] = [];
  const headerIndex = rows.findIndex((r) => {
    const hasForm = r.some((c) => /^form( number| type| name)?$/i.test(c));
    const metrics = METRICS.filter((m) => r.some((c) => new RegExp(`^${m}`, 'i').test(c)));
    return hasForm && metrics.length >= 2;
  });
  if (headerIndex < 0) {
    return {
      records: [],
      problems: [
        'No header row with a Form column and Received, Approved, Denied, or Pending columns.',
      ],
    };
  }
  const header = rows[headerIndex]!;
  const formCol = header.findIndex((c) => /^form( number| type)?$/i.test(c));
  const officeCol = findColumn(header, /office|center|location/i);
  const cols = Object.fromEntries(
    METRICS.map((m) => [m, findColumn(header, new RegExp(`^${m}`, 'i'))]),
  ) as Record<Metric, number>;

  const records: FormStat[] = [];
  let currentForm = '';
  for (const [i, row] of rows.slice(headerIndex + 1).entries()) {
    const formCell = row[formCol] ?? '';
    if (/total/i.test(formCell) || /total/i.test(row[officeCol] ?? '')) continue;
    if (formCell) {
      const form = normalizeStatForm(formCell);
      if (!form) {
        if (row.some((c) => /\d/.test(c)))
          problems.push(`Row ${headerIndex + i + 2}: "${formCell}" is not a form number.`);
        currentForm = '';
        continue;
      }
      currentForm = form;
    }
    if (!currentForm) continue;
    const values = Object.fromEntries(
      METRICS.map((m) => [m, cols[m] >= 0 ? number(row[cols[m]]) : null]),
    ) as Record<Metric, number | null>;
    if (METRICS.every((m) => values[m] === null)) continue;
    records.push({
      quarter,
      form: currentForm,
      office:
        officeCol >= 0 && row[officeCol] ? row[officeCol]!.replace(/\s+/g, ' ') : 'All offices',
      ...values,
    });
  }
  if (records.length === 0) problems.push('The header was found but no data rows followed it.');
  return { records, problems };
}
