import 'fake-indexeddb/auto';
import { emptyData, exampleData, SCHEMA_VERSION } from '@waymark/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DB_VERSION, loadAll, openWaymarkDb, saveAll } from '../src/lib/db';

const NOW = '2025-07-15T12:00:00.000Z';
let n = 0;
const makeId = () => `id${++n}`;

async function freshStore() {
  vi.resetModules();
  return import('../src/lib/stores/data.svelte');
}

beforeEach(async () => {
  localStorage.clear();
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('waymark');
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
});

describe('IndexedDB layer', () => {
  it('creates the stores and round trips data', async () => {
    const db = await openWaymarkDb('roundtrip');
    expect(db.version).toBe(DB_VERSION);
    expect([...db.objectStoreNames].sort()).toEqual(['cases', 'deadlines', 'kv', 'series']);
    const data = { ...emptyData(), ...exampleData('2025-07-15', makeId, NOW) };
    await saveAll(db, data, SCHEMA_VERSION);
    const { schema, raw } = await loadAll(db);
    expect(schema).toBe(SCHEMA_VERSION);
    expect(raw.cases).toHaveLength(3);
    expect(raw.visa).toEqual(data.visa);
    db.close();
  });

  it('replaces removed records on save', async () => {
    const db = await openWaymarkDb('replace');
    const data = { ...emptyData(), ...exampleData('2025-07-15', makeId, NOW) };
    await saveAll(db, data, SCHEMA_VERSION);
    await saveAll(db, { ...data, cases: data.cases.slice(0, 1) }, SCHEMA_VERSION);
    expect((await loadAll(db)).raw.cases).toHaveLength(1);
    db.close();
  });
});

describe('data store', () => {
  it('persists changes and loads them in a new session', async () => {
    const a = await freshStore();
    await a.initData();
    expect(a.store.ready).toBe(true);
    a.mutate((d) => {
      d.fees.push({ id: 'f1', label: 'Filing fee', cents: 1000 });
      d.prefs.theme = 'dark';
    });
    await a.flushSaves();

    const b = await freshStore();
    await b.initData();
    expect(b.store.data.fees).toEqual([{ id: 'f1', label: 'Filing fee', cents: 1000 }]);
    expect(b.store.data.prefs.theme).toBe('dark');
    expect(JSON.parse(localStorage.getItem('waymark:prefs')!).theme).toBe('dark');
  });

  it('keeps localStorage prefs on a fresh database', async () => {
    localStorage.setItem('waymark:prefs', JSON.stringify({ theme: 'light', seed: '#4f46e5' }));
    const s = await freshStore();
    await s.initData();
    expect(s.store.data.prefs).toMatchObject({ theme: 'light', seed: '#4f46e5' });
  });

  it('undoes a change from the snackbar action', async () => {
    const s = await freshStore();
    const snack = await import('../src/lib/stores/snackbar.svelte');
    await s.initData();
    s.mutate((d) => d.fees.push({ id: 'f1', label: 'A', cents: 1 }));
    s.mutate((d) => (d.fees = []), { undo: 'Deleted the fee.' });
    expect(s.store.data.fees).toHaveLength(0);
    expect(snack.snackbar.current?.text).toBe('Deleted the fee.');
    snack.snackbar.current?.action?.run();
    expect(s.store.data.fees).toHaveLength(1);
    await s.flushSaves();
    const again = await freshStore();
    await again.initData();
    expect(again.store.data.fees).toHaveLength(1);
  });

  it('offers v0.2 data found in localStorage', async () => {
    localStorage.setItem('waymark:v1', '{"cases":[]}');
    const s = await freshStore();
    await s.initData();
    expect(s.store.legacy).toBe('{"cases":[]}');
  });
});
