import { describe, expect, it } from 'vitest';
import {
  contrast,
  harmonize,
  ROLE_NAMES,
  schemeFromSeed,
  SEED_PRESETS,
  themeCss,
  type Mode,
  type Role,
} from '../src';

const EXTREME_SEEDS = ['#ffff00', '#808080', '#0000ff', '#00ff00', '#000000', '#ffffff', '#ff00ff'];
const SEEDS = [...SEED_PRESETS.map((p) => p.hex), ...EXTREME_SEEDS];
const MODES: Mode[] = ['light', 'dark'];

const TEXT_PAIRS: [Role, Role][] = [
  ['on-primary', 'primary'],
  ['on-primary-container', 'primary-container'],
  ['on-secondary', 'secondary'],
  ['on-secondary-container', 'secondary-container'],
  ['on-tertiary', 'tertiary'],
  ['on-tertiary-container', 'tertiary-container'],
  ['on-error', 'error'],
  ['on-error-container', 'error-container'],
  ['on-success', 'success'],
  ['on-success-container', 'success-container'],
  ['inverse-on-surface', 'inverse-surface'],
];

const SURFACES: Role[] = [
  'surface',
  'surface-dim',
  'surface-bright',
  'surface-container-lowest',
  'surface-container-low',
  'surface-container',
  'surface-container-high',
  'surface-container-highest',
];

describe.each(SEEDS)('seed %s', (seed) => {
  describe.each(MODES)('%s', (mode) => {
    for (const highContrast of [false, true]) {
      const scheme = schemeFromSeed(seed, { mode, highContrast });
      const textMin = highContrast ? 7 : 4.5;
      const label = highContrast ? 'high contrast' : 'standard';

      it(`${label}: defines every role as hex`, () => {
        for (const role of ROLE_NAMES) expect(scheme[role]).toMatch(/^#[0-9a-f]{6}$/);
      });

      it(`${label}: on-colors meet text contrast`, () => {
        for (const [fg, bg] of TEXT_PAIRS) {
          expect(contrast(scheme[fg], scheme[bg]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(
            textMin,
          );
        }
      });

      it(`${label}: surface text meets contrast on every surface`, () => {
        for (const bg of SURFACES) {
          expect(contrast(scheme['on-surface'], scheme[bg])).toBeGreaterThanOrEqual(textMin);
          expect(contrast(scheme['on-surface-variant'], scheme[bg])).toBeGreaterThanOrEqual(
            textMin,
          );
        }
      });

      it(`${label}: accents as text or UI meet contrast on surfaces`, () => {
        for (const bg of SURFACES) {
          for (const accent of ['primary', 'tertiary', 'error', 'success'] as const) {
            expect(
              contrast(scheme[accent], scheme[bg]),
              `${accent} on ${bg}`,
            ).toBeGreaterThanOrEqual(4.5);
          }
          expect(contrast(scheme.outline, scheme[bg]), `outline on ${bg}`).toBeGreaterThanOrEqual(
            3,
          );
        }
      });
    }
  });
});

describe('high contrast', () => {
  it('strengthens outlines', () => {
    for (const mode of MODES) {
      const std = schemeFromSeed('#14b8a6', { mode });
      const hc = schemeFromSeed('#14b8a6', { mode, highContrast: true });
      expect(contrast(hc.outline, hc.surface)).toBeGreaterThan(contrast(std.outline, std.surface));
      expect(contrast(hc['outline-variant'], hc.surface)).toBeGreaterThan(
        contrast(std['outline-variant'], std.surface),
      );
    }
  });
});

describe('harmonize', () => {
  it('moves toward the target by at most the cap', () => {
    expect(harmonize(150, 180, 0.5, 15)).toBe(165);
    expect(harmonize(150, 170, 0.5, 15)).toBe(160);
    expect(harmonize(10, 350, 0.5, 15)).toBe(0);
  });
});

describe('themeCss', () => {
  it('wraps dark roles in a media query for system mode', () => {
    const css = themeCss({ seed: '#14b8a6', mode: 'system', highContrast: false });
    expect(css).toContain('@media (prefers-color-scheme: dark)');
    expect(css).toContain('--primary:#');
  });

  it('emits one scheme for a fixed mode', () => {
    const css = themeCss({ seed: '#14b8a6', mode: 'dark', highContrast: false });
    expect(css).not.toContain('@media');
    expect(css).toContain('color-scheme:dark');
  });
});
