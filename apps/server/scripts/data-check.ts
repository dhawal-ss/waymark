// Fetch official public pages and show what Waymark reads from them. Run on your own machine:
//   pnpm --filter @waymark/server data:check [form office subtype]
// Example: pnpm --filter @waymark/server data:check I-485 NBC 134A
// News: the Federal Register is always checked; set USCIS_FEED_URLS (comma separated) to also
// check USCIS RSS or Atom feeds.
import {
  bulletinUrl,
  federalRegisterUrl,
  parseFederalRegister,
  parseFeed,
  parseProcessingTimes,
  parseVisaBulletin,
  today,
  type NewsItem,
} from '@waymark/core';
import { readConfig, type Env } from '../src/config.ts';
import { processingTimeUrl } from '../src/publicJobs.ts';

function showNews(label: string, parsed: { items: NewsItem[]; problems: string[] }): boolean {
  const counts: Record<string, number> = {};
  for (const item of parsed.items) counts[item.category] = (counts[item.category] ?? 0) + 1;
  console.log(`  ${parsed.items.length} items: ${JSON.stringify(counts)}`);
  for (const item of parsed.items.slice(0, 3)) {
    console.log(
      `  ${item.publishedOn} [${item.category}] ${item.kind}: ${item.title.slice(0, 80)}`,
    );
  }
  for (const p of parsed.problems.slice(0, 5)) console.log(`  Problem: ${p}`);
  if (parsed.items.length === 0) console.log(`  No usable items from ${label}.`);
  return parsed.items.length > 0;
}

async function checkNews(): Promise<number> {
  let failed = 0;
  const config = readConfig({ USCIS_FEED_URLS: process.env.USCIS_FEED_URLS } as Env);
  const sources = [
    { url: federalRegisterUrl(config.federalRegisterBaseUrl), json: true },
    ...config.uscisFeedUrls.map((url) => ({ url, json: false })),
  ];
  for (const { url, json } of sources) {
    const at = new URL(url);
    const label = `${at.host}${at.pathname}`;
    try {
      const res = await fetch(url, {
        headers: { Accept: json ? 'application/json' : 'application/rss+xml, application/xml' },
      });
      console.log(`News ${label}: HTTP ${res.status}`);
      if (!res.ok) {
        failed++;
        continue;
      }
      const parsed = json ? parseFederalRegister(await res.json()) : parseFeed(await res.text());
      if (!showNews(label, parsed)) failed++;
    } catch (e) {
      failed++;
      console.log(`News ${label}: ${e instanceof Error ? e.message : 'fetch failed'}`);
    }
  }
  if (config.uscisFeedUrls.length === 0) {
    console.log('Set USCIS_FEED_URLS to also check USCIS RSS or Atom feeds.');
  }
  return failed;
}

async function main(): Promise<number> {
  let failed = 0;
  const month = today('UTC').slice(0, 7);
  const url = bulletinUrl(month);
  try {
    const res = await fetch(url);
    console.log(`Visa Bulletin ${month}: HTTP ${res.status} ${url}`);
    if (res.ok) {
      const parsed = parseVisaBulletin(await res.text(), url);
      const charts = new Set(parsed.rows.map((r) => `${r.chart}/${r.preference}`));
      console.log(`  ${parsed.rows.length} cells in ${[...charts].join(', ') || 'no charts'}`);
      console.log(`  Sample: ${JSON.stringify(parsed.rows.slice(0, 3))}`);
      for (const p of parsed.problems.slice(0, 5)) console.log(`  Problem: ${p}`);
      if (parsed.rows.length === 0) failed++;
    } else failed++;
  } catch (e) {
    failed++;
    console.log(`Visa Bulletin: ${e instanceof Error ? e.message : 'fetch failed'}`);
  }

  const [form, office, subtype = ''] = process.argv.slice(2);
  if (form && office) {
    const base = 'https://egov.uscis.gov/processing-times';
    const ptUrl = processingTimeUrl(base, form, office, subtype);
    try {
      const res = await fetch(ptUrl, {
        headers: { Accept: 'application/json', Referer: `${base}/` },
      });
      console.log(`Processing time: HTTP ${res.status} ${ptUrl}`);
      const body = await res.json().catch(() => null);
      const { times, problems } = parseProcessingTimes(body, { form, office, subtype });
      console.log(`  ${JSON.stringify(times)}`);
      for (const p of problems) console.log(`  Problem: ${p}`);
      if (times.length === 0) {
        failed++;
        console.log(`  Top-level keys: ${Object.keys((body ?? {}) as object).join(', ')}`);
      }
    } catch (e) {
      failed++;
      console.log(`Processing time: ${e instanceof Error ? e.message : 'fetch failed'}`);
    }
  } else {
    console.log('Pass form, office, and subtype to also check a processing time page.');
  }
  return failed > 0 ? 1 : 0;
}

process.exitCode = (await main()) + (await checkNews()) > 0 ? 1 : 0;
