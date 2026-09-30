// In-memory stand-in for the Waymark sync server, served through Playwright request routing.
import type { Page, Route } from '@playwright/test';

export const SYNC_URL = 'https://sync.test';

/** Public data served by the fake server. */
export interface PublicFixture {
  times: {
    form: string;
    office: string;
    subtype: string;
    label: string;
    points: { publishedDate: string; months: number }[];
  }[];
  bulletin: {
    chart: string;
    preference: string;
    category: string;
    country: string;
    points: { month: string; cutoff: string }[];
  }[];
  stats: {
    quarter: string;
    form: string;
    office: string;
    received: number | null;
    approved: number | null;
    denied: number | null;
    pending: number | null;
  }[];
}

/** One news item as the server sends it. */
export interface NewsFixtureItem {
  id: string;
  source: 'federal-register' | 'uscis-feed';
  kind: string;
  title: string;
  summary: string;
  url: string;
  publishedOn: string;
  category: string;
  forms: string[];
}

const FR = 'https://www.federalregister.gov/documents';

/**
 * Realistic mixed items, newest first: several categories, items for the forms of the example
 * cases (I-485, I-765, I-130), one long title, one empty summary, and one with a link that is not
 * on an official domain (the app must drop it).
 */
export function newsFixture(): NewsFixtureItem[] {
  return [
    {
      id: 'federal-register:2026-18211',
      source: 'federal-register',
      kind: 'Rule',
      title: 'Employment Authorization for Certain Renewal Applicants Filing Form I-765',
      summary:
        'The Department of Homeland Security is amending its regulations on the automatic extension of employment authorization for certain applicants who file a timely renewal.',
      url: `${FR}/2026/09/28/2026-18211/employment-authorization-for-certain-renewal-applicants`,
      publishedOn: '2026-09-28',
      category: 'work',
      forms: ['I-765'],
    },
    {
      id: 'uscis-feed:news-2026-09-26-visa-bulletin',
      source: 'uscis-feed',
      kind: 'News release',
      title: 'USCIS announces which chart applies for adjustment of status filing in October',
      summary:
        'USCIS is using the Dates for Filing chart from the Department of State October Visa Bulletin for family-sponsored and employment-based filings.',
      url: 'https://www.uscis.gov/newsroom/alerts/uscis-announces-chart-for-october',
      publishedOn: '2026-09-26',
      category: 'visa',
      forms: ['I-485'],
    },
    {
      id: 'federal-register:2026-18004',
      source: 'federal-register',
      kind: 'Notice',
      title:
        'Agency Information Collection Activities: Application to Register Permanent Residence',
      summary:
        'U.S. Citizenship and Immigration Services invites comments on a revision of a currently approved information collection.',
      url: `${FR}/2026/09/24/2026-18004/agency-information-collection-activities`,
      publishedOn: '2026-09-24',
      category: 'forms',
      forms: ['I-485', 'I-765'],
    },
    {
      id: 'uscis-feed:news-2026-09-22-scam',
      source: 'uscis-feed',
      kind: 'News release',
      title: 'USCIS warns about scam callers who ask for payment by gift card',
      summary: '',
      url: 'https://www.uscis.gov/scams-fraud-and-misconduct/avoid-scams',
      publishedOn: '2026-09-22',
      category: 'safety',
      forms: [],
    },
    {
      id: 'federal-register:2026-17750',
      source: 'federal-register',
      kind: 'Proposed Rule',
      title:
        'Inadmissibility on Public Charge Grounds: Proposed Revisions to Definitions, Evidence Standards, and the Factors Officers Consider When Reviewing Applications for Adjustment of Status and Extension of Nonimmigrant Stay',
      summary:
        'DHS proposes to revise how it defines public charge and which evidence applicants may submit. Comments are open for 60 days.',
      url: `${FR}/2026/09/19/2026-17750/inadmissibility-on-public-charge-grounds`,
      publishedOn: '2026-09-19',
      category: 'policy',
      forms: ['I-485', 'I-539'],
    },
    {
      id: 'uscis-feed:news-2026-09-17-naturalization',
      source: 'uscis-feed',
      kind: 'News release',
      title: 'USCIS welcomes new citizens during Constitution Week ceremonies',
      summary:
        'More than 100 naturalization ceremonies took place across the country during the week of September 17.',
      url: 'https://www.uscis.gov/newsroom/news-releases/constitution-week-ceremonies',
      publishedOn: '2026-09-17',
      category: 'citizenship',
      forms: ['N-400'],
    },
    {
      id: 'federal-register:2026-17402',
      source: 'federal-register',
      kind: 'Notice',
      title: 'Designation of a Country for Temporary Protected Status',
      summary:
        'The Secretary of Homeland Security is extending the designation and describes how current beneficiaries re-register.',
      url: `${FR}/2026/09/15/2026-17402/designation-of-a-country-for-temporary-protected-status`,
      publishedOn: '2026-09-15',
      category: 'humanitarian',
      forms: ['I-821', 'I-765'],
    },
    {
      id: 'uscis-feed:news-2026-09-12-processing',
      source: 'uscis-feed',
      kind: 'News release',
      title: 'USCIS updates how it reports processing times for family-based petitions',
      summary: 'Processing time pages now show the time it takes to complete 80% of cases.',
      url: 'https://www.uscis.gov/newsroom/news-releases/processing-time-reporting',
      publishedOn: '2026-09-12',
      category: 'processing',
      forms: ['I-130'],
    },
    {
      id: 'federal-register:2026-17010',
      source: 'federal-register',
      kind: 'Rule',
      title: 'Adjustment of the fee schedule for immigration benefit requests',
      summary: 'DHS is adjusting the fees that USCIS charges for immigration benefit requests.',
      url: `${FR}/2026/09/09/2026-17010/adjustment-of-the-fee-schedule`,
      publishedOn: '2026-09-09',
      category: 'fees',
      forms: [],
    },
    {
      id: 'uscis-feed:news-2026-09-05-not-official',
      source: 'uscis-feed',
      kind: 'News release',
      title: 'Item with a link that is not on an official domain',
      summary: 'The app must not show this item.',
      url: 'https://immigration-updates.example.com/not-official',
      publishedOn: '2026-09-05',
      category: 'other',
      forms: [],
    },
    {
      id: 'federal-register:2026-16650',
      source: 'federal-register',
      kind: 'Notice',
      title: 'Form I-90 edition date change',
      summary: 'USCIS will accept the previous edition of Form I-90 until the transition ends.',
      url: `${FR}/2026/09/02/2026-16650/form-i-90-edition-date-change`,
      publishedOn: '2026-09-02',
      category: 'forms',
      forms: ['I-90'],
    },
  ];
}

