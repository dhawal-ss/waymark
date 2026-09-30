<script lang="ts">
  import { SEED_PRESETS, type ThemeMode } from '@waymark/theme';
  import { store } from '../lib/stores/data.svelte';
  import { updatePrefs } from '../lib/stores/prefs.svelte';
  import ButtonGroup from '../lib/ui/ButtonGroup.svelte';
  import Icon from '../lib/ui/Icon.svelte';
  import PageHeader from '../lib/ui/PageHeader.svelte';
  import SeedPicker from '../lib/ui/SeedPicker.svelte';
  import Switch from '../lib/ui/Switch.svelte';

  const prefs = $derived(store.data.prefs);

  const THEMES: { value: ThemeMode; label: string }[] = [
    { value: 'system', label: 'System' },
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
  ];
</script>

<PageHeader title="Settings" />

<section class="group" aria-labelledby="appearance-title">
  <h2 id="appearance-title" class="t-title">Appearance</h2>
  <div class="field">
    <span class="t-label muted" aria-hidden="true">Theme</span>
    <ButtonGroup
      label="Theme"
      options={THEMES}
      value={prefs.theme}
      onchange={(theme) => updatePrefs({ theme })}
    />
  </div>
  <Switch
    label="High contrast"
    description="Stronger outlines and text colors."
    checked={prefs.highContrast}
    onchange={(highContrast) => updatePrefs({ highContrast })}
  />
  <div class="field">
    <span class="t-label muted" aria-hidden="true">Color</span>
    <SeedPicker
      presets={SEED_PRESETS}
      value={prefs.seed}
      onchange={(seed) => updatePrefs({ seed })}
    />
  </div>
</section>

<section class="group" aria-labelledby="privacy-title">
  <h2 id="privacy-title" class="t-title">Privacy</h2>
  <Switch
    label="Mask receipt numbers"
    description="Shows only the last 4 digits on lists and screenshots."
    checked={prefs.maskReceipts}
    onchange={(maskReceipts) => updatePrefs({ maskReceipts })}
  />
</section>

<section class="group" aria-labelledby="about-title">
  <h2 id="about-title" class="t-title">Reference</h2>
  <a class="row-link" href="#/settings/design">
    <Icon name="palette" />
    <span class="text">
      <span class="t-body">Design system</span>
      <span class="t-small muted">Color roles, type, shape, motion, and components</span>
    </span>
    <Icon name="chevron_right" />
  </a>
</section>

<style>
  .group {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 16px;
    padding: 20px;
    border-radius: var(--shape-xl);
    background: var(--surface-container-low);
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px 0;
  }
  .row-link {
    display: flex;
    align-items: center;
    gap: 16px;
    min-height: 64px;
    margin: 0 -8px;
    padding: 8px;
    border-radius: var(--shape-l);
    color: var(--on-surface);
    text-decoration: none;
  }
  .row-link:hover {
    background: color-mix(in srgb, var(--on-surface) 8%, transparent);
  }
  .text {
    flex: 1;
    display: flex;
    flex-direction: column;
  }
</style>
