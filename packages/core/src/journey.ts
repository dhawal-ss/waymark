// Derived analytics of a case's history: stage runs, notice versus background activity, and events
// per month. Pure functions over the case, like derive.ts.
import { addMonths, daysBetween, isLocalDate, type LocalDate } from './dates.ts';
import { isClosed, localDateOf } from './derive.ts';
import { eventInfo, STATUS_CATEGORY, type EventCategory, type EventInfo } from './events.ts';
import {
  explainEvent,
  isOfficialEvent,
  PIPELINE_STAGES,
  type EventSignal,
  type PipelineStage,
} from './explain.ts';
import type { Case, Instant } from './model.ts';
import { STATUSES } from './statuses.ts';

export interface StageRun {
  stage: PipelineStage;
  /** First day of the run. */
  from: LocalDate;
  /** The day the next stage began, or today for the current stage. */
  to: LocalDate;
  days: number;
  /** True for the current stage of an open case. */
  open: boolean;
}

interface DatedEvent {
  at: Instant;
  date: LocalDate;
  info: EventInfo;
  signal: EventSignal;
  official: boolean;
}

/** Date of an instant in the zone, or null when the instant is not a valid date. */
function safeDate(instant: Instant, timeZone?: string): LocalDate | null {
  if (Number.isNaN(new Date(instant).getTime())) return null;
  const date = localDateOf(instant, timeZone);
  return isLocalDate(date) ? date : null;
}

