import { describe, expect, it } from 'vitest';
import { parseHash } from '../src/lib/stores/router.svelte';
import { dismissSnackbar, showSnackbar, snackbar } from '../src/lib/stores/snackbar.svelte';
import { rovingIndex } from '../src/lib/ui/keys';
import { radii, shapePath } from '../src/lib/ui/shapes';

describe('parseHash', () => {
  it('maps known paths and defaults to cases', () => {
    expect(parseHash('#/settings/design').name).toBe('design');
    expect(parseHash('#/tools').name).toBe('tools');
    expect(parseHash('').name).toBe('cases');
    expect(parseHash('#/unknown')).toEqual({ name: 'cases', path: '/cases' });
    expect(parseHash('#/case/abc-123')).toEqual({
      name: 'case',
      path: '/case/abc-123',
      id: 'abc-123',
    });
    expect(parseHash('#/case/../x').name).toBe('cases');
  });
});

describe('rovingIndex', () => {
  it('wraps and handles Home and End', () => {
    expect(rovingIndex('ArrowRight', 2, 3)).toBe(0);
    expect(rovingIndex('ArrowLeft', 0, 3)).toBe(2);
    expect(rovingIndex('ArrowDown', 0, 3, 'vertical')).toBe(1);
    expect(rovingIndex('ArrowDown', 0, 3, 'horizontal')).toBeNull();
    expect(rovingIndex('End', 0, 5)).toBe(4);
    expect(rovingIndex('Home', 3, 5)).toBe(0);
    expect(rovingIndex('a', 0, 5)).toBeNull();
    expect(rovingIndex('ArrowRight', 0, 0)).toBeNull();
  });
});

describe('shapes', () => {
  it('keeps radii within the unit circle', () => {
    for (const r of radii({ lobes: 12, depth: 0.07 })) {
      expect(r).toBeGreaterThan(0.85);
      expect(r).toBeLessThanOrEqual(1);
    }
  });

  it('builds a closed path', () => {
    expect(shapePath({ lobes: 0, depth: 0 }, 48)).toMatch(/^M.*Z$/);
  });
});

describe('snackbar queue', () => {
  it('shows one message at a time and advances on dismiss', () => {
    const first = showSnackbar('First');
    showSnackbar('Second', { label: 'Undo', run: () => {} });
    expect(snackbar.current?.text).toBe('First');
    expect(snackbar.queue).toHaveLength(1);
    dismissSnackbar(first);
    expect(snackbar.current?.text).toBe('Second');
    expect(snackbar.current?.timeoutMs).toBe(8000);
    dismissSnackbar();
    expect(snackbar.current).toBeNull();
  });
});
