// D1 queries for public data.
import type { BulletinRow, FormStat, ProcessingTime } from '@waymark/core';

export interface TargetRow {
  form: string;
  office: string;
  subtype: string;
  label: string;
  last_checked_at: string | null;
  last_error: string | null;
}

export class PublicStore {
  private readonly db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  async upsertTargets(
    targets: { form: string; office: string; subtype: string; label: string }[],
  ): Promise<void> {
    if (targets.length === 0) return;
    await this.db.batch(
      targets.map((t) =>
        this.db
          .prepare(
            `INSERT INTO pt_targets (form, office, subtype, label) VALUES (?, ?, ?, ?)
             ON CONFLICT (form, office, subtype) DO UPDATE SET label = excluded.label`,
          )
          .bind(t.form, t.office, t.subtype, t.label),
      ),
    );
  }

  async deleteTarget(form: string, office: string, subtype: string): Promise<void> {
    await this.db.batch([
      this.db
        .prepare('DELETE FROM pt_targets WHERE form = ? AND office = ? AND subtype = ?')
        .bind(form, office, subtype),
      this.db
        .prepare('DELETE FROM processing_times WHERE form = ? AND office = ? AND subtype = ?')
        .bind(form, office, subtype),
    ]);
  }

  async dueTargets(before: string, limit: number): Promise<TargetRow[]> {
    const res = await this.db
      .prepare(
        `SELECT * FROM pt_targets WHERE last_checked_at IS NULL OR last_checked_at < ?
         ORDER BY last_checked_at IS NOT NULL, last_checked_at LIMIT ?`,
      )
      .bind(before, limit)
      .all<TargetRow>();
    return res.results;
  }

  async markTarget(
    t: { form: string; office: string; subtype: string },
    now: string,
    error: string | null,
  ): Promise<void> {
    await this.db
      .prepare(
        'UPDATE pt_targets SET last_checked_at = ?, last_error = ? WHERE form = ? AND office = ? AND subtype = ?',
      )
      .bind(now, error, t.form, t.office, t.subtype)
      .run();
  }

