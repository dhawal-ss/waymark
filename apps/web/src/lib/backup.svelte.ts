// Backups. Data lives only on this device, so Waymark remembers when it was last exported and
// reminds the user after a while. The date is kept outside AppData, so exports do not carry it.
import { buildExport, fromEpochDay, toEpochDay, today, type AppData } from '@waymark/core';
import { downloadFile } from './download';
import { flushSaves, loadSetting, nowInstant, saveSetting, store } from './stores/data.svelte';
import { showSnackbar } from './stores/snackbar.svelte';

const SETTING = 'lastExport';
const SNOOZE_KEY = 'waymark:backup-snooze';
const REMIND_AFTER_DAYS = 30;

export const backup = $state({ lastAt: '', snoozedUntil: '' });

export async function initBackup(): Promise<void> {
  backup.lastAt = (await loadSetting<string>(SETTING)) ?? '';
  try {
    backup.snoozedUntil = localStorage.getItem(SNOOZE_KEY) ?? '';
  } catch {
    backup.snoozedUntil = '';
  }
}

/** Sharing a file works on Android and iOS, where "Save to Drive" or "Files" keeps the backup. */
export function canShareFiles(): boolean {
  try {
    const probe = new File(['{}'], 'probe.json', { type: 'application/json' });
    return typeof navigator.canShare === 'function' && navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

/** Export all data as a JSON file, through the share sheet or as a download. */
export async function exportBackup({ share = false } = {}): Promise<void> {
  await flushSaves();
  const file = buildExport($state.snapshot(store.data) as AppData, nowInstant());
  const name = `waymark-export-${today()}.json`;
  const text = JSON.stringify(file, null, 2);
  if (share && canShareFiles()) {
    try {
      await navigator.share({
        files: [new File([text], name, { type: 'application/json' })],
        title: name,
      });
    } catch (e) {
      // Closing the share sheet saves nothing.
      if (e instanceof DOMException && e.name === 'AbortError') return;
      showSnackbar('Sharing the backup failed. Use Export data to download it instead.');
      return;
    }
  } else {
    downloadFile(name, text, 'application/json');
  }
  backup.lastAt = nowInstant();
  await saveSetting(SETTING, backup.lastAt);
  showSnackbar(share ? 'Shared your data as a JSON file.' : 'Exported your data as a JSON file.');
}

/** Hide the reminder for a week. */
export function snoozeBackup(on: string): void {
  backup.snoozedUntil = fromEpochDay(toEpochDay(on) + 7);
  try {
    localStorage.setItem(SNOOZE_KEY, backup.snoozedUntil);
  } catch {
    // Storage blocked: the reminder comes back next time.
  }
}

/** Days since the last export, or null when there has been none. */
export function daysSinceBackup(on: string): number | null {
  if (!backup.lastAt) return null;
  return toEpochDay(on) - toEpochDay(backup.lastAt.slice(0, 10));
}

/** Remind when there are cases and no export in the last 30 days (or ever, for data a week old). */
export function backupDue(on: string): boolean {
  if (store.data.cases.every((c) => c.demo)) return false;
  if (backup.snoozedUntil && on < backup.snoozedUntil) return false;
  const since = daysSinceBackup(on);
  if (since !== null) return since >= REMIND_AFTER_DAYS;
  const oldest = store.data.cases
    .filter((c) => !c.demo)
    .map((c) => c.createdAt.slice(0, 10))
    .sort()[0];
  return oldest !== undefined && toEpochDay(on) - toEpochDay(oldest) >= 7;
}
