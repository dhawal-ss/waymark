// Pure logic for the Updates feed: relevance to the user's cases, filtering, and merging pages.
// No DOM and no stores, so it can be tested on its own. Relevance is computed on the device; the
// server is never told which forms the user has.
import {
  MAX_NEWS_ITEMS,
  NEWS_CATEGORIES,
  type LocalDate,
  type NewsCategory,
  type NewsItem,
} from '@waymark/core';
import { radii } from './ui/shapes';

/** What the feed shows: updates that mention the user's forms, everything, or one category. */
export type NewsFilter = 'mine' | 'all' | NewsCategory;

/** Distinct forms of the user's cases, sorted. Cases without a known form are left out. */
export function caseForms(cases: readonly { form: string }[]): string[] {
  return [...new Set(cases.map((c) => c.form).filter((f) => f !== 'Other'))].sort();
}

/** The forms in the item that match one of the user's forms. */
export function matchingForms(item: NewsItem, userForms: readonly string[]): string[] {
  return item.forms.filter((f) => userForms.includes(f));
}

export function isForYourCases(item: NewsItem, userForms: readonly string[]): boolean {
  return matchingForms(item, userForms).length > 0;
}

/** Items that pass the filter, in their original (newest first) order. */
export function filterNews(
  items: readonly NewsItem[],
  filter: NewsFilter,
  userForms: readonly string[],
): NewsItem[] {
  if (filter === 'all') return [...items];
  if (filter === 'mine') return items.filter((i) => isForYourCases(i, userForms));
  return items.filter((i) => i.category === filter);
}

/** Categories that appear in the items, in the order the categories are defined. */
export function presentCategories(items: readonly NewsItem[]): NewsCategory[] {
  const seen = new Set(items.map((i) => i.category));
  return NEWS_CATEGORIES.filter((c) => seen.has(c));
}

/** A category filter falls back to "all" when no loaded item has that category any more. */
export function effectiveFilter(filter: NewsFilter, items: readonly NewsItem[]): NewsFilter {
  if (filter === 'all' || filter === 'mine') return filter;
  return items.some((i) => i.category === filter) ? filter : 'all';
}

// The server orders by publication date, newest first, then by id ascending (plain string order).
// Merging uses the same order so the list and the paging cursor agree with the server.
const newestFirst = (a: NewsItem, b: NewsItem) =>
  a.publishedOn === b.publishedOn
    ? a.id < b.id
      ? -1
      : a.id > b.id
        ? 1
        : 0
    : a.publishedOn < b.publishedOn
      ? 1
      : -1;

/**
 * Add a page of items to what is loaded: no repeats (the incoming copy wins), newest first, and
 * only the newest `max` items are kept.
 */
export function mergeNews(
  current: readonly NewsItem[],
  incoming: readonly NewsItem[],
  max = MAX_NEWS_ITEMS,
): NewsItem[] {
  const byId = new Map<string, NewsItem>();
  for (const item of current) byId.set(item.id, item);
  for (const item of incoming) byId.set(item.id, item);
  return [...byId.values()].sort(newestFirst).slice(0, max);
}

/** Where the next page starts: after the last loaded item in the server's order. */
export interface PageCursor {
  before: LocalDate;
  beforeId: string;
}

export function pageCursor(items: readonly NewsItem[]): PageCursor | undefined {
  let last: NewsItem | undefined;
  for (const item of items) if (!last || newestFirst(last, item) < 0) last = item;
  return last && { before: last.publishedOn, beforeId: last.id };
}

/** Number of entries the server sent, before any were dropped as invalid. */
export function rawItemCount(body: unknown): number {
  if (Array.isArray(body)) return body.length;
  if (typeof body === 'object' && body !== null && 'items' in body) {
    const items = (body as { items: unknown }).items;
    return Array.isArray(items) ? items.length : 0;
  }
  return 0;
}

/** Host name for "Open on ...": the address without "www.". Empty when the URL cannot be read. */
export function newsHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** Color tone class per category, built from the tone-* classes and role colors. */
export const NEWS_TONES: Record<NewsCategory, string> = {
  fees: 'tone-action',
  forms: 'tone-progress',
  policy: 'tone-secondary',
  processing: 'tone-secondary',
  visa: 'tone-progress',
  citizenship: 'tone-good',
  humanitarian: 'tone-action',
  work: 'tone-secondary',
  safety: 'tone-bad',
  other: 'tone-quiet',
};

/** Title size tier: long titles get smaller type so the card can hold them. */
export function titleTier(title: string): 'short' | 'medium' | 'long' | 'longest' {
  if (title.length <= 60) return 'short';
  if (title.length <= 120) return 'medium';
  if (title.length <= 200) return 'long';
  return 'longest';
}

/** Polygon for the badge in percentages, so a plain element can take the shape with clip-path. */
export function shapePolygon(shape: { lobes: number; depth: number }, samples = 72): string {
  const points = radii(shape, samples).map((r, i) => {
    const theta = (i / samples) * Math.PI * 2 - Math.PI / 2;
    const x = 50 + 50 * r * Math.cos(theta);
    const y = 50 + 50 * r * Math.sin(theta);
    return `${x.toFixed(1)}% ${y.toFixed(1)}%`;
  });
  return `polygon(${points.join(',')})`;
}

/** Polar shape per category for the decorative badge. */
export const NEWS_SHAPES: Record<NewsCategory, { lobes: number; depth: number }> = {
  fees: { lobes: 12, depth: 0.07 },
  forms: { lobes: 8, depth: 0.08 },
  policy: { lobes: 6, depth: 0.1 },
  processing: { lobes: 10, depth: 0.06 },
  visa: { lobes: 5, depth: 0.1 },
  citizenship: { lobes: 9, depth: 0.09 },
  humanitarian: { lobes: 7, depth: 0.09 },
  work: { lobes: 4, depth: 0.12 },
  safety: { lobes: 3, depth: 0.14 },
  other: { lobes: 11, depth: 0.06 },
};

/** Badge outline per category, computed once. */
export const NEWS_CLIPS = Object.fromEntries(
  NEWS_CATEGORIES.map((c) => [c, shapePolygon(NEWS_SHAPES[c])]),
) as Record<NewsCategory, string>;