/** `count` older items for testing paging, newest first, starting on `start` (a YYYY-MM-DD date). */
export function olderNews(count: number, start = '2026-08-31'): NewsFixtureItem[] {
  const base = Date.parse(`${start}T00:00:00Z`);
  return Array.from({ length: count }, (_, i) => ({
    id: `federal-register:2026-${String(10000 - i).padStart(5, '0')}`,
    source: 'federal-register' as const,
    kind: 'Notice',
    title: `Older notice number ${i + 1}`,
    summary: `Summary of older notice number ${i + 1}.`,
    url: `${FR}/2026/08/01/2026-${String(10000 - i)}/older-notice-${i + 1}`,
    publishedOn: new Date(base - Math.floor(i / 2) * 86_400_000).toISOString().slice(0, 10),
    category: 'other',
    forms: [],
  }));
}

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
  options: {
    cases?: Record<string, ReturnType<typeof officialCase>>;
    public?: PublicFixture;
    news?: NewsFixtureItem[];
  } = {},
) {
  const state = {
    token: '',
    subs: [] as Sub[],
    cases: { ...options.cases },
    snapshots: [] as { id: number; receipt: string; case: unknown }[],
    deleted: false,
    requests: [] as string[],
    public: options.public ?? { times: [], bulletin: [], stats: [] },
    news: options.news ?? newsFixture(),
    /** The next this many news requests fail with an error. */
    newsFailures: 0,
    /** Query strings of news requests, for example "limit=40&before=2026-09-02&beforeId=...". */
    newsRequests: [] as string[],
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
    if (path === '/v1/public/news') {
      const q = url.searchParams;
      state.newsRequests.push(q.toString());
      if (state.newsFailures > 0) {
        state.newsFailures--;
        return json(route, 503, {
          error: {
            code: 'unavailable',
            message: 'The news source is unavailable. Try again in a few minutes.',
          },
        });
      }
      const limit = Math.min(100, Math.max(1, Number(q.get('limit') ?? 40) || 40));
      const before = q.get('before');
      const beforeId = q.get('beforeId');
      const category = q.get('category');
      const form = q.get('form');
      if (beforeId !== null && !/^[\w.:/-]{1,160}$/.test(beforeId))
        return json(route, 400, {
          error: { code: 'bad_request', message: 'beforeId is not a valid item id.' },
        });
      // Order is publishedOn descending, then id ascending. The cursor is the last item of the
      // previous page: its date and id. Items on the same date with a later id come next, so none
      // are repeated or skipped. `before` alone is exclusive by date.
      const items = state.news
        .filter(
          (n) =>
            (!before ||
              n.publishedOn < before ||
              (beforeId !== null && n.publishedOn === before && n.id > beforeId)) &&
            (!category || n.category === category) &&
            (!form || n.forms.includes(form)),
        )
        .sort(
          (a, b) =>
            b.publishedOn.localeCompare(a.publishedOn) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
        )
        .slice(0, limit);
      return json(route, 200, { items });
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
