import { colorAtTone, parseHex, rgbToOklch } from './color.ts';

/** A hue and chroma in OKLCH. Tones are generated on demand and cached. */
export class TonalPalette {
  private cache = new Map<number, string>();
  readonly hue: number;
  readonly chroma: number;

  constructor(hue: number, chroma: number) {
    this.hue = hue;
    this.chroma = chroma;
  }

  tone(t: number): string {
    let hex = this.cache.get(t);
    if (!hex) {
      hex = colorAtTone(this.hue, this.chroma, t);
      this.cache.set(t, hex);
    }
    return hex;
  }
}

export interface CorePalettes {
  primary: TonalPalette;
  secondary: TonalPalette;
  tertiary: TonalPalette;
  neutral: TonalPalette;
  neutralVariant: TonalPalette;
  error: TonalPalette;
  success: TonalPalette;
}

const normalizeHue = (h: number) => ((h % 360) + 360) % 360;

/** Move `hue` toward `target` by a fraction, capped at `maxDegrees`. */
export function harmonize(hue: number, target: number, fraction = 0.5, maxDegrees = 15): number {
  const diff = ((target - hue + 540) % 360) - 180;
  const shift = Math.sign(diff) * Math.min(Math.abs(diff) * fraction, maxDegrees);
  return normalizeHue(hue + shift);
}

const ERROR_HUE = 27;
const SUCCESS_HUE = 150;

/** Build the seven palettes from one seed color. Chroma values are OKLCH chroma. */
export function palettesFromSeed(seedHex: string): CorePalettes {
  const seed = rgbToOklch(parseHex(seedHex));
  const hue = seed.h;
  const vivid = Math.min(Math.max(seed.c, 0.1), 0.19);
  const gray = seed.c < 0.03;
  return {
    primary: new TonalPalette(hue, gray ? seed.c : vivid),
    secondary: new TonalPalette(hue, gray ? seed.c * 0.6 : 0.045),
    tertiary: new TonalPalette(normalizeHue(hue + 60), gray ? 0.05 : 0.09),
    neutral: new TonalPalette(hue, Math.min(seed.c * 0.1, 0.01)),
    neutralVariant: new TonalPalette(hue, Math.min(seed.c * 0.2, 0.022)),
    error: new TonalPalette(harmonize(ERROR_HUE, hue, 0.2, 8), 0.19),
    success: new TonalPalette(harmonize(SUCCESS_HUE, hue, 0.3, 15), 0.13),
  };
}
