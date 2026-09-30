// Public data (processing times, Visa Bulletin cutoffs, quarterly form data) from the sync
// server. Off by default. Requests carry only the form or category being viewed.
import type { Cutoff, LocalDate, SeriesPoint } from '@waymark/core';
import { mutate, nowInstant, store } from './stores/data.svelte';
import { serverSync } from './serverSync.svelte';

export class PublicDataError extends Error {}

export const publicDataOn = (): boolean => store.data.prefs.publicData && Boolean(serverSync.url);

async function get<T>(path: string): Promise<T> {
  if (!serverSync.url) throw new PublicDataError('Set the sync server address in Settings first.');
  let res: Response;
  try {
    res = await fetch(`${serverSync.url}${path}`, { headers: { Accept: 'application/json' } });
  } catch {
    throw new PublicDataError(
      'The sync server did not respond. Check your connection or the server address.',
    );
  }
  const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
  if (!res.ok)
    throw new PublicDataError(
      body?.error?.message ?? `The sync server returned HTTP ${res.status}.`,
    );
  return body as T;
}

const q = (params: Record<string, string>) => new URLSearchParams(params).toString();

export interface DatasetRun {
  dataset: string;
  last_run_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
}

export const fetchStatus = () =>
  get<{ enabled: boolean; datasets: DatasetRun[] }>('/v1/public/status');

export interface LatestTime {
  form: string;
  office: string;
  subtype: string;
  label: string;
  months: number | null;
  publishedDate: LocalDate | null;
  dateFromSource: boolean;
  lastCheckedAt: string | null;
  lastError: string | null;
}

export const fetchProcessingTimes = (form?: string) =>
  get<{ source: string; items: LatestTime[] }>(
    `/v1/public/processing-times${form ? `?${q({ form })}` : ''}`,
  );

export interface TimePoint {
  publishedDate: LocalDate;
  dateFromSource: boolean;
  months: number;
  lowMonths: number | null;
}

export const fetchTimeHistory = (form: string, office: string, subtype: string) =>
  get<{ source: string; points: TimePoint[] }>(
    `/v1/public/processing-times/history?${q({ form, office, subtype })}`,
  );

export interface BulletinOption {
  chart: 'final' | 'filing';
  preference: 'family' | 'employment';
  category: string;
  country: string;
}

export const fetchBulletinOptions = () =>
  get<{ months: string[]; options: BulletinOption[] }>('/v1/public/visa-bulletin/options');

export interface BulletinPoint {
  month: string;
  cutoff: LocalDate | 'C' | 'U';
  sourceUrl: string;
  fetchedAt: string;
}

export const fetchBulletin = (o: BulletinOption) =>
  get<{ points: BulletinPoint[] }>(`/v1/public/visa-bulletin?${q({ ...o })}`);

export interface FormStatRecord {
  quarter: string;
  office: string;
  received: number | null;
  approved: number | null;
  denied: number | null;
  pending: number | null;
  sourceUrl: string;
  importedAt: string;
}

export const fetchStatForms = () => get<{ forms: string[] }>('/v1/public/form-stats');
export const fetchFormStats = (form: string) =>
  get<{ form: string; records: FormStatRecord[] }>(`/v1/public/form-stats?${q({ form })}`);

/** One point per publication; the latest value wins when USCIS republishes on the same date. */
export function timePoints(points: TimePoint[]): SeriesPoint[] {
  const byDate = new Map<string, number>();
  for (const p of points) byDate.set(p.publishedDate, p.months);
  return [...byDate]
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Bulletin points as projection cutoffs. "U" (unavailable) months are left out. */
export function bulletinCutoffs(points: BulletinPoint[]): {
  cutoffs: Cutoff[];
  unavailable: number;
} {
  const cutoffs = points.flatMap((p) =>
    p.cutoff === 'U' ? [] : [{ month: p.month, cutoff: p.cutoff }],
  );
  return { cutoffs, unavailable: points.length - cutoffs.length };
}

/** Update linked series and cutoffs from the server. Quiet; failures leave data unchanged. */
export async function refreshLinked(): Promise<{ updated: number; error: string }> {
  if (!publicDataOn()) return { updated: 0, error: '' };
  let updated = 0;
  let error = '';
  for (const s of store.data.series.filter((x) => x.source)) {
    const src = s.source!;
    try {
      const { points } = await fetchTimeHistory(src.form, src.office, src.subtype);
      const next = timePoints(points);
      mutate((d) => {
        const target = d.series.find((x) => x.id === s.id);
        if (!target?.source) return;
        target.points = next;
        target.source.updatedAt = nowInstant();
      });
      updated++;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Updating from the server failed.';
    }
  }
  const vs = store.data.visa.source;
  if (vs) {
    try {
      const { points } = await fetchBulletin(vs);
      const { cutoffs } = bulletinCutoffs(points);
      mutate((d) => {
        if (!d.visa.source) return;
        d.visa.cutoffs = cutoffs;
        d.visa.source.updatedAt = nowInstant();
      });
      updated++;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Updating from the server failed.';
    }
  }
  return { updated, error };
}
