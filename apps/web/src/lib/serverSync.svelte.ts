// Automatic checks through a Waymark sync server, which checks receipts with the official USCIS
// Case Status API. On when the app is built with a server address (VITE_SYNC_URL) or the user
// enters one, until the user turns it off. Only receipt numbers are sent; names, notes, and
// everything else stay on the device. The sync key is stored outside the exported data because it
// is a credential.
import {
  describeMerge,
  isValidReceipt,
  SUBSCRIPTION_ID,
  type Case,
  type ParsedCase,
} from '@waymark/core';
import { mergeFromServer } from './actions';
import { loadSetting, mutate, nowInstant, saveSetting, store } from './stores/data.svelte';
import { showSnackbar } from './stores/snackbar.svelte';

export const DEFAULT_SERVER_URL: string = import.meta.env.VITE_SYNC_URL ?? '';
const SETTING = 'serverSync';
const PULL_EVERY_MS = 30 * 60 * 1000;

interface Saved {
  url: string;
  token: string;
  cursor: number;
  environment: SyncState['environment'];
  /** The user turned automatic checks off. */
  off?: boolean;
}

export interface SubscriptionView {
  id: string;
  receipt: string;
  lastCheckedAt: string | null;
  lastError: string | null;
}

interface SyncState {
  url: string;
  token: string;
  cursor: number;
  environment: 'sandbox' | 'production' | '';
  off: boolean;
  busy: boolean;
  /** Why some cases are not tracked, for example the per-device limit. */
  limitNote: string;
  lastPullAt: string;
  error: string;
  subscriptions: Record<string, SubscriptionView>;
}

export const serverSync: SyncState = $state({
  url: DEFAULT_SERVER_URL,
  token: '',
  cursor: 0,
  environment: '',
  off: false,
  busy: false,
  limitNote: '',
  lastPullAt: '',
  error: '',
  subscriptions: {},
});

const ADDRESS_ERROR = 'Enter the server address starting with https://.';

/** The one server address field in Settings, shared by server sync and public data. */
export const serverAddress = $state({ draft: DEFAULT_SERVER_URL || 'https://', error: '' });

export const syncEnabled = (): boolean => Boolean(serverSync.token && serverSync.url);

/** Open cases that automatic checks should track but do not yet. Example cases are never sent. */
const needsTracking = (c: Case) => !c.serverTracking && !c.uscis?.closed && !c.demo;

/** Automatic checks can run: a server address is known and the user has not turned them off. */
export const autoChecks = (): boolean => Boolean(serverSync.url) && !serverSync.off;

export class SyncError extends Error {
  readonly status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.status = status;
  }
}

/** Accept https URLs, and http only for local development. */
export function normalizeServerUrl(raw: string): string | null {
  try {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- parsed once, not reactive state
    const url = new URL(raw.trim());
    const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) return null;
    return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
  } catch {
    return null;
  }
}

async function persist(): Promise<void> {
  // The address is kept even without an account, because public data needs only the address.
  const saved: Saved | undefined = serverSync.url
    ? {
        url: serverSync.url,
        token: serverSync.token,
        cursor: serverSync.cursor,
        environment: serverSync.environment,
        off: serverSync.off,
      }
    : undefined;
  await saveSetting(SETTING, saved);
}

/** Save a server address for public data without creating an account. */
export async function setServerUrl(rawUrl: string): Promise<boolean> {
  const url = normalizeServerUrl(rawUrl);
  if (!url) {
    serverAddress.error = ADDRESS_ERROR;
    return false;
  }
  serverAddress.error = '';
  // An address entered for public data alone does not turn on automatic checks.
  if (!serverSync.token && url !== serverSync.url) serverSync.off = true;
  serverSync.url = url;
  await persist();
  return true;
}

async function api<T>(path: string, init: RequestInit = {}, token = serverSync.token): Promise<T> {
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body) headers.set('Content-Type', 'application/json');
  let res: Response;
  try {
    res = await fetch(`${serverSync.url}${path}`, { ...init, headers });
  } catch {
    throw new SyncError(
      'The sync server did not respond. Check your connection or the server address.',
    );
  }
  if (res.status === 204) return undefined as T;
  const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
  if (!res.ok)
    throw new SyncError(
      body?.error?.message ?? `The sync server returned HTTP ${res.status}.`,
      res.status,
    );
  return body as T;
}

