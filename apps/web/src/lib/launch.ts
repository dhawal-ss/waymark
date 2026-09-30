// Launch parameters from the web app manifest: share target (share the copied USCIS JSON or a
// JSON file to Waymark from another app) and app shortcuts (long-press the home screen icon).
import { openSheet } from './stores/ui.svelte';

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
    openSheet(
      text.trim()
        ? { kind: 'import', text }
        : {
            kind: 'import',
            message: 'Nothing was shared. Copy the case JSON on my.uscis.gov, then paste it below.',
          },
    );
  } else if (action === 'new-case') openSheet({ kind: 'case' });
  else if (action === 'import') openSheet({ kind: 'import' });
}
