<script lang="ts">
  import { STATUSES, type StatusKey } from '@waymark/core';
  import Pill from './Pill.svelte';

  let { status, closed = false }: { status: StatusKey; closed?: boolean } = $props();
  const info = $derived(STATUSES[status]);
</script>

<!-- USCIS can close a case without a decision status; say so instead of the last status. -->
{#if closed && !info.closed}
  <Pill label="Case closed" icon="info" />
{:else}
  <Pill label={info.label} tone={info.tone} />
{/if}