  /** Insert a new published value, or move last_seen_at forward when it is already known. */
  async recordProcessingTime(
    t: ProcessingTime,
    fetchedDay: string,
    now: string,
  ): Promise<'new' | 'seen'> {
    const published = t.publishedDate ?? fetchedDay;
    const existing = await this.db
      .prepare(
        `SELECT 1 AS x FROM processing_times
         WHERE form = ? AND office = ? AND subtype = ? AND published_date = ? AND months = ?`,
      )
      .bind(t.form, t.office, t.subtype, published, t.months)
      .first();
    if (existing) {
      await this.db
        .prepare(
          `UPDATE processing_times SET last_seen_at = ?
           WHERE form = ? AND office = ? AND subtype = ? AND published_date = ? AND months = ?`,
        )
        .bind(now, t.form, t.office, t.subtype, published, t.months)
        .run();
      return 'seen';
    }
    await this.db
      .prepare(
        `INSERT INTO processing_times (form, office, subtype, published_date, date_from_source, months, low_months,
           subtype_label, first_seen_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        t.form,
        t.office,
        t.subtype,
        published,
        t.publishedDate ? 1 : 0,
        t.months,
        t.lowMonths ?? null,
        t.subtypeLabel ?? null,
        now,
        now,
      )
      .run();
    return 'new';
  }

  async latestProcessingTimes(form?: string) {
    const res = await this.db
      .prepare(
        `SELECT t.form, t.office, t.subtype, t.label, t.last_checked_at, t.last_error,
                p.published_date, p.date_from_source, p.months, p.low_months, p.subtype_label, p.last_seen_at
         FROM pt_targets t
         LEFT JOIN processing_times p ON p.rowid = (
           SELECT rowid FROM processing_times
           WHERE form = t.form AND office = t.office AND subtype = t.subtype
           ORDER BY published_date DESC, last_seen_at DESC LIMIT 1
         )
         WHERE ? IS NULL OR t.form = ?
         ORDER BY t.form, t.office, t.subtype`,
      )
      .bind(form ?? null, form ?? null)
      .all<Record<string, unknown>>();
    return res.results;
  }

  async processingTimeHistory(form: string, office: string, subtype: string) {
    const res = await this.db
      .prepare(
        `SELECT published_date, date_from_source, months, low_months, first_seen_at, last_seen_at
         FROM processing_times WHERE form = ? AND office = ? AND subtype = ?
         ORDER BY published_date, first_seen_at`,
      )
      .bind(form, office, subtype)
      .all<Record<string, unknown>>();
    return res.results;
  }

  async bulletinMonths(): Promise<string[]> {
    const res = await this.db
      .prepare('SELECT DISTINCT month FROM visa_bulletin ORDER BY month')
      .all<{ month: string }>();
    return res.results.map((r) => r.month);
  }

  async replaceBulletin(
    month: string,
    rows: BulletinRow[],
    sourceUrl: string,
    now: string,
  ): Promise<void> {
    await this.db.batch([
      this.db.prepare('DELETE FROM visa_bulletin WHERE month = ?').bind(month),
      ...rows.map((r) =>
        this.db
          .prepare(
            `INSERT INTO visa_bulletin (month, chart, preference, category, country, cutoff, source_url, fetched_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(r.month, r.chart, r.preference, r.category, r.country, r.cutoff, sourceUrl, now),
      ),
    ]);
  }

  async bulletinOptions() {
    const res = await this.db
      .prepare(
        'SELECT DISTINCT chart, preference, category, country FROM visa_bulletin ORDER BY preference, category, country',
      )
      .all<{ chart: string; preference: string; category: string; country: string }>();
    return res.results;
  }

  async bulletinSeries(chart: string, preference: string, category: string, country: string) {
    const res = await this.db
      .prepare(
        `SELECT month, cutoff, source_url, fetched_at FROM visa_bulletin
         WHERE chart = ? AND preference = ? AND category = ? AND country = ? ORDER BY month`,
      )
      .bind(chart, preference, category, country)
      .all<{ month: string; cutoff: string; source_url: string; fetched_at: string }>();
    return res.results;
  }

  async upsertFormStats(records: FormStat[], sourceUrl: string, now: string): Promise<void> {
    for (let i = 0; i < records.length; i += 50) {
      await this.db.batch(
        records.slice(i, i + 50).map((r) =>
          this.db
            .prepare(
              `INSERT INTO form_stats (quarter, form, office, received, approved, denied, pending, source_url, imported_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT (quarter, form, office) DO UPDATE SET received = excluded.received,
                 approved = excluded.approved, denied = excluded.denied, pending = excluded.pending,
                 source_url = excluded.source_url, imported_at = excluded.imported_at`,
            )
            .bind(
              r.quarter,
              r.form,
              r.office,
              r.received,
              r.approved,
              r.denied,
              r.pending,
              sourceUrl,
              now,
            ),
        ),
      );
    }
  }

  async statForms(): Promise<string[]> {
    const res = await this.db
      .prepare('SELECT DISTINCT form FROM form_stats ORDER BY form')
      .all<{ form: string }>();
    return res.results.map((r) => r.form);
  }

  async formStats(form: string) {
    const res = await this.db
      .prepare(
        `SELECT quarter, office, received, approved, denied, pending, source_url, imported_at
         FROM form_stats WHERE form = ? ORDER BY quarter, office`,
      )
      .bind(form)
      .all<Record<string, unknown>>();
    return res.results;
  }

  async recordRun(dataset: string, now: string, error: string | null): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO data_runs (dataset, last_run_at, last_success_at, last_error) VALUES (?, ?, ?, ?)
         ON CONFLICT (dataset) DO UPDATE SET last_run_at = excluded.last_run_at,
           last_success_at = COALESCE(excluded.last_success_at, data_runs.last_success_at),
           last_error = excluded.last_error`,
      )
      .bind(dataset, now, error ? null : now, error)
      .run();
  }

  async runs() {
    const res = await this.db
      .prepare('SELECT * FROM data_runs ORDER BY dataset')
      .all<Record<string, unknown>>();
    return res.results;
  }
}
