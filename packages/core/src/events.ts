// USCIS ELIS event codes, as documented by the community. Unofficial: USCIS does not publish
// these meanings. Unknown codes are shown as "Unrecognized event" with the raw code.
import { OFFICIAL_CODE_PREFIX, officialStatusKey } from './official.ts';
import type { StatusKey } from './statuses.ts';

export type EventCategory =
  | 'receipt'
  | 'checks'
  | 'interview'
  | 'processing'
  | 'hold'
  | 'approved'
  | 'card'
  | 'evidence'
  | 'denied'
  | 'closed'
  | 'unknown';

export interface EventInfo {
  code: string;
  label: string;
  category: EventCategory;
  /** Status this event moves the case to. Absent for events that do not change status. */
  status?: StatusKey;
}

export const CATEGORY_LABELS: Record<EventCategory, string> = {
  receipt: 'Receipt',
  checks: 'Checks',
  interview: 'Interview',
  processing: 'Processing',
  hold: 'Hold',
  approved: 'Approved',
  card: 'Card',
  evidence: 'Evidence',
  denied: 'Denied',
  closed: 'Closed',
  unknown: 'Unrecognized',
};

const DICTIONARY: Record<string, Omit<EventInfo, 'code'>> = {};

function add(codes: string[], label: string, category: EventCategory, status?: StatusKey) {
  for (const code of codes)
    DICTIONARY[code] = status ? { label, category, status } : { label, category };
}

add(['IAF', 'IAA', 'IAAA', 'IAB', 'IAC', 'IAD', 'AALB'], 'Case received', 'receipt', 'received');
add(
  ['FTA0', 'FTA1', 'FSA0', 'FN', 'FNB', 'FNC', 'FNG', 'FNH', 'QAA', 'QAB', 'QAE', 'HC'],
  'Background or security check',
  'checks',
  'review',
);
add(['FNA'], 'Biometrics appointment', 'checks', 'biometrics');
add(['FI', 'FJ', 'FM', 'IM'], 'Interview scheduled', 'interview', 'interview');
add(['FH', 'FHB', 'FL', 'HG', 'FKA', 'FKB'], 'Interview related update', 'interview', 'review');
add(['FT0', 'TA', 'FR', 'FT'], 'Case processing update', 'processing', 'review');
add(
  ['FS', 'KA', 'KBA', 'KBB', 'KC', 'KDA', 'FLS', 'FLR'],
  'Case on hold or pending review',
  'hold',
  'review',
);
add(['DA', 'DH', 'IEA', 'IEE', 'IEC', 'H008'], 'Case approved', 'approved', 'approved');
add(['LAA', 'LDA', 'MO'], 'Card being produced', 'card', 'card_prod');
add(['LEA'], 'Card mailed', 'card', 'card_mailed');
add(['IKA', 'FBA', 'FBB', 'IK'], 'Evidence requested', 'evidence', 'rfe');
add(['HA'], 'Evidence response received', 'evidence', 'rfe_resp');
add(['FE', 'II'], 'Notice of intent to deny', 'evidence', 'noid');
add(['EA', 'IFA'], 'Case denied', 'denied', 'denied');
add(['EX', 'EN', 'EZ'], 'Case closed', 'closed');

/** Category for a status, used for manual entries and official API statuses. */
export const STATUS_CATEGORY: Record<StatusKey, EventCategory> = {
  received: 'receipt',
  rfe: 'evidence',
  rfe_resp: 'evidence',
  biometrics: 'checks',
  review: 'processing',
  interview: 'interview',
  transferred: 'processing',
  approved: 'approved',
  card_prod: 'card',
  card_mailed: 'card',
  delivered: 'card',
  denied: 'denied',
  noid: 'evidence',
  other: 'unknown',
};

/** Meaning of an event. Official API events (code "CS:...") are described by their status text. */
export function eventInfo(code: string, text?: string): EventInfo {
  const key = code.trim().toUpperCase();
  if (key.startsWith(OFFICIAL_CODE_PREFIX)) {
    const label =
      text?.trim() || key.slice(OFFICIAL_CODE_PREFIX.length).replace(/_/g, ' ').toLowerCase();
    const status = officialStatusKey(label);
    return status
      ? { code: key, label, category: STATUS_CATEGORY[status], status }
      : { code: key, label, category: 'unknown' };
  }
  const known = DICTIONARY[key];
  return known
    ? { code: key, ...known }
    : { code: key, label: 'Unrecognized event', category: 'unknown' };
}

export function knownEventCodes(): string[] {
  return Object.keys(DICTIONARY);
}
