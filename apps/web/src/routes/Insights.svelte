<script lang="ts">
  import { publicDataOn, refreshLinked } from '../lib/publicData';
  import PageHeader from '../lib/ui/PageHeader.svelte';
  import FormStatsPanel from './insights/FormStatsPanel.svelte';
  import ProjectionPanel from './insights/ProjectionPanel.svelte';
  import SeriesPanel from './insights/SeriesPanel.svelte';
  import WaitBars from './insights/WaitBars.svelte';

  let refreshError = $state('');

  // Linked series and cutoffs update from the server each time Insights opens.
  $effect(() => {
    if (!publicDataOn()) return;
    void refreshLinked().then((r) => (refreshError = r.error));
  });
</script>

<PageHeader title="Insights" />
{#if refreshError}
  <p class="notice t-small" role="status">
    Linked data was not updated: {refreshError} Showing the last saved values.
  </p>
{/if}
<div class="stack">
  <WaitBars />
  <SeriesPanel />
  <ProjectionPanel />
  <FormStatsPanel />
</div>

<style>
  .stack {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .stack :global(.panel) {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 20px;
    border-radius: var(--shape-xl);
    background: var(--surface-container-low);
  }
  .notice {
    margin-bottom: 12px;
    padding: 12px 16px;
    border-radius: var(--shape-m);
    background: var(--surface-container-highest);
  }
</style>
