<script lang="ts">
  import Icon from './Icon.svelte';

  interface Props {
    label: string;
    selected: boolean;
    onchange?: (selected: boolean) => void;
    disabled?: boolean;
  }

  let { label, selected = $bindable(), onchange, disabled = false }: Props = $props();

  function toggle() {
    selected = !selected;
    onchange?.(selected);
  }
</script>

<button
  type="button"
  class="chip"
  class:selected
  aria-pressed={selected}
  {disabled}
  onclick={toggle}
>
  {#if selected}<Icon name="check" size={18} />{/if}
  <span>{label}</span>
</button>

<style>
  .chip {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    height: 32px;
    padding: 0 16px;
    border: 0;
    border-radius: var(--shape-s);
    background: transparent;
    color: var(--on-surface-variant);
    box-shadow: inset 0 0 0 1px var(--outline);
    font-size: 0.875rem;
    font-weight: 540;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition:
      background-color var(--duration-short) var(--ease-standard),
      padding var(--spring-fast-spatial-duration) var(--spring-fast-spatial),
      border-radius var(--spring-fast-spatial-duration) var(--spring-fast-spatial);
  }
  .chip::before {
    content: '';
    position: absolute;
    inset: -8px 0;
  }
  @media (hover: hover) {
    .chip:hover {
      background: color-mix(in srgb, var(--on-surface-variant) 8%, transparent);
    }
  }
  .chip:active {
    border-radius: var(--shape-l);
  }
  .selected {
    padding-left: 8px;
    background: var(--secondary-container);
    color: var(--on-secondary-container);
    box-shadow: none;
  }
  @media (hover: hover) {
    .selected:hover {
      background: color-mix(in srgb, var(--on-secondary-container) 8%, var(--secondary-container));
    }
  }
  .chip:disabled {
    cursor: default;
    color: color-mix(in srgb, var(--on-surface) 38%, transparent);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--on-surface) 12%, transparent);
  }
  @media (forced-colors: active) {
    .selected {
      border: 2px solid Highlight;
    }
  }
</style>
