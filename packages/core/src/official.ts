// Adapter for the official USCIS Case Status API (developer.uscis.gov). Its responses carry status
// text and history instead of ELIS event codes, so each status becomes an event with a "CS:" code
// and its text. The result is a ParsedCase and goes through the same merge as manual imports.
import type { ParsedCase } from './elis.ts';
import { toInstant } from './elis.ts';
import { normalizeFormType } from './forms.ts';
import type { UscisEvent } from './model.ts';
import { isValidReceipt, normalizeReceipt } from './receipt.ts';
import type { StatusKey } from './statuses.ts';

/** Status text keyword rules, most specific first. Null means the text does not change status. */
const RULES: [RegExp, StatusKey | null][] = [
  // Requests about the case (expedite, fee waiver, rescheduling) do not decide the case itself.
  [
    /expedite|fee waiver|reschedul|withdrawal acknowledgement|benefit received by other means/i,
    null,
  ],
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
  for (const [pattern, status] of RULES) if (pattern.test(text)) return status ?? undefined;
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
export function parseCaseStatusResponse(body: unknown, fetchedAt?: string): OfficialResult {
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

  // The portal's documented example names the history `hist_case_status`. `hist_case_data` is
  // accepted too, in case the staging payloads use that name.
  const history = [cs.hist_case_status, cs.hist_case_data, root.hist_case_data].find(Array.isArray);
  for (const h of history ?? []) {
    if (isObj(h)) add(text(h.completed_text_en), officialInstant(h.date));
  }
  const submittedAt = officialInstant(cs.submittedDate);
  // Without dates the current status is still shown, dated when it was fetched.
  const modifiedAt = officialInstant(cs.modifiedDate) ?? submittedAt ?? toInstant(fetchedAt);
  // The history can already list the current status (as a sentence, on the same day), so it is
  // not added a second time.
  const current = text(cs.current_case_status_text_en);
  const currentKey = officialStatusKey(current);
  const listed =
    currentKey !== undefined &&
    modifiedAt !== undefined &&
    events.some(
      (e) =>
        e.at.slice(0, 10) === modifiedAt.slice(0, 10) &&
        officialStatusKey(e.text ?? '') === currentKey,
    );
  if (!listed) add(current, modifiedAt);
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
