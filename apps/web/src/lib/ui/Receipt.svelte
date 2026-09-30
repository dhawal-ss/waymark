<script lang="ts">
  import { maskReceipt } from '@waymark/core';
  import { store } from '../stores/data.svelte';

  let { receipt }: { receipt: string } = $props();
  const masked = $derived(store.data.prefs.maskReceipts);
</script>

{#if masked}
  <span class="t-mono receipt" aria-label="Receipt ending {receipt.slice(-4)}"
    >{maskReceipt(receipt)}</span
  >
{:else}
  <span class="t-mono receipt">{receipt}</span>
{/if}

<style>
  .receipt {
    font-size: 0.875em;
    letter-spacing: 0.02em;
    overflow-wrap: anywhere;
  }
</style>
