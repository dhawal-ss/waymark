import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  addDays,
  federalRegisterUrl,
  NEWS_CATEGORIES,
  sanitizeNewsItems,
  shortHash,
  type NewsItem,
} from '@waymark/core';
import { describe, expect, it } from 'vitest';
import { readConfig, type Env } from '../src/config';
import { NEWS_KEEP, refreshNews } from '../src/publicJobs';
import { setup } from './harness';

const core = (name: string) =>
  readFileSync(join(import.meta.dirname, '../../../packages/core/test/fixtures', name), 'utf8');

const FR = federalRegisterUrl('https://www.federalregister.gov');
const RSS = 'https://www.uscis.gov/news/rss.xml';
const ATOM = 'https://www.uscis.gov/forms/updates.atom';
const START = '2026-10-05T13:17:00.000Z';
const DAY = 24 * 3_600_000;

const feeds = (...urls: string[]) => ({ USCIS_FEED_URLS: urls.join(',') });
const fixtures = () => ({
  [FR]: { body: core('federal-register.json') },
  [RSS]: { body: core('uscis-news.rss') },
  [ATOM]: { body: core('uscis-updates.atom') },
});

async function news(t: Awaited<ReturnType<typeof setup>>, query = '') {
  const res = await t.request(`/v1/public/news${query}`);
  return {
    res,
    body: (await res.json()) as {
      items: NewsItem[];
      error?: { code: string; message: string };
    },
  };
}

const ids = (items: NewsItem[]) => items.map((i) => i.id);

describe('news configuration', () => {
  const read = (env: Partial<Env>) => readConfig(env as Env);

  it('has no feeds and the official Federal Register address by default', () => {
    const c = read({});
    expect(c.uscisFeedUrls).toEqual([]);
    expect(c.federalRegisterBaseUrl).toBe('https://www.federalregister.gov');
    expect(c.newsEnabled).toBe(true);
  });

  it('keeps only https feed addresses on uscis.gov, without repeats or credentials', () => {
    const c = read({
      USCIS_FEED_URLS: [
        'https://www.uscis.gov/a.xml',
        ' https://uscis.gov/b.xml ',
        'https://www.uscis.gov/a.xml',
        'http://www.uscis.gov/c.xml',
        'https://uscis.gov.evil.example/d.xml',
        'https://www.example.com/uscis.gov/e.xml',
        'https://user:pass@www.uscis.gov/f.xml',
        'not an address',
        'ftp://www.uscis.gov/g.xml',
      ].join(',\n'),
    });
    expect(c.uscisFeedUrls).toEqual(['https://www.uscis.gov/a.xml', 'https://uscis.gov/b.xml']);
  });

  it('requires an https Federal Register address and drops the trailing slash', () => {
    expect(
      read({ FEDERAL_REGISTER_BASE_URL: 'https://fr.example.test/' }).federalRegisterBaseUrl,
    ).toBe('https://fr.example.test');
    for (const bad of ['http://www.federalregister.gov', 'nonsense', '']) {
      expect(read({ FEDERAL_REGISTER_BASE_URL: bad }).federalRegisterBaseUrl).toBe(
        'https://www.federalregister.gov',
      );
    }
  });

  it('follows PUBLIC_DATA_ENABLED unless NEWS_ENABLED is set', () => {
    expect(read({ PUBLIC_DATA_ENABLED: 'false' }).newsEnabled).toBe(false);
    expect(read({ PUBLIC_DATA_ENABLED: 'false', NEWS_ENABLED: 'true' }).newsEnabled).toBe(true);
    expect(read({ NEWS_ENABLED: 'false' }).newsEnabled).toBe(false);
    expect(read({ NEWS_ENABLED: '' }).newsEnabled).toBe(true);
  });
});

