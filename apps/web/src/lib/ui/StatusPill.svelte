<script lang="ts">
  import { STATUSES, type StatusKey } from '@waymark/core';
  import Pill from './Pill.svelte';

  let { status }: { status: StatusKey } = $props();
  const info = $derived(STATUSES[status]);
</script>

<Pill label={info.label} tone={info.tone} />
