// Checks receipts against the Case Status API within the rate limit and daily quota, and stores a
// snapshot only when the normalized result changes.
import { parseCaseStatusResponse, type ParsedCase } from '@waymark/core';
import type { Config } from './config';
import { sha256Hex, type Sealer } from './crypto';
import type { ReceiptRow, Store } from './store';
import type { UscisClient } from './uscis';

export interface CheckerDeps {
  store: Store;
  uscis: UscisClient;
  sealer: Sealer;
  config: Config;
  now: () => Date;
  sleep: (ms: number) => Promise<void>;
}

export type CheckOutcome =
  | { kind: 'changed'; case: ParsedCase }
  | { kind: 'unchanged' }
  | { kind: 'failed'; message: string }
  | { kind: 'stop'; message: string };

export const utcDay = (d: Date): string => d.toISOString().slice(0, 10);

/** Stable text for hashing: key order fixed, fetch-specific fields excluded. */
export function canonical(c: ParsedCase): string {
  return JSON.stringify({
    receipt: c.receipt,
    form: c.form,
    submittedAt: c.submittedAt ?? null,
    updatedAt: c.updatedAt ?? null,
    events: c.events.map((e) => [e.code, e.at, e.text ?? null]),
  });
}

/** Remaining calls today, keeping a reserve unless `useReserve`. */
export async function remainingQuota(deps: CheckerDeps, useReserve: boolean): Promise<number> {
  const used = await deps.store.usage(utcDay(deps.now()));
  const reserve = useReserve ? 0 : Math.ceil(deps.config.dailyQuota * deps.config.reserveShare);
  return Math.max(0, deps.config.dailyQuota - reserve - used);
}

/** Check one receipt now. Counts one call against the quota. */
export async function checkReceipt(deps: CheckerDeps, row: ReceiptRow): Promise<CheckOutcome> {
  const receipt = await deps.sealer.decrypt(row.enc);
  const now = deps.now();
  await deps.store.addUsage(utcDay(now));
  const result = await deps.uscis.caseStatus(receipt);
  const stamp = now.toISOString();

  if (result.kind === 'rate_limited') return { kind: 'stop', message: 'USCIS rate limit reached.' };
  if (result.kind === 'auth_failed') return { kind: 'stop', message: result.message };
  if (result.kind !== 'ok') {
    const message =
      result.kind === 'not_found'
        ? 'USCIS has no case with this receipt number in this environment.'
        : result.message;
    await deps.store.recordCheck(row.hmac, stamp, message);
    return { kind: 'failed', message };
  }

  const parsed = parseCaseStatusResponse(result.body);
  if (!parsed.ok || parsed.case.receipt !== receipt) {
    const message = parsed.ok ? 'USCIS returned a different receipt number.' : parsed.error;
    await deps.store.recordCheck(row.hmac, stamp, message);
    return { kind: 'failed', message };
  }
  // Hash a canonical form to detect changes; store the full parsed case for clients.
  const hash = await sha256Hex(canonical(parsed.case));
  await deps.store.recordCheck(row.hmac, stamp, null);
  if (hash === row.last_hash) return { kind: 'unchanged' };
  const sealed = await deps.sealer.encrypt(JSON.stringify(parsed.case));
  await deps.store.recordChange(row.hmac, hash, sealed, stamp, deps.config.maxSnapshots);
  return { kind: 'changed', case: parsed.case };
}

export interface PollSummary {
  checked: number;
  changed: number;
  failed: number;
  stopped: string | null;
}

/** Scheduled run: check due receipts, oldest first, within quota and rate limits. */
export async function pollDue(deps: CheckerDeps): Promise<PollSummary> {
  const summary: PollSummary = { checked: 0, changed: 0, failed: 0, stopped: null };
  if (!deps.uscis.configured) return { ...summary, stopped: 'USCIS credentials are not set.' };
  const budget = Math.min(deps.config.batchSize, await remainingQuota(deps, false));
  if (budget === 0) return { ...summary, stopped: 'Daily quota used.' };

  const nowMs = deps.now().getTime();
  const intervalMs = deps.config.pollIntervalHours * 3_600_000;
  const candidates = await deps.store.dueReceipts(
    new Date(nowMs - intervalMs).toISOString(),
    budget * 2,
  );
  // Receipts that keep failing back off: 2x, 4x, 8x, up to 16x the interval.
  const due = candidates
    .filter((r) => {
      if (!r.last_checked_at || r.fail_count === 0) return true;
      const wait = intervalMs * 2 ** Math.min(r.fail_count, 4);
      return nowMs - new Date(r.last_checked_at).getTime() >= wait;
    })
    .slice(0, budget);

  for (const [i, row] of due.entries()) {
    if (i > 0) await deps.sleep(deps.config.minCallGapMs);
    const outcome = await checkReceipt(deps, row);
    summary.checked++;
    if (outcome.kind === 'changed') summary.changed++;
    if (outcome.kind === 'failed') summary.failed++;
    if (outcome.kind === 'stop') {
      summary.stopped = outcome.message;
      break;
    }
  }

  const cutoff = new Date(nowMs - deps.config.inactiveAccountDays * 86_400_000).toISOString();
  await deps.store.deleteInactiveAccounts(cutoff);
  return summary;
}
