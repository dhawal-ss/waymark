// Optional sync through a Waymark sync server that checks receipts with the official USCIS Case
// Status API. Off by default. Only receipt numbers of cases the user chooses are sent. The sync
// key is stored outside the exported data because it is a credential.
import { describeMerge, type ParsedCase } from '@waymark/core';
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
  busy: boolean;
  lastPullAt: string;
  error: string;
  subscriptions: Record<string, SubscriptionView>;
}

export const serverSync: SyncState = $state({
  url: DEFAULT_SERVER_URL,
  token: '',
  cursor: 0,
  environment: '',
  busy: false,
  lastPullAt: '',
  error: '',
  subscriptions: {},
});

export const syncEnabled = (): boolean => Boolean(serverSync.token && serverSync.url);

export class SyncError extends Error {}

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
  const saved: Saved | undefined = serverSync.token
    ? {
        url: serverSync.url,
        token: serverSync.token,
        cursor: serverSync.cursor,
        environment: serverSync.environment,
      }
    : undefined;
  await saveSetting(SETTING, saved);
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
    throw new SyncError(body?.error?.message ?? `The sync server returned HTTP ${res.status}.`);
  return body as T;
}

function remember(subs: SubscriptionView[]): void {
  serverSync.subscriptions = Object.fromEntries(subs.map((s) => [s.id, s]));
}

/** Load saved settings and start pulling. Call once after the data store is ready. */
export async function initServerSync(): Promise<void> {
  const saved = await loadSetting<Saved>(SETTING);
  if (saved?.token && saved.url) {
    serverSync.url = saved.url;
    serverSync.token = saved.token;
    serverSync.cursor = saved.cursor ?? 0;
    serverSync.environment = saved.environment ?? '';
    void pull({ quiet: true });
  }
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

async function run<T>(task: () => Promise<T>): Promise<T | null> {
  serverSync.busy = true;
  serverSync.error = '';
  try {
    return await task();
  } catch (e) {
    serverSync.error = e instanceof Error ? e.message : 'Server sync failed.';
    return null;
  } finally {
    serverSync.busy = false;
  }
}

/** Create an anonymous account on the server. */
export async function enableServerSync(rawUrl: string): Promise<boolean> {
  const url = normalizeServerUrl(rawUrl);
  if (!url) {
    serverSync.error = 'Enter the server address starting with https://.';
    return false;
  }
  serverSync.url = url;
  const ok = await run(async () => {
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
    return true;
  });
  if (ok) showSnackbar('Server sync is on. Choose which cases to track on each case page.');
  return Boolean(ok);
}

/** Use the sync key from another device. */
export async function useSyncKey(rawUrl: string, key: string): Promise<boolean> {
  const url = normalizeServerUrl(rawUrl);
  if (!url) {
    serverSync.error = 'Enter the server address starting with https://.';
    return false;
  }
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
    remember(subscriptions);
    linkTracking(subscriptions);
    await persist();
    return true;
  });
  if (ok) await pull({ quiet: false });
  return Boolean(ok);
}

/** Delete the server account and everything it tracks, and stop syncing. */
export async function disableServerSync(): Promise<void> {
  if (serverSync.token) {
    await run(() => api('/v1/account', { method: 'DELETE' })).catch(() => undefined);
  }
  serverSync.token = '';
  serverSync.cursor = 0;
  serverSync.subscriptions = {};
  serverSync.environment = '';
  clearTracking();
  await persist();
  showSnackbar('Server sync is off. The server deleted your receipt numbers and results.');
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

export async function trackCase(caseId: string): Promise<void> {
  const c = store.data.cases.find((x) => x.id === caseId);
  if (!c || !syncEnabled()) return;
  await run(async () => {
    const res = await api<{ subscription: SubscriptionView; latest: { case: ParsedCase } | null }>(
      '/v1/subscriptions',
      {
        method: 'POST',
        body: JSON.stringify({ receipt: c.receipt }),
      },
    );
    serverSync.subscriptions[res.subscription.id] = res.subscription;
    mutate((d) => {
      const target = d.cases.find((x) => x.id === caseId);
      if (target)
        target.serverTracking = { subscriptionId: res.subscription.id, since: nowInstant() };
    });
    mergeLatest(res.latest);
    showSnackbar(
      res.subscription.lastError
        ? `Tracking ${c.receipt}, but USCIS returned an error: ${res.subscription.lastError}`
        : `Tracking ${c.receipt} through the official API.`,
    );
  });
}

export async function untrackCase(caseId: string): Promise<void> {
  const c = store.data.cases.find((x) => x.id === caseId);
  const id = c?.serverTracking?.subscriptionId;
  if (!c || !id) return;
  await run(async () => {
    await api(`/v1/subscriptions/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(
      (e: unknown) => {
        // Already gone on the server is fine.
        if (!(e instanceof SyncError && /not tracked/.test(e.message))) throw e;
      },
    );
    delete serverSync.subscriptions[id];
    mutate((d) => {
      const target = d.cases.find((x) => x.id === caseId);
      if (target) delete target.serverTracking;
    });
    showSnackbar(`Stopped tracking ${c.receipt}. The server deleted it.`);
  });
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

/** Fetch results that changed since the last pull and merge them. */
export async function pull({ quiet }: { quiet: boolean }): Promise<void> {
  if (!syncEnabled() || serverSync.busy) return;
  await run(async () => {
    const res = await api<{
      cursor: number;
      items: { subscriptionId: string; case: ParsedCase }[];
      subscriptions: SubscriptionView[];
    }>(`/v1/updates?after=${serverSync.cursor}`);
    remember(res.subscriptions);
    const summary = mergeFromServer(res.items.map((i) => i.case));
    serverSync.cursor = res.cursor;
    serverSync.lastPullAt = nowInstant();
    await persist();
    const newEvents = summary?.updated.reduce((n, u) => n + u.newEvents, 0) ?? 0;
    if (summary && newEvents > 0 && !quiet) showSnackbar(describeMerge(summary));
  });
}
