// HTTP API for the optional sync server. Accounts are anonymous: the client holds a random token,
// the server stores only its SHA-256 hash. No names, emails, or USCIS credentials of users.
import { checkReceipt as validateReceipt, type ParsedCase } from '@waymark/core';
import { Hono, type Context, type Next } from 'hono';
import { cors } from 'hono/cors';
import { checkReceipt, remainingQuota, type CheckerDeps } from './checker';
import { randomId, randomToken, sha256Hex } from './crypto';

export type AppDeps = CheckerDeps;

type Vars = { accountId: string };
type AppContext = Context<{ Variables: Vars }>;

const error = (
  c: Context,
  status: 400 | 401 | 403 | 404 | 409 | 429 | 503,
  code: string,
  message: string,
) => c.json({ error: { code, message } }, status);

export function createApp(deps: AppDeps | (() => Promise<AppDeps>)) {
  const app = new Hono<{ Variables: Vars }>();
  const resolve = typeof deps === 'function' ? deps : async () => deps;

  app.use('*', async (c, next) => {
    const d = await resolve();
    return cors({
      origin: (origin) => (d.config.allowedOrigins.includes(origin) ? origin : null),
      allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Authorization', 'Content-Type'],
      maxAge: 600,
    })(c, next);
  });

  const auth = async (c: AppContext, next: Next) => {
    const d = await resolve();
    const header = c.req.header('Authorization') ?? '';
    const token = /^Bearer\s+(\S+)$/.exec(header)?.[1];
    if (!token) return error(c, 401, 'unauthorized', 'Sign in again: the sync key is missing.');
    const account = await d.store.accountByTokenHash(await sha256Hex(token));
    if (!account)
      return error(
        c,
        401,
        'unauthorized',
        'The sync key is not valid. Turn server sync off and on again.',
      );
    const now = d.now();
    if (now.getTime() - new Date(account.last_seen_at).getTime() > 86_400_000) {
      await d.store.touchAccount(account.id, now.toISOString());
    }
    c.set('accountId', account.id);
    await next();
  };

  app.get('/v1/health', async (c) => {
    const d = await resolve();
    return c.json({
      ok: true,
      environment: d.config.environment,
      uscisConfigured: d.uscis.configured,
    });
  });

  app.post('/v1/accounts', async (c) => {
    const d = await resolve();
    if ((await d.store.countAccounts()) >= d.config.maxAccounts) {
      return error(
        c,
        503,
        'full',
        'This server is not accepting new accounts. Keep using manual sync.',
      );
    }
    const token = randomToken();
    const id = randomId('acct');
    await d.store.createAccount(id, await sha256Hex(token), d.now().toISOString());
    return c.json({ accountId: id, token }, 201);
  });

  app.delete('/v1/account', auth, async (c) => {
    const d = await resolve();
    await d.store.deleteAccount(c.get('accountId'));
    return c.body(null, 204);
  });

  async function view(
    d: AppDeps,
    row: {
      id: string;
      enc: string;
      created_at: string;
      last_checked_at: string | null;
      last_error: string | null;
    },
  ) {
    return {
      id: row.id,
      receipt: await d.sealer.decrypt(row.enc),
      createdAt: row.created_at,
      lastCheckedAt: row.last_checked_at,
      lastError: row.last_error,
    };
  }

  app.get('/v1/subscriptions', auth, async (c) => {
    const d = await resolve();
    const rows = await d.store.subscriptions(c.get('accountId'));
    return c.json({ subscriptions: await Promise.all(rows.map((r) => view(d, r))) });
  });

  /** Latest stored result for a receipt, if any. */
  async function latestCase(
    d: AppDeps,
    hmac: string,
    accountId: string,
  ): Promise<{ case: ParsedCase; fetchedAt: string; snapshotId: number } | null> {
    const rows = await d.store.latestSnapshots(accountId, 0);
    const row = rows.find((r) => r.receipt_hmac === hmac);
    return row
      ? {
          case: JSON.parse(await d.sealer.decrypt(row.enc)),
          fetchedAt: row.fetched_at,
          snapshotId: row.id,
        }
      : null;
  }

  app.post('/v1/subscriptions', auth, async (c) => {
    const d = await resolve();
    const accountId = c.get('accountId');
    const body = (await c.req.json().catch(() => ({}))) as { receipt?: unknown };
    const check = validateReceipt(typeof body.receipt === 'string' ? body.receipt : '', []);
    if (!check.ok) return error(c, 400, 'invalid_receipt', check.error);
    const hmac = await d.sealer.hmac(check.receipt);

    const existing = await d.store.subscriptionByReceipt(accountId, hmac);
    if (existing) {
      const row = (await d.store.subscriptions(accountId)).find((r) => r.id === existing.id)!;
      return c.json({
        subscription: await view(d, row),
        latest: await latestCase(d, hmac, accountId),
      });
    }
    if ((await d.store.countSubscriptions(accountId)) >= d.config.maxReceiptsPerAccount) {
      return error(
        c,
        409,
        'limit',
        `Server sync tracks up to ${d.config.maxReceiptsPerAccount} receipts per device. Stop tracking one first.`,
      );
    }
    const now = d.now().toISOString();
    await d.store.ensureReceipt(hmac, await d.sealer.encrypt(check.receipt), now);
    const id = randomId('sub');
    await d.store.createSubscription({
      id,
      account_id: accountId,
      receipt_hmac: hmac,
      created_at: now,
    });

    // Check right away when the receipt is new to the server and quota allows.
    const receipt = await d.store.receipt(hmac);
    if (
      receipt &&
      !receipt.last_checked_at &&
      d.uscis.configured &&
      (await remainingQuota(d, true)) > 0
    ) {
      await checkReceipt(d, receipt);
    }
    const row = (await d.store.subscriptions(accountId)).find((r) => r.id === id)!;
    return c.json(
      { subscription: await view(d, row), latest: await latestCase(d, hmac, accountId) },
      201,
    );
  });

  app.delete('/v1/subscriptions/:id', auth, async (c) => {
    const d = await resolve();
    const removed = await d.store.deleteSubscription(c.get('accountId'), c.req.param('id') ?? '');
    return removed
      ? c.body(null, 204)
      : error(c, 404, 'not_found', 'This receipt is not tracked on the server.');
  });

  app.post('/v1/subscriptions/:id/refresh', auth, async (c) => {
    const d = await resolve();
    const accountId = c.get('accountId');
    const sub = await d.store.subscription(accountId, c.req.param('id') ?? '');
    if (!sub) return error(c, 404, 'not_found', 'This receipt is not tracked on the server.');
    const receipt = await d.store.receipt(sub.receipt_hmac);
    if (!receipt) return error(c, 404, 'not_found', 'This receipt is not tracked on the server.');
    const cooldownMs = d.config.refreshCooldownMinutes * 60_000;
    if (
      receipt.last_checked_at &&
      d.now().getTime() - new Date(receipt.last_checked_at).getTime() < cooldownMs
    ) {
      return error(
        c,
        429,
        'too_soon',
        `Checked less than ${d.config.refreshCooldownMinutes} minutes ago. Try again later.`,
      );
    }
    if (!d.uscis.configured)
      return error(c, 503, 'not_configured', 'The server has no USCIS API credentials.');
    if ((await remainingQuota(d, true)) === 0) {
      return error(
        c,
        429,
        'quota',
        'The daily USCIS API quota is used up. The server checks again tomorrow.',
      );
    }
    const outcome = await checkReceipt(d, receipt);
    if (outcome.kind === 'stop') return error(c, 503, 'upstream', outcome.message);
    const row = (await d.store.subscriptions(accountId)).find((r) => r.id === sub.id)!;
    return c.json({
      subscription: await view(d, row),
      latest: await latestCase(d, sub.receipt_hmac, accountId),
    });
  });

  app.get('/v1/updates', auth, async (c) => {
    const d = await resolve();
    const accountId = c.get('accountId');
    const after = Math.max(0, Number(c.req.query('after')) || 0);
    const rows = await d.store.latestSnapshots(accountId, after);
    const items = await Promise.all(
      rows.map(async (r) => ({
        subscriptionId: r.subscription_id,
        fetchedAt: r.fetched_at,
        case: JSON.parse(await d.sealer.decrypt(r.enc)) as ParsedCase,
      })),
    );
    const subs = await d.store.subscriptions(accountId);
    return c.json({
      cursor: rows.reduce((max, r) => Math.max(max, r.id), after),
      items,
      subscriptions: await Promise.all(subs.map((s) => view(d, s))),
    });
  });

  app.notFound((c) => error(c, 404, 'not_found', 'Unknown endpoint.'));
  app.onError((err, c) => {
    console.error('Unhandled error', err instanceof Error ? err.name : 'unknown');
    return c.json(
      { error: { code: 'server_error', message: 'The sync server failed. Try again later.' } },
      500,
    );
  });

  return app;
}
