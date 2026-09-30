import { describe, expect, it } from 'vitest';
import {
  buildExport,
  emptyData,
  exampleData,
  migrateV02,
  readImport,
  sanitizeData,
  SCHEMA_VERSION,
  currentStatus,
} from '../src';
import { fixture, idFactory, NOW } from './helpers';

const opts = () => ({ now: NOW, makeId: idFactory('new'), timeZone: 'UTC' });

describe('export and import', () => {
  it('round trips an export', () => {
    const data = { ...emptyData(), ...exampleData('2025-07-15', idFactory(), NOW) };
    const text = JSON.stringify(buildExport(data, NOW));
    const result = readImport(text, opts());
    expect(result).toMatchObject({ ok: true, source: 'export', dropped: 0 });
    if (result.ok) expect(result.data).toEqual(data);
  });

  it('rejects invalid JSON, foreign data, and newer schemas with fixes in the message', () => {
    expect(readImport('{oops', opts())).toEqual({
      ok: false,
      error: 'The file is not valid JSON. Choose a file exported from Waymark.',
    });
    expect(readImport('{"hello":1}', opts())).toMatchObject({
      ok: false,
      error: expect.stringContaining('Waymark export'),
    });
    expect(readImport('[]', opts())).toMatchObject({ ok: false });
    expect(
      readImport(JSON.stringify({ app: 'waymark', schema: SCHEMA_VERSION + 1, data: {} }), opts()),
    ).toMatchObject({
      ok: false,
      error: expect.stringContaining('newer version'),
    });
    expect(readImport(JSON.stringify({ app: 'waymark', data: {} }), opts())).toMatchObject({
      ok: false,
    });
  });

  it('counts records dropped by validation', () => {
    const text = JSON.stringify({
      app: 'waymark',
      schema: 1,
      data: { cases: [{ receipt: 'bad' }], deadlines: [{ title: 'x', date: '2025-01-01' }] },
    });
    expect(readImport(text, opts())).toMatchObject({ ok: true, dropped: 1 });
  });
});

describe('v0.2 import', () => {
  const result = readImport(fixture('v02-export.json'), opts());

  it('is detected and keeps valid records', () => {
    expect(result).toMatchObject({ ok: true, source: 'v0.2' });
    if (!result.ok) return;
    const { data } = result;
    expect(data.cases.map((c) => c.receipt)).toEqual(['EAC0999000777', 'WAC0999000888']);
    expect(result.dropped).toBe(2);
  });

  it('maps case fields and history', () => {
    if (!result.ok) return;
    const [pat, kim] = result.data.cases;
    expect(pat).toMatchObject({
      id: 'c1',
      form: 'I-751',
      owner: 'Pat',
      receivedDate: '2024-11-01',
      processingMonths: 18,
      notes: 'Old notes',
    });
    expect(pat!.manual).toMatchObject([{ date: '2024-11-01', status: 'biometrics' }]);
    expect(pat!.uscis).toMatchObject({
      lastSyncedAt: '2025-01-10T09:00:00.000Z',
      notices: [{ letterId: 'X' }],
      newKeys: [],
    });
    expect(pat!.uscis!.knownKeys).toEqual(['IAF|2024-11-01T12:00:00.000Z']);
    expect(kim).toMatchObject({ form: 'I-129', owner: 'Kim' });
    expect(kim!.manual.map((m) => m.status)).toEqual(['received', 'rfe']);
    expect(currentStatus(kim!, 'UTC')).toBe('rfe');
  });

  it('maps deadlines, series, visa, checklists, sources, fees, and prefs', () => {
    if (!result.ok) return;
    const d = result.data;
    expect(d.deadlines).toMatchObject([
      { caseId: 'c2', title: 'Respond to RFE', date: '2025-05-20', done: false },
    ]);
    expect(d.series.map((s) => [s.name, s.points])).toEqual([
      [
        'My office',
        [
          { date: '2025-01-01', value: 12 },
          { date: '2025-02-01', value: 12.5 },
        ],
      ],
      ['Other', [{ date: '2025-01-01', value: 7 }]],
    ]);
    expect(d.visa).toEqual({
      priorityDate: '2021-06-01',
      category: 'EB-2',
      demo: false,
      cutoffs: [
        { month: '2025-01', cutoff: '2020-01-01' },
        { month: '2025-02', cutoff: 'C' },
      ],
    });
    expect(d.checklists).toEqual({ i485: ['photos'], n400: ['fee'] });
    expect(d.sourceChecks).toEqual({ newsroom: '2025-04-01T00:00:00.000Z' });
    expect(d.fees).toMatchObject([{ label: 'I-485 filing', cents: 144000 }]);
    expect(d.prefs).toEqual({
      theme: 'dark',
      highContrast: true,
      seed: '#e0457b',
      maskReceipts: true,
      timeZone: '',
      publicData: false,
    });
  });

  it('migrates an object directly', () => {
    expect(migrateV02({ cases: [] }, opts()).cases).toEqual([]);
  });
});

describe('sanitizeData', () => {
  it('drops duplicate receipts, orphan case links, and invalid prefs', () => {
    const data = sanitizeData(
      {
        cases: [
          { id: 'a', receipt: 'IOE0999000111', receivedDate: '2025-01-01', form: 'I485' },
          { id: 'b', receipt: 'IOE0999000111', receivedDate: '2025-01-01' },
        ],
        deadlines: [{ id: 'd', caseId: 'gone', title: 'T', date: '2025-01-01' }],
        prefs: { theme: 'neon', seed: 'red', timeZone: 'Mars/Base' },
      },
      idFactory(),
      NOW,
    );
    expect(data.cases).toHaveLength(1);
    expect(data.cases[0]!.form).toBe('I-485');
    expect(data.deadlines[0]!.caseId).toBeUndefined();
    expect(data.prefs).toEqual(emptyData().prefs);
  });

  it('keeps a valid time zone', () => {
    expect(
      sanitizeData({ prefs: { timeZone: 'America/Chicago' } }, idFactory(), NOW).prefs.timeZone,
    ).toBe('America/Chicago');
  });
});

describe('exampleData', () => {
  it('is valid, labeled demo, and covers several tones', () => {
    const demo = exampleData('2025-07-15', idFactory(), NOW);
    const data = sanitizeData({ ...demo }, idFactory('x'), NOW);
    expect(data.cases).toHaveLength(3);
    expect(data.cases.every((c) => c.demo)).toBe(true);
    expect(data.series.every((s) => s.demo)).toBe(true);
    expect(data.visa.demo).toBe(true);
    expect(data.cases.map((c) => currentStatus(c, 'UTC'))).toEqual([
      'interview',
      'card_prod',
      'review',
    ]);
    expect(data.cases.every((c) => /^[A-Z]{3}0{9}\d$/.test(c.receipt))).toBe(true);
  });
});
