<script lang="ts">
  import type { HTMLTextareaAttributes } from 'svelte/elements';

  interface Props extends Omit<HTMLTextareaAttributes, 'value'> {
    label: string;
    value: string;
    supporting?: string;
    error?: string;
    mono?: boolean;
    /** Keep the label for screen readers only, when a heading already names the field. */
    hideLabel?: boolean;
  }

  let {
    label,
    value = $bindable(),
    supporting,
    error,
    mono = false,
    hideLabel = false,
    id: idProp,
    rows = 4,
    ...rest
  }: Props = $props();

  const fallbackId = `area-${Math.random().toString(36).slice(2, 8)}`;
  const id = $derived(idProp ?? fallbackId);
  const describedBy = $derived(error || supporting ? `${id}-help` : undefined);
</script>

<div class="field" class:invalid={!!error}>
  <label for={id} class="t-small" class:visually-hidden={hideLabel}>{label}</label>
  <textarea
    {id}
    {rows}
    class:t-mono={mono}
    bind:value
    aria-invalid={error ? 'true' : undefined}
    aria-describedby={describedBy}
    {...rest}></textarea>
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
  label {
    padding: 0 4px;
    color: var(--on-surface-variant);
    font-weight: 560;
  }
  textarea {
    width: 100%;
    min-height: 96px;
    padding: 12px 16px;
    border: 1px solid var(--outline);
    border-radius: var(--shape-xs);
    background: transparent;
    color: var(--on-surface);
    font-size: 1rem;
    line-height: 1.5rem;
    resize: vertical;
  }
  textarea.t-mono {
    font-size: 0.8125rem;
    line-height: 1.25rem;
  }
  @media (hover: hover) {
    textarea:hover {
      border-color: var(--on-surface);
    }
  }
  textarea:focus {
    outline: none;
    border-color: var(--primary);
    box-shadow: inset 0 0 0 1px var(--primary);
  }
  .field:focus-within label {
    color: var(--primary);
  }
  .help {
    padding: 0 16px;
    color: var(--on-surface-variant);
    font-size: 0.75rem;
    line-height: 1rem;
  }
  .invalid textarea {
    border-color: var(--error);
  }
  .invalid label,
  .error {
    color: var(--error);
  }
</style>
