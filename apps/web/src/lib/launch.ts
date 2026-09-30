// Launch parameters from the web app manifest: share target (share the copied USCIS JSON or a
// JSON file to Waymark from another app) and app shortcuts (long-press the home screen icon).
import { openSheet } from './stores/ui.svelte';
import { importFrom } from './sync.svelte';

const SHARE_CACHE = 'waymark-share';

/** Read and remove the text the service worker saved from a share. */
async function takeSharedText(): Promise<string> {
  try {
    const cache = await caches.open(SHARE_CACHE);
    const response = await cache.match('shared-text');
    await cache.delete('shared-text');
    return response ? await response.text() : '';
  } catch {
    return '';
  }
}

export async function handleLaunch(): Promise<void> {
  const action = new URLSearchParams(location.search).get('action');
  if (!action) return;
  // Drop the query so a reload does not repeat the action.
  history.replaceState(null, '', `${location.pathname}${location.hash || '#/cases'}`);
  if (action === 'shared') {
    const text = await takeSharedText();
    if (!text.trim()) {
      openSheet({
        kind: 'import',
        message: 'Nothing was shared. Copy the case page on my.uscis.gov, then paste it below.',
      });
      return;
    }
    // Import right away (the snackbar offers Undo); only a share Waymark cannot read opens the
    // sheet.
    const result = importFrom(text);
    if (!result.ok) openSheet({ kind: 'import', text, message: result.message });
  } else if (action === 'new-case') openSheet({ kind: 'case' });
  else if (action === 'import') openSheet({ kind: 'import' });
}
