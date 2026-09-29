<script lang="ts" module>
  import type { IconName } from './icons';

  export interface MenuItem {
    label: string;
    icon?: IconName;
    onselect: () => void;
    disabled?: boolean;
  }
</script>

<script lang="ts">
  import { tick } from 'svelte';
  import Icon from './Icon.svelte';
  import { rovingIndex } from './keys';

  interface Props {
    open: boolean;
    items: MenuItem[];
    /** Accessible name for the menu. */
    label: string;
    id?: string;
    align?: 'start' | 'end';
    placement?: 'below' | 'above';
    /** Called when the menu closes, with whether focus should return to the trigger. */
    onclose: (returnFocus: boolean) => void;
  }

  let { open, items, label, id, align = 'end', placement = 'below', onclose }: Props = $props();

  let menu: HTMLDivElement | undefined = $state();
  let buttons: HTMLButtonElement[] = $state([]);

  $effect(() => {
    if (!open) return;
    tick().then(() => buttons.find((b) => b && !b.disabled)?.focus());
    const onPointer = (event: PointerEvent) => {
      if (menu && !menu.parentElement?.contains(event.target as Node)) onclose(false);
    };
    document.addEventListener('pointerdown', onPointer, true);
    return () => document.removeEventListener('pointerdown', onPointer, true);
  });

  function onkeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onclose(true);
      return;
    }
    if (event.key === 'Tab') {
      onclose(false);
      return;
    }
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = rovingIndex(event.key, current, items.length, 'vertical');
    if (next !== null) {
      event.preventDefault();
      buttons[next]?.focus();
    }
  }

  function choose(item: MenuItem) {
    onclose(true);
    item.onselect();
  }
</script>

{#if open}
  <div
    bind:this={menu}
    {id}
    class="menu align-{align} {placement}"
    role="menu"
    tabindex="-1"
    aria-label={label}
    {onkeydown}
  >
    {#each items as item, i (item.label)}
      <button
        bind:this={buttons[i]}
        type="button"
        role="menuitem"
        tabindex="-1"
        disabled={item.disabled}
        onclick={() => choose(item)}
      >
        {#if item.icon}<Icon name={item.icon} size={20} />{/if}
        <span>{item.label}</span>
      </button>
    {/each}
  </div>
{/if}

<style>
  .menu {
    position: absolute;
    z-index: 20;
    min-width: 200px;
    max-width: min(320px, calc(100vw - 32px));
    padding: 4px;
    border-radius: var(--shape-l);
    background: var(--surface-container);
    color: var(--on-surface);
    box-shadow: var(--elevation-2);
    transform-origin: top right;
    animation: menu-in var(--spring-default-spatial-duration) var(--spring-default-spatial);
  }
  .below {
    top: calc(100% + 4px);
  }
  .above {
    bottom: calc(100% + 4px);
    transform-origin: bottom right;
  }
  .align-end {
    right: 0;
  }
  .align-start {
    left: 0;
    transform-origin: top left;
  }
  button {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    min-height: 48px;
    padding: 0 12px;
    border: 0;
    border-radius: var(--shape-m);
    background: transparent;
    color: inherit;
    font-size: 0.875rem;
    font-weight: 500;
    text-align: start;
    cursor: pointer;
    transition:
      background-color var(--duration-short) var(--ease-standard),
      border-radius var(--spring-fast-spatial-duration) var(--spring-fast-spatial);
  }
  button :global(svg) {
    color: var(--on-surface-variant);
  }
  button:hover,
  button:focus-visible {
    background: color-mix(in srgb, var(--on-surface) 8%, transparent);
  }
  button:focus-visible {
    outline-offset: -3px;
    border-radius: var(--shape-xl);
  }
  button:disabled {
    color: color-mix(in srgb, var(--on-surface) 38%, transparent);
    cursor: default;
  }
  @keyframes menu-in {
    from {
      opacity: 0;
      scale: 0.9 0.6;
    }
  }
</style>
