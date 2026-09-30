// IndexedDB persistence. Structural upgrades are versioned by DB_VERSION; data shape changes are
// versioned separately by SCHEMA_VERSION in @waymark/core and applied on load.
import type { AppData, Case, Deadline, Series } from '@waymark/core';
import {
  openDB,
  type DBSchema,
  type IDBPDatabase,
  type IDBPTransaction,
  type StoreNames,
} from 'idb';

export const DB_NAME = 'waymark';
export const DB_VERSION = 1;

export interface WaymarkDB extends DBSchema {
  cases: { key: string; value: Case };
  deadlines: { key: string; value: Deadline };
  series: { key: string; value: Series };
  kv: { key: string; value: unknown };
}

type Upgrade = (
  db: IDBPDatabase<WaymarkDB>,
  tx: IDBPTransaction<WaymarkDB, StoreNames<WaymarkDB>[], 'versionchange'>,
) => void;

/** UPGRADES[n] moves the database from version n to n + 1. Never edit a shipped step. */
export const UPGRADES: Upgrade[] = [
  (db) => {
    db.createObjectStore('cases', { keyPath: 'id' });
    db.createObjectStore('deadlines', { keyPath: 'id' });
    db.createObjectStore('series', { keyPath: 'id' });
    db.createObjectStore('kv');
  },
];

/**
 * Open the database. When another tab needs to upgrade or delete it, this connection closes
 * and `onBlocking` runs so the UI can ask for a reload.
 */
export async function openWaymarkDb(
  name = DB_NAME,
  onBlocking?: () => void,
): Promise<IDBPDatabase<WaymarkDB>> {
  const db = await openDB<WaymarkDB>(name, DB_VERSION, {
    upgrade(db, oldVersion, newVersion, tx) {
      for (let v = oldVersion; v < (newVersion ?? DB_VERSION); v++) UPGRADES[v]?.(db, tx);
    },
    blocking() {
      db.close();
      onBlocking?.();
    },
  });
  return db;
}

const KV_KEYS = ['visa', 'checklists', 'sourceChecks', 'fees', 'prefs'] as const;

/** Raw stored data plus its schema version. Validate with sanitizeData before use. */
export async function loadAll(
  db: IDBPDatabase<WaymarkDB>,
): Promise<{ schema: number | null; raw: Record<string, unknown> }> {
  const tx = db.transaction(['cases', 'deadlines', 'series', 'kv'], 'readonly');
  const [cases, deadlines, series, schema, ...kv] = await Promise.all([
    tx.objectStore('cases').getAll(),
    tx.objectStore('deadlines').getAll(),
    tx.objectStore('series').getAll(),
    tx.objectStore('kv').get('schema'),
    ...KV_KEYS.map((k) => tx.objectStore('kv').get(k)),
  ]);
  await tx.done;
  const raw: Record<string, unknown> = { cases, deadlines, series };
  KV_KEYS.forEach((k, i) => {
    if (kv[i] !== undefined) raw[k] = kv[i];
  });
  return { schema: typeof schema === 'number' ? schema : null, raw };
}

/** Settings kept outside AppData (never exported), such as the sync server key. */
export async function readSetting<T>(
  db: IDBPDatabase<WaymarkDB>,
  key: string,
): Promise<T | undefined> {
  return (await db.get('kv', `setting:${key}`)) as T | undefined;
}

export async function writeSetting(
  db: IDBPDatabase<WaymarkDB>,
  key: string,
  value: unknown,
): Promise<void> {
  if (value === undefined) await db.delete('kv', `setting:${key}`);
  else await db.put('kv', value, `setting:${key}`);
}

/** Replace everything stored with `data` in one transaction. */
export async function saveAll(
  db: IDBPDatabase<WaymarkDB>,
  data: AppData,
  schema: number,
): Promise<void> {
  const tx = db.transaction(['cases', 'deadlines', 'series', 'kv'], 'readwrite');
  const cases = tx.objectStore('cases');
  const deadlines = tx.objectStore('deadlines');
  const series = tx.objectStore('series');
  const kv = tx.objectStore('kv');
  await Promise.all([cases.clear(), deadlines.clear(), series.clear()]);
  await Promise.all([
    ...data.cases.map((c) => cases.put(c)),
    ...data.deadlines.map((d) => deadlines.put(d)),
    ...data.series.map((s) => series.put(s)),
    kv.put(schema, 'schema'),
    ...KV_KEYS.map((k) => kv.put(data[k], k)),
  ]);
  await tx.done;
}
