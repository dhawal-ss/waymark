<script lang="ts">
  import { reserveFloatingSpace } from './floating';
  import { tick } from 'svelte';
  import Icon from './Icon.svelte';
  import type { IconName } from './icons';
  import { rovingIndex } from './keys';

  interface FabItem {
    label: string;
    icon: IconName;
    onselect: () => void;
  }

  interface Props {
    items: FabItem[];
    /** Accessible name while closed, for example "Add". */
    label: string;
    /** Fixed to the viewport corner. Turn off to place it inside a container. */
    fixed?: boolean;
  }

  let { items, label, fixed = true }: Props = $props();

  $effect(() => (fixed ? reserveFloatingSpace() : undefined));

  let open = $state(false);
  let fab: HTMLButtonElement | undefined = $state();
  let itemButtons: HTMLButtonElement[] = $state([]);
  const listId = `fab-menu-${Math.random().toString(36).slice(2, 8)}`;

  async function toggle() {
    open = !open;
    if (open) {
      await tick();
      itemButtons[0]?.focus();
    }
  }

  function close() {
    open = false;
    fab?.focus();
  }

  function choose(item: FabItem) {
    open = false;
    fab?.focus();
    item.onselect();
  }

  function onkeydown(event: KeyboardEvent) {
    if (!open) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    const current = itemButtons.indexOf(document.activeElement as HTMLButtonElement);
    if (current === -1) return;
    const next = rovingIndex(event.key, current, items.length, 'vertical');
    if (next !== null) {
      event.preventDefault();
      itemButtons[next]?.focus();
    }
  }
</script>

{#if open}
  <div class="scrim" class:fixed aria-hidden="true" onclick={close}></div>
{/if}

<div class="fab-menu" class:fixed {onkeydown} role="presentation">
  {#if open}
    <ul id={listId} class="items" role="list">
      {#each items as item, i (item.label)}
        <li style="--i: {items.length - 1 - i}">
          <button bind:this={itemButtons[i]} type="button" onclick={() => choose(item)}>
            <Icon name={item.icon} size={24} />
            <span>{item.label}</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
  <button
    bind:this={fab}
    type="button"
    class="fab"
    class:open
    aria-label={open ? 'Close menu' : label}
    aria-expanded={open}
    aria-controls={open ? listId : undefined}
    onclick={toggle}
  >
    <Icon name={open ? 'close' : 'add'} size={24} />
  </button>
</div>

<style>
  .scrim {
    position: absolute;
    inset: 0;
    z-index: 30;
    background: color-mix(in srgb, var(--scrim) 32%, transparent);
    animation: fade var(--duration-medium) var(--ease-standard);
  }
  .scrim.fixed {
    position: fixed;
  }
  .fab-menu {
    position: relative;
    z-index: 31;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 8px;
  }
  .fab-menu.fixed {
    position: fixed;
    right: max(16px, env(safe-area-inset-right));
    bottom: calc(var(--nav-bar-height) + 16px + env(safe-area-inset-bottom));
    transform: translateY(calc(-1 * var(--snackbar-offset, 0px)));
    transition: transform var(--spring-default-spatial-duration) var(--spring-default-spatial);
  }
  @media (min-width: 840px) {
    .fab-menu.fixed {
      bottom: 24px;
      right: 24px;
    }
  }
  .items {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 4px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .items li {
    animation: item-in var(--spring-fast-spatial-duration) var(--spring-fast-spatial) both;
    animation-delay: calc(var(--i) * 30ms);
  }
  .items button {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 12px;
    height: 56px;
    padding: 0 24px 0 20px;
    border: 0;
    border-radius: 28px;
    background: var(--primary-container);
    color: var(--on-primary-container);
    font-size: 1rem;
    font-weight: 560;
    cursor: pointer;
    box-shadow: var(--elevation-1);
    transition: border-radius var(--spring-fast-spatial-duration) var(--spring-fast-spatial);
  }
  .items button::after,
  .fab::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: currentColor;
    opacity: 0;
    transition: opacity var(--duration-short) var(--ease-standard);
  }
  @media (hover: hover) {
    .items button:hover::after,
    .fab:hover::after {
      opacity: var(--state-hover);
    }
  }
  .items button:active,
  .fab:active {
    border-radius: var(--shape-l);
  }
  .fab {
    position: relative;
    display: grid;
    place-items: center;
    width: 56px;
    height: 56px;
    border: 0;
    border-radius: var(--shape-l);
    background: var(--primary-container);
    color: var(--on-primary-container);
    box-shadow: var(--elevation-3);
    cursor: pointer;
    transition:
      border-radius var(--spring-default-spatial-duration) var(--spring-default-spatial),
      background-color var(--duration-short) var(--ease-standard),
      color var(--duration-short) var(--ease-standard);
  }
  .fab :global(svg) {
    transition: rotate var(--spring-default-spatial-duration) var(--spring-default-spatial);
  }
  .fab.open {
    border-radius: 28px;
    background: var(--primary);
    color: var(--on-primary);
  }
  .fab.open :global(svg) {
    rotate: 90deg;
  }
  @keyframes item-in {
    from {
      opacity: 0;
      translate: 0 16px;
      scale: 0.8;
    }
  }
  @keyframes fade {
    from {
      opacity: 0;
    }
  }
</style>
