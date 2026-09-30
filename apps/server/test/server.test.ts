import { describe, expect, it } from 'vitest';
import { canonical, pollDue } from '../src/checker';
import { createSealer, toBase64 } from '../src/crypto';
import { HOUR, officialBody, officialFixture, ORIGIN, setup } from './harness';

const R1 = 'EAC9999103402';
const R2 = 'EAC9999103403';
const R3 = 'EAC9999103404';

describe('accounts', () => {
  it('issues a token, stores only its hash, and authenticates with it', async () => {
    const t = await setup();
    const { token, accountId } = await t.account();
    expect(token.length).toBeGreaterThanOrEqual(40);
    expect(t.db.dump()).not.toContain(token);
    expect(t.db.dump()).toContain(accountId);

    expect((await t.request('/v1/subscriptions')).status).toBe(401);
    expect((await t.request('/v1/subscriptions', { token: 'wrong' })).status).toBe(401);
    expect((await t.request('/v1/subscriptions', { token })).status).toBe(200);
  });

  it('stops creating accounts at the configured limit', async () => {
    const t = await setup({ env: { MAX_ACCOUNTS: '1' } });
    await t.account();
    const res = await t.request('/v1/accounts', { method: 'POST' });
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: { message: string } }).error.message).toContain(
      'not accepting new accounts',
    );
  });

  it('deletes the account and everything only it tracked', async () => {
    const t = await setup({ responses: { [R1]: officialBody(R1) } });
    const { token } = await t.account();
    await t.subscribe(token, R1);
    expect((await t.request('/v1/account', { method: 'DELETE', token })).status).toBe(204);
    const counts = t.db.raw
      .prepare(
        'SELECT (SELECT COUNT(*) FROM accounts) a, (SELECT COUNT(*) FROM receipts) r, (SELECT COUNT(*) FROM snapshots) s, (SELECT COUNT(*) FROM subscriptions) sub',
      )
      .get();
    expect(counts).toEqual({ a: 0, r: 0, s: 0, sub: 0 });
  });
});

describe('subscriptions', () => {
  it('validates receipts, checks new ones right away, and returns the result', async () => {
    const t = await setup({ responses: { [R1]: officialFixture() } });
    const { token } = await t.account();
    const bad = await t.subscribe(token, 'EAC123');
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { error: { message: string } }).error.message).toContain(
      '3 letters and 10 digits',
    );

    const res = await t.subscribe(token, 'eac-99-991-03402');
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      subscription: { receipt: string; lastError: null };
      latest: { case: { events: unknown[] } };
    };
    expect(body.subscription.receipt).toBe(R1);
    expect(body.latest.case.events).toHaveLength(4);
    expect(t.uscis.calls.status).toEqual([R1]);
  });

  it('encrypts receipts and case data at rest', async () => {
    const t = await setup({ responses: { [R1]: officialFixture() } });
    const { token } = await t.account();
    await t.subscribe(token, R1);
    const dump = t.db.dump();
    expect(dump).not.toContain(R1);
    expect(dump).not.toContain('9999103402');
    expect(dump).not.toContain('Case Was Approved');
    expect(dump).not.toContain('Long description');
  });

  it('shares one receipt row between accounts and fetches it once', async () => {
    const t = await setup({ responses: { [R1]: officialBody(R1) } });
    const a = await t.account();
    const b = await t.account();
    await t.subscribe(a.token, R1);
    const res = await t.subscribe(b.token, R1);
    const body = (await res.json()) as { latest: unknown };
    expect(body.latest).not.toBeNull();
    expect(t.uscis.calls.status).toEqual([R1]);
    expect(t.db.raw.prepare('SELECT COUNT(*) n FROM receipts').get()).toEqual({ n: 1 });

    const list = (await (await t.request('/v1/subscriptions', { token: a.token })).json()) as {
      subscriptions: { id: string }[];
    };
    await t.request(`/v1/subscriptions/${list.subscriptions[0]!.id}`, {
      method: 'DELETE',
      token: a.token,
    });
    expect(t.db.raw.prepare('SELECT COUNT(*) n FROM receipts').get()).toEqual({ n: 1 });
  });

  it('limits receipts per account', async () => {
    const t = await setup({
      env: { MAX_RECEIPTS_PER_ACCOUNT: '2' },
      responses: { [R1]: officialBody(R1), [R2]: officialBody(R2), [R3]: officialBody(R3) },
    });
    const { token } = await t.account();
    await t.subscribe(token, R1);
    await t.subscribe(token, R2);
    const res = await t.subscribe(token, R3);
    expect(res.status).toBe(409);
    // Subscribing again to a tracked receipt is not a new receipt.
    expect((await t.subscribe(token, R1)).status).toBe(200);
  });

  it('records a not-found receipt as an error the client can show', async () => {
    const t = await setup();
    const { token } = await t.account();
    const res = await t.subscribe(token, R1);
    const body = (await res.json()) as { subscription: { lastError: string }; latest: null };
    expect(body.subscription.lastError).toContain('no case with this receipt number');
    expect(body.latest).toBeNull();
  });

  it('throttles manual refresh', async () => {
    const t = await setup({ responses: { [R1]: officialBody(R1) } });
    const { token } = await t.account();
    const sub = (await (await t.subscribe(token, R1)).json()) as { subscription: { id: string } };
    const early = await t.request(`/v1/subscriptions/${sub.subscription.id}/refresh`, {
      method: 'POST',
      token,
    });
    expect(early.status).toBe(429);
    t.advance(61 * 60_000);
    t.uscis.set(R1, officialBody(R1, 'Case Was Approved', '10-01-2023 10:00:00'));
    const later = await t.request(`/v1/subscriptions/${sub.subscription.id}/refresh`, {
      method: 'POST',
      token,
    });
    expect(later.status).toBe(200);
    const body = (await later.json()) as { latest: { case: { events: { text: string }[] } } };
    expect(body.latest.case.events.at(-1)!.text).toBe('Case Was Approved');
  });

  it('does not let one account see or delete another account subscription', async () => {
    const t = await setup({ responses: { [R1]: officialBody(R1) } });
    const a = await t.account();
    const b = await t.account();
    const sub = (await (await t.subscribe(a.token, R1)).json()) as { subscription: { id: string } };
    expect(
      (
        await t.request(`/v1/subscriptions/${sub.subscription.id}`, {
          method: 'DELETE',
          token: b.token,
        })
      ).status,
    ).toBe(404);
    const updates = (await (await t.request('/v1/updates', { token: b.token })).json()) as {
      items: unknown[];
    };
    expect(updates.items).toEqual([]);
  });
});

