// Public data endpoints (no account needed) and the admin API for maintainers.
import {
  isFormNumber,
  isLocalDate,
  NEWS_CATEGORIES,
  normalizeStatForm,
  parseQuarter,
  type FormStat,
} from '@waymark/core';
import type { Context, Hono, Next } from 'hono';
import { sha256Hex } from './crypto';
import {
  refreshNews,
  refreshProcessingTimes,
  refreshVisaBulletins,
  type PublicDeps,
} from './publicJobs';

type Resolve = () => Promise<PublicDeps>;

const CACHE = 'public, max-age=3600';

const err = (c: Context, status: 400 | 401 | 404 | 503, code: string, message: string) =>
  c.json({ error: { code, message } }, status);

const isCode = (v: unknown, max = 40): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= max && /^[\w .()/-]+$/.test(v);

/** Hono environment shared with app.ts. */
export type AppEnv = { Variables: { accountId: string } };

export function mountPublicRoutes(app: Hono<AppEnv>, resolve: Resolve): void {
  const admin = async (c: Context, next: Next) => {
    const d = await resolve();
    const token = /^Bearer\s+(\S+)$/.exec(c.req.header('Authorization') ?? '')?.[1] ?? '';
    if (!d.config.adminToken)
      return err(c, 503, 'admin_disabled', 'Set ADMIN_TOKEN to use the admin API.');
    if (!token || (await sha256Hex(token)) !== (await sha256Hex(d.config.adminToken))) {
      return err(c, 401, 'unauthorized', 'The admin token is not valid.');
    }
    await next();
  };

  app.get('/v1/public/status', async (c) => {
    const d = await resolve();
    c.header('Cache-Control', 'public, max-age=300');
    return c.json({ enabled: d.config.publicDataEnabled, datasets: await d.publicStore.runs() });
  });

  app.get('/v1/public/processing-times', async (c) => {
    const d = await resolve();
    const form = c.req.query('form');
    const rows = await d.publicStore.latestProcessingTimes(isCode(form) ? form : undefined);
    c.header('Cache-Control', CACHE);
    return c.json({
      source: 'https://egov.uscis.gov/processing-times/',
      items: rows.map((r) => ({
        form: r.form,
        office: r.office,
        subtype: r.subtype,
        label: r.label || r.subtype_label || '',
        months: r.months ?? null,
        lowMonths: r.low_months ?? null,
        publishedDate: r.published_date ?? null,
        dateFromSource: r.date_from_source === 1,
        lastSeenAt: r.last_seen_at ?? null,
        lastCheckedAt: r.last_checked_at ?? null,
        lastError: r.last_error ?? null,
      })),
    });
  });

  app.get('/v1/public/processing-times/history', async (c) => {
    const d = await resolve();
    const { form, office, subtype = '' } = c.req.query();
    if (!isCode(form) || !isCode(office) || (subtype && !isCode(subtype))) {
      return err(c, 400, 'invalid', 'Pass form, office, and subtype.');
    }
    const rows = await d.publicStore.processingTimeHistory(form, office, subtype);
    c.header('Cache-Control', CACHE);
    return c.json({
      source: 'https://egov.uscis.gov/processing-times/',
      points: rows.map((r) => ({
        publishedDate: r.published_date,
        dateFromSource: r.date_from_source === 1,
        months: r.months,
        lowMonths: r.low_months,
        firstSeenAt: r.first_seen_at,
        lastSeenAt: r.last_seen_at,
      })),
    });
  });

  app.get('/v1/public/visa-bulletin/options', async (c) => {
    const d = await resolve();
    c.header('Cache-Control', CACHE);
    return c.json({
      months: await d.publicStore.bulletinMonths(),
      options: await d.publicStore.bulletinOptions(),
    });
  });

  app.get('/v1/public/visa-bulletin', async (c) => {
    const d = await resolve();
    const { chart, preference, category, country } = c.req.query();
    if (
      !['final', 'filing'].includes(chart ?? '') ||
      !['family', 'employment'].includes(preference ?? '') ||
      !isCode(category) ||
      !isCode(country)
    ) {
      return err(
        c,
        400,
        'invalid',
        'Pass chart (final or filing), preference (family or employment), category, and country.',
      );
    }
    const rows = await d.publicStore.bulletinSeries(chart!, preference!, category, country);
    c.header('Cache-Control', CACHE);
    return c.json({
      points: rows.map((r) => ({
        month: r.month,
        cutoff: r.cutoff,
        sourceUrl: r.source_url,
        fetchedAt: r.fetched_at,
      })),
    });
  });

  app.get('/v1/public/form-stats', async (c) => {
    const d = await resolve();
    const form = c.req.query('form');
    c.header('Cache-Control', CACHE);
    if (!form) return c.json({ forms: await d.publicStore.statForms() });
    if (!isCode(form)) return err(c, 400, 'invalid', 'Pass a form number, for example I-485.');
    const rows = await d.publicStore.formStats(form);
    return c.json({
      form,
      records: rows.map((r) => ({
        quarter: r.quarter,
        office: r.office,
        received: r.received,
        approved: r.approved,
        denied: r.denied,
        pending: r.pending,
        sourceUrl: r.source_url,
        importedAt: r.imported_at,
      })),
    });
  });

  app.get('/v1/public/news', async (c) => {
    const d = await resolve();
    const { limit: rawLimit = '', before = '', category = '', form = '' } = c.req.query();
    if (rawLimit && !/^-?\d{1,9}$/.test(rawLimit))
      return err(c, 400, 'invalid', 'Pass limit as a whole number from 1 to 100.');
    if (before && !isLocalDate(before))
      return err(c, 400, 'invalid', 'Pass before as a date like 2026-03-02.');
    if (category && !(NEWS_CATEGORIES as readonly string[]).includes(category))
      return err(c, 400, 'invalid', `Pass category as one of: ${NEWS_CATEGORIES.join(', ')}.`);
    const formNumber = form.toUpperCase();
    if (form && !isFormNumber(formNumber))
      return err(c, 400, 'invalid', 'Pass form as a form number, for example I-485.');
    const items = await d.publicStore.listNews({
      limit: rawLimit ? Math.min(100, Math.max(1, Number(rawLimit))) : 40,
      before: before || undefined,
      category: category || undefined,
      form: form ? formNumber : undefined,
    });
    c.header('Cache-Control', 'public, max-age=900');
    return c.json({ items });
  });

  // Admin

  app.post('/v1/admin/pt-targets', admin, async (c) => {
    const d = await resolve();
    const body = (await c.req.json().catch(() => ({}))) as { targets?: unknown };
    const targets = Array.isArray(body.targets) ? body.targets : [];
    const valid = targets.flatMap((t) => {
      const o = (t ?? {}) as Record<string, unknown>;
      const subtype = typeof o.subtype === 'string' ? o.subtype : '';
      return isCode(o.form) && isCode(o.office) && (!subtype || isCode(subtype))
        ? [
            {
              form: o.form,
              office: o.office,
              subtype,
              label: typeof o.label === 'string' ? o.label.slice(0, 200) : '',
            },
          ]
        : [];
    });
    if (valid.length === 0)
      return err(c, 400, 'invalid', 'Send targets as [{ form, office, subtype, label }].');
    await d.publicStore.upsertTargets(valid);
    return c.json({ saved: valid.length, skipped: targets.length - valid.length });
  });

  app.delete('/v1/admin/pt-targets', admin, async (c) => {
    const d = await resolve();
    const { form, office, subtype = '' } = c.req.query();
    if (!isCode(form) || !isCode(office))
      return err(c, 400, 'invalid', 'Pass form, office, and subtype.');
    await d.publicStore.deleteTarget(form, office, subtype);
    return c.body(null, 204);
  });

  app.post('/v1/admin/form-stats', admin, async (c) => {
    const d = await resolve();
    const body = (await c.req.json().catch(() => ({}))) as { source?: unknown; records?: unknown };
    const source =
      typeof body.source === 'string' && /^https:\/\/(www\.)?uscis\.gov\//.test(body.source)
        ? body.source
        : '';
    if (!source)
      return err(
        c,
        400,
        'invalid',
        'Pass source: the uscis.gov URL of the file the records came from.',
      );
    const num = (v: unknown) =>
      typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : null;
    const records: FormStat[] = (Array.isArray(body.records) ? body.records : []).flatMap((r) => {
      const o = (r ?? {}) as Record<string, unknown>;
      const quarter = typeof o.quarter === 'string' ? parseQuarter(o.quarter) : null;
      const form = typeof o.form === 'string' ? normalizeStatForm(o.form) : null;
      const office = typeof o.office === 'string' ? o.office.trim().slice(0, 120) : '';
      return quarter && form && office
        ? [
            {
              quarter,
              form,
              office,
              received: num(o.received),
              approved: num(o.approved),
              denied: num(o.denied),
              pending: num(o.pending),
            },
          ]
        : [];
    });
    if (records.length === 0)
      return err(c, 400, 'invalid', 'No valid records. Each needs quarter, form, and office.');
    await d.publicStore.upsertFormStats(records, source, d.now().toISOString());
    return c.json({ saved: records.length });
  });

  app.post('/v1/admin/run', admin, async (c) => {
    const d = await resolve();
    const job = c.req.query('job');
    if (job === 'processing-times') return c.json(await refreshProcessingTimes(d));
    if (job === 'visa-bulletin') return c.json(await refreshVisaBulletins(d));
    if (job === 'news') return c.json(await refreshNews(d));
    return err(c, 400, 'invalid', 'Pass job=processing-times, job=visa-bulletin, or job=news.');
  });
}
