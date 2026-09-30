import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bulletinUrl } from '@waymark/core';
import { describe, expect, it } from 'vitest';
import {
  bulletinMonthsToFetch,
  processingTimeUrl,
  refreshProcessingTimes,
  refreshVisaBulletins,
} from '../src/publicJobs';
import { columnIndex, readXlsx } from '../src/xlsx';
import { setup } from './harness';

const core = (name: string) =>
  readFileSync(join(import.meta.dirname, '../../../packages/core/test/fixtures', name), 'utf8');
const PT_BASE = 'https://egov.uscis.gov/processing-times';
const START = '2026-10-05T13:17:00.000Z';

describe('processing times job', () => {
  const url = processingTimeUrl(PT_BASE, 'I-485', 'NBC', '134A');

  it('builds page URLs', () => {
    expect(url).toBe('https://egov.uscis.gov/processing-times/api/processingtime/I-485/NBC/134A');
    expect(processingTimeUrl(PT_BASE, 'I-90', 'NBC', '')).toBe(
      'https://egov.uscis.gov/processing-times/api/processingtime/I-90/NBC',
    );
  });

  it('stores a published value once and moves last seen forward on later days', async () => {
    const t = await setup({
      start: START,
      publicResponses: { [url]: { body: core('processing-times.json') } },
    });
    await t.admin('/v1/admin/pt-targets', {
      method: 'POST',
      body: JSON.stringify({
        targets: [{ form: 'I-485', office: 'NBC', subtype: '134A', label: 'Family-based' }],
      }),
    });

    expect(await refreshProcessingTimes(t.deps)).toEqual({ checked: 1, added: 1, failed: 0 });
    expect(t.publicCalls[0]!.headers.get('Referer')).toBe(`${PT_BASE}/`);
    // Not due again within 20 hours.
    expect(await refreshProcessingTimes(t.deps)).toEqual({ checked: 0, added: 0, failed: 0 });

    t.advance(24 * 3_600_000);
    expect(await refreshProcessingTimes(t.deps)).toEqual({ checked: 1, added: 0, failed: 0 });
    const history = (await (
      await t.request('/v1/public/processing-times/history?form=I-485&office=NBC&subtype=134A')
    ).json()) as {
      points: { publishedDate: string; months: number; lastSeenAt: string; firstSeenAt: string }[];
    };
    expect(history.points).toHaveLength(1);
    expect(history.points[0]).toMatchObject({
      publishedDate: '2026-07-25',
      months: 13.5,
      firstSeenAt: START,
    });
    expect(history.points[0]!.lastSeenAt).not.toBe(START);

    const body = JSON.parse(core('processing-times.json'));
    body.data.processing_time.subtypes[0].publication_date = 'October 3, 2026';
    body.data.processing_time.subtypes[0].range[0].value = 12.5;
    t.publicResponses[url] = { body };
    t.advance(24 * 3_600_000);
    expect(await refreshProcessingTimes(t.deps)).toMatchObject({ added: 1 });

    const latest = (await (await t.request('/v1/public/processing-times?form=I-485')).json()) as {
      items: { months: number; publishedDate: string; label: string }[];
    };
    expect(latest.items).toEqual([
      expect.objectContaining({ months: 12.5, publishedDate: '2026-10-03', label: 'Family-based' }),
    ]);
  });

  it('records failures per target', async () => {
    const t = await setup({
      start: START,
      publicResponses: { [url]: { status: 403, body: 'blocked' } },
    });
    await t.admin('/v1/admin/pt-targets', {
      method: 'POST',
      body: JSON.stringify({ targets: [{ form: 'I-485', office: 'NBC', subtype: '134A' }] }),
    });
    expect(await refreshProcessingTimes(t.deps)).toMatchObject({ failed: 1 });
    const latest = (await (await t.request('/v1/public/processing-times')).json()) as {
      items: { lastError: string; months: null }[];
    };
    expect(latest.items[0]).toMatchObject({
      lastError: 'egov.uscis.gov returned HTTP 403.',
      months: null,
    });
    const status = (await (await t.request('/v1/public/status')).json()) as {
      datasets: { dataset: string; last_error: string }[];
    };
    expect(status.datasets[0]).toMatchObject({
      dataset: 'processing-times',
      last_error: 'Every processing time request failed.',
    });
  });
});

