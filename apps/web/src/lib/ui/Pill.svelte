<script lang="ts">
  import type { Tone } from '@waymark/core';
  import Icon from './Icon.svelte';
  import type { IconName } from './icons';

  interface Props {
    label: string;
    tone?: Tone | 'neutral' | 'new';
    icon?: IconName;
  }

  let { label, tone = 'neutral', icon }: Props = $props();
</script>

<span class="pill tone-{tone}">
  {#if icon}<Icon name={icon} size={16} />{:else if tone !== 'neutral' && tone !== 'new'}<span
      class="dot"
      aria-hidden="true"
    ></span>{/if}
  {label}
</span>

<style>
  .pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 28px;
    padding: 0 12px;
    border-radius: var(--shape-full);
    background: var(--tone-container, var(--surface-container-highest));
    color: var(--tone-on-container, var(--on-surface-variant));
    font-size: 0.8125rem;
    font-weight: 600;
    line-height: 1;
    white-space: nowrap;
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: currentColor;
  }
  .pill:global(.tone-new) {
    background: var(--tertiary);
    color: var(--on-tertiary);
  }
  @media (forced-colors: active) {
    .pill {
      border: 1px solid CanvasText;
    }
  }
</style>
