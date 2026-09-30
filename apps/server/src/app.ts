// HTTP API for the optional sync server. Accounts are anonymous: the client holds a random token,
// the server stores only its SHA-256 hash. No names, emails, or USCIS credentials of users.
import { checkReceipt as validateReceipt, type ParsedCase } from '@waymark/core';
import { Hono, type Context, type Next } from 'hono';
import { cors } from 'hono/cors';
import {
  checkReceipt,
  remainingQuota,
  UPSTREAM_UNAVAILABLE,
  utcDay,
  type CheckerDeps,
} from './checker';
import type { RateLimiter } from './config';
import { randomId, randomToken, sha256Hex } from './crypto';
import type { PublicDeps } from './publicJobs';
import { mountPublicRoutes } from './publicRoutes';

export type AppDeps = CheckerDeps & PublicDeps & { accountLimiter?: RateLimiter };

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
    await next();
    c.header('X-Content-Type-Options', 'nosniff');
    // Account responses carry decrypted receipts and case data: never cache them.
    if (c.req.path.startsWith('/v1/') && !c.req.path.startsWith('/v1/public'))
      c.header('Cache-Control', 'no-store');
  });

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
    if (d.accountLimiter) {
      // Keyed by IP only for this check; the IP is not stored.
      const ip = c.req.header('CF-Connecting-IP') ?? 'unknown';
      const { success } = await d.accountLimiter.limit({ key: ip });
      if (!success)
        return error(c, 429, 'rate_limited', 'Too many new accounts from this network. Try later.');
    }
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

  type ViewRow = {
    id: string;
    enc: string;
    created_at: string;
    last_checked_at: string | null;
    last_error: string | null;
  };

  /**
   * A subscription as the client sees it. Checks from before the subscription (made for another
   * account) are not shown, so subscribing does not reveal that someone else tracks the receipt.
   */
  async function view(d: AppDeps, row: ViewRow) {
    const own = row.last_checked_at !== null && row.last_checked_at >= row.created_at;
    return {
      id: row.id,
      receipt: await d.sealer.decrypt(row.enc),
      createdAt: row.created_at,
      lastCheckedAt: own ? row.last_checked_at : null,
      lastError: own ? row.last_error : null,
    };
  }

  /** Views for rows that can be decrypted; a row sealed with an old key is left out. */
  async function views(d: AppDeps, rows: ViewRow[]) {
    const out = await Promise.all(rows.map((r) => view(d, r).catch(() => null)));
    return out.filter((v) => v !== null);
  }

  app.get('/v1/subscriptions', auth, async (c) => {
    const d = await resolve();
    const rows = await d.store.subscriptions(c.get('accountId'));
    return c.json({ subscriptions: await views(d, rows) });
  });

  /** Latest stored result for a receipt, if any. */
  async function latestCase(
    d: AppDeps,
    hmac: string,
    accountId: string,
    since: string,
  ): Promise<{ case: ParsedCase; fetchedAt: string; snapshotId: number } | null> {
    const rows = await d.store.latestSnapshots(accountId, 0);
    const row = rows.find((r) => r.receipt_hmac === hmac && r.fetched_at >= since);
    if (!row) return null;
    try {
      return {
        case: JSON.parse(await d.sealer.decrypt(row.enc)),
        fetchedAt: row.fetched_at,
        snapshotId: row.id,
      };
    } catch {
      return null;
    }
  }

  /** Check a receipt outside the schedule, within quota and the account's daily budget. */
  async function checkNow(d: AppDeps, accountId: string, hmac: string): Promise<string | null> {
    const receipt = await d.store.receipt(hmac);
    if (!receipt || !d.uscis.configured || (await remainingQuota(d, true)) === 0) return null;
    const allowed = await d.store.takeAccountBudget(
      accountId,
      utcDay(d.now()),
      d.config.immediateChecksPerAccount,
    );
    if (!allowed) return 'budget';
    const outcome = await checkReceipt(d, receipt);
    return outcome.kind === 'stop' ? outcome.message : null;
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
        latest: await latestCase(d, hmac, accountId, row.created_at),
      });
    }
    const limitError = () =>
      error(
        c,
        409,
        'limit',
        `Automatic checks cover up to ${d.config.maxReceiptsPerAccount} cases per device. Delete a case you no longer need, or import its case page instead.`,
      );
    if ((await d.store.countSubscriptions(accountId)) >= d.config.maxReceiptsPerAccount)
      return limitError();
    const now = d.now().toISOString();
    await d.store.ensureReceipt(hmac, await d.sealer.encrypt(check.receipt), now);
    const id = randomId('sub');
    const created = await d.store.createSubscription(
      { id, account_id: accountId, receipt_hmac: hmac, created_at: now },
      d.config.maxReceiptsPerAccount,
    );
    if (!created) return limitError();

    // Check right away unless the receipt was checked within the cooldown, for this or another
    // account, including one that stopped tracking it. Otherwise the next scheduled run checks it.
    const receipt = await d.store.receipt(hmac);
    const lastCheck = receipt?.last_checked_at ?? (await d.store.recentCheck(hmac));
    const cooldownMs = d.config.refreshCooldownMinutes * 60_000;
    if (!lastCheck || d.now().getTime() - new Date(lastCheck).getTime() >= cooldownMs) {
      await checkNow(d, accountId, hmac);
    }
    const row = (await d.store.subscriptions(accountId)).find((r) => r.id === id)!;
    return c.json(
      { subscription: await view(d, row), latest: await latestCase(d, hmac, accountId, now) },
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
    const lastCheck = receipt.last_checked_at ?? (await d.store.recentCheck(sub.receipt_hmac));
    if (lastCheck && d.now().getTime() - new Date(lastCheck).getTime() < cooldownMs) {
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
    const stopped = await checkNow(d, accountId, sub.receipt_hmac);
    if (stopped === 'budget')
      return error(
        c,
        429,
        'budget',
        'This device has used its checks for today. The server still checks on schedule.',
      );
    if (stopped) return error(c, 503, 'upstream', stopped || UPSTREAM_UNAVAILABLE);
    const row = (await d.store.subscriptions(accountId)).find((r) => r.id === sub.id)!;
    return c.json({
      subscription: await view(d, row),
      latest: await latestCase(d, sub.receipt_hmac, accountId, row.created_at),
    });
  });

  app.get('/v1/updates', auth, async (c) => {
    const d = await resolve();
    const accountId = c.get('accountId');
    const after = Math.max(0, Number(c.req.query('after')) || 0);
    const rows = await d.store.latestSnapshots(accountId, after);
    const subs = await d.store.subscriptions(accountId);
    const since = new Map(subs.map((s) => [s.id, s.created_at]));
    const items = (
      await Promise.all(
        rows
          // Only results fetched while this account tracked the receipt.
          .filter((r) => r.fetched_at >= (since.get(r.subscription_id) ?? r.fetched_at))
          .map(async (r) => {
            try {
              return {
                subscriptionId: r.subscription_id,
                fetchedAt: r.fetched_at,
                case: JSON.parse(await d.sealer.decrypt(r.enc)) as ParsedCase,
              };
            } catch {
              return null;
            }
          }),
      )
    ).filter((i) => i !== null);
    return c.json({
      cursor: rows.reduce((max, r) => Math.max(max, r.id), after),
      items,
      subscriptions: await views(d, subs),
    });
  });

  mountPublicRoutes(app, resolve);

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
