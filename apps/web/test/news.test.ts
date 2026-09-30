import { MAX_NEWS_ITEMS, NEWS_CATEGORIES, type NewsItem } from '@waymark/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  caseForms,
  effectiveFilter,
  filterNews,
  isForYourCases,
  matchingForms,
  mergeNews,
  newsHost,
  pageCursor,
  presentCategories,
  rawItemCount,
  titleTier,
} from '../src/lib/newsFeed';

function item(over: Partial<NewsItem> & { id: string }): NewsItem {
  return {
    source: over.id.startsWith('uscis-feed:') ? 'uscis-feed' : 'federal-register',
    kind: 'Notice',
    title: `Title of ${over.id}`,
    summary: '',
    url: 'https://www.federalregister.gov/documents/2026/09/01/x',
    publishedOn: '2026-09-01',
    category: 'other',
    forms: [],
    ...over,
  };
}

const A = item({
  id: 'federal-register:a',
  publishedOn: '2026-09-28',
  category: 'work',
  forms: ['I-765'],
});
const B = item({
  id: 'uscis-feed:b',
  publishedOn: '2026-09-26',
  category: 'visa',
  forms: ['I-485', 'I-130'],
});
const C = item({
  id: 'federal-register:c',
  publishedOn: '2026-09-24',
  category: 'forms',
  forms: [],
});
const D = item({
  id: 'federal-register:d',
  publishedOn: '2026-09-24',
  category: 'forms',
  forms: ['N-400'],
});

describe('relevance to the user cases', () => {
  it('lists distinct case forms, sorted, without Other', () => {
    expect(
      caseForms([{ form: 'I-765' }, { form: 'I-485' }, { form: 'I-765' }, { form: 'Other' }]),
    ).toEqual(['I-485', 'I-765']);
    expect(caseForms([])).toEqual([]);
  });

  it('matches items that mention a form of one of the cases', () => {
    expect(matchingForms(B, ['I-485', 'I-765'])).toEqual(['I-485']);
    expect(isForYourCases(B, ['I-485'])).toBe(true);
    expect(isForYourCases(A, ['I-485'])).toBe(false);
    expect(isForYourCases(C, ['I-485'])).toBe(false);
    expect(isForYourCases(B, [])).toBe(false);
  });
});

describe('filtering', () => {
  const items = [A, B, C, D];

  it('shows everything for all, in the same order', () => {
    expect(filterNews(items, 'all', [])).toEqual(items);
    expect(filterNews(items, 'all', [])).not.toBe(items);
  });

  it('shows only items for the forms of the cases', () => {
    expect(filterNews(items, 'mine', ['I-130'])).toEqual([B]);
    expect(filterNews(items, 'mine', ['I-765', 'I-485']).map((i) => i.id)).toEqual([A.id, B.id]);
    expect(filterNews(items, 'mine', [])).toEqual([]);
  });

  it('filters by category', () => {
    expect(filterNews(items, 'forms', []).map((i) => i.id)).toEqual([C.id, D.id]);
    expect(filterNews(items, 'fees', [])).toEqual([]);
  });

  it('lists the categories that are present, in the defined order', () => {
    expect(presentCategories(items)).toEqual(['forms', 'visa', 'work']);
    expect(presentCategories([])).toEqual([]);
    const order = presentCategories(
      NEWS_CATEGORIES.map((c) => item({ id: `federal-register:${c}`, category: c })),
    );
    expect(order).toEqual([...NEWS_CATEGORIES]);
  });

  it('falls back to all when the category has no items', () => {
    expect(effectiveFilter('visa', items)).toBe('visa');
    expect(effectiveFilter('fees', items)).toBe('all');
    expect(effectiveFilter('mine', [])).toBe('mine');
    expect(effectiveFilter('all', [])).toBe('all');
  });
});