/** USCIS events with a valid date, oldest first. Events without a date are left out. */
function datedEvents(c: Case, timeZone?: string): DatedEvent[] {
  const out: DatedEvent[] = [];
  for (const e of c.uscis?.events ?? []) {
    const date = safeDate(e.at, timeZone);
    if (!date) continue;
    const info = eventInfo(e.code, e.text);
    out.push({
      at: e.at,
      date,
      info,
      signal: explainEvent(info).signal,
      official: isOfficialEvent(info),
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.at.localeCompare(b.at));
}

interface Step {
  date: LocalDate;
  rank: number;
  order: string;
  stage: PipelineStage | null;
}

/**
 * The path of a case through the stages: consecutive events in the same stage form one run, and a
 * run ends the day a different stage begins. USCIS events and manual entries both count, ordered by
 * date (a USCIS event follows a manual entry on the same day). Unrecognized events and statuses
 * without a stage ("Other update") do not start a stage. The current stage of an open case runs to
 * `on`. When the case is closed the last run ends on the last dated event instead, because the case
 * is no longer moving.
 */
export function caseJourney(c: Case, on: LocalDate, timeZone?: string): StageRun[] {
  const steps: Step[] = [];
  for (const e of datedEvents(c, timeZone)) {
    steps.push({
      date: e.date,
      rank: 1,
      order: e.at,
      stage: e.info.category === 'unknown' ? null : explainEvent(e.info).stage,
    });
  }
  for (const m of c.manual) {
    if (!isLocalDate(m.date)) continue;
    const category = STATUS_CATEGORY[m.status];
    const info: EventInfo = {
      code: '',
      label: STATUSES[m.status].label,
      category,
      status: m.status,
    };
    steps.push({
      date: m.date,
      rank: 0,
      order: m.createdAt,
      stage: category === 'unknown' ? null : explainEvent(info).stage,
    });
  }
  steps.sort(
    (a, b) => a.date.localeCompare(b.date) || a.rank - b.rank || a.order.localeCompare(b.order),
  );

  const runs: { stage: PipelineStage; from: LocalDate }[] = [];
  for (const s of steps) {
    if (!s.stage) continue;
    if (runs[runs.length - 1]?.stage !== s.stage) runs.push({ stage: s.stage, from: s.date });
  }
  const last = runs[runs.length - 1];
  if (!last) return [];

  const lastDate = steps[steps.length - 1]?.date ?? last.from;
  // Events without a valid date would break the status calculation, so it sees only dated ones.
  const dated: Case = c.uscis
    ? {
        ...c,
        uscis: { ...c.uscis, events: c.uscis.events.filter((e) => safeDate(e.at, timeZone)) },
      }
    : c;
  const closed = isClosed(dated, timeZone);
  const out: StageRun[] = [];
  runs.forEach((run, i) => {
    const next = runs[i + 1];
    const isLast = i === runs.length - 1;
    const end = next ? next.from : closed ? lastDate : on < run.from ? run.from : on;
    out.push({
      stage: run.stage,
      from: run.from,
      to: end,
      days: Math.max(0, daysBetween(run.from, end)),
      open: isLast && !closed,
    });
  });
  return out;
}

export interface ActivityBreakdown {
  /** USCIS events with a valid date. Manual entries are not counted. */
  total: number;
  bySignal: Record<EventSignal, number>;
  byCategory: Record<EventCategory, number>;
  /** Events from the official Case Status API, which lists visible status changes only. */
  official: number;
}

const CATEGORIES: EventCategory[] = [
  'receipt',
  'checks',
  'interview',
  'processing',
  'hold',
  'approved',
  'card',
  'evidence',
  'denied',
  'closed',
  'unknown',
];

/** Counts of USCIS events by signal (notice or background) and by category. */
export function activityBreakdown(c: Case, timeZone?: string): ActivityBreakdown {
  const byCategory = Object.fromEntries(CATEGORIES.map((k) => [k, 0])) as Record<
    EventCategory,
    number
  >;
  const bySignal: Record<EventSignal, number> = { notice: 0, silent: 0 };
  let official = 0;
  const events = datedEvents(c, timeZone);
  for (const e of events) {
    bySignal[e.signal] += 1;
    byCategory[e.info.category] += 1;
    if (e.official) official += 1;
  }
  return { total: events.length, bySignal, byCategory, official };
}

export interface SilentSinceNotice {
  /** Background events after the last notice. All background events when there is no notice. */
  count: number;
  lastNoticeDate: LocalDate | null;
}

/** Background events recorded after the most recent notice event. */
export function silentSinceLastNotice(c: Case, timeZone?: string): SilentSinceNotice {
  const events = datedEvents(c, timeZone);
  let lastNotice = -1;
  events.forEach((e, i) => {
    if (e.signal === 'notice') lastNotice = i;
  });
  const count = events.slice(lastNotice + 1).filter((e) => e.signal === 'silent').length;
  return { count, lastNoticeDate: lastNotice >= 0 ? (events[lastNotice]?.date ?? null) : null };
}

export interface MonthActivity {
  /** YYYY-MM */
  month: string;
  notice: number;
  silent: number;
}

/** USCIS events per month, with empty months filled between the first and the last event. */
export function eventsPerMonth(c: Case, timeZone?: string): MonthActivity[] {
  const events = datedEvents(c, timeZone);
  const first = events[0];
  const last = events[events.length - 1];
  if (!first || !last) return [];
  const counts = new Map<string, MonthActivity>();
  const lastMonth = last.date.slice(0, 7);
  let month = first.date.slice(0, 7);
  for (let guard = 0; guard < 2400; guard++) {
    counts.set(month, { month, notice: 0, silent: 0 });
    if (month >= lastMonth) break;
    month = addMonths(`${month}-01`, 1).slice(0, 7);
  }
  for (const e of events) {
    const row = counts.get(e.date.slice(0, 7));
    if (row) row[e.signal === 'notice' ? 'notice' : 'silent'] += 1;
  }
  return [...counts.values()];
}

/** Total days per stage across all runs, in pipeline order. Stages never reached are left out. */
export function daysByStage(runs: readonly StageRun[]): { stage: PipelineStage; days: number }[] {
  return PIPELINE_STAGES.flatMap((stage) => {
    const mine = runs.filter((r) => r.stage === stage);
    return mine.length > 0 ? [{ stage, days: mine.reduce((sum, r) => sum + r.days, 0) }] : [];
  });
}
