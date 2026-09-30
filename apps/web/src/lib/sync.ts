// Manual sync with the USCIS case JSON. The endpoint needs the user's signed-in session and
// cannot be fetched cross-origin, so the user opens it, copies it, and Waymark reads the
// clipboard only when the user presses Import.
import { importUscis } from './actions';
import { showSnackbar } from './stores/snackbar.svelte';
import { openSheet } from './stores/ui.svelte';

export const caseJsonUrl = (receipt: string): string =>
  `https://my.uscis.gov/account/case-service/api/cases/${encodeURIComponent(receipt)}`;

const PENDING_MS = 30 * 60 * 1000;
let pending: { caseId?: string; at: number } | null = null;

function onVisible(): void {
  if (document.visibilityState !== 'visible' || !pending) return;
  document.removeEventListener('visibilitychange', onVisible);
  const request = pending;
  pending = null;
  if (Date.now() - request.at > PENDING_MS) return;
  showSnackbar(
    'Copied the case JSON?',
    { label: 'Import', run: () => void importFromClipboard(request.caseId) },
    20000,
  );
}

/** Open the case JSON in a new tab and offer to import when the user comes back. */
export function startSync(receipt: string, caseId?: string): void {
  pending = { caseId, at: Date.now() };
  document.removeEventListener('visibilitychange', onVisible);
  document.addEventListener('visibilitychange', onVisible);
  window.open(caseJsonUrl(receipt), '_blank', 'noopener,noreferrer');
}

/** Read the clipboard (needs a user gesture) and import. Falls back to the paste sheet. */
export async function importFromClipboard(caseId?: string): Promise<void> {
  let text: string;
  try {
    if (!navigator.clipboard?.readText) throw new Error('unsupported');
    text = await navigator.clipboard.readText();
  } catch {
    openSheet({
      kind: 'import',
      caseId,
      message:
        'The browser did not allow reading the clipboard. Paste the JSON below or upload the file.',
    });
    return;
  }
  if (!text.trim()) {
    openSheet({
      kind: 'import',
      caseId,
      message: 'The clipboard is empty. Copy the page on my.uscis.gov, then paste it below.',
    });
    return;
  }
  const result = importUscis(text);
  if (!result.ok) openSheet({ kind: 'import', caseId, message: result.message });
}
