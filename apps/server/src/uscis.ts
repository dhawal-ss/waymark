// Client for the official USCIS Case Status API: OAuth 2.0 client credentials, token caching,
// and plain error classification. Never logs receipt numbers or credentials.

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type StatusResult =
  | { kind: 'ok'; body: unknown }
  | { kind: 'not_found'; message: string }
  | { kind: 'invalid'; message: string }
  | { kind: 'rate_limited'; retryAfterSeconds: number | null }
  | { kind: 'auth_failed'; message: string }
  | { kind: 'error'; status: number; message: string };

interface CachedToken {
  value: string;
  expiresAt: number;
}

export interface UscisClientOptions {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  fetch?: FetchLike;
  now?: () => number;
}

export class UscisClient {
  private token: CachedToken | null = null;
  private readonly options: Required<Omit<UscisClientOptions, 'fetch' | 'now'>>;
  private readonly fetcher: FetchLike;
  private readonly now: () => number;

  constructor(options: UscisClientOptions) {
    this.options = {
      baseUrl: options.baseUrl.replace(/\/+$/, ''),
      clientId: options.clientId,
      clientSecret: options.clientSecret,
    };
    this.fetcher = options.fetch ?? ((input, init) => fetch(input, init));
    this.now = options.now ?? (() => Date.now());
  }

  get configured(): boolean {
    return Boolean(this.options.clientId && this.options.clientSecret);
  }

  /** Access token, reused until one minute before it expires (USCIS tokens last 30 minutes). */
  async accessToken(force = false): Promise<string> {
    if (!force && this.token && this.token.expiresAt - 60_000 > this.now()) return this.token.value;
    const res = await this.fetcher(`${this.options.baseUrl}/oauth/accesstoken`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.options.clientId,
        client_secret: this.options.clientSecret,
      }).toString(),
    });
    if (!res.ok) throw new TokenError(res.status);
    const body = (await res.json()) as { access_token?: unknown; expires_in?: unknown };
    if (typeof body.access_token !== 'string' || !body.access_token)
      throw new TokenError(res.status);
    const seconds = Number(body.expires_in);
    this.token = {
      value: body.access_token,
      expiresAt: this.now() + (Number.isFinite(seconds) && seconds > 0 ? seconds : 1800) * 1000,
    };
    return this.token.value;
  }

  async caseStatus(receipt: string): Promise<StatusResult> {
    let token: string;
    try {
      token = await this.accessToken();
    } catch (e) {
      return {
        kind: 'auth_failed',
        message: e instanceof TokenError ? e.message : 'Token request failed.',
      };
    }
    let res = await this.request(receipt, token);
    if (res.status === 401) {
      // Token revoked or expired early: get a new one once.
      try {
        token = await this.accessToken(true);
      } catch (e) {
        return {
          kind: 'auth_failed',
          message: e instanceof TokenError ? e.message : 'Token request failed.',
        };
      }
      res = await this.request(receipt, token);
    }
    const body = await res.json().catch(() => null);
    const message = messageOf(body);
    if (res.ok) return { kind: 'ok', body };
    if (res.status === 404)
      return {
        kind: 'not_found',
        message: message || 'USCIS has no case with this receipt number.',
      };
    if (res.status === 400 || res.status === 422)
      return { kind: 'invalid', message: message || 'USCIS rejected the receipt number.' };
    if (res.status === 429) {
      const retry = Number(res.headers.get('Retry-After'));
      return { kind: 'rate_limited', retryAfterSeconds: Number.isFinite(retry) ? retry : null };
    }
    if (res.status === 401 || res.status === 403)
      return { kind: 'auth_failed', message: 'USCIS rejected the API credentials.' };
    return {
      kind: 'error',
      status: res.status,
      message: message || `USCIS returned HTTP ${res.status}.`,
    };
  }

  private request(receipt: string, token: string): Promise<Response> {
    return this.fetcher(`${this.options.baseUrl}/case-status/${encodeURIComponent(receipt)}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
  }
}

export class TokenError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(
      `USCIS token request failed with HTTP ${status}. Check USCIS_CLIENT_ID and USCIS_CLIENT_SECRET.`,
    );
    this.status = status;
  }
}

function messageOf(body: unknown): string {
  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>;
    for (const key of ['message', 'error_description', 'error']) {
      if (typeof b[key] === 'string' && b[key]) return b[key] as string;
    }
  }
  return '';
}
