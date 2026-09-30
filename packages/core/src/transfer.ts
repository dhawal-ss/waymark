// Export files, schema migrations, and import of Waymark v0.2 data.
import { isLocalDate, today, type LocalDate } from './dates.ts';
import { toInstant } from './elis.ts';
import type { AppData, IdFactory, Instant } from './model.ts';
import { normalizeReceipt } from './receipt.ts';
import {
  asArray,
  asForm,
  asMonths,
  asString,
  isObj,
  sanitizeData,
  sanitizePrefs,
} from './sanitize.ts';
import { isStatusKey } from './statuses.ts';

export const SCHEMA_VERSION = 1;
export const V02_STORAGE_KEY = 'waymark:v1';

export interface ExportFile {
  app: 'waymark';
  schema: number;
  exportedAt: Instant;
  data: AppData;
}

export function buildExport(data: AppData, now: Instant): ExportFile {
  return { app: 'waymark', schema: SCHEMA_VERSION, exportedAt: now, data };
}

/** Data migrations: MIGRATIONS[n] turns schema n data into schema n + 1. */
export const MIGRATIONS: Record<
  number,
  (data: Record<string, unknown>) => Record<string, unknown>
> = {};

export function migrateData(data: Record<string, unknown>, from: number): Record<string, unknown> {
  let current = data;
  for (let v = from; v < SCHEMA_VERSION; v++) {
    const step = MIGRATIONS[v];
    if (!step) throw new Error(`No migration from schema ${v}`);
    current = step(current);
  }
  return current;
}

export interface TransferOptions {
  now: Instant;
  makeId: IdFactory;
  timeZone?: string;
}

export type ImportResult =
  | { ok: true; data: AppData; source: 'export' | 'v0.2'; dropped: number }
  | { ok: false; error: string };

const count = (d: Record<string, unknown>) =>
  asArray(d.cases).length +
  asArray(d.deadlines).length +
  asArray(d.series).length +
  asArray(d.fees).length;

const kept = (d: AppData) => d.cases.length + d.deadlines.length + d.series.length + d.fees.length;

/** Read an export file or a v0.2 data object. Never throws. */
export function readImport(text: string, options: TransferOptions): ImportResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'The file is not valid JSON. Choose a file exported from Waymark.' };
  }
  if (!isObj(raw)) return { ok: false, error: 'The file does not contain Waymark data.' };

  if (raw.app === 'waymark') {
    const schema = typeof raw.schema === 'number' ? raw.schema : NaN;
    if (!Number.isInteger(schema) || schema < 1) {
      return { ok: false, error: 'The file has no schema version. Export it again from Waymark.' };
    }
    if (schema > SCHEMA_VERSION) {
      return {
        ok: false,
        error: `The file is from a newer version of Waymark (schema ${schema}). Update Waymark, then import it.`,
      };
    }
    const source = isObj(raw.data) ? raw.data : {};
    const data = sanitizeData(migrateData(source, schema), options.makeId, options.now);
    return { ok: true, data, source: 'export', dropped: Math.max(0, count(source) - kept(data)) };
  }

  if (Array.isArray(raw.cases)) {
    const data = migrateV02(raw, options);
    return { ok: true, data, source: 'v0.2', dropped: Math.max(0, count(raw) - kept(data)) };
  }
  return { ok: false, error: 'The file does not contain Waymark data. Choose a Waymark export.' };
}

// v0.2 stored one JSON object under localStorage "waymark:v1". Its record shapes were not
// versioned, so every field below accepts the names v0.2 is known or likely to have used.

const pick = (o: Record<string, unknown>, ...keys: string[]): unknown => {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null && o[k] !== '') return o[k];
  return undefined;
};

function dateOf(v: unknown, timeZone?: string): LocalDate | undefined {
  if (isLocalDate(v)) return v;
  const instant = toInstant(v);
  return instant ? today(timeZone || undefined, new Date(instant)) : undefined;
}

