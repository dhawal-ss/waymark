import { createApp, type AppDeps } from './app';
import { pollDue } from './checker';
import { readConfig, type Env } from './config';
import { createSealer, type Sealer } from './crypto';
import { Store } from './store';
import { UscisClient } from './uscis';

// Reused across requests in the same isolate so the OAuth token is cached.
let cached: { key: string; sealer: Promise<Sealer>; uscis: UscisClient } | null = null;

function depsFor(env: Env): Promise<AppDeps> {
  const config = readConfig(env);
  const key = `${config.baseUrl}|${env.USCIS_CLIENT_ID}|${env.RECEIPT_ENC_KEY}|${env.RECEIPT_HMAC_KEY}`;
  if (!cached || cached.key !== key) {
    cached = {
      key,
      sealer: createSealer(env.RECEIPT_ENC_KEY, env.RECEIPT_HMAC_KEY),
      uscis: new UscisClient({
        baseUrl: config.baseUrl,
        clientId: env.USCIS_CLIENT_ID ?? '',
        clientSecret: env.USCIS_CLIENT_SECRET ?? '',
      }),
    };
  }
  const { sealer, uscis } = cached;
  return sealer.then((s) => ({
    store: new Store(env.DB),
    uscis,
    sealer: s,
    config,
    now: () => new Date(),
    sleep: (ms: number) => new Promise((r) => setTimeout(r, ms)),
  }));
}

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return createApp(() => depsFor(env)).fetch(request, env, ctx);
  },
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      depsFor(env).then(async (deps) => {
        const summary = await pollDue(deps);
        console.log('poll', JSON.stringify(summary));
      }),
    );
  },
} satisfies ExportedHandler<Env>;
