<script lang="ts">
  import Icon from './Icon.svelte';
  import type { IconName } from './icons';
  import Menu, { type MenuItem } from './Menu.svelte';

  interface Props {
    label: string;
    icon?: IconName;
    onclick: () => void;
    items: MenuItem[];
    /** Accessible name for the menu button, for example "More statuses". */
    menuLabel: string;
    variant?: 'filled' | 'tonal';
  }

  let { label, icon, onclick, items, menuLabel, variant = 'filled' }: Props = $props();

  let open = $state(false);
  let trigger: HTMLButtonElement | undefined = $state();
  const menuId = `split-menu-${Math.random().toString(36).slice(2, 8)}`;

  function close(returnFocus: boolean) {
    open = false;
    if (returnFocus) trigger?.focus();
  }

  function onTriggerKey(event: KeyboardEvent) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      open = true;
    }
  }
</script>

<div class="split {variant}">
  <button type="button" class="lead" {onclick}>
    {#if icon}<Icon name={icon} size={20} />{/if}
    <span>{label}</span>
  </button>
  <button
    bind:this={trigger}
    type="button"
    class="trail"
    class:open
    aria-label={menuLabel}
    aria-haspopup="menu"
    aria-expanded={open}
    aria-controls={open ? menuId : undefined}
    onclick={() => (open = !open)}
    onkeydown={onTriggerKey}
  >
    <Icon name="keyboard_arrow_down" size={22} />
  </button>
  <Menu {open} {items} label={menuLabel} id={menuId} onclose={close} />
</div>

<style>
  .split {
    position: relative;
    display: inline-flex;
    gap: 2px;
  }
  button {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    height: 40px;
    border: 0;
    font-size: 0.875rem;
    font-weight: 580;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition:
      border-radius var(--spring-fast-spatial-duration) var(--spring-fast-spatial),
      background-color var(--duration-short) var(--ease-standard);
  }
  button::before {
    content: '';
    position: absolute;
    inset: -4px 0;
  }
  button::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: currentColor;
    opacity: 0;
    transition: opacity var(--duration-short) var(--ease-standard);
  }
  @media (hover: hover) {
    button:hover::after {
      opacity: var(--state-hover);
    }
  }
  button:active::after {
    opacity: var(--state-pressed);
  }
  .lead {
    padding: 0 16px 0 16px;
    border-radius: 20px 4px 4px 20px;
  }
  .lead:active {
    border-radius: 12px 8px 8px 12px;
  }
  .trail {
    justify-content: center;
    width: 44px;
    padding: 0;
    border-radius: 4px 20px 20px 4px;
  }
  .trail :global(svg) {
    transition: rotate var(--spring-default-spatial-duration) var(--spring-default-spatial);
  }
  .trail.open {
    border-radius: 20px;
  }
  .trail.open :global(svg) {
    rotate: 180deg;
  }
  .filled button {
    background: var(--primary);
    color: var(--on-primary);
  }
  .tonal button {
    background: var(--secondary-container);
    color: var(--on-secondary-container);
  }
</style>