/** Keep only well-formed subscriptions from a server response. */
function validSubs(raw: unknown): SubscriptionView[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (s): s is SubscriptionView =>
      typeof s === 'object' &&
      s !== null &&
      typeof s.id === 'string' &&
      SUBSCRIPTION_ID.test(s.id) &&
      typeof s.receipt === 'string' &&
      isValidReceipt(s.receipt),
  );
}

function remember(subs: SubscriptionView[]): void {
  serverSync.subscriptions = Object.fromEntries(validSubs(subs).map((s) => [s.id, s]));
}

/** Load saved settings and start pulling. Call once after the data store is ready. */
export async function initServerSync(): Promise<void> {
  const saved = await loadSetting<Saved>(SETTING);
  if (saved?.url) serverSync.url = saved.url;
  // Records saved before automatic checks existed have no `off`: without an account, the user
  // had sync off (or set the address for public data only), so it stays off.
  serverSync.off = saved ? (saved.off ?? !saved.token) : false;
  if (serverSync.url) serverAddress.draft = serverSync.url;
  if (saved?.token && saved.url) {
    serverSync.token = saved.token;
    serverSync.cursor = saved.cursor ?? 0;
    serverSync.environment = saved.environment ?? '';
  }
  if (syncEnabled()) void pull({ quiet: true });
  // Cases added before automatic checks were available are tracked from now on.
  else if (autoChecks() && store.data.cases.some(needsTracking)) void startAutoChecks();
  setInterval(() => {
    if (syncEnabled() && document.visibilityState === 'visible') void pull({ quiet: false });
  }, PULL_EVERY_MS);
  document.addEventListener('visibilitychange', () => {
    const stale =
      !serverSync.lastPullAt || Date.now() - Date.parse(serverSync.lastPullAt) > PULL_EVERY_MS;
    if (document.visibilityState === 'visible' && syncEnabled() && stale)
      void pull({ quiet: false });
  });
}

// A pull asked for while another request runs happens right after it.
let pullAgain = false;
// Receipts being added right now: their subscriptions are not orphans yet.
// eslint-disable-next-line svelte/prefer-svelte-reactivity -- bookkeeping, not reactive state
const adding = new Set<string>();

let active = 0;

async function run<T>(task: () => Promise<T>): Promise<T | null> {
  active++;
  serverSync.busy = true;
  serverSync.error = '';
  try {
    return await task();
  } catch (e) {
    serverSync.error = e instanceof Error ? e.message : 'Server sync failed.';
    return null;
  } finally {
    active--;
    serverSync.busy = active > 0;
    if (active === 0 && pullAgain) {
      pullAgain = false;
      void pull({ quiet: true });
    }
  }
}

let creating: Promise<void> | null = null;

/** Create an anonymous account on the server, once. Throws a SyncError when it cannot. */
function ensureAccount(): Promise<void> {
  if (serverSync.token) return Promise.resolve();
  creating ??= createAccount().finally(() => (creating = null));
  return creating;
}

async function createAccount(): Promise<void> {
  const health = await api<{ environment: 'sandbox' | 'production'; uscisConfigured: boolean }>(
    '/v1/health',
    {},
    '',
  );
  serverSync.environment = health.environment;
  const account = await api<{ token: string }>('/v1/accounts', { method: 'POST' }, '');
  serverSync.token = account.token;
  serverSync.cursor = 0;
  // Cases tracked under an earlier account are no longer tracked.
  clearTracking();
  await persist();
}

async function startAutoChecks(): Promise<void> {
  const ok = await run(async () => {
    await ensureAccount();
    return true;
  });
  if (ok) await pull({ quiet: true });
}

/** Start tracking cases that were just added, when automatic checks are on. */
export function trackNewCases(): void {
  if (!autoChecks() || !store.data.cases.some(needsTracking)) return;
  void (syncEnabled() ? pull({ quiet: true }) : startAutoChecks());
}

/** Turn on automatic checks with the given server address and track every open case. */
export async function enableServerSync(rawUrl: string): Promise<boolean> {
  const url = normalizeServerUrl(rawUrl);
  if (!url) {
    serverAddress.error = ADDRESS_ERROR;
    return false;
  }
  serverAddress.error = '';
  if (url !== serverSync.url) serverSync.token = '';
  serverSync.url = url;
  serverSync.off = false;
  const ok = await run(async () => {
    await ensureAccount();
    return true;
  });
  if (!ok) return false;
  await pull({ quiet: true });
  showSnackbar('Automatic checks are on. Waymark checks your cases with USCIS twice a day.');
  return true;
}