describe('polling', () => {
  it('checks due receipts within the rate limit and stores only changes', async () => {
    const t = await setup({ responses: { [R1]: officialBody(R1), [R2]: officialBody(R2) } });
    const { token } = await t.account();
    await t.subscribe(token, R1);
    await t.subscribe(token, R2);
    expect(t.uscis.calls.status).toHaveLength(2);

    // Not due yet.
    expect(await pollDue(t.deps)).toMatchObject({ checked: 0 });

    t.advance(13 * HOUR);
    t.uscis.set(R2, officialBody(R2, 'Case Was Approved', '10-01-2023 10:00:00'));
    expect(await pollDue(t.deps)).toEqual({ checked: 2, changed: 1, failed: 0, stopped: null });
    expect(t.sleeps).toEqual([220]);
    expect(t.db.raw.prepare('SELECT COUNT(*) n FROM snapshots').get()).toEqual({ n: 3 });
  });

  it('reuses the OAuth token and renews it when it expires or is revoked', async () => {
    const t = await setup({
      responses: { [R1]: officialBody(R1), [R2]: officialBody(R2), [R3]: officialBody(R3) },
    });
    const { token } = await t.account();
    await t.subscribe(token, R1);
    await t.subscribe(token, R2);
    expect(t.uscis.calls.token).toBe(1);

    t.advance(31 * 60_000);
    await t.subscribe(token, R3);
    expect(t.uscis.calls.token).toBe(2);

    t.uscis.revoke('tok2');
    t.advance(13 * HOUR);
    await pollDue(t.deps);
    expect(t.uscis.calls.token).toBe(3);
  });

  it('stays inside the daily quota and keeps a reserve', async () => {
    const receipts = Array.from({ length: 12 }, (_, i) => `EAC99991034${String(10 + i)}`);
    const t = await setup({
      env: { DAILY_QUOTA: '20', MAX_RECEIPTS_PER_ACCOUNT: '20' },
      responses: Object.fromEntries(receipts.map((r) => [r, officialBody(r)])),
      // Early in the UTC day so the 13 hours below stay on the same quota day.
      start: '2026-09-30T00:30:00.000Z',
    });
    const { token } = await t.account();
    for (const r of receipts) await t.subscribe(token, r);
    expect(t.uscis.calls.status).toHaveLength(12);

    t.advance(13 * HOUR);
    // 20 per day, 2 held in reserve, 12 already used: 6 left for polling.
    const summary = await pollDue(t.deps);
    expect(summary.checked).toBe(6);
    expect(await pollDue(t.deps)).toMatchObject({ checked: 0, stopped: 'Daily quota used.' });
  });

  it('stops on rate limiting and backs off failing receipts', async () => {
    const t = await setup({ responses: { [R1]: 429, [R2]: 500 } });
    const { token } = await t.account();
    // The first check fails on subscribe, so the next try waits 2x the 12 hour interval.
    await t.subscribe(token, R2);
    t.advance(13 * HOUR);
    expect(await pollDue(t.deps)).toMatchObject({ checked: 0 });
    t.advance(12 * HOUR);
    expect(await pollDue(t.deps)).toMatchObject({ checked: 1, failed: 1 });
    // Failed twice now: waits 4x the interval.
    t.advance(25 * HOUR);
    expect(await pollDue(t.deps)).toMatchObject({ checked: 0 });
    t.advance(24 * HOUR);
    expect(await pollDue(t.deps)).toMatchObject({ checked: 1 });

    await t.subscribe(token, R1);
    t.advance(100 * HOUR);
    expect((await pollDue(t.deps)).stopped).toBe('USCIS rate limit reached.');
  });

  it('reports missing credentials instead of calling USCIS', async () => {
    const t = await setup({ env: { USCIS_CLIENT_SECRET: '' } });
    expect((await pollDue(t.deps)).stopped).toBe('USCIS credentials are not set.');
    expect(t.uscis.calls.token).toBe(0);
  });

  it('deletes accounts inactive for 180 days', async () => {
    const t = await setup({ responses: { [R1]: officialBody(R1) } });
    const { token } = await t.account();
    await t.subscribe(token, R1);
    t.advance(181 * 24 * HOUR);
    await pollDue(t.deps);
    expect(t.db.raw.prepare('SELECT COUNT(*) n FROM accounts').get()).toEqual({ n: 0 });
    expect(t.db.raw.prepare('SELECT COUNT(*) n FROM receipts').get()).toEqual({ n: 0 });
  });
});

