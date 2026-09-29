// Polar shapes for scalloped badges and the morphing loading indicator.

export interface PolarShape {
  /** Number of lobes around the edge. 0 is a circle. */
  lobes: number;
  /** Lobe depth as a fraction of the radius. */
  depth: number;
}

export const SAMPLES = 144;

/** Radii at SAMPLES evenly spaced angles, normalized so the largest radius is 1. */
export function radii({ lobes, depth }: PolarShape, samples = SAMPLES): number[] {
  const out: number[] = [];
  for (let i = 0; i < samples; i++) {
    const theta = (i / samples) * Math.PI * 2;
    out.push((1 - depth + depth * Math.cos(lobes * theta)) / 1);
  }
  return out;
}

/** SVG path for radii centered at (cx, cy), scaled to `radius`, rotated by `rotation` radians. */
export function radiiToPath(
  r: number[],
  cx: number,
  cy: number,
  radius: number,
  rotation = 0,
): string {
  let d = '';
  const n = r.length;
  for (let i = 0; i < n; i++) {
    const theta = (i / n) * Math.PI * 2 + rotation - Math.PI / 2;
    const rr = (r[i] ?? 1) * radius;
    const x = cx + rr * Math.cos(theta);
    const y = cy + rr * Math.sin(theta);
    d += `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  return `${d}Z`;
}

export function shapePath(shape: PolarShape, size: number, inset = 0): string {
  return radiiToPath(radii(shape), size / 2, size / 2, size / 2 - inset);
}

/** Sequence the loading indicator morphs through, loosely following Material 3 Expressive. */
export const LOADER_SHAPES: PolarShape[] = [
  { lobes: 10, depth: 0.08 },
  { lobes: 9, depth: 0.1 },
  { lobes: 5, depth: 0.1 },
  { lobes: 2, depth: 0.16 },
  { lobes: 8, depth: 0.1 },
  { lobes: 4, depth: 0.14 },
  { lobes: 0, depth: 0 },
];

export const BADGE_SHAPE: PolarShape = { lobes: 12, depth: 0.07 };
export const HERO_BADGE_SHAPE: PolarShape = { lobes: 9, depth: 0.09 };
