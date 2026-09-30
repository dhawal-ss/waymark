// Official news items collected by the sync server and shown in the Updates feed. Items come only
// from official sources (Federal Register API, USCIS feeds). Text is taken from the source and
// never rewritten or guessed.
import type { LocalDate } from './dates.ts';

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
