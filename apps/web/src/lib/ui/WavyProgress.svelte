<script lang="ts">
  import { prefersReducedMotion } from './keys';

  interface Props {
    value: number;
    max?: number;
    /** Accessible name, for example "Time elapsed against processing time". */
    label: string;
    /** Spoken value, for example "212 of 300 days". */
    valueText?: string;
    /** Animate the wave. Use for the one progress bar in focus, not in lists. */
    animate?: boolean;
  }

  let { value, max = 1, label, valueText, animate = false }: Props = $props();

  const STROKE = 4;
  const AMPLITUDE = 3;
  const WAVELENGTH = 24;
  const GAP = 4;
  const HEIGHT = 14;

  let width = $state(0);
  let phase = $state(0);

  const ratio = $derived(max > 0 ? Math.max(0, value / max) : 0);
  const over = $derived(ratio > 1);
  const clamped = $derived(Math.min(1, ratio));
  const mid = HEIGHT / 2;

  const activeEnd = $derived(Math.max(0, clamped * (width - STROKE)) + STROKE / 2);

  const wavePath = $derived.by(() => {
    if (width <= 0 || clamped <= 0) return '';
    // Flatten the wave near the ends so it eases in and out of the line.
    const amp = AMPLITUDE * Math.min(1, clamped * 12, over ? 1 : (1 - clamped) * 12 + 0.25);
    let d = `M${STROKE / 2} ${mid}`;
    for (let x = STROKE / 2; x <= activeEnd; x += 1) {
      const y = mid + amp * Math.sin(((x - STROKE / 2) / WAVELENGTH) * Math.PI * 2 + phase);
      d += `L${x.toFixed(1)} ${y.toFixed(2)}`;
    }
    return d;
  });

  const trackStart = $derived(activeEnd + GAP + STROKE);
  const showTrack = $derived(!over && trackStart < width - STROKE / 2);

  $effect(() => {
    if (!animate || prefersReducedMotion()) return;
    let frame = 0;
    let last = performance.now();
    const step = (now: number) => {
      phase = (phase - ((now - last) / 1000) * Math.PI * 1.6) % (Math.PI * 2);
      last = now;
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  });
</script>

<div
  class="wavy"
  class:over
  bind:clientWidth={width}
  role="progressbar"
  aria-label={label}
  aria-valuemin={0}
  aria-valuemax={max}
  aria-valuenow={Math.min(value, max)}
  aria-valuetext={valueText}
>
  {#if width > 0}
    <svg {width} height={HEIGHT} viewBox="0 0 {width} {HEIGHT}" aria-hidden="true">
      {#if showTrack}
        <line
          class="track"
          x1={trackStart}
          y1={mid}
          x2={width - STROKE / 2}
          y2={mid}
          stroke-width={STROKE}
        />
        <circle class="stop" cx={width - STROKE / 2} cy={mid} r={STROKE / 2} />
      {/if}
      {#if wavePath}
        <path class="active" d={wavePath} stroke-width={STROKE} />
      {/if}
    </svg>
  {/if}
</div>

<style>
  .wavy {
    width: 100%;
    height: 14px;
  }
  svg {
    overflow: visible;
  }
  path,
  line {
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .active {
    stroke: var(--primary);
  }
  .track {
    stroke: var(--secondary-container);
  }
  .stop {
    fill: var(--primary);
  }
  .over .active {
    stroke: var(--error);
  }
  @media (forced-colors: active) {
    .active {
      stroke: Highlight;
    }
    .track {
      stroke: GrayText;
    }
  }
</style>
