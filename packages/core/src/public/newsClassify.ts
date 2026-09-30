// Text cleanup, form number extraction, and rule-based classification for news items. Everything
// here is deterministic and works only from the source text: summaries are never written or
// guessed, and a category is chosen by matching whole words, never by scoring or a model.
import type { LocalDate } from '../dates.ts';
import type { NewsCategory, NewsItem, NewsSource } from '../news.ts';
import { decodeEntities } from './html.ts';

const ELLIPSIS = '\u2026';
/** Longest summary kept, including the ellipsis when the text is cut. */
export const NEWS_SUMMARY_MAX = 280;
const MAX_FORMS = 10;

// Text cleanup

// Tags that break a line of text. Other tags (a, em, span, ...) are removed without leaving a
// space, so "<a>USCIS</a>." reads "USCIS." and not "USCIS .".
const BLOCK_TAG =
  /<\/?(?:p|br|div|li|ul|ol|dl|dt|dd|h[1-6]|tr|td|th|table|blockquote|section|article|hr)\b[^>]*>/gi;

/**
 * Visible text of an HTML fragment: tags removed, entities decoded, whitespace collapsed. Literal
 * em dashes become hyphens, like the entity forms do in `decodeEntities`.
 */
export function plainText(raw: string): string {
  return decodeEntities(
    raw
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
      .replace(BLOCK_TAG, ' ')
      .replace(/<\/?[a-z][^>]*>/gi, ''),
  )
    .replace(/\u2014/g, '-')
    .replace(/[\u200b\u2060]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Words that end in a period without ending a sentence.
const ABBREVIATIONS: Record<string, true> = {
  no: true,
  nos: true,
  inc: true,
  dept: true,
  st: true,
  mr: true,
  mrs: true,
  ms: true,
  dr: true,
  vs: true,
  sec: true,
  secs: true,
  fig: true,
  jan: true,
  feb: true,
  mar: true,
  apr: true,
  jun: true,
  jul: true,
  aug: true,
  sep: true,
  sept: true,
  oct: true,
  nov: true,
  dec: true,
};

function isAbbreviation(word: string): boolean {
  const w = word.replace(/^[("'[]+/, '');
  // "U.S", "D.C", "e.g", or a single letter.
  if (/^(?:[A-Za-z]\.)*[A-Za-z]$/.test(w)) return true;
  return ABBREVIATIONS[w.toLowerCase()] === true;
}

/** Length of the longest prefix of at most `limit` characters that ends a sentence, or 0. */
function sentenceEnd(text: string, limit: number): number {
  let best = 0;
  for (const m of text.matchAll(/[.!?]["')\]]*(?=\s|$)/g)) {
    const end = (m.index ?? 0) + m[0].length;
    if (end > limit) break;
    if (m[0].startsWith('.')) {
      const word = /(\S+)$/.exec(text.slice(0, m.index))?.[1] ?? '';
      if (isAbbreviation(word)) continue;
    }
    best = end;
  }
  return best;
}

/** Shorten plain text to at most `max` characters, at a sentence end or a word boundary. */
function shorten(text: string, max: number): string {
  if (text.length <= max) return text;
  // A sentence end is preferred when it keeps a reasonable share of the room.
  const end = sentenceEnd(text, max);
  if (end >= Math.floor(max * 0.4)) return text.slice(0, end);
  const room = Math.max(1, max - 1);
  let cut = text.slice(0, room);
  const space = cut.lastIndexOf(' ');
  if (text[room] !== ' ' && space > room * 0.5) cut = cut.slice(0, space);
  return cut.replace(/[\s,;:(-]+$/, '') + ELLIPSIS;
}

/**
 * Clean source text for use as a summary: tags and entities removed, whitespace collapsed, and
 * shortened to `max` characters at the last sentence end (no ellipsis) or, when the first sentence
 * is too long, at a word boundary followed by an ellipsis. Empty input gives an empty summary.
 */
export function cleanSummary(raw: string, max: number = NEWS_SUMMARY_MAX): string {
  return shorten(plainText(raw), Math.max(2, Math.floor(max)));
}

// Form numbers

// Letter prefixes of USCIS forms: I (immigration), N (naturalization), G (general), AR (address).
// Numbers are 1 to 999, or 1000 to 1999 (G-1055), so a year like "N-2026" is not a form. A single
// uppercase letter may follow directly (I-129S); a lowercase one is a plural and dropped.
const FORM_NUMBER = /\b(AR|I|N|G)-?([1-9]\d{0,2}|1\d{3})([A-Za-z]?)(?![A-Za-z0-9_])/gi;

/** True for a normalized form number such as "I-485", "G-1055", or "I-129S". */
export function isFormNumber(value: string): boolean {
  return /^[A-Z]{1,3}-\d{1,4}[A-Z]?$/.test(value);
}

function compareForms(a: string, b: string): number {
  const parse = (f: string) => /^([A-Z]+)-(\d+)([A-Z]?)$/.exec(f);
  const [pa, pb] = [parse(a), parse(b)];
  if (!pa || !pb) return a.localeCompare(b);
  return (
    (pa[1] ?? '').localeCompare(pb[1] ?? '') ||
    Number(pa[2]) - Number(pb[2]) ||
    (pa[3] ?? '').localeCompare(pb[3] ?? '')
  );
}

/**
 * Form numbers mentioned in the text, normalized ("Form I-485", "I485", and "i-485" all give
 * "I-485"), unique, and sorted by prefix and then number (I-9 before I-485).
 */
export function extractForms(text: string): string[] {
  const found = new Set<string>();
  const flat = text.replace(/[\u2010-\u2013\u2212]/g, '-');
  for (const m of flat.matchAll(FORM_NUMBER)) {
    const suffix = m[3] && m[3] === m[3].toUpperCase() ? m[3] : '';
    found.add(`${(m[1] ?? '').toUpperCase()}-${m[2]}${suffix}`);
  }
  return [...found].sort(compareForms);
}

// Classification

interface Rule {
  category: NewsCategory;
  /** Whole-word patterns tested against the title and against the title plus summary. */
  patterns: RegExp[];
  /** Patterns too ambiguous for the summary: tested against the title only. */
  titlePatterns?: RegExp[];
  /** Text removed before matching, for phrases that would match by accident. */
  scrub?: RegExp;
}

// Precedence: the first category in this list with a match wins. Safety comes first because a
// warning is the point of the item whatever it is about. Fees precede the rest because a fee
// change matters most. Humanitarian precedes work so TPS notices that mention employment
// authorization stay humanitarian. Uppercase acronyms are case-sensitive (TPS, EAD, OPT, STEM)
// so lowercase words like "opt" and "stem" never match.
const TOPICAL_RULES: Rule[] = [
  {
    category: 'safety',
    patterns: [/\bscam(?:s|mers?|ming)?\b/i, /\bbeware\b/i, /\bimpersonat\w*/i],
    // "Fraud Detection and National Security" is a records notice, not a warning.
    titlePatterns: [/\bfraud(?:ulent)?\b(?! detection)/i],
  },
  { category: 'fees', patterns: [/\bfees?\b/i, /\bG-?1055\b/i] },
  {
    category: 'forms',
    patterns: [
      /\bnew (?:form )?editions?\b/i,
      /\bforms? editions?\b/i,
      /\bforms? revisions?\b/i,
      /\brevised forms?\b/i,
      /\bedition dates?\b/i,
      // Federal Register notices that announce a change to a form.
      /\binformation collections?\b/i,
    ],
  },
  { category: 'visa', patterns: [/\bvisa bulletins?\b/i, /\bfinal action dates?\b/i] },
  {
    category: 'processing',
    patterns: [
      /\bprocessing times?\b/i,
      /\bbacklogs?\b/i,
      /\bcase status\b/i,
      /\bpremium processing\b/i,
      /\bwait times?\b/i,
    ],
  },
  {
    category: 'citizenship',
    patterns: [
      /\bnaturali[sz](?:e|es|ed|ing|ation)\b/i,
      /\bN-?400s?\b/i,
      /\bcivics\b/i,
      /\boath\b/i,
      /\bcitizenship (?:tests?|exams?|ceremon(?:y|ies)|interviews?)\b/i,
      /\bcertificates? of citizenship\b/i,
    ],
  },
  {
    category: 'humanitarian',
    // Advance parole is a travel document for people with a pending application.
    scrub: /\badvance parole\b/gi,
    patterns: [
      /\basylum\b/i,
      /\basylees?\b/i,
      /\brefugees?\b/i,
      /\bTPS\b/,
      /\btemporary protected status\b/i,
      /\bparolees?\b/i,
      /\bparole\b/i,
      /\b[UT][- ][Vv]isas?\b/,
      /\b[UT] nonimmigrant\b/,
      /\bVAWA\b/,
      /\bviolence against women act\b/i,
      /\bhumanitarian\b/i,
      /\bDACA\b/,
      /\bdeferred action for childhood arrivals\b/i,
    ],
  },
  {
    category: 'work',
    patterns: [
      /\bemployment authori[sz]ations?\b/i,
      /\bwork authori[sz]ations?\b/i,
      /\bwork permits?\b/i,
      /\bEADs?\b/,
      /\bH-?1B\b/i,
      /\bH-2[AB]?\b/i,
      /\bH2[AB]\b/i,
      /\bH-4\b/i,
      /\bOPT\b/,
      /\bSTEM\b/,
      /\bF-1\b/i,
      /\bstudents?\b/i,
    ],
  },
];

// Last resort before "other": rule and guidance language, tried only when no topic matched.
const POLICY_PATTERNS: RegExp[] = [
  /\brules?\b/i,
  /\brulemaking\b/i,
  /\bpolicy (?:manual|memorand(?:um|a)|alert|update|guidance)\b/i,
  /\bguidance\b/i,
];

function matches(rule: Rule, text: string, title: boolean): boolean {
  const subject = rule.scrub ? text.replace(rule.scrub, ' ') : text;
  return (
    rule.patterns.some((p) => p.test(subject)) ||
    (title && (rule.titlePatterns ?? []).some((p) => p.test(subject)))
  );
}

/**
 * Category of a news item. Deterministic and rule based:
 * 1. Topic rules (safety, fees, forms, visa, processing, citizenship, humanitarian, work, in that
 *    order) are tried against the title alone; the first category that matches wins.
 * 2. If the title has no topic, the same rules are tried against the title plus summary.
 * 3. Rule and guidance language ("final rule", "policy manual", "guidance") gives "policy".
 * 4. A document kind of Rule or Proposed Rule gives "policy" even without those words.
 * 5. Everything else is "other".
 * Matching is by whole word, so "fee" does not match "feet" and "TPS" does not match "STPS".
 */
export function classifyNews(input: {
  title: string;
  summary: string;
  kind: string;
}): NewsCategory {
  const both = `${input.title} ${input.summary}`;
  for (const rule of TOPICAL_RULES) if (matches(rule, input.title, true)) return rule.category;
  for (const rule of TOPICAL_RULES) if (matches(rule, both, false)) return rule.category;
  if (POLICY_PATTERNS.some((p) => p.test(both))) return 'policy';
  if (/\brule\b/i.test(input.kind)) return 'policy';
  return 'other';
}

/** A news item as read from a source, before cleanup and classification. */
export interface RawNewsItem {
  id: string;
  source: NewsSource;
  kind: string;
  title: string;
  /** Source text, possibly HTML. Empty when the source gives none. */
  summary: string;
  url: string;
  publishedOn: LocalDate;
}

/**
 * The finished item: text cleaned, summary shortened (never written), and category and form
 * numbers derived from the stored title and summary, so classifying a stored item again gives the
 * same result.
 */
export function withClassification(raw: RawNewsItem): NewsItem {
  const title = plainText(raw.title);
  const kind = plainText(raw.kind).slice(0, 60);
  const summary = cleanSummary(raw.summary);
  return {
    id: raw.id,
    source: raw.source,
    kind,
    title,
    summary,
    url: raw.url,
    publishedOn: raw.publishedOn,
    category: classifyNews({ title, summary, kind }),
    forms: extractForms(`${title} ${summary}`).slice(0, MAX_FORMS),
  };
}
