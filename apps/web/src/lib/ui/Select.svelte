<script lang="ts" generics="T extends string">
  interface Option {
    value: T;
    label: string;
  }

  interface Props {
    label: string;
    value: T;
    options: Option[];
    supporting?: string;
    id?: string;
    onchange?: (value: T) => void;
  }

  let { label, value = $bindable(), options, supporting, id: idProp, onchange }: Props = $props();
  const fallbackId = `select-${Math.random().toString(36).slice(2, 8)}`;
  const id = $derived(idProp ?? fallbackId);
</script>

<div class="field">
  <div class="frame">
    <select
      {id}
      bind:value
      aria-describedby={supporting ? `${id}-help` : undefined}
      onchange={() => onchange?.(value)}
    >
      {#each options as option (option.value)}
        <option value={option.value}>{option.label}</option>
      {/each}
    </select>
    <label for={id}>{label}</label>
    <svg viewBox="0 -960 960 960" width="24" height="24" aria-hidden="true" focusable="false">
      <path
        d="M459-381 314-526q-3-3-4.5-6.5T308-540q0-8 5.5-14t14.5-6h304q9 0 14.5 6t5.5 14q0 2-6 14L501-381q-5 5-10 7t-11 2q-6 0-11-2t-10-7Z"
        fill="currentColor"
      />
    </svg>
  </div>
  {#if supporting}<p class="help" id="{id}-help">{supporting}</p>{/if}
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
  select {
    width: 100%;
    height: 56px;
    padding: 16px 44px 0 16px;
    border: 1px solid var(--outline);
    border-radius: var(--shape-xs);
    background: transparent;
    color: var(--on-surface);
    font-size: 1rem;
    appearance: none;
    cursor: pointer;
  }
  @media (hover: hover) {
    select:hover {
      border-color: var(--on-surface);
    }
  }
  select:focus {
    outline: none;
    border-color: var(--primary);
    box-shadow: inset 0 0 0 1px var(--primary);
  }
  option {
    background: var(--surface-container);
    color: var(--on-surface);
  }
  label {
    position: absolute;
    left: 12px;
    top: 6px;
    padding: 0 4px;
    color: var(--on-surface-variant);
    font-size: 0.75rem;
    line-height: 1rem;
    pointer-events: none;
  }
  select:focus + label {
    color: var(--primary);
  }
  svg {
    position: absolute;
    right: 12px;
    top: 50%;
    translate: 0 -50%;
    color: var(--on-surface-variant);
    pointer-events: none;
  }
  .help {
    padding: 0 16px;
    color: var(--on-surface-variant);
    font-size: 0.75rem;
    line-height: 1rem;
  }
</style>
