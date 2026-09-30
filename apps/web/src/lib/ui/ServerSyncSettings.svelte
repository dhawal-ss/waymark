<script lang="ts">
  import { copyText } from '../actions';
  import { relativeTime } from '../format';
  import {
    disableServerSync,
    enableServerSync,
    pull,
    serverAddress,
    serverSync,
    syncEnabled,
    useSyncKey,
  } from '../serverSync.svelte';
  import { store } from '../stores/data.svelte';
  import Button from './Button.svelte';
  import Icon from './Icon.svelte';
  import TextField from './TextField.svelte';

  let key = $state('');
  const enabled = $derived(syncEnabled());
  const tracked = $derived(store.data.cases.filter((c) => c.serverTracking).length);
</script>

<section class="group" aria-labelledby="server-title">
  <h2 id="server-title" class="t-title">Server sync</h2>
  {#if !enabled}
    <p>Off. Cases update only when you import the case JSON yourself.</p>
    <p class="t-small muted">
      Turning this on sends the receipt numbers of the cases you choose to the sync server below.
      The server checks them with the official USCIS Case Status API about twice a day and stores
      them encrypted. Names, notes, and everything else stay on this device. No USCIS sign-in is
      used.
    </p>
    <TextField
      label="Sync server address"
      bind:value={serverAddress.draft}
      type="url"
      inputmode="url"
      autocomplete="off"
      spellcheck={false}
      error={serverAddress.error || undefined}
      supporting="The address of a Waymark sync server, starting with https://. Public data below uses it too."
    />
    <div class="actions">
      <Button
        icon="sync"
        disabled={serverSync.busy || !serverAddress.draft.trim()}
        onclick={() => enableServerSync(serverAddress.draft)}>Turn on server sync</Button
      >
    </div>
    <details>
      <summary class="t-label">Use a sync key from another device</summary>
      <div class="key">
        <TextField label="Sync key" bind:value={key} mono autocomplete="off" spellcheck={false} />
        <div>
          <Button
            variant="tonal"
            disabled={serverSync.busy || !key.trim() || !serverAddress.draft.trim()}
            onclick={() => useSyncKey(serverAddress.draft, key)}>Use sync key</Button
          >
        </div>
      </div>
    </details>
  {:else}
    <p>
      On. Server <span class="t-mono">{serverSync.url.replace(/^https?:\/\//, '')}</span>.
      {tracked === 1 ? '1 case is' : `${tracked} cases are`} tracked.
      {serverSync.lastPullAt
        ? `Last checked for updates ${relativeTime(serverSync.lastPullAt)}.`
        : ''}
    </p>
    {#if serverSync.environment === 'sandbox'}
      <p class="note t-small">
        <Icon name="info" size={18} />
        <span>
          Sandbox: the USCIS sandbox has test data only. Real receipt numbers return "no case" until
          USCIS approves production access for this server.
        </span>
      </p>
    {/if}
    <p class="t-small muted">
      Turn tracking on or off for each case on its page, under USCIS data.
    </p>
    <div class="actions">
      <Button
        variant="tonal"
        icon="sync"
        disabled={serverSync.busy}
        onclick={() => pull({ quiet: false })}>Check for updates</Button
      >
      <Button
        variant="outlined"
        icon="content_copy"
        onclick={() => copyText(serverSync.token, 'Copied the sync key. Keep it private.')}
        >Copy sync key</Button
      >
      <Button
        variant="outlined"
        icon="delete"
        class="danger"
        disabled={serverSync.busy}
        onclick={() => disableServerSync()}
      >
        Turn off and delete server data
      </Button>
    </div>
    <p class="t-small muted">
      The sync key links another device to the same server data. Anyone with it can see which
      receipt numbers you track.
    </p>
  {/if}
  {#if serverSync.error}<p class="alert" role="alert">{serverSync.error}</p>{/if}
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
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .actions :global(.danger) {
    color: var(--error);
    box-shadow: inset 0 0 0 1px var(--error);
  }
  details summary {
    display: flex;
    align-items: center;
    min-height: 48px;
    cursor: pointer;
  }
  .key {
    display: grid;
    gap: 12px;
  }
  .note {
    display: flex;
    gap: 8px;
    padding: 12px;
    border-radius: var(--shape-m);
    background: var(--tertiary-container);
    color: var(--on-tertiary-container);
  }
  .alert {
    padding: 12px 16px;
    border-radius: var(--shape-m);
    background: var(--error-container);
    color: var(--on-error-container);
  }
</style>
