<script lang="ts">
  import Button from '../lib/ui/Button.svelte';
  import EmptyState from '../lib/ui/EmptyState.svelte';
  import type { IconName } from '../lib/ui/icons';
  import PageHeader from '../lib/ui/PageHeader.svelte';

  interface Props {
    title: string;
    icon: IconName;
    missing: string;
  }

  let { title, icon, missing }: Props = $props();
</script>

<PageHeader {title} />
<EmptyState {icon} title="{title} is not built yet" body={missing}>
  {#snippet actions()}
    <Button variant="tonal" icon="palette" href="#/settings/design">Open design system</Button>
  {/snippet}
</EmptyState>
