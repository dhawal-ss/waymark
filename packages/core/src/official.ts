// Adapter for the official USCIS Case Status API (developer.uscis.gov). Its responses carry status
// text and history instead of ELIS event codes, so each status becomes an event with a "CS:" code
// and its text. The result is a ParsedCase and goes through the same merge as manual imports.
import type { ParsedCase } from './elis.ts';
import { toInstant } from './elis.ts';
import { normalizeFormType } from './forms.ts';
import type { UscisEvent } from './model.ts';
import { isValidReceipt, normalizeReceipt } from './receipt.ts';
import type { StatusKey } from './statuses.ts';

/** Status text keyword rules, most specific first. */
const RULES: [RegExp, StatusKey][] = [
  [/intent to deny/i, 'noid'],
  [/denied/i, 'denied'],
  [/(response|evidence) .*(was )?received|received .*response/i, 'rfe_resp'],
  [/request for (additional )?evidence|evidence was (sent|requested)/i, 'rfe'],
  [/card was delivered|delivered to me/i, 'delivered'],
  [
    /card was (mailed|picked up)|picked up by the (united states )?postal service|card is being mailed/i,
    'card_mailed',
  ],
  [/card (is being|was) produced|new card/i, 'card_prod'],
  [/fingerprints? were taken|biometrics? (were|was) taken/i, 'review'],
  [/(fingerprint|biometric).*(appointment|scheduled)/i, 'biometrics'],
  [/interview was (completed|conducted)/i, 'review'],
  [/interview/i, 'interview'],
  [/transferred|relocated|moved to/i, 'transferred'],
  [/approved|oath ceremony/i, 'approved'],
  [/review|processing|ready to be scheduled|updated/i, 'review'],
  [/received|accepted/i, 'received'],
];

/** Status for an official status text, or undefined when no rule matches. */
export function officialStatusKey(text: string): StatusKey | undefined {
  for (const [pattern, status] of RULES) if (pattern.test(text)) return status;
  return undefined;
}

export const OFFICIAL_CODE_PREFIX = 'CS:';

export function officialCode(text: string): string {
  const slug = text
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
  return `${OFFICIAL_CODE_PREFIX}${slug || 'STATUS'}`;
}

/** Dates from the API look like "09-05-2023 14:37:40" (month first). Assumed UTC. */
export function officialInstant(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const m = /^(\d{2})-(\d{2})-(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(value.trim());
    if (m) {
      const [, mo, d, y, h = '12', mi = '00', s = '00'] = m;
      return toInstant(`${y}-${mo}-${d}T${h}:${mi}:${s}`);
    }
  }
  return toInstant(value);
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

export type OfficialResult = { ok: true; case: ParsedCase } | { ok: false; error: string };

/** Parse a Case Status API response body. Keeps only receipt, form, dates, and status texts. */
export function parseCaseStatusResponse(body: unknown): OfficialResult {
  const root = isObj(body) ? body : {};
  const cs = isObj(root.case_status) ? root.case_status : root;
  const receipt = normalizeReceipt(text(cs.receiptNumber));
  if (!isValidReceipt(receipt)) {
    const message = text(root.message);
    return { ok: false, error: message || 'The response has no valid receipt number.' };
  }

  const events: UscisEvent[] = [];
  const seen = new Set<string>();
  const add = (label: string, at: string | undefined) => {
    if (!label || !at) return;
    const code = officialCode(label);
    const key = `${code}|${at}`;
    if (seen.has(key)) return;
    seen.add(key);
    events.push({ code, at, text: label.slice(0, 200) });
  };

  for (const h of Array.isArray(cs.hist_case_status) ? cs.hist_case_status : []) {
    if (isObj(h)) add(text(h.completed_text_en), officialInstant(h.date));
  }
  const submittedAt = officialInstant(cs.submittedDate);
  const modifiedAt = officialInstant(cs.modifiedDate) ?? submittedAt;
  add(text(cs.current_case_status_text_en), modifiedAt);
  events.sort((a, b) => a.at.localeCompare(b.at));

  const parsed: ParsedCase = {
    receipt,
    form: normalizeFormType(text(cs.formType)),
    events,
    notices: [],
  };
  if (submittedAt) parsed.submittedAt = submittedAt;
  if (modifiedAt) parsed.updatedAt = modifiedAt;
  parsed.channel = 'Case Status API';
  return { ok: true, case: parsed };
}
