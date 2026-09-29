import { describe, expect, it } from 'vitest';
import {
  colorAtTone,
  contrast,
  isInGamut,
  luminance,
  lstarToY,
  oklchToRgb,
  parseHex,
  rgbToOklch,
  toHex,
  yToLstar,
} from '../src';

describe('hex parsing', () => {
  it('parses 3 and 6 digit hex', () => {
    expect(toHex(parseHex('#fff'))).toBe('#ffffff');
    expect(toHex(parseHex('14b8a6'))).toBe('#14b8a6');
  });

  it('rejects invalid input', () => {
    expect(() => parseHex('#12345')).toThrow();
    expect(() => parseHex('teal')).toThrow();
  });
});

describe('OKLCH round trip', () => {
  it.each(['#14b8a6', '#4f46e5', '#000000', '#ffffff', '#808080', '#ff0000'])('%s', (hex) => {
    expect(toHex(oklchToRgb(rgbToOklch(parseHex(hex))))).toBe(hex);
  });

  it('matches known OKLCH values for pure red', () => {
    const red = rgbToOklch(parseHex('#ff0000'));
    expect(red.l).toBeCloseTo(0.628, 3);
    expect(red.c).toBeCloseTo(0.2577, 3);
    expect(red.h).toBeCloseTo(29.23, 1);
  });

  it('flags out of gamut colors', () => {
    expect(isInGamut({ l: 0.5, c: 0.05, h: 180 })).toBe(true);
    expect(isInGamut({ l: 0.9, c: 0.35, h: 260 })).toBe(false);
  });
});

describe('contrast', () => {
  it('black on white is 21', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
  });

  it('is symmetric', () => {
    expect(contrast('#14b8a6', '#ffffff')).toBeCloseTo(contrast('#ffffff', '#14b8a6'), 10);
  });
});

describe('tones', () => {
  it('converts L* and Y both ways', () => {
    for (const l of [0, 5, 10, 40, 50, 90, 100]) expect(yToLstar(lstarToY(l))).toBeCloseTo(l, 6);
  });

  it('pins the tone to CIE L* for every hue', () => {
    for (const hue of [0, 45, 90, 135, 180, 225, 270, 315]) {
      for (const tone of [10, 25, 40, 60, 80, 90, 98]) {
        const hex = colorAtTone(hue, 0.15, tone);
        expect(Math.abs(yToLstar(luminance(parseHex(hex))) - tone)).toBeLessThan(0.8);
      }
    }
  });

  it('keeps chroma when the gamut allows and reduces it when not', () => {
    const muted = rgbToOklch(parseHex(colorAtTone(180, 0.04, 50)));
    expect(muted.c).toBeCloseTo(0.04, 2);
    const vivid = rgbToOklch(parseHex(colorAtTone(260, 0.3, 95)));
    expect(vivid.c).toBeLessThan(0.1);
  });

  it('returns pure black and white at the ends', () => {
    expect(colorAtTone(120, 0.1, 0)).toBe('#000000');
    expect(colorAtTone(120, 0.1, 100)).toBe('#ffffff');
  });
});
