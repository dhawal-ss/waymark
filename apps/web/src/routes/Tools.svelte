<script lang="ts">
  import PageHeader from '../lib/ui/PageHeader.svelte';
  import Checklists from './tools/Checklists.svelte';
  import FeeTally from './tools/FeeTally.svelte';
  import PriorityChecker from './tools/PriorityChecker.svelte';
  import TimelinePlanner from './tools/TimelinePlanner.svelte';
</script>

<PageHeader title="Tools" />
<div class="stack">
  <PriorityChecker />
  <TimelinePlanner />
  <FeeTally />
  <Checklists />
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
