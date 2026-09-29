<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements';
  import Icon from './Icon.svelte';
  import type { IconName } from './icons';

  type Variant = 'filled' | 'tonal' | 'tertiary' | 'outlined' | 'text';

  interface Props extends HTMLButtonAttributes {
    variant?: Variant;
    size?: 's' | 'm' | 'l';
    icon?: IconName;
    trailingIcon?: IconName;
    /** Render as a link that looks like a button. */
    href?: string;
    target?: string;
    rel?: string;
    children?: Snippet;
  }

  let {
    variant = 'filled',
    size = 's',
    icon,
    trailingIcon,
    href,
    target,
    rel,
    children,
    type = 'button',
    class: klass = '',
    ...rest
  }: Props = $props();

  const iconSize = $derived(size === 's' ? 20 : 24);
</script>

{#snippet content()}
  {#if icon}<Icon name={icon} size={iconSize} />{/if}
  {#if children}<span class="label">{@render children()}</span>{/if}
  {#if trailingIcon}<Icon name={trailingIcon} size={iconSize} />{/if}
{/snippet}

{#if href}
  <a
    {href}
    {target}
    {rel}
    class="btn {variant} size-{size} {klass}"
    {...rest as HTMLAnchorAttributes}
  >
    {@render content()}
  </a>
{:else}
  <button {type} class="btn {variant} size-{size} {klass}" {...rest}>
    {@render content()}
  </button>
{/if}

<style>
  .btn {
    --h: 40px;
    --press-radius: var(--shape-s);
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    height: var(--h);
    min-width: 48px;
    padding: 0 20px;
    border: 0;
    border-radius: calc(var(--h) / 2);
    font-size: 0.875rem;
    line-height: 1.25rem;
    font-weight: 580;
    letter-spacing: 0.006em;
    text-decoration: none;
    white-space: nowrap;
    cursor: pointer;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
    isolation: isolate;
    transition:
      border-radius var(--spring-fast-spatial-duration) var(--spring-fast-spatial),
      background-color var(--duration-short) var(--ease-standard),
      color var(--duration-short) var(--ease-standard),
      box-shadow var(--duration-short) var(--ease-standard);
  }
  .btn::before {
    content: '';
    position: absolute;
    inset: 50% 0 auto;
    height: max(48px, 100%);
    translate: 0 -50%;
  }
  .btn::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: currentColor;
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--duration-short) var(--ease-standard);
  }
  .btn:hover::after {
    opacity: var(--state-hover);
  }
  .btn:focus-visible::after,
  .btn:active::after {
    opacity: var(--state-pressed);
  }
  .btn:active:not(:disabled) {
    border-radius: var(--press-radius);
  }
  .size-m {
    --h: 48px;
    padding: 0 24px;
    font-size: 1rem;
  }
  .size-l {
    --h: 56px;
    --press-radius: var(--shape-l);
    padding: 0 28px;
    font-size: 1rem;
  }

  .filled {
    background: var(--primary);
    color: var(--on-primary);
  }
  .filled:hover {
    box-shadow: var(--elevation-1);
  }
  .tonal {
    background: var(--secondary-container);
    color: var(--on-secondary-container);
  }
  .tertiary {
    background: var(--tertiary);
    color: var(--on-tertiary);
  }
  .outlined {
    background: transparent;
    color: var(--on-surface-variant);
    box-shadow: inset 0 0 0 1px var(--outline);
  }
  .text {
    background: transparent;
    color: var(--primary);
    padding: 0 12px;
  }

  .btn:disabled {
    cursor: default;
    color: color-mix(in srgb, var(--on-surface) 38%, transparent);
    background: color-mix(in srgb, var(--on-surface) 12%, transparent);
    box-shadow: none;
  }
  .outlined:disabled {
    background: transparent;
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--on-surface) 12%, transparent);
  }
  .text:disabled {
    background: transparent;
  }
  .btn:disabled::after {
    display: none;
  }

  @media (forced-colors: active) {
    .btn {
      border: 1px solid ButtonText;
    }
  }
</style>