describe('visa bulletin job', () => {
  it('fetches the next and current months and backfills missing ones', () => {
    expect(bulletinMonthsToFetch([], '2026-10', 2)).toEqual([
      '2026-11',
      '2026-10',
      '2026-09',
      '2026-08',
    ]);
    expect(bulletinMonthsToFetch(['2026-09'], '2026-10', 2)).toEqual([
      '2026-11',
      '2026-10',
      '2026-08',
    ]);
  });

  it('stores parsed bulletins, skips unpublished months, and serves series', async () => {
    const t = await setup({
      start: START,
      env: {},
      publicResponses: { [bulletinUrl('2026-10')]: { body: core('visa-bulletin.html') } },
    });
    t.deps.config.bulletinBackfillMonths = 1;
    expect(await refreshVisaBulletins(t.deps)).toEqual({
      fetched: 3,
      stored: 1,
      missing: 2,
      failed: 0,
    });
    expect(t.sleeps).toEqual([1000, 1000]);

    const options = (await (await t.request('/v1/public/visa-bulletin/options')).json()) as {
      months: string[];
      options: unknown[];
    };
    expect(options.months).toEqual(['2026-10']);
    expect(options.options).toContainEqual({
      chart: 'final',
      preference: 'employment',
      category: 'EB2',
      country: 'INDIA',
    });

    const series = (await (
      await t.request(
        '/v1/public/visa-bulletin?chart=final&preference=employment&category=EB2&country=INDIA',
      )
    ).json()) as { points: { month: string; cutoff: string; sourceUrl: string }[] };
    expect(series.points).toEqual([
      {
        month: '2026-10',
        cutoff: '2013-01-01',
        sourceUrl: bulletinUrl('2026-10'),
        fetchedAt: START,
      },
    ]);
  });

  it('rejects a page whose month does not match its URL', async () => {
    const t = await setup({
      start: START,
      publicResponses: { [bulletinUrl('2026-11')]: { body: core('visa-bulletin.html') } },
    });
    t.deps.config.bulletinBackfillMonths = 0;
    expect(await refreshVisaBulletins(t.deps)).toMatchObject({ stored: 0, failed: 1 });
  });

  it('validates query parameters', async () => {
    const t = await setup();
    expect((await t.request('/v1/public/visa-bulletin?chart=x')).status).toBe(400);
  });
});

describe('admin API', () => {
  it('requires the admin token', async () => {
    const t = await setup();
    expect((await t.request('/v1/admin/run?job=visa-bulletin', { method: 'POST' })).status).toBe(
      401,
    );
    expect(
      (await t.request('/v1/admin/run?job=visa-bulletin', { method: 'POST', token: 'wrong' }))
        .status,
    ).toBe(401);
    const off = await setup({ env: { ADMIN_TOKEN: '' } });
    expect((await off.admin('/v1/admin/run?job=visa-bulletin', { method: 'POST' })).status).toBe(
      503,
    );
  });

  it('imports quarterly form data from uscis.gov sources only', async () => {
    const t = await setup();
    const records = [
      {
        quarter: 'FY2026 Q3',
        form: 'I485',
        office: 'National Benefits Center',
        received: 12345,
        approved: 8001,
        denied: 512,
        pending: 44210,
      },
      {
        quarter: 'Q2 FY26',
        form: 'I-485',
        office: 'National Benefits Center',
        received: 11000,
        approved: 7000,
        denied: null,
        pending: 40000,
      },
      { quarter: 'bad', form: 'I-485', office: 'X' },
    ];
    const bad = await t.admin('/v1/admin/form-stats', {
      method: 'POST',
      body: JSON.stringify({ source: 'https://example.com/x.xlsx', records }),
    });
    expect(bad.status).toBe(400);
    const ok = await t.admin('/v1/admin/form-stats', {
      method: 'POST',
      body: JSON.stringify({
        source: 'https://www.uscis.gov/sites/default/files/document/data/form-data.xlsx',
        records,
      }),
    });
    expect(await ok.json()).toEqual({ saved: 2 });
    expect(await (await t.request('/v1/public/form-stats')).json()).toEqual({ forms: ['I-485'] });
    const stats = (await (await t.request('/v1/public/form-stats?form=I-485')).json()) as {
      records: { quarter: string; pending: number }[];
    };
    expect(stats.records.map((r) => [r.quarter, r.pending])).toEqual([
      ['FY2026 Q2', 40000],
      ['FY2026 Q3', 44210],
    ]);
  });

  it('runs a job on demand', async () => {
    const t = await setup({ start: START });
    const res = await t.admin('/v1/admin/run?job=processing-times', { method: 'POST' });
    expect(await res.json()).toEqual({ checked: 0, added: 0, failed: 0 });
  });

  it('sets public caching headers', async () => {
    const t = await setup();
    expect((await t.request('/v1/public/form-stats')).headers.get('Cache-Control')).toBe(
      'public, max-age=3600',
    );
  });
});

