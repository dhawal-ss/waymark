// Domain actions. Each one changes data through mutate so it persists and, when destructive,
// offers undo.
import {
  buildIcs,
  describeMerge,
  exampleData,
  markSeen,
  mergeImport,
  parseUscisJson,
  readImport,
  emptyData,
  type AppData,
  type Case,
  type Deadline,
  type FormType,
  type LocalDate,
  type MergeSummary,
  type ParseResult,
  type ParsedCase,
  type StatusKey,
  STATUSES,
} from '@waymark/core';
import { mutate, newId, nowInstant, replaceAll, store, tz } from './stores/data.svelte';
import { downloadFile } from './download';
import { clock } from './stores/clock.svelte';
import { showSnackbar } from './stores/snackbar.svelte';

/** Today's local date. Reactive: it changes at midnight and when the time zone setting changes. */
export const todayLocal = (): LocalDate => clock.day;

export interface CaseInput {
  receipt: string;
  form: FormType;
  owner: string;
  receivedDate: LocalDate;
  status: StatusKey;
  processingMonths?: number;
}

export function addCase(input: CaseInput): Case {
  const now = nowInstant();
  const c: Case = {
    id: newId(),
    receipt: input.receipt,
    form: input.form,
    owner: input.owner.trim(),
    receivedDate: input.receivedDate,
    notes: '',
    manual: [{ id: newId(), date: input.receivedDate, status: input.status, createdAt: now }],
    createdAt: now,
    updatedAt: now,
  };
  if (input.processingMonths) c.processingMonths = input.processingMonths;
  mutate((d) => d.cases.push(c), { message: `Added case ${c.receipt}.` });
  return c;
}

export function updateCase(id: string, patch: Partial<Omit<Case, 'id'>>, message?: string): void {
  mutate(
    (d) => {
      const c = d.cases.find((x) => x.id === id);
      if (!c) return;
      Object.assign(c, patch, { updatedAt: nowInstant() });
      if ('processingMonths' in patch && !patch.processingMonths) delete c.processingMonths;
    },
    message ? { message } : {},
  );
}

export function deleteCase(id: string): void {
  const c = store.data.cases.find((x) => x.id === id);
  if (!c) return;
  mutate(
    (d) => {
      d.cases = d.cases.filter((x) => x.id !== id);
      d.deadlines = d.deadlines.filter((x) => x.caseId !== id);
    },
    { undo: `Deleted case ${c.receipt}.` },
  );
}

export function logStatus(caseId: string, status: StatusKey, date: LocalDate, note = ''): void {
  mutate(
    (d) => {
      const c = d.cases.find((x) => x.id === caseId);
      if (!c) return;
      const entry = {
        id: newId(),
        date,
        status,
        createdAt: nowInstant(),
      } as Case['manual'][number];
      if (note.trim()) entry.note = note.trim();
      c.manual.push(entry);
      c.updatedAt = nowInstant();
    },
    { undo: `Logged: ${STATUSES[status].label}.` },
  );
}

export function deleteManualEntry(caseId: string, entryId: string): void {
  mutate(
    (d) => {
      const c = d.cases.find((x) => x.id === caseId);
      if (c) c.manual = c.manual.filter((m) => m.id !== entryId);
    },
    { undo: 'Deleted the entry.' },
  );
}

export function markCaseSeen(caseId: string): void {
  mutate((d) => {
    const i = d.cases.findIndex((x) => x.id === caseId);
    if (i >= 0) d.cases[i] = markSeen(d.cases[i]!, nowInstant());
  });
}

export interface ImportOutcome {
  ok: boolean;
  parse: ParseResult;
  message: string;
}

/** Parse USCIS case JSON and merge it. Reports problems without changing data on failure. */
export function importUscis(text: string): ImportOutcome {
  const parse = parseUscisJson(text);
  if (parse.cases.length === 0) {
    return { ok: false, parse, message: parse.problems[0] ?? 'No cases found in the JSON.' };
  }
  let message = '';
  mutate(
    (d) => {
      const { cases, summary } = mergeImport(d.cases, parse.cases, {
        now: nowInstant(),
        makeId: newId,
        timeZone: tz(),
      });
      d.cases = cases;
      message = describeMerge(summary);
    },
    { undo: () => message },
  );
  return { ok: true, parse, message };
}

/**
 * Merge cases from the sync server. Only receipts that exist locally are merged, so deleting a
 * case here is never undone by the server. Returns the summary, or null when nothing matched.
 */
