// Color math: sRGB, linear sRGB, OKLab, OKLCH, and CIE lightness.
// OKLab matrices from Bjorn Ottosson, https://bottosson.github.io/posts/oklab/

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface Oklch {
  l: number;
  c: number;
  h: number;
}

const toLinear = (v: number): number =>
  v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);

const fromLinear = (v: number): number =>
  v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;

export function parseHex(hex: string): Rgb {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m || !m[1]) throw new Error(`Not a hex color: ${hex}`);
  let h = m[1];
  if (h.length === 3) h = [...h].map((ch) => ch + ch).join('');
  const n = parseInt(h, 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}

export function isHex(value: string): boolean {
  return /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim());
}

export function toHex({ r, g, b }: Rgb): string {
  const c = (v: number) =>
    Math.round(Math.min(1, Math.max(0, v)) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

function linearRgbToOklab(r: number, g: number, b: number): [number, number, number] {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabToLinearRgb(L: number, a: number, b: number): [number, number, number] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

export function rgbToOklch({ r, g, b }: Rgb): Oklch {
  const [L, A, B] = linearRgbToOklab(toLinear(r), toLinear(g), toLinear(b));
  const c = Math.hypot(A, B);
  let h = (Math.atan2(B, A) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { l: L, c, h: c < 1e-6 ? 0 : h };
}

export function oklchToLinear({ l, c, h }: Oklch): [number, number, number] {
  const rad = (h * Math.PI) / 180;
  return oklabToLinearRgb(l, c * Math.cos(rad), c * Math.sin(rad));
}

const EPS = 1e-5;
const inGamut = ([r, g, b]: [number, number, number]) =>
  r >= -EPS && r <= 1 + EPS && g >= -EPS && g <= 1 + EPS && b >= -EPS && b <= 1 + EPS;

export function oklchToRgb(color: Oklch): Rgb {
  const [r, g, b] = oklchToLinear(color);
  return { r: fromLinear(clamp01(r)), g: fromLinear(clamp01(g)), b: fromLinear(clamp01(b)) };
}

export function isInGamut(color: Oklch): boolean {
  return inGamut(oklchToLinear(color));
}

/** Relative luminance (WCAG) of an sRGB color. */
export function luminance({ r, g, b }: Rgb): number {
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/** WCAG 2 contrast ratio between two hex colors. */
export function contrast(a: string, b: string): number {
  const la = luminance(parseHex(a));
  const lb = luminance(parseHex(b));
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** CIE L* (0 to 100) to relative luminance Y (0 to 1). */
export function lstarToY(lstar: number): number {
  const ft = (lstar + 16) / 116;
  return ft ** 3 > 216 / 24389 ? ft ** 3 : lstar / (24389 / 27);
}

/** Relative luminance Y (0 to 1) to CIE L* (0 to 100). */
export function yToLstar(y: number): number {
  return y <= 216 / 24389 ? y * (24389 / 27) : 116 * Math.cbrt(y) - 16;
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function linearLuminance([r, g, b]: [number, number, number]): number {
  return 0.2126 * clamp01(r) + 0.7152 * clamp01(g) + 0.0722 * clamp01(b);
}

/**
 * Find the in-gamut color with the given OKLCH hue whose CIE L* equals `tone`,
 * keeping as much of the requested chroma as the sRGB gamut allows.
 * Pinning tone to L* keeps contrast between tones predictable across hues.
 */
export function colorAtTone(hue: number, chroma: number, tone: number): string {
  if (tone <= 0) return '#000000';
  if (tone >= 100) return '#ffffff';
  const targetY = lstarToY(tone);

  const solveL = (c: number): number => {
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 32; i++) {
      const mid = (lo + hi) / 2;
      if (linearLuminance(oklchToLinear({ l: mid, c, h: hue })) < targetY) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  };

  const l = solveL(chroma);
  if (isInGamut({ l, c: chroma, h: hue })) return toHex(oklchToRgb({ l, c: chroma, h: hue }));

  // Out of gamut: binary search for the largest chroma that fits at this tone.
  let lo = 0;
  let hi = chroma;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (isInGamut({ l: solveL(mid), c: mid, h: hue })) lo = mid;
    else hi = mid;
  }
  return toHex(oklchToRgb({ l: solveL(lo), c: lo, h: hue }));
}
