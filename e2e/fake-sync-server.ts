// In-memory stand-in for the Waymark sync server, served through Playwright request routing.
import type { Page, Route } from '@playwright/test';

export const SYNC_URL = 'https://sync.test';

interface Sub {
  id: string;
  receipt: string;
  createdAt: string;
  lastCheckedAt: string | null;
  lastError: string | null;
}

export function officialCase(receipt: string, statuses: [string, string][]) {
  return {
    receipt,
    form: 'I-130',
    submittedAt: statuses[0]![1],
    updatedAt: statuses.at(-1)![1],
    channel: 'Case Status API',
    notices: [],
    events: statuses.map(([text, at]) => ({
      code: `CS:${text.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`,
      at,
      text,
    })),
  };
}

export async function fakeSyncServer(
  page: Page,
  options: { cases?: Record<string, ReturnType<typeof officialCase>> } = {},
) {
  const state = {
    token: '',
    subs: [] as Sub[],
    cases: { ...options.cases },
    snapshots: [] as { id: number; receipt: string; case: unknown }[],
    deleted: false,
    requests: [] as string[],
    public: options.public ?? { times: [], bulletin: [], stats: [] },
  };
  let serial = 0;
  const now = () => new Date().toISOString();
  const json = (route: Route, status: number, body?: unknown) =>
    route.fulfill({
      status,
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: body === undefined ? '' : JSON.stringify(body),
    });
  const latest = (receipt: string) => {
    const snap = [...state.snapshots].reverse().find((s) => s.receipt === receipt);
    return snap ? { case: snap.case, fetchedAt: now(), snapshotId: snap.id } : null;
  };
  const check = (sub: Sub) => {
    sub.lastCheckedAt = now();
    const c = state.cases[sub.receipt];
    if (!c) {
      sub.lastError = 'USCIS has no case with this receipt number in this environment.';
      return;
    }
    sub.lastError = null;
    const prev = latest(sub.receipt);
    if (!prev || JSON.stringify(prev.case) !== JSON.stringify(c))
      state.snapshots.push({ id: ++serial, receipt: sub.receipt, case: c });
  };

  await page.route(`${SYNC_URL}/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    state.requests.push(`${req.method()} ${path}`);
    if (req.method() === 'OPTIONS') return json(route, 204);
    if (path === '/v1/health')
      return json(route, 200, { ok: true, environment: 'sandbox', uscisConfigured: true });
    const pub = state.public;
    if (path === '/v1/public/status') {
      return json(route, 200, {
        enabled: true,
        datasets: [
          {
            dataset: 'processing-times',
            last_run_at: now(),
            last_success_at: now(),
            last_error: null,
          },
          {
            dataset: 'visa-bulletin',
            last_run_at: now(),
            last_success_at: now(),
            last_error: null,
          },
        ],
      });
    }
    if (path === '/v1/public/processing-times') {
      return json(route, 200, {
        source: 'https://egov.uscis.gov/processing-times/',
        items: pub.times.map((t) => {
          const last = t.points.at(-1);
          return {
            form: t.form,
            office: t.office,
            subtype: t.subtype,
            label: t.label,
            months: last?.months ?? null,
            lowMonths: null,
            publishedDate: last?.publishedDate ?? null,
            dateFromSource: true,
            lastSeenAt: now(),
            lastCheckedAt: now(),
            lastError: null,
          };
        }),
      });
    }
    if (path === '/v1/public/processing-times/history') {
      const q = url.searchParams;
      const t = pub.times.find(
        (x) =>
          x.form === q.get('form') &&
          x.office === q.get('office') &&
          x.subtype === (q.get('subtype') ?? ''),
      );
      return json(route, 200, {
        source: '',
        points: (t?.points ?? []).map((p) => ({
          ...p,
          dateFromSource: true,
          lowMonths: null,
          firstSeenAt: now(),
          lastSeenAt: now(),
        })),
      });
    }
    if (path === '/v1/public/visa-bulletin/options') {
      return json(route, 200, {
        months: [...new Set(pub.bulletin.flatMap((b) => b.points.map((p) => p.month)))].sort(),
        options: pub.bulletin.map(({ chart, preference, category, country }) => ({
          chart,
          preference,
          category,
          country,
        })),
      });
    }
    if (path === '/v1/public/visa-bulletin') {
      const q = url.searchParams;
      const b = pub.bulletin.find(
        (x) =>
          x.chart === q.get('chart') &&
          x.preference === q.get('preference') &&
          x.category === q.get('category') &&
          x.country === q.get('country'),
      );
      return json(route, 200, {
        points: (b?.points ?? []).map((p) => ({
          ...p,
          sourceUrl: 'https://travel.state.gov/',
          fetchedAt: now(),
        })),
      });
    }
    if (path === '/v1/public/form-stats') {
      const form = url.searchParams.get('form');
      if (!form) return json(route, 200, { forms: [...new Set(pub.stats.map((r) => r.form))] });
      return json(route, 200, {
        form,
        records: pub.stats
          .filter((r) => r.form === form)
          .map((r) => ({
            ...r,
            sourceUrl: 'https://www.uscis.gov/tools/reports-and-studies',
            importedAt: now(),
          })),
      });
    }
    if (path === '/v1/accounts' && req.method() === 'POST') {
      state.token = `token-${Math.random().toString(36).slice(2)}`;
      return json(route, 201, { accountId: 'acct_1', token: state.token });
    }
    if (req.headers()['authorization'] !== `Bearer ${state.token}`) {
      return json(route, 401, {
        error: {
          code: 'unauthorized',
          message: 'The sync key is not valid. Turn server sync off and on again.',
        },
      });
    }
    if (path === '/v1/account' && req.method() === 'DELETE') {
      state.deleted = true;
      state.subs = [];
      return json(route, 204);
    }
    if (path === '/v1/subscriptions' && req.method() === 'GET')
      return json(route, 200, { subscriptions: state.subs });
    if (path === '/v1/subscriptions' && req.method() === 'POST') {
      const { receipt } = req.postDataJSON() as { receipt: string };
      const sub: Sub = {
        id: `sub_${state.subs.length + 1}`,
        receipt,
        createdAt: now(),
        lastCheckedAt: null,
        lastError: null,
      };
      state.subs.push(sub);
      check(sub);
      return json(route, 201, { subscription: sub, latest: latest(receipt) });
    }
    const refresh = /^\/v1\/subscriptions\/([\w-]+)\/refresh$/.exec(path);
    if (refresh) {
      const sub = state.subs.find((s) => s.id === refresh[1]);
      if (!sub)
        return json(route, 404, {
          error: { code: 'not_found', message: 'This receipt is not tracked on the server.' },
        });
      check(sub);
      return json(route, 200, { subscription: sub, latest: latest(sub.receipt) });
    }
    const del = /^\/v1\/subscriptions\/([\w-]+)$/.exec(path);
    if (del && req.method() === 'DELETE') {
      state.subs = state.subs.filter((s) => s.id !== del[1]);
      return json(route, 204);
    }
    if (path === '/v1/updates') {
      const after = Number(url.searchParams.get('after') ?? 0);
      const items = state.subs.flatMap((s) => {
        const l = latest(s.receipt);
        return l && l.snapshotId > after
          ? [{ subscriptionId: s.id, fetchedAt: now(), case: l.case }]
          : [];
      });
      return json(route, 200, { cursor: serial, items, subscriptions: state.subs });
    }
    return json(route, 404, { error: { code: 'not_found', message: 'Unknown endpoint.' } });
  });

  return {
    state,
    /** Simulate a scheduled check that found a change. */
    change(receipt: string, next: ReturnType<typeof officialCase>) {
      state.cases[receipt] = next;
      for (const sub of state.subs.filter((s) => s.receipt === receipt)) check(sub);
    },
  };
}
