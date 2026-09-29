import { schemeFromSeed, schemeToCss } from './scheme.ts';

export type ThemeMode = 'system' | 'light' | 'dark';

export interface ThemeSettings {
  seed: string;
  mode: ThemeMode;
  highContrast: boolean;
}

/** CSS that applies the color roles for a theme to `selector` (default :root). */
export function themeCss({ seed, mode, highContrast }: ThemeSettings, selector = ':root'): string {
  const light = `${selector}{color-scheme:light;${schemeToCss(schemeFromSeed(seed, { mode: 'light', highContrast }))}}`;
  const dark = `${selector}{color-scheme:dark;${schemeToCss(schemeFromSeed(seed, { mode: 'dark', highContrast }))}}`;
  if (mode === 'light') return light;
  if (mode === 'dark') return dark;
  return `${light}@media (prefers-color-scheme: dark){${dark}}`;
}
