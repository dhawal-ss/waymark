// USCIS ELIS event codes, as documented by the community. Unofficial: USCIS does not publish
// these meanings. Unknown codes are shown as "Unrecognized event" with the raw code.
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

export function eventInfo(code: string): EventInfo {
  const key = code.trim().toUpperCase();
  const known = DICTIONARY[key];
  return known
    ? { code: key, ...known }
    : { code: key, label: 'Unrecognized event', category: 'unknown' };
}

export function knownEventCodes(): string[] {
  return Object.keys(DICTIONARY);
}
