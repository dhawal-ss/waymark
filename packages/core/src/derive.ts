// Derived views of a case: current status, timeline, milestones, and summaries.
import { daysBetween, today, type LocalDate } from './dates.ts';
import { eventInfo, STATUS_CATEGORY, type EventCategory, type EventInfo } from './events.ts';
import { eventKey, type Case, type Deadline, type Id, type Instant } from './model.ts';
import { STATUSES, TONE_ORDER, type StatusKey, type Tone } from './statuses.ts';

/** Local calendar date of an instant in a time zone (device zone when empty). */
export function localDateOf(instant: Instant, timeZone?: string): LocalDate {
  return today(timeZone || undefined, new Date(instant));
}

interface Candidate {
  date: LocalDate;
  rank: number;
  order: string;
  status: StatusKey;
}

/**
 * Current status: the newest entry across manual entries and USCIS events with a known status
 * mapping. On the same day a USCIS event wins over a manual entry.
 */
export function currentStatus(c: Case, timeZone?: string): StatusKey {
  const candidates: Candidate[] = c.manual.map((m) => ({
    date: m.date,
    rank: 0,
    order: m.createdAt,
    status: m.status,
  }));
  for (const e of c.uscis?.events ?? []) {
    const status = eventInfo(e.code, e.text).status;
    if (status)
      candidates.push({ date: localDateOf(e.at, timeZone), rank: 1, order: e.at, status });
  }
  candidates.sort(
    (a, b) => a.date.localeCompare(b.date) || a.rank - b.rank || a.order.localeCompare(b.order),
  );
  return candidates[candidates.length - 1]?.status ?? 'received';
}

export function caseTone(c: Case, timeZone?: string): Tone {
  return STATUSES[currentStatus(c, timeZone)].tone;
}

export function isClosed(c: Case, timeZone?: string): boolean {
  return STATUSES[currentStatus(c, timeZone)].closed || c.uscis?.closed === true;
}

export function daysSinceFiling(c: Case, on: LocalDate): number {
  return Math.max(0, daysBetween(c.receivedDate, on));
}

export type TimelineItem =
  | {
      kind: 'uscis';
      key: string;
      code: string;
      at: Instant;
      date: LocalDate;
      day: number;
      info: EventInfo;
      isNew: boolean;
    }
  | {
      kind: 'manual';
      key: string;
      id: Id;
      date: LocalDate;
      day: number;
      status: StatusKey;
      note?: string;
      createdAt: Instant;
    };

/** Manual entries and USCIS events merged, newest first. */
export function timeline(c: Case, timeZone?: string): TimelineItem[] {
  const fresh = new Set(c.uscis?.newKeys ?? []);
  const items: TimelineItem[] = [];
  for (const e of c.uscis?.events ?? []) {
    const date = localDateOf(e.at, timeZone);
    const key = eventKey(e);
    items.push({
      kind: 'uscis',
      key,
      code: e.code,
      at: e.at,
      date,
      day: daysBetween(c.receivedDate, date),
      info: eventInfo(e.code, e.text),
      isNew: fresh.has(key),
    });
  }
  for (const m of c.manual) {
    const item: TimelineItem = {
      kind: 'manual',
      key: `manual|${m.id}`,
      id: m.id,
      date: m.date,
      day: daysBetween(c.receivedDate, m.date),
      status: m.status,
      createdAt: m.createdAt,
    };
    if (m.note) item.note = m.note;
    items.push(item);
  }
  const order = (i: TimelineItem) => (i.kind === 'uscis' ? i.at : i.createdAt);
  return items.sort(
    (a, b) =>
      b.date.localeCompare(a.date) ||
      (a.kind === b.kind ? 0 : a.kind === 'uscis' ? -1 : 1) ||
      order(b).localeCompare(order(a)),
  );
}

export function lastUscisEvent(c: Case): { code: string; at: Instant; info: EventInfo } | null {
  const events = c.uscis?.events ?? [];
  let latest = events[0];
  for (const e of events) if (latest && e.at > latest.at) latest = e;
  return latest
    ? { code: latest.code, at: latest.at, info: eventInfo(latest.code, latest.text) }
    : null;
}

