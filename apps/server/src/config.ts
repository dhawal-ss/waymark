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
}

const int = (value: string | undefined, fallback: number, min: number, max: number) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
};

export function readConfig(env: Env): Config {
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
    maxAccounts: int(env.MAX_ACCOUNTS, 500, 1, 1_000_000),
    batchSize: 40,
    minCallGapMs: 220,
    refreshCooldownMinutes: 60,
    inactiveAccountDays: 180,
    maxSnapshots: 50,
  };
}
