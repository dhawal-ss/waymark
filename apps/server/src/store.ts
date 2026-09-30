// D1 queries. Every value that identifies a person or case is encrypted before it gets here.

export interface ReceiptRow {
  hmac: string;
  enc: string;
  created_at: string;
  last_checked_at: string | null;
  last_hash: string | null;
  last_change_at: string | null;
  fail_count: number;
  last_error: string | null;
}

export interface SubscriptionRow {
  id: string;
  account_id: string;
  receipt_hmac: string;
  created_at: string;
}

export interface SnapshotRow {
  id: number;
  receipt_hmac: string;
  fetched_at: string;
  hash: string;
  enc: string;
}

export class Store {
  private readonly db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  // Accounts

  async countAccounts(): Promise<number> {
    const row = await this.db.prepare('SELECT COUNT(*) AS n FROM accounts').first<{ n: number }>();
    return row?.n ?? 0;
  }

  async createAccount(id: string, tokenHash: string, now: string): Promise<void> {
    await this.db
      .prepare(
        'INSERT INTO accounts (id, token_hash, created_at, last_seen_at) VALUES (?, ?, ?, ?)',
      )
      .bind(id, tokenHash, now, now)
      .run();
  }

  async accountByTokenHash(
    tokenHash: string,
  ): Promise<{ id: string; last_seen_at: string } | null> {
    return this.db
      .prepare('SELECT id, last_seen_at FROM accounts WHERE token_hash = ?')
      .bind(tokenHash)
      .first<{ id: string; last_seen_at: string }>();
  }

  async touchAccount(id: string, now: string): Promise<void> {
    await this.db.prepare('UPDATE accounts SET last_seen_at = ? WHERE id = ?').bind(now, id).run();
  }

  async deleteAccount(id: string): Promise<void> {
    await this.db.batch([
      this.db.prepare('DELETE FROM subscriptions WHERE account_id = ?').bind(id),
      this.db.prepare('DELETE FROM accounts WHERE id = ?').bind(id),
    ]);
    await this.collectGarbage();
  }

  async deleteInactiveAccounts(before: string): Promise<number> {
    const stale = await this.db
      .prepare('SELECT id FROM accounts WHERE last_seen_at < ?')
      .bind(before)
      .all<{ id: string }>();
    for (const { id } of stale.results) {
      await this.db.batch([
        this.db.prepare('DELETE FROM subscriptions WHERE account_id = ?').bind(id),
        this.db.prepare('DELETE FROM accounts WHERE id = ?').bind(id),
      ]);
    }
    if (stale.results.length > 0) await this.collectGarbage();
    return stale.results.length;
  }

  // Receipts and subscriptions

  async receipt(hmac: string): Promise<ReceiptRow | null> {
    return this.db.prepare('SELECT * FROM receipts WHERE hmac = ?').bind(hmac).first<ReceiptRow>();
  }

  async ensureReceipt(hmac: string, enc: string, now: string): Promise<void> {
    await this.db
      .prepare(
        'INSERT INTO receipts (hmac, enc, created_at) VALUES (?, ?, ?) ON CONFLICT (hmac) DO NOTHING',
      )
      .bind(hmac, enc, now)
      .run();
  }

  async subscriptions(accountId: string): Promise<(SubscriptionRow & ReceiptRow)[]> {
    const res = await this.db
      .prepare(
        `SELECT s.id, s.account_id, s.receipt_hmac, s.created_at, r.hmac, r.enc, r.last_checked_at,
                r.last_hash, r.last_change_at, r.fail_count, r.last_error
         FROM subscriptions s JOIN receipts r ON r.hmac = s.receipt_hmac
         WHERE s.account_id = ? ORDER BY s.created_at`,
      )
      .bind(accountId)
      .all<SubscriptionRow & ReceiptRow>();
    return res.results;
  }

  async subscription(accountId: string, id: string): Promise<SubscriptionRow | null> {
    return this.db
      .prepare('SELECT * FROM subscriptions WHERE id = ? AND account_id = ?')
      .bind(id, accountId)
      .first<SubscriptionRow>();
  }

  async subscriptionByReceipt(accountId: string, hmac: string): Promise<SubscriptionRow | null> {
    return this.db
      .prepare('SELECT * FROM subscriptions WHERE account_id = ? AND receipt_hmac = ?')
      .bind(accountId, hmac)
      .first<SubscriptionRow>();
  }

