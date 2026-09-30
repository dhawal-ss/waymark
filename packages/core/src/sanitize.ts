// Validate untrusted records (imports, stored data) into the typed model. Invalid records are
// dropped; invalid optional fields are removed.
import { isLocalDate } from './dates.ts';
import { toInstant } from './elis.ts';
import { FORM_TYPES, normalizeFormType, type FormType } from './forms.ts';
import {
  DEFAULT_PREFS,
  type AppData,
  type Case,
  type Cutoff,
  type Deadline,
  type Fee,
  type IdFactory,
  type Instant,
  type ManualEntry,
  type Prefs,
  type Series,
  type SeriesPoint,
  type UscisData,
  type UscisEvent,
  type UscisNotice,
  type VisaData,
} from './model.ts';
import { isValidReceipt, normalizeReceipt } from './receipt.ts';
import { isStatusKey } from './statuses.ts';

type Obj = Record<string, unknown>;
export const isObj = (v: unknown): v is Obj =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
export const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
export const asString = (v: unknown): string => (typeof v === 'string' ? v : '');
const asId = (v: unknown, makeId: IdFactory): string =>
  typeof v === 'string' && v.trim() ? v : typeof v === 'number' ? String(v) : makeId();
const asBool = (v: unknown): boolean => v === true;
const instantOr = (v: unknown, fallback: Instant): Instant => toInstant(v) ?? fallback;

export function asForm(v: unknown): FormType {
  if (typeof v === 'string' && (FORM_TYPES as readonly string[]).includes(v)) return v as FormType;
  return normalizeFormType(typeof v === 'string' ? v : '') ?? 'Other';
}

export function asMonths(v: unknown): number | undefined {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 && n < 240 ? n : undefined;
}

export function sanitizeManual(raw: unknown, makeId: IdFactory, now: Instant): ManualEntry | null {
  if (!isObj(raw) || !isLocalDate(raw.date) || !isStatusKey(raw.status)) return null;
  const entry: ManualEntry = {
    id: asId(raw.id, makeId),
    date: raw.date,
    status: raw.status,
    createdAt: instantOr(raw.createdAt, now),
  };
  const note = asString(raw.note).trim();
  if (note) entry.note = note;
  return entry;
}

function sanitizeUscis(raw: unknown, now: Instant): UscisData | undefined {
  if (!isObj(raw)) return undefined;
  const events: UscisEvent[] = [];
  for (const e of asArray(raw.events)) {
    if (!isObj(e)) continue;
    const code = asString(e.code).trim().toUpperCase();
    const at = toInstant(e.at);
    if (code && at) events.push({ code, at });
  }
  events.sort((a, b) => a.at.localeCompare(b.at));
  const notices: UscisNotice[] = asArray(raw.notices)
    .filter(isObj)
    .map((n) => {
      const out: UscisNotice = {};
      for (const k of [
        'letterId',
        'generationDate',
        'actionType',
        'appointmentDateTime',
      ] as const) {
        const v = asString(n[k]).trim();
        if (v) out[k] = v;
      }
      return out;
    });
  const keys = new Set(events.map((e) => `${e.code}|${e.at}`));
  const strings = (v: unknown) => asArray(v).filter((k): k is string => typeof k === 'string');
  const uscis: UscisData = {
    lastSyncedAt: instantOr(raw.lastSyncedAt, now),
    events,
    notices,
    knownKeys: [...new Set([...strings(raw.knownKeys), ...keys])],
    newKeys: strings(raw.newKeys).filter((k) => keys.has(k)),
  };
  const submittedAt = toInstant(raw.submittedAt);
  const updatedAt = toInstant(raw.updatedAt);
  if (submittedAt) uscis.submittedAt = submittedAt;
  if (updatedAt) uscis.updatedAt = updatedAt;
  if (typeof raw.closed === 'boolean') uscis.closed = raw.closed;
  if (asString(raw.channel)) uscis.channel = asString(raw.channel);
  if (asString(raw.formName)) uscis.formName = asString(raw.formName);
  return uscis;
}

export function sanitizeCase(raw: unknown, makeId: IdFactory, now: Instant): Case | null {
  if (!isObj(raw)) return null;
  const receipt = normalizeReceipt(asString(raw.receipt));
  if (!isValidReceipt(receipt) || !isLocalDate(raw.receivedDate)) return null;
  const c: Case = {
    id: asId(raw.id, makeId),
    receipt,
    form: asForm(raw.form),
    owner: asString(raw.owner).trim(),
    receivedDate: raw.receivedDate,
    notes: asString(raw.notes),
    manual: asArray(raw.manual)
      .map((m) => sanitizeManual(m, makeId, now))
      .filter((m): m is ManualEntry => m !== null),
    createdAt: instantOr(raw.createdAt, now),
    updatedAt: instantOr(raw.updatedAt, now),
  };
  const months = asMonths(raw.processingMonths);
  if (months) c.processingMonths = months;
  const uscis = sanitizeUscis(raw.uscis, now);
  if (uscis) c.uscis = uscis;
  if (raw.demo === true) c.demo = true;
  return c;
}

