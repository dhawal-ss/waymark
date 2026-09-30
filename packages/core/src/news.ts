// Official news items collected by the sync server and shown in the Updates feed. Items come only
// from official sources (Federal Register API, USCIS feeds). Text is taken from the source and
// never rewritten or guessed.
import { isLocalDate, type LocalDate } from './dates.ts';
import { asArray, asString, isObj } from './sanitize.ts';

export const NEWS_CATEGORIES = [
  'fees',
  'forms',
  'policy',
  'processing',
  'visa',
  'citizenship',
  'humanitarian',
  'work',
  'safety',
  'other',
] as const;

export type NewsCategory = (typeof NEWS_CATEGORIES)[number];

export const NEWS_CATEGORY_LABELS: Record<NewsCategory, string> = {
  fees: 'Fees',
  forms: 'Forms',
  policy: 'Policy',
  processing: 'Processing',
  visa: 'Visa Bulletin',
  citizenship: 'Citizenship',
  humanitarian: 'Humanitarian',
  work: 'Work and study',
  safety: 'Scams and safety',
  other: 'Other',
};

export type NewsSource = 'federal-register' | 'uscis-feed';

export interface NewsItem {
  /** Stable id: the source, a colon, and the source's own key for the item. */
  id: string;
  source: NewsSource;
  /** Document type as published, for example "Rule", "Proposed Rule", "Notice", "News release". */
  kind: string;
  title: string;
  /** One or two sentences taken from the source text. Empty when the source gives none. */
  summary: string;
  /** https URL on an official domain. */
  url: string;
  publishedOn: LocalDate;
  category: NewsCategory;
  /** Form numbers found in the title or summary, normalized like "I-485". */
  forms: string[];
}

/** Response of GET /v1/public/news (newest first). */
export interface NewsResponse {
  items: NewsItem[];
}

const OFFICIAL_NEWS_HOSTS = [
  'uscis.gov',
  'federalregister.gov',
  'govinfo.gov',
  'travel.state.gov',
  'state.gov',
  'dhs.gov',
];

/** True for an https URL on an official government domain (or a subdomain of one). */
export function isOfficialNewsUrl(raw: unknown): raw is string {
  if (typeof raw !== 'string' || raw.length > 2000) return false;
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    return (
      url.protocol === 'https:' &&
      OFFICIAL_NEWS_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))
    );
  } catch {
    return false;
  }
}

const NEWS_ID = /^(federal-register|uscis-feed):[\w.:/-]{1,160}$/;
const NEWS_FORM = /^[A-Z]{1,3}-\d{1,4}[A-Z]?$/;
export const MAX_NEWS_ITEMS = 200;

/** Validate one news item from an untrusted source. Returns null when it cannot be shown. */
export function sanitizeNewsItem(raw: unknown): NewsItem | null {
  if (!isObj(raw)) return null;
  const id = asString(raw.id);
  const title = asString(raw.title).replace(/\s+/g, ' ').trim().slice(0, 300);
  if (!NEWS_ID.test(id) || !title) return null;
  if (!isOfficialNewsUrl(raw.url) || !isLocalDate(raw.publishedOn)) return null;
  const category = (NEWS_CATEGORIES as readonly string[]).includes(asString(raw.category))
    ? (raw.category as NewsCategory)
    : 'other';
  const forms = [...new Set(asArray(raw.forms).filter((f): f is string => typeof f === 'string'))]
    .filter((f) => NEWS_FORM.test(f))
    .slice(0, 10);
  return {
    id,
    source: id.startsWith('federal-register:') ? 'federal-register' : 'uscis-feed',
    kind: asString(raw.kind).replace(/\s+/g, ' ').trim().slice(0, 60),
    title,
    summary: asString(raw.summary).replace(/\s+/g, ' ').trim().slice(0, 400),
    url: raw.url,
    publishedOn: raw.publishedOn,
    category,
    forms,
  };
}

/** Items from a server response (an array or `{ items }`): valid ones, newest first, no repeats. */
export function sanitizeNewsItems(raw: unknown): NewsItem[] {
  const list = isObj(raw) ? asArray(raw.items) : asArray(raw);
  const seen = new Set<string>();
  const items: NewsItem[] = [];
  for (const entry of list) {
    const item = sanitizeNewsItem(entry);
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    items.push(item);
  }
  return items
    .sort((a, b) => b.publishedOn.localeCompare(a.publishedOn) || a.id.localeCompare(b.id))
    .slice(0, MAX_NEWS_ITEMS);
}
