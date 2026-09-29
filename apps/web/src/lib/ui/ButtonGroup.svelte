<script lang="ts" generics="T extends string">
  import Icon from './Icon.svelte';
  import type { IconName } from './icons';
  import { rovingIndex } from './keys';

  interface Option {
    value: T;
    label: string;
    icon?: IconName;
  }

  interface Props {
    options: Option[];
    value: T;
    /** Accessible name for the group. */
    label: string;
    onchange?: (value: T) => void;
  }

  let { options, value = $bindable(), label, onchange }: Props = $props();

  let buttons: HTMLButtonElement[] = $state([]);

  function select(v: T) {
    if (v === value) return;
    value = v;
    onchange?.(v);
  }

  function onkeydown(event: KeyboardEvent, index: number) {
    const next = rovingIndex(event.key, index, options.length, 'both');
    if (next === null) return;
    event.preventDefault();
    const option = options[next];
    if (!option) return;
    select(option.value);
    buttons[next]?.focus();
  }
</script>

<div class="group" role="radiogroup" aria-label={label}>
  {#each options as option, i (option.value)}
    {@const checked = option.value === value}
    <button
      bind:this={buttons[i]}
      type="button"
      role="radio"
      aria-checked={checked}
      tabindex={checked ? 0 : -1}
      class:checked
      onclick={() => select(option.value)}
      onkeydown={(e) => onkeydown(e, i)}
    >
      {#if checked}
        <Icon name="check" size={18} />
      {:else if option.icon}
        <Icon name={option.icon} size={18} />
      {/if}
      <span>{option.label}</span>
    </button>
  {/each}
</div>

<style>
  .group {
    display: flex;
    gap: 2px;
    width: 100%;
  }
  button {
    --inner: var(--shape-s);
    position: relative;
    flex: 1 1 auto;
    min-width: 48px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    height: 40px;
    padding: 0 12px;
    border: 0;
    border-radius: var(--inner);
    background: var(--surface-container-highest);
    color: var(--on-surface-variant);
    font-size: 0.875rem;
    font-weight: 560;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition:
      border-radius var(--spring-fast-spatial-duration) var(--spring-fast-spatial),
      background-color var(--duration-short) var(--ease-standard),
      color var(--duration-short) var(--ease-standard);
  }
  button::before {
    content: '';
    position: absolute;
    inset: -4px 0;
  }
  button span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  button:first-child {
    border-top-left-radius: 20px;
    border-bottom-left-radius: 20px;
  }
  button:last-child {
    border-top-right-radius: 20px;
    border-bottom-right-radius: 20px;
  }
  button:hover {
    background: color-mix(in srgb, var(--on-surface-variant) 8%, var(--surface-container-highest));
  }
  button:active {
    border-radius: 4px;
  }
  button.checked {
    border-radius: 20px;
    background: var(--secondary);
    color: var(--on-secondary);
  }
  @media (forced-colors: active) {
    button {
      border: 1px solid ButtonText;
    }
    button.checked {
      background: Highlight;
      color: HighlightText;
    }
  }
</style>