// A tiny XLSX writer for tests: stored and deflated entries, no CRC (the reader does not check it).
async function makeXlsx(
  files: Record<string, string>,
  deflate: string[] = [],
): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const raw = enc.encode(text);
    const method = deflate.includes(name) ? 8 : 0;
    const data =
      method === 8
        ? new Uint8Array(
            await new Response(
              new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate-raw')),
            ).arrayBuffer(),
          )
        : raw;
    const nameBytes = enc.encode(name);
    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(8, method, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, raw.length, true);
    lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    const cd = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(10, method, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, raw.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    cd.set(nameBytes, 46);
    parts.push(local, data);
    central.push(cd);
    offset += local.length + data.length;
  }
  const cdSize = central.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, central.length, true);
  ev.setUint16(10, central.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);
  const all = [...parts, ...central, end];
  const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
  let p = 0;
  for (const part of all) {
    out.set(part, p);
    p += part.length;
  }
  return out;
}

describe('xlsx reader', () => {
  it('maps column letters', () => {
    expect(columnIndex('A1')).toBe(0);
    expect(columnIndex('Z9')).toBe(25);
    expect(columnIndex('AA10')).toBe(26);
  });

  it('reads shared strings, inline strings, numbers, gaps, and named sheets', async () => {
    const bytes = await makeXlsx(
      {
        'xl/workbook.xml':
          '<workbook><sheets><sheet name="Notes" sheetId="1" r:id="rId1"/><sheet name="Data &amp; totals" sheetId="2" r:id="rId2"/></sheets></workbook>',
        'xl/_rels/workbook.xml.rels':
          '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="/xl/worksheets/sheet2.xml"/></Relationships>',
        'xl/sharedStrings.xml':
          '<sst><si><t>Form Number</t></si><si><r><t>Rece</t></r><r><t>ived</t></r></si><si><t>I-485</t></si></sst>',
        'xl/worksheets/sheet1.xml':
          '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Read me</t></is></c></row></sheetData></worksheet>',
        'xl/worksheets/sheet2.xml':
          '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="C2"><v>12345</v></c><c r="D2"/></row></sheetData></worksheet>',
      },
      ['xl/worksheets/sheet2.xml', 'xl/sharedStrings.xml'],
    );
    const sheets = await readXlsx(bytes);
    expect(sheets.map((s) => s.name)).toEqual(['Notes', 'Data & totals']);
    expect(sheets[1]!.rows).toEqual([
      ['Form Number', '', 'Received'],
      ['I-485', '', '12345', ''],
    ]);
    expect((await readXlsx(bytes, 'Notes'))[0]!.rows).toEqual([['Read me']]);
    await expect(readXlsx(bytes, 'Missing')).rejects.toThrow('No sheet named "Missing".');
    await expect(readXlsx(new Uint8Array(10))).rejects.toThrow('Not an XLSX file');
  });
});