export type Lookup = { ok: true; caseId: string } | { ok: false; message: string };

/**
 * Look up a receipt with the official API and add it as a case. Used by Add case, so the receipt
 * number is all the user enters.
 */
export async function lookupReceipt(receipt: string): Promise<Lookup> {
  if (!autoChecks()) return { ok: false, message: '' };
  adding.add(receipt);
  try {
    return await addFromServer(receipt);
  } finally {
    adding.delete(receipt);
  }
}

async function addFromServer(receipt: string): Promise<Lookup> {
  // Kept here: a pull that starts when this request ends clears serverSync.error.
  let failure = '';
  const res = await run(async () => {
    try {
      await ensureAccount();
      return await api<{ subscription: SubscriptionView; latest: { case: ParsedCase } | null }>(
        '/v1/subscriptions',
        { method: 'POST', body: JSON.stringify({ receipt }) },
      );
    } catch (e) {
      failure = e instanceof Error ? e.message : '';
      throw e;
    }
  });
  if (!res) return { ok: false, message: failure || 'The sync server did not respond.' };
  serverSync.subscriptions[res.subscription.id] = res.subscription;
  if (!res.latest) {
    return {
      ok: false,
      message:
        res.subscription.lastError ??
        'USCIS did not answer. Try again in a few minutes, or get the details from your USCIS account.',
    };
  }
  mergeFromServer([res.latest.case], { add: receipt });
  const c = store.data.cases.find((x) => x.receipt === receipt);
  if (!c) return { ok: false, message: 'The USCIS answer could not be read.' };
  link(c.id, res.subscription.id);
  return { ok: true, caseId: c.id };
}

function link(caseId: string, subscriptionId: string): void {
  mutate((d) => {
    const target = d.cases.find((x) => x.id === caseId);
    if (target) target.serverTracking = { subscriptionId, since: nowInstant() };
  });
}

/**
 * Track every open case that is not tracked yet. Stops quietly at the first error (for example the
 * per-device limit) and tries again at the next pull.
 */
async function trackMissing(): Promise<void> {
  serverSync.limitNote = '';
  for (const c of store.data.cases.filter(needsTracking)) {
    try {
      const res = await api<{
        subscription: SubscriptionView;
        latest: { case: ParsedCase } | null;
      }>('/v1/subscriptions', { method: 'POST', body: JSON.stringify({ receipt: c.receipt }) });
      serverSync.subscriptions[res.subscription.id] = res.subscription;
      link(c.id, res.subscription.id);
      if (res.latest) mergeFromServer([res.latest.case]);
    } catch (e) {
      if (e instanceof SyncError && e.status === 409) serverSync.limitNote = e.message;
      return;
    }
  }
}

/** Use the sync key from another device. */
export async function useSyncKey(rawUrl: string, key: string): Promise<boolean> {
  const url = normalizeServerUrl(rawUrl);
  if (!url) {
    serverAddress.error = ADDRESS_ERROR;
    return false;
  }
  serverAddress.error = '';
  serverSync.url = url;
  const ok = await run(async () => {
    const health = await api<{ environment: 'sandbox' | 'production' }>('/v1/health', {}, '');
    serverSync.environment = health.environment;
    const { subscriptions } = await api<{ subscriptions: SubscriptionView[] }>(
      '/v1/subscriptions',
      {},
      key.trim(),
    );
    serverSync.token = key.trim();
    serverSync.cursor = 0;
    serverSync.off = false;
    remember(subscriptions);
    linkTracking(subscriptions);
    await persist();
    return true;
  });
  if (ok) await pull({ quiet: false });
  return Boolean(ok);
}

/**
 * Delete the server account and everything it tracks, and stop syncing. Returns false, and keeps
 * the sync key so the user can try again, when the server did not confirm the deletion.
 */
export async function disableServerSync({
  quiet = false,
  turnOff = true,
}: { quiet?: boolean; turnOff?: boolean } = {}): Promise<boolean> {
  // An account still being created would otherwise survive turning off.
  await creating?.catch(() => undefined);
  if (serverSync.token) {
    const deleted = await run(async () => {
      try {
        await api('/v1/account', { method: 'DELETE' });
      } catch (e) {
        // 401: the account is already gone.
        if (!(e instanceof SyncError && e.status === 401)) throw e;
      }
      return true;
    });
    if (!deleted) {
      serverSync.error = `The server did not delete your data. ${serverSync.error} Try again when you are online.`;
      if (!quiet)
        showSnackbar('Automatic checks are still on. The server did not delete your data.');
      return false;
    }
  }
  serverSync.token = '';
  serverSync.cursor = 0;
  serverSync.subscriptions = {};
  serverSync.environment = '';
  if (turnOff) serverSync.off = true;
  clearTracking();
  await persist();
  if (!quiet)
    showSnackbar('Automatic checks are off. The server deleted your receipt numbers and results.');
  return true;
}

