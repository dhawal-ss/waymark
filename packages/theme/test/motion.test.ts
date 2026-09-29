import { describe, expect, it } from 'vitest';
import { motionCss, settleTime, springAt, springCurve, SPRINGS } from '../src';

describe('springs', () => {
  it('start at 0 and settle at 1', () => {
    for (const spring of Object.values(SPRINGS)) {
      expect(springAt(spring, 0)).toBeCloseTo(0, 6);
      expect(springAt(spring, settleTime(spring))).toBeCloseTo(1, 2);
    }
  });

  it('overshoot only when underdamped', () => {
    const peak = (s: { damping: number; stiffness: number }) => {
      let max = 0;
      for (let t = 0; t < 1; t += 0.001) max = Math.max(max, springAt(s, t));
      return max;
    };
    expect(peak(SPRINGS['fast-spatial'])).toBeGreaterThan(1.05);
    expect(peak(SPRINGS['default-effects'])).toBeLessThanOrEqual(1);
  });

  it('produces a linear() curve ending at 1', () => {
    const curve = springCurve(SPRINGS['default-spatial']);
    expect(curve.easing).toMatch(/^linear\(0,.*,1\)$/);
    expect(curve.durationMs).toBeGreaterThan(200);
    expect(curve.durationMs).toBeLessThan(1500);
  });

  it('emits a cubic-bezier fallback and a linear() override', () => {
    const css = motionCss();
    expect(css).toContain('cubic-bezier(');
    expect(css).toContain('@supports (transition-timing-function: linear(0, 1))');
  });
});
