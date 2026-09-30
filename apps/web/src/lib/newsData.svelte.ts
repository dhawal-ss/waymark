// Official news items (Federal Register and USCIS feeds) from the sync server, for the Updates
// feed. Off with public data. Requests carry only paging values, never the user's cases or forms;
// relevance is worked out on the device. The last successful response stays in memory while the
// app is open, so opening Updates again shows it at once and refreshes quietly.
import { MAX_NEWS_ITEMS, sanitizeNewsItems, type NewsItem } from '@waymark/core';
import { mergeNews, pageCursor, rawItemCount, type PageCursor } from './newsFeed';
import { get, publicDataOn, PublicDataError } from './publicData';
import { serverSync } from './serverSync.svelte';

export const NEWS_PAGE_SIZE = 40;
/** A response younger than this is shown without asking the server again. */
const FRESH_MS = 5 * 60 * 1000;

interface NewsState {
  /** Loaded items, newest first, at most MAX_NEWS_ITEMS. */
  items: NewsItem[];
  /** Loading the first page or refreshing. */
  loading: boolean;
  /** Loading an older page. */
  loadingMore: boolean;
  /** Why the first page or a refresh failed. Empty when it did not. */
  error: string;
  /** Why an older page failed to load. */
  moreError: string;
  /** There is nothing older to load, or the item limit is reached. */
  exhausted: boolean;
  /** Milliseconds since the epoch of the last successful response; 0 before the first. */
  loadedAt: number;
  /** The server the items came from. */
  server: string;
}

export const news: NewsState = $state({
  items: [],
  loading: false,
  loadingMore: false,
  error: '',
  moreError: '',
  exhausted: false,
  loadedAt: 0,
  server: '',
});

/** Forget everything loaded, for example when the server address changes. */
export function resetNews(): void {
  news.items = [];
  news.loading = false;
  news.loadingMore = false;
  news.error = '';
  news.moreError = '';
  news.exhausted = false;
  news.loadedAt = 0;
  news.server = serverSync.url;
}

interface Page {
  items: NewsItem[];
  /** Entries the server sent, including ones dropped as invalid. */
  raw: number;
}

async function fetchPage(cursor?: PageCursor): Promise<Page> {
  let query = `limit=${NEWS_PAGE_SIZE}`;
  // The date and id of the last loaded item: items on that date are neither repeated nor skipped.
  if (cursor) query += `&before=${cursor.before}&beforeId=${encodeURIComponent(cursor.beforeId)}`;
  const body = await get<unknown>(`/v1/public/news?${query}`);
  // Server responses are untrusted: only valid items on official domains are kept.
  if (typeof body !== 'object' || body === null)
    throw new PublicDataError(
      'The sync server sent an answer Waymark could not read. Check the server address in Settings.',
    );
  return { items: sanitizeNewsItems(body), raw: rawItemCount(body) };
}

const messageOf = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

/** Load the newest items, or refresh them when the last response is older than a few minutes. */
export async function loadNews(options: { force?: boolean } = {}): Promise<void> {
  if (!publicDataOn()) return;
  if (news.server !== serverSync.url) resetNews();
  if (news.loading) return;
  if (!options.force && news.items.length > 0 && Date.now() - news.loadedAt < FRESH_MS) return;
  const server = serverSync.url;
  const first = news.items.length === 0;
  news.loading = true;
  news.error = '';
  try {
    const page = await fetchPage();
    if (server !== serverSync.url) return;
    news.items = mergeNews(news.items, page.items);
    if (first) news.exhausted = page.raw < NEWS_PAGE_SIZE || news.items.length >= MAX_NEWS_ITEMS;
    news.loadedAt = Date.now();
  } catch (e) {
    if (server === serverSync.url)
      news.error = messageOf(e, 'The updates could not be loaded. Try again.');
  } finally {
    if (server === serverSync.url) news.loading = false;
  }
}

/** Load the page of items that come after the last one loaded. */
export async function loadMoreNews(): Promise<void> {
  if (!publicDataOn() || news.loading || news.loadingMore || news.exhausted) return;
  const cursor = pageCursor(news.items);
  if (!cursor) return;
  const server = serverSync.url;
  news.loadingMore = true;
  news.moreError = '';
  try {
    const page = await fetchPage(cursor);
    if (server !== serverSync.url) return;
    const known = news.items.map((i) => i.id);
    const fresh = page.items.filter((i) => !known.includes(i.id)).length;
    news.items = mergeNews(news.items, page.items);
    // A page with nothing new ends the list: asking again would return the same page.
    news.exhausted =
      page.raw < NEWS_PAGE_SIZE || fresh === 0 || news.items.length >= MAX_NEWS_ITEMS;
  } catch (e) {
    if (server === serverSync.url)
      news.moreError = messageOf(e, 'Older updates could not be loaded. Try again.');
  } finally {
    if (server === serverSync.url) news.loadingMore = false;
  }
}
