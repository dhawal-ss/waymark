import { describe, expect, it } from 'vitest';
import { pollDue } from '../src/checker';
import { readConfig, type Env } from '../src/config';
import { HOUR, officialBody, setup } from './harness';

const R1 = 'EAC9999103402';
const R2 = 'EAC9999103403';

const subId = async (res: Response) =>
  ((await res.json()) as { subscription: { id: string } }).subscription.id;

describe('quota abuse', () => {
  it('keeps the cooldown when a receipt is deleted and added again', async () => {
    const t = await setup({ responses: { [R1]: officialBody(R1) } });
    const { token } = await t.account();
    const id = await subId(await t.subscribe(token, R1));
    await t.request(`/v1/subscriptions/${id}`, { method: 'DELETE', token });
    await t.subscribe(token, R1);
    const again = await subId(await t.subscribe(token, R1));
    expect(t.uscis.calls.status).toEqual([R1]);
    const refresh = await t.request(`/v1/subscriptions/${again}/refresh`, {
      method: 'POST',
      token,
    });
    expect(refresh.status).toBe(429);
    expect(t.uscis.calls.status).toEqual([R1]);
  });

  it('enforces the receipt limit when requests arrive together', async () => {
    const t = await setup({ env: { MAX_RECEIPTS_PER_ACCOUNT: '1' } });
    const { token } = await t.account();
    const results = await Promise.all([t.subscribe(token, R1), t.subscribe(token, R2)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
  });

  it('limits checks outside the schedule per account per day', async () => {
    const t = await setup({ responses: { [R1]: officialBody(R1) } });
    t.deps.config.immediateChecksPerAccount = 1;
    const { token } = await t.account();
    const id = await subId(await t.subscribe(token, R1));
    t.advance(2 * HOUR);
    const res = await t.request(`/v1/subscriptions/${id}/refresh`, { method: 'POST', token });
    expect(res.status).toBe(429);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('budget');
  });

  it('rate limits account creation when the binding is set', async () => {
    const t = await setup();
    let calls = 0;
    t.deps.accountLimiter = {
      limit: async () => ({ success: ++calls <= 1 }),
    };
    expect((await t.request('/v1/accounts', { method: 'POST' })).status).toBe(201);
    expect((await t.request('/v1/accounts', { method: 'POST' })).status).toBe(429);
  });
});

describe('polling resilience', () => {
  it('does not let failing receipts crowd out healthy ones', async () => {
    const t = await setup({ responses: { [R2]: officialBody(R2) } });
    t.deps.config.batchSize = 2;
    const { token } = await t.account();
    // Many receipts that USCIS does not know, then one healthy receipt.
    for (let i = 0; i < 6; i++) await t.subscribe(token, `EAC99991035${10 + i}`);
    t.deps.config.maxReceiptsPerAccount = 20;
    await t.subscribe(token, R2);
    t.advance(13 * HOUR);
    await pollDue(t.deps);
    t.advance(13 * HOUR);
    await pollDue(t.deps);
    const checks = t.uscis.calls.status.filter((r) => r === R2).length;
    // Checked on subscribe and on both runs: failing receipts back off instead.
    expect(checks).toBe(3);
  });

  it('keeps polling when one stored row cannot be decrypted', async () => {
    const t = await setup({ responses: { [R1]: officialBody(R1), [R2]: officialBody(R2) } });
    const { token } = await t.account();
    await t.subscribe(token, R1);
    await t.subscribe(token, R2);
    t.db.raw.prepare("UPDATE receipts SET enc = 'v1.broken.data' WHERE rowid = 1").run();
    t.advance(13 * HOUR);
    const summary = await pollDue(t.deps);
    expect(summary).toMatchObject({ checked: 2, failed: 1, stopped: null });
    const list = await t.request('/v1/subscriptions', { token });
    expect(list.status).toBe(200);
    expect(((await list.json()) as { subscriptions: unknown[] }).subscriptions).toHaveLength(1);
  });
});

describe('privacy', () => {
  it('does not show another account earlier checks of the same receipt', async () => {
    const t = await setup({ responses: { [R1]: officialBody(R1) } });
    const a = await t.account();
    await t.subscribe(a.token, R1);
    t.advance(10 * 60_000);
    const b = await t.account();
    const body = (await (await t.subscribe(b.token, R1)).json()) as {
      subscription: { lastCheckedAt: string | null };
      latest: unknown;
    };
    expect(body.subscription.lastCheckedAt).toBeNull();
    expect(body.latest).toBeNull();
  });

  it('marks account responses as not cacheable', async () => {
    const t = await setup();
    const { token } = await t.account();
    const res = await t.request('/v1/subscriptions', { token });
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('shows users a plain message when USCIS rejects the server credentials', async () => {
    const t = await setup({ env: { USCIS_CLIENT_SECRET: 'wrong' } });
    const { token } = await t.account();
    const id = await subId(await t.subscribe(token, R1));
    t.advance(2 * HOUR);
    const res = await t.request(`/v1/subscriptions/${id}/refresh`, { method: 'POST', token });
    const text = JSON.stringify(await res.json());
    expect(res.status).toBe(503);
    expect(text).not.toContain('USCIS_CLIENT');
  });
});

describe('config', () => {
  it('treats an empty setting as the default', () => {
    const config = readConfig({ DAILY_QUOTA: '', MAX_ACCOUNTS: ' ' } as unknown as Env);
    expect(config.dailyQuota).toBe(1000);
    expect(config.maxAccounts).toBe(500);
  });
});
