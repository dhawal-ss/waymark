<script lang="ts">
  interface Props {
    label: string;
    description?: string;
    checked: boolean;
    disabled?: boolean;
    onchange?: (checked: boolean) => void;
  }

  let { label, description, checked = $bindable(), disabled = false, onchange }: Props = $props();

  const id = `switch-${Math.random().toString(36).slice(2, 8)}`;
</script>

<div class="row">
  <label for={id} class="text">
    <span class="t-body">{label}</span>
    {#if description}<span class="t-small muted" id="{id}-desc">{description}</span>{/if}
  </label>
  <input
    {id}
    type="checkbox"
    role="switch"
    bind:checked
    {disabled}
    aria-describedby={description ? `${id}-desc` : undefined}
    onchange={() => onchange?.(checked)}
  />
</div>

<style>
  .row {
    display: flex;
    align-items: center;
    gap: 16px;
    min-height: 56px;
  }
  .text {
    flex: 1;
    display: flex;
    flex-direction: column;
    cursor: pointer;
  }
  input {
    --thumb: 16px;
    position: relative;
    flex: none;
    appearance: none;
    width: 52px;
    height: 32px;
    margin: 0;
    border-radius: 16px;
    background: var(--surface-container-highest);
    box-shadow: inset 0 0 0 2px var(--outline);
    cursor: pointer;
    transition: background-color var(--duration-short) var(--ease-standard);
  }
  input::before {
    content: '';
    position: absolute;
    top: 50%;
    left: 16px;
    width: var(--thumb);
    height: var(--thumb);
    border-radius: 50%;
    background: var(--outline);
    translate: -50% -50%;
    transition:
      left var(--spring-fast-spatial-duration) var(--spring-fast-spatial),
      width var(--spring-fast-spatial-duration) var(--spring-fast-spatial),
      height var(--spring-fast-spatial-duration) var(--spring-fast-spatial),
      background-color var(--duration-short) var(--ease-standard);
  }
  input::after {
    content: '';
    position: absolute;
    top: 50%;
    left: 36px;
    width: 16px;
    height: 16px;
    translate: -50% -50%;
    background: var(--on-primary-container);
    mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 -960 960 960'%3E%3Cpath d='m382-354 339-339q12-12 28-12t28 12q12 12 12 28.5T777-636L410-268q-12 12-28 12t-28-12L182-440q-12-12-11.5-28.5T183-497q12-12 28.5-12t28.5 12l142 143Z'/%3E%3C/svg%3E")
      center / contain no-repeat;
    opacity: 0;
    transition: opacity var(--duration-short) var(--ease-standard);
  }
  input:hover::before {
    background: var(--on-surface-variant);
  }
  input:active::before {
    --thumb: 28px;
  }
  input:checked {
    background: var(--primary);
    box-shadow: none;
  }
  input:checked::before {
    --thumb: 24px;
    left: 36px;
    background: var(--on-primary);
  }
  input:checked:active::before {
    --thumb: 28px;
  }
  input:checked::after {
    opacity: 1;
  }
  input:disabled {
    cursor: default;
    opacity: 0.38;
  }
  @media (forced-colors: active) {
    input {
      border: 2px solid ButtonText;
    }
    input::before {
      background: ButtonText;
    }
    input:checked {
      background: Highlight;
    }
  }
</style>