export function sanitizeDeadline(raw: unknown, makeId: IdFactory, now: Instant): Deadline | null {
  if (!isObj(raw) || !isLocalDate(raw.date)) return null;
  const title = asString(raw.title).trim();
  if (!title) return null;
  const d: Deadline = {
    id: asId(raw.id, makeId),
    title,
    date: raw.date,
    done: asBool(raw.done),
    createdAt: instantOr(raw.createdAt, now),
  };
  if (typeof raw.caseId === 'string' && raw.caseId) d.caseId = raw.caseId;
  return d;
}

export function sanitizePoint(raw: unknown): SeriesPoint | null {
  if (!isObj(raw) || !isLocalDate(raw.date)) return null;
  const value = typeof raw.value === 'string' ? Number(raw.value) : raw.value;
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? { date: raw.date, value }
    : null;
}

export function sanitizeSeries(raw: unknown, makeId: IdFactory): Series | null {
  if (!isObj(raw)) return null;
  const name = asString(raw.name).trim();
  if (!name) return null;
  const points = asArray(raw.points)
    .map(sanitizePoint)
    .filter((p): p is SeriesPoint => p !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
  return { id: asId(raw.id, makeId), name, demo: asBool(raw.demo), points };
}

export function sanitizeCutoff(raw: unknown): Cutoff | null {
  if (!isObj(raw) || typeof raw.month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(raw.month))
    return null;
  if (raw.cutoff === 'C') return { month: raw.month, cutoff: 'C' };
  return isLocalDate(raw.cutoff) ? { month: raw.month, cutoff: raw.cutoff } : null;
}

export function sanitizeVisa(raw: unknown): VisaData {
  const v = isObj(raw) ? raw : {};
  const visa: VisaData = {
    category: asString(v.category).trim(),
    cutoffs: asArray(v.cutoffs)
      .map(sanitizeCutoff)
      .filter((c): c is Cutoff => c !== null)
      .sort((a, b) => a.month.localeCompare(b.month)),
    demo: asBool(v.demo),
  };
  if (isLocalDate(v.priorityDate)) visa.priorityDate = v.priorityDate;
  return visa;
}

export function sanitizeFee(raw: unknown, makeId: IdFactory): Fee | null {
  if (!isObj(raw)) return null;
  const label = asString(raw.label).trim();
  const cents = typeof raw.cents === 'number' ? Math.round(raw.cents) : NaN;
  if (!label || !Number.isFinite(cents) || cents < 0) return null;
  return { id: asId(raw.id, makeId), label, cents };
}

const HEX = /^#[0-9a-f]{6}$/i;
const THEMES = ['system', 'light', 'dark'];

export function sanitizePrefs(raw: unknown): Prefs {
  const p = isObj(raw) ? raw : {};
  return {
    theme: THEMES.includes(p.theme as string) ? (p.theme as Prefs['theme']) : DEFAULT_PREFS.theme,
    highContrast: asBool(p.highContrast),
    seed:
      typeof p.seed === 'string' && HEX.test(p.seed) ? p.seed.toLowerCase() : DEFAULT_PREFS.seed,
    maskReceipts: asBool(p.maskReceipts),
    timeZone: typeof p.timeZone === 'string' && isTimeZone(p.timeZone) ? p.timeZone : '',
  };
}

export function isTimeZone(zone: string): boolean {
  if (!zone) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

function stringMap(raw: unknown, valid: (v: unknown) => boolean): Record<string, never> {
  const out: Record<string, unknown> = {};
  if (isObj(raw)) for (const [k, v] of Object.entries(raw)) if (valid(v)) out[k] = v;
  return out as Record<string, never>;
}

/** Validate a whole data object in the current schema. */
export function sanitizeData(raw: unknown, makeId: IdFactory, now: Instant): AppData {
  const d = isObj(raw) ? raw : {};
  const cases: Case[] = [];
  const receipts = new Set<string>();
  for (const item of asArray(d.cases)) {
    const c = sanitizeCase(item, makeId, now);
    if (c && !receipts.has(c.receipt)) {
      receipts.add(c.receipt);
      cases.push(c);
    }
  }
  const caseIds = new Set(cases.map((c) => c.id));
  const deadlines = asArray(d.deadlines)
    .map((x) => sanitizeDeadline(x, makeId, now))
    .filter((x): x is Deadline => x !== null)
    .map((x) => {
      if (x.caseId && !caseIds.has(x.caseId)) delete x.caseId;
      return x;
    });
  const checklists: Record<string, string[]> = {};
  if (isObj(d.checklists)) {
    for (const [k, v] of Object.entries(d.checklists)) {
      checklists[k] = asArray(v).filter((i): i is string => typeof i === 'string');
    }
  }
  return {
    cases,
    deadlines,
    series: asArray(d.series)
      .map((x) => sanitizeSeries(x, makeId))
      .filter((x): x is Series => x !== null),
    visa: sanitizeVisa(d.visa),
    checklists,
    sourceChecks: stringMap(d.sourceChecks, (v) => typeof v === 'string' && !!toInstant(v)),
    fees: asArray(d.fees)
      .map((x) => sanitizeFee(x, makeId))
      .filter((x): x is Fee => x !== null),
    prefs: sanitizePrefs(d.prefs),
  };
}
