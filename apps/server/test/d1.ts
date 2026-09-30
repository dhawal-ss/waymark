// Minimal D1Database over node:sqlite so tests run the real SQL and migrations.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

type Param = string | number | null | bigint | Uint8Array;
const norm = (params: unknown[]): Param[] =>
  params.map((p) => (p === undefined ? null : (p as Param)));

class Statement {
  private readonly db: DatabaseSync;
  readonly sql: string;
  readonly params: Param[];

  constructor(db: DatabaseSync, sql: string, params: Param[] = []) {
    this.db = db;
    this.sql = sql;
    this.params = params;
  }

  bind(...params: unknown[]): Statement {
    return new Statement(this.db, this.sql, norm(params));
  }

  async first<T>(column?: string): Promise<T | null> {
    const row = this.db.prepare(this.sql).get(...this.params) as
      Record<string, unknown> | undefined;
    if (!row) return null;
    return (column ? row[column] : { ...row }) as T;
  }

  async all<T>(): Promise<{ results: T[]; success: true; meta: Record<string, unknown> }> {
    const rows = this.db.prepare(this.sql).all(...this.params) as T[];
    return { results: rows.map((r) => ({ ...(r as object) }) as T), success: true, meta: {} };
  }

  async run(): Promise<{ success: true; meta: { changes: number; last_row_id: number } }> {
    const res = this.db.prepare(this.sql).run(...this.params);
    return {
      success: true,
      meta: { changes: Number(res.changes), last_row_id: Number(res.lastInsertRowid) },
    };
  }
}

export class FakeD1 {
  readonly raw: DatabaseSync;

  constructor() {
    this.raw = new DatabaseSync(':memory:');
    this.raw.exec('PRAGMA foreign_keys = ON;');
  }

  prepare(sql: string): Statement {
    return new Statement(this.raw, sql);
  }

  async batch(statements: Statement[]) {
    this.raw.exec('BEGIN');
    try {
      const out = [];
      for (const s of statements) out.push(await s.run());
      this.raw.exec('COMMIT');
      return out;
    } catch (e) {
      this.raw.exec('ROLLBACK');
      throw e;
    }
  }

  async exec(sql: string) {
    this.raw.exec(sql);
    return { count: 0, duration: 0 };
  }

  /** Apply every migration in order, as `wrangler d1 migrations apply` would. */
  static withMigrations(): FakeD1 {
    const db = new FakeD1();
    const dir = join(import.meta.dirname, '..', 'migrations');
    for (const file of readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .sort()) {
      db.raw.exec(readFileSync(join(dir, file), 'utf8'));
    }
    return db;
  }

  /** Every text value stored in any table, for leak checks. */
  dump(): string {
    const tables = this.raw
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all() as { name: string }[];
    return tables
      .map(({ name }) => JSON.stringify(this.raw.prepare(`SELECT * FROM "${name}"`).all()))
      .join('\n');
  }
}
