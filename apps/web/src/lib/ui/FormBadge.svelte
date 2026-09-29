<script lang="ts">
  import { formBadgeText, type FormType } from '@waymark/core';
  import { BADGE_SHAPE, shapePath } from './shapes';

  interface Props {
    form: FormType;
    size?: number;
  }

  let { form, size = 48 }: Props = $props();

  const d = $derived(shapePath(BADGE_SHAPE, size));
  const text = $derived(formBadgeText(form));
</script>

<span class="badge" style="--size: {size}px">
  <svg width={size} height={size} viewBox="0 0 {size} {size}" aria-hidden="true">
    <path {d} />
  </svg>
  <span class="text" class:long={text.length > 3} aria-hidden="true">{text}</span>
  <span class="visually-hidden">Form {form}</span>
</span>

<style>
  .badge {
    position: relative;
    display: inline-grid;
    place-items: center;
    flex: none;
    width: var(--size);
    height: var(--size);
  }
  svg {
    position: absolute;
    inset: 0;
  }
  path {
    fill: var(--secondary-container);
  }
  .text {
    position: relative;
    color: var(--on-secondary-container);
    font-size: calc(var(--size) * 0.32);
    line-height: 1;
    font-weight: 720;
    font-stretch: 80%;
    font-variant-numeric: tabular-nums;
  }
  .long {
    font-size: calc(var(--size) * 0.26);
    font-stretch: 62%;
  }
  @media (forced-colors: active) {
    path {
      fill: Canvas;
      stroke: CanvasText;
    }
  }
</style>
