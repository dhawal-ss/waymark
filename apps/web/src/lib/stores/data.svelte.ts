// App data held in memory as deep reactive state and persisted to IndexedDB after every change.
import {
  emptyData,
  migrateData,
  sanitizeData,
  sanitizePrefs,
  SCHEMA_VERSION,
  V02_STORAGE_KEY,
  type AppData,
} from '@waymark/core';
import type { IDBPDatabase } from 'idb';
import { loadAll, openWaymarkDb, readSetting, saveAll, writeSetting, type WaymarkDB } from '../db';
import { readJson, removeKey, writeJson } from '../storage';
import { showSnackbar } from './snackbar.svelte';

export const PREFS_KEY = 'waymark:prefs';
/**
 * Copies of data whose IndexedDB write had not finished when a page was hidden or closed, one per
 * tab (the key ends with the tab id).
 */
export const UNSAVED_PREFIX = 'waymark:unsaved:';

export const newId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

const UNSAVED_KEY = `${UNSAVED_PREFIX}${newId()}`;

// eslint-disable-next-line svelte/prefer-svelte-reactivity -- a timestamp, not reactive state
export const nowInstant = (): string => new Date().toISOString();

interface StoreState {
  data: AppData;
  ready: boolean;
  /** Set when storage failed; the app keeps working in memory. */
  storageError: string;
  /** Raw v0.2 data found in this browser, offered for import while there are no cases. */
  legacy: string | null;
}

function initialData(): AppData {
  const data = emptyData();
  data.prefs = sanitizePrefs(readJson(PREFS_KEY));
  return data;
}

export const store: StoreState = $state({
  data: initialData(),
  ready: false,
  storageError: '',
  legacy: null,
});

let db: IDBPDatabase<WaymarkDB> | null = null;
let saving: Promise<void> = Promise.resolve();
let saveQueued = false;
let channel: BroadcastChannel | null = null;
let persistRequested = false;

function mirrorPrefs(): void {
  writeJson(PREFS_KEY, $state.snapshot(store.data.prefs));
}

// Counts changes, so a reload that finishes after a newer change does not overwrite it.
let changes = 0;
// The change count covered by the last finished write.
let saved = 0;

/**
 * IndexedDB writes are asynchronous, so closing the app or reloading right after a change can
 * abort the write. When the page is hidden with a write pending, keep a synchronous copy in
 * localStorage; the next start saves it and removes it.
 */
function keepUnsaved(): void {
  if (!db || saved === changes) return;
  writeJson(UNSAVED_KEY, {
    schema: SCHEMA_VERSION,
    at: Date.now(),
    data: $state.snapshot(store.data),
  });
}

/** Keys of unsaved copies left by tabs that closed. */
function unsavedKeys(): string[] {
  try {
    return Object.keys(localStorage).filter((k) => k.startsWith(UNSAVED_PREFIX));
  } catch {
    return [];
  }
}

function restoreUnsaved(): void {
  let newest: { at: number; data: unknown } | null = null;
  for (const key of unsavedKeys()) {
    const copy = readJson<{ schema?: unknown; at?: unknown; data?: unknown }>(key);
    removeKey(key);
    if (!copy || copy.schema !== SCHEMA_VERSION || !copy.data || typeof copy.at !== 'number')
      continue;
    if (!newest || copy.at > newest.at) newest = { at: copy.at, data: copy.data };
  }
  if (!newest) return;
  // Stored data is untrusted input, like imports.
  store.data = sanitizeData(newest.data, newId, nowInstant());
  mirrorPrefs();
  changes++;
  scheduleSave();
}

async function load(): Promise<void> {
  if (!db) return;
  const started = changes;
  const { schema, raw } = await loadAll(db);
  // Nothing saved yet: keep the prefs mirrored from localStorage.
  if (schema === null || changes !== started) return;
  const migrated = schema !== null && schema < SCHEMA_VERSION ? migrateData(raw, schema) : raw;
  const data = sanitizeData(migrated, newId, nowInstant());
  if (raw.prefs === undefined) data.prefs = store.data.prefs;
  store.data = data;
  undoLog = null;
  mirrorPrefs();
}

