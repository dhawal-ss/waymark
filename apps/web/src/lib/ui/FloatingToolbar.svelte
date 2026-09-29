<script lang="ts">
  import IconButton from './IconButton.svelte';
  import type { IconName } from './icons';
  import { rovingIndex } from './keys';

  interface ToolbarItem {
    icon: IconName;
    label: string;
    onclick: () => void;
    disabled?: boolean;
  }

  interface Props {
    items: ToolbarItem[];
    /** Accessible name for the toolbar. */
    label: string;
    vibrant?: boolean;
    fixed?: boolean;
  }

  let { items, label, vibrant = false, fixed = false }: Props = $props();

  let focusIndex = $state(0);
  let bar: HTMLDivElement | undefined = $state();

  function onkeydown(event: KeyboardEvent) {
    const next = rovingIndex(event.key, focusIndex, items.length, 'horizontal');
    if (next === null) return;
    event.preventDefault();
    focusIndex = next;
    bar?.querySelectorAll('button')[next]?.focus();
  }
</script>

<div
  bind:this={bar}
  class="toolbar"
  class:vibrant
  class:fixed
  role="toolbar"
  aria-label={label}
  tabindex="-1"
  {onkeydown}
>
  {#each items as item, i (item.label)}
    <IconButton
      icon={item.icon}
      label={item.label}
      disabled={item.disabled}
      tabindex={i === focusIndex ? 0 : -1}
      onfocus={() => (focusIndex = i)}
      onclick={item.onclick}
      size="m"
    />
  {/each}
</div>

<style>
  .toolbar {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 8px;
    border-radius: var(--shape-full);
    background: var(--surface-container-high);
    color: var(--on-surface-variant);
    box-shadow: var(--elevation-3);
  }
  .vibrant {
    background: var(--primary-container);
  }
  .vibrant :global(button) {
    color: var(--on-primary-container);
  }
  .fixed {
    position: fixed;
    left: 50%;
    translate: -50% 0;
    bottom: calc(var(--nav-bar-height) + 16px + env(safe-area-inset-bottom));
    z-index: 25;
  }
  @media (min-width: 840px) {
    .fixed {
      left: calc(50% + var(--nav-rail-width) / 2);
      bottom: 24px;
    }
  }
</style>
