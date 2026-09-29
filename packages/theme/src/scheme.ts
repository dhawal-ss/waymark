import { palettesFromSeed, type CorePalettes, type TonalPalette } from './palette.ts';

export type Mode = 'light' | 'dark';

export const ROLE_NAMES = [
  'primary',
  'on-primary',
  'primary-container',
  'on-primary-container',
  'secondary',
  'on-secondary',
  'secondary-container',
  'on-secondary-container',
  'tertiary',
  'on-tertiary',
  'tertiary-container',
  'on-tertiary-container',
  'error',
  'on-error',
  'error-container',
  'on-error-container',
  'success',
  'on-success',
  'success-container',
  'on-success-container',
  'surface',
  'surface-dim',
  'surface-bright',
  'surface-container-lowest',
  'surface-container-low',
  'surface-container',
  'surface-container-high',
  'surface-container-highest',
  'on-surface',
  'on-surface-variant',
  'outline',
  'outline-variant',
  'inverse-surface',
  'inverse-on-surface',
  'inverse-primary',
  'scrim',
  'shadow',
] as const;

export type Role = (typeof ROLE_NAMES)[number];
export type Scheme = Record<Role, string>;

type Accent = 'primary' | 'secondary' | 'tertiary' | 'error' | 'success';
const ACCENTS: Accent[] = ['primary', 'secondary', 'tertiary', 'error', 'success'];

interface ToneMap {
  accent: number;
  onAccent: number;
  container: number;
  onContainer: number;
  surface: number;
  surfaceDim: number;
  surfaceBright: number;
  containers: [number, number, number, number, number];
  onSurface: number;
  onSurfaceVariant: number;
  outline: number;
  outlineVariant: number;
  inverseSurface: number;
  inverseOnSurface: number;
  inversePrimary: number;
}

const TONES: Record<Mode, { standard: ToneMap; high: ToneMap }> = {
  light: {
    standard: {
      accent: 40,
      onAccent: 100,
      container: 90,
      onContainer: 10,
      surface: 98,
      surfaceDim: 87,
      surfaceBright: 98,
      containers: [100, 96, 94, 92, 90],
      onSurface: 10,
      onSurfaceVariant: 30,
      outline: 50,
      outlineVariant: 80,
      inverseSurface: 20,
      inverseOnSurface: 95,
      inversePrimary: 80,
    },
    high: {
      accent: 25,
      onAccent: 100,
      container: 35,
      onContainer: 100,
      surface: 98,
      surfaceDim: 85,
      surfaceBright: 98,
      containers: [100, 96, 94, 92, 90],
      onSurface: 0,
      onSurfaceVariant: 15,
      outline: 25,
      outlineVariant: 40,
      inverseSurface: 15,
      inverseOnSurface: 100,
      inversePrimary: 90,
    },
  },
  dark: {
    standard: {
      accent: 80,
      onAccent: 20,
      container: 30,
      onContainer: 90,
      surface: 6,
      surfaceDim: 6,
      surfaceBright: 24,
      containers: [4, 10, 12, 17, 22],
      onSurface: 90,
      onSurfaceVariant: 80,
      outline: 60,
      outlineVariant: 30,
      inverseSurface: 90,
      inverseOnSurface: 20,
      inversePrimary: 40,
    },
    high: {
      accent: 92,
      onAccent: 5,
      container: 80,
      onContainer: 0,
      surface: 6,
      surfaceDim: 6,
      surfaceBright: 24,
      containers: [4, 10, 12, 17, 22],
      onSurface: 100,
      onSurfaceVariant: 95,
      outline: 85,
      outlineVariant: 70,
      inverseSurface: 95,
      inverseOnSurface: 0,
      inversePrimary: 25,
    },
  },
};

export interface SchemeOptions {
  mode: Mode;
  highContrast?: boolean;
}

export function schemeFromPalettes(
  p: CorePalettes,
  { mode, highContrast = false }: SchemeOptions,
): Scheme {
  const t = TONES[mode][highContrast ? 'high' : 'standard'];
  const scheme = {} as Scheme;
  for (const name of ACCENTS) {
    const palette: TonalPalette = p[name];
    scheme[name] = palette.tone(t.accent);
    scheme[`on-${name}`] = palette.tone(t.onAccent);
    scheme[`${name}-container`] = palette.tone(t.container);
    scheme[`on-${name}-container`] = palette.tone(t.onContainer);
  }
  const [lowest, low, base, high, highest] = t.containers;
  scheme.surface = p.neutral.tone(t.surface);
  scheme['surface-dim'] = p.neutral.tone(t.surfaceDim);
  scheme['surface-bright'] = p.neutral.tone(t.surfaceBright);
  scheme['surface-container-lowest'] = p.neutral.tone(lowest);
  scheme['surface-container-low'] = p.neutral.tone(low);
  scheme['surface-container'] = p.neutral.tone(base);
  scheme['surface-container-high'] = p.neutral.tone(high);
  scheme['surface-container-highest'] = p.neutral.tone(highest);
  scheme['on-surface'] = p.neutral.tone(t.onSurface);
  scheme['on-surface-variant'] = p.neutralVariant.tone(t.onSurfaceVariant);
  scheme.outline = p.neutralVariant.tone(t.outline);
  scheme['outline-variant'] = p.neutralVariant.tone(t.outlineVariant);
  scheme['inverse-surface'] = p.neutral.tone(t.inverseSurface);
  scheme['inverse-on-surface'] = p.neutral.tone(t.inverseOnSurface);
  scheme['inverse-primary'] = p.primary.tone(t.inversePrimary);
  scheme.scrim = '#000000';
  scheme.shadow = '#000000';
  return scheme;
}

export function schemeFromSeed(seedHex: string, options: SchemeOptions): Scheme {
  return schemeFromPalettes(palettesFromSeed(seedHex), options);
}

/** Serialize a scheme as CSS custom property declarations. */
export function schemeToCss(scheme: Scheme): string {
  return ROLE_NAMES.map((role) => `--${role}:${scheme[role]};`).join('');
}
