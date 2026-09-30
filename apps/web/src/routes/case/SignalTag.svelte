<script lang="ts">
  import { SIGNAL_LABELS, type EventSignal } from '@waymark/core';
  import Icon from '../../lib/ui/Icon.svelte';

  let { signal }: { signal: EventSignal } = $props();
</script>

<!-- The icon and the word carry the meaning. The outline separates it from status pills. -->
<span class="signal signal-{signal}">
  <Icon name={signal === 'notice' ? 'mail' : 'pending'} size={14} />
  {SIGNAL_LABELS[signal]}
</span>

<style>
  .signal {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 22px;
    padding: 0 8px 0 6px;
    border: 1px solid var(--outline);
    border-radius: var(--shape-full);
    color: var(--on-surface-variant);
    font-size: 0.75rem;
    font-weight: 560;
    line-height: 1;
    white-space: nowrap;
  }
  .signal-notice {
    border-color: var(--primary);
  }
  .signal-notice :global(svg) {
    color: var(--primary);
  }
</style>