describe('merging pages', () => {
  it('adds a page without repeats, newest first', () => {
    const merged = mergeNews([A, C], [B, C, D]);
    expect(merged.map((i) => i.id)).toEqual([A.id, B.id, C.id, D.id]);
  });

  it('keeps the incoming copy of an item that is on both sides', () => {
    const updated = { ...C, title: 'Updated title' };
    expect(mergeNews([C], [updated])[0]?.title).toBe('Updated title');
  });

  it('keeps only the newest items up to the limit', () => {
    const many = Array.from({ length: MAX_NEWS_ITEMS + 30 }, (_, i) =>
      item({
        id: `federal-register:n${String(i).padStart(4, '0')}`,
        publishedOn: new Date(Date.UTC(2026, 8, 30) - i * 86_400_000).toISOString().slice(0, 10),
      }),
    );
    const merged = mergeNews(many.slice(0, 150), many.slice(150));
    expect(merged).toHaveLength(MAX_NEWS_ITEMS);
    expect(merged[0]?.id).toBe(many[0]?.id);
    expect(merged.at(-1)?.id).toBe(many[MAX_NEWS_ITEMS - 1]?.id);
  });

  it('sorts items on the same date by id so the order is stable', () => {
    expect(mergeNews([D], [C]).map((i) => i.id)).toEqual([C.id, D.id]);
  });

  it('starts the next page after the last item in the server order', () => {
    expect(pageCursor([A, B, C, D])).toEqual({ before: '2026-09-24', beforeId: D.id });
    expect(pageCursor([D, C, B, A])).toEqual({ before: '2026-09-24', beforeId: D.id });
    expect(pageCursor([A])).toEqual({ before: '2026-09-28', beforeId: A.id });
    expect(pageCursor([])).toBeUndefined();
  });

  it('orders ids in plain string order, like the server', () => {
    const upper = item({ id: 'federal-register:B', publishedOn: '2026-09-01' });
    const lower = item({ id: 'federal-register:a', publishedOn: '2026-09-01' });
    expect(mergeNews([lower], [upper]).map((i) => i.id)).toEqual([upper.id, lower.id]);
    expect(pageCursor([upper, lower])?.beforeId).toBe(lower.id);
  });

  it('counts what the server sent before invalid items were dropped', () => {
    expect(rawItemCount({ items: [1, 2, 3] })).toBe(3);
    expect(rawItemCount([1, 2])).toBe(2);
    expect(rawItemCount({ items: 'x' })).toBe(0);
    expect(rawItemCount(null)).toBe(0);
  });
});

describe('display helpers', () => {
  it('names the host without www', () => {
    expect(newsHost('https://www.federalregister.gov/documents/x')).toBe('federalregister.gov');
    expect(newsHost('https://egov.uscis.gov/a')).toBe('egov.uscis.gov');
    expect(newsHost('not a url')).toBe('');
  });

  it('sizes titles by length', () => {
    expect(titleTier('Short title')).toBe('short');
    expect(titleTier('x'.repeat(100))).toBe('medium');
    expect(titleTier('x'.repeat(150))).toBe('long');
    expect(titleTier('x'.repeat(250))).toBe('longest');
  });
});

// The client module, with the fetch helper and server address replaced.
const state = vi.hoisted(() => ({ url: 'https://sync.test', on: true }));
const get = vi.hoisted(() => vi.fn());
vi.mock('../src/lib/serverSync.svelte', () => ({
  serverSync: {
    get url() {
      return state.url;
    },
  },
}));
vi.mock('../src/lib/publicData', () => ({
  PublicDataError: class PublicDataError extends Error {},
  publicDataOn: () => state.on,
  get,
}));

/** Two items per day, counting back from 2026-09-30. */
const dayOf = (n: number) =>
  new Date(Date.UTC(2026, 8, 30) - Math.floor(n / 2) * 86_400_000).toISOString().slice(0, 10);

function serverItem(n: number) {
  return {
    id: `federal-register:x${String(n).padStart(4, '0')}`,
    kind: 'Notice',
    title: `Notice ${n}`,
    summary: '',
    url: 'https://www.federalregister.gov/d/x',
    publishedOn: dayOf(n),
    category: 'other',
    forms: [],
  };
}

/** A server response with items `first` to `first + count - 1`, newest first. */
const serverPage = (first: number, count: number) => ({
  items: Array.from({ length: count }, (_, i) => serverItem(first + i)),
});

