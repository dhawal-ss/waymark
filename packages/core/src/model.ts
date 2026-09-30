// Typed domain model. Dates are local YYYY-MM-DD strings; USCIS timestamps are ISO instants.
import type { LocalDate } from './dates.ts';
import type { FormType } from './forms.ts';
import type { StatusKey } from './statuses.ts';

export type Id = string;
/** ISO 8601 instant, for example 2024-03-15T14:22:05.000Z. */
export type Instant = string;

export interface ManualEntry {
  id: Id;
  date: LocalDate;
  status: StatusKey;
  note?: string;
  createdAt: Instant;
}

export interface UscisEvent {
  code: string;
  at: Instant;
  /** Status text for events from the official Case Status API (codes starting with "CS:"). */
  text?: string;
}

export interface UscisNotice {
  letterId?: string;
  generationDate?: string;
  actionType?: string;
  appointmentDateTime?: string;
}

export interface UscisData {
  lastSyncedAt: Instant;
  submittedAt?: Instant;
  updatedAt?: Instant;
  closed?: boolean;
  channel?: string;
  formName?: string;
  events: UscisEvent[];
  notices: UscisNotice[];
  /** Event keys seen in any import. */
  knownKeys: string[];
  /** Event keys first seen after the first import and not yet marked seen. */
  newKeys: string[];
}

export interface Case {
  id: Id;
  receipt: string;
  form: FormType;
  owner: string;
  receivedDate: LocalDate;
  /** Published processing time in months, entered by the user. */
  processingMonths?: number;
  notes: string;
  manual: ManualEntry[];
  uscis?: UscisData;
  /** Set while the optional sync server tracks this case through the official API. */
  serverTracking?: { subscriptionId: string; since: Instant };
  demo?: boolean;
  createdAt: Instant;
  updatedAt: Instant;
}

export interface Deadline {
  id: Id;
  caseId?: Id;
  title: string;
  date: LocalDate;
  done: boolean;
  createdAt: Instant;
}

export interface SeriesPoint {
  date: LocalDate;
  value: number;
}

export interface Series {
  id: Id;
  name: string;
  demo: boolean;
  points: SeriesPoint[];
}

/** A Visa Bulletin cutoff for one month. `cutoff` is a date or "C" for current. */
export interface Cutoff {
  month: string;
  cutoff: LocalDate | 'C';
}

export interface VisaData {
  priorityDate?: LocalDate;
  category: string;
  cutoffs: Cutoff[];
  demo: boolean;
}

export interface Fee {
  id: Id;
  label: string;
  cents: number;
}

export type ThemeMode = 'system' | 'light' | 'dark';

export interface Prefs {
  theme: ThemeMode;
  highContrast: boolean;
  seed: string;
  maskReceipts: boolean;
  /** IANA time zone override. Empty uses the device zone. */
  timeZone: string;
}

export interface AppData {
  cases: Case[];
  deadlines: Deadline[];
  series: Series[];
  visa: VisaData;
  /** Checked checklist item ids, keyed by checklist id. */
  checklists: Record<string, string[]>;
  /** Last "Mark as checked" time per source id. */
  sourceChecks: Record<string, Instant>;
  fees: Fee[];
  prefs: Prefs;
}

export const DEFAULT_PREFS: Prefs = {
  theme: 'system',
  highContrast: false,
  seed: '#14b8a6',
  maskReceipts: false,
  timeZone: '',
};

export function emptyData(): AppData {
  return {
    cases: [],
    deadlines: [],
    series: [],
    visa: { category: '', cutoffs: [], demo: false },
    checklists: {},
    sourceChecks: {},
    fees: [],
    prefs: { ...DEFAULT_PREFS },
  };
}

export type IdFactory = () => Id;

export const eventKey = (e: UscisEvent): string => `${e.code}|${e.at}`;
