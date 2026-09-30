import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, type AppDeps } from '../src/app';
import { readConfig, type Env } from '../src/config';
import { createSealer, toBase64 } from '../src/crypto';
import { PublicStore } from '../src/publicStore';
import { Store } from '../src/store';
import { UscisClient } from '../src/uscis';
import { FakeD1 } from './d1';

export const ORIGIN = 'http://localhost:5173';

export const officialFixture = (): Record<string, unknown> =>
  JSON.parse(
    readFileSync(
      join(import.meta.dirname, '../../../packages/core/test/fixtures/official-response.json'),
      'utf8',
    ),
  );

export function officialBody(
  receipt: string,
  current = 'Case Was Received',
  modified = '09-05-2023 14:37:40',
) {
  return {
    case_status: {
      receiptNumber: receipt,
      formType: 'I-485',
      submittedDate: '09-05-2023 14:37:40',
      modifiedDate: modified,
      current_case_status_text_en: current,
      current_case_status_desc_en: 'Long description that must not be stored.',
      hist_case_status: [{ date: '09-05-2023 14:37:40', completed_text_en: 'Case Was Received' }],
    },
    message: 'Query was successful',
  };
}

/** Scripted USCIS API. Values are a response body, or an HTTP status to fail with. */
export function mockUscis(responses: Record<string, unknown>) {
  const calls = { token: 0, status: [] as string[], authHeaders: [] as string[] };
  let tokenSerial = 0;
  let revoked = new Set<string>();
  const fetch = async (input: string, init?: RequestInit): Promise<Response> => {
    const url = new URL(input);
    if (url.pathname === '/oauth/accesstoken') {
      calls.token++;
      const body = new URLSearchParams(String(init?.body));
      if (body.get('client_secret') !== 'secret')
        return new Response('{"error":"invalid_client"}', { status: 401 });
      return Response.json({
        access_token: `tok${++tokenSerial}`,
        expires_in: '1799',
        token_type: 'BearerToken',
      });
    }
    const m = /^\/case-status\/(\w+)$/.exec(url.pathname);
    if (m?.[1]) {
      const auth = new Headers(init?.headers).get('Authorization') ?? '';
      calls.authHeaders.push(auth);
      if (revoked.has(auth)) return new Response('{}', { status: 401 });
      calls.status.push(m[1]);
      const r = responses[m[1]];
      if (typeof r === 'number') return Response.json({ message: `HTTP ${r}` }, { status: r });
      if (r === undefined) return Response.json({ message: 'Receipt not found' }, { status: 404 });
      return Response.json(r);
    }
    return new Response('not found', { status: 404 });
  };
  return {
    fetch,
    calls,
    set: (receipt: string, value: unknown) => (responses[receipt] = value),
    revoke: (token: string) => (revoked = new Set([...revoked, `Bearer ${token}`])),
  };
}

export type PublicResponse =
  { status?: number; body: string | object } | ((url: string) => Response);

export async function setup(
  options: {
    env?: Partial<Env>;
    responses?: Record<string, unknown>;
    start?: string;
    publicResponses?: Record<string, PublicResponse>;
  } = {},
) {
  const db = FakeD1.withMigrations();
  const key = (n: number) => toBase64(new Uint8Array(32).fill(n));
  const env: Env = {
    DB: db as unknown as D1Database,
    USCIS_BASE_URL: 'https://api-int.uscis.gov',
    USCIS_CLIENT_ID: 'client',
    USCIS_CLIENT_SECRET: 'secret',
    RECEIPT_ENC_KEY: key(7),
    RECEIPT_HMAC_KEY: key(9),
    ALLOWED_ORIGINS: ORIGIN,
    ADMIN_TOKEN: 'admin-secret',
    ...options.env,
  };
  const uscisMock = mockUscis(options.responses ?? {});
  let now = new Date(options.start ?? '2026-09-30T12:00:00.000Z');
  const sleeps: number[] = [];
  const publicResponses: Record<string, PublicResponse> = { ...options.publicResponses };
  const publicCalls: { url: string; headers: Headers }[] = [];
  const publicFetch = async (url: string, init?: RequestInit) => {
    publicCalls.push({ url, headers: new Headers(init?.headers) });
    const r = publicResponses[url];
    if (!r) return new Response('Not found', { status: 404 });
    if (typeof r === 'function') return r(url);
    return new Response(typeof r.body === 'string' ? r.body : JSON.stringify(r.body), {
      status: r.status ?? 200,
    });
  };
  const config = readConfig(env);
  const deps: AppDeps = {
    store: new Store(env.DB),
    publicStore: new PublicStore(env.DB),
    fetch: publicFetch,
    uscis: new UscisClient({
      baseUrl: config.baseUrl,
      clientId: env.USCIS_CLIENT_ID,
      clientSecret: env.USCIS_CLIENT_SECRET,
      fetch: uscisMock.fetch,
      now: () => now.getTime(),
    }),
    sealer: await createSealer(env.RECEIPT_ENC_KEY, env.RECEIPT_HMAC_KEY),
    config,
    now: () => now,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  };
  const app = createApp(deps);
  const request = (path: string, init: RequestInit & { token?: string } = {}) => {
    const headers = new Headers(init.headers);
    if (init.token) headers.set('Authorization', `Bearer ${init.token}`);
    if (init.body) headers.set('Content-Type', 'application/json');
    headers.set('Origin', ORIGIN);
    return app.request(path, { ...init, headers });
  };
  const account = async () => {
    const res = await request('/v1/accounts', { method: 'POST' });
    return (await res.json()) as { accountId: string; token: string };
  };
  const subscribe = async (token: string, receipt: string) =>
    request('/v1/subscriptions', { method: 'POST', token, body: JSON.stringify({ receipt }) });
  return {
    db,
    deps,
    uscis: uscisMock,
    request,
    account,
    subscribe,
    sleeps,
    publicCalls,
    publicResponses,
    admin: (path: string, init: RequestInit = {}) =>
      request(path, { ...init, token: 'admin-secret' }),
    advance: (ms: number) => (now = new Date(now.getTime() + ms)),
  };
}

export const HOUR = 3_600_000;
