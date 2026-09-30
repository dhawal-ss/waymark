<script lang="ts">
  import PageHeader from '../lib/ui/PageHeader.svelte';
  import ProjectionPanel from './insights/ProjectionPanel.svelte';
  import SeriesPanel from './insights/SeriesPanel.svelte';
  import WaitBars from './insights/WaitBars.svelte';
</script>

<PageHeader title="Insights" />
<div class="stack">
  <WaitBars />
  <SeriesPanel />
  <ProjectionPanel />
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
</style>
