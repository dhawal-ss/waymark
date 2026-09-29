<script lang="ts">
  import type { HTMLInputAttributes } from 'svelte/elements';

  interface Props extends Omit<HTMLInputAttributes, 'value'> {
    label: string;
    value: string;
    supporting?: string;
    error?: string;
    mono?: boolean;
  }

  let {
    label,
    value = $bindable(),
    supporting,
    error,
    mono = false,
    type = 'text',
    id: idProp,
    ...rest
  }: Props = $props();

  const fallbackId = `field-${Math.random().toString(36).slice(2, 8)}`;
  const id = $derived(idProp ?? fallbackId);
  const describedBy = $derived(error || supporting ? `${id}-help` : undefined);
  const alwaysFloat = $derived(type === 'date' || type === 'month' || type === 'color');
</script>

<div class="field" class:invalid={!!error} class:float={alwaysFloat}>
  <div class="frame">
    <input
      {id}
      {type}
      class:t-mono={mono}
      bind:value
      placeholder=" "
      aria-invalid={error ? 'true' : undefined}
      aria-describedby={describedBy}
      {...rest}
    />
    <label for={id}>{label}</label>
  </div>
  {#if error}
    <p class="help error" id="{id}-help">{error}</p>
  {:else if supporting}
    <p class="help" id="{id}-help">{supporting}</p>
  {/if}
</div>

<style>
  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }
  .frame {
    position: relative;
  }
  input {
    width: 100%;
    height: 56px;
    padding: 16px 16px 0;
    border: 1px solid var(--outline);
    border-radius: var(--shape-xs);
    background: transparent;
    color: var(--on-surface);
    font-size: 1rem;
    transition: border-color var(--duration-short) var(--ease-standard);
  }
  input:hover {
    border-color: var(--on-surface);
  }
  input:focus {
    outline: none;
    border-color: var(--primary);
    box-shadow: inset 0 0 0 1px var(--primary);
  }
  label {
    position: absolute;
    left: 12px;
    top: 50%;
    padding: 0 4px;
    translate: 0 -50%;
    color: var(--on-surface-variant);
    font-size: 1rem;
    line-height: 1.25rem;
    pointer-events: none;
    transform-origin: left center;
    transition:
      top var(--spring-fast-effects-duration) var(--spring-fast-effects),
      font-size var(--spring-fast-effects-duration) var(--spring-fast-effects),
      color var(--duration-short) var(--ease-standard);
  }
  input:focus + label,
  input:not(:placeholder-shown) + label,
  .float label {
    top: 14px;
    font-size: 0.75rem;
  }
  input:focus + label {
    color: var(--primary);
  }
  .help {
    padding: 0 16px;
    color: var(--on-surface-variant);
    font-size: 0.75rem;
    line-height: 1rem;
  }
  .invalid input,
  .invalid input:hover {
    border-color: var(--error);
  }
  .invalid input:focus {
    box-shadow: inset 0 0 0 1px var(--error);
  }
  .invalid label,
  .invalid input:focus + label,
  .error {
    color: var(--error);
  }
  input:disabled {
    border-color: color-mix(in srgb, var(--on-surface) 12%, transparent);
    color: color-mix(in srgb, var(--on-surface) 38%, transparent);
  }
</style>
