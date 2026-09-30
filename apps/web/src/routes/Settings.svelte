<script lang="ts">
  import { SEED_PRESETS, type ThemeMode } from '@waymark/theme';
  import { deleteEverything, hasData, importDataFile } from '../lib/actions';
  import { backup, canShareFiles, exportBackup } from '../lib/backup.svelte';
  import { relativeTime } from '../lib/format';
  import { store } from '../lib/stores/data.svelte';
  import Button from '../lib/ui/Button.svelte';
  import Select from '../lib/ui/Select.svelte';
  import { updatePrefs } from '../lib/stores/prefs.svelte';
  import ButtonGroup from '../lib/ui/ButtonGroup.svelte';
  import Icon from '../lib/ui/Icon.svelte';
  import PageHeader from '../lib/ui/PageHeader.svelte';
  import SeedPicker from '../lib/ui/SeedPicker.svelte';
  import ServerSyncSettings from '../lib/ui/ServerSyncSettings.svelte';
  import PublicDataSettings from '../lib/ui/PublicDataSettings.svelte';
  import InstallSettings from '../lib/ui/InstallSettings.svelte';
  import { disableServerSync, syncEnabled } from '../lib/serverSync.svelte';
  import Switch from '../lib/ui/Switch.svelte';

  const prefs = $derived(store.data.prefs);
  const shareFiles = canShareFiles();

  let confirmingDelete = $state(false);
  async function confirmDelete() {
    confirmingDelete = false;
    const serverDeleted = syncEnabled()
      ? await disableServerSync({ quiet: true, turnOff: false })
      : true;
    deleteEverything(
      serverDeleted
        ? undefined
        : 'The sync server did not delete your data. Turn off automatic checks when you are online.',
    );
  }

  const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const zones = (() => {
    try {
      return Intl.supportedValuesOf('timeZone');
    } catch {
      return [];
    }
  })();
  // US zones first: most cases are handled on US time.
  const US_ZONES: [string, string][] = [
    ['America/New_York', 'US Eastern'],
    ['America/Chicago', 'US Central'],
    ['America/Denver', 'US Mountain'],
    ['America/Phoenix', 'US Arizona'],
    ['America/Los_Angeles', 'US Pacific'],
    ['America/Anchorage', 'US Alaska'],
    ['Pacific/Honolulu', 'US Hawaii'],
    ['America/Puerto_Rico', 'Puerto Rico'],
  ];
  const usSet = new Set(US_ZONES.map(([z]) => z));
  const zoneOptions = [
    { value: '', label: `Device time zone (${deviceZone.replace(/_/g, ' ')})` },
    ...US_ZONES.map(([z, name]) => ({ value: z, label: `${name} (${z.replace(/_/g, ' ')})` })),
    ...zones.filter((z) => !usSet.has(z)).map((z) => ({ value: z, label: z.replace(/_/g, ' ') })),
  ];

  let fileInput: HTMLInputElement | undefined = $state();
  let importError = $state('');

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
  <h2 id="sync-title" class="t-title">How cases update</h2>
  <dl class="sync t-small">
    <div>
      <dt class="t-label">With automatic checks</dt>
      <dd>
        When they are on, a Waymark server checks each receipt number with the official USCIS Case
        Status API twice a day. It gives the status and dates.
      </dd>
    </div>
    <div>
      <dt class="t-label">From the case page</dt>
      <dd>
        For the full event history and notices, open the case page from a case, copy it, and come
        back. Waymark imports it. You can also share the page to Waymark.
      </dd>
    </div>
    <div>
      <dt class="t-label">What Waymark never does</dt>
      <dd>
        Waymark never signs in to your USCIS account or asks for your USCIS password. USCIS does not
        let other sites read it.
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
    another device. Share backup can save it to Google Drive or Files.
  </p>
  <p class="t-small">
    {#if backup.lastAt}
      Last backup {relativeTime(backup.lastAt)}.
    {:else}
      No backup yet.
    {/if}
  </p>
  {#if importError}<p class="alert" role="alert">{importError}</p>{/if}
  <div class="actions">
    <Button variant="tonal" icon="download" onclick={() => exportBackup()}>Export data</Button>
    {#if shareFiles}
      <Button variant="outlined" icon="share" onclick={() => exportBackup({ share: true })}
        >Share backup</Button
      >
    {/if}
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
  {#if confirmingDelete}
    <div class="confirm" role="group" aria-labelledby="confirm-delete">
      <p id="confirm-delete">
        Delete all cases, deadlines, series, and tool data on this device?
        {#if syncEnabled()}
          This also deletes your receipt numbers from the sync server, which cannot be undone.
        {/if}
      </p>
      <div class="actions">
        <Button variant="filled" icon="delete" class="danger-filled" onclick={confirmDelete}
          >Delete everything</Button
        >
        <Button variant="text" onclick={() => (confirmingDelete = false)}>Cancel</Button>
      </div>
    </div>
  {:else}
    <div class="actions">
      <Button
        variant="outlined"
        icon="delete"
        class="danger"
        disabled={!hasData() && !syncEnabled()}
        onclick={() => (confirmingDelete = true)}>Delete everything</Button
      >
    </div>
  {/if}
  <p class="muted t-small">
    {#if hasData() || syncEnabled()}
      Deletes all cases, deadlines, series, and tool data, including a Waymark v0.2 copy in this
      browser. Display settings and the sync server address are kept. You can undo right after.
    {:else}
      There is nothing to delete.
    {/if}
  </p>
</section>

<InstallSettings />

<!-- The design system page is for development; the route still works in production builds. -->
{#if import.meta.env.DEV}
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
{/if}

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
  @media (hover: hover) {
    .row-link:hover {
      background: color-mix(in srgb, var(--on-surface) 8%, transparent);
    }
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
  .confirm {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px;
    border-radius: var(--shape-l);
    background: var(--error-container);
    color: var(--on-error-container);
  }
  .actions :global(.danger-filled) {
    background: var(--error);
    color: var(--on-error);
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
