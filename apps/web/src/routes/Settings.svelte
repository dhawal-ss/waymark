<script lang="ts">
  import { SEED_PRESETS, type ThemeMode } from '@waymark/theme';
  import { buildExport, today } from '@waymark/core';
  import { deleteEverything, importDataFile } from '../lib/actions';
  import { flushSaves, nowInstant, store } from '../lib/stores/data.svelte';
  import { showSnackbar } from '../lib/stores/snackbar.svelte';
  import Button from '../lib/ui/Button.svelte';
  import Select from '../lib/ui/Select.svelte';
  import { updatePrefs } from '../lib/stores/prefs.svelte';
  import ButtonGroup from '../lib/ui/ButtonGroup.svelte';
  import Icon from '../lib/ui/Icon.svelte';
  import PageHeader from '../lib/ui/PageHeader.svelte';
  import SeedPicker from '../lib/ui/SeedPicker.svelte';
  import ServerSyncSettings from '../lib/ui/ServerSyncSettings.svelte';
  import PublicDataSettings from '../lib/ui/PublicDataSettings.svelte';
  import { disableServerSync, syncEnabled } from '../lib/serverSync.svelte';
  import Switch from '../lib/ui/Switch.svelte';

  const prefs = $derived(store.data.prefs);

  const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const zones = (() => {
    try {
      return Intl.supportedValuesOf('timeZone');
    } catch {
      return [];
    }
  })();
  const zoneOptions = [
    { value: '', label: `Device time zone (${deviceZone})` },
    ...zones.map((z) => ({ value: z, label: z.replace(/_/g, ' ') })),
  ];

  let fileInput: HTMLInputElement | undefined = $state();
  let importError = $state('');

  async function exportData() {
    await flushSaves();
    const file = buildExport($state.snapshot(store.data), nowInstant());
    const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `waymark-export-${today()}.json`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showSnackbar('Exported your data as a JSON file.');
  }

  async function onImportFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      importError = 'The file is larger than 20 MB. Choose a file exported from Waymark.';
      return;
    }
    const result = importDataFile(await file.text());
    importError = result.ok ? '' : result.message;
  }

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

<section class="group" aria-labelledby="time-title">
  <h2 id="time-title" class="t-title">Time</h2>
  <Select
    label="Time zone for USCIS event times"
    value={prefs.timeZone}
    options={zoneOptions}
    supporting="Event times and dates follow this zone."
    onchange={(timeZone) => updatePrefs({ timeZone })}
  />
</section>

<section class="group" aria-labelledby="sync-title">
  <h2 id="sync-title" class="t-title">Sync status</h2>
  <dl class="sync">
    <div>
      <dt class="t-label">Works</dt>
      <dd>
        Manual sync: on a case, choose Sync to open your case JSON on my.uscis.gov, copy the page,
        and import it. Server sync, when turned on below: a Waymark sync server checks the cases you
        choose with the official USCIS Case Status API.
      </dd>
    </div>
    <div>
      <dt class="t-label">Does not work</dt>
      <dd>
        Reading your signed-in USCIS account automatically. USCIS does not let other sites read it,
        and Waymark never asks for or stores your USCIS password.
      </dd>
    </div>
    <div>
      <dt class="t-label">Limits</dt>
      <dd>
        The official API gives status text and dates, not the detailed events or notices in the case
        JSON. Until USCIS approves production access, the server can reach only the sandbox, which
        has test data.
      </dd>
    </div>
  </dl>
</section>

<ServerSyncSettings />

<PublicDataSettings />

<section class="group" aria-labelledby="data-title">
  <h2 id="data-title" class="t-title">Data</h2>
  <p class="muted t-small">
    Everything is stored in this browser on this device. Export a file to keep a backup or move to
    another device.
  </p>
  {#if importError}<p class="alert" role="alert">{importError}</p>{/if}
  <div class="actions">
    <Button variant="tonal" icon="download" onclick={exportData}>Export data</Button>
    <Button variant="outlined" icon="upload" onclick={() => fileInput?.click()}>Import data</Button>
    <input
      bind:this={fileInput}
      class="visually-hidden"
      type="file"
      accept=".json,application/json"
      tabindex="-1"
      aria-hidden="true"
      onchange={onImportFile}
    />
  </div>
  <p class="muted t-small">
    Import accepts Waymark exports and v0.2 data. It replaces all current data; you can undo right
    after.
  </p>
  <div class="actions">
    <Button
      variant="outlined"
      icon="delete"
      class="danger"
      onclick={() => {
        deleteEverything();
        if (syncEnabled()) void disableServerSync();
      }}>Delete everything</Button
    >
  </div>
  <p class="muted t-small">
    Deletes all cases, deadlines, series, and tool data. Display settings are kept. You can undo
    right after, except that server sync is turned off and its data deleted.
  </p>
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
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .actions :global(.danger) {
    color: var(--error);
    box-shadow: inset 0 0 0 1px var(--error);
  }
  .alert {
    padding: 12px 16px;
    border-radius: var(--shape-m);
    background: var(--error-container);
    color: var(--on-error-container);
  }
  .sync {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin: 0;
  }
  .sync dd {
    margin: 2px 0 0;
  }
</style>
