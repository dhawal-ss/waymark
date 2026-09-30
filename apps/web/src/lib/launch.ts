// Launch parameters from the web app manifest: share target (share the copied USCIS JSON to
// Waymark from another app) and app shortcuts (long-press the home screen icon).
import { openSheet } from './stores/ui.svelte';

export function handleLaunch(): void {
  const params = new URLSearchParams(location.search);
  if ([...params.keys()].length === 0) return;
  const text = [params.get('shared_text'), params.get('shared_url')]
    .filter((v): v is string => !!v?.trim())
    .join('\n');
  const action = params.get('action');
  // Drop the query so a reload does not repeat the action.
  history.replaceState(null, '', `${location.pathname}${location.hash || '#/cases'}`);
  if (text) openSheet({ kind: 'import', text });
  else if (action === 'new-case') openSheet({ kind: 'case' });
  else if (action === 'import') openSheet({ kind: 'import' });
}