describe('updates', () => {
  it('returns the latest result per receipt after a cursor', async () => {
    const t = await setup({ responses: { [R1]: officialBody(R1), [R2]: officialBody(R2) } });
    const { token } = await t.account();
    await t.subscribe(token, R1);
    await t.subscribe(token, R2);
    const first = (await (await t.request('/v1/updates', { token })).json()) as {
      cursor: number;
      items: { case: { receipt: string } }[];
    };
    expect(first.items.map((i) => i.case.receipt).sort()).toEqual([R1, R2]);

    const none = (await (
      await t.request(`/v1/updates?after=${first.cursor}`, { token })
    ).json()) as { items: unknown[]; cursor: number };
    expect(none.items).toEqual([]);
    expect(none.cursor).toBe(first.cursor);

    t.advance(13 * HOUR);
    t.uscis.set(R1, officialBody(R1, 'Interview Was Scheduled', '10-01-2023 10:00:00'));
    await pollDue(t.deps);
    const next = (await (
      await t.request(`/v1/updates?after=${first.cursor}`, { token })
    ).json()) as {
      items: { case: { receipt: string; events: { text: string }[] } }[];
      subscriptions: { lastCheckedAt: string }[];
    };
    expect(next.items).toHaveLength(1);
    expect(next.items[0]!.case.events.at(-1)!.text).toBe('Interview Was Scheduled');
    expect(next.subscriptions).toHaveLength(2);
  });
});

describe('http', () => {
  it('allows only configured origins', async () => {
    const t = await setup();
    const ok = await t.request('/v1/health');
    expect(ok.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    const { createApp } = await import('../src/app');
    const res = await createApp(t.deps).request('/v1/health', {
      headers: { Origin: 'https://evil.example' },
    });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('reports the environment', async () => {
    const t = await setup();
    expect(await (await t.request('/v1/health')).json()).toEqual({
      ok: true,
      environment: 'sandbox',
      uscisConfigured: true,
    });
    const prod = await setup({ env: { USCIS_BASE_URL: 'https://api.uscis.gov' } });
    expect(await (await prod.request('/v1/health')).json()).toMatchObject({
      environment: 'production',
    });
  });

  it('answers unknown paths with a plain error', async () => {
    const t = await setup();
    const res = await t.request('/nope');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: { code: 'not_found', message: 'Unknown endpoint.' },
    });
  });
});

describe('crypto', () => {
  it('round trips, uses fresh IVs, and rejects bad keys', async () => {
    const key = toBase64(new Uint8Array(32).fill(1));
    const sealer = await createSealer(key, key);
    const a = await sealer.encrypt(R1);
    const b = await sealer.encrypt(R1);
    expect(a).not.toBe(b);
    expect(await sealer.decrypt(a)).toBe(R1);
    expect(await sealer.hmac(R1)).toBe(await sealer.hmac(R1));
    await expect(createSealer('short', key)).rejects.toThrow('32 bytes');
  });

  it('hashes a canonical form that ignores fetch time', () => {
    const base = { receipt: R1, form: null, events: [], notices: [] };
    expect(canonical(base)).toBe(canonical({ ...base, channel: 'x' }));
  });
});