describe('news job', () => {
  it('reads the Federal Register and each feed, with a gap and a User-Agent, and stores the items', async () => {
    const t = await setup({ start: START, env: feeds(RSS, ATOM), publicResponses: fixtures() });
    const summary = await refreshNews(t.deps);
    expect(summary).toEqual({
      sources: 3,
      failed: 0,
      items: 5 + 4 + 2,
      added: 5 + 4 + 2,
      skipped: 2 + 2 + 1,
      errors: [],
    });
    expect(t.publicCalls.map((c) => c.url)).toEqual([FR, RSS, ATOM]);
    expect(t.sleeps).toEqual([1000, 1000]);
    for (const call of t.publicCalls) {
      expect(call.headers.get('User-Agent')).toMatch(/^WaymarkSync\//);
    }
    expect(t.publicCalls[0]!.headers.get('Accept')).toBe('application/json');
    expect(t.publicCalls[1]!.headers.get('Accept')).toContain('application/rss+xml');

    const status = (await (await t.request('/v1/public/status')).json()) as {
      datasets: { dataset: string; last_success_at: string | null; last_error: string | null }[];
    };
    expect(status.datasets).toContainEqual(
      expect.objectContaining({ dataset: 'news', last_success_at: START, last_error: null }),
    );
  });

  it('reads only the Federal Register when no feeds are configured', async () => {
    const t = await setup({ start: START, publicResponses: fixtures() });
    expect(await refreshNews(t.deps)).toMatchObject({ sources: 1, failed: 0, items: 5 });
    expect(t.publicCalls).toHaveLength(1);
    expect(t.sleeps).toEqual([]);
  });

  it('records a failing source and keeps the others', async () => {
    const t = await setup({
      start: START,
      env: feeds(RSS, ATOM),
      publicResponses: { ...fixtures(), [FR]: { status: 503, body: 'unavailable' } },
    });
    const summary = await refreshNews(t.deps);
    expect(summary).toMatchObject({ sources: 3, failed: 1, items: 6, added: 6 });
    expect(summary.errors).toEqual([
      'www.federalregister.gov/api/v1/documents.json returned HTTP 503.',
    ]);
    // The run is not a failure while any source worked.
    const status = (await (await t.request('/v1/public/status')).json()) as {
      datasets: { dataset: string; last_error: string | null }[];
    };
    expect(status.datasets.find((d) => d.dataset === 'news')?.last_error).toBeNull();
    const { body } = await news(t);
    expect(body.items.every((i) => i.source === 'uscis-feed')).toBe(true);
  });

  it('says what went wrong for each kind of failure', async () => {
    const t = await setup({
      start: START,
      env: feeds(RSS, ATOM, 'https://www.uscis.gov/a.xml', 'https://www.uscis.gov/b.xml'),
      publicResponses: {
        [FR]: () => {
          throw new Error('network down: secret-token-123');
        },
        [RSS]: { body: '<html><body>Access denied</body></html>' },
        [ATOM]: { body: '{"not":"a feed"}' },
        'https://www.uscis.gov/a.xml': { body: '<rss><channel><title>x</title></channel></rss>' },
      },
    });
    const summary = await refreshNews(t.deps);
    expect(summary.failed).toBe(5);
    expect(summary.errors).toEqual([
      'Could not reach www.federalregister.gov/api/v1/documents.json.',
      'www.uscis.gov/news/rss.xml had no usable news items. The response is a web page, not an RSS or Atom feed.',
      'www.uscis.gov/forms/updates.atom had no usable news items. The response is not an RSS, Atom, or RDF feed.',
      'www.uscis.gov/a.xml had no usable news items. The feed has no items.',
      'www.uscis.gov/b.xml returned HTTP 404.',
    ]);
    // Error text from the network is never kept.
    expect(JSON.stringify(summary)).not.toContain('secret-token');
    expect(t.db.dump()).not.toContain('secret-token');
  });

  it('counts the run as failed only when every source failed', async () => {
    const t = await setup({
      start: START,
      env: feeds(RSS),
      publicResponses: { [FR]: { status: 500, body: 'x' }, [RSS]: { status: 404, body: 'x' } },
    });
    const summary = await refreshNews(t.deps);
    expect(summary).toMatchObject({ sources: 2, failed: 2, items: 0, added: 0 });
    const status = (await (await t.request('/v1/public/status')).json()) as {
      datasets: { dataset: string; last_error: string | null; last_success_at: string | null }[];
    };
    expect(status.datasets.find((d) => d.dataset === 'news')).toMatchObject({
      last_error:
        'Every news source failed. www.federalregister.gov/api/v1/documents.json returned HTTP 500.',
      last_success_at: null,
    });
    expect((await news(t)).body.items).toEqual([]);
  });

  it('keeps a good run as the last success when a later run fails', async () => {
    const t = await setup({ start: START, publicResponses: fixtures() });
    await refreshNews(t.deps);
    t.advance(DAY);
    t.publicResponses[FR] = { status: 502, body: 'bad gateway' };
    await refreshNews(t.deps);
    const status = (await (await t.request('/v1/public/status')).json()) as {
      datasets: { dataset: string; last_error: string | null; last_success_at: string | null }[];
    };
    const row = status.datasets.find((d) => d.dataset === 'news');
    expect(row?.last_success_at).toBe(START);
    expect(row?.last_error).toMatch(/^Every news source failed\./);
    // The items from the good run are still served.
    expect((await news(t)).body.items).toHaveLength(5);
  });

  it('does not store the same item twice and keeps when it was first seen', async () => {
    const t = await setup({ start: START, env: feeds(RSS), publicResponses: fixtures() });
    await refreshNews(t.deps);
    const first = t.db.raw
      .prepare('SELECT id, first_seen_at, last_seen_at FROM news_items ORDER BY id')
      .all() as { id: string; first_seen_at: string; last_seen_at: string }[];
    expect(first).toHaveLength(9);
    expect(first.every((r) => r.first_seen_at === START && r.last_seen_at === START)).toBe(true);

    t.advance(DAY);
    const body = JSON.parse(core('federal-register.json'));
    body.results[0].title = 'Adjustment of the Fee Schedule (reworded)';
    t.publicResponses[FR] = { body };
    expect(await refreshNews(t.deps)).toMatchObject({ items: 9, added: 0 });
    const second = t.db.raw
      .prepare('SELECT id, title, first_seen_at, last_seen_at FROM news_items ORDER BY id')
      .all() as { id: string; title: string; first_seen_at: string; last_seen_at: string }[];
    expect(second).toHaveLength(9);
    expect(second.map((r) => r.first_seen_at)).toEqual(first.map((r) => r.first_seen_at));
    const later = new Date(Date.parse(START) + DAY).toISOString();
    expect(second.every((r) => r.last_seen_at === later)).toBe(true);
    expect(second.find((r) => r.id === 'federal-register:2026-00311')?.title).toBe(
      'Adjustment of the Fee Schedule (reworded)',
    );
  });

  it('counts an item as added only the first time it appears', async () => {
    const t = await setup({ start: START, publicResponses: fixtures() });
    expect(await refreshNews(t.deps)).toMatchObject({ items: 5, added: 5 });
    t.advance(DAY);
    const body = JSON.parse(core('federal-register.json'));
    body.results.push({
      document_number: '2026-00400',
      title: 'A later notice about processing time',
      abstract: null,
      html_url: 'https://www.federalregister.gov/d/2026-00400',
      publication_date: '2026-03-05',
      type: 'Notice',
    });
    t.publicResponses[FR] = { body };
    expect(await refreshNews(t.deps)).toMatchObject({ items: 6, added: 1 });
  });

  it('keeps one item when two feeds list the same page', async () => {
    const t = await setup({
      start: START,
      env: feeds(RSS, 'https://www.uscis.gov/news/copy.xml'),
      publicResponses: {
        [RSS]: { body: core('uscis-news.rss') },
        // Same pages, different guids.
        'https://www.uscis.gov/news/copy.xml': {
          body: (() => {
            let n = 0;
            return core('uscis-news.rss').replace(
              /<guid[^>]*>[^<]*<\/guid>/g,
              () => `<guid>copy-${n++}</guid>`,
            );
          })(),
        },
      },
    });
    t.publicResponses[FR] = { status: 500, body: '' };
    expect(await refreshNews(t.deps)).toMatchObject({ failed: 1, items: 4, added: 4 });
  });

  it(`keeps only the newest ${NEWS_KEEP} items`, async () => {
    const results = Array.from({ length: NEWS_KEEP + 20 }, (_, n) => ({
      document_number: `2026-${String(n).padStart(5, '0')}`,
      title: `Notice number ${n}`,
      abstract: null,
      html_url: `https://www.federalregister.gov/d/2026-${n}`,
      // Item 0 is the oldest.
      publication_date: addDays('2024-01-01', n),
      type: 'Notice',
    }));
    const t = await setup({ start: START, publicResponses: { [FR]: { body: { results } } } });
    expect(await refreshNews(t.deps)).toMatchObject({
      items: NEWS_KEEP + 20,
      added: NEWS_KEEP + 20,
    });
    const rows = t.db.raw
      .prepare('SELECT MIN(published_on) AS oldest, COUNT(*) AS n FROM news_items')
      .get() as { oldest: string; n: number };
    expect(rows.n).toBe(NEWS_KEEP);
    expect(rows.oldest).toBe(addDays('2024-01-01', 20));
    const { body } = await news(t, '?limit=100');
    expect(body.items[0]!.title).toBe(`Notice number ${NEWS_KEEP + 19}`);
  });

  it('prunes by date, then id, and leaves fewer items alone', async () => {
    const t = await setup({ start: START });
    const item = (id: string, publishedOn: string): NewsItem => ({
      id: `federal-register:${id}`,
      source: 'federal-register',
      kind: 'Notice',
      title: id,
      summary: '',
      url: `https://www.federalregister.gov/d/${id}`,
      publishedOn,
      category: 'other',
      forms: [],
    });
    await t.deps.publicStore.upsertNews(
      [
        item('a', '2026-01-02'),
        item('b', '2026-01-02'),
        item('c', '2026-01-01'),
        item('d', '2026-01-03'),
      ],
      START,
    );
    await t.deps.publicStore.pruneNews(3);
    expect(ids((await news(t)).body.items)).toEqual([
      'federal-register:d',
      'federal-register:a',
      'federal-register:b',
    ]);
    await t.deps.publicStore.pruneNews(500);
    expect((await news(t)).body.items).toHaveLength(3);
  });
});

describe('news endpoint', () => {
  async function seeded() {
    const t = await setup({ start: START, env: feeds(RSS, ATOM), publicResponses: fixtures() });
    await refreshNews(t.deps);
    return t;
  }

  it('returns { items } newest first with a 15 minute cache', async () => {
    const t = await seeded();
    const { res, body } = await news(t);
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=900');
    expect(Object.keys(body)).toEqual(['items']);
    expect(body.items).toHaveLength(11);
    const dates = body.items.map((i) => i.publishedOn);
    expect(dates).toEqual([...dates].sort().reverse());
    expect(dates[0]).toBe('2026-03-03');
    expect(dates.at(-1)).toBe('2026-02-03');
  });

  it('serves items that the app accepts unchanged', async () => {
    const t = await seeded();
    const { body } = await news(t);
    expect(sanitizeNewsItems(body)).toEqual(body.items);
    for (const item of body.items) {
      expect(Object.keys(item).sort()).toEqual(
        [
          'category',
          'forms',
          'id',
          'kind',
          'publishedOn',
          'source',
          'summary',
          'title',
          'url',
        ].sort(),
      );
      expect(NEWS_CATEGORIES).toContain(item.category);
    }
  });

  it('keeps summary, kind, forms, and category as parsed', async () => {
    const t = await seeded();
    const { body } = await news(t, '?form=I-485');
    expect(body.items).toEqual([
      {
        id: 'federal-register:2026-00280',
        source: 'federal-register',
        kind: 'Notice',
        title:
          'Agency Information Collection Activities; Revision of a Currently Approved Collection: Application to Register Permanent Residence or Adjust Status (Form I-485)',
        summary:
          'The Department of Homeland Security invites the general public to comment on a revision of a currently approved information collection for Form I-485 and its supplements. Supplement A and Form I-693 are also affected.',
        url: 'https://www.federalregister.gov/documents/2026/02/27/2026-00280/agency-information-collection-activities-form-i-485',
        publishedOn: '2026-02-27',
        category: 'forms',
        forms: ['I-485', 'I-693'],
      },
    ]);
  });

  it('limits results: default 40, clamped to 1..100', async () => {
    const t = await seeded();
    expect((await news(t, '?limit=3')).body.items).toHaveLength(3);
    expect((await news(t, '?limit=0')).body.items).toHaveLength(1);
    expect((await news(t, '?limit=-5')).body.items).toHaveLength(1);
    expect((await news(t, '?limit=100000')).body.items).toHaveLength(11);
    expect((await news(t, '?limit=')).body.items).toHaveLength(11);

    const many = await setup({
      start: START,
      publicResponses: {
        [FR]: {
          body: {
            results: Array.from({ length: 150 }, (_, n) => ({
              document_number: `2026-${n}`,
              title: `Notice ${n}`,
              html_url: `https://www.federalregister.gov/d/2026-${n}`,
              publication_date: addDays('2025-01-01', n),
              type: 'Notice',
            })),
          },
        },
      },
    });
    await refreshNews(many.deps);
    expect((await news(many)).body.items).toHaveLength(40);
    expect((await news(many, '?limit=500')).body.items).toHaveLength(100);
  });

  it('pages with before, which excludes the given date', async () => {
    const t = await seeded();
    const all = (await news(t)).body.items;
    const page1 = (await news(t, '?limit=4')).body.items;
    const cursor = page1.at(-1)!.publishedOn;
    const older = (await news(t, `?before=${cursor}`)).body.items;
    expect(older.every((i) => i.publishedOn < cursor)).toBe(true);
    expect(older.length).toBe(all.filter((i) => i.publishedOn < cursor).length);
    expect((await news(t, '?before=2026-02-03')).body.items).toEqual([]);
    expect((await news(t, '?before=2026-02-04')).body.items).toHaveLength(1);
    expect((await news(t, '?before=2099-01-01')).body.items).toHaveLength(11);
  });

  it('filters by category', async () => {
    const t = await seeded();
    const forms = (await news(t, '?category=forms')).body.items;
    expect(forms.length).toBeGreaterThan(0);
    expect(forms.every((i) => i.category === 'forms')).toBe(true);
    expect(ids(forms)).toContain('federal-register:2026-00280');
    expect((await news(t, '?category=safety')).body.items.map((i) => i.title)).toEqual([
      "Beware of scams that use the agency's name & logo",
    ]);
    expect((await news(t, '?category=visa')).body.items).toHaveLength(1);
    expect((await news(t, '?category=fees')).body.items).toHaveLength(1);
    expect(ids((await news(t, '?category=citizenship')).body.items)).toEqual([
      `uscis-feed:${shortHash('tag:uscis.gov,2026:n-400-instructions')}`,
    ]);
    // Every category name is accepted, even when nothing is in it.
    for (const c of NEWS_CATEGORIES) expect((await news(t, `?category=${c}`)).res.status).toBe(200);
  });

  it('filters by form number, exactly and without regard to case', async () => {
    const t = await seeded();
    expect(ids((await news(t, '?form=I-765')).body.items)).toHaveLength(1);
    expect((await news(t, '?form=i-765')).body.items).toHaveLength(1);
    expect((await news(t, '?form=I-131')).body.items[0]!.forms).toEqual(['I-131', 'I-765']);
    expect((await news(t, '?form=N-400')).body.items[0]!.title).toBe(
      'Updated instructions for Form N-400',
    );
    // A form that is only a prefix of a stored one does not match.
    expect((await news(t, '?form=I-48')).body.items).toEqual([]);
    expect((await news(t, '?form=I-4850')).body.items).toEqual([]);
    expect((await news(t, '?form=G-28')).body.items).toEqual([]);
  });

  it('combines filters', async () => {
    const t = await seeded();
    const both = (await news(t, '?category=forms&form=I-765&before=2026-03-03&limit=5')).body.items;
    expect(both).toHaveLength(1);
    expect((await news(t, '?category=fees&form=I-765')).body.items).toEqual([]);
    expect((await news(t, '?category=forms&before=2026-02-28')).body.items).toHaveLength(1);
  });

  it('rejects bad parameters with the error shape and no public cache header', async () => {
    const t = await seeded();
    const bad = [
      '?limit=abc',
      '?limit=1.5',
      '?before=2026-13-01',
      '?before=03/02/2026',
      '?before=yesterday',
      '?category=gossip',
      '?category=FEES',
      '?form=nope',
      '?form=I485',
      "?form=I-485'%20OR%20'1'='1",
      '?form=I-12345',
    ];
    for (const query of bad) {
      const { res, body } = await news(t, query);
      expect([query, res.status]).toEqual([query, 400]);
      expect(body.error?.code).toBe('invalid');
      expect(res.headers.get('Cache-Control')).not.toBe('public, max-age=900');
    }
    const message = (await news(t, '?category=gossip')).body.error?.message;
    expect(message).toContain('fees');
    expect(message).toContain('safety');
  });

  it('answers with an empty list before anything has been collected', async () => {
    const t = await setup({ start: START });
    const { res, body } = await news(t);
    expect(res.status).toBe(200);
    expect(body).toEqual({ items: [] });
  });
});

describe('news admin job', () => {
  it('runs on demand and reports the summary', async () => {
    const t = await setup({ start: START, publicResponses: fixtures() });
    const res = await t.admin('/v1/admin/run?job=news', { method: 'POST' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      sources: 1,
      failed: 0,
      items: 5,
      added: 5,
      skipped: 2,
      errors: [],
    });
    expect((await news(t)).body.items).toHaveLength(5);
  });

  it('runs even when the daily news job is turned off, and needs the admin token', async () => {
    const t = await setup({
      start: START,
      env: { NEWS_ENABLED: 'false' },
      publicResponses: fixtures(),
    });
    expect((await t.request('/v1/admin/run?job=news', { method: 'POST' })).status).toBe(401);
    expect((await t.admin('/v1/admin/run?job=news', { method: 'POST' })).status).toBe(200);
  });

  it('names every job in the error for an unknown one', async () => {
    const t = await setup();
    const res = await t.admin('/v1/admin/run?job=other', { method: 'POST' });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { message: string } }).error.message).toBe(
      'Pass job=processing-times, job=visa-bulletin, or job=news.',
    );
  });
});
