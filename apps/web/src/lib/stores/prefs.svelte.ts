import { sanitizePrefs, type Prefs } from '@waymark/core';
import { mutate, store } from './data.svelte';

export type { Prefs };

/** Update display preferences. They persist with the rest of the data and are mirrored to
 * localStorage so the theme applies before the app loads. */
export function updatePrefs(patch: Partial<Prefs>): void {
  mutate((d) => {
    d.prefs = sanitizePrefs({ ...d.prefs, ...patch });
  });
}

export function prefs(): Prefs {
  return store.data.prefs;
}
