// Checks a deployed sync server from GitHub Actions: health, CORS for the app origin, and one
// real USCIS lookup with a sandbox test receipt, then deletes the test account. Uses one call of
// the daily USCIS quota. Usage: node scripts/smoke-server.mjs <server url> <app origin>
const [server, origin] = process.argv.slice(2);
if (!server || !origin) throw new Error('Usage: smoke-server.mjs <server url> <app origin>');

const RECEIPT = process.env.SMOKE_RECEIPT || 'EAC9999103402';
let failed = false;
const fail = (message) => {
  failed = true;
  console.log(`::error::${message}`);
};

async function call(path, init = {}, token = '') {
  const headers = new Headers(init.headers);
  headers.set('Origin', origin);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body) headers.set('Content-Type', 'application/json');
  const res = await fetch(`${server}${path}`, { ...init, headers });
  const body = res.status === 204 ? null : await res.json().catch(() => null);
  return { res, body };
}

const health = await call('/v1/health');
console.log(`Health: HTTP ${health.res.status}`, JSON.stringify(health.body));
if (!health.body?.ok) fail('The server did not answer /v1/health.');
if (!health.body?.uscisConfigured) fail('USCIS_CLIENT_ID or USCIS_CLIENT_SECRET is missing.');
const allowed = health.res.headers.get('access-control-allow-origin');
if (allowed !== origin && allowed !== '*')
  fail(`The server does not allow ${origin} (CORS). Set APP_ORIGINS or check ALLOWED_ORIGINS.`);

const account = await call('/v1/accounts', { method: 'POST' });
const token = account.body?.token;
if (!token) {
  fail(`Could not create a test account: HTTP ${account.res.status}.`);
} else {
  try {
    const sub = await call(
      '/v1/subscriptions',
      { method: 'POST', body: JSON.stringify({ receipt: RECEIPT }) },
      token,
    );
    const error = sub.body?.subscription?.lastError ?? null;
    const latest = sub.body?.latest?.case ?? null;
    console.log(`Lookup of the test receipt: HTTP ${sub.res.status}`);
    if (latest) {
      const last = latest.events?.at(-1);
      console.log(
        `USCIS answered: form ${latest.form ?? 'unknown'}, latest status "${last?.text ?? 'none'}".`,
      );
    } else if (error) {
      console.log(`USCIS error: ${error}`);
      if (/cannot reach the USCIS API/.test(error))
        fail(
          'USCIS rejected the credentials or is down. Check USCIS_CLIENT_ID and USCIS_CLIENT_SECRET.',
        );
    } else if (sub.res.status >= 400) {
      fail(`The lookup failed: ${sub.body?.error?.message ?? `HTTP ${sub.res.status}`}`);
    }
  } finally {
    await call('/v1/account', { method: 'DELETE' }, token);
  }
}
if (failed) process.exit(1);
console.log('The sync server works.');
