// Daily jobs that fetch official public data. They run slowly on purpose (one page per second)
// and record every failure so the app can show how fresh each dataset is.
import {
  addMonths,
  bulletinUrl,
  parseProcessingTimes,
  parseVisaBulletin,
  today,
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
