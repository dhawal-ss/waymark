<script lang="ts">
  import { contrast, isHex, type SeedPreset } from '@waymark/theme';
  import Icon from './Icon.svelte';
  import { rovingIndex } from './keys';

  interface Props {
    presets: readonly SeedPreset[];
    value: string;
    onchange: (hex: string) => void;
  }

  let { presets, value, onchange }: Props = $props();

  const selectedIndex = $derived(
    presets.findIndex((p) => p.hex.toLowerCase() === value.toLowerCase()),
  );
  const isCustom = $derived(selectedIndex === -1);
  let customHex = $state('');
  $effect(() => {
    if (isCustom) customHex = value;
  });

  let swatches: HTMLButtonElement[] = $state([]);

  const markColor = (hex: string) =>
    contrast(hex, '#000000') > contrast(hex, '#ffffff') ? '#000000' : '#ffffff';

  function onkeydown(event: KeyboardEvent, index: number) {
    const next = rovingIndex(event.key, index, presets.length, 'both');
    if (next === null) return;
    event.preventDefault();
    const preset = presets[next];
    if (preset) onchange(preset.hex);
    swatches[next]?.focus();
  }

  function onCustomInput(event: Event) {
    const hex = (event.currentTarget as HTMLInputElement).value;
    customHex = hex;
    if (isHex(hex)) onchange(hex);
  }
</script>

<div class="picker">
  <div class="swatches" role="radiogroup" aria-label="Color presets">
    {#each presets as preset, i (preset.id)}
      {@const checked = i === selectedIndex}
      <button
        bind:this={swatches[i]}
        type="button"
        role="radio"
        aria-checked={checked}
        aria-label={preset.label}
        title={preset.label}
        tabindex={checked || (isCustom && i === 0) ? 0 : -1}
        class:checked
        style="--swatch: {preset.hex}; --mark: {markColor(preset.hex)}"
        onclick={() => onchange(preset.hex)}
        onkeydown={(e) => onkeydown(e, i)}
      >
        {#if checked}<Icon name="check" size={20} />{/if}
      </button>
    {/each}
  </div>
  <label class="custom" class:checked={isCustom}>
    <input type="color" value={isCustom ? customHex : value} oninput={onCustomInput} />
    <span class="t-label">Custom color</span>
    {#if isCustom}<span class="t-small t-mono muted">{customHex}</span>{/if}
  </label>
</div>

<style>
  .picker {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .swatches {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  button {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    padding: 0;
    border: 0;
    border-radius: 22px;
    background: var(--swatch);
    color: var(--mark);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--on-surface) 20%, transparent);
    cursor: pointer;
    transition: border-radius var(--spring-fast-spatial-duration) var(--spring-fast-spatial);
  }
  button:active,
  button.checked {
    border-radius: var(--shape-l);
  }
  button.checked {
    outline: 2px solid var(--on-surface);
    outline-offset: 2px;
  }
  button:focus-visible {
    outline: 3px solid var(--primary);
    outline-offset: 3px;
  }
  .custom {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 48px;
    cursor: pointer;
  }
  .custom input {
    width: 48px;
    height: 48px;
    padding: 0;
    border: 0;
    border-radius: 24px;
    background: none;
    cursor: pointer;
  }
  .custom input::-webkit-color-swatch-wrapper {
    padding: 0;
  }
  .custom input::-webkit-color-swatch {
    border: 1px solid var(--outline);
    border-radius: 24px;
  }
  .custom input::-moz-color-swatch {
    border: 1px solid var(--outline);
    border-radius: 24px;
  }
  .custom.checked input::-webkit-color-swatch {
    border-radius: var(--shape-l);
    outline: 2px solid var(--on-surface);
  }
</style>
