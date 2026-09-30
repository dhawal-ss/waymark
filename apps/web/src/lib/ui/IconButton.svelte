<script lang="ts">
  import type { HTMLButtonAttributes } from 'svelte/elements';
  import Icon from './Icon.svelte';
  import type { IconName } from './icons';

  interface Props extends HTMLButtonAttributes {
    icon: IconName;
    /** Accessible name. Required because the button has no visible text. */
    label: string;
    variant?: 'standard' | 'filled' | 'tonal' | 'outlined';
    /** Set for toggle buttons; renders aria-pressed. */
    selected?: boolean;
    selectedIcon?: IconName;
    size?: 's' | 'm';
  }

  let {
    icon,
    label,
    variant = 'standard',
    selected,
    selectedIcon,
    size = 's',
    type = 'button',
    class: klass = '',
    ...rest
  }: Props = $props();
</script>

<button
  {type}
  class="icon-btn {variant} size-{size} {klass}"
  class:selected
  aria-label={label}
  aria-pressed={selected === undefined ? undefined : selected}
  title={label}
  {...rest}
>
  <Icon name={selected && selectedIcon ? selectedIcon : icon} size={24} />
</button>

<style>
  .icon-btn {
    --h: 40px;
    position: relative;
    display: inline-grid;
    place-items: center;
    width: var(--h);
    height: var(--h);
    padding: 0;
    border: 0;
    border-radius: calc(var(--h) / 2);
    background: transparent;
    color: var(--on-surface-variant);
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    isolation: isolate;
    transition:
      border-radius var(--spring-fast-spatial-duration) var(--spring-fast-spatial),
      background-color var(--duration-short) var(--ease-standard),
      color var(--duration-short) var(--ease-standard);
  }
  .size-m {
    --h: 48px;
  }
  .icon-btn::before {
    content: '';
    position: absolute;
    inset: 50% auto auto 50%;
    width: 48px;
    height: 48px;
    translate: -50% -50%;
  }
  .icon-btn::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: currentColor;
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--duration-short) var(--ease-standard);
  }
  @media (hover: hover) {
    .icon-btn:hover::after {
      opacity: var(--state-hover);
    }
  }
  .icon-btn:focus-visible::after,
  .icon-btn:active::after {
    opacity: var(--state-pressed);
  }
  .icon-btn:active:not(:disabled),
  .selected {
    border-radius: var(--shape-m);
  }

  .standard.selected {
    color: var(--primary);
  }
  .filled {
    background: var(--primary);
    color: var(--on-primary);
  }
  .tonal {
    background: var(--secondary-container);
    color: var(--on-secondary-container);
  }
  .outlined {
    box-shadow: inset 0 0 0 1px var(--outline);
  }
  .outlined.selected {
    background: var(--inverse-surface);
    color: var(--inverse-on-surface);
    box-shadow: none;
  }
  .icon-btn:disabled {
    cursor: default;
    color: color-mix(in srgb, var(--on-surface) 38%, transparent);
  }
  .filled:disabled,
  .tonal:disabled {
    background: color-mix(in srgb, var(--on-surface) 12%, transparent);
  }
  .icon-btn:disabled::after {
    display: none;
  }
</style>