export function newEventCount(c: Case): number {
  return c.uscis?.newKeys.length ?? 0;
}

export interface CaseStats {
  daysSinceLastEvent: number | null;
  events: number;
  notices: number;
}

export function caseStats(c: Case, on: LocalDate, timeZone?: string): CaseStats {
  const latest = timeline(c, timeZone)[0];
  return {
    daysSinceLastEvent: latest ? Math.max(0, daysBetween(latest.date, on)) : null,
    events: c.uscis?.events.length ?? 0,
    notices: c.uscis?.notices.length ?? 0,
  };
}

export const DAYS_PER_MONTH = 30.4375;

export function processingDays(months: number): number {
  return Math.round(months * DAYS_PER_MONTH);
}

export interface WaitPosition {
  elapsed: number;
  total: number;
  /** Days left; negative when past the processing time. */
  remaining: number;
  fraction: number;
}

export function waitPosition(
  c: Case,
  on: LocalDate,
  months = c.processingMonths,
): WaitPosition | null {
  if (!months || months <= 0) return null;
  const total = processingDays(months);
  const elapsed = daysSinceFiling(c, on);
  return { elapsed, total, remaining: total - elapsed, fraction: elapsed / total };
}

export interface Milestone {
  key: string;
  date: LocalDate;
  day: number;
  /** Position along the track, 0 to 1. */
  position: number;
  category: EventCategory;
  label: string;
}

/** Timeline items placed by time since filing, oldest first. */
export function milestones(c: Case, on: LocalDate, timeZone?: string): Milestone[] {
  const items = timeline(c, timeZone).reverse();
  const span = Math.max(
    1,
    daysSinceFiling(c, on),
    c.processingMonths ? processingDays(c.processingMonths) : 0,
    ...items.map((i) => i.day),
  );
  return items.map((i) => ({
    key: i.key,
    date: i.date,
    day: i.day,
    position: Math.min(1, Math.max(0, i.day / span)),
    category: i.kind === 'uscis' ? i.info.category : STATUS_CATEGORY[i.status],
    label: i.kind === 'uscis' ? i.info.label : STATUSES[i.status].label,
  }));
}

/** Cases list order: action, bad, progress, good; then longest wait first. */
export function sortCases(cases: readonly Case[], on: LocalDate, timeZone?: string): Case[] {
  return [...cases].sort(
    (a, b) =>
      TONE_ORDER[caseTone(a, timeZone)] - TONE_ORDER[caseTone(b, timeZone)] ||
      daysSinceFiling(b, on) - daysSinceFiling(a, on),
  );
}

export interface CasesSummary {
  inProgress: number;
  longestWait: { caseId: Id; days: number } | null;
  nextDeadline: Deadline | null;
}

export function casesSummary(
  cases: readonly Case[],
  deadlines: readonly Deadline[],
  on: LocalDate,
  timeZone?: string,
): CasesSummary {
  const open = cases.filter((c) => !isClosed(c, timeZone));
  let longestWait: CasesSummary['longestWait'] = null;
  for (const c of open) {
    const days = daysSinceFiling(c, on);
    if (!longestWait || days > longestWait.days) longestWait = { caseId: c.id, days };
  }
  const upcoming = deadlines
    .filter((d) => !d.done && d.date >= on)
    .sort((a, b) => a.date.localeCompare(b.date));
  return { inProgress: open.length, longestWait, nextDeadline: upcoming[0] ?? null };
}

/** One-line text summary for copying. */
export function caseSummaryLine(c: Case, on: LocalDate, timeZone?: string): string {
  const status = STATUSES[currentStatus(c, timeZone)].label;
  const owner = c.owner ? ` (${c.owner})` : '';
  return `${c.form} ${c.receipt}${owner}: ${status}. Day ${daysSinceFiling(c, on)} since filing on ${c.receivedDate}.`;
}
