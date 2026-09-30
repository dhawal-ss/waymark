// Parser for the USCIS case JSON a signed-in user can open at
// https://my.uscis.gov/account/case-service/api/cases/{RECEIPT}. The endpoint is undocumented, so
// the parser is loose about where data sits and strict about what it keeps.
import { normalizeFormType, type FormType } from './forms.ts';
import type { Instant, UscisEvent, UscisNotice } from './model.ts';
import { isValidReceipt, normalizeReceipt } from './receipt.ts';

export interface ParsedCase {
  receipt: string;
  form: FormType | null;
  formName?: string;
  submittedAt?: Instant;
  updatedAt?: Instant;
  closed?: boolean;
  channel?: string;
  events: UscisEvent[];
  notices: UscisNotice[];
}

export interface ParseResult {
  cases: ParsedCase[];
  /** Problems worth telling the user about, in plain language. */
  problems: string[];
}

/**
 * Find top-level JSON objects in text, for example several objects pasted back to back.
 * Braces inside strings are ignored.
 */
export function extractJsonObjects(text: string): string[] {
  return scanJsonObjects(text).chunks;
}

/** Like extractJsonObjects, and also reports whether the text ends inside an unfinished object. */
export function scanJsonObjects(text: string): { chunks: string[]; truncated: boolean } {
  const out: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      if (depth > 0) inString = true;
    } else if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}' && depth > 0) {
      depth--;
      if (depth === 0 && start >= 0) {
        out.push(text.slice(start, i + 1));
        start = -1;
      }
    }
  }
  return { chunks: out, truncated: depth > 0 };
}

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type JsonObject = { [key: string]: Json };

const isObject = (v: unknown): v is JsonObject =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Walk the known wrappers and collect objects that look like cases. */
function collectCases(value: Json, out: JsonObject[], depth = 0): void {
  if (depth > 6) return;
  if (Array.isArray(value)) {
    for (const item of value) collectCases(item, out, depth + 1);
    return;
  }
  if (!isObject(value)) return;
  if ('receiptNumber' in value) {
    out.push(value);
    return;
  }
  if ('data' in value) collectCases(value.data ?? null, out, depth + 1);
  if ('cases' in value) collectCases(value.cases ?? null, out, depth + 1);
}

/** Convert a timestamp from the JSON to an ISO instant, or undefined when unusable. */
export function toInstant(value: unknown): Instant | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = value < 1e11 ? value * 1000 : value;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
  }
  if (typeof value !== 'string') return undefined;
  let s = value.trim();
  if (!s) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s = `${s}T12:00:00Z`;
  // Timestamps without an offset are assumed to be UTC.
  else if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s))
    s = `${s.replace(' ', 'T')}Z`;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : undefined;

function normalizeCase(raw: JsonObject): ParsedCase | string {
  const receipt = normalizeReceipt(str(raw.receiptNumber) ?? '');
  if (!isValidReceipt(receipt)) {
    return `Skipped a case with an invalid receipt number (${str(raw.receiptNumber) ?? 'missing'}).`;
  }
  const events: UscisEvent[] = [];
  const seen = new Set<string>();
  for (const e of Array.isArray(raw.events) ? raw.events : []) {
    if (!isObject(e)) continue;
    const code = str(e.eventCode)?.toUpperCase();
    const at = toInstant(e.createdAtTimestamp ?? e.eventTimestamp);
    if (!code || !at) continue;
    const key = `${code}|${at}`;
    if (seen.has(key)) continue;
    seen.add(key);
    events.push({ code, at });
  }
  events.sort((a, b) => a.at.localeCompare(b.at));

  const notices: UscisNotice[] = [];
  for (const n of Array.isArray(raw.notices) ? raw.notices : []) {
    if (!isObject(n)) continue;
    const notice: UscisNotice = {};
    const letterId = str(n.letterId);
    const generationDate = str(n.generationDate);
    const actionType = str(n.actionType);
    const appointmentDateTime = str(n.appointmentDateTime);
    if (letterId) notice.letterId = letterId;
    if (generationDate) notice.generationDate = generationDate;
    if (actionType) notice.actionType = actionType;
    if (appointmentDateTime) notice.appointmentDateTime = appointmentDateTime;
    if (Object.keys(notice).length > 0) notices.push(notice);
  }

  const parsed: ParsedCase = {
    receipt,
    form: normalizeFormType(str(raw.formType)) ?? normalizeFormType(str(raw.formName)),
    events,
    notices,
  };
  const formName = str(raw.formName);
  const submittedAt = toInstant(raw.submissionTimestamp ?? raw.submissionDate);
  const updatedAt = toInstant(raw.updatedAtTimestamp ?? raw.updatedAt);
  const channel = str(raw.elisChannelType);
  if (formName && !normalizeFormType(formName)) parsed.formName = formName;
  if (submittedAt) parsed.submittedAt = submittedAt;
  if (updatedAt) parsed.updatedAt = updatedAt;
  if (typeof raw.closed === 'boolean') parsed.closed = raw.closed;
  if (channel) parsed.channel = channel;
  return parsed;
}

/** Parse pasted or uploaded text into cases. Never throws. */
export function parseUscisJson(text: string): ParseResult {
  const problems: string[] = [];
  const trimmed = text.trim();
  if (!trimmed)
    return { cases: [], problems: ['The input is empty. Paste the case JSON or upload the file.'] };

  const roots: Json[] = [];
  try {
    roots.push(JSON.parse(trimmed) as Json);
  } catch {
    const { chunks, truncated } = scanJsonObjects(trimmed);
    let failed = 0;
    for (const chunk of chunks) {
      try {
        roots.push(JSON.parse(chunk) as Json);
      } catch {
        failed++;
      }
    }
    if (chunks.length === 0) {
      return {
        cases: [],
        problems: [
          'No JSON found. Copy the whole page from my.uscis.gov, starting with { and ending with }.',
        ],
      };
    }
    if (truncated) {
      problems.push(
        'The last JSON block is cut off. Copy the whole page again, including the final }.',
      );
    }
    if (failed > 0) {
      problems.push(
        `${failed} JSON ${failed === 1 ? 'block was' : 'blocks were'} incomplete and skipped. Copy the whole page again.`,
      );
    }
  }

  const found: JsonObject[] = [];
  for (const root of roots) collectCases(root, found);
  if (found.length === 0) {
    problems.push(
      'The JSON has no receiptNumber. Open the case JSON on my.uscis.gov, not the case status page.',
    );
    return { cases: [], problems };
  }

  const byReceipt = new Map<string, ParsedCase>();
  for (const raw of found) {
    const result = normalizeCase(raw);
    if (typeof result === 'string') {
      problems.push(result);
      continue;
    }
    const prev = byReceipt.get(result.receipt);
    if (prev) {
      // The same case pasted twice: keep every event once.
      const keys = new Set(prev.events.map((e) => `${e.code}|${e.at}`));
      for (const e of result.events) if (!keys.has(`${e.code}|${e.at}`)) prev.events.push(e);
      prev.events.sort((a, b) => a.at.localeCompare(b.at));
      if (result.notices.length > prev.notices.length) prev.notices = result.notices;
    } else {
      byReceipt.set(result.receipt, result);
    }
  }
  return { cases: [...byReceipt.values()], problems };
}
