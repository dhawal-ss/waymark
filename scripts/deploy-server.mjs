// Deploys the sync server (apps/server) to Cloudflare from GitHub Actions. Idempotent: finds or
// creates the D1 database, applies migrations, deploys the Worker, and sets secrets. Receipt keys
// and the admin token are created once and never replaced, so stored data stays readable.
//
// Environment: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID (read by wrangler), USCIS_CLIENT_ID,
// USCIS_CLIENT_SECRET, optional USCIS_BASE_URL and APP_ORIGINS. Writes url=... to GITHUB_OUTPUT.
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = new URL('../apps/server/', import.meta.url).pathname;
const toml = join(dir, 'wrangler.toml');
const DB = 'waymark';

function wrangler(args, { input, quiet = false } = {}) {
  const out = execFileSync('pnpm', ['exec', 'wrangler', ...args], {
    cwd: dir,
    input,
    encoding: 'utf8',
    stdio: [input === undefined ? 'inherit' : 'pipe', 'pipe', 'pipe'],
  });
  if (!quiet) process.stdout.write(out);
  return out;
}

function databaseId() {
  const list = JSON.parse(wrangler(['d1', 'list', '--json'], { quiet: true }));
  return list.find((d) => d.name === DB)?.uuid ?? '';
}

// 1. Database.
let id = databaseId();
if (!id) {
  wrangler(['d1', 'create', DB]);
  id = databaseId();
}
if (!id) throw new Error('Could not find or create the D1 database.');
let config = readFileSync(toml, 'utf8').replace(/^database_id = .*$/m, `database_id = "${id}"`);
writeFileSync(toml, config);
wrangler(['d1', 'migrations', 'apply', DB, '--remote']);

// 2. Worker. The app's origin comes from the repository owner (GitHub Pages).
const owner = (process.env.GITHUB_REPOSITORY_OWNER ?? '').toLowerCase();
const origins = process.env.APP_ORIGINS || (owner ? `https://${owner}.github.io` : '');
const vars = [`ALLOWED_ORIGINS:${origins}`];
if (process.env.USCIS_BASE_URL) vars.push(`USCIS_BASE_URL:${process.env.USCIS_BASE_URL}`);
const deployArgs = ['deploy', ...vars.flatMap((v) => ['--var', v])];
let out;
try {
  out = wrangler(deployArgs);
} catch (e) {
  const text = `${e.stdout ?? ''}${e.stderr ?? ''}`;
  if (!/ratelimit/i.test(text)) {
    process.stderr.write(text);
    throw e;
  }
  // Workers Rate Limiting is not offered on every plan; the server works without it.
  console.log('Rate limiting is not available on this account. Deploying without it.');
  config = config.replace(/\n# Limits new anonymous accounts[\s\S]*?simple = \{[^}]*\}\n/, '\n');
  writeFileSync(toml, config);
  out = wrangler(deployArgs);
}
const url = out.match(/https:\/\/[a-z0-9.-]+\.workers\.dev/)?.[0] ?? '';

// 3. Secrets. Existing receipt keys are kept.
const existing = new Set(
  JSON.parse(wrangler(['secret', 'list', '--format', 'json'], { quiet: true })).map((s) => s.name),
);
const secrets = {};
if (process.env.USCIS_CLIENT_ID) secrets.USCIS_CLIENT_ID = process.env.USCIS_CLIENT_ID;
if (process.env.USCIS_CLIENT_SECRET) secrets.USCIS_CLIENT_SECRET = process.env.USCIS_CLIENT_SECRET;
for (const name of ['RECEIPT_ENC_KEY', 'RECEIPT_HMAC_KEY', 'ADMIN_TOKEN']) {
  if (!existing.has(name)) secrets[name] = randomBytes(32).toString('base64');
}
if (Object.keys(secrets).length > 0) {
  const tmp = mkdtempSync(join(process.env.RUNNER_TEMP || tmpdir(), 'secrets-'));
  const file = join(tmp, 'secrets.json');
  try {
    writeFileSync(file, JSON.stringify(secrets), { mode: 0o600 });
    wrangler(['secret', 'bulk', file]);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}
if (!existing.has('USCIS_CLIENT_ID') && !secrets.USCIS_CLIENT_ID)
  console.log('USCIS_CLIENT_ID is not set: add it as a repository secret.');

console.log(url ? `Sync server: ${url}` : 'Deployed. The workers.dev address was not printed.');
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `url=${url}\n`);
