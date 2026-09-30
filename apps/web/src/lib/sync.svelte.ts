// Getting case data from the user's USCIS account. The case JSON needs the user's signed-in
// session and cannot be fetched cross-origin, so the user opens it and copies the page. When the
// user comes back, Waymark reads the clipboard by itself if the browser already allows it, and
// otherwise offers Import with one tap. Waymark never signs in or sends requests to my.uscis.gov.
import { importUscis, type ImportOutcome } from './actions';
import { trackNewCases } from './serverSync.svelte';
import { store } from './stores/data.svelte';
import { casePath, navigate } from './stores/router.svelte';
import { showSnackbar } from './stores/snackbar.svelte';
import { closeSheet, openSheet } from './stores/ui.svelte';

export const caseJsonUrl = (receipt: string): string =>
  `https://my.uscis.gov/account/case-service/api/cases/${encodeURIComponent(receipt)}`;

const PENDING_MS = 30 * 60 * 1000;

/** The receipt whose JSON was opened in the last 30 minutes, and its case once it exists. */
export const syncWaiting = $state({ receipt: '', caseId: '', until: 0 });

export function isWaitingFor(caseId: string): boolean {
  return syncWaiting.caseId === caseId && Date.now() < syncWaiting.until;
}

export function isWaitingForReceipt(receipt: string): boolean {
  return syncWaiting.receipt === receipt && Date.now() < syncWaiting.until;
}

/** The browser already lets Waymark read the clipboard without asking. */
async function clipboardAllowed(): Promise<boolean> {
  try {
    const status = await navigator.permissions.query({ name: 'clipboard-read' as PermissionName });
    return status.state === 'granted';
  } catch {
    return false;
  }
}

/** Reading the clipboard needs a focused page, which comes a moment after it becomes visible. */
function whenFocused(): Promise<void> {
  if (document.hasFocus()) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      window.removeEventListener('focus', done);
      resolve();
    };
    window.addEventListener('focus', done);
    setTimeout(done, 1500);
  });
}

async function onVisible(): Promise<void> {
  if (document.visibilityState !== 'visible' || !syncWaiting.receipt) return;
  if (Date.now() > syncWaiting.until) return;
  document.removeEventListener('visibilitychange', onVisible);
  const offer = () =>
    void showSnackbar(
      'Copied the case page?',
      { label: 'Import', run: () => void importFromClipboard() },
      20000,
    );
  if (!(await clipboardAllowed())) return offer();
  await whenFocused();
  const text = await navigator.clipboard.readText().catch(() => '');
  // Something else on the clipboard: leave it alone and offer the button.
  if (!text.includes('{') || !importFrom(text).ok) offer();
}

/** Open the case JSON in a new tab and import the copied page when the user comes back. */
export function startSync(receipt: string, caseId?: string): void {
  syncWaiting.receipt = receipt;
  syncWaiting.caseId = caseId ?? store.data.cases.find((c) => c.receipt === receipt)?.id ?? '';
  syncWaiting.until = Date.now() + PENDING_MS;
  document.removeEventListener('visibilitychange', onVisible);
  document.addEventListener('visibilitychange', onVisible);
  window.open(caseJsonUrl(receipt), '_blank', 'noopener,noreferrer');
}

/**
 * Import copied or shared case JSON. A case added this way opens right away, so the user sees
 * what USCIS has.
 */
export function importFrom(text: string): ImportOutcome {
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- a snapshot, not reactive state
  const before = new Set(store.data.cases.map((c) => c.id));
  const result = importUscis(text);
  if (!result.ok) return result;
  const receipts = result.parse.cases.map((p) => p.receipt);
  if (receipts.includes(syncWaiting.receipt)) {
    syncWaiting.receipt = '';
    syncWaiting.caseId = '';
  }
  document.removeEventListener('visibilitychange', onVisible);
  trackNewCases();
  const added = store.data.cases.find((c) => !before.has(c.id));
  if (added && receipts.length === 1) {
    closeSheet();
    navigate(casePath(added.id).slice(1));
  }
  return result;
}

/** Read the clipboard (needs a user gesture the first time) and import. Falls back to the sheet. */
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
        'The browser did not allow reading the clipboard. Paste the page below or upload the file.',
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
  const result = importFrom(text);
  if (!result.ok) openSheet({ kind: 'import', caseId, message: result.message, text });
}
