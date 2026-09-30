// Validate untrusted records (imports, stored data) into the typed model. Invalid records are
// dropped; invalid optional fields are removed.
import { isLocalDate } from './dates.ts';
import { toInstant, type ParsedCase } from './elis.ts';
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
// Ids end up in URLs (#/case/<id>) and as keyed-list keys, so keep them short and plain.
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const asId = (v: unknown, makeId: IdFactory): string => {
  const id = typeof v === 'number' && Number.isFinite(v) ? String(v) : v;
  return typeof id === 'string' && ID.test(id) ? id : makeId();
};
/** Text limited to a sane length, so a crafted import cannot bloat storage. */
const text = (v: unknown, max: number): string => asString(v).slice(0, max);
// Keys that must never be copied from untrusted objects into plain objects.
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/** Give every record in a collection a distinct id, replacing repeats with fresh ones. */
function uniqueIds<T extends { id: string }>(items: T[], makeId: IdFactory): T[] {
  const seen = new Set<string>();
  for (const item of items) {
    while (seen.has(item.id)) item.id = makeId();
    seen.add(item.id);
  }
  return items;
}
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
  const note = text(raw.note, 2000).trim();
  if (note) entry.note = note;
  return entry;
}

function sanitizeEvents(raw: unknown): UscisEvent[] {
  const events: UscisEvent[] = [];
  const seen = new Set<string>();
  for (const e of asArray(raw).slice(0, 5000)) {
    if (!isObj(e)) continue;
    const code = text(e.code, 40).trim().toUpperCase();
    const at = toInstant(e.at);
    const label = text(e.text, 200).trim();
    const key = `${code}|${at}`;
    if (!code || !at || seen.has(key)) continue;
    seen.add(key);
    events.push(label ? { code, at, text: label } : { code, at });
  }
  return events.sort((a, b) => a.at.localeCompare(b.at));
}

function sanitizeNotices(raw: unknown): UscisNotice[] {
  return asArray(raw)
    .slice(0, 500)
    .filter(isObj)
    .map((n) => {
      const out: UscisNotice = {};
      for (const k of [
        'letterId',
        'generationDate',
        'actionType',
        'appointmentDateTime',
      ] as const) {
        // Dates are stored as instants so every view reads them the same way.
        const v =
          k === 'generationDate' || k === 'appointmentDateTime'
            ? toInstant(n[k])
            : text(n[k], 200).trim();
        if (v) out[k] = v;
      }
      return out;
    });
}

function sanitizeUscis(raw: unknown, now: Instant): UscisData | undefined {
  if (!isObj(raw)) return undefined;
  const events = sanitizeEvents(raw.events);
  const notices = sanitizeNotices(raw.notices);
  const keys = new Set(events.map((e) => `${e.code}|${e.at}`));
  const strings = (v: unknown) =>
    asArray(v)
      .slice(0, 5000)
      .filter((k): k is string => typeof k === 'string' && k.length <= 300);
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
  if (asString(raw.channel)) uscis.channel = text(raw.channel, 40);
  if (asString(raw.formName)) uscis.formName = text(raw.formName, 200);
  return uscis;
}

/**
 * Validate a parsed case that did not come from this device's own parser, such as a sync server
 * response. Returns null when the receipt is not valid.
 */
export function sanitizeParsedCase(raw: unknown): ParsedCase | null {
  if (!isObj(raw)) return null;
  const receipt = normalizeReceipt(asString(raw.receipt));
  if (!isValidReceipt(receipt)) return null;
  const parsed: ParsedCase = {
    receipt,
    form: raw.form == null || raw.form === '' ? null : asForm(raw.form),
    events: sanitizeEvents(raw.events),
    notices: sanitizeNotices(raw.notices),
  };
  const submittedAt = toInstant(raw.submittedAt);
  const updatedAt = toInstant(raw.updatedAt);
  if (submittedAt) parsed.submittedAt = submittedAt;
  if (updatedAt) parsed.updatedAt = updatedAt;
  if (typeof raw.closed === 'boolean') parsed.closed = raw.closed;
  if (asString(raw.channel)) parsed.channel = text(raw.channel, 40);
  if (asString(raw.formName)) parsed.formName = text(raw.formName, 200);
  return parsed;
}

export const SUBSCRIPTION_ID = /^sub_[A-Za-z0-9_-]{1,64}$/;

