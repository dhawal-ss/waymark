<script lang="ts">
  import type { Case } from '@waymark/core';
  import { relativeTime } from '../format';
  import { refreshCase, serverSync } from '../serverSync.svelte';
  import Button from './Button.svelte';

  let { c }: { c: Case } = $props();

  const id = $derived(c.serverTracking?.subscriptionId);
  const sub = $derived(id ? serverSync.subscriptions[id] : undefined);
  const description = $derived(
    !id
      ? 'Automatic checks start with the next update.'
      : sub?.lastError
        ? `Automatic check: ${sub.lastError}`
        : sub?.lastCheckedAt
          ? `Checked automatically ${relativeTime(sub.lastCheckedAt)}. Checks run twice a day.`
          : 'Waiting for the first automatic check.',
  );
</script>

<div class="tracking">
  <p class="t-small muted">{description}</p>
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
  .tracking p {
    margin: 0;
  }
  .error {
    color: var(--error);
  }
</style>
