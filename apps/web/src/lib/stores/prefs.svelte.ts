import { DEFAULT_SEED, isHex, type ThemeMode } from '@waymark/theme';
import { readJson, writeJson } from '../storage';

export interface Prefs {
  theme: ThemeMode;
  highContrast: boolean;
  seed: string;
  maskReceipts: boolean;
}

export const PREFS_KEY = 'waymark:prefs';

export const DEFAULT_PREFS: Prefs = {
  theme: 'system',
  highContrast: false,
  seed: DEFAULT_SEED,
  maskReceipts: false,
};

export function sanitizePrefs(raw: unknown): Prefs {
  const p = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof Prefs, unknown>>;
  return {
    theme: p.theme === 'light' || p.theme === 'dark' || p.theme === 'system' ? p.theme : 'system',
    highContrast: p.highContrast === true,
    seed: typeof p.seed === 'string' && isHex(p.seed) ? p.seed.toLowerCase() : DEFAULT_SEED,
    maskReceipts: p.maskReceipts === true,
  };
}

/** Display preferences. Kept in localStorage so the theme applies before the app loads. */
export const prefs: Prefs = $state(sanitizePrefs(readJson(PREFS_KEY)));

export function updatePrefs(patch: Partial<Prefs>): void {
  Object.assign(prefs, sanitizePrefs({ ...prefs, ...patch }));
  writeJson(PREFS_KEY, $state.snapshot(prefs));
}