function clearTracking(): void {
  if (!store.data.cases.some((c) => c.serverTracking)) return;
  mutate((d) => {
    for (const c of d.cases) delete c.serverTracking;
  });
}

/** Point local cases at the server subscriptions with the same receipt. */
function linkTracking(subs: SubscriptionView[]): void {
  const byReceipt = new Map(subs.map((s) => [s.receipt, s.id]));
  mutate((d) => {
    for (const c of d.cases) {
      const id = byReceipt.get(c.receipt);
      if (id)
        c.serverTracking = { subscriptionId: id, since: c.serverTracking?.since ?? nowInstant() };
      else delete c.serverTracking;
    }
  });
}

function mergeLatest(latest: { case: ParsedCase } | null, quiet = true): void {
  if (!latest) return;
  const summary = mergeFromServer([latest.case]);
  if (summary && !quiet) showSnackbar(describeMerge(summary));
}

export async function refreshCase(caseId: string): Promise<void> {
  const id = store.data.cases.find((x) => x.id === caseId)?.serverTracking?.subscriptionId;
  if (!id) return;
  await run(async () => {
    const res = await api<{ subscription: SubscriptionView; latest: { case: ParsedCase } | null }>(
      `/v1/subscriptions/${encodeURIComponent(id)}/refresh`,
      { method: 'POST' },
    );
    serverSync.subscriptions[id] = res.subscription;
    const before = store.data.cases.find((x) => x.id === caseId)?.uscis?.events.length ?? 0;
    mergeLatest(res.latest, true);
    const after = store.data.cases.find((x) => x.id === caseId)?.uscis?.events.length ?? 0;
    showSnackbar(
      after > before
        ? `${after - before} new ${after - before === 1 ? 'event' : 'events'} from USCIS.`
        : 'Checked with USCIS. No new events.',
    );
  });
}

/** Cases linked to a subscription the server no longer has are tracked again on the next pull. */
function unlinkMissing(): void {
  const stale = (c: Case) =>
    c.serverTracking && !serverSync.subscriptions[c.serverTracking.subscriptionId];
  if (!store.data.cases.some(stale)) return;
  mutate((d) => {
    for (const c of d.cases) if (stale(c)) delete c.serverTracking;
  });
}

/** Stop tracking receipts whose case was deleted on this device, so they stop using quota. */
async function dropOrphans(): Promise<void> {
  for (const sub of Object.values(serverSync.subscriptions)) {
    // Checked each time: a case can be added (or restored with Undo) while this loop waits.
    if (store.data.cases.some((c) => c.receipt === sub.receipt) || adding.has(sub.receipt))
      continue;
    try {
      await api(`/v1/subscriptions/${encodeURIComponent(sub.id)}`, { method: 'DELETE' });
      delete serverSync.subscriptions[sub.id];
    } catch {
      // Tried again on the next pull.
    }
  }
}

/** Track new cases, then fetch results that changed since the last pull and merge them. */
export async function pull({ quiet }: { quiet: boolean }): Promise<void> {
  if (!syncEnabled()) return;
  if (serverSync.busy) {
    pullAgain = true;
    return;
  }
  await run(async () => {
    if (!serverSync.off) await trackMissing();
    const res = await api<{
      cursor: number;
      items: { subscriptionId: string; case: ParsedCase }[];
      subscriptions: SubscriptionView[];
    }>(`/v1/updates?after=${serverSync.cursor}`);
    remember(res.subscriptions);
    unlinkMissing();
    const summary = mergeFromServer(Array.isArray(res.items) ? res.items.map((i) => i?.case) : []);
    await dropOrphans();
    serverSync.cursor = res.cursor;
    serverSync.lastPullAt = nowInstant();
    await persist();
    const newEvents = summary?.updated.reduce((n, u) => n + u.newEvents, 0) ?? 0;
    if (summary && newEvents > 0 && !quiet) showSnackbar(describeMerge(summary));
  });
}
