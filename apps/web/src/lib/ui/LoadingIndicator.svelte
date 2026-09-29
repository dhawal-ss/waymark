<script lang="ts">
  import { springAt, SPRINGS } from '@waymark/theme';
  import { prefersReducedMotion } from './keys';
  import { LOADER_SHAPES, radii, radiiToPath } from './shapes';

  interface Props {
    /** Accessible name, for example "Loading cases". */
    label?: string;
    size?: number;
    /** Draw on a filled circular container. */
    contained?: boolean;
  }

  let { label = 'Loading', size = 48, contained = false }: Props = $props();

  const SHAPES = LOADER_SHAPES.map((s) => radii(s));
  const STEP_MS = 650;
  const inner = $derived(size * (contained ? 0.34 : 0.4));

  let path = $state('');

  $effect(() => {
    const c = size / 2;
    const r = inner;
    const first = SHAPES[0] ?? [];
    if (prefersReducedMotion()) {
      path = radiiToPath(first, c, c, r);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const elapsed = now - start;
      const index = Math.floor(elapsed / STEP_MS);
      const from = SHAPES[index % SHAPES.length] ?? first;
      const to = SHAPES[(index + 1) % SHAPES.length] ?? first;
      const t = Math.min(1, springAt(SPRINGS['fast-spatial'], (elapsed % STEP_MS) / 1000));
      const mixed = from.map((v, i) => v + ((to[i] ?? v) - v) * t);
      const rotation = (index + t) * (Math.PI / 2) + (elapsed / 1000) * Math.PI * 0.5;
      path = radiiToPath(mixed, c, c, r, rotation);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  });
</script>

<div class="loader" class:contained style="--size: {size}px" role="progressbar" aria-label={label}>
  <svg width={size} height={size} viewBox="0 0 {size} {size}" aria-hidden="true">
    <path d={path} />
  </svg>
</div>

<style>
  .loader {
    display: inline-grid;
    place-items: center;
    width: var(--size);
    height: var(--size);
    border-radius: 50%;
  }
  .contained {
    background: var(--primary-container);
  }
  path {
    fill: var(--primary);
  }
  .contained path {
    fill: var(--on-primary-container);
  }
  @media (forced-colors: active) {
    path {
      fill: CanvasText;
    }
  }
</style>
