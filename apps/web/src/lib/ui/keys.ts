/**
 * Resolve arrow, Home, and End keys to a new index in a list of `count` items.
 * Returns null for keys that do not move focus.
 */
export function rovingIndex(
  key: string,
  current: number,
  count: number,
  orientation: 'horizontal' | 'vertical' | 'both' = 'horizontal',
): number | null {
  const prev =
    orientation === 'vertical'
      ? ['ArrowUp']
      : orientation === 'horizontal'
        ? ['ArrowLeft']
        : ['ArrowLeft', 'ArrowUp'];
  const next =
    orientation === 'vertical'
      ? ['ArrowDown']
      : orientation === 'horizontal'
        ? ['ArrowRight']
        : ['ArrowRight', 'ArrowDown'];
  if (count === 0) return null;
  if (prev.includes(key)) return (current - 1 + count) % count;
  if (next.includes(key)) return (current + 1) % count;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return null;
}

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
