import { createApp, type AppDeps } from './app';
import { pollDue } from './checker';
import { readConfig, type Env } from './config';
import { createSealer, type Sealer } from './crypto';
import { refreshProcessingTimes, refreshVisaBulletins } from './publicJobs';
import { PublicStore } from './publicStore';
import { Store } from './store';
import { UscisClient } from './uscis';

/** Must match the second cron in wrangler.toml. */
export const PUBLIC_DATA_CRON = '17 13 * * *';

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
    publicStore: new PublicStore(env.DB),
    fetch: (input: string, init?: RequestInit) => fetch(input, init),
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
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      depsFor(env).then(async (deps) => {
        if (event.cron === PUBLIC_DATA_CRON) {
          if (!deps.config.publicDataEnabled) return;
          console.log('processing-times', JSON.stringify(await refreshProcessingTimes(deps)));
          console.log('visa-bulletin', JSON.stringify(await refreshVisaBulletins(deps)));
          return;
        }
        const summary = await pollDue(deps);
        console.log('poll', JSON.stringify(summary));
      }),
    );
  },
} satisfies ExportedHandler<Env>;
