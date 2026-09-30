// Merge parsed USCIS case JSON into existing cases.
import { today, type LocalDate } from './dates.ts';
import type { ParsedCase } from './elis.ts';
import {
  eventKey,
  type Case,
  type IdFactory,
  type Instant,
  type UscisData,
  type UscisEvent,
  type UscisNotice,
} from './model.ts';

export interface MergeSummary {
  created: string[];
  updated: { receipt: string; newEvents: number }[];
  unchanged: string[];
}

export interface MergeOptions {
  now: Instant;
  makeId: IdFactory;
  timeZone?: string;
}

const noticeKey = (n: UscisNotice) =>
  n.letterId ?? `${n.actionType ?? ''}|${n.generationDate ?? ''}|${n.appointmentDateTime ?? ''}`;

function unionEvents(a: UscisEvent[], b: UscisEvent[]): UscisEvent[] {
  const map = new Map<string, UscisEvent>();
  for (const e of [...a, ...b]) map.set(eventKey(e), e);
  return [...map.values()].sort((x, y) => x.at.localeCompare(y.at));
}

function unionNotices(a: UscisNotice[], b: UscisNotice[]): UscisNotice[] {
  const map = new Map<string, UscisNotice>();
  for (const n of [...a, ...b]) map.set(noticeKey(n), n);
  return [...map.values()];
}

/** Local filing date from the submission time, else the first event, else today. */
export function filingDate(
  parsed: ParsedCase,
  timeZone: string | undefined,
  now: Instant,
): LocalDate {
  const source = parsed.submittedAt ?? parsed.events[0]?.at ?? now;
  return today(timeZone || undefined, new Date(source));
}

function mergeUscis(
  prev: UscisData | undefined,
  p: ParsedCase,
  now: Instant,
): { uscis: UscisData; added: number } {
  const events = unionEvents(prev?.events ?? [], p.events);
  const allKeys = events.map(eventKey);
  let knownKeys: string[];
  let newKeys: string[];
  let added = 0;
  if (!prev) {
    // The first import marks nothing new.
    knownKeys = allKeys;
    newKeys = [];
  } else {
    const known = new Set(prev.knownKeys);
    const fresh = allKeys.filter((k) => !known.has(k));
    added = fresh.length;
    knownKeys = [...new Set([...prev.knownKeys, ...allKeys])];
    newKeys = [...new Set([...prev.newKeys, ...fresh])];
  }
  const uscis: UscisData = {
    lastSyncedAt: now,
    events,
    notices: unionNotices(prev?.notices ?? [], p.notices),
    knownKeys,
    newKeys,
  };
  const submittedAt = p.submittedAt ?? prev?.submittedAt;
  const updatedAt = p.updatedAt ?? prev?.updatedAt;
  const closed = p.closed ?? prev?.closed;
  const channel = p.channel ?? prev?.channel;
  const formName = p.formName ?? prev?.formName;
  if (submittedAt) uscis.submittedAt = submittedAt;
  if (updatedAt) uscis.updatedAt = updatedAt;
  if (closed !== undefined) uscis.closed = closed;
  if (channel) uscis.channel = channel;
  if (formName) uscis.formName = formName;
  return { uscis, added };
}

/** Merge by receipt number. Creates missing cases. Returns new arrays; inputs are not changed. */
export function mergeImport(
  cases: readonly Case[],
  parsed: readonly ParsedCase[],
  { now, makeId, timeZone }: MergeOptions,
): { cases: Case[]; summary: MergeSummary } {
  const summary: MergeSummary = { created: [], updated: [], unchanged: [] };
  const next = cases.map((c) => c);
  for (const p of parsed) {
    const index = next.findIndex((c) => c.receipt === p.receipt);
    const existing = index >= 0 ? next[index] : undefined;
    if (!existing) {
      const { uscis } = mergeUscis(undefined, p, now);
      next.push({
        id: makeId(),
        receipt: p.receipt,
        form: p.form ?? 'Other',
        owner: '',
        receivedDate: filingDate(p, timeZone, now),
        notes: '',
        manual: [],
        uscis,
        createdAt: now,
        updatedAt: now,
      });
      summary.created.push(p.receipt);
      continue;
    }
    const firstImport = !existing.uscis;
    const { uscis, added } = mergeUscis(existing.uscis, p, now);
    next[index] = {
      ...existing,
      form: existing.form === 'Other' && p.form ? p.form : existing.form,
      uscis,
      updatedAt: now,
    };
    if (added > 0 || firstImport) summary.updated.push({ receipt: p.receipt, newEvents: added });
    else summary.unchanged.push(p.receipt);
  }
  return { cases: next, summary };
}

/** Plain-language summary of an import for the snackbar. */
export function describeMerge(summary: MergeSummary): string {
  const parts: string[] = [];
  if (summary.created.length === 1) parts.push(`Added case ${summary.created[0]}`);
  else if (summary.created.length > 1) parts.push(`Added ${summary.created.length} cases`);
  const newEvents = summary.updated.reduce((n, u) => n + u.newEvents, 0);
  if (summary.updated.length > 0) {
    const cases =
      summary.updated.length === 1
        ? summary.updated[0]!.receipt
        : `${summary.updated.length} cases`;
    parts.push(
      newEvents > 0
        ? `${newEvents} new ${newEvents === 1 ? 'event' : 'events'} for ${cases}`
        : `Updated ${cases}`,
    );
  }
  if (summary.unchanged.length > 0 && parts.length === 0) {
    const cases =
      summary.unchanged.length === 1 ? summary.unchanged[0]! : `${summary.unchanged.length} cases`;
    parts.push(`No new events for ${cases}`);
  }
  return `${parts.join('. ')}.`;
}

export function markSeen(c: Case, now: Instant): Case {
  if (!c.uscis || c.uscis.newKeys.length === 0) return c;
  return { ...c, uscis: { ...c.uscis, newKeys: [] }, updatedAt: now };
}
