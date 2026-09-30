<script lang="ts">
  import { relativeTime } from '../format';
  import { fetchStatus, type DatasetRun } from '../publicData';
  import { serverSync, setServerUrl } from '../serverSync.svelte';
  import { store } from '../stores/data.svelte';
  import { updatePrefs } from '../stores/prefs.svelte';
  import Switch from './Switch.svelte';
  import TextField from './TextField.svelte';

  let url = $state(serverSync.url);
  let runs = $state<DatasetRun[]>([]);
  let statusError = $state('');
  let addressError = $state('');
  const on = $derived(store.data.prefs.publicData);

  const NAMES: Record<string, string> = {
    'processing-times': 'Processing times',
    'visa-bulletin': 'Visa Bulletin',
  };

  $effect(() => {
    if (!on || !serverSync.url) return;
    fetchStatus()
      .then((s) => {
        runs = s.datasets;
        statusError = '';
      })
      .catch(
        (e: unknown) => (statusError = e instanceof Error ? e.message : 'Status request failed.'),
      );
  });

  async function toggle(next: boolean) {
    if (next && !serverSync.url && !(await setServerUrl(url))) {
      addressError = 'Enter the server address starting with https://.';
      return;
    }
    addressError = '';
    updatePrefs({ publicData: next });
  }
</script>

<section class="group" aria-labelledby="public-title">
  <h2 id="public-title" class="t-title">Public data</h2>
  {#if !serverSync.url}
    <TextField
      label="Sync server address"
      bind:value={url}
      type="url"
      inputmode="url"
      autocomplete="off"
      spellcheck={false}
      supporting="Public data comes from a Waymark sync server. No account is needed."
    />
  {/if}
  {#key `${on}-${serverSync.url}-${addressError}`}
    <Switch
      label="Load public data from the sync server"
      description="Processing times from egov.uscis.gov, Visa Bulletin cutoffs from travel.state.gov, and quarterly USCIS form data. Requests name only the form or category you view, never receipt numbers."
      checked={on}
      onchange={toggle}
    />
  {/key}
  {#if on}
    {#if statusError}
      <p class="alert" role="alert">{statusError}</p>
    {:else if runs.length > 0}
      <ul class="runs t-small" role="list">
        {#each runs as r (r.dataset)}
          <li>
            <strong>{NAMES[r.dataset] ?? r.dataset}:</strong>
            {r.last_success_at
              ? `updated ${relativeTime(r.last_success_at)}`
              : 'not updated yet'}{r.last_error ? `. Last run failed: ${r.last_error}` : '.'}
          </li>
        {/each}
      </ul>
    {:else}
      <p class="t-small muted">
        The server has not loaded public data yet. It checks official sources once a day.
      </p>
    {/if}
  {/if}
  {#if addressError}<p class="alert" role="alert">{addressError}</p>{/if}
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
  .runs {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin: 0;
    padding-left: 20px;
  }
  .alert {
    padding: 12px 16px;
    border-radius: var(--shape-m);
    background: var(--error-container);
    color: var(--on-error-container);
  }
</style>
