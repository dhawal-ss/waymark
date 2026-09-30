// Daily jobs that fetch official public data. They run slowly on purpose (one page per second)
// and record every failure so the app can show how fresh each dataset is.
import {
  addMonths,
  bulletinUrl,
  federalRegisterUrl,
  parseFederalRegister,
  parseFeed,
  parseProcessingTimes,
  parseVisaBulletin,
  today,
  type NewsItem,
} from '@waymark/core';
import type { Config } from './config';
import type { PublicStore } from './publicStore';
import type { FetchLike } from './uscis';

export interface PublicDeps {
  publicStore: PublicStore;
  config: Config;
  fetch: FetchLike;
  now: () => Date;
  sleep: (ms: number) => Promise<void>;
}

const USER_AGENT = 'WaymarkSync/1.0 (public data; contact via repository)';

export function processingTimeUrl(
  base: string,
  form: string,
  office: string,
  subtype: string,
): string {
  const parts = [form, office, subtype].filter(Boolean).map(encodeURIComponent);
  return `${base}/api/processingtime/${parts.join('/')}`;
}

export async function refreshProcessingTimes(
  deps: PublicDeps,
): Promise<{ checked: number; added: number; failed: number }> {
  const summary = { checked: 0, added: 0, failed: 0 };
  const now = deps.now();
  const before = new Date(now.getTime() - 20 * 3_600_000).toISOString();
  const targets = await deps.publicStore.dueTargets(before, deps.config.publicBatchSize);
  const day = now.toISOString().slice(0, 10);
  for (const [i, t] of targets.entries()) {
    if (i > 0) await deps.sleep(deps.config.publicGapMs);
    summary.checked++;
    const stamp = deps.now().toISOString();
    try {
      const res = await deps.fetch(
        processingTimeUrl(deps.config.processingTimesBaseUrl, t.form, t.office, t.subtype),
        {
          headers: {
            Accept: 'application/json',
            Referer: `${deps.config.processingTimesBaseUrl}/`,
            'User-Agent': USER_AGENT,
          },
        },
      );
      if (!res.ok) throw new Error(`egov.uscis.gov returned HTTP ${res.status}.`);
      const { times, problems } = parseProcessingTimes(await res.json(), {
        form: t.form,
        office: t.office,
        subtype: t.subtype,
      });
      if (times.length === 0) throw new Error(problems[0] ?? 'No processing time in the response.');
      for (const time of times.filter((x) => x.subtype === t.subtype)) {
        if ((await deps.publicStore.recordProcessingTime(time, day, stamp)) === 'new')
          summary.added++;
      }
      await deps.publicStore.markTarget(t, stamp, null);
    } catch (e) {
      summary.failed++;
      await deps.publicStore.markTarget(t, stamp, e instanceof Error ? e.message : 'Fetch failed.');
    }
  }
  await deps.publicStore.recordRun(
    'processing-times',
    deps.now().toISOString(),
    summary.failed > 0 && summary.failed === summary.checked
      ? 'Every processing time request failed.'
      : null,
  );
  return summary;
}

/** Months to fetch: the current and next bulletin, plus any missing months in the backfill window. */
export function bulletinMonthsToFetch(
  stored: string[],
  currentMonth: string,
  backfill: number,
): string[] {
  const have = new Set(stored);
  const current = `${currentMonth}-01`;
  const months = [addMonths(current, 1).slice(0, 7), currentMonth];
  for (let i = 1; i <= backfill; i++) {
    const m = addMonths(current, -i).slice(0, 7);
    if (!have.has(m)) months.push(m);
  }
  return months;
}

export async function refreshVisaBulletins(
  deps: PublicDeps,
): Promise<{ fetched: number; stored: number; missing: number; failed: number }> {
  const summary = { fetched: 0, stored: 0, missing: 0, failed: 0 };
  const currentMonth = today('UTC', deps.now()).slice(0, 7);
  const months = bulletinMonthsToFetch(
    await deps.publicStore.bulletinMonths(),
    currentMonth,
    deps.config.bulletinBackfillMonths,
  );
  let lastError: string | null = null;
  for (const [i, month] of months.slice(0, deps.config.publicBatchSize).entries()) {
    if (i > 0) await deps.sleep(deps.config.publicGapMs);
    const url = bulletinUrl(month);
    summary.fetched++;
    try {
      const res = await deps.fetch(url, {
        headers: { Accept: 'text/html', 'User-Agent': USER_AGENT },
      });
      if (res.status === 404) {
        // The next month's bulletin appears mid-month.
        summary.missing++;
        continue;
      }
      if (!res.ok) throw new Error(`travel.state.gov returned HTTP ${res.status} for ${month}.`);
      const parsed = parseVisaBulletin(await res.text(), url);
      if (parsed.month !== month || parsed.rows.length === 0) {
        throw new Error(parsed.problems[0] ?? `The ${month} bulletin page did not match its URL.`);
      }
      await deps.publicStore.replaceBulletin(month, parsed.rows, url, deps.now().toISOString());
      summary.stored++;
    } catch (e) {
      summary.failed++;
      lastError = e instanceof Error ? e.message : 'Fetch failed.';
    }
  }
  await deps.publicStore.recordRun(
    'visa-bulletin',
    deps.now().toISOString(),
    summary.stored === 0 ? lastError : null,
  );
  return summary;
}

