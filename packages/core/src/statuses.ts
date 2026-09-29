export type Tone = 'action' | 'bad' | 'progress' | 'good';

export const STATUS_KEYS = [
  'received',
  'rfe',
  'rfe_resp',
  'biometrics',
  'review',
  'interview',
  'transferred',
  'approved',
  'card_prod',
  'card_mailed',
  'delivered',
  'denied',
  'noid',
  'other',
] as const;

export type StatusKey = (typeof STATUS_KEYS)[number];

export interface StatusInfo {
  key: StatusKey;
  label: string;
  tone: Tone;
  closed: boolean;
  meaning: string;
  next: string;
}

const s = (
  key: StatusKey,
  label: string,
  tone: Tone,
  meaning: string,
  next: string,
  closed = false,
): StatusInfo => ({ key, label, tone, closed, meaning, next });

export const STATUSES: Record<StatusKey, StatusInfo> = {
  received: s(
    'received',
    'Case received',
    'progress',
    'USCIS accepted the filing and issued a receipt notice.',
    'A biometrics appointment notice if your form needs one, then the case waits for review.',
  ),
  rfe: s(
    'rfe',
    'Evidence requested',
    'action',
    'USCIS sent a Request for Evidence. The case is paused until you respond.',
    'Respond by the deadline on the notice. Review resumes after USCIS receives your response.',
  ),
  rfe_resp: s(
    'rfe_resp',
    'Evidence response received',
    'progress',
    'USCIS received your response to the Request for Evidence.',
    'An officer reviews the new evidence. Decisions often follow within a few months.',
  ),
  biometrics: s(
    'biometrics',
    'Biometrics scheduled',
    'action',
    'USCIS scheduled fingerprints and a photo at an Application Support Center.',
    'Attend the appointment with the notice and photo ID. The case then continues review.',
  ),
  review: s(
    'review',
    'In review',
    'progress',
    'The case is being processed. This covers background checks and officer review.',
    'An interview notice, a request for evidence, or a decision.',
  ),
  interview: s(
    'interview',
    'Interview scheduled',
    'action',
    'USCIS scheduled an interview at a field office.',
    'Attend with the documents listed on the notice. A decision may come at or after the interview.',
  ),
  transferred: s(
    'transferred',
    'Case transferred',
    'progress',
    'The case moved to another office to balance workloads or for an interview.',
    'Review continues at the new office. Processing times of the new office apply.',
  ),
  approved: s(
    'approved',
    'Approved',
    'good',
    'USCIS approved the case.',
    'An approval notice by mail. If a card is issued, card production follows.',
  ),
  card_prod: s(
    'card_prod',
    'Card being produced',
    'good',
    'USCIS ordered your card.',
    'The card is mailed, usually within a few weeks.',
  ),
  card_mailed: s(
    'card_mailed',
    'Card mailed',
    'good',
    'USCIS mailed your card.',
    'Delivery by USPS, often with a tracking number in the case status.',
  ),
  delivered: s(
    'delivered',
    'Card delivered',
    'good',
    'USPS delivered your card.',
    'Nothing further on this case. Check the card for errors.',
    true,
  ),
  denied: s(
    'denied',
    'Denied',
    'bad',
    'USCIS denied the case.',
    'A denial notice explains the reason and any motion or appeal options and deadlines.',
    true,
  ),
  noid: s(
    'noid',
    'Intent to deny',
    'action',
    'USCIS sent a Notice of Intent to Deny. You can respond before a final decision.',
    'Respond by the deadline on the notice. Consider talking to an immigration attorney.',
  ),
  other: s(
    'other',
    'Other update',
    'progress',
    'A status that does not fit the other categories.',
    'Check the notice or the USCIS case status page for details.',
  ),
};

/** Sort order for tones on the cases list: things that need you first. */
export const TONE_ORDER: Record<Tone, number> = { action: 0, bad: 1, progress: 2, good: 3 };

export function statusInfo(key: StatusKey): StatusInfo {
  return STATUSES[key];
}

export function isStatusKey(value: unknown): value is StatusKey {
  return typeof value === 'string' && (STATUS_KEYS as readonly string[]).includes(value);
}