export function sanitizeCase(raw: unknown, makeId: IdFactory, now: Instant): Case | null {
  if (!isObj(raw)) return null;
  const receipt = normalizeReceipt(asString(raw.receipt));
  if (!isValidReceipt(receipt) || !isLocalDate(raw.receivedDate)) return null;
  const c: Case = {
    id: asId(raw.id, makeId),
    receipt,
    form: asForm(raw.form),
    owner: text(raw.owner, 200).trim(),
    receivedDate: raw.receivedDate,
    notes: text(raw.notes, 20000),
    manual: uniqueIds(
      asArray(raw.manual)
        .map((m) => sanitizeManual(m, makeId, now))
        .filter((m): m is ManualEntry => m !== null),
      makeId,
    ),
    createdAt: instantOr(raw.createdAt, now),
    updatedAt: instantOr(raw.updatedAt, now),
  };
  const months = asMonths(raw.processingMonths);
  if (months) c.processingMonths = months;
  const uscis = sanitizeUscis(raw.uscis, now);
  if (uscis) c.uscis = uscis;
  if (
    isObj(raw.serverTracking) &&
    typeof raw.serverTracking.subscriptionId === 'string' &&
    SUBSCRIPTION_ID.test(raw.serverTracking.subscriptionId)
  ) {
    c.serverTracking = {
      subscriptionId: raw.serverTracking.subscriptionId,
      since: instantOr(raw.serverTracking.since, now),
    };
  }
  if (raw.demo === true) c.demo = true;
  return c;
}

export function sanitizeDeadline(raw: unknown, makeId: IdFactory, now: Instant): Deadline | null {
  if (!isObj(raw) || !isLocalDate(raw.date)) return null;
  const title = text(raw.title, 200).trim();
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
  const series: Series = { id: asId(raw.id, makeId), name, demo: asBool(raw.demo), points };
  const src = raw.source;
  if (isObj(src) && src.kind === 'processing-times' && asString(src.form) && asString(src.office)) {
    series.source = {
      kind: 'processing-times',
      form: asString(src.form),
      office: asString(src.office),
      subtype: asString(src.subtype),
      label: asString(src.label),
      updatedAt: toInstant(src.updatedAt) ?? new Date(0).toISOString(),
    };
  }
  return series;
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
  const src = v.source;
  if (
    isObj(src) &&
    src.kind === 'visa-bulletin' &&
    (src.chart === 'final' || src.chart === 'filing') &&
    (src.preference === 'family' || src.preference === 'employment') &&
    asString(src.category) &&
    asString(src.country)
  ) {
    visa.source = {
      kind: 'visa-bulletin',
      chart: src.chart,
      preference: src.preference,
      category: asString(src.category),
      country: asString(src.country),
      updatedAt: toInstant(src.updatedAt) ?? new Date(0).toISOString(),
    };
  }
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
    publicData: asBool(p.publicData),
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
  if (isObj(raw))
    for (const [k, v] of Object.entries(raw)) if (!UNSAFE_KEYS.has(k) && valid(v)) out[k] = v;
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
  uniqueIds(cases, makeId);
  const caseIds = new Set(cases.map((c) => c.id));
  const deadlines = uniqueIds(
    asArray(d.deadlines)
      .map((x) => sanitizeDeadline(x, makeId, now))
      .filter((x): x is Deadline => x !== null),
    makeId,
  ).map((x) => {
    if (x.caseId && !caseIds.has(x.caseId)) delete x.caseId;
    return x;
  });
  const checklists: Record<string, string[]> = {};
  if (isObj(d.checklists)) {
    for (const [k, v] of Object.entries(d.checklists)) {
      if (!/^[a-z0-9-]{1,64}$/.test(k)) continue;
      checklists[k] = asArray(v).filter(
        (i): i is string => typeof i === 'string' && i.length <= 100,
      );
    }
  }
  return {
    cases,
    deadlines,
    series: uniqueIds(
      asArray(d.series)
        .map((x) => sanitizeSeries(x, makeId))
        .filter((x): x is Series => x !== null),
      makeId,
    ),
    visa: sanitizeVisa(d.visa),
    checklists,
    sourceChecks: stringMap(d.sourceChecks, (v) => typeof v === 'string' && !!toInstant(v)),
    fees: uniqueIds(
      asArray(d.fees)
        .map((x) => sanitizeFee(x, makeId))
        .filter((x): x is Fee => x !== null),
      makeId,
    ),
    prefs: sanitizePrefs(d.prefs),
  };
}
