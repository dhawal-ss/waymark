// Fetch official public pages and show what Waymark reads from them. Run on your own machine:
//   pnpm --filter @waymark/server data:check [form office subtype]
// Example: pnpm --filter @waymark/server data:check I-485 NBC 134A
import { bulletinUrl, parseProcessingTimes, parseVisaBulletin, today } from '@waymark/core';
import { processingTimeUrl } from '../src/publicJobs.ts';

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

process.exitCode = await main();
