<script lang="ts">
  import type { Case } from '@waymark/core';
  import { relativeTime } from '../format';
  import { refreshCase, serverSync, trackCase, untrackCase } from '../serverSync.svelte';
  import Button from './Button.svelte';
  import Switch from './Switch.svelte';

  let { c }: { c: Case } = $props();

  const id = $derived(c.serverTracking?.subscriptionId);
  const sub = $derived(id ? serverSync.subscriptions[id] : undefined);
  const description = $derived(
    !id
      ? 'Sends only the receipt number to the sync server, which checks it about twice a day.'
      : sub?.lastError
        ? `USCIS error: ${sub.lastError}`
        : sub?.lastCheckedAt
          ? `Checked ${relativeTime(sub.lastCheckedAt)}.`
          : 'Waiting for the first check.',
  );
</script>

<div class="tracking">
  {#key `${Boolean(id)}-${serverSync.busy}`}
    <Switch
      label="Track with the official USCIS API"
      {description}
      checked={Boolean(id)}
      disabled={serverSync.busy}
      onchange={(on) => (on ? trackCase(c.id) : untrackCase(c.id))}
    />
  {/key}
  {#if id}
    <div>
      <Button
        variant="text"
        icon="sync"
        disabled={serverSync.busy}
        onclick={() => refreshCase(c.id)}>Check now</Button
      >
    </div>
  {/if}
  {#if serverSync.error}<p class="t-small error" role="alert">{serverSync.error}</p>{/if}
</div>

<style>
  .tracking {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding-top: 8px;
    border-top: 1px solid var(--outline-variant);
  }
  .error {
    color: var(--error);
  }
</style>
