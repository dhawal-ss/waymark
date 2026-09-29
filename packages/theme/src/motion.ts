// Spring easing sampled into CSS linear() curves.

export interface Spring {
  /** Damping ratio: below 1 overshoots, 1 is critically damped. */
  damping: number;
  stiffness: number;
  mass?: number;
}

export interface SpringCurve {
  easing: string;
  durationMs: number;
}

/** Position of a unit spring released from 0 toward 1, at time t seconds. */
export function springAt({ damping, stiffness, mass = 1 }: Spring, t: number): number {
  const w0 = Math.sqrt(stiffness / mass);
  if (damping < 1) {
    const wd = w0 * Math.sqrt(1 - damping * damping);
    return (
      1 -
      Math.exp(-damping * w0 * t) * (Math.cos(wd * t) + ((damping * w0) / wd) * Math.sin(wd * t))
    );
  }
  return 1 - Math.exp(-w0 * t) * (1 + w0 * t);
}

/** Time in seconds after which the spring stays within `epsilon` of rest. */
export function settleTime(spring: Spring, epsilon = 0.001): number {
  const step = 1 / 240;
  let lastOutside = 0;
  for (let t = 0; t < 5; t += step) {
    if (Math.abs(1 - springAt(spring, t)) > epsilon) lastOutside = t;
  }
  return lastOutside + step;
}

const round = (v: number, digits: number) => Number(v.toFixed(digits));

/** Sample a spring into a CSS linear() easing and its matching duration. */
export function springCurve(spring: Spring, samples = 32): SpringCurve {
  const duration = settleTime(spring);
  const points: string[] = [];
  for (let i = 0; i <= samples; i++) {
    const value = i === samples ? 1 : springAt(spring, (i / samples) * duration);
    points.push(String(round(value, 4)));
  }
  return { easing: `linear(${points.join(',')})`, durationMs: Math.round(duration * 1000) };
}

/** Material 3 Expressive spring tokens. Spatial springs move shape and position. */
export const SPRINGS = {
  'fast-spatial': { damping: 0.6, stiffness: 800 },
  'default-spatial': { damping: 0.8, stiffness: 380 },
  'slow-spatial': { damping: 0.8, stiffness: 200 },
  'fast-effects': { damping: 1, stiffness: 3800 },
  'default-effects': { damping: 1, stiffness: 1600 },
  'slow-effects': { damping: 1, stiffness: 800 },
} as const satisfies Record<string, Spring>;

/** cubic-bezier stand-ins for browsers without linear(). */
export const SPRING_FALLBACKS: Record<keyof typeof SPRINGS, string> = {
  'fast-spatial': 'cubic-bezier(0.34, 1.45, 0.64, 1)',
  'default-spatial': 'cubic-bezier(0.34, 1.2, 0.64, 1)',
  'slow-spatial': 'cubic-bezier(0.34, 1.15, 0.64, 1)',
  'fast-effects': 'cubic-bezier(0.31, 0.94, 0.34, 1)',
  'default-effects': 'cubic-bezier(0.34, 0.8, 0.34, 1)',
  'slow-effects': 'cubic-bezier(0.34, 0.88, 0.34, 1)',
};

export function motionCss(): string {
  const supported: string[] = [];
  const fallback: string[] = [];
  for (const [name, spring] of Object.entries(SPRINGS) as [keyof typeof SPRINGS, Spring][]) {
    const curve = springCurve(spring);
    supported.push(`--spring-${name}:${curve.easing};`);
    fallback.push(`--spring-${name}:${SPRING_FALLBACKS[name]};`);
    supported.push(`--spring-${name}-duration:${curve.durationMs}ms;`);
    fallback.push(`--spring-${name}-duration:${curve.durationMs}ms;`);
  }
  return (
    `:root{${fallback.join('')}}` +
    `@supports (transition-timing-function: linear(0, 1)){:root{${supported.join('')}}}`
  );
}