export function mergeFromServer(parsed: ParsedCase[]): MergeSummary | null {
  const local = new Set(store.data.cases.map((c) => c.receipt));
  const known = parsed.filter((p) => local.has(p.receipt));
  if (known.length === 0) return null;
  let summary: MergeSummary | null = null;
  mutate((d) => {
    const result = mergeImport(d.cases, known, {
      now: nowInstant(),
      makeId: newId,
      timeZone: tz(),
    });
    d.cases = result.cases;
    summary = result.summary;
  });
  return summary;
}

export function addDeadline(input: { title: string; date: LocalDate; caseId?: string }): void {
  const d: Deadline = {
    id: newId(),
    title: input.title.trim(),
    date: input.date,
    done: false,
    createdAt: nowInstant(),
  };
  if (input.caseId) d.caseId = input.caseId;
  mutate((data) => data.deadlines.push(d), { message: `Added deadline: ${d.title}.` });
}

export function updateDeadline(id: string, patch: Partial<Omit<Deadline, 'id'>>): void {
  mutate((data) => {
    const d = data.deadlines.find((x) => x.id === id);
    if (!d) return;
    Object.assign(d, patch);
    if ('caseId' in patch && !patch.caseId) delete d.caseId;
  });
}

export function deleteDeadline(id: string): void {
  const d = store.data.deadlines.find((x) => x.id === id);
  if (!d) return;
  mutate((data) => (data.deadlines = data.deadlines.filter((x) => x.id !== id)), {
    undo: `Deleted deadline: ${d.title}.`,
  });
}

export function loadExample(): void {
  const demo = exampleData(todayLocal(), newId, nowInstant());
  const existing = new Set(store.data.cases.map((c) => c.receipt));
  mutate(
    (d) => {
      d.cases.push(...demo.cases.filter((c) => !existing.has(c.receipt)));
      d.deadlines.push(...demo.deadlines);
      if (!d.series.some((s) => s.demo)) d.series.push(...demo.series);
      if (!d.visa.priorityDate && d.visa.cutoffs.length === 0) d.visa = demo.visa;
    },
    { undo: 'Loaded example data. It is labeled demo.' },
  );
}

export function removeExample(): void {
  mutate(
    (d) => {
      const demoIds = new Set(d.cases.filter((c) => c.demo).map((c) => c.id));
      d.cases = d.cases.filter((c) => !c.demo);
      d.deadlines = d.deadlines.filter((x) => !x.caseId || !demoIds.has(x.caseId));
      d.series = d.series.filter((s) => !s.demo);
      if (d.visa.demo) d.visa = emptyData().visa;
    },
    { undo: 'Removed example data.' },
  );
}

export function importDataFile(text: string): { ok: boolean; message: string } {
  const result = readImport(text, { now: nowInstant(), makeId: newId, timeZone: tz() });
  if (!result.ok) return { ok: false, message: result.error };
  const counts = `${result.data.cases.length} ${result.data.cases.length === 1 ? 'case' : 'cases'}`;
  const dropped =
    result.dropped > 0
      ? ` Skipped ${result.dropped} invalid ${result.dropped === 1 ? 'record' : 'records'}.`
      : '';
  const source = result.source === 'v0.2' ? ' from Waymark v0.2' : '';
  replaceAll(result.data as AppData, { undo: `Imported ${counts}${source}.${dropped}` });
  return { ok: true, message: '' };
}

export function deleteEverything(): void {
  const prefs = { ...store.data.prefs };
  replaceAll({ ...emptyData(), prefs }, { undo: 'Deleted all cases and data.' });
}

export async function copyText(text: string, done: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    showSnackbar(done);
  } catch {
    showSnackbar('Copying was blocked by the browser. Select the text and copy it manually.');
  }
}

/** Save deadlines as a calendar file (all-day events with a reminder the day before). */
export function exportDeadlinesToCalendar(
  deadlines: readonly Deadline[],
  filename = 'waymark-deadlines.ics',
): void {
  const events = deadlines.map((d) => {
    const c = d.caseId ? store.data.cases.find((x) => x.id === d.caseId) : undefined;
    return {
      uid: `${d.id}@waymark`,
      date: d.date,
      title: d.title,
      ...(c ? { description: `${c.form} ${c.receipt}${c.owner ? `, ${c.owner}` : ''}` } : {}),
    };
  });
  downloadFile(filename, buildIcs(events, nowInstant()), 'text/calendar');
  showSnackbar(
    events.length === 1
      ? 'Saved a calendar file. Open it to add the event.'
      : `Saved ${events.length} events as a calendar file. Open it to add them.`,
  );
}

/** Add an appointment from a USCIS notice as a deadline of its case. */
export function addAppointmentDeadline(caseId: string, title: string, date: LocalDate): void {
  const d: Deadline = { id: newId(), caseId, title, date, done: false, createdAt: nowInstant() };
  mutate((data) => data.deadlines.push(d), { undo: `Added deadline: ${title}.` });
}
