<script lang="ts">
  import { isCurrent, isLocalDate } from '@waymark/core';
  import { formatDate } from '../../lib/format';
  import { store } from '../../lib/stores/data.svelte';
  import Checkbox from '../../lib/ui/Checkbox.svelte';
  import TextField from '../../lib/ui/TextField.svelte';

  let pd = $state(store.data.visa.priorityDate ?? '');
  let cutoff = $state('');
  let current = $state(false);

  const result = $derived.by(() => {
    if (!isLocalDate(pd)) return { kind: 'missing' as const, text: 'Enter your priority date.' };
    if (current)
      return {
        kind: 'yes' as const,
        text: 'Current. The category is C, so every priority date is current.',
      };
    if (!isLocalDate(cutoff))
      return {
        kind: 'missing' as const,
        text: 'Enter the cutoff date from the Visa Bulletin, or check C.',
      };
    return isCurrent(pd, cutoff)
      ? {
          kind: 'yes' as const,
          text: `Current. ${formatDate(pd)} is earlier than the cutoff ${formatDate(cutoff)}.`,
        }
      : {
          kind: 'no' as const,
          text: `Not current. The cutoff ${formatDate(cutoff)} has not passed ${formatDate(pd)}.`,
        };
  });
</script>

<section class="panel" aria-labelledby="pd-title">
  <h2 id="pd-title" class="t-headline">Priority date checker</h2>
  <div class="fields">
    <TextField label="Your priority date" type="date" bind:value={pd} />
    {#if !current}<TextField label="Cutoff date" type="date" bind:value={cutoff} />{/if}
  </div>
  <Checkbox label="C (current)" bind:checked={current} />
  <p class="result {result.kind}" role="status">{result.text}</p>
</section>

<style>
  .fields {
    display: grid;
    gap: 16px;
  }
  @media (min-width: 600px) {
    .fields {
      grid-template-columns: 1fr 1fr;
    }
  }
  .result {
    padding: 16px;
    border-radius: var(--shape-l);
    background: var(--surface-container-highest);
    font-weight: 560;
  }
  .result.yes {
    background: var(--success-container);
    color: var(--on-success-container);
  }
  .result.no {
    background: var(--tertiary-container);
    color: var(--on-tertiary-container);
  }
</style>
