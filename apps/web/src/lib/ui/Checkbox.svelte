<script lang="ts">
  interface Props {
    label: string;
    checked: boolean;
    disabled?: boolean;
    onchange?: (checked: boolean) => void;
  }

  let { label, checked = $bindable(), disabled = false, onchange }: Props = $props();
</script>

<label class="row" class:disabled>
  <input type="checkbox" bind:checked {disabled} onchange={() => onchange?.(checked)} />
  <span class="t-body">{label}</span>
</label>

<style>
  .row {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 48px;
    cursor: pointer;
  }
  .disabled {
    cursor: default;
    color: color-mix(in srgb, var(--on-surface) 38%, transparent);
  }
  input {
    position: relative;
    flex: none;
    appearance: none;
    width: 18px;
    height: 18px;
    margin: 11px;
    border-radius: 2px;
    box-shadow: inset 0 0 0 2px var(--on-surface-variant);
    cursor: inherit;
    transition:
      background-color var(--duration-short) var(--ease-standard),
      border-radius var(--spring-fast-spatial-duration) var(--spring-fast-spatial);
  }
  input::before {
    content: '';
    position: absolute;
    inset: -11px;
    border-radius: 50%;
    background: var(--on-surface);
    opacity: 0;
    transition: opacity var(--duration-short) var(--ease-standard);
  }
  @media (hover: hover) {
    input:hover::before {
      opacity: var(--state-hover);
    }
  }
  input:checked {
    background: var(--primary);
    box-shadow: none;
  }
  input:checked::after {
    content: '';
    position: absolute;
    inset: 0;
    background: var(--on-primary);
    mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 -960 960 960'%3E%3Cpath d='m382-354 339-339q12-12 28-12t28 12q12 12 12 28.5T777-636L410-268q-12 12-28 12t-28-12L182-440q-12-12-11.5-28.5T183-497q12-12 28.5-12t28.5 12l142 143Z'/%3E%3C/svg%3E")
      center / 16px no-repeat;
    animation: pop var(--spring-fast-spatial-duration) var(--spring-fast-spatial);
  }
  input:active {
    border-radius: 6px;
  }
  input:disabled {
    opacity: 0.38;
  }
  @keyframes pop {
    from {
      scale: 0.4;
    }
  }
  @media (forced-colors: active) {
    input {
      border: 2px solid ButtonText;
    }
    input:checked {
      background: Highlight;
    }
  }
</style>