/** Newest news items kept in the database. */
export const NEWS_KEEP = 500;
/** A feed larger than this is read only as far as this many characters. */
const NEWS_MAX_CHARS = 3_000_000;
const FEED_ACCEPT =
  'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8';

export interface NewsSummary {
  sources: number;
  failed: number;
  /** Distinct items read from all sources. */
  items: number;
  /** Items that were not in the database before this run. */
  added: number;
  /** Source entries skipped for a missing title, link, or date. */
  skipped: number;
  /** One plain-language line per failed source. Addresses are shown without their query string. */
  errors: string[];
}

interface NewsRequest {
  url: string;
  label: string;
  json: boolean;
}

/** Fetch and parse one news source. Returns items, or a message that says what went wrong. */
async function readNewsSource(
  deps: PublicDeps,
  request: NewsRequest,
): Promise<{ items: NewsItem[]; problems: string[] } | { error: string }> {
  const { url, label } = request;
  let res: Response;
  try {
    res = await deps.fetch(url, {
      headers: {
        Accept: request.json ? 'application/json' : FEED_ACCEPT,
        'User-Agent': USER_AGENT,
      },
    });
  } catch {
    return { error: `Could not reach ${label}.` };
  }
  if (!res.ok) return { error: `${label} returned HTTP ${res.status}.` };
  let parsed: { items: NewsItem[]; problems: string[] };
  try {
    parsed = request.json
      ? parseFederalRegister(await res.json())
      : parseFeed((await res.text()).slice(0, NEWS_MAX_CHARS));
  } catch {
    return { error: `${label} returned data that could not be read.` };
  }
  if (parsed.items.length === 0) {
    return { error: `${label} had no usable news items. ${parsed.problems[0] ?? ''}`.trim() };
  }
  return parsed;
}

/**
 * Collect official news: Federal Register documents from USCIS, then each configured USCIS feed,
 * one request per gap. A failing source is reported and does not stop the others; the run is
 * recorded as failed only when every source failed. Items are stored by id, and only the newest
 * NEWS_KEEP stay.
 */
export async function refreshNews(deps: PublicDeps): Promise<NewsSummary> {
  const { config } = deps;
  const requests: NewsRequest[] = [
    { url: federalRegisterUrl(config.federalRegisterBaseUrl), json: true },
    ...config.uscisFeedUrls.map((url) => ({ url, json: false })),
  ].map((r) => {
    // The query string is left out of messages: it can carry parameters that are not public.
    const u = new URL(r.url);
    return { ...r, label: `${u.host}${u.pathname === '/' ? '' : u.pathname}` };
  });
  const summary: NewsSummary = {
    sources: requests.length,
    failed: 0,
    items: 0,
    added: 0,
    skipped: 0,
    errors: [],
  };
  const found = new Map<string, NewsItem>();
  const links = new Set<string>();
  for (const [i, request] of requests.entries()) {
    if (i > 0) await deps.sleep(config.publicGapMs);
    const result = await readNewsSource(deps, request);
    if ('error' in result) {
      summary.failed++;
      summary.errors.push(result.error);
      continue;
    }
    summary.skipped += result.problems.length;
    for (const item of result.items) {
      // Two feeds can list the same page under different ids; keep the first.
      if (found.has(item.id) || links.has(item.url)) continue;
      found.set(item.id, item);
      links.add(item.url);
    }
  }
  summary.items = found.size;
  const now = deps.now().toISOString();
  if (found.size > 0) summary.added = await deps.publicStore.upsertNews([...found.values()], now);
  await deps.publicStore.pruneNews(NEWS_KEEP);
  await deps.publicStore.recordRun(
    'news',
    now,
    summary.failed === summary.sources
      ? `Every news source failed. ${summary.errors[0] ?? ''}`.trim()
      : null,
  );
  return summary;
}