export function migrateV02(
  raw: Record<string, unknown>,
  { now, makeId, timeZone }: TransferOptions,
): AppData {
  const idMap = new Map<string, string>();
  const cases = asArray(raw.cases)
    .filter(isObj)
    .map((c) => {
      const id = asString(pick(c, 'id')) || makeId();
      const receivedDate = dateOf(
        pick(c, 'receivedDate', 'received', 'filed', 'filedDate', 'date'),
        timeZone,
      );
      const history = asArray(pick(c, 'manual', 'history', 'log', 'entries', 'timeline')).filter(
        isObj,
      );
      const manual = history
        .map((h) => ({
          id: asString(h.id) || makeId(),
          date: dateOf(pick(h, 'date', 'at', 'when'), timeZone),
          status: pick(h, 'status', 'key'),
          note: asString(pick(h, 'note', 'notes', 'text')),
          createdAt: toInstant(pick(h, 'createdAt', 'at')) ?? now,
        }))
        .filter((h) => h.date && isStatusKey(h.status));
      const status = pick(c, 'status');
      if (manual.length === 0 && isStatusKey(status) && receivedDate) {
        manual.push({ id: makeId(), date: receivedDate, status, note: '', createdAt: now });
      }
      const u = pick(c, 'uscis', 'elis', 'sync');
      const uscis = isObj(u)
        ? {
            lastSyncedAt: pick(u, 'lastSyncedAt', 'lastSync', 'syncedAt') ?? now,
            submittedAt: pick(u, 'submittedAt', 'submissionTimestamp', 'submissionDate'),
            updatedAt: pick(u, 'updatedAt', 'updatedAtTimestamp'),
            closed: u.closed,
            channel: pick(u, 'channel', 'elisChannelType'),
            formName: u.formName,
            events: asArray(u.events)
              .filter(isObj)
              .map((e) => ({
                code: pick(e, 'code', 'eventCode'),
                at: pick(e, 'at', 'createdAtTimestamp', 'eventTimestamp'),
              })),
            notices: asArray(u.notices),
            // v0.2 did not track seen events reliably: treat everything as seen.
            knownKeys: [],
            newKeys: [],
          }
        : undefined;
      if (typeof c.id === 'string') idMap.set(c.id, id);
      return {
        id,
        receipt: normalizeReceipt(asString(pick(c, 'receipt', 'receiptNumber', 'rn'))),
        form: asForm(pick(c, 'form', 'formType')),
        owner: asString(pick(c, 'owner', 'name', 'who', 'applicant')),
        receivedDate,
        processingMonths: asMonths(pick(c, 'processingMonths', 'months', 'ptMonths', 'pt')),
        notes: asString(pick(c, 'notes', 'note')),
        manual,
        uscis,
        demo: c.demo === true || c.example === true,
        createdAt: now,
        updatedAt: now,
      };
    });

  const deadlines = asArray(raw.deadlines)
    .filter(isObj)
    .map((d) => ({
      id: asString(d.id) || makeId(),
      caseId: idMap.get(asString(pick(d, 'caseId', 'case'))) ?? undefined,
      title: asString(pick(d, 'title', 'label', 'name', 'text')),
      date: dateOf(pick(d, 'date', 'due', 'when'), timeZone),
      done: d.done === true,
      createdAt: now,
    }));

  const series = asArray(raw.series)
    .filter(isObj)
    .map((s) => ({
      id: asString(s.id) || makeId(),
      name: asString(pick(s, 'name', 'label', 'title')),
      demo: s.demo === true,
      points: asArray(pick(s, 'points', 'data', 'pts')).map((p) =>
        Array.isArray(p)
          ? { date: dateOf(p[0], timeZone), value: Number(p[1]) }
          : isObj(p)
            ? {
                date: dateOf(pick(p, 'date', 'd', 'x'), timeZone),
                value: Number(pick(p, 'value', 'v', 'y', 'months')),
              }
            : null,
      ),
    }));

  const v = isObj(raw.visa) ? raw.visa : {};
  const visa = {
    priorityDate: dateOf(pick(v, 'priorityDate', 'pd', 'myDate'), timeZone),
    category: asString(pick(v, 'category', 'cat')),
    demo: v.demo === true,
    cutoffs: asArray(pick(v, 'cutoffs', 'bulletin', 'points', 'data')).map((c) => {
      if (!isObj(c)) return null;
      const month = asString(pick(c, 'month', 'm'));
      const cut = pick(c, 'cutoff', 'date', 'value');
      return {
        month: /^\d{4}-\d{2}/.test(month) ? month.slice(0, 7) : month,
        cutoff: cut === 'C' || cut === 'c' || cut === 'current' ? 'C' : dateOf(cut, timeZone),
      };
    }),
  };

  const checklists: Record<string, string[]> = {};
  if (isObj(raw.checks)) {
    for (const [list, value] of Object.entries(raw.checks)) {
      if (Array.isArray(value))
        checklists[list] = value.filter((x): x is string => typeof x === 'string');
      else if (isObj(value)) checklists[list] = Object.keys(value).filter((k) => value[k] === true);
    }
  }

  const sourceChecks: Record<string, string> = {};
  if (isObj(raw.srcChecked)) {
    for (const [id, when] of Object.entries(raw.srcChecked)) {
      const instant = toInstant(when);
      if (instant) sourceChecks[id] = instant;
    }
  }

  const fees = asArray(raw.fees)
    .filter(isObj)
    .map((f) => {
      const cents = pick(f, 'cents');
      const dollars = Number(pick(f, 'amount', 'fee', 'value'));
      return {
        id: asString(f.id) || makeId(),
        label: asString(pick(f, 'label', 'name', 'form')),
        cents:
          typeof cents === 'number'
            ? cents
            : Number.isFinite(dollars)
              ? Math.round(dollars * 100)
              : NaN,
      };
    });

  const p = isObj(raw.prefs) ? raw.prefs : {};
  const prefs = sanitizePrefs({
    theme: pick(p, 'theme'),
    highContrast: pick(p, 'highContrast', 'hc', 'contrast') === true,
    seed: pick(p, 'seed', 'color', 'accent'),
    maskReceipts: pick(p, 'maskReceipts', 'mask') === true,
    timeZone: pick(p, 'timeZone', 'tz'),
  });

  return sanitizeData(
    { cases, deadlines, series, visa, checklists, sourceChecks, fees, prefs },
    makeId,
    now,
  );
}
