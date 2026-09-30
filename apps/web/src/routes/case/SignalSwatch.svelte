<script lang="ts">
  import type { EventSignal } from '@waymark/core';
  import Hatch from './Hatch.svelte';

  let { signal }: { signal: EventSignal } = $props();

  const uid = $props.id();
</script>

<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
  {#if signal === 'silent'}
    <defs><Hatch id="{uid}-hatch" /></defs>
  {/if}
  <rect
    class={signal === 'notice' ? 'notice' : ''}
    width="16"
    height="16"
    rx="3"
    fill={signal === 'silent' ? `url(#${uid}-hatch)` : undefined}
  />
</svg>

<style>
  svg {
    flex: none;
  }
  .notice {
    fill: var(--primary);
  }
  @media (forced-colors: active) {
    .notice {
      fill: CanvasText;
    }
  }
</style>