/** Open storage and load data. Safe to call once at startup. */
export async function initData(): Promise<void> {
  try {
    db = await openWaymarkDb(undefined, () => {
      db = null;
      store.storageError =
        'Waymark was updated or reset in another tab. Reload this tab to keep saving changes.';
    });
    await load();
    restoreUnsaved();
    addEventListener('pagehide', keepUnsaved);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') keepUnsaved();
    });
  } catch {
    // Never save over data that could not be read.
    db?.close();
    db = null;
    store.storageError =
      'This browser blocked local storage, so changes will be lost when you close the tab. Turn off private browsing or allow site data, then reload.';
  }
  try {
    store.legacy = localStorage.getItem(V02_STORAGE_KEY);
  } catch {
    store.legacy = null;
  }
  if (typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel('waymark');
    channel.onmessage = () => {
      if (!saveQueued) void load();
    };
  }
  store.ready = true;
}

function scheduleSave(): void {
  mirrorPrefs();
  if (saveQueued) return;
  saveQueued = true;
  saving = saving.then(async () => {
    await Promise.resolve();
    saveQueued = false;
    if (!db) return;
    const upTo = changes;
    try {
      await saveAll(db, $state.snapshot(store.data) as AppData, SCHEMA_VERSION);
      saved = Math.max(saved, upTo);
      if (saved === changes) removeKey(UNSAVED_KEY);
      channel?.postMessage('changed');
      if (!persistRequested && navigator.storage?.persist) {
        persistRequested = true;
        void navigator.storage.persist().catch(() => undefined);
      }
    } catch {
      store.storageError =
        'Saving failed. Free up space on this device or export your data, then reload.';
    }
  });
}

/** Read a setting stored outside the exported data. */
export async function loadSetting<T>(key: string): Promise<T | undefined> {
  if (!db) return undefined;
  try {
    return await readSetting<T>(db, key);
  } catch {
    return undefined;
  }
}

/** Store a setting outside the exported data. `undefined` removes it. */
export async function saveSetting(key: string, value: unknown): Promise<void> {
  if (!db) return;
  try {
    await writeSetting(db, key, value);
  } catch {
    store.storageError =
      'Saving failed. Free up space on this device or export your data, then reload.';
  }
}

/** Resolves when pending writes have finished. */
export function flushSaves(): Promise<void> {
  return saving;
}

export interface MutateOptions {
  /** Snackbar text, or a function that returns it after the change. The snackbar offers Undo. */
  undo?: string | (() => string);
  /** Snackbar text without an undo action. */
  message?: string;
  /** Runs after Undo restores the data, for state kept outside AppData. */
  onUndo?: () => void;
}

/** Remove the Waymark v0.2 copy from localStorage. */
export function forgetLegacy(): void {
  try {
    localStorage.removeItem(V02_STORAGE_KEY);
  } catch {
    // Storage blocked: nothing was stored either.
  }
  store.legacy = null;
}

/** Put the Waymark v0.2 copy back, for Undo. */
export function restoreLegacy(text: string): void {
  try {
    localStorage.setItem(V02_STORAGE_KEY, text);
  } catch {
    // Storage blocked.
  }
  store.legacy = text;
}

type Change = (data: AppData) => void;

// The last undoable change: the state before it and the changes made since, which Undo replays so
// it reverts only that change.
let undoLog: { before: AppData; later: Change[] } | null = null;

/** Change data in place and persist it. With `undo`, the previous state can be restored. */
export function mutate(change: Change, options: MutateOptions = {}): void {
  changes++;
  const before = options.undo ? ($state.snapshot(store.data) as AppData) : null;
  change(store.data);
  scheduleSave();
  if (before && options.undo) {
    const log = { before, later: [] as Change[] };
    undoLog = log;
    const text = typeof options.undo === 'function' ? options.undo() : options.undo;
    showSnackbar(text, {
      label: 'Undo',
      run: () => {
        if (undoLog !== log) return;
        undoLog = null;
        changes++;
        const next = structuredClone(log.before);
        for (const later of log.later) {
          try {
            later(next);
          } catch {
            // A later change that depended on the undone one no longer applies.
          }
        }
        store.data = next;
        scheduleSave();
        options.onUndo?.();
        showSnackbar('Undone.');
      },
    });
  } else {
    undoLog?.later.push(change);
    if (options.message) showSnackbar(options.message);
  }
}

/** Replace all data, for import and delete everything. */
export function replaceAll(data: AppData, options: MutateOptions = {}): void {
  mutate((d) => Object.assign(d, data), options);
}

export function tz(): string | undefined {
  return store.data.prefs.timeZone || undefined;
}