describe('news client', () => {
  let data: typeof import('../src/lib/newsData.svelte');

  beforeEach(async () => {
    vi.resetModules();
    get.mockReset();
    state.url = 'https://sync.test';
    state.on = true;
    data = await import('../src/lib/newsData.svelte');
  });

  it('loads the newest page and stops when the server has no more', async () => {
    get.mockResolvedValueOnce(serverPage(0, 12));
    await data.loadNews();
    expect(get).toHaveBeenCalledWith('/v1/public/news?limit=40');
    expect(data.news.items).toHaveLength(12);
    expect(data.news.exhausted).toBe(true);
    expect(data.news.error).toBe('');
    await data.loadMoreNews();
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('drops invalid items, and a short raw page still ends the list', async () => {
    const body = serverPage(0, 3);
    body.items.push({ ...serverItem(9), url: 'https://example.com/x' });
    body.items.push({ ...serverItem(10), title: '' });
    get.mockResolvedValueOnce(body);
    await data.loadNews();
    expect(data.news.items.map((i) => i.title)).toEqual(['Notice 0', 'Notice 1', 'Notice 2']);
    expect(data.news.exhausted).toBe(true);
  });

  it('asks for items after the last one loaded and merges without repeats', async () => {
    get.mockResolvedValueOnce(serverPage(0, 40));
    await data.loadNews();
    expect(data.news.exhausted).toBe(false);
    const last = data.news.items.at(-1)!;
    expect(last.id).toBe('federal-register:x0039');
    // The second page repeats the last item of the first page.
    get.mockResolvedValueOnce(serverPage(39, 40));
    await data.loadMoreNews();
    expect(get).toHaveBeenLastCalledWith(
      `/v1/public/news?limit=40&before=${last.publishedOn}&beforeId=federal-register%3Ax0039`,
    );
    expect(data.news.items).toHaveLength(79);
    expect(new Set(data.news.items.map((i) => i.id)).size).toBe(79);
    expect(data.news.exhausted).toBe(false);
  });

  it('ends the list when a page brings nothing new', async () => {
    get.mockResolvedValueOnce(serverPage(0, 40));
    await data.loadNews();
    get.mockResolvedValueOnce(serverPage(0, 40));
    await data.loadMoreNews();
    expect(data.news.items).toHaveLength(40);
    expect(data.news.exhausted).toBe(true);
  });

  it('keeps the newest 200 items and then stops loading', async () => {
    get.mockResolvedValueOnce(serverPage(0, 40));
    await data.loadNews();
    for (let n = 1; n <= 4; n++) {
      get.mockResolvedValueOnce(serverPage(n * 40, 40));
      await data.loadMoreNews();
    }
    expect(data.news.items).toHaveLength(MAX_NEWS_ITEMS);
    expect(data.news.exhausted).toBe(true);
    get.mockClear();
    await data.loadMoreNews();
    expect(get).not.toHaveBeenCalled();
  });

  it('keeps loaded items and reports a plain message when an older page fails', async () => {
    get.mockResolvedValueOnce(serverPage(0, 40));
    await data.loadNews();
    get.mockRejectedValueOnce(new Error('The sync server did not respond. Check your connection.'));
    await data.loadMoreNews();
    expect(data.news.items).toHaveLength(40);
    expect(data.news.moreError).toContain('did not respond');
    expect(data.news.exhausted).toBe(false);
    get.mockResolvedValueOnce(serverPage(40, 10));
    await data.loadMoreNews();
    expect(data.news.moreError).toBe('');
    expect(data.news.items).toHaveLength(50);
  });

  it('reports an error when the first page fails, and retries', async () => {
    get.mockRejectedValueOnce(new Error('The sync server returned HTTP 503.'));
    await data.loadNews();
    expect(data.news.error).toBe('The sync server returned HTTP 503.');
    expect(data.news.items).toEqual([]);
    expect(data.news.loading).toBe(false);
    get.mockResolvedValueOnce(serverPage(0, 2));
    await data.loadNews();
    expect(data.news.error).toBe('');
    expect(data.news.items).toHaveLength(2);
  });

  it('rejects an answer that is not JSON data', async () => {
    get.mockResolvedValueOnce(null);
    await data.loadNews();
    expect(data.news.error).toContain('could not read');
    expect(data.news.items).toEqual([]);
  });

  it('shows the last response without asking again, unless forced', async () => {
    get.mockResolvedValue(serverPage(0, 2));
    await data.loadNews();
    await data.loadNews();
    expect(get).toHaveBeenCalledTimes(1);
    await data.loadNews({ force: true });
    expect(get).toHaveBeenCalledTimes(2);
    expect(data.news.items).toHaveLength(2);
  });

  it('keeps the old items when a refresh fails', async () => {
    get.mockResolvedValueOnce(serverPage(0, 2));
    await data.loadNews();
    get.mockRejectedValueOnce(new Error('The sync server did not respond.'));
    await data.loadNews({ force: true });
    expect(data.news.items).toHaveLength(2);
    expect(data.news.error).toBe('The sync server did not respond.');
  });

  it('forgets the items when the server address changes', async () => {
    get.mockResolvedValueOnce(serverPage(0, 2));
    await data.loadNews();
    state.url = 'https://other.test';
    get.mockResolvedValueOnce(serverPage(50, 1));
    await data.loadNews();
    expect(data.news.items.map((i) => i.title)).toEqual(['Notice 50']);
    expect(data.news.server).toBe('https://other.test');
  });

  it('makes no request when public data is off', async () => {
    state.on = false;
    await data.loadNews();
    await data.loadMoreNews();
    expect(get).not.toHaveBeenCalled();
  });
});