  async countSubscriptions(accountId: string): Promise<number> {
    const row = await this.db
      .prepare('SELECT COUNT(*) AS n FROM subscriptions WHERE account_id = ?')
      .bind(accountId)
      .first<{ n: number }>();
    return row?.n ?? 0;
  }

  async createSubscription(row: SubscriptionRow): Promise<void> {
    await this.db
      .prepare(
        'INSERT INTO subscriptions (id, account_id, receipt_hmac, created_at) VALUES (?, ?, ?, ?)',
      )
      .bind(row.id, row.account_id, row.receipt_hmac, row.created_at)
      .run();
  }

  async deleteSubscription(accountId: string, id: string): Promise<boolean> {
    const res = await this.db
      .prepare('DELETE FROM subscriptions WHERE id = ? AND account_id = ?')
      .bind(id, accountId)
      .run();
    await this.collectGarbage();
    return (res.meta.changes ?? 0) > 0;
  }

  /** Remove receipts nobody tracks, with their snapshots. */
  async collectGarbage(): Promise<void> {
    await this.db.batch([
      this.db.prepare(
        'DELETE FROM snapshots WHERE receipt_hmac NOT IN (SELECT receipt_hmac FROM subscriptions)',
      ),
      this.db.prepare(
        'DELETE FROM receipts WHERE hmac NOT IN (SELECT receipt_hmac FROM subscriptions)',
      ),
    ]);
  }

  /** Receipts not checked since `before`, oldest first. Failing receipts back off. */
  async dueReceipts(before: string, limit: number): Promise<ReceiptRow[]> {
    const res = await this.db
      .prepare(
        `SELECT * FROM receipts
         WHERE last_checked_at IS NULL OR last_checked_at < ?
         ORDER BY last_checked_at IS NOT NULL, last_checked_at, fail_count
         LIMIT ?`,
      )
      .bind(before, limit)
      .all<ReceiptRow>();
    return res.results;
  }

  async recordCheck(hmac: string, now: string, error: string | null): Promise<void> {
    await this.db
      .prepare(
        `UPDATE receipts SET last_checked_at = ?, last_error = ?,
           fail_count = CASE WHEN ? IS NULL THEN 0 ELSE fail_count + 1 END
         WHERE hmac = ?`,
      )
      .bind(now, error, error, hmac)
      .run();
  }

  async recordChange(
    hmac: string,
    hash: string,
    enc: string,
    now: string,
    keep: number,
  ): Promise<void> {
    await this.db.batch([
      this.db
        .prepare('INSERT INTO snapshots (receipt_hmac, fetched_at, hash, enc) VALUES (?, ?, ?, ?)')
        .bind(hmac, now, hash, enc),
      this.db
        .prepare('UPDATE receipts SET last_hash = ?, last_change_at = ? WHERE hmac = ?')
        .bind(hash, now, hmac),
      this.db
        .prepare(
          `DELETE FROM snapshots WHERE receipt_hmac = ? AND id NOT IN
             (SELECT id FROM snapshots WHERE receipt_hmac = ? ORDER BY id DESC LIMIT ?)`,
        )
        .bind(hmac, hmac, keep),
    ]);
  }

  /** Latest snapshot per subscribed receipt with id greater than `after`. */
  async latestSnapshots(
    accountId: string,
    after: number,
  ): Promise<(SnapshotRow & { subscription_id: string })[]> {
    const res = await this.db
      .prepare(
        `SELECT sn.*, s.id AS subscription_id FROM subscriptions s
         JOIN snapshots sn ON sn.id = (
           SELECT MAX(id) FROM snapshots WHERE receipt_hmac = s.receipt_hmac
         )
         WHERE s.account_id = ? AND sn.id > ?
         ORDER BY sn.id`,
      )
      .bind(accountId, after)
      .all<SnapshotRow & { subscription_id: string }>();
    return res.results;
  }

  // Quota

  async usage(day: string): Promise<number> {
    const row = await this.db
      .prepare('SELECT calls FROM usage WHERE day = ?')
      .bind(day)
      .first<{ calls: number }>();
    return row?.calls ?? 0;
  }

  async addUsage(day: string, calls = 1): Promise<void> {
    await this.db
      .prepare(
        'INSERT INTO usage (day, calls) VALUES (?, ?) ON CONFLICT (day) DO UPDATE SET calls = calls + excluded.calls',
      )
      .bind(day, calls)
      .run();
  }
}
