import { schemeFromSeed, themeCss, type ThemeSettings } from '@waymark/theme';
import { writeText } from './storage';

export const THEME_CSS_KEY = 'waymark:theme-css';
const SELECTOR = ':root[data-theme]';

/** Apply a theme by writing its roles into a style element, and cache it for the next load. */
export function applyTheme(settings: ThemeSettings): void {
  const css = themeCss(settings, SELECTOR);
  let el = document.getElementById('theme-dynamic') as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = 'theme-dynamic';
    document.head.appendChild(el);
  }
  if (el.textContent !== css) el.textContent = css;
  writeText(THEME_CSS_KEY, css);
  updateThemeColorMeta(settings);
}

function updateThemeColorMeta(settings: ThemeSettings): void {
  const dark =
    settings.mode === 'dark' ||
    (settings.mode === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  const surface = schemeFromSeed(settings.seed, {
    mode: dark ? 'dark' : 'light',
    highContrast: settings.highContrast,
  }).surface;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', surface);
}
