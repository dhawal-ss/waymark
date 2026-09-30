export interface Env {
  DB: D1Database;
  USCIS_BASE_URL: string;
  USCIS_CLIENT_ID: string;
  USCIS_CLIENT_SECRET: string;
  /** Base64 of 32 random bytes: AES-GCM key for receipts and case data. */
  RECEIPT_ENC_KEY: string;
  /** Base64 of 32 or more random bytes: HMAC key for receipt lookup. */
  RECEIPT_HMAC_KEY: string;
  ALLOWED_ORIGINS: string;
  POLL_INTERVAL_HOURS?: string;
  DAILY_QUOTA?: string;
  MAX_RECEIPTS_PER_ACCOUNT?: string;
  MAX_ACCOUNTS?: string;
  PUBLIC_DATA_ENABLED?: string;
  PROCESSING_TIMES_BASE_URL?: string;
  /** "false" turns the daily news job off. Unset follows PUBLIC_DATA_ENABLED. */
  NEWS_ENABLED?: string;
  FEDERAL_REGISTER_BASE_URL?: string;
  /** Comma separated RSS or Atom feed addresses (https, uscis.gov only). None by default. */
  USCIS_FEED_URLS?: string;
  /** Secret for the admin API (targets, quarterly data imports, manual runs). */
  ADMIN_TOKEN?: string;
  /** Optional Workers Rate Limiting binding, keyed by client IP, for account creation. */
  ACCOUNT_LIMITER?: RateLimiter;
}

/** The Workers Rate Limiting binding (wrangler.toml [[ratelimits]]). */
export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface Config {
  baseUrl: string;
  environment: 'sandbox' | 'production';
  allowedOrigins: string[];
  pollIntervalHours: number;
  dailyQuota: number;
  /** Share of the daily quota kept free for on-demand refreshes and new subscriptions. */
  reserveShare: number;
  maxReceiptsPerAccount: number;
  /** Checks outside the schedule (new receipts, refreshes) per account per day. */
  immediateChecksPerAccount: number;
  maxAccounts: number;
  /** API calls per scheduled run, so a run stays well inside Worker time limits. */
  batchSize: number;
  /** Minimum gap between calls, to stay under 5 requests per second. */
  minCallGapMs: number;
  /** A user can refresh one receipt at most this often. */
  refreshCooldownMinutes: number;
  /** Accounts not seen for this long are deleted with their subscriptions. */
  inactiveAccountDays: number;
  /** Snapshots kept per receipt. */
  maxSnapshots: number;
  publicDataEnabled: boolean;
  processingTimesBaseUrl: string;
  newsEnabled: boolean;
  federalRegisterBaseUrl: string;
  /** Valid feed addresses from USCIS_FEED_URLS: https on uscis.gov, no credentials. */
  uscisFeedUrls: string[];
  /** Pages fetched per daily run and the gap between them, to be gentle with official sites. */
  publicBatchSize: number;
  publicGapMs: number;
  /** Months of Visa Bulletins to load when the table is empty. */
  bulletinBackfillMonths: number;
  adminToken: string;
}

const int = (value: string | undefined, fallback: number, min: number, max: number) => {
  // Unset or empty means the default, not zero.
  if (value === undefined || value.trim() === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
};

/** An https base address without a trailing slash, or the fallback when unset or not https. */
function httpsBase(value: string | undefined, fallback: string): string {
  try {
    const url = new URL((value ?? '').trim());
    if (url.protocol === 'https:' && !url.username && !url.password) {
      return `${url.origin}${url.pathname}`.replace(/\/+$/, '');
    }
  } catch {
    // Unset or not an address: use the default.
  }
  return fallback;
}

/** Feed addresses that are https on uscis.gov (or a subdomain); anything else is dropped. */
function feedUrls(value: string | undefined): string[] {
  const urls: string[] = [];
  for (const part of (value ?? '').split(/[\s,]+/)) {
    try {
      const url = new URL(part);
      const host = url.hostname.toLowerCase();
      const official = host === 'uscis.gov' || host.endsWith('.uscis.gov');
      if (url.protocol === 'https:' && official && !url.username && !url.password) {
        if (!urls.includes(url.href)) urls.push(url.href);
      }
    } catch {
      // Empty or not an address: dropped.
    }
  }
  return urls.slice(0, 10);
}

export function readConfig(env: Env): Config {
  const publicDataEnabled = env.PUBLIC_DATA_ENABLED !== 'false';
  const baseUrl = (env.USCIS_BASE_URL || 'https://api-int.uscis.gov').replace(/\/+$/, '');
  return {
    baseUrl,
    environment: /api-int\./.test(baseUrl) ? 'sandbox' : 'production',
    allowedOrigins: (env.ALLOWED_ORIGINS || '')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    pollIntervalHours: int(env.POLL_INTERVAL_HOURS, 12, 1, 168),
    dailyQuota: int(env.DAILY_QUOTA, 1000, 1, 1_000_000),
    reserveShare: 0.1,
    maxReceiptsPerAccount: int(env.MAX_RECEIPTS_PER_ACCOUNT, 10, 1, 100),
    immediateChecksPerAccount: 20,
    maxAccounts: int(env.MAX_ACCOUNTS, 500, 1, 1_000_000),
    batchSize: 40,
    minCallGapMs: 220,
    refreshCooldownMinutes: 60,
    inactiveAccountDays: 180,
    maxSnapshots: 50,
    publicDataEnabled,
    processingTimesBaseUrl: (
      env.PROCESSING_TIMES_BASE_URL || 'https://egov.uscis.gov/processing-times'
    ).replace(/\/+$/, ''),
    newsEnabled: env.NEWS_ENABLED ? env.NEWS_ENABLED !== 'false' : publicDataEnabled,
    federalRegisterBaseUrl: httpsBase(
      env.FEDERAL_REGISTER_BASE_URL,
      'https://www.federalregister.gov',
    ),
    uscisFeedUrls: feedUrls(env.USCIS_FEED_URLS),
    publicBatchSize: 60,
    publicGapMs: 1000,
    bulletinBackfillMonths: 24,
    adminToken: env.ADMIN_TOKEN ?? '',
  };
}
